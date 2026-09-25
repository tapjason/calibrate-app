// Account deletion, the server half (L5). Calls the delete-account Edge
// Function, which revokes Apple, deletes the RevenueCat customer, and deletes
// the auth user — whose rows in every public table cascade with it.
//
// Contract — kept in lockstep with supabase/functions/delete-account/index.ts.
// Unlike the Coach, a failure here is not silent: the user asked for
// something, and has to be told it didn't happen so they can try again.

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseClient, isSupabaseConfigured } from './client';

export type DeleteAccountOutcome = { ok: true } | { ok: false; error: string };

export interface DeleteAccountDeps {
  /** Override the client (tests). Null means "no client available". */
  client?: SupabaseClient | null;
  /** Default 20s: three upstream calls, each with its own 8s ceiling. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** What the user sees for any failure. The detail goes to the log. */
export const DELETE_FAILED_MESSAGE =
  "Couldn't delete your account right now. Nothing has been deleted — try again in a moment.";

export async function deleteAccountOnServer(
  appleAuthorizationCode: string | null,
  deps: DeleteAccountDeps = {},
): Promise<DeleteAccountOutcome> {
  const client =
    deps.client !== undefined
      ? deps.client
      : isSupabaseConfigured()
        ? getSupabaseClient()
        : null;
  if (!client) return { ok: false, error: DELETE_FAILED_MESSAGE };

  try {
    const result = await withTimeout(
      client.functions.invoke('delete-account', {
        body: appleAuthorizationCode
          ? { apple_authorization_code: appleAuthorizationCode }
          : {},
      }),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (result.error) {
      // eslint-disable-next-line no-console
      console.warn('[account] delete-account error:', result.error.message);
      return { ok: false, error: DELETE_FAILED_MESSAGE };
    }
    // Only an explicit ok counts. Anything else is not proof the account is
    // gone, and the caller wipes the device only on proof.
    if ((result.data as { ok?: unknown } | null)?.ok !== true) {
      return { ok: false, error: DELETE_FAILED_MESSAGE };
    }
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[account] delete-account failed:', e instanceof Error ? e.message : e);
    return { ok: false, error: DELETE_FAILED_MESSAGE };
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
