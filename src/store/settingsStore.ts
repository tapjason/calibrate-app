// Settings store. Holds device-local user preferences — notification and AI
// refine toggles — and persists them to AsyncStorage. Offline-only: settings
// are not synced to Supabase (per CLAUDE.md they're local preferences).
//
// Layer note: this is L4. It owns no business math and reaches no service.
// The notification services (L5) SUBSCRIBE to this store to react to toggle
// changes — the dependency arrow points L5 → L4, never the reverse, exactly
// like the prediction-store subscriptions in scheduler.ts / digest.ts. The
// one platform call it makes is a foreground listener while the stored
// record can't be read (`watchForeground`, below).
//
// A record that can't be read (client re-review, round 5, 2026-11-19).
// hydrate() then holds the defaults with every privacy choice on its private
// side. Each setter used to store the whole snapshot, so the next automatic
// write (a cooldown stamped, a checkpoint's day) wrote those defaults over a
// record that may only have failed to read for a moment, turning
// notifications back on for someone who had turned them off. Now, until a
// read succeeds, only the person's own choice of a setting is stored (see
// `ChangeKind`); every other change is held in memory and applied over the
// record once it reads, which is tried again each time the app comes back to
// the foreground.

import { create } from 'zustand';

import { clearEvents } from '@/db/analytics';
import { DEFAULT_THEME } from '@/constants/cardThemes';
import { deviceRegion, deviceRegionSetting } from '@/constants/locale';
import {
  usageStatsOffByRegion,
  usageStatsOn,
  usageStatsStartOff,
  type PhoneRegions,
} from '@/engine/usageStats';
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
   * (src/analytics/events.ts). Stored on by default; turning it off clears the
   * queue. Never read on its own: whether Usage stats are on is
   * `selectUsageStatsOn`, which reads it with `analyticsChosen` and the
   * phone's region (on a phone in Canada they start off, owner 2026-11-19).
   */
  analyticsEnabled: boolean;
  /**
   * Whether the person has set the Usage stats switch themselves (owner,
   * 2026-11-19): on the Warm-up's first screen, in You or on the sign-in
   * screen, all through `setAnalyticsEnabled`. Until then the switch follows
   * the phone's region: off in Canada, on elsewhere (src/engine/usageStats.ts).
   * Once set, the stored value wins in every region.
   *
   * Written only when true: a record with nothing chosen leaves it out, so it
   * keeps the shape earlier builds wrote, and a record from an earlier build
   * (which never has it) reads as not chosen. That is safe for those records:
   * a stored off still reads as off (`usageStatsOn`), and a stored on reads as
   * on everywhere but Canada, as before. Always present in the store's state.
   * Kept by Erase, account deletion and sign-out, like `analyticsEnabled`.
   */
  analyticsChosen?: boolean;
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
   * Whether the app locks when it opens and when it goes to the background,
   * with Face ID or the passcode asked when Unlock is tapped (roadmap D64,
   * step 180; D74). Off by default. "Hide the words" is a curtain: one tap
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
  /**
   * When the line about usage counts, on the Warm-up's first screen with the
   * Usage stats switch (owner decision 2026-11-19, D69 (b); guideline
   * 5.1.1(ii)), was first shown on this phone, or null if it never has been.
   * A guest's counts go up only once it has (`usageCountsMayGoUp`). Like the
   * cooldowns above, a memory, not a preference: stamped once and never moved
   * (`markUsageNoticeShown`). Cleared by Erase and account deletion, which
   * start this phone afresh, Warm-up included, so the line is shown again
   * before anything goes up; kept by sign-out, which keeps the Warm-up too.
   */
  usageNoticeShownAt: string | null;
}

/**
 * What a development build before 2026-11-20 stored for the Coach's support
 * card, set aside: one key per answered prediction, its id and a hash of its
 * title and note. The card and the scan behind it are gone (D73), so nothing
 * reads it: a record that still has it is rewritten without it once it is
 * read (`hydrate`, `retryLoad`), and no write carries it, since a write is
 * always the whole snapshot, which has no such value.
 */
