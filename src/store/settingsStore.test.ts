// Tests for the L4 settings store. Persistence is swapped for an in-memory
// fake via __setPersistenceForTests so nothing touches native AsyncStorage.

import {
  __setPersistenceForTests,
  useSettingsStore,
  type SettingsPersistence,
  type StoredSettings,
} from './settingsStore';

function makeFakePersistence(
  initial: Partial<StoredSettings> | null = null,
  options: { loadThrows?: boolean; saveThrows?: boolean } = {},
): { persistence: SettingsPersistence; saved: StoredSettings[] } {
  let stored = initial;
  const saved: StoredSettings[] = [];
  return {
    saved,
    persistence: {
      async load() {
        if (options.loadThrows) throw new Error('read failed');
        return stored;
      },
      async save(s) {
        if (options.saveThrows) throw new Error('write failed');
        saved.push(s);
        stored = s;
      },
    },
  };
}

afterEach(() => {
  __setPersistenceForTests(null); // restore default persistence + reset state
});

describe('settingsStore: defaults', () => {
  it('starts with both toggles on and unhydrated', () => {
    __setPersistenceForTests(makeFakePersistence().persistence);
    const s = useSettingsStore.getState();
    expect(s.notificationsEnabled).toBe(true);
    expect(s.aiRefineEnabled).toBe(true);
    expect(s.hydrated).toBe(false);
  });
});

describe('settingsStore: hydrate', () => {
  it('keeps defaults and marks hydrated when nothing is stored', async () => {
    __setPersistenceForTests(makeFakePersistence(null).persistence);
    await useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.notificationsEnabled).toBe(true);
    expect(s.aiRefineEnabled).toBe(true);
    expect(s.hydrated).toBe(true);
  });

  it('applies stored values', async () => {
    __setPersistenceForTests(
      makeFakePersistence({ notificationsEnabled: false, aiRefineEnabled: false })
        .persistence,
    );
    await useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.notificationsEnabled).toBe(false);
    expect(s.aiRefineEnabled).toBe(false);
    expect(s.hydrated).toBe(true);
  });

  it('fills missing keys from defaults (partial stored object)', async () => {
    __setPersistenceForTests(
      makeFakePersistence({ notificationsEnabled: false }).persistence,
    );
    await useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.notificationsEnabled).toBe(false);
    expect(s.aiRefineEnabled).toBe(true); // default
  });

  it('falls back to defaults and still hydrates when load throws', async () => {
    __setPersistenceForTests(
      makeFakePersistence(null, { loadThrows: true }).persistence,
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.notificationsEnabled).toBe(true);
    expect(s.hydrated).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('settingsStore: setters persist', () => {
  it('updates state and persists both values on setNotificationsEnabled', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);

    await useSettingsStore.getState().setNotificationsEnabled(false);

    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual({
      notificationsEnabled: false,
      aiRefineEnabled: true,
      coachEnabled: false,
    });
  });

  it('updates state and persists both values on setAiRefineEnabled', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);

    await useSettingsStore.getState().setAiRefineEnabled(false);

    expect(useSettingsStore.getState().aiRefineEnabled).toBe(false);
    expect(saved[0]).toEqual({
      notificationsEnabled: true,
      aiRefineEnabled: false,
      coachEnabled: false,
    });
  });

  it('keeps the in-memory value but swallows a failed write', async () => {
    __setPersistenceForTests(
      makeFakePersistence(null, { saveThrows: true }).persistence,
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await useSettingsStore.getState().setNotificationsEnabled(false);

    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
