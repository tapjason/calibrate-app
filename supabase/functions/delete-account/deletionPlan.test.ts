import {
  APPLE_SKIPPED,
  LEG_DEADLINE_MS,
  REVENUECAT_SKIPPED,
  appleClientSecretClaims,
  appleSubjectsFromIdentities,
  checkAppleSubject,
  classifyRevenueCat,
  decodeJwtPayload,
  parseRequest,
  planDeletion,
  readConfig,
  revenueCatCustomerUrl,
  runAppleLeg,
  runDeletion,
  type AppleLegDeps,
  type AppleTokens,
  type DeletionConfig,
} from './deletionPlan';

const FULL_ENV: Record<string, string> = {
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_SIWA_KEY_ID: 'KEY1234567',
  APPLE_SIWA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  APPLE_CLIENT_ID: 'app.fairlysure',
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
      sub: 'app.fairlysure',
    });
  });
});

// ---------------------------------------------------------------------------
// Security review, 2026-11-18: the Apple leg revokes only the account's own
// grant, and the two best-effort legs run at once with the user deleted last.
// ---------------------------------------------------------------------------

const ACCOUNT_SUB = '001234.0a1b2c3d4e5f60718293a4b5c6d7e8f9.1234';
const OTHER_SUB = '009876.ffeeddccbbaa99887766554433221100.4321';
const REFRESH = 'r_refresh_token_value';
const ACCESS = 'a_access_token_value';

