// Settings store. Holds device-local user preferences — notification and AI
// refine toggles — and persists them to AsyncStorage. Offline-only: settings
// are not synced to Supabase (per CLAUDE.md they're local preferences).
//
// Layer note: this is L4. It owns no business math and reaches no service.
// The notification services (L5) SUBSCRIBE to this store to react to toggle
// changes — the dependency arrow points L5 → L4, never the reverse, exactly
// like the prediction-store subscriptions in scheduler.ts / digest.ts.

import { create } from 'zustand';

export interface StoredSettings {
  notificationsEnabled: boolean;
  aiRefineEnabled: boolean;
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
}

// Defaults preserve today's behavior: refine button is available and
// resolution reminders fire until the user opts out.
const DEFAULTS: StoredSettings = {
  notificationsEnabled: true,
  aiRefineEnabled: true,
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
    await persist({
      notificationsEnabled: enabled,
      aiRefineEnabled: get().aiRefineEnabled,
    });
  },

  setAiRefineEnabled: async (enabled) => {
    set({ aiRefineEnabled: enabled });
    await persist({
      notificationsEnabled: get().notificationsEnabled,
      aiRefineEnabled: enabled,
    });
  },
}));
