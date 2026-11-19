// The system web sign-in sheet, which Google sign-in opens (step 192).
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

import {
  authErrorText,
  GOOGLE_REDIRECT_URL,
  GOOGLE_UNAVAILABLE,
  hasAppleIdentity,
  hasGoogleIdentity,
  passwordMeetsRules,
  passwordRules,
  passwordRulesError,
  readAuthRedirect,
  SIGN_OUT_FAILED,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signOutLocal,
  signUpWithEmail,
  WEAK_PASSWORD_TEXT,
} from './auth';
import { setSupabaseClientForTests } from './client';

function clientWithSignUp(result: { data: unknown; error: unknown }) {
  const signUp = jest.fn().mockResolvedValue(result);
  return {
    signUp,
    client: { auth: { signUp } } as unknown as Parameters<
      typeof setSupabaseClientForTests
    >[0],
  };
}

afterEach(() => setSupabaseClientForTests(null));

describe('signUpWithEmail', () => {
  // With "Confirm email" on, Supabase creates the user and returns no session.
  // Reporting that as a plain success would leave the screen waiting for a
  // sign-in that isn't coming.
  it('reports needsConfirmation when the account has no session yet', async () => {
    const { client } = clientWithSignUp({
      data: { user: { id: 'u1' }, session: null },
      error: null,
    });
    setSupabaseClientForTests(client);

    await expect(signUpWithEmail('a@b.co', 'Longenough1')).resolves.toEqual({
      ok: true,
      needsConfirmation: true,
    });
  });

  it('reports a signed-in account when confirmation is off', async () => {
    const { client } = clientWithSignUp({
      data: { user: { id: 'u1' }, session: { access_token: 't' } },
      error: null,
    });
    setSupabaseClientForTests(client);

    await expect(signUpWithEmail('a@b.co', 'Longenough1')).resolves.toEqual({
      ok: true,
      needsConfirmation: false,
    });
  });

  it('rejects a short password before calling the server', async () => {
    const { client, signUp } = clientWithSignUp({ data: null, error: null });
    setSupabaseClientForTests(client);

    const outcome = await signUpWithEmail('a@b.co', 'Short1');
    expect(outcome).toEqual({
      ok: false,
      error: 'Your password needs 8 or more characters.',
    });
    expect(signUp).not.toHaveBeenCalled();
  });

  // Step 190: the refusal names only what's missing, joined as a sentence.
  it.each([
    ['Longenough', 'Your password needs a number.'],
    ['longenough', 'Your password needs an uppercase letter and a number.'],
    ['LONGENOUGH', 'Your password needs a lowercase letter and a number.'],
    ['12345678', 'Your password needs an uppercase letter and a lowercase letter.'],
    ['short', 'Your password needs 8 or more characters, an uppercase letter and a number.'],
    [
      '',
      'Your password needs 8 or more characters, an uppercase letter, a lowercase letter and a number.',
    ],
    [
      '!!',
      'Your password needs 8 or more characters, an uppercase letter, a lowercase letter and a number.',
    ],
  ])('refuses %j before the server: %s', async (password, error) => {
    const { client, signUp } = clientWithSignUp({ data: null, error: null });
    setSupabaseClientForTests(client);

    await expect(signUpWithEmail('a@b.co', password)).resolves.toEqual({ ok: false, error });
    expect(signUp).not.toHaveBeenCalled();
  });

  it('sends a password that meets every rule, symbols and all', async () => {
    const { client, signUp } = clientWithSignUp({ data: { session: null }, error: null });
    setSupabaseClientForTests(client);

    await expect(signUpWithEmail('a@b.co', 'Pa55 wörd!')).resolves.toEqual({
      ok: true,
      needsConfirmation: true,
    });
    expect(signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'Pa55 wörd!' });
  });

  // Supabase's own check, once the owner turns on "Lowercase, uppercase
  // letters and digits": its text lists the alphabet, which reads as a bug.
  it("restates the rules when the server refuses the password as weak", async () => {
    const weak = Object.assign(
      new Error(
        'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.',
      ),
      { name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, reasons: ['characters'] },
    );
    const { client } = clientWithSignUp({ data: { user: null, session: null }, error: weak });
    setSupabaseClientForTests(client);

    await expect(signUpWithEmail('a@b.co', 'Longenough1')).resolves.toEqual({
      ok: false,
      error: WEAK_PASSWORD_TEXT,
    });
    expect(WEAK_PASSWORD_TEXT).toBe(
      "That password isn't strong enough. It needs 8 or more characters, an uppercase letter, a lowercase letter and a number.",
    );
  });

  it('knows the weak-password refusal by its code alone, and when thrown', async () => {
    const byCode = clientWithSignUp({
      data: null,
      error: { message: 'Password is too weak', code: 'weak_password' },
    });
    setSupabaseClientForTests(byCode.client);
    await expect(signUpWithEmail('a@b.co', 'Longenough1')).resolves.toEqual({
      ok: false,
      error: WEAK_PASSWORD_TEXT,
    });

    const signUp = jest.fn().mockRejectedValue(
      Object.assign(new Error('Password should be at least 10 characters.'), {
        name: 'AuthWeakPasswordError',
      }),
    );
    setSupabaseClientForTests({ auth: { signUp } } as unknown as Parameters<
      typeof setSupabaseClientForTests
    >[0]);
    await expect(signUpWithEmail('a@b.co', 'Longenough1')).resolves.toEqual({
      ok: false,
      error: WEAK_PASSWORD_TEXT,
    });
  });

  it("passes the server's other refusals through as before", async () => {
    const { client } = clientWithSignUp({
      data: null,
      error: { message: 'User already registered', code: 'user_already_exists' },
    });
    setSupabaseClientForTests(client);
    await expect(signUpWithEmail('a@b.co', 'Longenough1')).resolves.toEqual({
      ok: false,
      error: 'User already registered',
    });

    const offline = clientWithSignUp({ data: null, error: new Error('Failed to fetch') });
    setSupabaseClientForTests(offline.client);
    await expect(signUpWithEmail('a@b.co', 'Longenough1')).resolves.toEqual({
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    });
  });

  it('trims the email', async () => {
    const { client, signUp } = clientWithSignUp({
      data: { session: null },
      error: null,
    });
    setSupabaseClientForTests(client);

    await signUpWithEmail('  a@b.co ', 'Longenough1');
    expect(signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'Longenough1' });
  });
});

