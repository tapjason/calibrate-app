import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  APPLE_SKIPPED,
  REVENUECAT_SKIPPED,
} from '../../supabase/functions/delete-account/deletionPlan';
import {
  DELETE_FAILED_MESSAGE,
  DELETE_UNCONFIRMED_MESSAGE,
  DELETION_CAN_LAND_WITHIN_MS,
  deleteAccountOnServer,
  deletionCanNoLongerLand,
} from './account';

const USER = 'user-1';
const TOKEN = 'access-token-1';

type InvokeResult = { data: unknown; error: unknown; response?: { status: number } };

/** What GET /user answers afterwards. */
type ProbeAnswer =
  | { kind: 'exists' }
  | { kind: 'gone' }
  | { kind: 'error'; error: unknown }
  | { kind: 'throws' }
  | { kind: 'hangs' };

const userGone = () =>
  new AuthApiError('User from sub claim in JWT does not exist', 403, 'user_not_found');

function fakeClient(
  invokeResult: InvokeResult | Promise<never>,
  probe: ProbeAnswer = { kind: 'exists' },
  session: { access_token: string; user: { id: string } } | null = {
    access_token: TOKEN,
    user: { id: USER },
  },
) {
  const invoke = jest.fn(() =>
    invokeResult instanceof Promise ? invokeResult : Promise.resolve(invokeResult),
  );
  const getSession = jest.fn(async () => ({ data: { session }, error: null }));
  const getUser = jest.fn((_jwt?: string): Promise<unknown> => {
    switch (probe.kind) {
      case 'exists':
        return Promise.resolve({ data: { user: { id: USER } }, error: null });
      case 'gone':
        return Promise.resolve({ data: { user: null }, error: userGone() });
      case 'error':
        return Promise.resolve({ data: { user: null }, error: probe.error });
      case 'throws':
        return Promise.reject(new Error('boom'));
      case 'hangs':
        return new Promise(() => {});
    }
  });
  return {
    invoke,
    getUser,
    getSession,
    client: { functions: { invoke }, auth: { getSession, getUser } } as unknown as SupabaseClient,
  };
}

