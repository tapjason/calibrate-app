// What a sign-out would take off this phone that can't come back, and
// whether what the person agreed to lose still covers it (security review
// round 6, client re-review N1 and N2, 2026-11-19).
//
// Sign-out wipes the account's rows (D69 (a)), keeping only this phone's
// integrity counts (`keepIntegrityCounts`, src/db/account.ts). What doesn't
// come back on signing in again:
//   • changes not yet pushed: a dirty prediction row (`countUnsynced` counts
//     them, with deletions not yet pushed, which the wipe now keeps and the
//     account's next sync sends);
//   • categories that live only here (`countLocalOnlyCategories`, D39, D40).
// The person is asked first when either count is above zero, and told both.
//
// What they agreed to is a snapshot (`AtStake`), and the check is repeated
// immediately before the wipe: a change made in between (a reminder's
// Happened, a log on another tab while "Signing out…" shows) isn't covered
// by it, and the sign-out stops and asks again. Beyond the two counts, the
// snapshot keeps each dirty row's id and `updated_at`, so a change isn't
// hidden by another reaching the server at the same moment (the count would
// stay the same), nor by an edit to a row already counted.
//
// Layer rule: L5. Reads through src/db and sync's `unsyncedRows`; no state.

import { countLocalOnlyCategories } from '@/db/categories';
import { countUnsynced } from '@/db/predictions';

import { unsyncedRows } from './sync';

/** What signing out would lose for good, read at one moment. */
export interface AtStake {
  /** Changes not yet on the server (`countUnsynced`), and never fewer than `rows`. */
  unsynced: number;
  /** Categories only this phone has (`countLocalOnlyCategories`). */
  localCategories: number;
  /** Each dirty prediction row: its id and `updated_at` (`unsyncedRows`). */
  rows: ReadonlyMap<string, string>;
}

/** Nothing at stake: what a sign-out the person hasn't been asked about may lose. */
export const NOTHING_AT_STAKE: AtStake = Object.freeze({
  unsynced: 0,
  localCategories: 0,
  rows: new Map<string, string>(),
});

/**
 * Read what signing out of `userId` would lose now. The rows first, once every
 * queued transaction has settled; then the counts. Throws when a read does:
 * the caller can't say what would be lost, and changes nothing.
 */
export async function readAtStake(userId: string): Promise<AtStake> {
  const rows = await unsyncedRows(userId);
  const unsynced = await countUnsynced(userId);
  const localCategories = await countLocalOnlyCategories(userId);
  return {
    // Never fewer than the rows read: one can reach the server between the
    // two reads, and a question naming 0 changes would make no sense.
    unsynced: Math.max(unsynced, rows.size),
    localCategories,
    rows,
  };
}

/** Whether anything would be lost: the person has to be asked first. */
export function anythingAtStake(atStake: AtStake): boolean {
  return atStake.unsynced > 0 || atStake.localCategories > 0 || atStake.rows.size > 0;
}

/**
 * Whether what the person agreed to lose (`agreed`) covers what is at stake
 * `now`: neither count is higher, and every dirty row now was in `agreed` with
 * the same `updated_at`. A row that reached the server since is simply gone
 * from `now`, which is fine.
 */
export function agreedCovers(agreed: AtStake, now: AtStake): boolean {
  if (now.unsynced > agreed.unsynced) return false;
  if (now.localCategories > agreed.localCategories) return false;
  for (const [id, updatedAt] of now.rows) {
    if (agreed.rows.get(id) !== updatedAt) return false;
  }
  return true;
}