// Existing accounts keep working: the rules are Create account's alone.
describe('signInWithEmail', () => {
  it('sends a password that meets none of the new rules', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue({ data: {}, error: null });
    setSupabaseClientForTests({ auth: { signInWithPassword } } as unknown as Parameters<
      typeof setSupabaseClientForTests
    >[0]);

    await expect(signInWithEmail('a@b.co', 'hunter')).resolves.toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'hunter' });
  });
});

describe('passwordRules', () => {
  const none = { length: false, upper: false, lower: false, digit: false };

  it('meets nothing when empty', () => {
    expect(passwordRules('')).toEqual(none);
    expect(passwordMeetsRules('')).toBe(false);
  });

  it('checks each rule on its own', () => {
    expect(passwordRules('!!!!!!!!')).toEqual({ ...none, length: true });
    expect(passwordRules('A')).toEqual({ ...none, upper: true });
    expect(passwordRules('a')).toEqual({ ...none, lower: true });
    expect(passwordRules('7')).toEqual({ ...none, digit: true });
    expect(passwordRules('!!!!!!!')).toEqual(none);
  });

  it('is met by a password with all four', () => {
    expect(passwordRules('Abcdefg1')).toEqual({
      length: true,
      upper: true,
      lower: true,
      digit: true,
    });
    expect(passwordMeetsRules('Abcdefg1')).toBe(true);
    expect(passwordMeetsRules('Abcdef1')).toBe(false);
    expect(passwordMeetsRules('abcdefg1')).toBe(false);
    expect(passwordMeetsRules('ABCDEFG1')).toBe(false);
    expect(passwordMeetsRules('Abcdefgh')).toBe(false);
  });

  // ASCII on purpose: Supabase's "Lowercase, uppercase letters and digits"
  // counts only A-Z, a-z and 0-9, so a letter it wouldn't count isn't one here.
  it("doesn't count letters or digits outside ASCII", () => {
    expect(passwordRules('ÉÉÉÉÉÉÉÉ')).toEqual({ ...none, length: true });
    expect(passwordRules('ßßßßßßßß')).toEqual({ ...none, length: true });
    expect(passwordRules('１２３４５６７８')).toEqual({ ...none, length: true });
    expect(passwordMeetsRules('Éßcdefg１')).toBe(false);
    expect(passwordRulesError('Éßcdefg１')).toBe(
      'Your password needs an uppercase letter and a number.',
    );
  });

  it('has no refusal once every rule is met', () => {
    expect(passwordRulesError('Abcdefg1')).toBeNull();
  });
});

