// Settings store. Holds device-local user preferences — notification and AI
// refine toggles — and persists them to AsyncStorage. Offline-only: settings
// are not synced to Supabase (per CLAUDE.md they're local preferences).
//
// Layer note: this is L4. It owns no business math and reaches no service.
// The notification services (L5) SUBSCRIBE to this store to react to toggle
// changes — the dependency arrow points L5 → L4, never the reverse, exactly
// like the prediction-store subscriptions in scheduler.ts / digest.ts.

import { create } from 'zustand';

import { clearEvents } from '@/db/analytics';
import { DEFAULT_THEME } from '@/constants/cardThemes';
import { CATEGORIES, isCategory, type Category } from '@/types';

export interface StoredSettings {
  notificationsEnabled: boolean;
  /**
   * Due-day reminders, under the Notifications switch (roadmap D31). Both must
   * be on for a reminder to be scheduled.
   */
  remindersEnabled: boolean;
  /** The weekly digest, under the Notifications switch (roadmap D31). */
  digestEnabled: boolean;
  /**
   * When a due-day reminder fires on its due day (roadmap D38): 7:00 PM
   * unless the person picks another time. The evening was D9's choice, since
   * most of a day's outcomes are known by then.
   */
  dueReminderTime: PracticeReminderTime;
  /** The weekly digest's day, 0 = Sunday … 6 = Saturday (roadmap D38). */
  digestDay: number;
  /** The weekly digest's time (roadmap D38): 6:00 PM unless picked. */
  digestTime: PracticeReminderTime;
  aiRefineEnabled: boolean;
  /** Plus-only Coach insights on the Stats screen. Opt-in — see DEFAULTS. */
  coachEnabled: boolean;
  /**
   * Anonymous product analytics — a closed list of events with no freetext
   * (src/analytics/events.ts). On by default; turning it off clears the queue.
   */
  analyticsEnabled: boolean;
  /**
   * The streak and the daily goal, shown or not (step 173, aggregate B5). On
   * by default. Off hides the streak row and its goal dots, the checkpoints
   * on an answer and the streak on the recap and Insights; the streak is still
   * derived, so turning it back on shows where it stands. Several testers
   * would have left over the pressure (rounds 13–15).
   */
  streakShown: boolean;
  /**
   * Whether a due-day reminder shows the prediction's words (roadmap D60 (b)).
   * Off by default (owner, 2026-11-13: HIG and Guideline 4.5.4 discourage
   * sensitive content in notifications). Off, it says only the day it was made
   * and the number, with no Happened / Didn't, so
   * nothing written shows on a lock screen (four testers over rounds 18–19
   * asked; one turned reminders off "just in case").
   */
  reminderWords: boolean;
  /**
   * Whether Today and History show each prediction's words (D61). Off by
   * default; on, a card shows its category and number until it's opened, for
   * a phone someone else picks up: a health prediction sat word for word at
   * the top of Today, and two testers took to writing in code (blind
   * playtest 2026-11-13c, finding 7).
   */
  hideTitles: boolean;
  /**
   * Whether the app asks for Face ID or the passcode when it opens (roadmap
   * D64, step 180). Off by default. "Hide the words" is a curtain: one tap
   * opens a card (the top privacy finding of blind playtests 2026-11-13e and
   * 2026-11-14). The choice is kept here; whether the app is locked right now
   * is `lockStore`'s, and never stored.
   */
  appLock: boolean;
  /**
   * Chosen share-card theme id (src/constants/cardThemes.ts). Cosmetic only —
   * an id the user is not entitled to resolves back to the free theme at
   * render time, so a lapsed subscriber keeps every card, in the free look.
   */
  cardThemeId: string;
  /**
   * The share card's shape, kept between visits like the theme: it reset to
   * Post each time Share opened (blind playtest 2026-11-01, run 5).
   */
  cardFormat: CardShape;
  /**
   * Categories left off the share card (DESIGN_SYSTEM §7.5), kept like the
   * shape. The card itself never hides every category on file: the last one
   * stays, whatever is stored here.
   */
  cardHiddenCategories: Category[];
  /**
   * ISO timestamp of the last range-coverage nudge on the Log screen, or null
   * if it has never fired. Not a preference the user sets — it is the
   * cooldown's memory, and it lives here because it is device-local, survives
   * a restart, and is never synced, which is exactly what this store is.
   */
  coverageNudgeLastShownAt: string | null;
  /**
   * When the user last answered "Not now" to Home's reminder prompt (roadmap
   * step 38), or null. Like the nudge above, a cooldown's memory: the prompt
   * comes back a week later, since without reminders predictions go
   * unresolved.
   */
  reminderPromptDismissedAt: string | null;
  /**
   * How many times "Not now" has been answered (roadmap D19). The first holds
   * the prompt only until the next morning, since a first prediction is due
   * the next evening; from the second, a week.
   */
  reminderPromptDismissals: number;
  /**
   * When "Not now" was last answered on Today's back-it-up card (roadmap
   * D31), or null. It comes back 30 days later.
   */
  backupNudgeDismissedAt: string | null;
  /**
   * The return Today's welcome-back card was dismissed for (roadmap D51): the
   * last activity before that gap, so the next long gap shows it again.
   */
  welcomeBackDismissedFor: string | null;
  /**
   * When the App Store rating prompt was last requested (roadmap D15), or
   * null. The cooldown's memory, like the two above.
   */
  ratingAskedAt: string | null;
  /**
   * The local time of the daily practice reminder (roadmap step 89), or null
   * for none. Off until the person picks a moment: a daily notification is
   * something to be asked for, not assumed. Still follows the single
   * Notifications switch above.
   */
  practiceReminder: PracticeReminderTime | null;
  /** When the practice sheet's reminder offer was last waved off, or null. */
  practiceReminderOfferDismissedAt: string | null;
  /**
   * The local day a streak checkpoint's moment last played (step 194, D67),
   * as `localDayKey` writes it ("Wed Nov 18 2026"), or null. Like the
   * cooldowns above, a memory, not a preference: a checkpoint is reached at
   * most once a day, and a new streak can reach 7 again later, so the day is
   * the key, not the number. A relaunch the same day doesn't replay it.
   * Cleared by Erase and account deletion.
   */
  streakMomentDay: string | null;
}

