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

// Security review, 2026-11-18, round 4: the phone's notification permission,
// held for the paywall's trial timeline. The phone's state, not a setting.
describe('settingsStore: notificationPermission', () => {
  it('is unknown (null) until it has been read', () => {
    __setPersistenceForTests(makeFakePersistence().persistence);
    expect(useSettingsStore.getState().notificationPermission).toBeNull();
  });

  it('is held in memory and never stored', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);

    useSettingsStore.getState().setNotificationPermission('granted');
    expect(useSettingsStore.getState().notificationPermission).toBe('granted');
    expect(saved).toHaveLength(0);

    // A setting saved afterwards stores its snapshot without it.
    await useSettingsStore.getState().setStreakShown(false);
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty('notificationPermission');

    useSettingsStore.getState().setNotificationPermission(null);
    expect(useSettingsStore.getState().notificationPermission).toBeNull();
  });

  it('is left alone by hydrate and by a reset of the settings, whatever was stored', async () => {
    __setPersistenceForTests(
      makeFakePersistence({ notificationPermission: 'granted' } as Partial<StoredSettings>)
        .persistence,
    );
    await useSettingsStore.getState().hydrate();
    // A stored value is never read: the phone is asked instead.
    expect(useSettingsStore.getState().notificationPermission).toBeNull();

    useSettingsStore.getState().setNotificationPermission('denied');
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().resetToDefaults();
    expect(useSettingsStore.getState().notificationPermission).toBe('denied');
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
      dueReminderTime: { hour: 19, minute: 0 },
      digestDay: 0,
      digestTime: { hour: 18, minute: 0 },
      aiRefineEnabled: true,
      coachEnabled: false,
      analyticsEnabled: true,
      streakShown: true,
      reminderWords: false,
      hideTitles: false,
      appLock: false,
      cardThemeId: 'midnight',
      cardFormat: 'post',
      cardHiddenCategories: [],
      coverageNudgeLastShownAt: null,
      reminderPromptDismissedAt: null,
      reminderPromptDismissals: 0,
      backupNudgeDismissedAt: null,
      welcomeBackDismissedFor: null,
      ratingAskedAt: null,
      practiceReminder: null,
      practiceReminderOfferDismissedAt: null,
      streakMomentDay: null,
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
      dueReminderTime: { hour: 19, minute: 0 },
      digestDay: 0,
      digestTime: { hour: 18, minute: 0 },
      aiRefineEnabled: false,
      coachEnabled: false,
      analyticsEnabled: true,
      streakShown: true,
      reminderWords: false,
      hideTitles: false,
      appLock: false,
      cardThemeId: 'midnight',
      cardFormat: 'post',
      cardHiddenCategories: [],
      coverageNudgeLastShownAt: null,
      reminderPromptDismissedAt: null,
      reminderPromptDismissals: 0,
      backupNudgeDismissedAt: null,
      welcomeBackDismissedFor: null,
      ratingAskedAt: null,
      practiceReminder: null,
      practiceReminderOfferDismissedAt: null,
      streakMomentDay: null,
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

// Blind playtest 2026-11-12b, finding 24: the playtest loader erases, and
// Erase keeps settings, so one tester's card left-offs reached the next.
describe('settingsStore: resetToDefaults', () => {
  it("puts every setting back to a fresh install's and stores that", async () => {
    const fake = makeFakePersistence({
      cardHiddenCategories: ['work'],
      cardFormat: 'story',
      reminderPromptDismissals: 2,
      notificationsEnabled: false,
    });
    __setPersistenceForTests(fake.persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().cardHiddenCategories).toEqual(['work']);

    await useSettingsStore.getState().resetToDefaults();

    const state = useSettingsStore.getState();
    expect(state.cardHiddenCategories).toEqual([]);
    expect(state.cardFormat).toBe('post');
    expect(state.reminderPromptDismissals).toBe(0);
    expect(state.notificationsEnabled).toBe(true);
    expect(fake.saved.at(-1)?.cardHiddenCategories).toEqual([]);
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

// Blind playtest 2026-11-01 (run 5): the card's shape and hidden categories
// reset each time Share opened.
describe('settingsStore: share card choices', () => {
  it('keeps the shape and the hidden categories, and persists them', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().setCardFormat('story');
    await useSettingsStore.getState().setCardHiddenCategories(['finance', 'work']);
    expect(useSettingsStore.getState().cardFormat).toBe('story');
    // Kept in the app's category order, whatever order they came in.
    expect(saved.at(-1)?.cardHiddenCategories).toEqual(['work', 'finance']);
  });

  it('reads back only a known shape and known categories', async () => {
    __setPersistenceForTests(
      makeFakePersistence({
        cardFormat: 'square',
        cardHiddenCategories: ['health', 'travel', 'health'],
      } as never).persistence,
    );
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().cardFormat).toBe('post');
    expect(useSettingsStore.getState().cardHiddenCategories).toEqual(['health']);

    __setPersistenceForTests(
      makeFakePersistence({ cardFormat: 'story', cardHiddenCategories: 'health' } as never)
        .persistence,
    );
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().cardFormat).toBe('story');
    expect(useSettingsStore.getState().cardHiddenCategories).toEqual([]);
  });
});

// Roadmap D64 (step 180): the app lock's choice.
describe('settingsStore: the app lock', () => {
  it('is off by default, and off for anything stored that is not true or false', async () => {
    __setPersistenceForTests(
      makeFakePersistence({ appLock: 'yes' } as unknown as Partial<StoredSettings>).persistence,
    );
    expect(useSettingsStore.getState().appLock).toBe(false);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().appLock).toBe(false);
  });

  it('comes back on after a restart, and is saved when changed', async () => {
    const { persistence, saved } = makeFakePersistence({ appLock: true });
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().appLock).toBe(true);
    await useSettingsStore.getState().setAppLock(false);
    expect(saved[saved.length - 1].appLock).toBe(false);
    await useSettingsStore.getState().setAppLock(true);
    expect(saved[saved.length - 1].appLock).toBe(true);
  });

  // Security review, 2026-11-18, reversing step 180's choice: a failed read
  // turned the lock off, and the next write of any setting stored that over
  // a record that may have had it on. It now reads as on; Face ID or the
  // passcode opens it, and a phone without one is offered Continue
  // (lockStore.test.ts), so nobody is stranded.
  it('reads as on when the stored settings cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    __setPersistenceForTests(makeFakePersistence({ appLock: true }, { loadThrows: true }).persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().appLock).toBe(true);
    expect(useSettingsStore.getState().loadFailed).toBe(true);
    jest.restoreAllMocks();
  });
});

