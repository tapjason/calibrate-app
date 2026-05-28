// AI refine client. Calls the `refine` Edge Function to rewrite a typed
// prediction into a concise yes/no-resolvable form.
//
// Layer rule: L5 (services). Imports from @/supabase only. Components import
// THIS module — never the supabase client directly.
//
// Failure policy (per CLAUDE.md): AI is never in the critical path. Every
// failure mode below resolves to `null` and logs a console.warn. The caller
// renders the suggestion only when refine returns a non-null string; on null
// the user's original text is untouched.
//
// Failure modes that return null:
//   • Supabase not configured (guest-mode dev build with no env vars).
//   • Not signed in — the Edge Function requires a real user JWT and returns
//     401 for the anon key (guest mode). Refine is a signed-in-only nicety;
//     guests just keep their typed text.
//   • Network / fetch error.
//   • Edge Function returned non-2xx (incl. 401 unauthenticated, 429 rate-limited).
//   • Response body is malformed or `refined` is empty.
//   • Request timed out (default 8s).
//
// Deps are injectable so unit tests don't have to mock the Supabase client.

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseClient, isSupabaseConfigured } from '@/supabase/client';

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_INPUT_LEN = 500;

export interface RefineDeps {
  /** Override the SupabaseClient (tests). Null means "no client available". */
  client?: SupabaseClient | null;
  /** Timeout in ms; default 8000. */
  timeoutMs?: number;
}

/**
 * Send a prediction to the refine Edge Function. Returns the rewritten text
 * on success, or null on any failure (silent). The caller MUST treat null as
 * "no suggestion" and leave the user's input alone.
 */
export async function refinePrediction(
  prediction: string,
  deps: RefineDeps = {},
): Promise<string | null> {
  const trimmed = prediction.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_INPUT_LEN) {
    return null;
  }

  const client = resolveClient(deps);
  if (!client) {
    return null;
  }

  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const result = await withTimeout(
      client.functions.invoke('refine', { body: { prediction: trimmed } }),
      timeoutMs,
    );

    // Supabase functions.invoke shape: { data, error }
    if (result.error) {
      console.warn('[refine] edge function error:', result.error.message);
      return null;
    }

    const refined = extractRefined(result.data);
    if (!refined) {
      console.warn('[refine] missing or empty `refined` in response');
      return null;
    }
    return refined;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[refine] request failed:', message);
    return null;
  }
}

function resolveClient(deps: RefineDeps): SupabaseClient | null {
  if (deps.client !== undefined) return deps.client;
  if (!isSupabaseConfigured()) return null;
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

function extractRefined(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const refined = (data as { refined?: unknown }).refined;
  if (typeof refined !== 'string') return null;
  const trimmed = refined.trim();
  return trimmed.length > 0 ? trimmed : null;
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
