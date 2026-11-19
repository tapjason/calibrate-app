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
  // The person's own categories and icons (roadmap D39, D40) go with the
  // predictions in them.
  'categories',
] as const;

export interface WipeOptions {
  /**
   * Also clear what belongs to whoever holds the phone rather than to one
   * account: the age band and the Warmup with any unfinished one, which have
   * no `user_id`. On by default, as account deletion and guest Erase promise
   * (owner, 2026-11-09). Whether sign-out clears them is the sign-out flow's
   * call; `false` leaves them.
   */
  deviceData?: boolean;
}

/**
 * Delete every row this device holds for `userId`: predictions, the stats
 * derived from them, queued analytics events, tombstones, the counted late
 * changes and moved answers, and the person's categories
 * (`PER_USER_TABLES`). One transaction, so a failure leaves everything in
 * place rather than a record with its history half gone.
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
  { deviceData = true }: WipeOptions = {},
): Promise<void> {
  await withTransaction(async () => {
    const db = getDb();
    for (const table of PER_USER_TABLES) {
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