// Security review, 2026-11-18: a settings record that can't be read must not
// turn the app lock off, now or at the next write.
describe('settingsStore: a settings record that cannot be read', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('a fresh install, with no record, stays unlocked', async () => {
    __setPersistenceForTests(makeFakePersistence(null).persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState()).toMatchObject({ appLock: false, loadFailed: false, hydrated: true });
  });

  it.each([
    ['a string', 'appLock: true'],
    ['a list', [true]],
    ['a number', 7],
  ])('a record that is %s reads as unreadable, with the lock on', async (_label, stored) => {
    __setPersistenceForTests(makeFakePersistence(stored as unknown as Partial<StoredSettings>).persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState()).toMatchObject({ appLock: true, loadFailed: true, hydrated: true });
  });

  it('a read that fails once, then works, reads the record', async () => {
    let calls = 0;
    __setPersistenceForTests({
      load: async () => {
        calls += 1;
        if (calls === 1) throw new Error('busy');
        return { appLock: false, hideTitles: true };
      },
      save: async () => {},
    });
    await useSettingsStore.getState().hydrate();
    expect(calls).toBe(2);
    expect(useSettingsStore.getState()).toMatchObject({ appLock: false, hideTitles: true, loadFailed: false });
  });

  it('a later write of another setting stores the lock on, not off', async () => {
    const { persistence, saved } = makeFakePersistence({ appLock: true }, { loadThrows: true });
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().setStreakShown(false);
    expect(saved[saved.length - 1]).toMatchObject({ appLock: true, streakShown: false });
  });

  it('turning the lock off afterwards is stored as usual', async () => {
    const { persistence, saved } = makeFakePersistence(null, { loadThrows: true });
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().setAppLock(false);
    expect(useSettingsStore.getState().appLock).toBe(false);
    expect(saved[saved.length - 1].appLock).toBe(false);
  });

  // The real persistence: AsyncStorage's text, parsed.
  describe('through AsyncStorage', () => {
    async function hydrateFrom(raw: string | null) {
      let state: { appLock: boolean; loadFailed: boolean } | null = null;
      await jest.isolateModulesAsync(async () => {
        jest.doMock('@react-native-async-storage/async-storage', () => ({
          __esModule: true,
          default: { getItem: jest.fn(async () => raw), setItem: jest.fn(async () => {}) },
        }));
        const { useSettingsStore: store } = require('./settingsStore') as typeof import('./settingsStore');
        await store.getState().hydrate();
        state = { appLock: store.getState().appLock, loadFailed: store.getState().loadFailed };
      });
      return state!;
    }

    it('no record is a fresh install', async () => {
      await expect(hydrateFrom(null)).resolves.toEqual({ appLock: false, loadFailed: false });
    });

    it('a record cut short locks', async () => {
      await expect(hydrateFrom('{"appLock":')).resolves.toEqual({ appLock: true, loadFailed: true });
    });

    it('a record of the text null locks', async () => {
      await expect(hydrateFrom('null')).resolves.toEqual({ appLock: true, loadFailed: true });
    });

    it('an empty record locks', async () => {
      await expect(hydrateFrom('')).resolves.toEqual({ appLock: true, loadFailed: true });
    });

    it('a readable record is read', async () => {
      await expect(hydrateFrom('{"appLock":false}')).resolves.toEqual({ appLock: false, loadFailed: false });
    });
  });
});

