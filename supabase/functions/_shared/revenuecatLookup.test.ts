// Jest tests for the RevenueCat lookup (step 189). The functions around it run
// on Deno; the part that decides "does RevenueCat say Plus?" is plain
// TypeScript, and its failure modes are what matter: every one of them must
// read as "not Plus", and none of them as a revocation.

import {
  LOOKUP_TIMEOUT_MS,
  PLUS_ENTITLEMENT_ID,
  activeEntitlementsUrl,
  createLookupCache,
  entitlementsUrl,
  isForeignKeyViolation,
  lookupPlus,
  readLookupConfig,
  toRpcArgs,
  writeFromLookup,
  type FetchLike,
  type LookupConfig,
  type LookupDeps,
} from './revenuecatLookup';

const USER = '11111111-2222-3333-4444-555555555555';
const PROJECT = 'projb27eccad';
const KEY = 'sk_read_only_test_key_do_not_log';
const CONFIG: LookupConfig = { apiKey: KEY, projectId: PROJECT };
const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const FUTURE = Date.parse('2027-11-17T12:00:00.000Z');
const PAST = Date.parse('2026-11-01T00:00:00.000Z');

/** RevenueCat's own id for the plus entitlement, as the entitlements list gives it. */
const PLUS_ID = 'entla1b2c3d4e5';

const ACTIVE = activeEntitlementsUrl(PROJECT, USER);
const ENTITLEMENTS = entitlementsUrl(PROJECT);

interface Reply {
  status: number;
  body?: unknown;
  badJson?: boolean;
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const list = (items: unknown[], next_page: string | null = null) =>
  ok({ object: 'list', items, next_page, url: '/v2/…' });
const active = (entitlement_id: string, expires_at: number | null) => ({
  object: 'customer.active_entitlement',
  entitlement_id,
  expires_at,
});
const ENTITLEMENT_LIST = list([
  { object: 'entitlement', id: 'entlzzzz', lookup_key: 'something_else' },
  { object: 'entitlement', id: PLUS_ID, lookup_key: PLUS_ENTITLEMENT_ID },
]);

function makeFetch(handler: (url: string, signal: AbortSignal) => Reply | Promise<Reply>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const reply = await handler(url, init.signal);
    return {
      status: reply.status,
      json: async () => {
        if (reply.badJson) throw new SyntaxError('Unexpected token < in JSON');
        return reply.body;
      },
    };
  };
  return { fetch, calls };
}

/** Routes by URL: the customer's active entitlements, then the project's entitlements. */
function routes(activeReply: Reply, entitlementsReply: Reply = ENTITLEMENT_LIST) {
  return makeFetch((url) => {
    if (url === ACTIVE) return activeReply;
    if (url === ENTITLEMENTS) return entitlementsReply;
    return { status: 599 };
  });
}

function deps(fetch: FetchLike, over: Partial<LookupDeps> = {}): LookupDeps {
  return { fetch, now: () => NOW, cache: createLookupCache(), ...over };
}

describe('lookupPlus — Plus', () => {
  it('finds an active plus entitlement through its RevenueCat id', async () => {
    const { fetch, calls } = routes(list([active(PLUS_ID, FUTURE)]));

    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'plus',
      expiresAt: new Date(FUTURE).toISOString(),
      source: 'annual',
    });
    expect(calls.map((c) => c.url)).toEqual([ACTIVE, ENTITLEMENTS]);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it('calls the documented v2 endpoint with the user id path-encoded', () => {
    expect(ACTIVE).toBe(
      `https://api.revenuecat.com/v2/projects/${PROJECT}/customers/${USER}/active_entitlements?limit=100`,
    );
    expect(activeEntitlementsUrl('p/x', USER)).toContain('/projects/p%2Fx/');
  });

  it('reads the entitlements list once per cache', async () => {
    const { fetch, calls } = routes(list([active(PLUS_ID, FUTURE)]));
    const shared = deps(fetch);

    await lookupPlus(USER, CONFIG, shared);
    await lookupPlus(USER, CONFIG, shared);

    expect(calls.filter((c) => c.url === ENTITLEMENTS)).toHaveLength(1);
  });

  it('accepts the lookup key itself without reading the entitlements list', async () => {
    const { fetch, calls } = routes(list([active(PLUS_ENTITLEMENT_ID, FUTURE)]));
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toMatchObject({
      status: 'plus',
    });
    expect(calls.map((c) => c.url)).toEqual([ACTIVE]);
  });

  it('treats a null expiry as non-expiring (lifetime)', async () => {
    const { fetch } = routes(list([active(PLUS_ID, null)]));
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'plus',
      expiresAt: null,
      source: 'lifetime',
    });
  });

  it('lets a non-expiring grant outlast a dated one', async () => {
    const { fetch } = routes(list([active(PLUS_ID, FUTURE), active(PLUS_ID, null)]));
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toMatchObject({
      status: 'plus',
      expiresAt: null,
    });
  });

  it('follows next_page on the API origin', async () => {
    const page2 = `/v2/projects/${PROJECT}/customers/${USER}/active_entitlements?starting_after=x`;
    const { fetch, calls } = makeFetch((url) => {
      if (url === ACTIVE) return list([active('entlother', FUTURE)], page2);
      if (url === `https://api.revenuecat.com${page2}`) return list([active(PLUS_ID, FUTURE)]);
      if (url === ENTITLEMENTS) return ENTITLEMENT_LIST;
      return { status: 599 };
    });

    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toMatchObject({
      status: 'plus',
    });
    expect(calls).toHaveLength(3);
  });
});

