// Coach client. Calls the `coach` Edge Function and returns validated
// insights. Authoritative spec: COACH_AGENT.md.
//
// Layer rule: L5 (services). Imports from @/supabase, @/types, the age store
// (a leaf, for the under-13 rule) and sibling L5 modules. Components never
// call this directly — the coachStore (L4) does.
//
// Failure policy (§5.8, and CLAUDE.md's "AI is never in the critical path"):
// every failure returns an empty, safe result and logs a warn. The Coach
// surface then renders nothing. Nothing here can block Log → Resolve → Stats.
// Two failures are named (step 189), so the panel can say what happened
// instead of "unavailable": a 403 means the server couldn't confirm Plus
// (`failure: 'not_entitled'`), and no scored answer means no request was
// made at all (`failure: 'nothing_scored'`).
//
// Gating, in the order it is applied:
//   1. Plus entitlement — the caller passes `isPlus`; false means no request
//      is made at all, not a request that gets rejected.
//   2. Crisis pre-filter (§5.5) — runs BEFORE the network call, so distress
//      content never becomes coaching input. Returns `safe: false` and the
//      caller shows the support surface instead.
//   3. The under-13 rule (roadmap D70) — on a local-only phone the Coach is
//      off, and on a launch that asks Apple it waits for the answer
//      (`uploadsMayStart`, as sign-in, billing and sync do; review round 2,
//      item 4): the empty result, before any client is built. After the
//      crisis pre-filter, which sends nothing, so the support surface still
//      shows if a Coach panel is ever asked on such a phone.
//   4. Minimum-N — a user with no scored answer gets no request either
//      (`failure: 'nothing_scored'`).
//
// The server validates too. This module validates again on the way back
// because the client is the last thing between a bad payload and the screen.

import type { SupabaseClient } from '@supabase/supabase-js';

import { uploadsMayStart } from '@/store/ageStore';
import { getSupabaseClient, isSupabaseConfigured } from '@/supabase/client';
import type { CoachContext, CoachOutput } from '@/types';

import { validateCoachOutput } from './coachValidate';
import { scanForCrisis, type CrisisTopic } from './crisisFilter';

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Nothing to show. The default for every path that produced no answer.
 *
 * A factory, not a constant: the result's `insights` array lands in Zustand
 * state, and a single shared instance handed to every caller is one in-place
 * mutation away from leaking across unrelated results.
 */
const empty = (): CoachResult => ({
  insights: [],
  safe: true,
  crisisTopic: null,
  ok: false,
});

/**
 * Why a request produced no answer, when the reason is worth its own words:
 *   - `not_entitled`: the server's Plus check said no (HTTP 403).
 *   - `nothing_scored`: no scored answer yet (`total_resolved` is 0, and a
 *     same-day answer isn't scored, D41), so no request was made.
 * Every other failure leaves `failure` unset.
 */
export type CoachFailure = 'not_entitled' | 'nothing_scored';

export interface CoachResult extends CoachOutput {
  /**
   * Set when the crisis pre-filter tripped. The caller renders the support
   * surface for this topic instead of any coaching (§5.5).
   */
  crisisTopic: CrisisTopic | null;
  /**
   * Whether this is an answer or an absence.
   *
   * `insights: []` is ambiguous on its own — it means both "the Coach had
   * nothing to say" and "the request never happened". A caller keeping a
   * last-good cache (§5.8) has to tell those apart, or it will throw away
   * good cards on a legitimate empty response and keep stale ones forever
   * on a persistent outage.
   */
  ok: boolean;
  /** Set only on a failure with its own words (see CoachFailure). */
  failure?: CoachFailure;
  /**
   * Set (true) only on an answer that had insights and lost every one to
   * validation: the server's (its `dropped` count, from 2026-11-19) or this
   * app's. Absent when the Coach returned none, which is "nothing to say".
   * The panel words the two apart.
   */
  droppedAll?: true;
}

