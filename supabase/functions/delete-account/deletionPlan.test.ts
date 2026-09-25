import {
  appleClientSecretClaims,
  classifyRevenueCat,
  parseRequest,
  planDeletion,
  readConfig,
  revenueCatCustomerUrl,
  type DeletionConfig,
} from './deletionPlan';

const FULL_ENV: Record<string, string> = {
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_SIWA_KEY_ID: 'KEY1234567',
  APPLE_SIWA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  APPLE_CLIENT_ID: 'com.calibrate.app',
  REVENUECAT_DELETE_KEY: 'sk_write',
  REVENUECAT_PROJECT_ID: 'projb27eccad',
};

const envFrom = (env: Record<string, string>) => (name: string) => env[name];

describe('readConfig', () => {
  it('turns on both legs when every secret is present', () => {
    const config = readConfig(envFrom(FULL_ENV));
    expect(config.apple).not.toBeNull();
    expect(config.revenuecat).toEqual({ apiKey: 'sk_write', projectId: 'projb27eccad' });
  });

  // A shell-set secret often carries literal "\n"; a PEM with those won't parse.
  it('restores newlines in the private key', () => {
    const config = readConfig(envFrom(FULL_ENV));
    expect(config.apple?.privateKey).toBe(
      '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    );
  });

  // Half-configured is off, not half-on. The core deletion must ship before
  // the $99 account (and so the Apple key) exists.
  it.each(['APPLE_TEAM_ID', 'APPLE_SIWA_KEY_ID', 'APPLE_SIWA_PRIVATE_KEY', 'APPLE_CLIENT_ID'])(
    'turns the Apple leg off when %s is missing',
    (missing) => {
      const env = { ...FULL_ENV, [missing]: '  ' };
      expect(readConfig(envFrom(env)).apple).toBeNull();
    },
  );

  it('turns the RevenueCat leg off without a write key', () => {
    const { REVENUECAT_DELETE_KEY: _drop, ...env } = FULL_ENV;
    expect(readConfig(envFrom(env)).revenuecat).toBeNull();
  });

  it('runs with no optional secrets at all', () => {
    expect(readConfig(() => undefined)).toEqual({ apple: null, revenuecat: null });
  });
});

describe('parseRequest', () => {
  it.each([null, undefined, {}, { apple_authorization_code: null }])(
    'accepts a request with no Apple code (%p)',
    (body) => {
      expect(parseRequest(body)).toEqual({ appleAuthorizationCode: null });
    },
  );

  it('takes a well-formed Apple code, trimmed', () => {
    expect(parseRequest({ apple_authorization_code: ' c1.abc ' })).toEqual({
      appleAuthorizationCode: 'c1.abc',
    });
  });

  it.each([
    ['a number', { apple_authorization_code: 42 }],
    ['an empty string', { apple_authorization_code: '   ' }],
    ['an oversized code', { apple_authorization_code: 'x'.repeat(1_001) }],
    ['an array body', []],
    ['a string body', 'delete me'],
  ])('rejects %s', (_label, body) => {
    expect(parseRequest(body)).toBeNull();
  });
});

describe('planDeletion', () => {
  const full: DeletionConfig = readConfig(envFrom(FULL_ENV));
  const none: DeletionConfig = { apple: null, revenuecat: null };

  it('runs every leg when configured and given a code', () => {
    expect(planDeletion(full, { appleAuthorizationCode: 'c' })).toEqual({
      revokeApple: true,
      deleteRevenueCat: true,
      skipped: [],
    });
  });

  it('skips Apple revocation without a code, and says why', () => {
    const plan = planDeletion(full, { appleAuthorizationCode: null });
    expect(plan.revokeApple).toBe(false);
    expect(plan.deleteRevenueCat).toBe(true);
    expect(plan.skipped).toEqual([expect.stringMatching(/^apple: no authorization code/)]);
  });

  it('skips Apple revocation without the key, even with a code', () => {
    const plan = planDeletion(
      { ...full, apple: null },
      { appleAuthorizationCode: 'c' },
    );
    expect(plan.revokeApple).toBe(false);
    expect(plan.skipped).toEqual([expect.stringMatching(/^apple: .*not configured/)]);
  });

  it('still plans a deletion with nothing optional configured', () => {
    const plan = planDeletion(none, { appleAuthorizationCode: 'c' });
    expect(plan).toMatchObject({ revokeApple: false, deleteRevenueCat: false });
    expect(plan.skipped).toHaveLength(2);
  });
});

describe('classifyRevenueCat', () => {
  it.each([
    [200, 'done'],
    [204, 'done'],
    // Never a customer (never opened the paywall), or already deleted.
    [404, 'already_gone'],
    [401, 'failed'],
    [403, 'failed'],
    [500, 'failed'],
  ] as const)('%i → %s', (status, outcome) => {
    expect(classifyRevenueCat(status)).toBe(outcome);
  });
});

describe('revenueCatCustomerUrl', () => {
  it('builds the v2 customer path, encoding both ids', () => {
    expect(revenueCatCustomerUrl('proj 1', 'a/b')).toBe(
      'https://api.revenuecat.com/v2/projects/proj%201/customers/a%2Fb',
    );
  });
});

describe('appleClientSecretClaims', () => {
  it('addresses Apple, names the team and the app, and expires quickly', () => {
    const config = readConfig(envFrom(FULL_ENV)).apple!;
    expect(appleClientSecretClaims(config, 1_000)).toEqual({
      iss: 'TEAM123456',
      iat: 1_000,
      exp: 1_300,
      aud: 'https://appleid.apple.com',
      sub: 'com.calibrate.app',
    });
  });
});
