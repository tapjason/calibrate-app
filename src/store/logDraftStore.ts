// Log's unsaved draft (step 173, aggregate B11). A half-typed prediction was
// lost to an interruption in six runs across rounds 12–14, once the deepest
// mood dip of a day ("I thought I broke it"); on iOS an app switch keeps
// memory, but a kill doesn't. Re-raises roadmap D52 (1), which had closed
// drafts, on that evidence.
//
// Device-local, never synced, kept for a day (`LOG_DRAFT_HOURS`), and cleared
// by a save, by "Discard prediction", by Erase and by account deletion. The
// confidence is kept too: it is the person's own number for this draft, not a
// carried-over one (D13's rule is about a preset nobody chose).
//
// Layer note: L4. State and persistence only, no business math.

import { create } from 'zustand';

import type { Category } from '@/types';

/** How long a draft is offered back, in hours. */
export const LOG_DRAFT_HOURS = 24;

export interface LogDraft {
  title: string;
  category: Category | null;
  confidence: number | null;
  dueIso: string;
  /** When it was last written, ISO. */
  savedAt: string;
}

/** Injectable persistence so tests don't touch the native AsyncStorage. */
export interface LogDraftPersistence {
  load(): Promise<LogDraft | null>;
  save(draft: LogDraft | null): Promise<void>;
}

const STORAGE_KEY = 'calibrate:log-draft';

function defaultPersistence(): LogDraftPersistence {
  const storage = () =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@react-native-async-storage/async-storage')
      .default as typeof import('@react-native-async-storage/async-storage').default;
  return {
    async load() {
      const raw = await storage().getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LogDraft) : null;
    },
    async save(draft) {
      if (draft) await storage().setItem(STORAGE_KEY, JSON.stringify(draft));
      else await storage().removeItem(STORAGE_KEY);
    },
  };
}

let persistence: LogDraftPersistence = defaultPersistence();

/** Test-only: swap persistence and empty the store. */
export function __setLogDraftPersistenceForTests(next: LogDraftPersistence | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setLogDraftPersistenceForTests is only allowed when NODE_ENV=test');
  }
  persistence = next ?? defaultPersistence();
  useLogDraftStore.setState({ draft: null, hydrated: false });
}

/**
 * A stored draft still worth offering: inside the day, with words in it, and
 * of the right shape (anything else is dropped rather than half-restored).
 */
export function freshDraft(raw: unknown, now: Date): LogDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<LogDraft>;
  if (typeof d.title !== 'string' || d.title.trim().length === 0) return null;
  if (typeof d.dueIso !== 'string' || Number.isNaN(Date.parse(d.dueIso))) return null;
  if (typeof d.savedAt !== 'string') return null;
  const age = now.getTime() - Date.parse(d.savedAt);
  if (!(age >= 0 && age <= LOG_DRAFT_HOURS * 60 * 60 * 1000)) return null;
  const confidence =
    typeof d.confidence === 'number' &&
    Number.isInteger(d.confidence) &&
    d.confidence >= 0 &&
    d.confidence <= 100
      ? d.confidence
      : null;
  return {
    title: d.title,
    category: typeof d.category === 'string' ? (d.category as Category) : null,
    confidence,
    dueIso: d.dueIso,
    savedAt: d.savedAt,
  };
}

interface LogDraftState {
  draft: LogDraft | null;
  hydrated: boolean;
  /** Load the stored draft, dropping one past its day. */
  hydrate: (now?: Date) => Promise<void>;
  /** Keep this draft (a blank title clears it). */
  save: (draft: Omit<LogDraft, 'savedAt'>, now?: Date) => Promise<void>;
  /**
   * Drop the draft: from memory at once, and from storage. True once the
   * stored copy is removed; false when that write failed, and the draft (the
   * person's half-typed words) is still on the phone, offered back at the
   * next launch within its day. Erase reports a false as a step that didn't
   * finish (review round two, 2026-11-19); a save or a discard can ignore it.
   * Never throws.
   */
  clear: () => Promise<boolean>;
}

/** Store the draft, or remove it (null). True when the write landed. Never throws. */
async function write(draft: LogDraft | null): Promise<boolean> {
  try {
    await persistence.save(draft);
    return true;
  } catch (e) {
    // Non-critical, like settings: the form works without it.
    // eslint-disable-next-line no-console
    console.warn('[log-draft] save failed:', e);
    return false;
  }
}

export const useLogDraftStore = create<LogDraftState>((set) => ({
  draft: null,
  hydrated: false,

  hydrate: async (now = new Date()) => {
    try {
      const stored = await persistence.load();
      const fresh = freshDraft(stored, now);
      set({ draft: fresh });
      if (stored && !fresh) await write(null);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[log-draft] load failed:', e);
    } finally {
      set({ hydrated: true });
    }
  },

  save: async (draft, now = new Date()) => {
    if (draft.title.trim().length === 0) {
      set({ draft: null });
      await write(null);
      return;
    }
    const next: LogDraft = { ...draft, savedAt: now.toISOString() };
    set({ draft: next });
    await write(next);
  },

  clear: async () => {
    set({ draft: null });
    return write(null);
  },
}));
