// Sign in with Apple's replay guard (security review round 5, 2026-11-19):
// a fresh nonce per sign-in, its SHA-256 (lowercase hex) to Apple, the raw
// value to Supabase, which hashes it and compares it with the identity
// token's `nonce` claim. Apple's sheet and expo-crypto are mocked; the hash
// is checked against Node's own SHA-256.

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  getRandomBytesAsync: jest.fn(),
  getRandomBytes: jest.fn(),
  digestStringAsync: jest.fn(),
}));

import { createHash, randomBytes } from 'crypto';

import {
  APPLE_UNAVAILABLE,
  makeAppleNonce,
  reauthenticateWithApple,
  signInWithApple,
} from './auth';
import { setSupabaseClientForTests } from './client';

const apple = jest.requireMock('expo-apple-authentication') as { signInAsync: jest.Mock };
const crypto = jest.requireMock('expo-crypto') as {
  getRandomBytesAsync: jest.Mock;
  getRandomBytes: jest.Mock;
  digestStringAsync: jest.Mock;
};

const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

let signInWithIdToken: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  crypto.getRandomBytesAsync.mockImplementation(async (n: number) => new Uint8Array(randomBytes(n)));
  crypto.digestStringAsync.mockImplementation(async (_alg: string, data: string) => sha256Hex(data));
  apple.signInAsync.mockResolvedValue({
    identityToken: 'apple.id.token',
    authorizationCode: 'c1.code',
  });
  signInWithIdToken = jest.fn().mockResolvedValue({ data: {}, error: null });
  setSupabaseClientForTests({ auth: { signInWithIdToken } } as unknown as Parameters<
    typeof setSupabaseClientForTests
  >[0]);
});

afterEach(() => setSupabaseClientForTests(null));

describe('makeAppleNonce', () => {
  it('is 32 random bytes as hex, with its SHA-256 as lowercase hex', async () => {
    const { raw, hashed } = await makeAppleNonce();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).toBe(sha256Hex(raw));
    expect(crypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
    expect(crypto.digestStringAsync).toHaveBeenCalledWith('SHA-256', raw, { encoding: 'hex' });
    // Not the synchronous call, which can fall back to Math.random in a development build.
    expect(crypto.getRandomBytes).not.toHaveBeenCalled();
  });

  it('lowercases a digest given in capitals', async () => {
    crypto.digestStringAsync.mockImplementation(async (_a: string, data: string) =>
      sha256Hex(data).toUpperCase(),
    );
    const { raw, hashed } = await makeAppleNonce();
    expect(hashed).toBe(sha256Hex(raw));
  });

  it.each([
    ['no random bytes (a stub)', () => crypto.getRandomBytesAsync.mockResolvedValue(new Uint8Array(32))],
    ['too few bytes', () => crypto.getRandomBytesAsync.mockResolvedValue(new Uint8Array(randomBytes(8)))],
    ['an empty digest (a stub)', () => crypto.digestStringAsync.mockResolvedValue('')],
    ['a digest that is not SHA-256 hex', () => crypto.digestStringAsync.mockResolvedValue('abc123')],
    ['the module missing', () => crypto.getRandomBytesAsync.mockRejectedValue(new Error('no native module'))],
  ])('refuses %s', async (_label, arrange) => {
    arrange();
    await expect(makeAppleNonce()).rejects.toThrow();
  });
});

describe('signInWithApple', () => {
  it("sends the nonce's SHA-256 to Apple and the raw nonce to Supabase", async () => {
    await expect(signInWithApple()).resolves.toEqual({ ok: true });

    const toApple = apple.signInAsync.mock.calls[0][0] as { nonce: string; requestedScopes: number[] };
    const toSupabase = signInWithIdToken.mock.calls[0][0] as {
      provider: string;
      token: string;
      nonce: string;
    };
    expect(toSupabase.provider).toBe('apple');
    expect(toSupabase.token).toBe('apple.id.token');
    expect(toSupabase.nonce).toMatch(/^[0-9a-f]{64}$/);
    // What Supabase checks: sha256(raw nonce), lowercase hex, equals the
    // claim, which is what Apple was given.
    expect(toApple.nonce).toBe(sha256Hex(toSupabase.nonce));
    expect(toApple.nonce).not.toBe(toSupabase.nonce);
    // The email only, as before.
    expect(toApple.requestedScopes).toEqual([1]);
  });

  it('uses a fresh nonce for every sign-in', async () => {
    await signInWithApple();
    await signInWithApple();
    const [first, second] = signInWithIdToken.mock.calls.map((c) => (c[0] as { nonce: string }).nonce);
    expect(first).not.toBe(second);
  });

  it('opens no sheet and signs no one in when a nonce cannot be made', async () => {
    crypto.getRandomBytesAsync.mockRejectedValue(new Error('no native module'));
    await expect(signInWithApple()).resolves.toEqual({ ok: false, error: APPLE_UNAVAILABLE });
    expect(apple.signInAsync).not.toHaveBeenCalled();
    expect(signInWithIdToken).not.toHaveBeenCalled();
    expect(APPLE_UNAVAILABLE).toBe("Sign in with Apple isn't available right now.");
  });

  it('still reads a closed sheet as cancelled', async () => {
    // The thrown message carries the code, as signInWithApple reads it.
    apple.signInAsync.mockRejectedValue(new Error('ERR_REQUEST_CANCELED'));
    await expect(signInWithApple()).resolves.toEqual({ ok: false, error: 'Sign-in cancelled.' });
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("passes Supabase's refusal of the nonce through as its message", async () => {
    signInWithIdToken.mockResolvedValue({
      data: {},
      error: { message: 'Nonces mismatch' },
    });
    await expect(signInWithApple()).resolves.toEqual({ ok: false, error: 'Nonces mismatch' });
  });
});

describe('reauthenticateWithApple (account deletion)', () => {
  it("asks Apple with a nonce's SHA-256, and returns the code", async () => {
    await expect(reauthenticateWithApple()).resolves.toBe('c1.code');
    const toApple = apple.signInAsync.mock.calls[0][0] as { nonce: string; requestedScopes: unknown[] };
    expect(toApple.requestedScopes).toEqual([]);
    expect(toApple.nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it('still opens the sheet without a nonce when one cannot be made, so the grant can be revoked', async () => {
    crypto.getRandomBytesAsync.mockRejectedValue(new Error('no native module'));
    await expect(reauthenticateWithApple()).resolves.toBe('c1.code');
    expect(apple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [] });
  });

  it('is null when the sheet is declined', async () => {
    apple.signInAsync.mockRejectedValue(new Error('ERR_REQUEST_CANCELED'));
    await expect(reauthenticateWithApple()).resolves.toBeNull();
  });
});
