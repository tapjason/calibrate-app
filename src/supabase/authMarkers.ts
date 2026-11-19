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
//       refresh fails), its rows go: the account's rows, this phone's
//       integrity counts for it included (authStore's eraseAccountHere,
//       'accountRows'; a sign-out's wipe keeps those counts). The Warm-up,
//       the age band and practice stay, unlike a confirmed deletion's wipe.
//       Settled by a confirmed outcome. It keeps when the last request that
//       may have run was sent (`deletionAskedAt`, client re-review N4,
//       2026-11-19), so a later definite "the account still exists", from
//       after that request can have finished on the server, settles it too.
//     • 'signOut': a sign-out is under way. Marked once it has checked what
//       would be lost; the wipe then runs before the session ends (round 6,
//       N2), and settles the mark as soon as it goes. A mark still here means
//       the wipe failed, or the app closed before it ran: tried again at the
//       next launch if the account isn't signed in then (that wipe keeps the
//       integrity counts, as a sign-out's does), and dropped if it is (the
//       session never ended), or if the session couldn't be ended after all.
//   A sign-in the person makes to that account cancels it: its rows are live
//   again.
//
//   Signed out here. Every account this phone signed out of, online or not
//   (round 6, N3; until then only one signed out without the server
//   hearing). Recorded just before the session ends, and forgotten if it
//   couldn't be ended. A session for it can still come back: a token refresh
//   already under way can land afterwards and write it back (client reviewer
//   LOW-A), and a stale copy can be left in storage (one an earlier build or
//   a cleanup that failed left in AsyncStorage). authStore ignores a session
//   for such an account, and takes it off the phone, unless the person signs
//   in to it again, which takes the account off the list. Not recorded for
//   an account whose deletion was confirmed.
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

/** The most accounts remembered as signed out here; the oldest go first. */
const MAX_SIGNED_OUT_HERE = 10;

interface Stored {
  v: 1;
  owed: OwedWipe[];
  signedOutHere: string[];
  /**
   * For each account owed a 'deletion' wipe, when (ms since the epoch, the
   * phone's clock) the last deletion request that may have run was sent.
   * Written only when there is one, so a store holding only sign-out marks
   * keeps the shape earlier builds wrote. A build that doesn't know it drops
   * it, and a deletion with no time is never settled by a later "still
   * exists" (N4): it waits for a confirmed outcome, as before.
   */
  deletionAskedAt?: Record<string, number>;
}

const owed = new Map<string, WipeReason>();
const signedOutHere: string[] = [];
/** `Stored.deletionAskedAt` in memory: only for accounts owed a 'deletion' wipe. */
const askedAt = new Map<string, number>();
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

interface Parsed {
  owed: OwedWipe[];
  signedOutHere: string[];
  deletionAskedAt: Map<string, number>;
}

/** A time the phone could have stamped: a whole, positive number of ms. */
function isStamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** The stored markers, read leniently: anything malformed is left out. */
function parse(raw: string | null): Parsed {
  const none = (): Parsed => ({ owed: [], signedOutHere: [], deletionAskedAt: new Map() });
  if (!raw) return none();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return none();
  }
  if (typeof data !== 'object' || data === null) return none();
  const {
    owed: rawOwed,
    signedOutHere: rawSignedOut,
    deletionAskedAt: rawAskedAt,
  } = data as {
    owed?: unknown;
    signedOutHere?: unknown;
    deletionAskedAt?: unknown;
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
  // Only for an account owed a deletion's wipe; anything else is left out.
  const deletionAskedAt = new Map<string, number>();
  if (typeof rawAskedAt === 'object' && rawAskedAt !== null && !Array.isArray(rawAskedAt)) {
    for (const { userId, reason } of owedList) {
      if (reason !== 'deletion') continue;
      const at = (rawAskedAt as Record<string, unknown>)[userId];
      if (isStamp(at)) deletionAskedAt.set(userId, at);
    }
  }
  return { owed: owedList, signedOutHere: signedOutList, deletionAskedAt };
}

/**
 * Read the stored markers into memory, once per run; what this run already
 * marked stays (a deletion reason wins over a sign-out one). Never throws:
 * markers that can't be read count as none, so nothing is wiped on a guess.
 */
export function loadAuthMarkers(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      let stored: Parsed;
      try {
        stored = parse(await storage().getItem(AUTH_MARKERS_KEY));
      } catch {
        return;
      }
      for (const { userId, reason } of stored.owed) {
        const markedThisRun = owed.has(userId);
        if (!markedThisRun || reason === 'deletion') owed.set(userId, reason);
        // A deletion's time: the stored one, unless this run already stamped
        // a later request, which is the one that may still run.
        const storedAt = stored.deletionAskedAt.get(userId);
        if (owed.get(userId) === 'deletion' && storedAt !== undefined) {
          const ours = askedAt.get(userId);
          if (ours === undefined || storedAt > ours) askedAt.set(userId, storedAt);
        }
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
  const stamps = Array.from(askedAt).filter(([userId]) => owed.get(userId) === 'deletion');
  if (stamps.length > 0) snapshot.deletionAskedAt = Object.fromEntries(stamps);
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
 *
 * A 'deletion' mark is stamped with now every time, added or not: it is made
 * just before a deletion request goes, and that request may run on the server
 * until well after (`deletionAskedAt`).
 */
export async function addOwedWipe(userId: string, reason: WipeReason): Promise<boolean> {
  await loadAuthMarkers();
  const added = !owed.has(userId);
  if (added || reason === 'deletion') owed.set(userId, added ? reason : 'deletion');
  if (reason === 'deletion') askedAt.set(userId, Date.now());
  if (added || reason === 'deletion') await persist();
  return added;
}

/** `userId`'s rows are wiped, or no longer owed one. Never throws. */
export async function settleOwedWipe(userId: string): Promise<void> {
  await loadAuthMarkers();
  askedAt.delete(userId);
  if (!owed.delete(userId)) return;
  await persist();
}

/**
 * When the last deletion request for `userId` that may have run was sent (ms
 * since the epoch, by the phone's clock), or null: no deletion is owed, or its
 * time isn't known (marked by a build before N4).
 */
export function deletionAskedAt(userId: string): number | null {
  if (owed.get(userId) !== 'deletion') return null;
  return askedAt.get(userId) ?? null;
}

/**
 * Put back the time a deletion mark had before `addOwedWipe` stamped it, for a
 * request that certainly ran nothing: the request that may still run is the
 * earlier one. Null puts back "not known". Nothing happens when no deletion is
 * owed. Never throws.
 */
export async function restoreDeletionAskedAt(userId: string, at: number | null): Promise<void> {
  await loadAuthMarkers();
  if (owed.get(userId) !== 'deletion') return;
  if (at !== null && isStamp(at)) askedAt.set(userId, at);
  else askedAt.delete(userId);
  await persist();
}

/**
 * Whether this phone signed out of `userId` (any sign-out, online or not) and
 * the person hasn't signed in to it here since: a session for it that turns up
 * is stale, and doesn't count.
 */
export function isSignedOutHere(userId: string): boolean {
  return signedOutHere.includes(userId);
}

/**
 * Remember that this phone is signing out of `userId`: recorded by every
 * sign-out just before the session ends, online or not. Never throws.
 */
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
  askedAt.clear();
  loaded = null;
  writes = Promise.resolve();
  storageOverride = next;
}
