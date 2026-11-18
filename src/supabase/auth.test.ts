import type { User } from '@supabase/supabase-js';

import {
  authErrorText,
  hasAppleIdentity,
  passwordMeetsRules,
  passwordRules,
  passwordRulesError,
  signInWithEmail,
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