describe('authErrorText', () => {
  // Seen on the web build, 2026-10-04, with the Supabase project paused.
  it('turns an unreachable server into words a person can act on', () => {
    for (const raw of [
      'Failed to fetch',
      'Network request failed',
      'TypeError: fetch failed',
      'Load failed',
    ]) {
      expect(authErrorText(raw)).toBe(
        "Couldn't reach the server. Check your connection and try again.",
      );
    }
  });

  it("passes Supabase's own messages through", () => {
    expect(authErrorText('Invalid login credentials')).toBe('Invalid login credentials');
  });

  // The first device build, 2026-11-07, before the Apple provider was saved.
  it('points to email when a sign-in provider is off on the server', () => {
    for (const raw of [
      'Provider (issuer "https://appleid.apple.com") is not enabled',
      'Unsupported provider: provider is not enabled',
    ]) {
      expect(authErrorText(raw)).toBe(
        "This way of signing in isn't available right now. Sign in with your email instead.",
      );
    }
  });
});

// Account deletion revokes Sign in with Apple when this is true (ACCOUNT_SPEC
// §3.2 step 4). Policy audit, 2026-11-18: Supabase links an Apple identity
// with the same verified email into an email account, and
// app_metadata.provider keeps naming the first way in, so `provider` alone
// missed it.
describe('hasAppleIdentity', () => {
  /** Whatever a session might carry, typed or not. */
  const check = (value: unknown) => hasAppleIdentity(value as User);
  const identity = (provider: unknown) => ({
    id: 'sub',
    identity_id: 'identity',
    user_id: 'user-1',
    provider,
    identity_data: {},
  });

  it('is true from app_metadata.provider alone', () => {
    expect(check({ id: 'u', app_metadata: { provider: 'apple' } })).toBe(true);
  });

  it('is true from app_metadata.providers alone, for an email account linked to Apple', () => {
    expect(
      check({ id: 'u', app_metadata: { provider: 'email', providers: ['email', 'apple'] } }),
    ).toBe(true);
  });

  it('is true from user.identities alone', () => {
    expect(
      check({
        id: 'u',
        app_metadata: {},
        identities: [identity('email'), identity('apple')],
      }),
    ).toBe(true);
  });

  it('is true for a linked account with every signal present', () => {
    expect(
      check({
        id: 'u',
        app_metadata: { provider: 'email', providers: ['email', 'apple'] },
        identities: [identity('email'), identity('apple')],
      }),
    ).toBe(true);
  });

  it('is false for an email-only account', () => {
    expect(
      check({
        id: 'u',
        app_metadata: { provider: 'email', providers: ['email'] },
        identities: [identity('email')],
      }),
    ).toBe(false);
  });

  it('is false with no signal at all', () => {
    expect(check({ id: 'u', app_metadata: {} })).toBe(false);
    expect(check({ id: 'u', app_metadata: {}, identities: [] })).toBe(false);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'apple'],
    ['a number', 42],
    ['an array', ['apple']],
    ['a user with no app_metadata', { id: 'u' }],
    ['app_metadata null', { id: 'u', app_metadata: null }],
    ['app_metadata a string', { id: 'u', app_metadata: 'apple' }],
    ['provider not a string', { id: 'u', app_metadata: { provider: ['apple'] } }],
    ['providers a string, not a list', { id: 'u', app_metadata: { providers: 'apple' } }],
    ['providers holding no strings', { id: 'u', app_metadata: { providers: [null, 42, {}] } }],
    ['identities not a list', { id: 'u', app_metadata: {}, identities: { provider: 'apple' } }],
    ['identities a string', { id: 'u', app_metadata: {}, identities: 'apple' }],
    [
      'identities holding malformed entries',
      { id: 'u', app_metadata: {}, identities: [null, 'apple', 7, identity(42), identity(null)] },
    ],
  ])('is false, and never throws, for %s', (_label, value) => {
    expect(() => check(value)).not.toThrow();
    expect(check(value)).toBe(false);
  });

  it('still finds Apple when the other fields are malformed', () => {
    expect(
      check({ id: 'u', app_metadata: 'garbage', identities: [null, identity('apple')] }),
    ).toBe(true);
    expect(
      check({ id: 'u', app_metadata: { provider: 7, providers: [null, 'apple'] }, identities: 3 }),
    ).toBe(true);
  });
});