describe('lookupPlus — not Plus', () => {
  it('says none when the plus entitlement has expired', async () => {
    const { fetch, calls } = routes(list([active(PLUS_ID, PAST)]));
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({ status: 'none' });
    expect(calls.map((c) => c.url)).toEqual([ACTIVE]);
  });

  it('says none when only another entitlement is active', async () => {
    const { fetch } = routes(list([active('entlsomeothertier', FUTURE)]));
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({ status: 'none' });
  });

  it('says none for a customer with nothing active, without the entitlements list', async () => {
    const { fetch, calls } = routes(list([]));
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({ status: 'none' });
    expect(calls.map((c) => c.url)).toEqual([ACTIVE]);
  });

  it('says none for a customer RevenueCat has never seen (404)', async () => {
    const { fetch } = routes({ status: 404, body: { type: 'resource_missing' } });
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({ status: 'none' });
  });
});

// Every one of these must be an error: never Plus, and never "none", which
// the webhook writes as a revocation.
describe('lookupPlus — failures', () => {
  it.each([429, 500, 502, 503, 401, 403])('is an error on HTTP %i', async (status) => {
    const { fetch } = routes({ status });
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'error',
      reason: `http_${status}`,
    });
  });

  it('is an error when the body is not JSON', async () => {
    const { fetch } = routes({ status: 200, badJson: true });
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'error',
      reason: 'bad_json',
    });
  });

  it.each([
    ['a body with no items', ok({ object: 'list' })],
    ['a body that is an array', ok([])],
    ['an item with no expires_at', list([{ entitlement_id: PLUS_ID }])],
    ['an expiry that is a string', list([{ entitlement_id: PLUS_ID, expires_at: '2027-01-01' }])],
    ['an item with no entitlement id', list([{ expires_at: FUTURE }])],
    ['a next_page that is not a string', ok({ items: [], next_page: 7 })],
  ])('is an error on %s', async (_label, reply) => {
    const { fetch } = routes(reply);
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'error',
      reason: 'bad_response',
    });
  });

  it('never follows a next_page off the API origin, so the key stays put', async () => {
    const { fetch, calls } = routes(list([], 'https://evil.example/v2/steal'));
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'error',
      reason: 'bad_response',
    });
    expect(calls).toHaveLength(1);
  });

  it('is an error when the network fails', async () => {
    const { fetch } = makeFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'error',
      reason: 'network',
    });
  });

  it('gives up at the deadline even if the fetch ignores its signal', async () => {
    const { fetch } = makeFetch(() => new Promise<Reply>(() => undefined));
    await expect(lookupPlus(USER, CONFIG, deps(fetch, { timeoutMs: 20 }))).resolves.toEqual({
      status: 'error',
      reason: 'timeout',
    });
  });

  it('aborts the request at the deadline', async () => {
    let aborted = false;
    const { fetch } = makeFetch(
      (_url, signal) =>
        new Promise<Reply>((_, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    );
    await expect(lookupPlus(USER, CONFIG, deps(fetch, { timeoutMs: 20 }))).resolves.toEqual({
      status: 'error',
      reason: 'timeout',
    });
    expect(aborted).toBe(true);
  });

  it('caps the whole lookup at about five seconds', () => {
    expect(LOOKUP_TIMEOUT_MS).toBe(5_000);
  });

  it('is an error when the project has no plus entitlement', async () => {
    const { fetch } = routes(
      list([active(PLUS_ID, FUTURE)]),
      list([{ id: 'entlzzzz', lookup_key: 'pro' }]),
    );
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'error',
      reason: 'plus_entitlement_not_found',
    });
  });

  // A key made without project_configuration:entitlements:read.
  it('is an error when the entitlements list is refused', async () => {
    const { fetch } = routes(list([active(PLUS_ID, FUTURE)]), { status: 403 });
    await expect(lookupPlus(USER, CONFIG, deps(fetch))).resolves.toEqual({
      status: 'error',
      reason: 'http_403',
    });
  });

  it('is an error, and makes no call, when not configured', async () => {
    const { fetch, calls } = routes(list([active(PLUS_ID, FUTURE)]));
    const log = jest.fn();
    await expect(lookupPlus(USER, null, deps(fetch, { log }))).resolves.toEqual({
      status: 'error',
      reason: 'not_configured',
    });
    expect(calls).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not_configured'));
  });

  it.each(['$RCAnonymousID:abc123', '../../projects/other', '', 'not-a-uuid', `${USER}/x`])(
    'is an error, and makes no call, for the id %p',
    async (id) => {
      const { fetch, calls } = routes(list([active(PLUS_ID, FUTURE)]));
      await expect(lookupPlus(id, CONFIG, deps(fetch))).resolves.toEqual({
        status: 'error',
        reason: 'invalid_user_id',
      });
      expect(calls).toHaveLength(0);
    },
  );

  it('never logs the key', async () => {
    const messages: string[] = [];
    const log = (m: string) => messages.push(m);
    for (const reply of [{ status: 500 }, { status: 200, badJson: true }]) {
      const { fetch } = routes(reply);
      await lookupPlus(USER, CONFIG, deps(fetch, { log }));
    }
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.join('\n')).not.toContain(KEY);
  });
});