/** The share card's shape: Post (3:4) or Story (9:16). */
export type CardShape = 'post' | 'story';

/**
 * The phone's notification permission, as iOS last reported it: `'granted'`
 * exactly when the schedulers would deliver (they check `granted`), else what
 * the system says.
 */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

/** A local time of day for the practice reminder. */
export interface PracticeReminderTime {
  hour: number;
  minute: number;
}

/** Injectable persistence so tests don't touch the native AsyncStorage. */
export interface SettingsPersistence {
  load(): Promise<Partial<StoredSettings> | null>;
  save(settings: StoredSettings): Promise<void>;
}

interface SettingsState extends StoredSettings {
  /** True once hydrate() has run (whether or not stored values existed). */
  hydrated: boolean;
  /**
   * True when hydrate() found a settings record it couldn't read (the read
   * threw twice, or what came back wasn't a settings object). Not set for a
   * fresh install, which has no record. Every privacy choice then reads as
   * its private side (security review, 2026-11-18), since the record may have
   * held it: the app lock on (Face ID or the passcode opens it), "Hide the
   * words" on, the words off reminders, and usage stats off. Each is the
   * safe way to be wrong, and each can be changed back in You as usual.
   */
  loadFailed: boolean;
  /**
   * The phone's notification permission, or null until it has been read (and
   * whenever it can't be: web, a read that failed). Not a setting: it is the
   * phone's state, so it is never stored and no reset touches it. Written by
   * src/notifications/permissionState.ts at launch, on each return to the
   * foreground and after the app asks (security review, 2026-11-18, round 4).
   * A screen that would promise a notification reads it, and treats null as
   * no: the paywall names the trial reminder only when it is 'granted'.
   */
  notificationPermission: NotificationPermission | null;
  /** Load persisted settings into the store. Safe to call once at startup. */
  hydrate: () => Promise<void>;
  /**
   * Every setting back to a fresh install's, stored. For the playtest loader
   * (src/dev/loadProfile.ts): Erase keeps settings, so one tester's card
   * left-offs and dismissed prompts reached the next (blind playtest
   * 2026-11-12b, finding 24).
   */
  resetToDefaults: () => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setRemindersEnabled: (enabled: boolean) => Promise<void>;
  setDigestEnabled: (enabled: boolean) => Promise<void>;
  setDueReminderTime: (time: PracticeReminderTime) => Promise<void>;
  setDigestDay: (day: number) => Promise<void>;
  setDigestTime: (time: PracticeReminderTime) => Promise<void>;
  setAiRefineEnabled: (enabled: boolean) => Promise<void>;
  setCoachEnabled: (enabled: boolean) => Promise<void>;
  setAnalyticsEnabled: (enabled: boolean) => Promise<void>;
  setStreakShown: (shown: boolean) => Promise<void>;
  setReminderWords: (shown: boolean) => Promise<void>;
  setHideTitles: (hidden: boolean) => Promise<void>;
  /** Store the lock choice. The check that allows it is `lockStore`'s. */
  setAppLock: (on: boolean) => Promise<void>;
  setCardThemeId: (id: string) => Promise<void>;
  setCardFormat: (format: CardShape) => Promise<void>;
  setCardHiddenCategories: (hidden: readonly Category[]) => Promise<void>;
  /** Start the coverage-nudge cooldown from now. */
  markCoverageNudgeShown: () => Promise<void>;
  /** "Not now" on the reminder prompt: hide it until tomorrow morning, then a week. */
  dismissReminderPrompt: () => Promise<void>;
  /** "Not now" on the back-it-up card: 30 days' quiet. */
  dismissBackupNudge: () => Promise<void>;
  /** "Got it" on the welcome-back card, for the return after `lastActiveAt`. */
  dismissWelcomeBack: (lastActiveAt: string) => Promise<void>;
  /** The rating prompt was requested now: start its cooldown. */
  markRatingAsked: () => Promise<void>;
  /** Set the practice reminder's time, or null to turn it off. */
  setPracticeReminder: (time: PracticeReminderTime | null) => Promise<void>;
  /** "Not now" on the practice reminder offer: a week before it asks again. */
  dismissPracticeReminderOffer: () => Promise<void>;
  /** The day a checkpoint's moment played, or null to forget it (Erase, account deletion). */
  setStreakMomentDay: (day: string | null) => Promise<void>;
  /** What the permission read found (null: unknown). Held in memory only, never stored. */
  setNotificationPermission: (permission: NotificationPermission | null) => void;
}