// Step 192: Google through the system sign-in sheet (iOS's
// ASWebAuthenticationSession), no Google SDK. jest-expo runs these as iOS.
describe('signInWithGoogle', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { Platform } = require('react-native') as typeof import('react-native');
  const openAuthSessionAsync = jest.requireMock('expo-web-browser')
    .openAuthSessionAsync as jest.Mock;
  /* eslint-enable @typescript-eslint/no-var-requires */

  const AUTH_URL =
    'https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=fairlysure%3A%2F%2Fgoogle-auth&code_challenge=c&code_challenge_method=s256&prompt=select_account';
  const CODE = '8f0e3c52-6d1e-4a1b-9a57-5d0b8c1f2e33';
  const CANCELLED = 'Sign-in cancelled.';
  const NO_CODE = "Google didn't return a sign-in code.";
  const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

  let signInWithOAuth: jest.Mock;
  let exchangeCodeForSession: jest.Mock;
  let consoleSpies: jest.SpyInstance[] = [];

  /** The sheet ends on this redirect, as iOS hands it back. */
  const returns = (url: string) => openAuthSessionAsync.mockResolvedValue({ type: 'success', url });
  const failedExchange = (error: unknown) =>
    exchangeCodeForSession.mockResolvedValue({ data: { session: null, user: null }, error });

  beforeEach(() => {
    openAuthSessionAsync.mockReset();
    signInWithOAuth = jest
      .fn()
      .mockResolvedValue({ data: { provider: 'google', url: AUTH_URL }, error: null });
    exchangeCodeForSession = jest.fn().mockResolvedValue({
      data: { session: { access_token: 'access' }, user: { id: 'u' } },
      error: null,
    });
    setSupabaseClientForTests({
      auth: { signInWithOAuth, exchangeCodeForSession },
    } as unknown as Parameters<typeof setSupabaseClientForTests>[0]);
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
  });

  // Every case below, success and failure alike: nothing is logged, so the
  // sign-in address, the code and any token never reach a log.
  afterEach(() => {
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("opens the system sheet on Supabase's Google address and exchanges the code it returns", async () => {
    returns(`${GOOGLE_REDIRECT_URL}?code=${CODE}`);

    await expect(signInWithGoogle()).resolves.toEqual({ ok: true });

    expect(GOOGLE_REDIRECT_URL).toBe('fairlysure://google-auth');
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'fairlysure://google-auth',
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    // No scopes beyond Supabase's own.
    expect(signInWithOAuth.mock.calls[0][0].options).not.toHaveProperty('scopes');
    // The default sheet, not an ephemeral one: no options at all.
    expect(openAuthSessionAsync.mock.calls).toEqual([[AUTH_URL, 'fairlysure://google-auth']]);
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith(CODE);
  });

  it('reads a code from the fragment too', async () => {
    returns(`${GOOGLE_REDIRECT_URL}#code=${CODE}`);

    await expect(signInWithGoogle()).resolves.toEqual({ ok: true });
    expect(exchangeCodeForSession).toHaveBeenCalledWith(CODE);
  });

  it.each(['cancel', 'dismiss'])(
    'says the sign-in was cancelled when the sheet ends with %s',
    async (type) => {
      openAuthSessionAsync.mockResolvedValue({ type });

      await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: CANCELLED });
      expect(exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );

  it("reads a sheet that couldn't open as unavailable", async () => {
    openAuthSessionAsync.mockResolvedValue({ type: 'locked' });

    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it.each([
    [
      'in the query',
      `${GOOGLE_REDIRECT_URL}?error=server_error&error_description=Unable+to+exchange+external+code%3A+4%2F0Ab`,
    ],
    [
      'in the fragment',
      `${GOOGLE_REDIRECT_URL}#error=server_error&error_description=Unable+to+exchange+external+code`,
    ],
    [
      'in both, as Supabase sends it',
      `${GOOGLE_REDIRECT_URL}?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user`,
    ],
  ])("reads an error %s as not the person's doing", async (_where, url) => {
    returns(url);

    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  // If the provider is ever switched off on the project while the flag is on.
  it('says Google sign-in is unavailable when the provider is not enabled', async () => {
    expect(GOOGLE_UNAVAILABLE).toBe("Google sign-in isn't available right now.");

    returns(
      `${GOOGLE_REDIRECT_URL}?error=invalid_request&error_code=validation_failed&error_description=Unsupported+provider%3A+provider+is+not+enabled`,
    );
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });

    signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'Unsupported provider: provider is not enabled', code: 'validation_failed' },
    });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });
  });

  // Supabase passes Google's own refusal through with no code of its own.
  it("reads Cancel on Google's page as a cancelled sign-in", async () => {
    returns(`${GOOGLE_REDIRECT_URL}?error=access_denied#error=access_denied`);

    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: CANCELLED });
  });

  it('passes on a reason written for the person', async () => {
    returns(
      `${GOOGLE_REDIRECT_URL}?error=access_denied&error_code=user_banned&error_description=User+is+banned`,
    );
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: 'User is banned' });

    returns(
      `${GOOGLE_REDIRECT_URL}?error=access_denied&error_code=provider_email_needs_verification&error_description=Unverified+email+with+google.+A+confirmation+email+has+been+sent+to+your+google+email`,
    );
    await expect(signInWithGoogle()).resolves.toEqual({
      ok: false,
      error: 'Unverified email with google. A confirmation email has been sent to your google email',
    });
  });

  it("reads closed sign-ups, the project's setting, as unavailable", async () => {
    returns(
      `${GOOGLE_REDIRECT_URL}?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance`,
    );

    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });
  });

  it('prefers an error to a code that came with it', async () => {
    returns(`${GOOGLE_REDIRECT_URL}?code=${CODE}&error=server_error`);

    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('says so when Google returns neither a code nor an error', async () => {
    returns(GOOGLE_REDIRECT_URL);
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: NO_CODE });

    returns(`${GOOGLE_REDIRECT_URL}?code=&state=x`);
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: NO_CODE });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('reports a failed exchange in plain words', async () => {
    returns(`${GOOGLE_REDIRECT_URL}?code=${CODE}`);

    failedExchange({ message: 'invalid flow state, no valid flow state found', code: 'flow_state_not_found' });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });

    // Supabase's text for a lost verifier is written for developers.
    failedExchange(
      Object.assign(
        new Error(
          'PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared.',
        ),
        { code: 'pkce_code_verifier_not_found' },
      ),
    );
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });

    failedExchange(new Error('Failed to fetch'));
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: OFFLINE });
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(3);
  });

  it("opens no sheet when Supabase can't build the address", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: new Error('Network request failed'),
    });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: OFFLINE });

    signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'Something unexpected happened', code: 'unexpected_failure' },
    });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });

    // No error and no address either.
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: null });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });

    expect(openAuthSessionAsync).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('never throws: a thrown error becomes plain words', async () => {
    openAuthSessionAsync.mockRejectedValue(new Error('ERR_WEB_BROWSER: the native module failed'));
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });

    returns(`${GOOGLE_REDIRECT_URL}?code=${CODE}`);
    exchangeCodeForSession.mockRejectedValue('not even an Error');
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });

    signInWithOAuth.mockRejectedValue(new TypeError('Network request failed'));
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: OFFLINE });
  });

  // Service down at its most basic: a build with no Supabase settings. The
  // client's own error ("Supabase credentials missing…") is a developer's.
  it('reads a build without Supabase as unavailable', async () => {
    setSupabaseClientForTests(null);

    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it.each(['android', 'web'] as const)('is iOS only: on %s it calls nothing', async (os) => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    try {
      await expect(signInWithGoogle()).resolves.toEqual({
        ok: false,
        error: 'Google sign-in is only available on iOS.',
      });
      expect(signInWithOAuth).not.toHaveBeenCalled();
      expect(openAuthSessionAsync).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });

  // The code is a one-time credential: no failure's words carry it, or the
  // address it came with.
  it('keeps the code and the address out of every message it returns', async () => {
    const failures = [
      `${GOOGLE_REDIRECT_URL}?code=${CODE}&error=server_error&error_description=bad+${CODE}`,
      `${GOOGLE_REDIRECT_URL}#code=${CODE}&error=invalid_request&error_code=bad_oauth_state`,
    ];
    for (const url of failures) {
      returns(url);
      const outcome = await signInWithGoogle();
      expect(outcome.ok).toBe(false);
      const words = outcome.ok ? '' : outcome.error;
      expect(words).not.toContain(CODE);
      expect(words).not.toContain('fairlysure://');
      expect(words).not.toContain(AUTH_URL);
    }
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe('readAuthRedirect', () => {
  const none = { code: null, error: null, errorCode: null, errorDescription: null };

  it('reads the query, then the fragment, and decodes both', () => {
    expect(readAuthRedirect('fairlysure://google-auth?code=abc')).toEqual({ ...none, code: 'abc' });
    expect(
      readAuthRedirect(
        'fairlysure://google-auth#error=access_denied&error_code=x_y&error_description=The+user+said%20no',
      ),
    ).toEqual({ ...none, error: 'access_denied', errorCode: 'x_y', errorDescription: 'The user said no' });
    expect(readAuthRedirect('fairlysure://google-auth?code=q#code=f').code).toBe('q');
    // An empty value is no value: the fragment's is read instead.
    expect(readAuthRedirect('fairlysure://google-auth?code=#code=f').code).toBe('f');
    // The first of a repeated key wins.
    expect(readAuthRedirect('fairlysure://google-auth?code=1&code=2').code).toBe('1');
  });

  it('never throws on a malformed address', () => {
    expect(readAuthRedirect('')).toEqual(none);
    expect(readAuthRedirect('fairlysure://google-auth')).toEqual(none);
    expect(readAuthRedirect('fairlysure://google-auth?error=%E0%A4%A&code').error).toBe('%E0%A4%A');
    expect(readAuthRedirect('fairlysure://google-auth?error=%E0%A4%A&code').code).toBeNull();
    expect(readAuthRedirect('fairlysure://google-auth?constructor=x&__proto__=y&toString=z')).toEqual(
      none,
    );
  });
});

// Account deletion tells an account with a Google identity how to remove the
// app from its Google Account (DeleteAccountView). The same three signals and
// the same tolerance as hasAppleIdentity.
describe('hasGoogleIdentity', () => {
  /** Whatever a session might carry, typed or not. */
  const check = (value: unknown) => hasGoogleIdentity(value as User);
  const identity = (provider: unknown) => ({
    id: 'sub',
    identity_id: 'identity',
    user_id: 'user-1',
    provider,
    identity_data: {},
  });

  it('is true from app_metadata.provider alone', () => {
    expect(check({ id: 'u', app_metadata: { provider: 'google' } })).toBe(true);
  });

  it('is true from app_metadata.providers alone, for an email account linked to Google', () => {
    expect(
      check({ id: 'u', app_metadata: { provider: 'email', providers: ['email', 'google'] } }),
    ).toBe(true);
  });

  it('is true from user.identities alone', () => {
    expect(
      check({ id: 'u', app_metadata: {}, identities: [identity('email'), identity('google')] }),
    ).toBe(true);
  });

  it('is true for an Apple account linked to Google, with every signal present', () => {
    expect(
      check({
        id: 'u',
        app_metadata: { provider: 'apple', providers: ['apple', 'google'] },
        identities: [identity('apple'), identity('google')],
      }),
    ).toBe(true);
  });

  it('is false for an email-only account and for an Apple-only one', () => {
    expect(
      check({
        id: 'u',
        app_metadata: { provider: 'email', providers: ['email'] },
        identities: [identity('email')],
      }),
    ).toBe(false);
    expect(
      check({
        id: 'u',
        app_metadata: { provider: 'apple', providers: ['apple'] },
        identities: [identity('apple')],
      }),
    ).toBe(false);
  });

  it('is false with no signal at all', () => {
    expect(check({ id: 'u', app_metadata: {} })).toBe(false);
    expect(check({ id: 'u', app_metadata: {}, identities: [] })).toBe(false);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'google'],
    ['a number', 42],
    ['an array', ['google']],
    ['a user with no app_metadata', { id: 'u' }],
    ['app_metadata null', { id: 'u', app_metadata: null }],
    ['app_metadata a string', { id: 'u', app_metadata: 'google' }],
    ['provider not a string', { id: 'u', app_metadata: { provider: ['google'] } }],
    ['providers a string, not a list', { id: 'u', app_metadata: { providers: 'google' } }],
    ['providers holding no strings', { id: 'u', app_metadata: { providers: [null, 42, {}] } }],
    ['identities not a list', { id: 'u', app_metadata: {}, identities: { provider: 'google' } }],
    ['identities a string', { id: 'u', app_metadata: {}, identities: 'google' }],
    [
      'identities holding malformed entries',
      { id: 'u', app_metadata: {}, identities: [null, 'google', 7, identity(42), identity(null)] },
    ],
  ])('is false, and never throws, for %s', (_label, value) => {
    expect(() => check(value)).not.toThrow();
    expect(check(value)).toBe(false);
  });

  it('still finds Google when the other fields are malformed', () => {
    expect(
      check({ id: 'u', app_metadata: 'garbage', identities: [null, identity('google')] }),
    ).toBe(true);
    expect(
      check({ id: 'u', app_metadata: { provider: 7, providers: [null, 'google'] }, identities: 3 }),
    ).toBe(true);
  });

  it('keeps Apple and Google apart', () => {
    const googleOnly = {
      id: 'u',
      app_metadata: { provider: 'google', providers: ['google'] },
      identities: [identity('google')],
    };
    expect(hasGoogleIdentity(googleOnly as unknown as User)).toBe(true);
    expect(hasAppleIdentity(googleOnly as unknown as User)).toBe(false);
  });
});

// App Review 5.1.1(v) and the privacy policy: a provider's own tokens stay on
// the device. Supabase may keep Google's access token in the session after a
// Google sign-in; no app code reads it, so none sends it anywhere.
describe("a sign-in provider's own tokens", () => {
  it('are read nowhere in the app', () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { readdirSync, readFileSync, statSync } = require('fs') as typeof import('fs');
    const { join, relative } = require('path') as typeof import('path');
    /* eslint-enable @typescript-eslint/no-var-requires */
    const root = join(__dirname, '..', '..');
    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
      });
    const field = new RegExp(['provider', '(refresh_)?token'].join('_'));
    const readers = [...sources(join(root, 'src')), ...sources(join(root, 'app'))]
      .filter((file) => field.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));
    expect(readers).toEqual([]);
  });
});

