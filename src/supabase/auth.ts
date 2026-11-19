// Auth flows: Apple, Google, email/password, signout. Each wrapper:
//   • Calls the Supabase SDK with the right shape for that provider.
//   • Returns a normalized AuthOutcome so callers (mostly authStore) don't
//     branch on provider-specific errors.
//   • Throws never — surfaces failures as { ok: false, error } so the UI
//     can render them without try/catch dancing.
//
// The native modules (Apple's sheet, the system web sign-in sheet) are
// lazy-required at call time so unit tests for the email/password path don't
// have to mock them.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { getSupabaseClient } from './client';

export type AuthOutcome =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Sign-up can succeed without signing anyone in: with "Confirm email" on in
 * the Supabase project, the account exists but has no session until the
 * link in the email is clicked. The screen has to say which happened.
 */
export type SignUpOutcome =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; error: string };

/**
 * The shortest password sign-up accepts. Exported so the sign-in screen's
 * checklist says the same number the check below enforces.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Which of Create account's four password rules a password meets. */
export interface PasswordRules {
  length: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
}

/**
 * Create account's password rules (step 190): 8 or more characters, an
 * uppercase letter, a lowercase letter and a number. The letters and digits
 * are ASCII on purpose: they mirror Supabase's own "Lowercase, uppercase
 * letters and digits" option, so a password the app accepts is never refused
 * by the server for its characters. "É" or "ß" isn't an uppercase or a
 * lowercase letter here, nor "１" a number, because the server wouldn't count
 * them. Nothing is forbidden and no symbol is required.
 *
 * Sign in never applies them: an account made before them keeps working.
 * The length is in UTF-16 units, as before; the server counts UTF-8 bytes,
 * never fewer, so it can't refuse a length the app accepts.
 */
export function passwordRules(password: string): PasswordRules {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
  };
}

export function passwordMeetsRules(password: string): boolean {
  const met = passwordRules(password);
  return met.length && met.upper && met.lower && met.digit;
}

/** Each rule as the refusal names it, in the checklist's order. */
const RULE_WORDS: ReadonlyArray<{ key: keyof PasswordRules; words: string }> = [
  { key: 'length', words: `${MIN_PASSWORD_LENGTH} or more characters` },
  { key: 'upper', words: 'an uppercase letter' },
  { key: 'lower', words: 'a lowercase letter' },
  { key: 'digit', words: 'a number' },
];

/** "a", "a and b", "a, b and c". */
function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The refusal for a password that misses a rule, naming only what's missing
 * ("Your password needs an uppercase letter and a number."). Null when every
 * rule is met. Exported for tests.
 */
export function passwordRulesError(password: string): string | null {
  const met = passwordRules(password);
  const missing = RULE_WORDS.filter((r) => !met[r.key]).map((r) => r.words);
  if (missing.length === 0) return null;
  return `Your password needs ${joinParts(missing)}.`;
}

/**
 * What a person sees when the server itself refuses a password as weak
 * (`weak_password`, `AuthWeakPasswordError`): the four rules in plain words,
 * not the server's text, which lists the alphabet.
 */
export const WEAK_PASSWORD_TEXT = `That password isn't strong enough. It needs ${joinParts(
  RULE_WORDS.map((r) => r.words),
)}.`;

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";
const PROVIDER_OFF =
  "This way of signing in isn't available right now. Sign in with your email instead.";
/** What a person sees after closing a sign-in sheet, Apple's or Google's. */
const CANCELLED = 'Sign-in cancelled.';

/**
 * The words a person sees for an auth failure. Supabase reports an
 * unreachable server as the browser's or fetch's own text ("Failed to fetch",
 * "Network request failed"), which reads as a bug, not as "you're offline".
 * Everything else is Supabase's own message, which is written for people.
 * Exported for tests.
 */
export function authErrorText(message: string): string {
  const unreachable =
    /failed to fetch|network request failed|fetch failed|networkerror|load failed/i;
  if (unreachable.test(message)) return OFFLINE;
  // A provider switched off on the project (seen on the first device build,
  // 2026-11-07: 'Provider (issuer "https://appleid.apple.com") is not
  // enabled'). Server wording, not the person's to fix; email still works.
  if (/provider.*(is )?not enabled|unsupported provider/i.test(message)) return PROVIDER_OFF;
  return message;
}

function errMessage(e: unknown): string {
  return authErrorText(e instanceof Error ? e.message : String(e));
}