/** An unsigned JWT with this payload, shaped like Apple's id_token. */
function jwt(payload: unknown): string {
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${part({ alg: 'RS256', kid: 'k' })}.${part(payload)}.c2lnbmF0dXJl`;
}

const appleIdentity = (sub: string) => ({
  identity_id: '7f9c2a1e-0000-4000-8000-000000000001',
  id: sub,
  user_id: '11111111-2222-3333-4444-555555555555',
  provider: 'apple',
  identity_data: {
    sub,
    provider_id: sub,
    email: 'x@privaterelay.appleid.com',
    iss: 'https://appleid.apple.com',
  },
});
const emailIdentity = {
  identity_id: '7f9c2a1e-0000-4000-8000-000000000002',
  id: '11111111-2222-3333-4444-555555555555',
  provider: 'email',
  identity_data: { sub: '11111111-2222-3333-4444-555555555555', email: 'x@example.com' },
};

describe('decodeJwtPayload', () => {
  it('reads the payload of a well-formed token', () => {
    expect(decodeJwtPayload(jwt({ sub: ACCOUNT_SUB, aud: 'app.fairlysure' }))).toEqual({
      sub: ACCOUNT_SUB,
      aud: 'app.fairlysure',
    });
  });

  it('decodes UTF-8 in the payload', () => {
    expect(decodeJwtPayload(jwt({ sub: 's', name: 'Zoë 東京' }))?.name).toBe(
      'Zoë 東京',
    );
  });

  it.each([
    ['not a string', 42],
    ['two parts', 'a.b'],
    ['an empty payload', 'a..c'],
    ['a payload that is not base64', 'a.@@@.c'],
    ['a payload that is not JSON', `a.${Buffer.from('not json').toString('base64url')}.c`],
    ['a payload that is an array', jwt(['sub'])],
    ['a payload that is a string', jwt('sub')],
    ['a token far too long', `a.${'A'.repeat(20_000)}.c`],
  ])('is null for %s', (_label, token) => {
    expect(decodeJwtPayload(token)).toBeNull();
  });
});

describe('appleSubjectsFromIdentities', () => {
  it('reads the Apple identity and nothing else', () => {
    expect(appleSubjectsFromIdentities([emailIdentity, appleIdentity(ACCOUNT_SUB)])).toEqual([
      ACCOUNT_SUB,
    ]);
  });

  it('reads identity_data.sub when the identity id is missing', () => {
    const { id: _drop, ...noId } = appleIdentity(ACCOUNT_SUB);
    expect(appleSubjectsFromIdentities([noId])).toEqual([ACCOUNT_SUB]);
  });

  it.each([
    ['no identities', []],
    ['only email and Google', [emailIdentity, { provider: 'google', id: '1234567890' }]],
    ['not an array', { provider: 'apple', id: ACCOUNT_SUB }],
    ['null', null],
    ['junk entries', [null, 'apple', { provider: 'apple', id: '   ' }]],
  ])('is empty for %s', (_label, identities) => {
    expect(appleSubjectsFromIdentities(identities)).toEqual([]);
  });
});

describe('checkAppleSubject', () => {
  it("revokes when the id_token's sub is the account's", () => {
    expect(checkAppleSubject(jwt({ sub: ACCOUNT_SUB }), [ACCOUNT_SUB])).toEqual({ revoke: true });
  });

  it('does not revoke for another Apple ID', () => {
    expect(checkAppleSubject(jwt({ sub: OTHER_SUB }), [ACCOUNT_SUB])).toEqual({
      revoke: false,
      skipped: APPLE_SKIPPED.otherAppleId,
    });
  });

  it('compares exactly, case included', () => {
    const upper = jwt({ sub: ACCOUNT_SUB.toUpperCase() });
    expect(checkAppleSubject(upper, [ACCOUNT_SUB]).revoke).toBe(false);
  });

  it.each([
    ['no id_token', undefined],
    ['an unreadable id_token', 'garbage'],
    ['no sub', jwt({ aud: 'app.fairlysure' })],
    ['a sub that is not a string', jwt({ sub: 12345 })],
  ])('does not revoke with %s', (_label, idToken) => {
    expect(checkAppleSubject(idToken, [ACCOUNT_SUB])).toEqual({
      revoke: false,
      skipped: APPLE_SKIPPED.noSubject,
    });
  });

  it('does not revoke for an account with no Apple identity', () => {
    expect(checkAppleSubject(jwt({ sub: ACCOUNT_SUB }), [])).toEqual({
      revoke: false,
      skipped: APPLE_SKIPPED.noIdentity,
    });
  });
});

describe('runAppleLeg', () => {
  function leg(over: Partial<AppleLegDeps> = {}, tokens: AppleTokens = {}) {
    const messages: string[] = [];
    const deps = {
      readIdentities: jest.fn(
        async (): Promise<unknown> => [emailIdentity, appleIdentity(ACCOUNT_SUB)],
      ),
      exchangeCode: jest.fn(
        async (): Promise<AppleTokens> => ({
          refresh_token: REFRESH,
          access_token: ACCESS,
          id_token: jwt({ sub: ACCOUNT_SUB }),
          ...tokens,
        }),
      ),
      revokeToken: jest.fn(
        async (_token: string, _hint: 'refresh_token' | 'access_token'): Promise<void> => undefined,
      ),
      log: (m: string) => {
        messages.push(m);
      },
      ...over,
    };
    return { deps, messages };
  }

  it("revokes the refresh token when the code is the account's own Apple ID", async () => {
    const { deps } = leg();
    await expect(runAppleLeg(deps)).resolves.toEqual([]);
    expect(deps.revokeToken).toHaveBeenCalledWith(REFRESH, 'refresh_token');
  });

  it('falls back to the access token when Apple returns no refresh token', async () => {
    const { deps } = leg({}, { refresh_token: undefined });
    await expect(runAppleLeg(deps)).resolves.toEqual([]);
    expect(deps.revokeToken).toHaveBeenCalledWith(ACCESS, 'access_token');
  });

  // The phone is signed into a different Apple ID than the one linked to the
  // account: revoking would end that other Apple ID's grant.
  it('revokes nothing for a different Apple ID, and logs no identifier', async () => {
    const { deps, messages } = leg({}, { id_token: jwt({ sub: OTHER_SUB }) });
    await expect(runAppleLeg(deps)).resolves.toEqual([APPLE_SKIPPED.otherAppleId]);
    expect(deps.exchangeCode).toHaveBeenCalledTimes(1);
    expect(deps.revokeToken).not.toHaveBeenCalled();
    expect(messages.length).toBeGreaterThan(0);
    const logged = messages.join('\n');
    for (const secret of [ACCOUNT_SUB, OTHER_SUB, REFRESH, ACCESS]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('never sends the code to Apple for an account with no Apple identity', async () => {
    const { deps } = leg({ readIdentities: jest.fn(async (): Promise<unknown> => [emailIdentity]) });
    await expect(runAppleLeg(deps)).resolves.toEqual([APPLE_SKIPPED.noIdentity]);
    expect(deps.exchangeCode).not.toHaveBeenCalled();
    expect(deps.revokeToken).not.toHaveBeenCalled();
  });

  it("revokes nothing when the identities can't be read", async () => {
    const { deps } = leg({
      readIdentities: jest.fn(async (): Promise<unknown> => {
        throw new Error('getUserById failed');
      }),
    });
    await expect(runAppleLeg(deps)).resolves.toEqual([APPLE_SKIPPED.identitiesUnread]);
    expect(deps.exchangeCode).not.toHaveBeenCalled();
  });

  it('revokes nothing when Apple returns no id_token', async () => {
    const { deps } = leg({}, { id_token: undefined });
    await expect(runAppleLeg(deps)).resolves.toEqual([APPLE_SKIPPED.noSubject]);
    expect(deps.revokeToken).not.toHaveBeenCalled();
  });

  it('reports a failed revocation when the exchange fails', async () => {
    const { deps } = leg({
      exchangeCode: jest.fn(async (): Promise<AppleTokens> => {
        throw new Error('apple token exchange: HTTP 400');
      }),
    });
    await expect(runAppleLeg(deps)).resolves.toEqual([APPLE_SKIPPED.failed]);
    expect(deps.revokeToken).not.toHaveBeenCalled();
  });

  it('reports a failed revocation when the revoke fails', async () => {
    const { deps } = leg({
      revokeToken: jest.fn(async (): Promise<void> => {
        throw new Error('apple revoke: HTTP 500');
      }),
    });
    await expect(runAppleLeg(deps)).resolves.toEqual([APPLE_SKIPPED.failed]);
  });

  it('reports a failed revocation when the exchange returns no token at all', async () => {
    const { deps } = leg({}, { refresh_token: undefined, access_token: undefined });
    await expect(runAppleLeg(deps)).resolves.toEqual([APPLE_SKIPPED.failed]);
    expect(deps.revokeToken).not.toHaveBeenCalled();
  });
});

describe('runDeletion', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('starts both legs at once and deletes the user only after both have settled', async () => {
    const apple = deferred<string[]>();
    const rc = deferred<string[]>();
    const order: string[] = [];
    const deleteUser = jest.fn(async () => {
      order.push('user deleted');
      return true;
    });

    const run = runDeletion({
      apple: () => {
        order.push('apple started');
        return apple.promise;
      },
      revenuecat: () => {
        order.push('revenuecat started');
        return rc.promise;
      },
      deleteUser,
    });
    await flush();
    expect(order).toEqual(['apple started', 'revenuecat started']);

    rc.resolve([]);
    await flush();
    expect(deleteUser).not.toHaveBeenCalled();

    apple.resolve([APPLE_SKIPPED.otherAppleId]);
    await expect(run).resolves.toEqual({ deleted: true, skipped: [APPLE_SKIPPED.otherAppleId] });
    expect(order).toEqual(['apple started', 'revenuecat started', 'user deleted']);
  });

  it('waits for the RevenueCat leg too when Apple finishes first', async () => {
    const rc = deferred<string[]>();
    const deleteUser = jest.fn(async () => true);
    const run = runDeletion({ apple: async () => [], revenuecat: () => rc.promise, deleteUser });
    await flush();
    expect(deleteUser).not.toHaveBeenCalled();
    rc.resolve([REVENUECAT_SKIPPED.failed]);
    await expect(run).resolves.toEqual({ deleted: true, skipped: [REVENUECAT_SKIPPED.failed] });
  });

  it('still deletes the user when a best-effort leg throws', async () => {
    const deleteUser = jest.fn(async () => true);
    const result = await runDeletion({
      apple: () => Promise.reject(new Error('boom')),
      revenuecat: () => {
        throw new Error('sync boom');
      },
      deleteUser,
    });
    expect(result).toEqual({
      deleted: true,
      skipped: [APPLE_SKIPPED.failed, REVENUECAT_SKIPPED.failed],
    });
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it('cuts off a leg that hangs at the deadline, then deletes the user', async () => {
    const deleteUser = jest.fn(async () => true);
    const result = await runDeletion({
      apple: () => new Promise<string[]>(() => undefined),
      revenuecat: async () => [],
      deleteUser,
      legDeadlineMs: 20,
    });
    expect(result).toEqual({ deleted: true, skipped: [APPLE_SKIPPED.timedOut] });
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it("keeps the deadline above the Apple leg's own worst case (two 8 s calls)", () => {
    expect(LEG_DEADLINE_MS).toBeGreaterThan(16_000);
  });

  it('runs with no best-effort legs at all', async () => {
    await expect(
      runDeletion({ apple: null, revenuecat: null, deleteUser: async () => true }),
    ).resolves.toEqual({ deleted: true, skipped: [] });
  });

  it.each([
    ['answers false', async () => false],
    ['throws', async (): Promise<boolean> => Promise.reject(new Error('auth down'))],
  ])('reports not deleted when deleteUser %s', async (_label, deleteUser) => {
    await expect(
      runDeletion({ apple: async () => [], revenuecat: async () => [], deleteUser }),
    ).resolves.toEqual({ deleted: false, skipped: [] });
  });
});
