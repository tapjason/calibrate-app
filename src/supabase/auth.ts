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
//
// The under-13 rule (roadmap D70, 2026-11-19): every exported sign-in and
// sign-up function (signInWithApple, signInWithGoogle, signInWithEmail,
// signUpWithEmail) starts with `refuseWhenLocalOnly()`, which refuses with
// `LOCAL_ONLY_SIGN_IN` before any client, nonce or native sheet is touched,
// and with `AGE_PENDING_SIGN_IN` while Apple's age answer is still pending
// after its wait: defence in depth under authStore's own refusal. The sign-ins
// that open a sheet ask again once it closes, before anything reaches
// Supabase (Apple's answer may land while the sheet is up). src/age/egress.test.ts
// checks every exported `sign(In|Up)…` function starts with it. Deliberately
// left open, because they remove data: `signOut` and `signOutLocal` (and the
// local `discardStoredSession`), and `reauthenticateWithApple`, used only by
// account deletion to revoke the Sign in with Apple grant. The session's
// background refresh is paused and resumed here (`pauseSessionRefresh`,
// `resumeSessionRefresh`, called by src/age/localOnly.ts).

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import {
  AGE_ANSWER_WAIT_MS,
  isLocalOnly,
  LOCAL_ONLY_SIGN_IN,
  uploadsMayStart,
  useAgeStore,
  whenAgeSettled,
} from '@/store/ageStore';

import { getSupabaseClient, peekSupabaseClient } from './client';
import { SESSION_KEY_SUFFIXES } from './sessionStorage';

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

// ----------------------------------------------------------------------------
// The under-13 rule (D70)
// ----------------------------------------------------------------------------

/** What a sign-in or sign-up returns while the rule applies, or while Apple's answer is pending. */
export type LocalOnlyRefusal = { ok: false; error: string };

/**
 * What a sign-in or sign-up returns when Apple's age answer is still pending
 * after the wait (policy audit, 2026-11-19): no account may be made or opened
 * before the app knows whether the rule applies, since the privacy policy
 * promises nothing is created under 13. Temporary: once the answer is in, the
 * same tap goes on (or meets `LOCAL_ONLY_SIGN_IN`). Here, in the auth service,
 * because the age store (where `LOCAL_ONLY_SIGN_IN` lives) is another layer's
 * file; authStore can read it as `auth.AGE_PENDING_SIGN_IN`, and meanwhile
 * returns it from this service as it does every refusal. Names no age.
 */
export const AGE_PENDING_SIGN_IN = "Sign-in isn't ready yet. Try again in a moment.";

/**
 * When the age store last began waiting for Apple's answer (`settled` turned
 * false), or null while it has one. Kept by the subscription below, so a
 * sign-in can tell how much of the 5 s wait is left.
 */
let ageWaitStartedAt: number | null = useAgeStore.getState().settled ? null : Date.now();
useAgeStore.subscribe((state, prev) => {
  if (state.settled) ageWaitStartedAt = null;
  else if (prev.settled || ageWaitStartedAt === null) ageWaitStartedAt = Date.now();
});

/**
 * The first statement of every exported sign-in and sign-up function, and
 * asked again after a native sheet closes: null to go on, or a refusal. Before
 * any client, nonce or native sheet is touched.
 *
 *   - `LOCAL_ONLY_SIGN_IN` while the phone is local-only.
 *   - `AGE_PENDING_SIGN_IN` while Apple's age answer is still pending once the
 *     wait is over: no account goes ahead before the app knows (policy audit,
 *     2026-11-19; until then it went on as today after 5 s, so an account
 *     could be made and only then frozen).
 *
 * On a launch that asks Apple, it waits for the answer for what is left of
 * `AGE_ANSWER_WAIT_MS` (5 s) since the age store began waiting. Measured from
 * then, not from this call, so it never adds a second wait after authStore's
 * own (`accountSignIn` waits up to 5 s from the tap first). Anywhere the
 * question isn't asked, or isn't waited for (web, Jest, iOS before 26, a
 * stored band of 13 or over, whose ask runs in the background), the store is
 * settled from the start and it resolves at once, as before. Never rejects.
 */