const RETIRED_SUPPORT_ASIDE_KEY = 'supportAsideKeys';

/** Whether a stored record still holds the retired set-asides. */
function holdsRetiredValues(stored: Partial<StoredSettings>): boolean {
  return Object.prototype.hasOwnProperty.call(stored, RETIRED_SUPPORT_ASIDE_KEY);
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
  /** Whether the person set Usage stats (`StoredSettings.analyticsChosen`): false here when not. */
  analyticsChosen: boolean;
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
   * Read the stored record again, after hydrate() couldn't (round 5,
   * 2026-11-19). Called on each return to the foreground while `loadFailed`
   * is true (the store watches for it itself). A record that reads is
   * loaded, the changes held since are applied over it and stored, and
   * `loadFailed` clears. A read that fails again, or finds no record, leaves
   * everything as it is. Never throws.
   */
  retryLoad: () => Promise<void>;
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
  /**
   * The line about usage counts is on screen (D69 (b)): stamp now, the first
   * time only. A stamp already set, in memory or in a record read later, is
   * kept, and a second call writes nothing.
   */
  markUsageNoticeShown: () => Promise<void>;
  /**
   * Forget that the line was shown (Erase, account deletion), so it is shown
   * again first. Resolves as a change's write does (`save`): false only when
   * the write of the whole record didn't land, which Erase reports as a step
   * that didn't finish. Never throws.
   */
  forgetUsageNoticeShown: () => Promise<boolean>;
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
// business model on. The exception is a phone whose region is Canada (owner,
// 2026-11-19: Quebec's law asks for the most private setting by default):
// there the stored on reads as off until the person turns the switch on
// (`analyticsChosen`, `selectUsageStatsOn`).
/**
 * The settings as the store holds them: every value present, nothing chosen
 * `analyticsChosen: false`.
 */
type HeldSettings = StoredSettings & { analyticsChosen: boolean };

const DEFAULTS: HeldSettings = {
  notificationsEnabled: true,
  remindersEnabled: true,
  digestEnabled: true,
  dueReminderTime: { hour: 19, minute: 0 },
  digestDay: 0,
  digestTime: { hour: 18, minute: 0 },
  aiRefineEnabled: true,
  coachEnabled: false,
  analyticsEnabled: true,
  analyticsChosen: false,
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
  usageNoticeShownAt: null,
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

/**
 * A change to the settings: what it sets, worked out from the settings it is
 * applied to (only "Not now" on the reminder prompt reads them: it counts).
 * Kept while the record can't be read, to be applied again over the record
 * once it can.
 */
type SettingsChange = (current: StoredSettings) => Partial<StoredSettings>;

/**
 * Who makes a change, which decides whether it is stored while the record
 * can't be read (`loadFailed`). With the record read, every change is stored
 * at once, as before.
 *
 *   explicit   the person's own choice of this setting. Stored, and with it
 *              the snapshot You shows, private sides included. The record is
 *              read once more first: if it reads now, it is loaded and this
 *              change, with every change held since, applied over it. If it
 *              still can't be read, or there is none, this change starts a
 *              new record and ends the failed state.
 *                setNotificationsEnabled, setRemindersEnabled,
 *                setDigestEnabled, setDueReminderTime, setDigestDay,
 *                setDigestTime, setAiRefineEnabled, setCoachEnabled,
 *                setAnalyticsEnabled, setStreakShown, setReminderWords,
 *                setHideTitles: You's switches and pickers (SettingsView,
 *                their only caller).
 *                setAppLock: You's switch, through lockStore.setEnabled, and
 *                Continue on the lock screen of a phone with no passcode
 *                (lockStore.continueWithoutLock). Both are the person's
 *                choice of this very setting.
 *                setPracticeReminder: choosePracticeReminder, from You or
 *                from the practice sheet's offer; the person picks the time.
 *   automatic  everything else. Held in memory only while the record can't
 *              be read, then applied over it once it reads.
 *                markCoverageNudgeShown, markRatingAsked, setStreakMomentDay
 *                (a cooldown's or a moment's memory; setStreakMomentDay is
 *                also cleared at Erase and account deletion);
 *                markUsageNoticeShown, forgetUsageNoticeShown (when the line
 *                about usage counts was first shown, D69 (b): stamped when it
 *                is drawn, forgotten at Erase and account deletion. Held, it
 *                is applied over the record once it reads, and a stamp the
 *                record already has is kept);
 *                dismissReminderPrompt, dismissBackupNudge,
 *                dismissWelcomeBack, dismissPracticeReminderOffer ("Not now"
 *                on Today's cards and the practice sheet's);
 *                setCardThemeId, setCardFormat, setCardHiddenCategories (the
 *                share card's choices, made on Share; the last is also
 *                cleared at Erase and account deletion).
 *
 * Never stored at all: setNotificationPermission (the phone's state). And
 * resetToDefaults (the playtest loader) writes a fresh record and ends the
 * failed state.
 */
type ChangeKind = 'explicit' | 'automatic';

/** The changes made since the record couldn't be read, in order. */
let heldChanges: SettingsChange[] = [];
/** Bumped by every change, so a save can tell whether one came in meanwhile. */
let changeCount = 0;
/** The foreground listener while the record can't be read, or null. */
let foregroundWatch: { remove?: () => void } | null = null;

/**
 * Try the record again each time the app comes back to the foreground, until
 * a read succeeds (`retryLoad`). Lazy, so tests and the web bundle load
 * react-native only when a read has failed. Never throws.
 */
function watchForeground(): void {
  if (foregroundWatch) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppState } = require('react-native') as typeof import('react-native');
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void useSettingsStore.getState().retryLoad();
    });
    foregroundWatch = subscription ?? {};
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      '[settings] could not watch for the foreground:',
      e instanceof Error ? e.message : 'unknown error',
    );
  }
}