// Security review, 2026-11-18, round 3: after a record that couldn't be read,
// "Hide the words" fell back to off and usage stats to on, so someone who had
// hidden their words saw them, and someone who had opted out was recorded
// again (and the next write of any setting stored that). Each privacy choice
// now takes its private side, as the lock does.
describe('settingsStore: privacy choices after a record that cannot be read', () => {
  const PRIVATE = { appLock: true, hideTitles: true, reminderWords: false, analyticsEnabled: false };
  const FRESH = { appLock: false, hideTitles: false, reminderWords: false, analyticsEnabled: true };

  const privacy = () => {
    const s = useSettingsStore.getState();
    return {
      appLock: s.appLock,
      hideTitles: s.hideTitles,
      reminderWords: s.reminderWords,
      analyticsEnabled: s.analyticsEnabled,
      loadFailed: s.loadFailed,
    };
  };

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('a fresh install, with no record, keeps the defaults', async () => {
    __setPersistenceForTests(makeFakePersistence(null).persistence);
    await useSettingsStore.getState().hydrate();
    expect(privacy()).toEqual({ ...FRESH, loadFailed: false });
  });

  it('a record that reads fine keeps every choice as stored, opt-ins included', async () => {
    __setPersistenceForTests(
      makeFakePersistence({ hideTitles: false, reminderWords: true, analyticsEnabled: true, appLock: false })
        .persistence,
    );
    await useSettingsStore.getState().hydrate();
    expect(privacy()).toEqual({
      appLock: false,
      hideTitles: false,
      reminderWords: true,
      analyticsEnabled: true,
      loadFailed: false,
    });
  });

  it('a read that throws twice takes the private side of each', async () => {
    let calls = 0;
    __setPersistenceForTests({
      load: async () => {
        calls += 1;
        throw new Error('read failed');
      },
      save: async () => {},
    });
    await useSettingsStore.getState().hydrate();
    expect(calls).toBe(2);
    expect(privacy()).toEqual({ ...PRIVATE, loadFailed: true });
    expect(useSettingsStore.getState().hydrated).toBe(true);
  });

  it.each([
    ['a string', 'hideTitles: true'],
    ['a list', [true]],
    ['a number', 7],
  ])('a record that is %s takes the private side of each', async (_label, stored) => {
    __setPersistenceForTests(makeFakePersistence(stored as unknown as Partial<StoredSettings>).persistence);
    await useSettingsStore.getState().hydrate();
    expect(privacy()).toEqual({ ...PRIVATE, loadFailed: true });
  });

  it('a read that fails once, then works, reads the record and nothing else changes', async () => {
    let calls = 0;
    __setPersistenceForTests({
      load: async () => {
        calls += 1;
        if (calls === 1) throw new Error('busy');
        return { analyticsEnabled: true, hideTitles: false, reminderWords: true };
      },
      save: async () => {},
    });
    await useSettingsStore.getState().hydrate();
    expect(calls).toBe(2);
    expect(privacy()).toEqual({
      appLock: false,
      hideTitles: false,
      reminderWords: true,
      analyticsEnabled: true,
      loadFailed: false,
    });
  });

  it('a later write of another setting stores the private sides, not the defaults', async () => {
    const { persistence, saved } = makeFakePersistence(null, { loadThrows: true });
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().setCardFormat('story');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ ...PRIVATE, cardFormat: 'story' });
  });

  it('each switch can then be changed as usual, and is stored', async () => {
    const { persistence, saved } = makeFakePersistence(null, { loadThrows: true });
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().hydrate();

    await useSettingsStore.getState().setAnalyticsEnabled(true);
    expect(useSettingsStore.getState().analyticsEnabled).toBe(true);
    expect(saved.at(-1)).toMatchObject({ analyticsEnabled: true, hideTitles: true, reminderWords: false });

    await useSettingsStore.getState().setHideTitles(false);
    expect(useSettingsStore.getState().hideTitles).toBe(false);
    expect(saved.at(-1)).toMatchObject({ analyticsEnabled: true, hideTitles: false, reminderWords: false });

    await useSettingsStore.getState().setReminderWords(true);
    expect(useSettingsStore.getState().reminderWords).toBe(true);
    expect(saved.at(-1)).toMatchObject({ analyticsEnabled: true, hideTitles: false, reminderWords: true });

    await useSettingsStore.getState().setHideTitles(true);
    await useSettingsStore.getState().setReminderWords(false);
    expect(saved.at(-1)).toMatchObject({ hideTitles: true, reminderWords: false });
  });

  // The real persistence: AsyncStorage's text, parsed.
  describe('through AsyncStorage', () => {
    async function hydrateFrom(raw: string | null) {
      let state: ReturnType<typeof privacy> | null = null;
      await jest.isolateModulesAsync(async () => {
        jest.doMock('@react-native-async-storage/async-storage', () => ({
          __esModule: true,
          default: { getItem: jest.fn(async () => raw), setItem: jest.fn(async () => {}) },
        }));
        const { useSettingsStore: store } = require('./settingsStore') as typeof import('./settingsStore');
        await store.getState().hydrate();
        const s = store.getState();
        state = {
          appLock: s.appLock,
          hideTitles: s.hideTitles,
          reminderWords: s.reminderWords,
          analyticsEnabled: s.analyticsEnabled,
          loadFailed: s.loadFailed,
        };
      });
      return state!;
    }

    it('no record is a fresh install', async () => {
      await expect(hydrateFrom(null)).resolves.toEqual({ ...FRESH, loadFailed: false });
    });

    it('a record cut short takes the private side of each', async () => {
      await expect(hydrateFrom('{"analyticsEnabled":false,"hideTi')).resolves.toEqual({
        ...PRIVATE,
        loadFailed: true,
      });
    });

    it('a readable record is read as it is', async () => {
      await expect(
        hydrateFrom('{"analyticsEnabled":true,"hideTitles":false,"reminderWords":true}'),
      ).resolves.toEqual({
        appLock: false,
        hideTitles: false,
        reminderWords: true,
        analyticsEnabled: true,
        loadFailed: false,
      });
    });
  });
});