export async function refuseWhenLocalOnly(): Promise<LocalOnlyRefusal | null> {
  try {
    if (!useAgeStore.getState().settled && ageWaitStartedAt !== null) {
      const left = ageWaitStartedAt + AGE_ANSWER_WAIT_MS - Date.now();
      if (left > 0) await whenAgeSettled(left);
    }
    if (isLocalOnly()) return { ok: false, error: LOCAL_ONLY_SIGN_IN };
    if (!useAgeStore.getState().settled) return { ok: false, error: AGE_PENDING_SIGN_IN };
    return null;
  } catch {
    // The age store can't be read: refuse, the safe side.
    return { ok: false, error: LOCAL_ONLY_SIGN_IN };
  }
}

/** Bumped by every pause and resume, so only the latest one acts. */
let refreshGeneration = 0;

/** A session refresh call's failure for the log: its message only. */
function refreshLog(e: unknown): string {
  return e instanceof Error ? e.message : 'unknown error';
}

/**
 * Stop the session's background token refresh (the under-13 rule, D70): no
 * refresh timer runs while the phone is local-only. Never makes the client (a
 * client made later is made with the refresh off, src/supabase/client.ts),
 * never throws and never rejects.
 *
 * Waits for the client's own start first: auth-js starts its refresh timer at
 * the end of it, which would undo a stop made before. A `resumeSessionRefresh`
 * called meanwhile wins. What stays (disclosed): any read of a session within
 * its expiry margin still refreshes it, supabase-js's own INITIAL_SESSION read
 * as the client is made included (src/supabase/client.ts), which Sign out and
 * Delete account rely on.
 */
export async function pauseSessionRefresh(): Promise<void> {
  const mine = ++refreshGeneration;
  try {
    const client = peekSupabaseClient();
    if (!client) return;
    await client.auth.initialize();
    if (mine !== refreshGeneration) return;
    await client.auth.stopAutoRefresh();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] could not stop the session refresh:', refreshLog(e));
  }
}

/**
 * Start the session's background token refresh once uploads may start
 * (`uploadsMayStart`: Apple has answered on a launch that asks, and the rule
 * doesn't apply), called by src/age/localOnly.ts at that moment. A client made
 * before then was made with the refresh off (src/supabase/client.ts). Never
 * makes the client, never throws and never rejects. Does nothing (and leaves
 * a pause under way to finish) while uploads may not start, and nothing if a
 * later pause came in, or if uploads may no longer start by the time the
 * client has started.
 *
 * A session that expired or is near expiry meanwhile is refreshed at once:
 * auth-js 2.106.2's `startAutoRefresh` runs its first tick on the next turn of
 * the event loop (`_startAutoRefresh`), and the tick refreshes a session within
 * 90 s of expiry (`_autoRefreshTokenTick`, through `__loadSession`), then every
 * 30 s (checked against the installed library in auth.localOnly.test.ts).
 */
export async function resumeSessionRefresh(): Promise<void> {
  // Before anything, the bump included: while uploads may not start, a pause
  // still under way must win.
  if (!uploadsMayStart()) return;
  const mine = ++refreshGeneration;
  try {
    const client = peekSupabaseClient();
    if (!client) return;
    await client.auth.initialize();
    if (mine !== refreshGeneration || !uploadsMayStart()) return;
    await client.auth.startAutoRefresh();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] could not start the session refresh:', refreshLog(e));
  }
}

/** What a person sees when Sign in with Apple can't be started on this build. */
export const APPLE_UNAVAILABLE = "Sign in with Apple isn't available right now.";

