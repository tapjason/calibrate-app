// Coach client. Calls the `coach` Edge Function and returns validated
// insights. Authoritative spec: COACH_AGENT.md.
//
// Layer rule: L5 (services). Imports from @/supabase, @/types, and sibling
// L5 modules. Components never call this directly — the coachStore (L4) does.
//
// Failure policy (§5.8, and CLAUDE.md's "AI is never in the critical path"):
// every failure returns an empty, safe result and logs a warn. The Coach
// surface then renders nothing. Nothing here can block Log → Resolve → Stats.
//
// Gating, in the order it is applied:
//   1. Plus entitlement — the caller passes `isPlus`; false means no request
//      is made at all, not a request that gets rejected.
//   2. Crisis pre-filter (§5.5) — runs BEFORE the network call, so distress
//      content never becomes coaching input. Returns `safe: false` and the
//      caller shows the support surface instead.
//   3. Minimum-N — a user with nothing resolved gets no request either.
//
// The server validates too. This module validates again on the way back
// because the client is the last thing between a bad payload and the screen.

import type { SupabaseClient } from '@supabase/supabase-js';

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

  // 3. Nothing resolved means nothing to interpret. Skipping the call here
  //    saves a round trip that could only ever return "keep logging".
  if (context.overall.total_resolved === 0) return empty();

  const client = resolveClient(deps);
  if (!client) return empty();

  try {
    const result = await withTimeout(
      client.functions.invoke('coach', { body: { context } }),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    if (result.error) {
      console.warn('[coach] edge function error:', result.error.message);
      return empty();
    }

    const validated = validateCoachOutput(result.data, context);
    return { ...validated, crisisTopic: null, ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[coach] request failed:', message);
    return empty();
  }
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
