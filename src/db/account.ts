// Device-side half of deleting an account, or of erasing a guest's data
// (docs/ACCOUNT_SPEC.md §3.4–3.5).
//
// Layer rule: L2. Pure SQL. The caller decides *when* — for a signed-in user,
// only after the server has confirmed the account is gone, so a failed server
// call never leaves a device wiped and an account still standing.

import { clearAgeBucket } from './ageBucket';
import { checkpointAfterWipe, getDb, vacuumAfterWipe, withTransaction } from './client';

/**
 * Every table that holds rows under a `user_id`, which a wipe for that user
 * empties of theirs. A table added with a `user_id` belongs here; the wipe's
 * test checks the list against the schema.
 */
export const PER_USER_TABLES = [
  'predictions',
  'user_stats',
  'category_stats',
  'analytics_events',
  // Tombstones too (roadmap D25): with the rows gone there's nothing left to
  // keep from coming back.
  'prediction_deletions',
  // The late changes counted on Insights (step 173, D62, 2026-11-19).
  'prediction_postponements',
  // And the answers moved between categories (step 184).
  'prediction_refiles',
  // And the category each open prediction had at its first move after the
  // day it was made (review round 6).
  'prediction_category_origins',
  // The person's own categories and icons (roadmap D39, D40) go with the
  // predictions in them.
  'categories',
  // The one-time sync jobs done for the account here (SQLite migration 020).
  'sync_markers',
] as const;

/**
 * The tables behind Insights' "Only this phone keeps this count" lines: the
 * counted deletions (D45; the same rows are sync's tombstones), the late
 * changes (step 173, D62, D69 (e)), the moved answers (D65) and the
 * remembered categories they are counted against (round 6). Ids, dates and
 * category ids; no words. Sign-out keeps them (`keepIntegrityCounts`), so
 * signing out and back in can't empty those lines (main session decision
 * 2026-11-19; D45: a miss can't disappear without a trace).
 */
export const INTEGRITY_COUNT_TABLES = [
  'prediction_deletions',
  'prediction_postponements',
  'prediction_refiles',
  'prediction_category_origins',
] as const satisfies readonly (typeof PER_USER_TABLES)[number][];

/**
 * What sign-out leaves of an account (`keepIntegrityCounts`): the integrity
 * counts, and the one-time sync jobs done for it here (`sync_markers`,
 * SQLite migration 020: an account id, a job name and a date). A job's marker
 * stays so it never runs again for the account: the offset backfill
 * (`markOffsetBackfillDone`) has already sent this phone's offsets, and
 * signing back in brings the rows down with what the server holds (review
 * round 6, 2026-11-19).
 */
export const SIGN_OUT_KEPT_TABLES = [
  ...INTEGRITY_COUNT_TABLES,
  'sync_markers',
] as const satisfies readonly (typeof PER_USER_TABLES)[number][];

export interface WipeOptions {
  /**
   * Also clear what belongs to whoever holds the phone rather than to one
   * account: the age band and the Warmup with any unfinished one, which have
   * no `user_id`. On by default, as account deletion and guest Erase promise
   * (owner, 2026-11-09). Whether sign-out clears them is the sign-out flow's
   * call; `false` leaves them.
   */
  deviceData?: boolean;
  /**
   * Leave this account's rows in `INTEGRITY_COUNT_TABLES` as they are, the
   * tombstones' `counted` and `pushed_at` included, and its sync markers
   * (`SIGN_OUT_KEPT_TABLES`): for sign-out (main session decision
   * 2026-11-19). Off by default: Erase and confirmed account deletion remove
   * them with everything else.
   *
   * A kept tombstone still waiting to be pushed stays waiting under its own
   * account: sync reads and deletes per `user_id` (`listPendingDeletions`,
   * and the server delete filters on it too), so another account signed in
   * here never pushes it, and this account pushes it when it next syncs. The
   * pull goes on skipping a tombstoned id, unless the server's copy was
   * answered after the deletion (`reconcileTombstoneWithRemote`).
   */
  keepIntegrityCounts?: boolean;
}

/**
 * Delete every row this device holds for `userId`: predictions, the stats
 * derived from them, queued analytics events, tombstones, the counted late
 * changes and moved answers with the categories remembered for them, the
 * person's categories and the one-time sync jobs done for them
 * (`PER_USER_TABLES`); with `keepIntegrityCounts`, all but the counts' tables
 * and the sync markers (`SIGN_OUT_KEPT_TABLES`). One transaction, so a
 * failure leaves everything in place rather than a record with its history
 * half gone.
 *
 * Scoped to one user on purpose. A shared phone can hold another account's
 * rows, and wiping yours must not delete theirs.
 *
 * Not touched here: the entitlement mirror (billing resets it to free when
 * the identity changes), daily practice (device-wide; its store clears it on
 * Erase and account deletion), and settings.
 *
 * The age band and the Warmup are the exceptions among ownerless rows, and
 * are cleared device-wide, whoever's they were, unless `deviceData` is false.
 * They are the person's own, with no second copy to protect, and both "Erase
 * all data" and account deletion promise the on-device copy is gone (the
 * Warmup since 2026-11-09, owner: it stayed behind after account deletion).
 *
 * The connection overwrites deleted rows with zeros (`secure_delete`, set at
 * every open). Once the deletes have committed, the file is rebuilt once
 * (`VACUUM`), which also overwrites pages freed before `secure_delete` was on,
 * and a checkpoint truncates any write-ahead log, so the words don't linger in
 * the file or its log (security review, 2026-11-18). Both run outside the
 * transaction, in the transaction queue, as SQLite requires, and never throw:
 * a wipe that committed is done.
 */
export async function wipeLocalUserData(
  userId: string,
  { deviceData = true, keepIntegrityCounts = false }: WipeOptions = {},
): Promise<void> {
  const kept: ReadonlySet<string> = new Set(keepIntegrityCounts ? SIGN_OUT_KEPT_TABLES : []);
  await withTransaction(async () => {
    const db = getDb();
    for (const table of PER_USER_TABLES) {
      if (kept.has(table)) continue;
      await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
    if (deviceData) {
      await clearAgeBucket();
      await db.run(`DELETE FROM warmup_results`);
      await db.run(`DELETE FROM warmup_progress`);
    }
  });
  // The rebuild first, so in WAL mode its pages go through the log that the
  // checkpoint then folds in and truncates.
  await vacuumAfterWipe();
  await checkpointAfterWipe();
}