// Security review, 2026-11-18: auth-js 2.106 POSTs /logout for every scope
// and keeps the stored session when that fails, so a sign-out with no
// connection did nothing. The phone now always ends it.
describe('signOut and signOutLocal', () => {
  const KEY = 'sb-project-auth-token';

  /** A client whose storage holds a session under KEY. */
  function fakeAuthClient(opts: {
    signOutError?: unknown;
    signOutThrows?: boolean;
    signOutHangs?: boolean;
    /** What getSession reads back after the clear, in turn; the last repeats. */
    readBack?: Array<'none' | 'session'>;
    removeThrows?: boolean;
    noStorageKey?: boolean;
  } = {}) {
    const store = new Map<string, string>([
      [KEY, '{"access_token":"a","refresh_token":"r"}'],
      [`${KEY}-code-verifier`, 'v'],
      [`${KEY}-user`, '{}'],
      ['calibrate:settings', '{}'],
    ]);
    const removed: string[] = [];
    const readBack = [...(opts.readBack ?? ['none'])];
    const signOut = jest.fn((_options?: { scope: string }) => {
      if (opts.signOutHangs) return new Promise(() => {});
      if (opts.signOutThrows) return Promise.reject(new Error('boom'));
      if (opts.signOutError) return Promise.resolve({ error: opts.signOutError });
      // What auth-js does on success: the stored session goes.
      store.delete(KEY);
      return Promise.resolve({ error: null });
    });
    const getSession = jest.fn(async () => {
      const next = readBack.length > 1 ? readBack.shift()! : readBack[0];
      if (next === 'session') store.set(KEY, '{"access_token":"b"}');
      return { data: { session: store.has(KEY) ? { access_token: 'b' } : null }, error: null };
    });
    const auth = {
      signOut,
      getSession,
      storageKey: opts.noStorageKey ? undefined : KEY,
      storage: {
        removeItem: async (key: string) => {
          if (opts.removeThrows) throw new Error('storage');
          removed.push(key);
          store.delete(key);
        },
      },
    };
    setSupabaseClientForTests({ auth } as unknown as Parameters<typeof setSupabaseClientForTests>[0]);
    return { store, removed, signOut, getSession };
  }

  const offline = () => new AuthRetryableFetchError('Network request failed', 0);

  it('online: signs out everywhere, through Supabase, and touches no storage itself', async () => {
    const { removed, signOut: supabaseSignOut } = fakeAuthClient();
    await expect(signOut()).resolves.toEqual({ ok: true });
    expect(supabaseSignOut).toHaveBeenCalledWith();
    expect(removed).toEqual([]);
  });

  it('after deletion: signs out on this phone, through Supabase', async () => {
    const { signOut: supabaseSignOut } = fakeAuthClient();
    await expect(signOutLocal()).resolves.toEqual({ ok: true });
    expect(supabaseSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each([
    ['signOut', () => signOut()],
    ['signOutLocal', () => signOutLocal()],
  ])('%s offline: removes the stored session here, and says only this phone heard', async (_label, run) => {
    const { store, removed } = fakeAuthClient({ signOutError: offline() });
    await expect(run()).resolves.toEqual({ ok: true, localOnly: true });
    // The keys auth-js's own sign-out removes, and nothing else.
    expect(removed).toEqual([KEY, `${KEY}-code-verifier`, `${KEY}-user`]);
    expect(store.has('calibrate:settings')).toBe(true);
  });

  it('ends it here too when Supabase throws, or refuses for another reason', async () => {
    fakeAuthClient({ signOutThrows: true });
    await expect(signOut()).resolves.toEqual({ ok: true, localOnly: true });
    fakeAuthClient({ signOutError: new AuthApiError('rate limited', 429, 'over_request_rate_limit') });
    await expect(signOut()).resolves.toEqual({ ok: true, localOnly: true });
  });

  it('removes it again when a token refresh in flight wrote it back', async () => {
    const { removed } = fakeAuthClient({ signOutError: offline(), readBack: ['session', 'none'] });
    await expect(signOut()).resolves.toEqual({ ok: true, localOnly: true });
    expect(removed.filter((k) => k === KEY)).toHaveLength(2);
  });

  it('says it failed when the session keeps coming back', async () => {
    fakeAuthClient({ signOutError: offline(), readBack: ['session'] });
    await expect(signOut()).resolves.toEqual({ ok: false, error: SIGN_OUT_FAILED });
  });

  it('says it failed when the stored session cannot be removed', async () => {
    fakeAuthClient({ signOutError: offline(), removeThrows: true });
    await expect(signOut()).resolves.toEqual({ ok: false, error: SIGN_OUT_FAILED });
    fakeAuthClient({ signOutError: offline(), noStorageKey: true });
    await expect(signOut()).resolves.toEqual({ ok: false, error: SIGN_OUT_FAILED });
  });

  it('does not wait forever on a sign-out the network never answers', async () => {
    jest.useFakeTimers();
    try {
      const { removed } = fakeAuthClient({ signOutHangs: true });
      const outcome = signOut();
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(outcome).resolves.toEqual({ ok: true, localOnly: true });
      expect(removed).toContain(KEY);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reads a build without Supabase as a failure, as before', async () => {
    setSupabaseClientForTests(null);
    const outcome = await signOut();
    expect(outcome.ok).toBe(false);
  });
});
