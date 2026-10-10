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
      remindersEnabled: true,
      digestEnabled: true,
      aiRefineEnabled: true,
      coachEnabled: false,
      analyticsEnabled: true,
      cardThemeId: 'midnight',
      coverageNudgeLastShownAt: null,
      reminderPromptDismissedAt: null,
      reminderPromptDismissals: 0,
      backupNudgeDismissedAt: null,
      ratingAskedAt: null,
      practiceReminder: null,
      practiceReminderOfferDismissedAt: null,
    });
  });

  it('updates state and persists both values on setAiRefineEnabled', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);

    await useSettingsStore.getState().setAiRefineEnabled(false);

    expect(useSettingsStore.getState().aiRefineEnabled).toBe(false);
    expect(saved[0]).toEqual({
      notificationsEnabled: true,
      remindersEnabled: true,
      digestEnabled: true,
      aiRefineEnabled: false,
      coachEnabled: false,
      analyticsEnabled: true,
      cardThemeId: 'midnight',
      coverageNudgeLastShownAt: null,
      reminderPromptDismissedAt: null,
      reminderPromptDismissals: 0,
      backupNudgeDismissedAt: null,
      ratingAskedAt: null,
      practiceReminder: null,
      practiceReminderOfferDismissedAt: null,
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

describe('settingsStore: coverage-nudge cooldown', () => {
  it('defaults to never shown', () => {
    __setPersistenceForTests(makeFakePersistence().persistence);
    expect(useSettingsStore.getState().coverageNudgeLastShownAt).toBeNull();
  });

  it('markCoverageNudgeShown stamps now and persists it', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);

    const before = Date.now();
    await useSettingsStore.getState().markCoverageNudgeShown();
    const stamp = useSettingsStore.getState().coverageNudgeLastShownAt;

    expect(stamp).not.toBeNull();
    expect(Date.parse(stamp!)).toBeGreaterThanOrEqual(before);
    expect(saved.at(-1)?.coverageNudgeLastShownAt).toBe(stamp);
  });

  it('survives a restart via hydrate', async () => {
    const stamp = '2026-09-01T12:00:00.000Z';
    __setPersistenceForTests(
      makeFakePersistence({ coverageNudgeLastShownAt: stamp }).persistence,
    );
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().coverageNudgeLastShownAt).toBe(stamp);
  });

  it('is not clobbered when another setting is written', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);

    await useSettingsStore.getState().markCoverageNudgeShown();
    const stamp = useSettingsStore.getState().coverageNudgeLastShownAt;
    await useSettingsStore.getState().setAiRefineEnabled(false);

    expect(saved.at(-1)?.coverageNudgeLastShownAt).toBe(stamp);
  });
});

// Roadmap step 38: "Not now" on Home's reminder prompt survives a restart.
describe('settingsStore: reminder prompt cooldown', () => {
  it('records the dismissal and persists it', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);

    await useSettingsStore.getState().dismissReminderPrompt();

    const at = useSettingsStore.getState().reminderPromptDismissedAt;
    expect(at).not.toBeNull();
    expect(saved[0]?.reminderPromptDismissedAt).toBe(at);
    expect(saved[0]?.reminderPromptDismissals).toBe(1);

    // Roadmap D19: the count drives next-morning, then a week.
    await useSettingsStore.getState().dismissReminderPrompt();
    expect(useSettingsStore.getState().reminderPromptDismissals).toBe(2);
  });

  // Roadmap step 89: the practice reminder's time, off until it's chosen.
  it('stores the practice reminder time, and turns it off', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);
    expect(useSettingsStore.getState().practiceReminder).toBeNull();

    await useSettingsStore.getState().setPracticeReminder({ hour: 8, minute: 0 });
    expect(useSettingsStore.getState().practiceReminder).toEqual({ hour: 8, minute: 0 });
    expect(saved.at(-1)?.practiceReminder).toEqual({ hour: 8, minute: 0 });

    await useSettingsStore.getState().setPracticeReminder(null);
    expect(saved.at(-1)?.practiceReminder).toBeNull();
  });

  it('drops a stored practice reminder time that is not a time', async () => {
    __setPersistenceForTests(
      makeFakePersistence({ practiceReminder: { hour: 25, minute: 0 } } as never).persistence,
    );
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().practiceReminder).toBeNull();

    __setPersistenceForTests(
      makeFakePersistence({ practiceReminder: { hour: 20, minute: 30 } }).persistence,
    );
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().practiceReminder).toEqual({ hour: 20, minute: 30 });
  });

  it('remembers when the practice reminder offer was waved off', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().dismissPracticeReminderOffer();
    const at = useSettingsStore.getState().practiceReminderOfferDismissedAt;
    expect(typeof at).toBe('string');
    expect(saved.at(-1)?.practiceReminderOfferDismissedAt).toBe(at);
  });
});
