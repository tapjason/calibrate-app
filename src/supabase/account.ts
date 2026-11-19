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
//
// A done outcome also says whether the server confirmed revoking the
// account's Sign in with Apple grant (`appleRevoked`, security review
// 2026-11-18, round 4): when it didn't, the finished screen tells the person
// where to remove the app themselves (docs/ACCOUNT_SPEC.md §3.2 step 5).

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseClient, isSupabaseConfigured } from './client';

export type DeleteAccountOutcome =
  | {
      ok: true;
      /**
       * True only when an Apple code was sent and the function's own 200 says
       * the grant was revoked (`appleRevokedIn`). False when no code was
       * sent, when the server says it skipped or failed the revoke, when its
       * answer can't be read, and when the deletion was confirmed by the
       * "already deleted" check, whose answer says nothing about Apple.
       */
      appleRevoked: boolean;
    }
  | {
      ok: false;
      error: string;
      /**
       * Set only with `DELETE_FAILED_MESSAGE` when the auth server itself said
       * the account still exists after a call that ran none of the work: when
       * (ms since the epoch, the phone's clock) that question was sent, so
       * the answer is about the account at that time or later. An earlier
       * request that couldn't be confirmed can be ruled out by it once it is
       * late enough (`deletionCanNoLongerLand`; client re-review N4). Absent
       * when no request was sent at all (no client, no session, another
       * account's session): nothing was asked of the server then.
       */
      stillExistsAt?: number;
    };

