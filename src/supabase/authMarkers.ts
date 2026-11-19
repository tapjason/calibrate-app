// Two small facts about accounts on this phone that must outlast a restart
// (security review round 5, 2026-11-19). Kept in AsyncStorage, which a
// deleted app takes with it along with the database these facts are about,
// and mirrored in memory, which is what the app reads: a failed write is
// logged, and the rest of the run still goes by it.
//
//   Owed wipes. An account whose rows are to leave this phone as soon as no
//   session of its is active here:
//     • 'deletion': its deletion was asked for and not confirmed either way.
//       If its session later ends by itself (the account is gone, so a token
//       refresh fails), its rows go, as on sign-out: the account's rows only
//       (authStore's eraseAccountHere, 'accountRows'). The Warm-up, the age
//       band and practice stay, unlike a confirmed deletion's wipe. Settled
//       by a confirmed outcome.
//     • 'signOut': a sign-out ended its session but the wipe that follows
//       didn't finish. Tried again at the next launch.
//   A sign-in the person makes to that account cancels it: its rows are live
//   again.
//
//   Signed out here alone. An account this phone signed out of without the
//   server hearing (no connection). A token refresh already under way can
//   land afterwards and write that session back (client reviewer LOW-A);
//   authStore ignores a session for such an account unless the person signs
//   in to it again, which takes it off the list.
//
// Layer rule: L5. Imports nothing from the app; AsyncStorage is lazy-required
// so Jest, where it has no native module, gets the defaults.

/** The storage the markers are kept in (AsyncStorage's shape). */
export interface MarkerStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Why an account's rows are owed a wipe. */
export type WipeReason = 'deletion' | 'signOut';

export interface OwedWipe {
  userId: string;
  reason: WipeReason;
}

export const AUTH_MARKERS_KEY = 'calibrate:auth-markers';

/** The most accounts remembered as signed out here alone; the oldest go first. */
const MAX_SIGNED_OUT_HERE = 10;

interface Stored {
  v: 1;
  owed: OwedWipe[];
  signedOutHere: string[];
}

const owed = new Map<string, WipeReason>();
const signedOutHere: string[] = [];
let loaded: Promise<void> | null = null;
let storageOverride: MarkerStorage | null = null;
let writes: Promise<void> = Promise.resolve();

function defaultStorage(): MarkerStorage {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@react-native-async-storage/async-storage')
    .default as typeof import('@react-native-async-storage/async-storage').default;
}

function storage(): MarkerStorage {
  return storageOverride ?? defaultStorage();
}

function isReason(value: unknown): value is WipeReason {
  return value === 'deletion' || value === 'signOut';
}

/** The stored markers, read leniently: anything malformed is left out. */
function parse(raw: string | null): { owed: OwedWipe[]; signedOutHere: string[] } {
  if (!raw) return { owed: [], signedOutHere: [] };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { owed: [], signedOutHere: [] };
  }
  if (typeof data !== 'object' || data === null) return { owed: [], signedOutHere: [] };
  const { owed: rawOwed, signedOutHere: rawSignedOut } = data as {
    owed?: unknown;
    signedOutHere?: unknown;
  };
  const owedList = Array.isArray(rawOwed)
    ? rawOwed.filter(
        (entry): entry is OwedWipe =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { userId?: unknown }).userId === 'string' &&
          (entry as { userId: string }).userId !== '' &&
          isReason((entry as { reason?: unknown }).reason),
      )
    : [];
  const signedOutList = Array.isArray(rawSignedOut)
    ? rawSignedOut.filter((id): id is string => typeof id === 'string' && id !== '')
    : [];
  return { owed: owedList, signedOutHere: signedOutList };
}

/**
 * Read the stored markers into memory, once per run; what this run already
 * marked stays (a deletion reason wins over a sign-out one). Never throws:
 * markers that can't be read count as none, so nothing is wiped on a guess.
 */