export interface CoachDeps {
  /** Override the SupabaseClient (tests). Null means "no client available". */
  client?: SupabaseClient | null;
  /** Timeout in ms; default 12000. */
  timeoutMs?: number;
  /**
   * Freetext to screen before making the call. Empty by default, because §4
   * excludes freetext from the payload — this exists so a caller that has
   * reflections on hand can have them screened even though they are never sent.
   */
  freetext?: ReadonlyArray<string | null | undefined>;
}

/**
 * Ask the Coach to interpret a context. Never throws.
 *
 * Returns at most three grounded insights, or an empty result — which is a
 * perfectly ordinary outcome, not an error.
 */
export async function fetchCoachInsights(
  context: CoachContext,
  isPlus: boolean,
  deps: CoachDeps = {},
): Promise<CoachResult> {
  // 1. Plus gate. No request is attempted for a free user, so there is no
  //    network call to intercept and no cost to incur.
  if (!isPlus) return empty();

  // 2. Crisis pre-filter, before anything leaves the device.
  const scan = scanForCrisis(deps.freetext ?? []);
  if (!scan.safe) {
    return { insights: [], safe: false, crisisTopic: scan.topic, ok: true };
  }

  // 3. The under-13 rule (D70): nothing leaves the phone, so no request, and
  //    no client is built; nor while Apple's answer is still pending on a
  //    launch that asks (a fail-silent no-op, like any other absence).
  if (!uploadsMayStart()) return empty();

  // 4. Nothing answered means nothing to interpret. Skipping the call here
  //    saves a round trip that could only ever return "keep logging". Named,
  //    so the panel says why instead of "unavailable" (step 189): on a fresh
  //    install whose only answer was same-day, that read as an outage.
  if (context.overall.total_resolved === 0) return { ...empty(), failure: 'nothing_scored' };

  const client = resolveClient(deps);
  if (!client) return empty();

  try {
    // Checked once more at the call itself (D70).
    if (!uploadsMayStart()) return empty();
    const result = await withTimeout(
      client.functions.invoke('coach', { body: { context } }),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    if (result.error) {
      const status = httpStatusOf(result);
      console.warn('[coach] edge function error:', result.error.message, status ?? '');
      // 403 is the server's Plus check, and only that (the function answers
      // 401 for no session). Still an absence: nothing is shown but words.
      return status === 403 ? { ...empty(), failure: 'not_entitled' } : empty();
    }

    const validated = validateCoachOutput(result.data, context);
    const out: CoachResult = { ...validated, crisisTopic: null, ok: true };
    if (allDropped(result.data, validated)) out.droppedAll = true;
    return out;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[coach] request failed:', message);
    return empty();
  }
}

/**
 * Whether an answer had insights and every one was dropped: the function
 * dropped some (`dropped`, a positive whole number, sent from 2026-11-19; a
 * function deployed before it sends none) and passed none, or it passed some
 * and this app dropped them all. Only a label for the panel's words: what is
 * shown is still only what validation kept.
 */
function allDropped(data: unknown, validated: CoachOutput): boolean {
  if (!validated.safe || validated.insights.length > 0) return false;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const body = data as { insights?: unknown; dropped?: unknown };
  const passed = Array.isArray(body.insights) ? body.insights.length : 0;
  const droppedThere =
    typeof body.dropped === 'number' && Number.isInteger(body.dropped) && body.dropped > 0;
  return passed > 0 || droppedThere;
}

/**
 * The HTTP status of a failed invoke, when there was a response at all.
 * supabase-js returns it as `response` beside the error, and as the error's
 * `context` (a FunctionsHttpError's Response); older versions only the latter.
 */
function httpStatusOf(result: unknown): number | null {
  const r = result as {
    response?: { status?: unknown };
    error?: { context?: { status?: unknown } };
  };
  const status = r.response?.status ?? r.error?.context?.status;
  return typeof status === 'number' ? status : null;
}

function resolveClient(deps: CoachDeps): SupabaseClient | null {
  if (deps.client !== undefined) return deps.client;
  if (!isSupabaseConfigured()) return null;
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