// Defaults preserve today's behavior: refine button is available and
// resolution reminders fire until the user opts out.
//
// Coach is the exception and defaults to OFF. COACH_AGENT.md §5.6 requires it
// be off until the user opts in — it is the one feature that sends a picture
// of the user's judgment to a model, so it waits to be asked.
// Analytics defaults ON, unlike Coach. The difference is what is being sent:
// Coach sends a picture of the user's judgment to a model, while this sends a
// counted list of which screens got used, with no freetext and nothing derived
// about the person. Off by default would produce a sample skewed toward
// whoever reads settings screens, which is not a sample worth deciding the
// business model on.
const DEFAULTS: StoredSettings = {
  notificationsEnabled: true,
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
  cardThemeId: DEFAULT_THEME.id,
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
};

const STORAGE_KEY = 'calibrate:settings';

function defaultPersistence(): SettingsPersistence {
  return {
    async load() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage')
        .default as typeof import('@react-native-async-storage/async-storage').default;
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      // No record: a fresh install. Anything stored was written as an object
      // by save() below, so a record that doesn't parse, or parses to
      // anything else ("null" or "" included), throws: it can't be read.
      if (raw === null || raw === undefined) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('the stored settings are not a settings object');
      }
      return parsed as Partial<StoredSettings>;
    },
    async save(settings) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage')
        .default as typeof import('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    },
  };
}

let persistence: SettingsPersistence = defaultPersistence();

/** Test-only: swap persistence and reset the store to defaults. */
export function __setPersistenceForTests(next: SettingsPersistence | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setPersistenceForTests is only allowed when NODE_ENV=test');
  }
  persistence = next ?? defaultPersistence();
  useSettingsStore.setState({
    ...DEFAULTS,
    hydrated: false,
    loadFailed: false,
    notificationPermission: null,
  });
}

/**
 * Read the stored settings: null for no record, the record, or a throw for
 * one that can't be read. What comes back must be a settings object: `null`
 * parsed from the text "null", a string, a number or a list is a record that
 * can't be read, not a fresh install.
 */