export function loadAuthMarkers(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      let stored: { owed: OwedWipe[]; signedOutHere: string[] };
      try {
        stored = parse(await storage().getItem(AUTH_MARKERS_KEY));
      } catch {
        return;
      }
      for (const { userId, reason } of stored.owed) {
        if (!owed.has(userId) || reason === 'deletion') owed.set(userId, reason);
      }
      for (const id of stored.signedOutHere) {
        if (!signedOutHere.includes(id)) signedOutHere.push(id);
      }
      while (signedOutHere.length > MAX_SIGNED_OUT_HERE) signedOutHere.shift();
    })();
  }
  return loaded;
}

/** Write what memory holds. Writes go one after another; a failure is logged. */
function persist(): Promise<void> {
  const snapshot: Stored = {
    v: 1,
    owed: Array.from(owed, ([userId, reason]) => ({ userId, reason })),
    signedOutHere: [...signedOutHere],
  };
  const next = (async () => {
    try {
      await writes;
    } catch {
      // The earlier write's failure was logged.
    }
    try {
      if (snapshot.owed.length === 0 && snapshot.signedOutHere.length === 0) {
        await storage().removeItem(AUTH_MARKERS_KEY);
      } else {
        await storage().setItem(AUTH_MARKERS_KEY, JSON.stringify(snapshot));
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        '[auth] could not save the account markers:',
        e instanceof Error ? e.message : 'unknown error',
      );
    }
  })();
  writes = next;
  return next;
}

// The readers below read memory: call `loadAuthMarkers` first (authStore's
// initialize does). Every change waits for it, so a change made before the
// read can't be undone by it, or overwrite what was stored.

/** Every account owed a wipe, and why. */
export function owedWipes(): OwedWipe[] {
  return Array.from(owed, ([userId, reason]) => ({ userId, reason }));
}

/** Why `userId`'s rows are owed a wipe, or null. */
export function owedWipeFor(userId: string): WipeReason | null {
  return owed.get(userId) ?? null;
}

/**
 * Mark `userId`'s rows as owed a wipe. Returns whether this call added it:
 * false when it was already owed, for either reason (a deletion's reason is
 * never replaced by a sign-out's). Never throws.
 */
export async function addOwedWipe(userId: string, reason: WipeReason): Promise<boolean> {
  await loadAuthMarkers();
  if (owed.has(userId)) {
    if (reason === 'deletion' && owed.get(userId) !== 'deletion') {
      owed.set(userId, 'deletion');
      await persist();
    }
    return false;
  }
  owed.set(userId, reason);
  await persist();
  return true;
}

/** `userId`'s rows are wiped, or no longer owed one. Never throws. */
export async function settleOwedWipe(userId: string): Promise<void> {
  await loadAuthMarkers();
  if (!owed.delete(userId)) return;
  await persist();
}

/** Whether this phone signed out of `userId` without the server hearing. */
export function isSignedOutHere(userId: string): boolean {
  return signedOutHere.includes(userId);
}

/** Remember that this phone signed out of `userId` alone. Never throws. */
export async function rememberSignedOutHere(userId: string): Promise<void> {
  await loadAuthMarkers();
  const at = signedOutHere.indexOf(userId);
  if (at >= 0) signedOutHere.splice(at, 1);
  signedOutHere.push(userId);
  while (signedOutHere.length > MAX_SIGNED_OUT_HERE) signedOutHere.shift();
  await persist();
}

/** The person signed in to `userId` again: its sessions count. Never throws. */
export async function forgetSignedOutHere(userId: string): Promise<void> {
  await loadAuthMarkers();
  const at = signedOutHere.indexOf(userId);
  if (at < 0) return;
  signedOutHere.splice(at, 1);
  await persist();
}

/**
 * Test-only: empty memory, forget that the markers were read, and keep them
 * in `next` (an in-memory store in tests) instead of AsyncStorage.
 */
export function __resetAuthMarkersForTests(next: MarkerStorage | null = null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetAuthMarkersForTests is only allowed when NODE_ENV=test');
  }
  owed.clear();
  signedOutHere.length = 0;
  loaded = null;
  writes = Promise.resolve();
  storageOverride = next;
}