describe('readLookupConfig', () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];

  it('reads the read key and the project id', () => {
    expect(
      readLookupConfig(env({ REVENUECAT_READ_KEY: ` ${KEY} `, REVENUECAT_PROJECT_ID: PROJECT })),
    ).toEqual({ apiKey: KEY, projectId: PROJECT });
  });

  it.each([
    ['no key', { REVENUECAT_PROJECT_ID: PROJECT }],
    ['no project', { REVENUECAT_READ_KEY: KEY }],
    ['a blank key', { REVENUECAT_READ_KEY: '  ', REVENUECAT_PROJECT_ID: PROJECT }],
    // The delete key is a different key with a different job.
    ['only the delete key', { REVENUECAT_DELETE_KEY: KEY, REVENUECAT_PROJECT_ID: PROJECT }],
  ])('is off with %s', (_label, vars) => {
    expect(readLookupConfig(env(vars))).toBeNull();
  });
});

describe('writing what the lookup said', () => {
  it('writes Plus with its expiry', () => {
    const write = writeFromLookup(
      USER,
      { status: 'plus', expiresAt: '2027-11-17T12:00:00.000Z', source: 'annual' },
      1234,
    );
    expect(toRpcArgs(write)).toEqual({
      p_user_id: USER,
      p_is_plus: true,
      p_source: 'annual',
      p_expires_at: '2027-11-17T12:00:00.000Z',
      p_event_ms: 1234,
    });
  });

  it('writes free for none, so a stale row is revoked', () => {
    expect(toRpcArgs(writeFromLookup(USER, { status: 'none' }, 99))).toEqual({
      p_user_id: USER,
      p_is_plus: false,
      p_source: 'none',
      p_expires_at: null,
      p_event_ms: 99,
    });
  });
});

describe('isForeignKeyViolation', () => {
  it('recognises SQLSTATE 23503 as supabase-js reports it', () => {
    expect(
      isForeignKeyViolation({
        code: '23503',
        message: 'insert or update on table "entitlements" violates foreign key constraint',
        details: null,
        hint: null,
      }),
    ).toBe(true);
  });

  it.each([
    ['another code', { code: '42501', message: 'permission denied' }],
    ['no code', { message: 'boom' }],
    ['null', null],
    ['a string', '23503'],
  ])('is false for %s', (_label, error) => {
    expect(isForeignKeyViolation(error)).toBe(false);
  });
});