function stopWatchingForeground(): void {
  const watch = foregroundWatch;
  foregroundWatch = null;
  try {
    watch?.remove?.();
  } catch {
    // Nothing to keep: the listener only ever retries a read.
  }
}

/** Test-only: swap persistence and reset the store to defaults. */
export function __setPersistenceForTests(next: SettingsPersistence | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setPersistenceForTests is only allowed when NODE_ENV=test');
  }
  persistence = next ?? defaultPersistence();
  heldChanges = [];
  changeCount = 0;
  stopWatchingForeground();
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

/** The Usage stats setting in `state`, as the engine reads it. */
function usageSetting(state: Pick<StoredSettings, 'analyticsEnabled' | 'analyticsChosen'>) {
  return { analyticsEnabled: state.analyticsEnabled, analyticsChosen: state.analyticsChosen === true };
}

/**
 * The phone's two region readings, as the Usage stats rule takes them: the
 * Region setting (`deviceRegionSetting`) and the language's region
 * (`deviceRegion`), each read once per launch. Every Usage stats rule here
 * reads the region through this, so none of them goes by one reading alone.
 */
function phoneRegions(): PhoneRegions {
  return { regionSetting: deviceRegionSetting(), languageRegion: deviceRegion() };
}

/**
 * Clear the queued usage counts when Usage stats are off only because the
 * phone's region starts them off (`usageStatsOffByRegion`): stored on, never
 * chosen, in Canada. Off means what it does when the switch is turned off:
 * nothing waits on the phone to go up later. Counts queued while the phone's
 * region was elsewhere, and Usage stats on by default, would otherwise go up
 * the moment the person turned them on, though they were recorded before the
 * choice. Nothing is queued while they are off (`track`), so after the first
 * launch this clears an empty queue. clearEvents swallows its own errors.
 */
async function dropQueueIfOffByRegion(state: StoredSettings): Promise<void> {
  if (usageStatsOffByRegion(usageSetting(state), phoneRegions())) await clearEvents();
}

/**
 * Persist the current toggle values, swallowing storage errors. True when
 * the write landed.
 */
