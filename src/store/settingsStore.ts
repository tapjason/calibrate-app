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

export interface StoredSettings {
  notificationsEnabled: boolean;
  aiRefineEnabled: boolean;
  /** Plus-only Coach insights on the Stats screen. Opt-in — see DEFAULTS. */
  coachEnabled: boolean;
  /**
   * Anonymous product analytics — a closed list of events with no freetext
   * (src/analytics/events.ts). On by default; turning it off clears the queue.
   */
  analyticsEnabled: boolean;
  /**
   * Chosen share-card theme id (src/constants/cardThemes.ts). Cosmetic only —
   * an id the user is not entitled to resolves back to the free theme at
   * render time, so a lapsed subscriber keeps every card, in the free look.
   */
  cardThemeId: string;
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
}

/** Injectable persistence so tests don't touch the native AsyncStorage. */
export interface SettingsPersistence {
  load(): Promise<Partial<StoredSettings> | null>;
  save(settings: StoredSettings): Promise<void>;
}

interface SettingsState extends StoredSettings {
  /** True once hydrate() has run (whether or not stored values existed). */
  hydrated: boolean;
  /** Load persisted settings into the store. Safe to call once at startup. */
  hydrate: () => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setAiRefineEnabled: (enabled: boolean) => Promise<void>;
  setCoachEnabled: (enabled: boolean) => Promise<void>;
  setAnalyticsEnabled: (enabled: boolean) => Promise<void>;
  setCardThemeId: (id: string) => Promise<void>;
  /** Start the coverage-nudge cooldown from now. */
  markCoverageNudgeShown: () => Promise<void>;
  /** "Not now" on the reminder prompt: hide it for a week from now. */
  dismissReminderPrompt: () => Promise<void>;
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
  aiRefineEnabled: true,
  coachEnabled: false,
  analyticsEnabled: true,
  cardThemeId: DEFAULT_THEME.id,
  coverageNudgeLastShownAt: null,
  reminderPromptDismissedAt: null,
};

const STORAGE_KEY = 'calibrate:settings';

function defaultPersistence(): SettingsPersistence {
  return {
    async load() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage')
        .default as typeof import('@react-native-async-storage/async-storage').default;
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<StoredSettings>) : null;
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
  useSettingsStore.setState({ ...DEFAULTS, hydrated: false });
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

  hydrate: async () => {
    try {
      const stored = await persistence.load();
      if (stored) {
        set({
          notificationsEnabled:
            stored.notificationsEnabled ?? DEFAULTS.notificationsEnabled,
          aiRefineEnabled: stored.aiRefineEnabled ?? DEFAULTS.aiRefineEnabled,
          coachEnabled: stored.coachEnabled ?? DEFAULTS.coachEnabled,
          analyticsEnabled:
            stored.analyticsEnabled ?? DEFAULTS.analyticsEnabled,
          cardThemeId: stored.cardThemeId ?? DEFAULTS.cardThemeId,
          coverageNudgeLastShownAt:
            stored.coverageNudgeLastShownAt ??
            DEFAULTS.coverageNudgeLastShownAt,
          reminderPromptDismissedAt:
            stored.reminderPromptDismissedAt ?? DEFAULTS.reminderPromptDismissedAt,
        });
      }
    } catch (e) {
      // Fall back to defaults — never block startup on a settings read.
      // eslint-disable-next-line no-console
      console.warn('[settings] load failed; using defaults:', e);
    } finally {
      set({ hydrated: true });
    }
  },

  setNotificationsEnabled: async (enabled) => {
    set({ notificationsEnabled: enabled });
    await persist(snapshot(get()));
  },

  setAiRefineEnabled: async (enabled) => {
    set({ aiRefineEnabled: enabled });
    await persist(snapshot(get()));
  },

  setCoachEnabled: async (enabled) => {
    set({ coachEnabled: enabled });
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

  markCoverageNudgeShown: async () => {
    set({ coverageNudgeLastShownAt: new Date().toISOString() });
    await persist(snapshot(get()));
  },

  dismissReminderPrompt: async () => {
    set({ reminderPromptDismissedAt: new Date().toISOString() });
    await persist(snapshot(get()));
  },
}));

/**
 * The persistable slice of the store. Each setter writes the whole snapshot
 * after updating state, so adding a toggle no longer means editing every
 * other setter — the bug that shape invited.
 */
function snapshot(state: StoredSettings): StoredSettings {
  return {
    notificationsEnabled: state.notificationsEnabled,
    aiRefineEnabled: state.aiRefineEnabled,
    coachEnabled: state.coachEnabled,
    analyticsEnabled: state.analyticsEnabled,
    cardThemeId: state.cardThemeId,
    coverageNudgeLastShownAt: state.coverageNudgeLastShownAt,
    reminderPromptDismissedAt: state.reminderPromptDismissedAt,
  };
}