const NEVER = () => new Promise<never>(() => {});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deleteAccountOnServer', () => {
  it('succeeds only on an explicit ok from the function, without asking again', async () => {
    const { client, getUser } = fakeClient({ data: { ok: true, skipped: [] }, error: null });
    // No code was sent, so nothing about Apple was revoked.
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
      ok: true,
      appleRevoked: false,
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  // Round 5: the call carries the token read before it, the one whose user
  // was checked and that the follow-up question uses (was: no headers).
  it('sends the Apple code when there is one, and nothing otherwise', async () => {
    const withCode = fakeClient({ data: { ok: true }, error: null });
    await deleteAccountOnServer('c1.abc', { client: withCode.client });
    expect(withCode.invoke).toHaveBeenCalledWith('delete-account', {
      body: { apple_authorization_code: 'c1.abc' },
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    const without = fakeClient({ data: { ok: true }, error: null });
    await deleteAccountOnServer(null, { client: without.client });
    expect(without.invoke).toHaveBeenCalledWith('delete-account', {
      body: {},
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  });

  // The caller wipes the device only on proof the account is gone. A 200
  // without `ok: true` is not proof; with the server confirming the user is
  // still there, nothing has been deleted.
  // Round 5: 'a function error' (a 500) moved below: after one the server may
  // have revoked Apple and deleted the RevenueCat customer, so it is no longer
  // "nothing has been deleted".
  it.each([
    ['a body without ok', { data: { something: 'else' }, error: null }],
    ['an empty body', { data: null, error: null }],
  ])('fails on %s', async (_label, result) => {
    const { client } = fakeClient(result as InvokeResult);
    // Round 6 (N4): the auth server's "still there" carries when it was asked.
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
      ok: false,
      error: DELETE_FAILED_MESSAGE,
      stillExistsAt: expect.any(Number),
    });
  });

  it('fails, rather than hanging, when the call times out', async () => {
    const { client } = fakeClient(NEVER(), { kind: 'hangs' });
    await expect(
      deleteAccountOnServer(null, { client, timeoutMs: 10, probeTimeoutMs: 10 }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('fails when Supabase is not configured', async () => {
    await expect(deleteAccountOnServer(null, { client: null })).resolves.toEqual({
      ok: false,
      error: DELETE_FAILED_MESSAGE,
    });
  });

  // Security review, 2026-11-18: the function can outlast the client's wait,
  // delete the user, and lose its 200.
  describe('after a call that did not confirm', () => {
    it('the lost 200: a timeout, then the server says the user is gone, counts as done', async () => {
      const { client, getUser } = fakeClient(NEVER(), { kind: 'gone' });
      await expect(
        deleteAccountOnServer(null, { client, timeoutMs: 10 }),
      ).resolves.toEqual({ ok: true, appleRevoked: false });
      // Asked about the same user, with the token read before the call.
      expect(getUser).toHaveBeenCalledWith(TOKEN);
    });

    it('a retry that gets 401 because the user is already gone counts as done', async () => {
      const { client } = fakeClient(
        { data: null, error: { message: 'Edge Function returned a non-2xx status code' }, response: { status: 401 } },
        { kind: 'gone' },
      );
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: true,
        appleRevoked: false,
      });
    });

    it('a 401 while the user still exists deletes nothing, and says so', async () => {
      const { client } = fakeClient(
        { data: null, error: { message: 'Edge Function returned a non-2xx status code' }, response: { status: 401 } },
        { kind: 'exists' },
      );
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: false,
        error: DELETE_FAILED_MESSAGE,
        stillExistsAt: expect.any(Number),
      });
    });

    it('offline: no answer from either call is never done, and claims nothing', async () => {
      const { client } = fakeClient(
        { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } },
        { kind: 'error', error: new AuthRetryableFetchError('Network request failed', 0) },
      );
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: false,
        error: DELETE_UNCONFIRMED_MESSAGE,
      });
    });

    // Round 5 (client reviewer): the function's 500 after `runDeletion` comes
    // once the Apple revoke and the RevenueCat delete have run
    // (supabase/functions/delete-account/index.ts, deletionPlan.ts), so
    // "Nothing has been deleted" could be untrue. Was DELETE_FAILED_MESSAGE.
    it('a server error with the user still there is unconfirmed: part of the work may have run', async () => {
      const { client } = fakeClient(
        { data: { error: 'internal' }, error: { message: 'Edge Function returned a non-2xx status code' }, response: { status: 500 } },
        { kind: 'exists' },
      );
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: false,
        error: DELETE_UNCONFIRMED_MESSAGE,
      });
    });

    // The function may still be running after a timeout or a gateway timeout,
    // so "still there" right now can't promise nothing will be deleted.
    it.each([
      ['a timeout', NEVER()],
      ['a gateway timeout', { data: null, error: { message: 'non-2xx' }, response: { status: 504 } }],
      ['a lost connection', { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send' } }],
    ])('after %s, a user still there is unconfirmed, not "nothing deleted"', async (_label, result) => {
      const { client } = fakeClient(result as InvokeResult | Promise<never>, { kind: 'exists' });
      await expect(deleteAccountOnServer(null, { client, timeoutMs: 10 })).resolves.toEqual({
        ok: false,
        error: DELETE_UNCONFIRMED_MESSAGE,
      });
    });

    // Only `user_not_found` is the server saying the user is gone.
    it.each([
      ['a dead session (a user who still exists can get it too)', new AuthSessionMissingError()],
      ['an expired token', new AuthApiError('invalid JWT: token is expired', 403, 'bad_jwt')],
      ['user_not_found with another status', new AuthApiError('gone?', 404, 'user_not_found')],
      ['a look-alike that is not an AuthApiError', { name: 'Error', status: 403, code: 'user_not_found' }],
      ['a server error', new AuthApiError('internal', 500, 'unexpected_failure')],
    ])('never wipes on %s', async (_label, error) => {
      const { client } = fakeClient(
        { data: null, error: { message: 'non-2xx' }, response: { status: 401 } },
        { kind: 'error', error },
      );
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: false,
        error: DELETE_UNCONFIRMED_MESSAGE,
      });
    });

    it('never wipes when the follow-up question throws or hangs', async () => {
      const throws = fakeClient(NEVER(), { kind: 'throws' });
      await expect(
        deleteAccountOnServer(null, { client: throws.client, timeoutMs: 10 }),
      ).resolves.toEqual({ ok: false, error: DELETE_UNCONFIRMED_MESSAGE });

      const hangs = fakeClient(NEVER(), { kind: 'hangs' });
      await expect(
        deleteAccountOnServer(null, { client: hangs.client, timeoutMs: 10, probeTimeoutMs: 10 }),
      ).resolves.toEqual({ ok: false, error: DELETE_UNCONFIRMED_MESSAGE });
    });

    // Round 5 (client reviewer): with no session read, nothing is sent at
    // all, so the person is told nothing was deleted. Was: the call went out
    // and the outcome read DELETE_UNCONFIRMED_MESSAGE.
    it('sends nothing without a session, so it never counts as done and nothing was deleted', async () => {
      const { client, getUser, invoke } = fakeClient(NEVER(), { kind: 'gone' }, null);
      await expect(deleteAccountOnServer(null, { client, timeoutMs: 10 })).resolves.toEqual({
        ok: false,
        error: DELETE_FAILED_MESSAGE,
      });
      expect(invoke).not.toHaveBeenCalled();
      expect(getUser).not.toHaveBeenCalled();
    });

    it('a different user answering is not "still there"', async () => {
      const { client, getUser } = fakeClient(
        { data: null, error: { message: 'non-2xx' }, response: { status: 500 } },
        { kind: 'exists' },
      );
      getUser.mockResolvedValueOnce({ data: { user: { id: 'someone-else' } }, error: null });
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: false,
        error: DELETE_UNCONFIRMED_MESSAGE,
      });
    });
  });

  it('logs the status and message only, never the token or a body', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client } = fakeClient(
      { data: { secret: 'row' }, error: { message: 'Edge Function returned a non-2xx status code', context: { body: 'x' } }, response: { status: 500 } },
      { kind: 'exists' },
    );
    await deleteAccountOnServer('c1.secret-code', { client });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('HTTP 500');
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('c1.secret-code');
    expect(logged).not.toContain('row');
  });
});

