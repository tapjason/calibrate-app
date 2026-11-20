// Tests for the L4 settings store. Persistence is swapped for an in-memory
// fake via __setPersistenceForTests so nothing touches native AsyncStorage.

import { AppState } from 'react-native';

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
      usageNoticeShownAt: null,
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
      usageNoticeShownAt: null,
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
    // Round 5 (2026-11-19): the share card's shape isn't a change made in
    // You, so it is held in memory and stores nothing while the record
    // can't be read.
    await useSettingsStore.getState().setCardFormat('story');
    expect(saved).toHaveLength(0);
    // A change in You stores the whole snapshot, the private sides with it.
    await useSettingsStore.getState().setDigestEnabled(false);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ ...PRIVATE, cardFormat: 'story', digestEnabled: false });
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

// D69 (b): when the line about usage counts (the Warm-up's first screen) was
// first shown. A guest's counts go up only once it has been.
describe('settingsStore: when the line about usage counts was first shown', () => {
  const SHOWN = '2026-11-19T09:00:00.000Z';

  it('starts as never shown', () => {
    __setPersistenceForTests(makeFakePersistence().persistence);
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
  });

  it('is stamped now and saved, once: a later showing keeps the first and writes nothing', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);

    const before = Date.now();
    await useSettingsStore.getState().markUsageNoticeShown();
    const stamp = useSettingsStore.getState().usageNoticeShownAt;
    expect(stamp).not.toBeNull();
    expect(Date.parse(stamp!)).toBeGreaterThanOrEqual(before);
    expect(saved).toHaveLength(1);
    expect(saved[0].usageNoticeShownAt).toBe(stamp);

    await useSettingsStore.getState().markUsageNoticeShown();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBe(stamp);
    expect(saved).toHaveLength(1);
  });

  it('keeps a stamp read from the record: showing it again moves nothing', async () => {
    const { persistence, saved } = makeFakePersistence({ usageNoticeShownAt: SHOWN });
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBe(SHOWN);

    await useSettingsStore.getState().markUsageNoticeShown();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBe(SHOWN);
    expect(saved).toHaveLength(0);
  });

  it('survives a restart, and is kept when another setting is written', async () => {
    const { persistence, saved } = makeFakePersistence();
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().markUsageNoticeShown();
    const stamp = useSettingsStore.getState().usageNoticeShownAt;
    await useSettingsStore.getState().setStreakShown(false);
    expect(saved.at(-1)?.usageNoticeShownAt).toBe(stamp);

    __setPersistenceForTests(makeFakePersistence(saved.at(-1)!).persistence);
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBe(stamp);
  });

  it.each([
    ['a number', 7],
    ['a string that is not a time', 'yes'],
    ['true', true],
  ])('reads %s stored as never shown', async (_label, value) => {
    __setPersistenceForTests(
      makeFakePersistence({ usageNoticeShownAt: value } as unknown as Partial<StoredSettings>).persistence,
    );
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
  });

  // Erase and account deletion call this (authStore), with the Warm-up's own
  // reset: a fresh start shows the line again before anything goes up.
  it('is forgotten, and that is saved', async () => {
    const { persistence, saved } = makeFakePersistence({ usageNoticeShownAt: SHOWN });
    __setPersistenceForTests(persistence);
    await useSettingsStore.getState().hydrate();

    await useSettingsStore.getState().forgetUsageNoticeShown();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    expect(saved.at(-1)?.usageNoticeShownAt).toBeNull();

    // And the next showing stamps afresh.
    await useSettingsStore.getState().markUsageNoticeShown();
    expect(useSettingsStore.getState().usageNoticeShownAt).not.toBeNull();
    expect(useSettingsStore.getState().usageNoticeShownAt).not.toBe(SHOWN);
  });

  it('goes back to never shown with the other settings', async () => {
    __setPersistenceForTests(makeFakePersistence({ usageNoticeShownAt: SHOWN }).persistence);
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().resetToDefaults();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
  });
});