/**
 * Sign-up's words for a failure: the server's weak-password refusal as the
 * four rules (it comes back as `{ error }`, or thrown), anything else as
 * `authErrorText` says it. Matched on the code and on the class name, so a
 * plain error object with either is caught too.
 */
function signUpErrorText(e: unknown): string {
  if (typeof e === 'object' && e !== null) {
    const { code, name, message } = e as { code?: unknown; name?: unknown; message?: unknown };
    if (code === 'weak_password' || name === 'AuthWeakPasswordError') {
      return WEAK_PASSWORD_TEXT;
    }
    if (typeof message === 'string') return authErrorText(message);
  }
  return errMessage(e);
}

/**
 * Native Apple Sign-In. iOS-only at the SDK level — on any other platform
 * this returns a "not supported" error so the caller can hide the button.
 */
export async function signInWithApple(): Promise<AuthOutcome> {
  if (Platform.OS !== 'ios') {
    return { ok: false, error: 'Apple Sign-In is only available on iOS.' };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');

    const credential = await AppleAuthentication.signInAsync({
      // The email only: nothing uses a name, and asking for one is data the
      // task doesn't need (5.1.1(iii); policy audit, 2026-11-14).
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });

    if (!credential.identityToken) {
      return { ok: false, error: 'Apple did not return an identity token.' };
    }

    const { error } = await getSupabaseClient().auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { ok: false, error: authErrorText(error.message) };
    return { ok: true };
  } catch (e) {
    // ERR_REQUEST_CANCELED is thrown when the user dismisses the sheet —
    // surface a friendly message rather than the raw code.
    const msg = errMessage(e);
    if (msg.includes('CANCELED')) return { ok: false, error: CANCELLED };
    return { ok: false, error: msg };
  }
}

/**
 * Where Google sign-in comes back to the app. Supabase sends the browser here
 * with `?code=…` once Google has answered, and the system sheet hands that URL
 * back to `signInWithGoogle` instead of opening it. The owner adds exactly
 * this string to Supabase's redirect allow-list (Authentication → URL
 * Configuration); anything else there and Supabase falls back to the Site URL,
 * which never returns to the app. `app/google-auth.tsx` catches it if iOS
 * ever delivers it as a deep link as well.
 */
export const GOOGLE_REDIRECT_URL = 'fairlysure://google-auth';

/** The words for any Google failure that isn't the person's doing. */
export const GOOGLE_UNAVAILABLE = "Google sign-in isn't available right now.";
const GOOGLE_NO_CODE = "Google didn't return a sign-in code.";

/**
 * Supabase error codes whose message is written for the person signing in,
 * so it is shown as it comes (through `authErrorText`). Every other code
 * (a provider switched off, sign-ups closed, a lost or expired sign-in
 * attempt, a server fault) reads as `GOOGLE_UNAVAILABLE`: Supabase's text for
 * those is written for developers ("PKCE code verifier not found in
 * storage…").
 */
const PERSON_FACING_CODES: ReadonlySet<string> = new Set([
  'user_banned',
  'provider_email_needs_verification',
  'over_request_rate_limit',
]);

/** The words for a Google failure, from what Supabase or the sheet reported. */
function googleFailureText(message: string, code: string | null): string {
  const text = authErrorText(message);
  if (text === OFFLINE) return OFFLINE;
  if (code && PERSON_FACING_CODES.has(code) && message.trim()) return text;
  return GOOGLE_UNAVAILABLE;
}

/** The parts of the redirect URL sign-in reads. */
export interface AuthRedirectParams {
  code: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

/** A query string's or fragment's pairs, `+` read as a space. First wins. */
function readPairs(part: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const pair of part.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodePart(eq < 0 ? pair : pair.slice(0, eq));
    if (!pairs.has(key)) pairs.set(key, decodePart(eq < 0 ? '' : pair.slice(eq + 1)));
  }
  return pairs;
}

