import { useAuthStore } from './authStore';

beforeEach(() => {
  useAuthStore.setState({ userId: null });
});

describe('authStore', () => {
  it('starts with no active user', () => {
    expect(useAuthStore.getState().userId).toBeNull();
  });

  it('initialize() sets a stable local user id', async () => {
    await useAuthStore.getState().initialize();
    const id = useAuthStore.getState().userId;
    expect(typeof id).toBe('string');
    expect(id).not.toBe('');

    // Re-running initialize doesn't churn the id.
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().userId).toBe(id);
  });

  it('reset() drops the session', async () => {
    await useAuthStore.getState().initialize();
    useAuthStore.getState().reset();
    expect(useAuthStore.getState().userId).toBeNull();
  });
});