// Fix 5 (security review, 2026-11-18): Coach off clears the cards on screen.
describe('settingsStore: turning Coach off', () => {
  it("drops the Coach's cards, and turning it on keeps them", async () => {
    const { useCoachStore } = require('./coachStore') as typeof import('./coachStore');
    __setPersistenceForTests(makeFakePersistence().persistence);
    const card = { kind: 'pattern', text: 'x', evidence: 1 } as never;

    useCoachStore.setState({ insights: [card], lastAnsweredAt: '2026-11-18T10:00:00.000Z' });
    await useSettingsStore.getState().setCoachEnabled(true);
    expect(useCoachStore.getState().insights).toHaveLength(1);

    await useSettingsStore.getState().setCoachEnabled(false);
    expect(useCoachStore.getState().insights).toEqual([]);
    expect(useCoachStore.getState().lastAnsweredAt).toBeNull();
  });
});

// Step 194 (D67): the day a streak checkpoint's moment last played, so a
// relaunch the same day doesn't replay it.
describe('settingsStore: the checkpoint moment', () => {
  it('starts with none played, and keeps the day across a restart', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
    await useSettingsStore.getState().setStreakMomentDay('Wed Nov 18 2026');
    expect(saved.at(-1)?.streakMomentDay).toBe('Wed Nov 18 2026');

    // A relaunch reads it back.
    __setPersistenceForTests(makeFakePersistence(saved.at(-1)!).persistence);
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().streakMomentDay).toBe('Wed Nov 18 2026');
  });

  it('forgets it, and reads anything stored that is not a day as none', async () => {
    const { persistence, saved } = makeFakePersistence({ streakMomentDay: 7 } as unknown as Partial<StoredSettings>);
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
    await useSettingsStore.getState().setStreakMomentDay('Wed Nov 18 2026');
    await useSettingsStore.getState().setStreakMomentDay(null);
    expect(saved.at(-1)?.streakMomentDay).toBeNull();
  });

  it('goes back to none with the other settings', async () => {
    __setPersistenceForTests(makeFakePersistence({ streakMomentDay: 'Wed Nov 18 2026' }).persistence);
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().resetToDefaults();
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
  });
});