function decodePart(raw: string): string {
  const spaced = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

/**
 * The code or the error a sign-in redirect carries, from the query string or
 * the `#` fragment: Supabase's PKCE flow puts them in the query, and it also
 * copies an error into the fragment, as the implicit flow does, so either is
 * read (the query first). Parsed by hand rather than with `URL`, whose
 * support for a custom scheme like `fairlysure://` varies by runtime. Empty
 * values count as absent. Exported for tests.
 */
export function readAuthRedirect(url: string): AuthRedirectParams {
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt < 0 ? url : url.slice(0, hashAt);
  const fragment = hashAt < 0 ? '' : url.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf('?');
  const query = readPairs(queryAt < 0 ? '' : beforeHash.slice(queryAt + 1));
  const hash = readPairs(fragment);
  const pick = (key: string): string | null => query.get(key) || hash.get(key) || null;
  return {
    code: pick('code'),
    error: pick('error'),
    errorCode: pick('error_code'),
    errorDescription: pick('error_description'),
  };
}

/** The words for an error the redirect carried. */
function redirectErrorText(params: AuthRedirectParams): string {
  // Google's own refusal, passed through by Supabase without a code of its
  // own: the person chose Cancel on Google's page. Supabase also reports
  // closed sign-ups and banned users as `access_denied`, but with a code.
  if (params.error === 'access_denied' && !params.errorCode) return CANCELLED;
  return googleFailureText(params.errorDescription ?? '', params.errorCode);
}

/** A Supabase error's code, when it has one (`AuthError.code`). */
function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
}

/**
 * Google sign-in through the system sign-in sheet (step 192): no Google SDK.
 * Supabase builds Google's address (PKCE: the client keeps the verifier),
 * `openAuthSessionAsync` shows it in iOS's ASWebAuthenticationSession (iOS
 * first asks to let the app use the website), and the sheet hands back the
 * redirect, whose one-time code becomes a session through
 * `exchangeCodeForSession`. The session then reaches the app the way every
 * sign-in's does, through authStore's onAuthStateChange.
 *
 * iOS only: on the web build the redirect can't use the app's scheme. No
 * scopes beyond Supabase's own (`email`, `profile`); what `profile` brings is
 * discarded on the server (Supabase migration 009). `prompt=select_account`
 * shows Google's account chooser even with one account signed in, so a
 * shared iPad or a second account isn't picked silently. The sheet isn't
 * ephemeral, so Safari's Google sign-in is offered.
 *
 * Nothing here logs the redirect, its code or a token, and nothing reads
 * Google's own access token, which Supabase may keep in the session: it
 * stays on the device and is never sent anywhere (App Review 5.1.1(v)).
 */
export async function signInWithGoogle(): Promise<AuthOutcome> {
  if (Platform.OS !== 'ios') {
    return { ok: false, error: 'Google sign-in is only available on iOS.' };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');
    const supabaseAuth = getSupabaseClient().auth;

    const { data, error } = await supabaseAuth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: GOOGLE_REDIRECT_URL,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) return { ok: false, error: googleFailureText(error.message, errorCode(error)) };
    if (!data?.url) return { ok: false, error: GOOGLE_UNAVAILABLE };

    const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_REDIRECT_URL);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { ok: false, error: CANCELLED };
    }
    // 'locked' (another sheet is open) or anything new: not the person's doing.
    if (result.type !== 'success') return { ok: false, error: GOOGLE_UNAVAILABLE };

    const params = readAuthRedirect(result.url);
    // An error wins over a code that came with it.
    if (params.error || params.errorCode) {
      return { ok: false, error: redirectErrorText(params) };
    }
    if (!params.code) return { ok: false, error: GOOGLE_NO_CODE };

    const exchanged = await supabaseAuth.exchangeCodeForSession(params.code);
    if (exchanged.error) {
      return {
        ok: false,
        error: googleFailureText(exchanged.error.message, errorCode(exchanged.error)),
      };
    }
    return { ok: true };
  } catch (e) {
    // A thrown error's text is a developer's ("Supabase credentials
    // missing…", a native module's code), so only the offline case is
    // passed on.
    return {
      ok: false,
      error: googleFailureText(e instanceof Error ? e.message : String(e), errorCode(e)),
    };
  }
}