async function persist(settings: StoredSettings): Promise<boolean> {
  try {
    await persistence.save(settings);
    return true;
  } catch (e) {
    // Settings are non-critical, like the L5 services — a failed write must
    // never throw into the toggle handler. The in-memory value still applies
    // this session; it just won't survive a restart.
    // eslint-disable-next-line no-console
    console.warn('[settings] save failed:', e);
    return false;
  }
}

/**
 * A stored record as settings: each value checked, and the default for one
 * that is missing or isn't of its kind.
 */
function fromStored(stored: Partial<StoredSettings>): HeldSettings {
  return {
    notificationsEnabled: stored.notificationsEnabled ?? DEFAULTS.notificationsEnabled,
    remindersEnabled: stored.remindersEnabled ?? DEFAULTS.remindersEnabled,
    digestEnabled: stored.digestEnabled ?? DEFAULTS.digestEnabled,
    dueReminderTime: validTime(stored.dueReminderTime) ?? DEFAULTS.dueReminderTime,
    digestDay: validDay(stored.digestDay) ?? DEFAULTS.digestDay,
    digestTime: validTime(stored.digestTime) ?? DEFAULTS.digestTime,
    aiRefineEnabled: stored.aiRefineEnabled ?? DEFAULTS.aiRefineEnabled,
    coachEnabled: stored.coachEnabled ?? DEFAULTS.coachEnabled,
    analyticsEnabled:
      typeof stored.analyticsEnabled === 'boolean'
        ? stored.analyticsEnabled
        : DEFAULTS.analyticsEnabled,
    // Chosen only when the record says so: a record from an earlier build
    // has no such value, and reads as not chosen (`StoredSettings`).
    analyticsChosen: stored.analyticsChosen === true,
    streakShown:
      typeof stored.streakShown === 'boolean' ? stored.streakShown : DEFAULTS.streakShown,
    reminderWords:
      typeof stored.reminderWords === 'boolean' ? stored.reminderWords : DEFAULTS.reminderWords,
    hideTitles: typeof stored.hideTitles === 'boolean' ? stored.hideTitles : DEFAULTS.hideTitles,
    appLock: typeof stored.appLock === 'boolean' ? stored.appLock : DEFAULTS.appLock,
    cardThemeId: stored.cardThemeId ?? DEFAULTS.cardThemeId,
    cardFormat: validShape(stored.cardFormat) ?? DEFAULTS.cardFormat,
    cardHiddenCategories:
      validCategories(stored.cardHiddenCategories) ?? DEFAULTS.cardHiddenCategories,
    coverageNudgeLastShownAt:
      stored.coverageNudgeLastShownAt ?? DEFAULTS.coverageNudgeLastShownAt,
    reminderPromptDismissedAt:
      stored.reminderPromptDismissedAt ?? DEFAULTS.reminderPromptDismissedAt,
    // A dismissal stored before D19 counts as one.
    reminderPromptDismissals:
      stored.reminderPromptDismissals ??
      (stored.reminderPromptDismissedAt ? 1 : DEFAULTS.reminderPromptDismissals),
    backupNudgeDismissedAt: stored.backupNudgeDismissedAt ?? DEFAULTS.backupNudgeDismissedAt,
    welcomeBackDismissedFor:
      typeof stored.welcomeBackDismissedFor === 'string'
        ? stored.welcomeBackDismissedFor
        : DEFAULTS.welcomeBackDismissedFor,
    ratingAskedAt: stored.ratingAskedAt ?? DEFAULTS.ratingAskedAt,
    practiceReminder: validTime(stored.practiceReminder) ?? DEFAULTS.practiceReminder,
    practiceReminderOfferDismissedAt:
      stored.practiceReminderOfferDismissedAt ?? DEFAULTS.practiceReminderOfferDismissedAt,
    streakMomentDay:
      typeof stored.streakMomentDay === 'string' ? stored.streakMomentDay : DEFAULTS.streakMomentDay,
    // Anything that isn't a time reads as never shown: the line is shown
    // again, and nothing goes up from a guest until it is.
    usageNoticeShownAt: validStamp(stored.usageNoticeShownAt) ?? DEFAULTS.usageNoticeShownAt,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  /** Apply a change in memory, and hold it while the record can't be read. */
  const change = (update: SettingsChange): void => {
    changeCount += 1;
    set(update(snapshot(get())));
    if (get().loadFailed) heldChanges.push(update);
  };

  /** The record is readable, or replaced: nothing held, nothing to watch for. */
  const endFailure = (): void => {
    heldChanges = [];
    stopWatchingForeground();
    set({ loadFailed: false });
  };

  /**
   * Take a record that reads: its values, then every change held since the
   * failed read, in order. True when there were changes to apply (and so
   * something the record doesn't have yet).
   */
  const adopt = (stored: Partial<StoredSettings>): boolean => {
    let next = fromStored(stored);
    for (const update of heldChanges) next = { ...next, ...update(next) };
    const applied = heldChanges.length > 0;
    set(next);
    endFailure();
    return applied;
  };

  /**
   * Store what a change left, by its kind (`ChangeKind`). True when the
   * change is in the stored record, or is an automatic one held while the
   * record can't be read (by design: it is applied over the record once it
   * reads, and written then); false when a write failed, and the stored
   * record doesn't have the change (review round two, 2026-11-19: Erase
   * reports that as a step that didn't finish). Never throws.
   */
  const save = async (kind: ChangeKind): Promise<boolean> => {
    if (!get().loadFailed) return persist(snapshot(get()));
    // The record couldn't be read: an automatic change stays in memory, so
    // it can't write the defaults over a record that is still there.
    if (kind === 'automatic') return true;

    // The person's own choice. The record first, once more.
    let stored: Partial<StoredSettings> | null = null;
    let readable = true;
    try {
      stored = await loadStored();
    } catch {
      readable = false;
    }
    if (!get().loadFailed) {
      // Read meanwhile (a return to the foreground); this change was applied
      // over it with the others.
      return persist(snapshot(get()));
    }
    if (readable && stored) {
      adopt(stored);
      return persist(snapshot(get()));
    }
    // Still unreadable, or gone: this change starts a new record, with the
    // snapshot You shows (the private sides included). Once it has landed
    // nothing unreadable is left to protect.
    const before = changeCount;
    if (!(await persist(snapshot(get())))) return false;
    endFailure();
    // A change that came in while the write ran is in memory only. This
    // change landed with the first write, whatever this one does.
    if (changeCount !== before) await persist(snapshot(get()));
    return true;
  };

  return {
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
        // Changes held from an earlier failed read (a second hydrate) are
        // applied over the record, and then stored. So is a record that still
        // holds the retired set-asides (D73): rewritten once without them,
        // every other value as read.
        if (stored && (adopt(stored) || holdsRetiredValues(stored))) {
          await persist(snapshot(get()));
        }
      } catch (e) {
        // Fall back to defaults — never block startup on a settings read. But
        // not for the privacy choices: the record that couldn't be read may
        // have held them. So each takes its private side, in state:
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
        // Nothing is stored for any of this, nor for any automatic change,
        // until the record reads or the person changes a setting in You
        // (`ChangeKind`, round 5); the read is tried again at each return to
        // the foreground.
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
        watchForeground();
      } finally {
        set({ hydrated: true });
      }
      // Usage stats off only because this phone's region starts them off
      // (owner, 2026-11-19): the queued counts go, as when the switch is
      // turned off. Not while the record can't be read: off is then a guess.
      if (!get().loadFailed) await dropQueueIfOffByRegion(get());
    },

    retryLoad: async () => {
      if (!get().loadFailed) return;
      let stored: Partial<StoredSettings> | null;
      try {
        stored = await loadStored();
      } catch {
        // Still unreadable: the next return to the foreground tries again.
        return;
      }
      // No record: nothing to load, and the private sides stay until a change
      // in You writes one (or the next launch, which reads no record as a
      // fresh install).
      if (!stored || !get().loadFailed) return;
      // As at launch: stored when changes were held, or when the record still
      // holds the retired set-asides (`hydrate`).
      if (adopt(stored) || holdsRetiredValues(stored)) await persist(snapshot(get()));
      // The record read at last: as at launch (`hydrate`).
      await dropQueueIfOffByRegion(get());
    },

    resetToDefaults: async () => {
      // A fresh record, written whole: nothing unreadable is left to protect.
      set({ ...DEFAULTS });
      endFailure();
      await persist(snapshot(get()));
    },

    setNotificationsEnabled: async (enabled) => {
      change(() => ({ notificationsEnabled: enabled }));
      await save('explicit');
    },

    setRemindersEnabled: async (enabled) => {
      change(() => ({ remindersEnabled: enabled }));
      await save('explicit');
    },

    setDigestEnabled: async (enabled) => {
      change(() => ({ digestEnabled: enabled }));
      await save('explicit');
    },

    setDueReminderTime: async (time) => {
      const dueReminderTime = validTime(time) ?? DEFAULTS.dueReminderTime;
      change(() => ({ dueReminderTime }));
      await save('explicit');
    },

    setDigestDay: async (day) => {
      const digestDay = validDay(day) ?? DEFAULTS.digestDay;
      change(() => ({ digestDay }));
      await save('explicit');
    },

    setDigestTime: async (time) => {
      const digestTime = validTime(time) ?? DEFAULTS.digestTime;
      change(() => ({ digestTime }));
      await save('explicit');
    },

    setStreakShown: async (shown) => {
      change(() => ({ streakShown: shown }));
      await save('explicit');
    },

    setReminderWords: async (shown) => {
      change(() => ({ reminderWords: shown }));
      await save('explicit');
    },

    setHideTitles: async (hidden) => {
      change(() => ({ hideTitles: hidden }));
      await save('explicit');
    },

    setAppLock: async (on) => {
      change(() => ({ appLock: on }));
      await save('explicit');
    },

    setAiRefineEnabled: async (enabled) => {
      change(() => ({ aiRefineEnabled: enabled }));
      await save('explicit');
    },

    setCoachEnabled: async (enabled) => {
      change(() => ({ coachEnabled: enabled }));
      // Off clears the cards on screen at once, before the write.
      if (!enabled) resetCoach();
      await save('explicit');
    },

    setAnalyticsEnabled: async (enabled) => {
      // The person's own choice, from any of the three switches: from now on
      // it wins over the region's default (`analyticsChosen`).
      change(() => ({ analyticsEnabled: enabled, analyticsChosen: true }));
      await save('explicit');
      // Opting out means what it says: the queue of what was already recorded
      // goes too, not just future events. clearEvents swallows its own errors.
      if (!enabled) await clearEvents();
    },

    setCardThemeId: async (id) => {
      change(() => ({ cardThemeId: id }));
      await save('automatic');
    },

    setCardFormat: async (format) => {
      change(() => ({ cardFormat: format }));
      await save('automatic');
    },

    setCardHiddenCategories: async (hidden) => {
      const cardHiddenCategories = validCategories(hidden) ?? [];
      change(() => ({ cardHiddenCategories }));
      await save('automatic');
    },

    markCoverageNudgeShown: async () => {
      const coverageNudgeLastShownAt = new Date().toISOString();
      change(() => ({ coverageNudgeLastShownAt }));
      await save('automatic');
    },

    dismissReminderPrompt: async () => {
      const reminderPromptDismissedAt = new Date().toISOString();
      // Counted on whatever it is applied to: memory now, the record later if
      // it couldn't be read.
      change((s) => ({
        reminderPromptDismissedAt,
        reminderPromptDismissals: s.reminderPromptDismissals + 1,
      }));
      await save('automatic');
    },

    dismissBackupNudge: async () => {
      const backupNudgeDismissedAt = new Date().toISOString();
      change(() => ({ backupNudgeDismissedAt }));
      await save('automatic');
    },

    dismissWelcomeBack: async (lastActiveAt) => {
      change(() => ({ welcomeBackDismissedFor: lastActiveAt }));
      await save('automatic');
    },

    markRatingAsked: async () => {
      const ratingAskedAt = new Date().toISOString();
      change(() => ({ ratingAskedAt }));
      await save('automatic');
    },

    setPracticeReminder: async (time) => {
      const practiceReminder = time === null ? null : validTime(time);
      change(() => ({ practiceReminder }));
      await save('explicit');
    },

    dismissPracticeReminderOffer: async () => {
      const practiceReminderOfferDismissedAt = new Date().toISOString();
      change(() => ({ practiceReminderOfferDismissedAt }));
      await save('automatic');
    },

    setStreakMomentDay: async (day) => {
      change(() => ({ streakMomentDay: day }));
      await save('automatic');
    },

    markUsageNoticeShown: async () => {
      // The first showing is the one kept: a later one changes and writes nothing.
      if (get().usageNoticeShownAt !== null) return;
      const usageNoticeShownAt = new Date().toISOString();
      // Worked out on whatever it is applied to: while the record can't be
      // read, memory now, then the record once it reads, which keeps a
      // showing it already holds.
      change((s) => (s.usageNoticeShownAt === null ? { usageNoticeShownAt } : {}));
      await save('automatic');
    },

    forgetUsageNoticeShown: async () => {
      change(() => ({ usageNoticeShownAt: null }));
      return save('automatic');
    },

    // No persist: the phone's state, read again at every launch.
    setNotificationPermission: (permission) => {
      if (get().notificationPermission !== permission) set({ notificationPermission: permission });
    },
  };
});

