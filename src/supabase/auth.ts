// Auth flows: Apple, email/password, signout. Each wrapper:
//   • Calls the Supabase SDK with the right shape for that provider.
//   • Returns a normalized AuthOutcome so callers (mostly authStore) don't
//     branch on provider-specific errors.
//   • Throws never — surfaces failures as { ok: false, error } so the UI
//     can render them without try/catch dancing.
//
// The provider SDK (Apple) is lazy-required at call
// time so unit tests for the email/password path don't have to mock the
// native modules.

import type { User } from '@supabase/supabase-js';
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
    if (msg.includes('CANCELED')) return { ok: false, error: 'Sign-in cancelled.' };
    return { ok: false, error: msg };
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

export async function signOut(): Promise<AuthOutcome> {
  try {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) return { ok: false, error: authErrorText(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

/**
 * Sign out of this device only. Used after account deletion: the server has
 * already deleted the user and with it every session, so a global sign-out
 * would call the server about a user that no longer exists. This just drops
 * the stored session; onAuthStateChange takes the app back to guest.
 */
export async function signOutLocal(): Promise<AuthOutcome> {
  try {
    const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' });
    if (error) return { ok: false, error: authErrorText(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

/** The provider name Supabase gives a Sign in with Apple identity. */
const APPLE_PROVIDER = 'apple';

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
  if (typeof user !== 'object' || user === null) return false;
  const { app_metadata: meta, identities } = user as {
    app_metadata?: unknown;
    identities?: unknown;
  };
  if (typeof meta === 'object' && meta !== null) {
    const { provider, providers } = meta as { provider?: unknown; providers?: unknown };
    if (provider === APPLE_PROVIDER) return true;
    if (Array.isArray(providers) && providers.includes(APPLE_PROVIDER)) return true;
  }
  return (
    Array.isArray(identities) &&
    identities.some(
      (identity: unknown) =>
        typeof identity === 'object' &&
        identity !== null &&
        (identity as { provider?: unknown }).provider === APPLE_PROVIDER,
    )
  );
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
