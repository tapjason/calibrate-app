// An answer run kept across a reload (step 179; blind playtest 2026-11-13e,
// run 2): the phone's memory killed the app after three answers, and the run
// came back as "1 of 3" with an end summary that left the first three out.
//
// Device-local and short-lived: the run's queue as it opened and the cards
// answered in it, dropped after RUN_KEEP_HOURS or when the run ends. Nothing
// here is a record: the answers themselves are in SQLite.

import { create } from 'zustand';

/** How long a run is offered back after the app reopens, in hours. */
export const RUN_KEEP_HOURS = 2;

export interface KeptRun {
  /** The ready predictions in due order, as the run opened. */
  queue: string[];
  /** The ones answered (or skipped) in the run, in order. */
  answered: string[];
  /** When the run opened, ISO. */
  startedAt: string;
}

/** Injectable persistence so tests don't touch the native AsyncStorage. */
export interface ResolveRunPersistence {
  load(): Promise<KeptRun | null>;
  save(run: KeptRun | null): Promise<void>;
}

const STORAGE_KEY = 'calibrate:resolve-run';

function defaultPersistence(): ResolveRunPersistence {
  const storage = () =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@react-native-async-storage/async-storage')
      .default as typeof import('@react-native-async-storage/async-storage').default;
  return {
    async load() {
      const raw = await storage().getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as KeptRun) : null;
    },
    async save(run) {
      if (run) await storage().setItem(STORAGE_KEY, JSON.stringify(run));
      else await storage().removeItem(STORAGE_KEY);
    },
  };
}

let persistence: ResolveRunPersistence = defaultPersistence();

/** Test-only: swap persistence and empty the store. */
export function __setResolveRunPersistenceForTests(next: ResolveRunPersistence | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setResolveRunPersistenceForTests is only allowed when NODE_ENV=test');
  }
  persistence = next ?? defaultPersistence();
  useResolveRunStore.setState({ run: null, hydrated: false });
}

/** A stored run still worth resuming: recent, and of the right shape. */
export function freshRun(raw: unknown, now: Date): KeptRun | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<KeptRun>;
  if (!Array.isArray(r.queue) || !r.queue.every((id) => typeof id === 'string')) return null;
  if (!Array.isArray(r.answered) || !r.answered.every((id) => typeof id === 'string')) return null;
  if (typeof r.startedAt !== 'string') return null;
  const age = now.getTime() - Date.parse(r.startedAt);
  if (!(age >= 0 && age <= RUN_KEEP_HOURS * 60 * 60 * 1000)) return null;
  return { queue: r.queue, answered: r.answered, startedAt: r.startedAt };
}

interface ResolveRunState {
  run: KeptRun | null;
  hydrated: boolean;
  /** Load a stored run, dropping one too old to resume. */
  hydrate: (now?: Date) => Promise<void>;
  /** A run opened with this queue (and these answered, when resumed). */
  start: (queue: string[], now?: Date, answered?: string[]) => void;
  /** A card in the run was answered or skipped. */
  markAnswered: (id: string) => void;
  /** The run ended (caught up, closed or dismissed). */
  clear: () => void;
}

function write(run: KeptRun | null): void {
  void persistence.save(run).catch((e: unknown) => {
    // Non-critical, like the Log draft: the run works without it.
    // eslint-disable-next-line no-console
    console.warn('[resolve-run] save failed:', e);
  });
}

export const useResolveRunStore = create<ResolveRunState>((set, get) => ({
  run: null,
  hydrated: false,

  hydrate: async (now = new Date()) => {
    try {
      const stored = await persistence.load();
      const fresh = freshRun(stored, now);
      set({ run: fresh });
      if (stored && !fresh) write(null);
    } catch (e) {
      // Unreadable (corrupted, say): dropped, so it doesn't warn every launch.
      // eslint-disable-next-line no-console
      console.warn('[resolve-run] load failed:', e);
      write(null);
    } finally {
      set({ hydrated: true });
    }
  },

  start: (queue, now = new Date(), answered = []) => {
    // A resumed run keeps its own start, so it isn't offered back for ever.
    const kept = get().run;
    const resumed = answered.length > 0 && kept !== null && kept.queue.join() === queue.join();
    const run: KeptRun = { queue, answered, startedAt: resumed ? kept.startedAt : now.toISOString() };
    set({ run });
    write(run);
  },

  markAnswered: (id) => {
    const run = get().run;
    if (!run || run.answered.includes(id)) return;
    const next = { ...run, answered: [...run.answered, id] };
    set({ run: next });
    write(next);
  },

  clear: () => {
    if (get().run === null) return;
    set({ run: null });
    write(null);
  },
}));