// Client re-review, round 5 (2026-11-19), LOW-C: after a record that couldn't
// be read, the next automatic write (a cooldown, a checkpoint's day) stored
// the defaults over it, turning notifications back on for someone who had
// turned them off. Until a read succeeds, only a change the person makes in
// You is stored; the rest is held in memory and applied over the record once
// it reads, which is tried again at each return to the foreground.
describe('settingsStore: what is stored while the record cannot be read', () => {
  type Store = ReturnType<typeof useSettingsStore.getState>;
  const PRIVATE = { appLock: true, hideTitles: true, reminderWords: false, analyticsEnabled: false };

  /** A record that is there but can't be read until heal(); every save kept. */
  function flakyRecord(initial: Partial<StoredSettings> | null) {
    let stored = initial;
    let readable = false;
    let loads = 0;
    const saved: StoredSettings[] = [];
    const persistence: SettingsPersistence = {
      async load() {
        loads += 1;
        if (!readable) throw new Error('read failed');
        return stored;
      },
      async save(s) {
        saved.push(s);
        stored = s;
      },
    };
    return {
      persistence,
      saved,
      heal: () => {
        readable = true;
      },
      loads: () => loads,
      stored: () => stored,
    };
  }

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  /** The foreground listener the store adds, and a way to fire it. */
  function watchAppState() {
    const remove = jest.fn();
    let listener: ((state: string) => void) | null = null;
    // jest-expo's AppState.addEventListener is already a mock, so the spy is
    // the same function in every test: cleared here, so counts are per test.
    const add = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, fn) => {
        listener = fn as (state: string) => void;
        return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
      })
      .mockClear();
    const fire = async (state: string) => {
      listener?.(state);
      await settle();
    };
    return { add, remove, foreground: () => fire('active'), background: () => fire('background') };
  }

  const store = () => useSettingsStore.getState();

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('an automatic write stores nothing, so a record that only failed to read keeps its choices', async () => {
    const record = { notificationsEnabled: false, digestEnabled: false, streakShown: false };
    const rec = flakyRecord(record);
    __setPersistenceForTests(rec.persistence);
    watchAppState();
    await store().hydrate();
    expect(store().loadFailed).toBe(true);

    await store().markCoverageNudgeShown();
    await store().setStreakMomentDay('Thu Nov 19 2026');

    expect(rec.saved).toHaveLength(0);
    expect(rec.stored()).toEqual(record);
    // Each still applies in memory, this session.
    expect(store().coverageNudgeLastShownAt).not.toBeNull();
    expect(store().streakMomentDay).toBe('Thu Nov 19 2026');
  });

  it.each<[string, (s: Store) => Promise<void>, Partial<StoredSettings>]>([
    ['markCoverageNudgeShown', (s) => s.markCoverageNudgeShown(), {}],
    ['markRatingAsked', (s) => s.markRatingAsked(), {}],
    ['setStreakMomentDay', (s) => s.setStreakMomentDay('Thu Nov 19 2026'), { streakMomentDay: 'Thu Nov 19 2026' }],
    ['dismissReminderPrompt', (s) => s.dismissReminderPrompt(), { reminderPromptDismissals: 1 }],
    ['dismissBackupNudge', (s) => s.dismissBackupNudge(), {}],
    [
      'dismissWelcomeBack',
      (s) => s.dismissWelcomeBack('2026-11-01T10:00:00.000Z'),
      { welcomeBackDismissedFor: '2026-11-01T10:00:00.000Z' },
    ],
    ['dismissPracticeReminderOffer', (s) => s.dismissPracticeReminderOffer(), {}],
    ['setCardThemeId', (s) => s.setCardThemeId('paper'), { cardThemeId: 'paper' }],
    ['setCardFormat', (s) => s.setCardFormat('story'), { cardFormat: 'story' }],
    ['setCardHiddenCategories', (s) => s.setCardHiddenCategories(['work']), { cardHiddenCategories: ['work'] }],
    ['markUsageNoticeShown', (s) => s.markUsageNoticeShown(), {}],
    [
      'forgetUsageNoticeShown',
      async (s) => {
        // Held, which counts as done (`save`): Erase reports only a write that failed.
        await expect(s.forgetUsageNoticeShown()).resolves.toBe(true);
      },
      { usageNoticeShownAt: null },
    ],
  ])('%s is held in memory and not stored', async (_name, run, inMemory) => {
    const rec = flakyRecord({ notificationsEnabled: false });
    __setPersistenceForTests(rec.persistence);
    watchAppState();
    await store().hydrate();

    await run(store());

    expect(rec.saved).toHaveLength(0);
    expect(store()).toMatchObject({ ...PRIVATE, ...inMemory, loadFailed: true });
    // No second read: only a change in You reads the record again.
    expect(rec.loads()).toBe(2);
  });

  it.each<[string, (s: Store) => Promise<void>, Partial<StoredSettings>]>([
    ['setNotificationsEnabled', (s) => s.setNotificationsEnabled(false), { notificationsEnabled: false }],
    ['setRemindersEnabled', (s) => s.setRemindersEnabled(false), { remindersEnabled: false }],
    ['setDigestEnabled', (s) => s.setDigestEnabled(false), { digestEnabled: false }],
    [
      'setDueReminderTime',
      (s) => s.setDueReminderTime({ hour: 20, minute: 30 }),
      { dueReminderTime: { hour: 20, minute: 30 } },
    ],
    ['setDigestDay', (s) => s.setDigestDay(3), { digestDay: 3 }],
    ['setDigestTime', (s) => s.setDigestTime({ hour: 9, minute: 15 }), { digestTime: { hour: 9, minute: 15 } }],
    ['setAiRefineEnabled', (s) => s.setAiRefineEnabled(false), { aiRefineEnabled: false }],
    ['setCoachEnabled', (s) => s.setCoachEnabled(true), { coachEnabled: true }],
    ['setAnalyticsEnabled', (s) => s.setAnalyticsEnabled(true), { analyticsEnabled: true }],
    ['setStreakShown', (s) => s.setStreakShown(false), { streakShown: false }],
    ['setReminderWords', (s) => s.setReminderWords(true), { reminderWords: true }],
    ['setHideTitles', (s) => s.setHideTitles(false), { hideTitles: false }],
    ['setAppLock', (s) => s.setAppLock(false), { appLock: false }],
    [
      'setPracticeReminder',
      (s) => s.setPracticeReminder({ hour: 8, minute: 0 }),
      { practiceReminder: { hour: 8, minute: 0 } },
    ],
  ])(
    '%s, a change in You, is stored with the private sides when the record still cannot be read',
    async (_name, run, changed) => {
      const rec = flakyRecord(null);
      __setPersistenceForTests(rec.persistence);
      const app = watchAppState();
      await store().hydrate();

      await run(store());

      // The record was read once more first (two reads at launch, one now).
      expect(rec.loads()).toBe(3);
      expect(rec.saved).toHaveLength(1);
      expect(rec.saved[0]).toMatchObject({ ...PRIVATE, ...changed });
      // A record now exists that reads: nothing is left to protect.
      expect(store().loadFailed).toBe(false);
      expect(app.remove).toHaveBeenCalledTimes(1);
    },
  );

  it('a change in You reads the record again first, and one that reads now is kept, with every held change on top', async () => {
    const rec = flakyRecord({
      notificationsEnabled: false,
      hideTitles: false,
      analyticsEnabled: true,
      reminderPromptDismissedAt: '2026-11-01T10:00:00.000Z',
      reminderPromptDismissals: 2,
    });
    __setPersistenceForTests(rec.persistence);
    const app = watchAppState();
    await store().hydrate();

    await store().markCoverageNudgeShown();
    const stamp = store().coverageNudgeLastShownAt;
    await store().dismissReminderPrompt();
    expect(store().reminderPromptDismissals).toBe(1); // counted on the defaults, in memory
    expect(rec.saved).toHaveLength(0);

    rec.heal();
    await store().setDigestEnabled(false);

    expect(rec.saved).toHaveLength(1);
    const expected = {
      notificationsEnabled: false, // the record's, not the default
      hideTitles: false, // the record's, not the private side
      analyticsEnabled: true, // the record's
      appLock: false, // the record has none: the default
      digestEnabled: false, // the change
      coverageNudgeLastShownAt: stamp, // held, then applied
      reminderPromptDismissals: 3, // counted again, on the record's 2
    };
    expect(rec.saved[0]).toMatchObject(expected);
    expect(store()).toMatchObject({ ...expected, loadFailed: false });
    expect(app.remove).toHaveBeenCalledTimes(1);
  });

  it('the read is tried again at each return to the foreground, and a record that reads is loaded with what was held', async () => {
    const rec = flakyRecord({ notificationsEnabled: false, appLock: false, hideTitles: false, analyticsEnabled: true });
    const app = watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();
    expect(app.add).toHaveBeenCalledTimes(1);

    await store().setCardFormat('story');

    // Still unreadable: nothing changes, nothing is stored.
    await app.foreground();
    expect(rec.loads()).toBe(3);
    expect(store()).toMatchObject({ ...PRIVATE, loadFailed: true });
    expect(rec.saved).toHaveLength(0);

    rec.heal();
    // Going to the background reads nothing.
    await app.background();
    expect(rec.loads()).toBe(3);

    await app.foreground();
    const expected = { notificationsEnabled: false, appLock: false, hideTitles: false, analyticsEnabled: true };
    expect(store()).toMatchObject({ ...expected, cardFormat: 'story', loadFailed: false });
    // Stored once, with the held change, so it survives a restart.
    expect(rec.saved).toHaveLength(1);
    expect(rec.saved[0]).toMatchObject({ ...expected, cardFormat: 'story' });
    expect(app.remove).toHaveBeenCalledTimes(1);

    // From here an automatic change is stored as usual.
    await store().markRatingAsked();
    expect(rec.saved).toHaveLength(2);
  });

  it('a record that reads again with nothing held is loaded and not written again', async () => {
    const rec = flakyRecord({ notificationsEnabled: false, appLock: false });
    const app = watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();

    rec.heal();
    await app.foreground();

    expect(store()).toMatchObject({ notificationsEnabled: false, appLock: false, loadFailed: false });
    expect(rec.saved).toHaveLength(0);
  });

  it('a read that then finds no record keeps the private sides', async () => {
    const rec = flakyRecord(null);
    const app = watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();

    rec.heal();
    await app.foreground();

    expect(store()).toMatchObject({ ...PRIVATE, loadFailed: true });
    expect(rec.saved).toHaveLength(0);
    expect(app.remove).not.toHaveBeenCalled();
  });

  it('a change in You whose write fails leaves the record unreadable, and automatic changes still store nothing', async () => {
    let saves = 0;
    __setPersistenceForTests({
      load: async () => {
        throw new Error('read failed');
      },
      save: async () => {
        saves += 1;
        throw new Error('write failed');
      },
    });
    watchAppState();
    await store().hydrate();

    await store().setDigestEnabled(false);
    expect(saves).toBe(1);
    expect(store()).toMatchObject({ digestEnabled: false, loadFailed: true });

    await store().markCoverageNudgeShown();
    expect(saves).toBe(1);
  });

  it('a change held while a change in You is being written is stored after it', async () => {
    const saved: StoredSettings[] = [];
    let release: () => void = () => {};
    __setPersistenceForTests({
      load: async () => {
        throw new Error('read failed');
      },
      save: (s) => {
        saved.push(s);
        if (saved.length > 1) return Promise.resolve();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    watchAppState();
    await store().hydrate();

    const inYou = store().setDigestEnabled(false);
    await settle();
    expect(saved).toHaveLength(1);
    // The write is under way; the nudge's cooldown comes in meanwhile.
    await store().markCoverageNudgeShown();
    const stamp = store().coverageNudgeLastShownAt;
    expect(saved[0].coverageNudgeLastShownAt).toBeNull();

    release();
    await inYou;

    expect(store().loadFailed).toBe(false);
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({ ...PRIVATE, digestEnabled: false, coverageNudgeLastShownAt: stamp });
  });

  // D69 (b): the line about usage counts shown while the record can't be read.
  // The stamp counts at once in memory (the gate reads it there; usage stats
  // read as off meanwhile), and is replayed over the record, never lost.
  it('a showing of the usage line is held, read in memory, and stored once the record reads', async () => {
    const rec = flakyRecord({ notificationsEnabled: false, analyticsEnabled: true });
    const app = watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();

    await store().markUsageNoticeShown();
    const stamp = store().usageNoticeShownAt;
    expect(stamp).not.toBeNull();
    expect(rec.saved).toHaveLength(0);
    // A second showing while held adds nothing.
    await store().markUsageNoticeShown();
    expect(store().usageNoticeShownAt).toBe(stamp);

    rec.heal();
    await app.foreground();

    expect(store()).toMatchObject({
      notificationsEnabled: false,
      analyticsEnabled: true,
      usageNoticeShownAt: stamp,
      loadFailed: false,
    });
    expect(rec.saved).toHaveLength(1);
    expect(rec.saved[0]).toMatchObject({ notificationsEnabled: false, usageNoticeShownAt: stamp });
  });

  it('a held showing of the usage line keeps the earlier one the record holds', async () => {
    const earlier = '2026-11-01T09:00:00.000Z';
    const rec = flakyRecord({ usageNoticeShownAt: earlier, cardFormat: 'post' });
    const app = watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();

    await store().markUsageNoticeShown();
    expect(store().usageNoticeShownAt).not.toBe(earlier); // memory held only the defaults
    await store().setCardFormat('story');

    rec.heal();
    await app.foreground();

    expect(store()).toMatchObject({ usageNoticeShownAt: earlier, cardFormat: 'story', loadFailed: false });
    expect(rec.saved).toHaveLength(1);
    expect(rec.saved[0]).toMatchObject({ usageNoticeShownAt: earlier, cardFormat: 'story' });
  });

  it('a showing of the usage line held when a change in You writes a new record is in it', async () => {
    const rec = flakyRecord(null);
    watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();

    await store().markUsageNoticeShown();
    const stamp = store().usageNoticeShownAt;
    await store().setDigestEnabled(false);

    expect(rec.saved).toHaveLength(1);
    expect(rec.saved[0]).toMatchObject({ ...PRIVATE, digestEnabled: false, usageNoticeShownAt: stamp });
  });

  it('forgetting the usage line while held (Erase) is replayed over a record that holds a showing', async () => {
    const rec = flakyRecord({ usageNoticeShownAt: '2026-11-01T09:00:00.000Z' });
    const app = watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();

    await store().forgetUsageNoticeShown();
    expect(rec.saved).toHaveLength(0);

    rec.heal();
    await app.foreground();

    expect(store()).toMatchObject({ usageNoticeShownAt: null, loadFailed: false });
    expect(rec.saved).toHaveLength(1);
    expect(rec.saved[0].usageNoticeShownAt).toBeNull();
  });

  it('watches for the foreground only after a read that failed', async () => {
    const app = watchAppState();
    __setPersistenceForTests(makeFakePersistence({ notificationsEnabled: false }).persistence);
    await store().hydrate();
    expect(app.add).not.toHaveBeenCalled();
    expect(store().loadFailed).toBe(false);
  });

  it('resetToDefaults writes a fresh record, ends the failed state and stops watching', async () => {
    const rec = flakyRecord({ notificationsEnabled: false });
    const app = watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();

    await store().resetToDefaults();

    expect(store().loadFailed).toBe(false);
    expect(app.remove).toHaveBeenCalledTimes(1);
    expect(rec.saved).toHaveLength(1);
    expect(rec.saved[0]).toMatchObject({ notificationsEnabled: true, appLock: false, analyticsEnabled: true });
  });

  // D73 (2026-11-20): a record a development build wrote with the support
  // card's set-asides, unreadable at launch, still holds them on disk; nothing
  // reads them, and they go with the first rewrite once it reads.
  it('a record holding the retired set-asides that reads at a return to the foreground is rewritten without them', async () => {
    const record = { notificationsEnabled: false, digestDay: 3, analyticsEnabled: true, analyticsChosen: true };
    const rec = flakyRecord({ ...record, supportAsideKeys: ['p1#0123456789abcdef'] } as Partial<StoredSettings>);
    const app = watchAppState();
    __setPersistenceForTests(rec.persistence);
    await store().hydrate();
    expect(store().loadFailed).toBe(true);
    // Not touched while it can't be read.
    expect(rec.saved).toHaveLength(0);
    expect(rec.stored()).toHaveProperty('supportAsideKeys');

    rec.heal();
    await app.foreground();

    expect(store()).toMatchObject({ ...record, loadFailed: false });
    expect(rec.saved).toHaveLength(1);
    expect(rec.saved[0]).toMatchObject(record);
    expect(rec.stored()).not.toHaveProperty('supportAsideKeys');
  });
});

// D73 (2026-11-20): the Coach's support card is gone, and with it the keys a
// development build stored when it was set aside. A record that still holds
// them is rewritten once without them when the settings hydrate, every other
// value as read, and no write carries them.
describe('settingsStore: the retired support-card set-asides (D73)', () => {
  const RETIRED_KEYS = ['p1#0123456789abcdef', 'p2#fedcba9876543210'];
  const withRetired = (record: Partial<StoredSettings>) =>
    ({ ...record, supportAsideKeys: RETIRED_KEYS }) as Partial<StoredSettings>;

  /** Every value away from its default, Usage stats chosen. */
  const RECORD: Partial<StoredSettings> = {
    notificationsEnabled: false,
    remindersEnabled: false,
    digestEnabled: false,
    dueReminderTime: { hour: 20, minute: 30 },
    digestDay: 3,
    digestTime: { hour: 9, minute: 15 },
    coachEnabled: true,
    analyticsEnabled: true,
    analyticsChosen: true,
    streakShown: false,
    reminderWords: true,
    hideTitles: true,
    appLock: true,
    cardFormat: 'story',
    cardHiddenCategories: ['work'],
    coverageNudgeLastShownAt: '2026-11-10T10:00:00.000Z',
    practiceReminder: { hour: 8, minute: 0 },
    streakMomentDay: 'Thu Nov 19 2026',
    usageNoticeShownAt: '2026-11-01T09:00:00.000Z',
  };

  it('rewrites a record that holds them, once, without them, every other setting and analyticsChosen kept', async () => {
    const { persistence, saved } = makeFakePersistence(withRetired(RECORD));
    __setPersistenceForTests(persistence);

    await useSettingsStore.getState().hydrate();

    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty('supportAsideKeys');
    expect(saved[0]).toMatchObject(RECORD);
    expect(useSettingsStore.getState()).toMatchObject({ ...RECORD, loadFailed: false, hydrated: true });
    expect(useSettingsStore.getState()).not.toHaveProperty('supportAsideKeys');

    // Once: the next launch reads a record without them, and writes nothing.
    useSettingsStore.setState({ hydrated: false });
    await useSettingsStore.getState().hydrate();
    expect(saved).toHaveLength(1);
  });

  it('keeps a record from an earlier build as it reads: Usage stats off and not chosen stays so', async () => {
    const earlier = { analyticsEnabled: false, notificationsEnabled: false };
    const { persistence, saved } = makeFakePersistence(withRetired(earlier));
    __setPersistenceForTests(persistence);

    await useSettingsStore.getState().hydrate();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject(earlier);
    expect(saved[0]).not.toHaveProperty('analyticsChosen');
    expect(saved[0]).not.toHaveProperty('supportAsideKeys');
    expect(useSettingsStore.getState()).toMatchObject({ ...earlier, analyticsChosen: false });
  });

  it('writes nothing at hydrate for a record without them', async () => {
    const { persistence, saved } = makeFakePersistence(RECORD);
    __setPersistenceForTests(persistence);

    await useSettingsStore.getState().hydrate();

    expect(saved).toHaveLength(0);
    expect(useSettingsStore.getState()).toMatchObject(RECORD);
  });

  it('carries them in no later write, even when the rewrite at hydrate failed', async () => {
    let stored: Partial<StoredSettings> | null = withRetired(RECORD);
    let failNext = true;
    const saved: StoredSettings[] = [];
    __setPersistenceForTests({
      load: async () => stored,
      save: async (next) => {
        if (failNext) {
          failNext = false;
          throw new Error('write failed');
        }
        saved.push(next);
        stored = next;
      },
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await useSettingsStore.getState().hydrate();
      // The rewrite didn't land: the record on disk still has them.
      expect(stored).toHaveProperty('supportAsideKeys');

      await useSettingsStore.getState().markRatingAsked();

      expect(saved).toHaveLength(1);
      expect(saved[0]).not.toHaveProperty('supportAsideKeys');
      expect(saved[0]).toMatchObject(RECORD);
      expect(stored).not.toHaveProperty('supportAsideKeys');
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('leaves a record that cannot be read as it is, holding the defaults with every privacy choice on its private side', async () => {
    const { persistence, saved } = makeFakePersistence(withRetired(RECORD), { loadThrows: true });
    __setPersistenceForTests(persistence);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      () => ({ remove: () => undefined }) as unknown as ReturnType<typeof AppState.addEventListener>,
    );
    try {
      await useSettingsStore.getState().hydrate();

      expect(saved).toHaveLength(0);
      expect(useSettingsStore.getState()).toMatchObject({
        loadFailed: true,
        appLock: true,
        hideTitles: true,
        reminderWords: false,
        analyticsEnabled: false,
      });
      expect(useSettingsStore.getState()).not.toHaveProperty('supportAsideKeys');
    } finally {
      jest.restoreAllMocks();
    }
  });
});