/**
 * Whether Usage stats are on (owner, 2026-11-19): the one read of the
 * setting, for everything that sends, queues or shows it (track, the flush,
 * the three switches and their lines). Never read `analyticsEnabled` on its
 * own: on a phone whose region is Canada, a stored on that the person never
 * chose reads as off. The rules are `usageStatsOn` (src/engine/usageStats.ts).
 * The phone is in Canada when either of two readings says so (`phoneRegions`):
 * its Region setting (`deviceRegionSetting`, expo-localization) or the region
 * in its language tag (`deviceRegion`); where the Region setting can't be read
 * (web, tests, a build without the module), the tag decides. Both are read
 * once per launch, so a region changed in Settings counts from the next
 * launch. A region that can't be read at all counts as not Canada. A selector:
 * `useSettingsStore(selectUsageStatsOn)` in a component,
 * `selectUsageStatsOn(useSettingsStore.getState())` elsewhere.
 */
export function selectUsageStatsOn(
  state: Pick<StoredSettings, 'analyticsEnabled' | 'analyticsChosen'>,
): boolean {
  return usageStatsOn(usageSetting(state), phoneRegions());
}

/**
 * Whether Usage stats start off on this phone until the person turns them on:
 * its Region setting or its language's region is Canada (`usageStatsStartOff`,
 * the same readings as `selectUsageStatsOn`). The Warm-up's line says so while
 * they are off there.
 */
export function usageStatsStartOffHere(): boolean {
  return usageStatsStartOff(phoneRegions());
}

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

/** A stored moment, if it is one: a string that reads as a date and time. */
function validStamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
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
 * other setter — the bug that shape invited. Only the values listed here:
 * the retired set-asides (`RETIRED_SUPPORT_ASIDE_KEY`) are never carried.
 */
function snapshot(state: StoredSettings): StoredSettings {
  return {
    ...settingsValues(state),
    // Only once chosen (`StoredSettings.analyticsChosen`), after the switch's
    // value, as earlier builds wrote it.
    ...(state.analyticsChosen === true ? { analyticsChosen: true } : {}),
  };
}

/** Every stored value but whether Usage stats were chosen. */
function settingsValues(state: StoredSettings): Omit<StoredSettings, 'analyticsChosen'> {
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
    usageNoticeShownAt: state.usageNoticeShownAt,
  };
}
