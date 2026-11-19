import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DELETE_FAILED_MESSAGE,
  DELETE_UNCONFIRMED_MESSAGE,
  deleteAccountOnServer,
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
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({ ok: true });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('sends the Apple code when there is one, and nothing otherwise', async () => {
    const withCode = fakeClient({ data: { ok: true }, error: null });
    await deleteAccountOnServer('c1.abc', { client: withCode.client });
    expect(withCode.invoke).toHaveBeenCalledWith('delete-account', {
      body: { apple_authorization_code: 'c1.abc' },
    });

    const without = fakeClient({ data: { ok: true }, error: null });
    await deleteAccountOnServer(null, { client: without.client });
    expect(without.invoke).toHaveBeenCalledWith('delete-account', { body: {} });
  });

  // The caller wipes the device only on proof the account is gone. A 200
  // without `ok: true` is not proof; with the server confirming the user is
  // still there, nothing has been deleted.
  it.each([
    ['a function error', { data: null, error: { message: 'internal' }, response: { status: 500 } }],
    ['a body without ok', { data: { something: 'else' }, error: null }],
    ['an empty body', { data: null, error: null }],
  ])('fails on %s', async (_label, result) => {
    const { client } = fakeClient(result as InvokeResult);
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
      ok: false,
      error: DELETE_FAILED_MESSAGE,
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
      ).resolves.toEqual({ ok: true });
      // Asked about the same user, with the token read before the call.
      expect(getUser).toHaveBeenCalledWith(TOKEN);
    });

    it('a retry that gets 401 because the user is already gone counts as done', async () => {
      const { client } = fakeClient(
        { data: null, error: { message: 'Edge Function returned a non-2xx status code' }, response: { status: 401 } },
        { kind: 'gone' },
      );
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({ ok: true });
    });

    it('a 401 while the user still exists deletes nothing, and says so', async () => {
      const { client } = fakeClient(
        { data: null, error: { message: 'Edge Function returned a non-2xx status code' }, response: { status: 401 } },
        { kind: 'exists' },
      );
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: false,
        error: DELETE_FAILED_MESSAGE,
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

    it('a real failure from the server, with the user still there, is "nothing deleted"', async () => {
      const { client } = fakeClient(
        { data: { error: 'internal' }, error: { message: 'Edge Function returned a non-2xx status code' }, response: { status: 500 } },
        { kind: 'exists' },
      );
      await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
        ok: false,
        error: DELETE_FAILED_MESSAGE,
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

    it('cannot ask without a session, so it never counts as done', async () => {
      const { client, getUser } = fakeClient(NEVER(), { kind: 'gone' }, null);
      await expect(deleteAccountOnServer(null, { client, timeoutMs: 10 })).resolves.toEqual({
        ok: false,
        error: DELETE_UNCONFIRMED_MESSAGE,
      });
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
