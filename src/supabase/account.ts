// Account deletion, the server half (L5). Calls the delete-account Edge
// Function, which revokes Apple, deletes the RevenueCat customer, and deletes
// the auth user — whose rows in every public table cascade with it.
//
// Contract — kept in lockstep with supabase/functions/delete-account/index.ts.
// Unlike the Coach, a failure here is not silent: the user asked for
// something, and has to be told it didn't happen so they can try again.
//
// A call that doesn't confirm isn't proof that nothing happened (security
// review, 2026-11-18): the function can take longer than the client waits,
// delete the user, and have its 200 lost; every retry then gets a 401. So
// after any call that doesn't confirm, the client asks the auth server
// whether the user still exists, and only its definite "no such user" counts
// as done. Anything ambiguous leaves this phone untouched.

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseClient, isSupabaseConfigured } from './client';

export type DeleteAccountOutcome = { ok: true } | { ok: false; error: string };

export interface DeleteAccountDeps {
  /** Override the client (tests). Null means "no client available". */
  client?: SupabaseClient | null;
  /**
   * How long to wait for the function. Default 45 s, above its worst case:
   * three upstream calls with 8 s ceilings each (Apple's token exchange and
   * revoke, RevenueCat's delete), then the delete itself.
   */
  timeoutMs?: number;
  /** How long to wait for the session read and the follow-up question. Default 10 s. */
  probeTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_PROBE_TIMEOUT_MS = 10_000;

/**
 * The server answered, and the account is still there: nothing was deleted.
 * Also when no request could be made at all.
 */
export const DELETE_FAILED_MESSAGE =
  "Couldn't delete your account right now. Nothing has been deleted. Try again in a moment.";

/**
 * No answer either way (the call timed out or never got through, and the
 * server couldn't be asked afterwards): the app can't say what happened.
 */
export const DELETE_UNCONFIRMED_MESSAGE =
  "Couldn't confirm whether your account was deleted. Check your connection and try again.";

/** Whose account the call is about: the session's token and its user, read before the call. */
interface Asked {
  token: string;
  userId: string;
}

/** What the auth server said about the user afterwards. */
type Probe = 'gone' | 'exists' | 'unknown';

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
  // No client, no request: nothing can have been deleted.
  if (!client) return { ok: false, error: DELETE_FAILED_MESSAGE };

  const probeTimeoutMs = deps.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  // Read before the call, while the user certainly exists: afterwards a token
  // refresh would fail for a deleted user and the SDK would drop the session.
  const asked = await sessionNow(client, probeTimeoutMs);

  // Whether the function sent an answer that ended its work. After a timeout
  // or a lost connection it may still be running, so "the user still exists"
  // then doesn't mean nothing will be deleted.
  let answered = false;
  try {
    const result = (await withTimeout(
      client.functions.invoke('delete-account', {
        body: appleAuthorizationCode
          ? { apple_authorization_code: appleAuthorizationCode }
          : {},
      }),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )) as InvokeResult;
    // Only an explicit ok counts. Anything else is not proof the account is
    // gone, and the caller wipes the device only on proof.
    if (!result.error && (result.data as { ok?: unknown } | null)?.ok === true) {
      return { ok: true };
    }
    answered = finishedAnswer(result);
    // eslint-disable-next-line no-console
    console.warn('[account] delete-account did not confirm:', describeResult(result));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[account] delete-account got no answer:', messageOf(e));
  }

  const probe = await probeAccount(client, asked, probeTimeoutMs);
  // The account is gone: done, whichever call did it.
  if (probe === 'gone') return { ok: true };
  if (probe === 'exists' && answered) return { ok: false, error: DELETE_FAILED_MESSAGE };
  return { ok: false, error: DELETE_UNCONFIRMED_MESSAGE };
}

/** The parts of functions-js's invoke result read here. */
interface InvokeResult {
  data: unknown;
  error: unknown;
  response?: { status?: unknown } | null;
}

/**
 * Whether the function answered in a way that ended its work: a 2xx whose
 * body didn't confirm, or an error with an HTTP status. A gateway timeout
 * (504) can leave the function running, and an error with no status (no
 * connection, an unreadable body) says nothing about what it did.
 */
function finishedAnswer(result: InvokeResult): boolean {
  if (!result.error) return true;
  const status = result.response?.status;
  return typeof status === 'number' && status !== 504;
}

/** For the log: the status and the error's message, never the body. */
function describeResult(result: InvokeResult): string {
  const status = result.response?.status;
  const statusText = typeof status === 'number' ? `HTTP ${status}` : 'no status';
  return result.error ? `${statusText}, ${messageOf(result.error)}` : `${statusText}, no ok in the body`;
}

function messageOf(e: unknown): string {
  if (typeof e === 'object' && e !== null) {
    const { message } = e as { message?: unknown };
    if (typeof message === 'string') return message;
  }
  return 'unknown error';
}

/** The current session's access token and user, or null. Never throws. */
async function sessionNow(client: SupabaseClient, ms: number): Promise<Asked | null> {
  try {
    const { data } = await withTimeout(client.auth.getSession(), ms);
    const token = data?.session?.access_token;
    const userId = data?.session?.user?.id;
    if (typeof token !== 'string' || token === '' || typeof userId !== 'string' || userId === '') {
      return null;
    }
    return { token, userId };
  } catch {
    return null;
  }
}

/**
 * Ask the auth server about the user the call was for, with the token read
 * before it (`getUser(jwt)`: one GET /user, with no refresh and no change to
 * the stored session). Never throws.
 */
async function probeAccount(
  client: SupabaseClient,
  asked: Asked | null,
  ms: number,
): Promise<Probe> {
  if (!asked) return 'unknown';
  try {
    const { data, error } = await withTimeout(client.auth.getUser(asked.token), ms);
    if (error) return userIsGone(error) ? 'gone' : 'unknown';
    return data?.user?.id === asked.userId ? 'exists' : 'unknown';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[account] could not ask whether the account still exists:', messageOf(e));
    return 'unknown';
  }
}

/**
 * The server's own word that the user no longer exists. With supabase-js
 * 2.106 (auth-js 2.106.2), GoTrue answers GET /user for a token whose user was
 * deleted with HTTP 403 and the code `user_not_found` ("User from sub claim in
 * JWT does not exist"), which auth-js returns as an AuthApiError with that
 * status and code, keeping the local session (`src/lib/fetch.ts` handleError;
 * GoTrueClient `_getUser`). GoTrue looks the user up before the session, so a
 * deleted user can't read as `session_not_found`.
 *
 * Nothing else counts. `session_not_found` (AuthSessionMissingError) is also
 * what a user who still exists gets after signing out everywhere; a network
 * failure is AuthRetryableFetchError with status 0; an expired token is
 * `bad_jwt`. Read by the public fields only (name, status, code), so this
 * module needn't load the SDK.
 */
function userIsGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, status, code } = error as { name?: unknown; status?: unknown; code?: unknown };
  return name === 'AuthApiError' && status === 403 && code === 'user_not_found';
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
