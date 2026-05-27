// Auth flows: Apple, Google, email/password, signout. Each wrapper:
//   • Calls the Supabase SDK with the right shape for that provider.
//   • Returns a normalized AuthOutcome so callers (mostly authStore) don't
//     branch on provider-specific errors.
//   • Throws never — surfaces failures as { ok: false, error } so the UI
//     can render them without try/catch dancing.
//
// The provider SDKs (Apple, expo-auth-session) are lazy-required at call
// time so unit tests for the email/password path don't have to mock the
// native modules.

import { Platform } from 'react-native';

import { getSupabaseClient } from './client';

export type AuthOutcome =
  | { ok: true }
  | { ok: false; error: string };

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
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
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { ok: false, error: 'Apple did not return an identity token.' };
    }

    const { error } = await getSupabaseClient().auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    // ERR_REQUEST_CANCELED is thrown when the user dismisses the sheet —
    // surface a friendly message rather than the raw code.
    const msg = errMessage(e);
    if (msg.includes('CANCELED')) return { ok: false, error: 'Sign-in cancelled.' };
    return { ok: false, error: msg };
  }
}

/**
 * Google OAuth via expo-auth-session. Opens the system browser, returns
 * when Supabase has the session.
 */
export async function signInWithGoogle(): Promise<AuthOutcome> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AuthSession = require('expo-auth-session') as typeof import('expo-auth-session');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');

    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'calibrate' });

    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.url) return { ok: false, error: 'Supabase did not return an auth URL.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') {
      return { ok: false, error: 'Sign-in cancelled.' };
    }

    // result.url contains the redirect with the code; Supabase needs us to
    // exchange it for a session. PKCE flow stores the verifier in storage,
    // so exchangeCodeForSession reads everything it needs.
    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    if (!code) return { ok: false, error: 'Google redirect missing auth code.' };

    const { error: exchangeError } = await getSupabaseClient().auth.exchangeCodeForSession(code);
    if (exchangeError) return { ok: false, error: exchangeError.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
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
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

/**
 * Email + password sign-up. By default Supabase sends a confirmation email;
 * the user clicks the link and lands back in the app (or signs in manually).
 * The session is set only after confirmation in that default flow.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: 'Email is required.' };
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  try {
    const { error } = await getSupabaseClient().auth.signUp({
      email: trimmed,
      password,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

export async function signOut(): Promise<AuthOutcome> {
  try {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}