/** Email + password sign-in. Existing-account flow. */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: 'Email is required.' };
  if (!password) return { ok: false, error: 'Password is required.' };

  try {
    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: trimmed,
      password,
    });
    if (error) return { ok: false, error: authErrorText(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

/**
 * Email + password sign-up. With "Confirm email" on (the Supabase default),
 * the account is created without a session and `needsConfirmation` is true:
 * the user confirms from the email, then signs in here. With it off, the
 * session arrives immediately and onAuthStateChange takes it from there.
 *
 * A password that misses one of `passwordRules` is refused here, before the
 * server, with what it's missing.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<SignUpOutcome> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: 'Email is required.' };
  const weak = passwordRulesError(password);
  if (weak) return { ok: false, error: weak };

  try {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: trimmed,
      password,
    });
    if (error) return { ok: false, error: signUpErrorText(error) };
    return { ok: true, needsConfirmation: !data?.session };
  } catch (e) {
    return { ok: false, error: signUpErrorText(e) };
  }
}

/**
 * How a sign-out ended. `localOnly`: the session ended on this phone, but the
 * server never took the sign-out (no connection, or it refused), so the
 * session's refresh token stays valid on the server until it expires or is
 * revoked. Nothing on this phone holds it any more.
 */
export type SignOutOutcome = { ok: true; localOnly?: true } | { ok: false; error: string };

/** What the person sees when even this phone's copy of the session couldn't be removed. */
export const SIGN_OUT_FAILED = "Couldn't sign you out on this phone. Try again.";

/** How long the server gets to take a sign-out before this phone ends it alone. */
const SIGN_OUT_TIMEOUT_MS = 10_000;
/** How long the read-back after clearing the stored session may wait on the client. */
const SESSION_CHECK_TIMEOUT_MS = 5_000;

/**
 * Sign out everywhere (Supabase's default scope), and in any case on this
 * phone. supabase-js keeps the session when the server can't be reached, so
 * a sign-out with no connection used to do nothing (security review,
 * 2026-11-18); `endSession` then ends it here alone.
 */
export async function signOut(): Promise<SignOutOutcome> {
  return await endSession('global');
}

/**
 * Sign out of this device only. Used after account deletion: the server has
 * already deleted the user and with it every session. The server answers the
 * sign-out with a 401 or 403, which supabase-js takes as signed out; with no
 * connection this phone ends the session alone, as `signOut` does.
 */
export async function signOutLocal(): Promise<SignOutOutcome> {
  return await endSession('local');
}

/**
 * Ask the server to end the session, then make sure it has ended on this
 * phone whatever the server said.
 *
 * auth-js 2.106.2 POSTs /logout for every scope, `local` included
 * (GoTrueAdminApi.signOut), and removes the stored session only after an
 * answer, or a 401, 403 or 404 (GoTrueClient `_signOut`). A network failure
 * (AuthRetryableFetchError, status 0), any other error, or a session it
 * couldn't refresh returns `{ error }` and keeps the session. There is no
 * public call that drops the session without the server, so that case falls
 * to `clearStoredSession`.
 *
 * Never throws. When the session ended here alone, the caller has to move the
 * app on itself: supabase-js sends no SIGNED_OUT for it.
 */
async function endSession(scope: 'global' | 'local'): Promise<SignOutOutcome> {
  let client: SupabaseClient;
  try {
    client = getSupabaseClient();
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
  try {
    const { error } = await withTimeout(
      scope === 'global' ? client.auth.signOut() : client.auth.signOut({ scope: 'local' }),
      SIGN_OUT_TIMEOUT_MS,
    );
    if (!error) return { ok: true };
  } catch {
    // A timeout or a throw: the same as an error, the session may still be stored.
  }
  return (await clearStoredSession(client))
    ? { ok: true, localOnly: true }
    : { ok: false, error: SIGN_OUT_FAILED };
}

/** The keys auth-js's own sign-out removes (`_removeSession`), after the storage key. */
const SESSION_KEY_SUFFIXES = ['', '-code-verifier', '-user'] as const;

interface RemovableStorage {
  removeItem(key: string): unknown;
}

function isRemovableStorage(storage: unknown): storage is RemovableStorage {
  return (
    typeof storage === 'object' &&
    storage !== null &&
    typeof (storage as { removeItem?: unknown }).removeItem === 'function'
  );
}

/**
 * Remove the stored session from this phone without the server, the way
 * auth-js's own sign-out does: the same keys, from the same storage. With
 * `persistSession` on, the client reads the session from that storage on
 * every `getSession`, every request's token and every auto-refresh tick
 * (GoTrueClient `__loadSession`), so nothing is left to refresh or send, and
 * an app restart finds no session. The storage and its key are read off the
 * client (`storageKey` and `storage`, protected fields of GoTrueClient: no
 * public route exists), so this follows whatever key the client was made
 * with.
 *
 * A token refresh already under way when the keys go could write the session
 * back when it lands. `getSession` waits for the client's lock, which that
 * refresh holds, then reads storage again; a session found there is removed
 * once more. Only a read-back that can't run in time (a sign-out still
 * waiting on the network holds the lock: it writes nothing when it fails) is
 * taken as done.
 *
 * Returns whether the session is gone. Never throws.
 */
async function clearStoredSession(client: SupabaseClient): Promise<boolean> {
  const authClient = client.auth;
  const { storageKey, storage } = authClient as unknown as {
    storageKey?: unknown;
    storage?: unknown;
  };
  if (typeof storageKey !== 'string' || storageKey === '' || !isRemovableStorage(storage)) {
    return false;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      for (const suffix of SESSION_KEY_SUFFIXES) await storage.removeItem(storageKey + suffix);
    } catch {
      return false;
    }
    try {
      const { data } = await withTimeout(authClient.getSession(), SESSION_CHECK_TIMEOUT_MS);
      if (!data?.session) return true;
    } catch {
      return true;
    }
  }
  return false;
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

/** The provider name Supabase gives a Sign in with Apple identity. */
const APPLE_PROVIDER = 'apple';
/** The provider name Supabase gives a Google identity. */
const GOOGLE_PROVIDER = 'google';

/**
 * Whether the account has an identity from this provider, by any of the three
 * signals a session carries: `app_metadata.provider` (the first way in),
 * `app_metadata.providers` (all of them) or `user.identities`. Never throws:
 * a field missing or of the wrong type is no signal.
 */
function hasProviderIdentity(user: User | null | undefined, provider: string): boolean {
  if (typeof user !== 'object' || user === null) return false;
  const { app_metadata: meta, identities } = user as {
    app_metadata?: unknown;
    identities?: unknown;
  };
  if (typeof meta === 'object' && meta !== null) {
    const { provider: first, providers } = meta as { provider?: unknown; providers?: unknown };
    if (first === provider) return true;
    if (Array.isArray(providers) && providers.includes(provider)) return true;
  }
  return (
    Array.isArray(identities) &&
    identities.some(
      (identity: unknown) =>
        typeof identity === 'object' &&
        identity !== null &&
        (identity as { provider?: unknown }).provider === provider,
    )
  );
}

/**
 * Whether the account has a Sign in with Apple identity, whichever way it was
 * made. Account deletion revokes the app's Sign in with Apple grant when this
 * is true (docs/ACCOUNT_SPEC.md §3.2 step 4; App Store Guideline 5.1.1(v)).
 *
 * `app_metadata.provider` alone isn't enough: it stays the first way the
 * account signed in. Supabase links a Sign in with Apple identity that shares
 * a verified email with an existing account into that account, so an account
 * made with email and password that later used Apple with the same address
 * reads `provider: 'email'`, and 'apple' shows only in
 * `app_metadata.providers` and `user.identities` (policy audit, 2026-11-18).
 * Any one of the three is enough.
 *
 * Never throws: a field that is missing or of the wrong type (a session read
 * back from storage, an older server) is no signal, and with no signal the
 * answer is false.
 */
export function hasAppleIdentity(user: User | null | undefined): boolean {
  return hasProviderIdentity(user, APPLE_PROVIDER);
}

/**
 * Whether the account has a Google identity, whichever way it was made: one
 * made with Google, or an email or Apple account Supabase linked to Google
 * through the same verified address. The same three signals and the same
 * tolerance as `hasAppleIdentity`.
 *
 * Account deletion uses it only for words: an account with a Google identity
 * is told how to remove the app from its Google Account too. There is no
 * revocation call, since the app holds no Google token to revoke with (step
 * 192).
 */
export function hasGoogleIdentity(user: User | null | undefined): boolean {
  return hasProviderIdentity(user, GOOGLE_PROVIDER);
}

/**
 * Ask Apple for a fresh authorization code for the signed-in account when it
 * has a Sign in with Apple identity (`hasAppleIdentity`, a linked one
 * included), for account deletion (docs/ACCOUNT_SPEC.md §3.2 step 4). Apple requires the
 * app's Sign in with Apple grant be revoked when the account is deleted, and
 * revoking needs a code no older than ten minutes — which only a new trip
 * through the system sheet produces.
 *
 * Null when unavailable or declined. Deletion goes ahead without it: making
 * the user complete an extra sign-in to be allowed to leave is the
 * "unnecessarily difficult" case Apple rejects for.
 */
export async function reauthenticateWithApple(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    return credential.authorizationCode ?? null;
  } catch {
    return null;
  }
}
