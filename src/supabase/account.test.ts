import type { SupabaseClient } from '@supabase/supabase-js';

import { DELETE_FAILED_MESSAGE, deleteAccountOnServer } from './account';

function clientReturning(result: { data: unknown; error: unknown } | Promise<never>) {
  const invoke = jest.fn(() => (result instanceof Promise ? result : Promise.resolve(result)));
  return {
    invoke,
    client: { functions: { invoke } } as unknown as SupabaseClient,
  };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deleteAccountOnServer', () => {
  it('succeeds only on an explicit ok from the function', async () => {
    const { client } = clientReturning({ data: { ok: true, skipped: [] }, error: null });
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({ ok: true });
  });

  it('sends the Apple code when there is one, and nothing otherwise', async () => {
    const withCode = clientReturning({ data: { ok: true }, error: null });
    await deleteAccountOnServer('c1.abc', { client: withCode.client });
    expect(withCode.invoke).toHaveBeenCalledWith('delete-account', {
      body: { apple_authorization_code: 'c1.abc' },
    });

    const without = clientReturning({ data: { ok: true }, error: null });
    await deleteAccountOnServer(null, { client: without.client });
    expect(without.invoke).toHaveBeenCalledWith('delete-account', { body: {} });
  });

  // The caller wipes the device only on proof the account is gone. A 200
  // without `ok: true` is not proof.
  it.each([
    ['a function error', { data: null, error: { message: 'internal' } }],
    ['a body without ok', { data: { something: 'else' }, error: null }],
    ['an empty body', { data: null, error: null }],
  ])('fails on %s', async (_label, result) => {
    const { client } = clientReturning(result);
    await expect(deleteAccountOnServer(null, { client })).resolves.toEqual({
      ok: false,
      error: DELETE_FAILED_MESSAGE,
    });
  });

  it('fails, rather than hanging, when the call times out', async () => {
    const { client } = clientReturning(new Promise<never>(() => {}));
    await expect(
      deleteAccountOnServer(null, { client, timeoutMs: 10 }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('fails when Supabase is not configured', async () => {
    await expect(deleteAccountOnServer(null, { client: null })).resolves.toMatchObject({
      ok: false,
    });
  });
});