async function loadStored(): Promise<Partial<StoredSettings> | null> {
  const stored: unknown = await persistence.load();
  if (stored === null || stored === undefined) return null;
  if (typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('the stored settings are not a settings object');
  }
  return stored as Partial<StoredSettings>;
}

/**
 * Drop the Coach's cards (fix 5): turning Coach off must clear what is on
 * screen, not just stop the next request. Lazy, because coachStore →
 * analytics/track → authStore → settingsStore would be a require cycle at
 * module load. Never throws.
 */
function resetCoach(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useCoachStore } = require('./coachStore') as typeof import('./coachStore');
    useCoachStore.getState().reset();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[settings] could not clear the Coach:', e instanceof Error ? e.message : 'unknown error');
  }
}

/** Persist the current toggle values, swallowing storage errors. */
async function persist(settings: StoredSettings): Promise<void> {
  try {
    await persistence.save(settings);
  } catch (e) {
    // Settings are non-critical, like the L5 services — a failed write must
    // never throw into the toggle handler. The in-memory value still applies
    // this session; it just won't survive a restart.
    // eslint-disable-next-line no-console
    console.warn('[settings] save failed:', e);
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  loadFailed: false,
  notificationPermission: null,

  hydrate: async () => {
    try {
      let stored: Partial<StoredSettings> | null;
      try {
        stored = await loadStored();
      } catch {
        // Once more: a storage read can fail for a moment. A record that
        // doesn't parse fails again, and that is the failed read below.
        stored = await loadStored();
      }
      if (stored) {
        set({
          notificationsEnabled:
            stored.notificationsEnabled ?? DEFAULTS.notificationsEnabled,
          remindersEnabled: stored.remindersEnabled ?? DEFAULTS.remindersEnabled,
          digestEnabled: stored.digestEnabled ?? DEFAULTS.digestEnabled,
          dueReminderTime: validTime(stored.dueReminderTime) ?? DEFAULTS.dueReminderTime,
          digestDay: validDay(stored.digestDay) ?? DEFAULTS.digestDay,
          digestTime: validTime(stored.digestTime) ?? DEFAULTS.digestTime,
          aiRefineEnabled: stored.aiRefineEnabled ?? DEFAULTS.aiRefineEnabled,
          coachEnabled: stored.coachEnabled ?? DEFAULTS.coachEnabled,
          analyticsEnabled:
            stored.analyticsEnabled ?? DEFAULTS.analyticsEnabled,
          streakShown:
            typeof stored.streakShown === 'boolean' ? stored.streakShown : DEFAULTS.streakShown,
          reminderWords:
            typeof stored.reminderWords === 'boolean'
              ? stored.reminderWords
              : DEFAULTS.reminderWords,
          hideTitles:
            typeof stored.hideTitles === 'boolean' ? stored.hideTitles : DEFAULTS.hideTitles,
          appLock: typeof stored.appLock === 'boolean' ? stored.appLock : DEFAULTS.appLock,
          cardThemeId: stored.cardThemeId ?? DEFAULTS.cardThemeId,
          cardFormat: validShape(stored.cardFormat) ?? DEFAULTS.cardFormat,
          cardHiddenCategories:
            validCategories(stored.cardHiddenCategories) ?? DEFAULTS.cardHiddenCategories,
          coverageNudgeLastShownAt:
            stored.coverageNudgeLastShownAt ??
            DEFAULTS.coverageNudgeLastShownAt,
          reminderPromptDismissedAt:
            stored.reminderPromptDismissedAt ?? DEFAULTS.reminderPromptDismissedAt,
          // A dismissal stored before D19 counts as one.
          reminderPromptDismissals:
            stored.reminderPromptDismissals ??
            (stored.reminderPromptDismissedAt ? 1 : DEFAULTS.reminderPromptDismissals),
          backupNudgeDismissedAt:
            stored.backupNudgeDismissedAt ?? DEFAULTS.backupNudgeDismissedAt,
          welcomeBackDismissedFor:
            typeof stored.welcomeBackDismissedFor === 'string'
              ? stored.welcomeBackDismissedFor
              : DEFAULTS.welcomeBackDismissedFor,
          ratingAskedAt: stored.ratingAskedAt ?? DEFAULTS.ratingAskedAt,
          practiceReminder: validTime(stored.practiceReminder) ?? DEFAULTS.practiceReminder,
          practiceReminderOfferDismissedAt:
            stored.practiceReminderOfferDismissedAt ?? DEFAULTS.practiceReminderOfferDismissedAt,
          streakMomentDay:
            typeof stored.streakMomentDay === 'string'
              ? stored.streakMomentDay
              : DEFAULTS.streakMomentDay,
        });
      }
    } catch (e) {
      // Fall back to defaults — never block startup on a settings read. But
      // not for the privacy choices: the record that couldn't be read may
      // have held them, and a default here would be written over that record
      // by the next change of any setting. So each takes its private side,
      // in state, and that is what the next write stores:
      //   - the lock on: it locks at launch where this build can
      //     (lockStore.arm: Face ID or the passcode opens it; a build without
      //     the module never locks), and turning it off is the usual check
      //     with the phone;
      //   - "Hide the words" on: a card opens with a tap, as always;
      //   - the words off reminders (already the default): no words and no
      //     Happened / Didn't on the lock screen;
      //   - usage stats off: nothing is recorded or sent until they're turned
      //     back on. What was queued before stays queued, unsent: nobody
      //     asked for it to be deleted, and track() and flushEvents() both
      //     read this switch first.
      // eslint-disable-next-line no-console
      console.warn(
        '[settings] load failed; using defaults with every privacy choice on its private side:',
        e instanceof Error ? e.message : 'unknown error',
      );
      set({
        loadFailed: true,
        appLock: true,
        hideTitles: true,
        reminderWords: false,
        analyticsEnabled: false,
      });
    } finally {
      set({ hydrated: true });
    }
  },

  resetToDefaults: async () => {
    // A fresh record, written whole: nothing unreadable is left to protect.
    set({ ...DEFAULTS, loadFailed: false });
    await persist(snapshot(get()));
  },

  setNotificationsEnabled: async (enabled) => {
    set({ notificationsEnabled: enabled });
    await persist(snapshot(get()));
  },

  setRemindersEnabled: async (enabled) => {
    set({ remindersEnabled: enabled });
    await persist(snapshot(get()));
  },

  setDigestEnabled: async (enabled) => {
    set({ digestEnabled: enabled });
    await persist(snapshot(get()));
  },

  setDueReminderTime: async (time) => {
    set({ dueReminderTime: validTime(time) ?? DEFAULTS.dueReminderTime });
    await persist(snapshot(get()));
  },

  setDigestDay: async (day) => {
    set({ digestDay: validDay(day) ?? DEFAULTS.digestDay });
    await persist(snapshot(get()));
  },

  setDigestTime: async (time) => {
    set({ digestTime: validTime(time) ?? DEFAULTS.digestTime });
    await persist(snapshot(get()));
  },

  setStreakShown: async (shown) => {
    set({ streakShown: shown });
    await persist(snapshot(get()));
  },

  setReminderWords: async (shown) => {
    set({ reminderWords: shown });
    await persist(snapshot(get()));
  },

  setHideTitles: async (hidden) => {
    set({ hideTitles: hidden });
    await persist(snapshot(get()));
  },

  setAppLock: async (on) => {
    set({ appLock: on });
    await persist(snapshot(get()));
  },

  setAiRefineEnabled: async (enabled) => {
    set({ aiRefineEnabled: enabled });
    await persist(snapshot(get()));
  },

  setCoachEnabled: async (enabled) => {
    set({ coachEnabled: enabled });
    // Off clears the cards on screen at once, before the write.
    if (!enabled) resetCoach();
    await persist(snapshot(get()));
  },

  setAnalyticsEnabled: async (enabled) => {
    set({ analyticsEnabled: enabled });
    await persist(snapshot(get()));
    // Opting out means what it says: the queue of what was already recorded
    // goes too, not just future events. clearEvents swallows its own errors.
    if (!enabled) await clearEvents();
  },

  setCardThemeId: async (id) => {
    set({ cardThemeId: id });
    await persist(snapshot(get()));
  },

  setCardFormat: async (format) => {
    set({ cardFormat: format });
    await persist(snapshot(get()));
  },

  setCardHiddenCategories: async (hidden) => {
    set({ cardHiddenCategories: validCategories(hidden) ?? [] });
    await persist(snapshot(get()));
  },

  markCoverageNudgeShown: async () => {
    set({ coverageNudgeLastShownAt: new Date().toISOString() });
    await persist(snapshot(get()));
  },

  dismissReminderPrompt: async () => {
    set((s) => ({
      reminderPromptDismissedAt: new Date().toISOString(),
      reminderPromptDismissals: s.reminderPromptDismissals + 1,
    }));
    await persist(snapshot(get()));
  },

  dismissBackupNudge: async () => {
    set({ backupNudgeDismissedAt: new Date().toISOString() });
    await persist(snapshot(get()));
  },

  dismissWelcomeBack: async (lastActiveAt) => {
    set({ welcomeBackDismissedFor: lastActiveAt });
    await persist(snapshot(get()));
  },

  markRatingAsked: async () => {
    set({ ratingAskedAt: new Date().toISOString() });
    await persist(snapshot(get()));
  },

  setPracticeReminder: async (time) => {
    set({ practiceReminder: time === null ? null : validTime(time) });
    await persist(snapshot(get()));
  },

  dismissPracticeReminderOffer: async () => {
    set({ practiceReminderOfferDismissedAt: new Date().toISOString() });
    await persist(snapshot(get()));
  },

  setStreakMomentDay: async (day) => {
    set({ streakMomentDay: day });
    await persist(snapshot(get()));
  },

  // No persist: the phone's state, read again at every launch.
  setNotificationPermission: (permission) => {
    if (get().notificationPermission !== permission) set({ notificationPermission: permission });
  },
}));