// Security review, 2026-11-18, round 4 (ACCOUNT_SPEC §3.2 step 5): a done
// outcome says whether the server confirmed revoking the Apple grant. Only a
// readable `skipped` list naming nothing but RevenueCat, after a code was
// sent, counts; anything else reads as not revoked.
describe('deleteAccountOnServer: whether the Apple grant was revoked', () => {
  const CODE = 'c1.fresh';
  /** The reasons planDeletion adds itself (deletionPlan.ts), not exported as constants. */
  const PLAN_NO_CODE =
    'apple: no authorization code (not an Apple account, or the user declined re-auth)';
  const PLAN_NO_KEY = 'apple: Sign in with Apple key not configured';
  const PLAN_NO_REVENUECAT_KEY = 'revenuecat: write-scoped key not configured';

  const answered = (body: unknown) => fakeClient({ data: body, error: null });

  it.each([
    ['an empty skipped list', []],
    ['only a RevenueCat key not configured', [PLAN_NO_REVENUECAT_KEY]],
    ['only a RevenueCat failure and timeout', [REVENUECAT_SKIPPED.failed, REVENUECAT_SKIPPED.timedOut]],
  ])('revoked, after a code, with %s', async (_label, skipped) => {
    const { client } = answered({ ok: true, skipped });
    await expect(deleteAccountOnServer(CODE, { client })).resolves.toEqual({
      ok: true,
      appleRevoked: true,
    });
  });

  // Every reason the Apple leg can give, the identity mismatch included, in
  // the function's own words, so a reason added there is covered here.
  it.each([
    ...Object.entries(APPLE_SKIPPED),
    ['the plan: no code', PLAN_NO_CODE],
    ['the plan: no Sign in with Apple key', PLAN_NO_KEY],
  ])('not revoked when the server skipped Apple: %s', async (_label, reason) => {
    const { client } = answered({ ok: true, skipped: [PLAN_NO_REVENUECAT_KEY, reason] });
    await expect(deleteAccountOnServer(CODE, { client })).resolves.toEqual({
      ok: true,
      appleRevoked: false,
    });
  });

  it('names the identity mismatch among the reasons it covers', () => {
    expect(APPLE_SKIPPED.otherAppleId).toMatch(/^apple: .*different Apple ID/);
  });

  // The function as deployed before the security review returned the same
  // shape; one that returned none, or something malformed, can't confirm.
  it.each([
    ['no skipped field', { ok: true }],
    ['skipped as a string', { ok: true, skipped: 'apple: revocation failed' }],
    ['skipped as null', { ok: true, skipped: null }],
    ['an entry that is not a string', { ok: true, skipped: [42] }],
    ['a reason this client does not know', { ok: true, skipped: ['something new'] }],
  ])('not revoked when the answer is unreadable: %s', async (_label, body) => {
    const { client } = answered(body);
    await expect(deleteAccountOnServer(CODE, { client })).resolves.toEqual({
      ok: true,
      appleRevoked: false,
    });
  });

  it('not revoked when no code was sent, whatever the list says', async () => {
    const { client } = answered({ ok: true, skipped: [] });
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
      ok: true,
      appleRevoked: false,
    });
  });

  // The function may have revoked and deleted, then lost its 200: the client
  // never saw its answer, so it can't say Apple's grant went.
  it('not revoked when the deletion was confirmed by the "already deleted" check', async () => {
    const lost = fakeClient(NEVER(), { kind: 'gone' });
    await expect(
      deleteAccountOnServer(CODE, { client: lost.client, timeoutMs: 10 }),
    ).resolves.toEqual({ ok: true, appleRevoked: false });

    const retried = fakeClient(
      { data: null, error: { message: 'non-2xx' }, response: { status: 401 } },
      { kind: 'gone' },
    );
    await expect(deleteAccountOnServer(CODE, { client: retried.client })).resolves.toEqual({
      ok: true,
      appleRevoked: false,
    });
  });
});