/** The two halves of a Sign in with Apple nonce. */
export interface AppleNonce {
  /** 32 random bytes as lowercase hex: sent to Supabase. */
  raw: string;
  /** SHA-256 of `raw`, lowercase hex: sent to Apple, which puts it in the identity token. */
  hashed: string;
}

/**
 * A fresh replay guard for one Sign in with Apple (security review round 5,
 * 2026-11-19). Apple copies the `nonce` it is given into the identity token;
 * Supabase hashes the raw value it is given with SHA-256, as lowercase hex,
 * and refuses the token unless the two match, so a token taken from another
 * sign-in can't be replayed here.
 *
 * `getRandomBytesAsync`, not `getRandomBytes`: both read the system's secure
 * random source, but the synchronous one falls back to `Math.random` in a
 * development build without the old bridge's sync hook (expo-crypto 55's
 * `getRandomBytes`), which the New Architecture doesn't have. Throws when
 * expo-crypto is missing (a build made before it was added) or answers with
 * something that isn't a digest or random: no sign-in goes without the guard.
 */
export async function makeAppleNonce(): Promise<AppleNonce> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Crypto = require('expo-crypto') as typeof import('expo-crypto');
  const bytes = await Crypto.getRandomBytesAsync(32);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32 || bytes.every((b) => b === 0)) {
    throw new Error('nonce: no random bytes');
  }
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  const hashed = typeof digest === 'string' ? digest.toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(hashed)) throw new Error('nonce: not a SHA-256 digest');
  return { raw, hashed };
}

/**
 * Native Apple Sign-In. iOS-only at the SDK level — on any other platform
 * this returns a "not supported" error so the caller can hide the button.
 * Each sign-in carries a fresh nonce (`makeAppleNonce`): its SHA-256 goes to
 * Apple, the raw value to Supabase.
 */