/** A stored day of the week, if it is one: 0 (Sunday) to 6. */
function validDay(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6
    ? (value as number)
    : null;
}

/** A stored card shape, if it is one. */
function validShape(value: unknown): CardShape | null {
  return value === 'post' || value === 'story' ? value : null;
}

/**
 * Stored categories, if they are a list: category ids only (the person's own
 * included, roadmap D39), each once, in the order given.
 */
function validCategories(value: unknown): Category[] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.filter(isCategory))];
  // Built-ins in the app's order, then added ones as given.
  const rank = (c: Category) => {
    const i = (CATEGORIES as readonly string[]).indexOf(c);
    return i >= 0 ? i : CATEGORIES.length;
  };
  return ids.sort((a, b) => rank(a) - rank(b));
}

/** A stored time, if it is one: whole hours 0–23 and minutes 0–59. */
function validTime(value: unknown): PracticeReminderTime | null {
  if (typeof value !== 'object' || value === null) return null;
  const { hour, minute } = value as Partial<PracticeReminderTime>;
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour! < 0 || hour! > 23 || minute! < 0 || minute! > 59) return null;
  return { hour: hour!, minute: minute! };
}

/**
 * The persistable slice of the store. Each setter writes the whole snapshot
 * after updating state, so adding a toggle no longer means editing every
 * other setter — the bug that shape invited.
 */