/** An em dash or an en dash, written by code point so the source stays ASCII. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);

describe('the failure messages', () => {
  it('are plain sentences with no em dash', () => {
    for (const message of [DELETE_FAILED_MESSAGE, DELETE_UNCONFIRMED_MESSAGE]) {
      expect(message).not.toMatch(DASHES);
    }
    expect(DELETE_FAILED_MESSAGE).toContain('Nothing has been deleted.');
    expect(DELETE_UNCONFIRMED_MESSAGE).not.toContain('Nothing has been deleted');
  });
});

// Security review round 5 (client reviewer's deletion nits).
describe('deleteAccountOnServer: what is sent, and what a failure says', () => {
  const non2xx = (status: number) => ({
    data: { error: 'x' },
    error: { message: 'Edge Function returned a non-2xx status code' },
    response: { status },
  });

  it.each([400, 401, 405, 429])(
    'a %i comes before any of the work: with the user still there, nothing was deleted',
    async (status) => {
      const { client } = fakeClient(non2xx(status), { kind: 'exists' });
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: false,
        error: DELETE_FAILED_MESSAGE,
        stillExistsAt: expect.any(Number),
      });
    },
  );

  it.each([500, 502, 503, 546])(
    'a %i may come after the Apple and RevenueCat steps: unconfirmed, never "nothing deleted"',
    async (status) => {
      const { client } = fakeClient(non2xx(status), { kind: 'exists' });
      await expect(deleteAccountOnServer('c1.code', { client })).resolves.toEqual({
        ok: false,
        error: DELETE_UNCONFIRMED_MESSAGE,
      });
    },
  );

  it('a 5xx after which the user is gone is done, as any call is', async () => {
    const { client } = fakeClient(non2xx(500), { kind: 'gone' });
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
      ok: true,
      appleRevoked: false,
    });
  });

  it('sends nothing when the session belongs to another account than the one shown', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, invoke, getUser } = fakeClient({ data: { ok: true }, error: null });
    await expect(
      deleteAccountOnServer('c1.code', { client, expectedUserId: 'someone-else' }),
    ).resolves.toEqual({ ok: false, error: DELETE_FAILED_MESSAGE });
    expect(invoke).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    // The log names neither account.
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(USER);
    expect(logged).not.toContain('someone-else');
  });

  it("sends the call when the session is the shown account's", async () => {
    const { client, invoke } = fakeClient({ data: { ok: true, skipped: [] }, error: null });
    await expect(deleteAccountOnServer(null, { client, expectedUserId: USER })).resolves.toEqual({
      ok: true,
      appleRevoked: false,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the session read throws or never answers', async () => {
    const throws = fakeClient({ data: { ok: true }, error: null });
    throws.getSession.mockRejectedValueOnce(new Error('storage'));
    await expect(deleteAccountOnServer(null, { client: throws.client })).resolves.toEqual({
      ok: false,
      error: DELETE_FAILED_MESSAGE,
    });
    expect(throws.invoke).not.toHaveBeenCalled();

    const hangs = fakeClient({ data: { ok: true }, error: null });
    hangs.getSession.mockImplementationOnce(() => new Promise(() => {}));
    await expect(
      deleteAccountOnServer(null, { client: hangs.client, probeTimeoutMs: 10 }),
    ).resolves.toEqual({ ok: false, error: DELETE_FAILED_MESSAGE });
    expect(hangs.invoke).not.toHaveBeenCalled();
  });
});

// Round 6, client re-review N4: a "deletion asked" mark survived a definite
// "nothing was deleted". A definite "still exists" now says when it was
// asked, so the caller can rule out an earlier unconfirmed request once that
// request can no longer delete anything.
describe('deleteAccountOnServer: when the server said the account still exists', () => {
  it('stamps the time the question was sent, after the call came back', async () => {
    const { client, getUser, invoke } = fakeClient(
      { data: null, error: { message: 'non-2xx' }, response: { status: 401 } },
      { kind: 'exists' },
    );
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    invoke.mockImplementationOnce(async () => {
      now.mockReturnValue(1_005_000);
      return { data: null, error: { message: 'non-2xx' }, response: { status: 401 } };
    });
    getUser.mockImplementationOnce(async () => {
      // The answer comes later still; the stamp is the question's.
      now.mockReturnValue(1_009_000);
      return { data: { user: { id: USER } }, error: null };
    });
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
      ok: false,
      error: DELETE_FAILED_MESSAGE,
      stillExistsAt: 1_005_000,
    });
  });

  it('carries no stamp when nothing was asked of the server, or the answer was not definite', async () => {
    const outcomes = [
      await deleteAccountOnServer(null, { client: null }),
      await deleteAccountOnServer(null, { client: fakeClient(NEVER(), { kind: 'gone' }, null).client, timeoutMs: 10 }),
      await deleteAccountOnServer(null, {
        client: fakeClient({ data: { ok: true }, error: null }).client,
        expectedUserId: 'someone-else',
      }),
      await deleteAccountOnServer(null, {
        client: fakeClient(NEVER(), { kind: 'exists' }).client,
        timeoutMs: 10,
      }),
      await deleteAccountOnServer(null, {
        client: fakeClient({ data: null, error: { message: 'x' }, response: { status: 500 } }, { kind: 'exists' }).client,
      }),
    ];
    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(false);
      expect('stillExistsAt' in outcome).toBe(false);
    }
  });
});

describe('deletionCanNoLongerLand', () => {
  it('is past the platform wall-clock limit (400 s), not the client wait (45 s)', () => {
    expect(DELETION_CAN_LAND_WITHIN_MS).toBeGreaterThan(400_000 + 10_000);
  });

  it('only when the answer was asked more than the window after the request', () => {
    const asked = 5_000_000;
    expect(deletionCanNoLongerLand(asked, asked + DELETION_CAN_LAND_WITHIN_MS + 1)).toBe(true);
    expect(deletionCanNoLongerLand(asked, asked + DELETION_CAN_LAND_WITHIN_MS)).toBe(false);
    expect(deletionCanNoLongerLand(asked, asked + 120_000)).toBe(false);
    expect(deletionCanNoLongerLand(asked, asked + 1_000)).toBe(false);
  });

  it('never when the request time is unknown, or the clock reads backwards', () => {
    expect(deletionCanNoLongerLand(null, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(deletionCanNoLongerLand(10_000_000, 1_000)).toBe(false);
    expect(deletionCanNoLongerLand(Number.NaN, 10_000_000)).toBe(false);
  });
});