export async function signInWithApple(): Promise<AuthOutcome> {
  const refused = await refuseWhenLocalOnly();
  if (refused) return refused;
  if (Platform.OS !== 'ios') {
    return { ok: false, error: 'Apple Sign-In is only available on iOS.' };
  }
  let nonce: AppleNonce;
  try {
    nonce = await makeAppleNonce();
  } catch {
    return { ok: false, error: APPLE_UNAVAILABLE };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');

    // The under-13 rule (D70) again before the sheet opens: Apple's age
    // answer may have landed while the nonce was made.
    const beforeSheet = await refuseWhenLocalOnly();
    if (beforeSheet) return beforeSheet;

    const credential = await AppleAuthentication.signInAsync({
      // The email only: nothing uses a name, and asking for one is data the
      // task doesn't need (5.1.1(iii); policy audit, 2026-11-14).
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonce.hashed,
    });

    // And once it closes, before the identity token reaches Supabase: the age
    // answer may have landed while the sheet was up.
    const afterSheet = await refuseWhenLocalOnly();
    if (afterSheet) return afterSheet;

    if (!credential.identityToken) {
      return { ok: false, error: 'Apple did not return an identity token.' };
    }

    const { error } = await getSupabaseClient().auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: nonce.raw,
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
  const refused = await refuseWhenLocalOnly();
  if (refused) return refused;
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

    // The under-13 rule (D70) again before the sheet opens: inside it the
    // phone talks to Supabase and Google directly. (`signInWithOAuth` above
    // only builds the address and keeps the PKCE verifier on the phone; auth-js
    // 2.106.2 sends nothing for it.)
    const beforeSheet = await refuseWhenLocalOnly();
    if (beforeSheet) return beforeSheet;

    const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_REDIRECT_URL);

    // And once it closes, before the code is exchanged: Apple's age answer may
    // have landed while the sheet was up. What this can't undo: by now
    // Supabase has already made (or found) the user at its own callback,
    // inside the sheet, before handing back the code. Refusing here keeps the
    // session off the phone and the code unexchanged (it expires unused), but
    // the account already exists on the server.
    const afterSheet = await refuseWhenLocalOnly();
    if (afterSheet) return afterSheet;

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
  const refused = await refuseWhenLocalOnly();
  if (refused) return refused;
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
  const refused = await refuseWhenLocalOnly();
  if (refused) return refused;
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
 * How ending the session ended (`signOut`, `signOutLocal`). `localOnly`: the
 * session ended on this phone, but the server never took the sign-out (no
 * connection, or it refused), so the session stays open on the server.
 * Supabase's refresh tokens don't expire (each can be used only once) and
 * sessions have no time limit unless the project sets one (a Pro setting), so
 * it stays open until the next sign-out with a connection, whose global scope
 * ends every session, or until the account is deleted. Nothing on this phone
 * holds it any more.
 */
export type SessionEndOutcome = { ok: true; localOnly?: true } | { ok: false; error: string };

/**
 * How the app's sign-out ended (`authStore.signOut`): the session's end, or a
 * question for the person. `unsynced` and `localCategories`: signing out
 * would take that many changes the server doesn't have, and that many
 * categories only this phone has (added, renamed, given an icon or hidden),
 * off the phone for good, and the person hasn't agreed to lose them (or more
 * have appeared since they did). Nothing was changed then: still signed in,
 * every row still here (owner decision 2026-11-19, D69 (a); round 6, N1, N2).
 * At least one of the two is above zero.
 */
export type SignOutOutcome =
  | SessionEndOutcome
  | { ok: false; unsynced: number; localCategories: number };

/** What the person sees when even this phone's copy of the session couldn't be removed. */
export const SIGN_OUT_FAILED = "Couldn't sign you out on this phone. Try again.";

/** How long the server gets to take a sign-out before this phone ends it alone. */
const SIGN_OUT_TIMEOUT_MS = 10_000;
/** How long the read-back after clearing the stored session may wait on the client. */
const SESSION_CHECK_TIMEOUT_MS = 5_000;
/**
 * How long, at most, a sign-out auth-js is still running after this phone
 * ended the session alone holds back the next account action
 * (`whenSignOutSettles`).
 */
export const LATE_SIGN_OUT_WAIT_MS = 60_000;

/**
 * Sign out everywhere (Supabase's default scope), and in any case on this
 * phone. supabase-js keeps the session when the server can't be reached, so
 * a sign-out with no connection used to do nothing (security review,
 * 2026-11-18); `endSession` then ends it here alone.
 *
 * Not gated by the under-13 rule (D70), nor is `signOutLocal`: ending a
 * session removes data, and a frozen account must still be able to leave.
 */
export async function signOut(): Promise<SessionEndOutcome> {
  return await endSession('global');
}

/**
 * Sign out of this device only. Used after account deletion: the server has
 * already deleted the user and with it every session. The server answers the
 * sign-out with a 401 or 403, which supabase-js takes as signed out; with no
 * connection this phone ends the session alone, as `signOut` does.
 */
export async function signOutLocal(): Promise<SessionEndOutcome> {
  return await endSession('local');
}

/**
 * A sign-out auth-js was still running when this phone ended the session
 * alone (its 10 s were up), and when the wait for it ends.
 */
let lateSignOut: { settled: Promise<void>; deadline: number } | null = null;

/**
 * Whether a sign-out auth-js was still running when this phone ended the
 * session alone is still running, within its 60 s (`LATE_SIGN_OUT_WAIT_MS`).
 *
 * Why it matters (security review round 5, client reviewer LOW-B): that
 * call waits behind the client's lock, often for a token refresh with no
 * connection, and when it runs it reads whatever session is stored then. A
 * sign-in started meanwhile would be that session: auth-js would sign the new
 * account out everywhere, or remove a Google sign-in's code verifier halfway
 * through. authStore keeps its `pending` flag up while this is true, so no
 * sign-in starts underneath it.
 */
export function signOutStillSettling(): boolean {
  const entry = lateSignOut;
  return entry !== null && entry.deadline > Date.now();
}

/**
 * Resolves when the sign-out `signOutStillSettling` reports has settled, or
 * its 60 s are up; at once when there is none. Never rejects.
 */
export async function whenSignOutSettles(): Promise<void> {
  const entry = lateSignOut;
  if (!entry) return;
  const left = entry.deadline - Date.now();
  if (left <= 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      entry.settled,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, left);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Remember a sign-out auth-js is still running, until it settles. */
function trackLateSignOut(call: Promise<unknown>): void {
  const settled = (async () => {
    try {
      await call;
    } catch {
      // Settled is all that matters here.
    }
  })();
  const entry = { settled, deadline: Date.now() + LATE_SIGN_OUT_WAIT_MS };
  lateSignOut = entry;
  void (async () => {
    await settled;
    if (lateSignOut === entry) lateSignOut = null;
  })();
}

/** Test-only: forget any sign-out still running. */
export function __resetLateSignOutForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetLateSignOutForTests is only allowed when NODE_ENV=test');
  }
  lateSignOut = null;
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
 * app on itself: supabase-js sends no SIGNED_OUT for it. When auth-js's own
 * call was still running at that point (the 10 s ran out), it is remembered
 * until it settles (`signOutStillSettling`).
 */
async function endSession(scope: 'global' | 'local'): Promise<SessionEndOutcome> {
  let client: SupabaseClient;
  try {
    client = getSupabaseClient();
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
  let call: Promise<{ error: unknown }> | null = null;
  let settled = false;
  try {
    call = scope === 'global' ? client.auth.signOut() : client.auth.signOut({ scope: 'local' });
    const watched = call;
    void (async () => {
      try {
        await watched;
      } catch {
        // Settled either way.
      } finally {
        settled = true;
      }
    })();
    const { error } = await withTimeout(watched, SIGN_OUT_TIMEOUT_MS);
    if (!error) return { ok: true };
  } catch {
    // A timeout or a throw: the same as an error, the session may still be stored.
  }
  if (call && !settled) trackLateSignOut(call);
  return (await clearStoredSession(client))
    ? { ok: true, localOnly: true }
    : { ok: false, error: SIGN_OUT_FAILED };
}

/**
 * Take the stored session off this phone again, without the server and
 * without waiting on the client's lock: the same keys `clearStoredSession`
 * removes, with no read-back. For a session auth-js wrote back after this
 * phone signed out alone (a token refresh that landed late; security review
 * round 5, client reviewer LOW-A): authStore ignores it and calls this. Never
 * throws.
 */
export async function discardStoredSession(): Promise<void> {
  let client: SupabaseClient;
  try {
    client = getSupabaseClient();
  } catch {
    return;
  }
  const { storageKey, storage } = client.auth as unknown as {
    storageKey?: unknown;
    storage?: unknown;
  };
  if (typeof storageKey !== 'string' || storageKey === '' || !isRemovableStorage(storage)) return;
  for (const suffix of SESSION_KEY_SUFFIXES) {
    try {
      await storage.removeItem(storageKey + suffix);
    } catch {
      // Tried again the next time it shows up.
    }
  }
}

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
 *
 * The request carries a nonce like a sign-in's (security review round 5). Here
 * it guards nothing yet: only the code leaves the phone, and the server checks
 * the identity in what Apple returns for it, not a nonce. So when one can't be
 * made the sheet still opens without it, rather than costing the revocation.
 *
 * Not gated by the under-13 rule (D70), on purpose: it is used only to delete
 * an account, the one upload left open because it removes data.
 */
export async function reauthenticateWithApple(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  let nonce: string | null = null;
  try {
    nonce = (await makeAppleNonce()).hashed;
  } catch {
    nonce = null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync(
      nonce ? { requestedScopes: [], nonce } : { requestedScopes: [] },
    );
    return credential.authorizationCode ?? null;
  } catch {
    return null;
  }
}