function snapshot(state: StoredSettings): StoredSettings {
  return {
    notificationsEnabled: state.notificationsEnabled,
    remindersEnabled: state.remindersEnabled,
    digestEnabled: state.digestEnabled,
    dueReminderTime: state.dueReminderTime,
    digestDay: state.digestDay,
    digestTime: state.digestTime,
    aiRefineEnabled: state.aiRefineEnabled,
    coachEnabled: state.coachEnabled,
    analyticsEnabled: state.analyticsEnabled,
    streakShown: state.streakShown,
    reminderWords: state.reminderWords,
    hideTitles: state.hideTitles,
    appLock: state.appLock,
    cardThemeId: state.cardThemeId,
    cardFormat: state.cardFormat,
    cardHiddenCategories: state.cardHiddenCategories,
    coverageNudgeLastShownAt: state.coverageNudgeLastShownAt,
    reminderPromptDismissedAt: state.reminderPromptDismissedAt,
    reminderPromptDismissals: state.reminderPromptDismissals,
    backupNudgeDismissedAt: state.backupNudgeDismissedAt,
    welcomeBackDismissedFor: state.welcomeBackDismissedFor,
    ratingAskedAt: state.ratingAskedAt,
    practiceReminder: state.practiceReminder,
    practiceReminderOfferDismissedAt: state.practiceReminderOfferDismissedAt,
    streakMomentDay: state.streakMomentDay,
  };
}
