import { signUpWithEmail } from './auth';
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

    await expect(signUpWithEmail('a@b.co', 'longenough')).resolves.toEqual({
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

    await expect(signUpWithEmail('a@b.co', 'longenough')).resolves.toEqual({
      ok: true,
      needsConfirmation: false,
    });
  });

  it('rejects a short password before calling the server', async () => {
    const { client, signUp } = clientWithSignUp({ data: null, error: null });
    setSupabaseClientForTests(client);

    const outcome = await signUpWithEmail('a@b.co', 'short');
    expect(outcome.ok).toBe(false);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('trims the email', async () => {
    const { client, signUp } = clientWithSignUp({
      data: { session: null },
      error: null,
    });
    setSupabaseClientForTests(client);

    await signUpWithEmail('  a@b.co ', 'longenough');
    expect(signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'longenough' });
  });
});