export interface DeleteAccountDeps {
  /** Override the client (tests). Null means "no client available". */
  client?: SupabaseClient | null;
  /**
   * How long to wait for the function. Default 45 s, above its worst case:
   * the Apple leg (token exchange and revoke) and RevenueCat's delete run at
   * the same time, each cut off at 20 s (LEG_DEADLINE_MS in
   * supabase/functions/delete-account/deletionPlan.ts), then the delete of
   * the user itself.
   */
  timeoutMs?: number;
  /** How long to wait for the session read and the follow-up question. Default 10 s. */
  probeTimeoutMs?: number;
  /**
   * The account the app shows as signed in, the one the person asked to
   * delete. Nothing is sent unless the session read before the call is this
   * account's (security review round 5): the call deletes whoever the token
   * belongs to, and the phone then wipes this id's rows.
   */
  expectedUserId?: string;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_PROBE_TIMEOUT_MS = 10_000;

/**
 * How long after a deletion request was sent it may still delete the account
 * on the server. Not the client's 45 s wait: the function's Apple and
 * RevenueCat legs are cut off at 20 s, but its last step, deleting the user,
 * has no deadline of its own, and a worker keeps running after the gateway's
 * 150 s idle timeout until the platform's wall-clock limit, 400 s on paid
 * plans and 150 s on the free one (Supabase, Edge Functions limits, read
 * 2026-11-19). Ten minutes is past both, with the probe's 10 s and room for
 * the phone's clock being set a little.
 */
export const DELETION_CAN_LAND_WITHIN_MS = 10 * 60_000;

/**
 * Whether a deletion request sent at `askedAt` can no longer delete the
 * account, given the auth server said it still exists in an answer to a
 * question sent at `stillExistsAt` (both by the phone's clock). False when
 * `askedAt` isn't known, and when the clock reads backwards between the two.
 */
export function deletionCanNoLongerLand(askedAt: number | null, stillExistsAt: number): boolean {
  if (askedAt === null || !Number.isFinite(askedAt) || !Number.isFinite(stillExistsAt)) {
    return false;
  }
  return stillExistsAt - askedAt > DELETION_CAN_LAND_WITHIN_MS;
}

/**
 * Nothing was deleted: the function refused before it started (a 4xx: every
 * such answer comes before its Apple and RevenueCat steps), and the account
 * is still there. Also when no request was sent at all: no client, no session
 * to read, or a session for another account than the one asked about.
 */
export const DELETE_FAILED_MESSAGE =
  "Couldn't delete your account right now. Nothing has been deleted. Try again in a moment.";

/**
 * No answer either way (the call timed out or never got through, and the
 * server couldn't be asked afterwards), or a server error after which part of
 * the work may have been done: the app can't say what happened.
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
  // No session read: nothing could check the call afterwards, and it could go
  // out without this account's token. Nothing is sent, so nothing happened.
  if (!asked) return { ok: false, error: DELETE_FAILED_MESSAGE };
  // A session for another account than the one shown: deleting it would
  // delete the wrong account. Nothing is sent.
  if (deps.expectedUserId !== undefined && asked.userId !== deps.expectedUserId) {
    // eslint-disable-next-line no-console
    console.warn('[account] the session is for another account than the one shown; nothing sent');
    return { ok: false, error: DELETE_FAILED_MESSAGE };
  }

  // Whether the function answered before starting its work (a 4xx, or a 2xx
  // that didn't confirm). After a timeout or a lost connection it may still be
  // running, and after a 5xx it may have revoked Apple and deleted the
  // RevenueCat customer, so "the user still exists" then doesn't mean nothing
  // was or will be deleted.
  let nothingRan = false;
  try {
    const result = (await withTimeout(
      client.functions.invoke('delete-account', {
        body: appleAuthorizationCode
          ? { apple_authorization_code: appleAuthorizationCode }
          : {},
        // The token whose user was just checked, and that the follow-up
        // question uses: the account deleted is the one asked about.
        headers: { Authorization: `Bearer ${asked.token}` },
      }),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )) as InvokeResult;
    // Only an explicit ok counts. Anything else is not proof the account is
    // gone, and the caller wipes the device only on proof.
    if (!result.error && (result.data as { ok?: unknown } | null)?.ok === true) {
      return {
        ok: true,
        appleRevoked: appleAuthorizationCode !== null && appleRevokedIn(result.data),
      };
    }
    nothingRan = refusedBeforeWork(result);
    // eslint-disable-next-line no-console
    console.warn('[account] delete-account did not confirm:', describeResult(result));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[account] delete-account got no answer:', messageOf(e));
  }

  // Before the question goes: its answer is about the account at this time
  // or later.
  const probedAt = Date.now();
  const probe = await probeAccount(client, asked, probeTimeoutMs);
  // The account is gone: done, whichever call did it. The function's answer
  // was never read, so nothing says Apple's grant was revoked.
  if (probe === 'gone') return { ok: true, appleRevoked: false };
  if (probe === 'exists' && nothingRan) {
    return { ok: false, error: DELETE_FAILED_MESSAGE, stillExistsAt: probedAt };
  }
  return { ok: false, error: DELETE_UNCONFIRMED_MESSAGE };
}

/** How every RevenueCat reason in the function's `skipped` list starts. */
const REVENUECAT_REASON = 'revenuecat:';

/**
 * Whether the function's 200 says the Apple grant was revoked: its `skipped`
 * list can be read and names nothing but RevenueCat. A revoke adds no entry;
 * every reason it didn't happen starts "apple:", in the function as deployed
 * before the security review (no code, no key, the revoke failed) and after it
 * (also: the account's identities unread, no Apple identity, no usable
 * id_token from Apple, a different Apple ID than the account's, a timeout;
 * `APPLE_SKIPPED` in supabase/functions/delete-account/deletionPlan.ts).
 *
 * Read the other way round on purpose: a missing or malformed list, an entry
 * that isn't a string, or a reason this client doesn't know all count as not
 * revoked. Being wrong that way only shows the line on where to remove the
 * app, which costs nothing if Apple's grant was gone after all.
 */
function appleRevokedIn(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const { skipped } = data as { skipped?: unknown };
  if (!Array.isArray(skipped)) return false;
  return skipped.every(
    (reason) => typeof reason === 'string' && reason.startsWith(REVENUECAT_REASON),
  );
}

/** The parts of functions-js's invoke result read here. */
interface InvokeResult {
  data: unknown;
  error: unknown;
  response?: { status?: unknown } | null;
}

/**
 * Whether the function answered before doing any of its work, so a user who
 * still exists means nothing was deleted anywhere: a 2xx whose body didn't
 * confirm (the function sends 200 only with `ok: true`, after the delete), or
 * a 4xx. Every 4xx in supabase/functions/delete-account/index.ts (401 no or
 * bad token, 405, 429, 400 the body) is returned before `runDeletion`.
 *
 * Not a 5xx (security review round 5, client reviewer): the function's own
 * 500 after `runDeletion` (index.ts, "if (!result.deleted)") comes once the
 * Apple revoke and the RevenueCat delete have run (`runDeletion` in
 * deletionPlan.ts settles both legs before deleting the user), and its other
 * 500 (its settings missing) can't be told apart from it; a 546 or 502 is a
 * worker stopped partway. A 504 can leave the function running, and an error
 * with no status (no connection, an unreadable body) says nothing about what
 * it did.
 */
function refusedBeforeWork(result: InvokeResult): boolean {
  if (!result.error) return true;
  const status = result.response?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
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
