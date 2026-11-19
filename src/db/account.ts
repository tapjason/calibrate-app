// Device-side half of deleting an account, or of erasing a guest's data
// (docs/ACCOUNT_SPEC.md §3.4–3.5).
//
// Layer rule: L2. Pure SQL. The caller decides *when* — for a signed-in user,
// only after the server has confirmed the account is gone, so a failed server
// call never leaves a device wiped and an account still standing.

import { clearAgeBucket } from './ageBucket';
import { checkpointAfterWipe, getDb, withTransaction } from './client';

/**
 * Delete every row this device holds for `userId`: predictions, the stats
 * derived from them, and queued analytics events. One transaction, so a
 * failure leaves everything in place rather than a record with its history
 * half gone.
 *
 * Scoped to one user on purpose. A shared phone can hold another account's
 * rows (sign-out keeps them for when that person signs back in), and deleting
 * your account must not delete theirs.
 *
 * Not touched here: the entitlement mirror (billing resets it to free when
 * the identity changes).
 *
 * The age band and the Warmup are the exceptions among ownerless rows, and
 * are cleared device-wide, whoever's they were. They are the person's own,
 * with no second copy to protect, and both "Erase all
 * data" and account deletion promise the on-device copy is gone (the Warmup
 * since 2026-11-09, owner: it stayed behind after account deletion).
 *
 * The connection overwrites deleted rows with zeros (`secure_delete`, set at
 * every open), and once the deletes have committed a checkpoint truncates any
 * write-ahead log, so the words don't linger in the file or its log (security
 * review, 2026-11-18). The checkpoint runs outside the transaction, as SQLite
 * requires, and never throws: a wipe that committed is done.
 */
export async function wipeLocalUserData(userId: string): Promise<void> {
  await withTransaction(async () => {
    const db = getDb();
    await db.run(`DELETE FROM predictions WHERE user_id = ?`, [userId]);
    await db.run(`DELETE FROM user_stats WHERE user_id = ?`, [userId]);
    await db.run(`DELETE FROM category_stats WHERE user_id = ?`, [userId]);
    await db.run(`DELETE FROM analytics_events WHERE user_id = ?`, [userId]);
    // Tombstones too (roadmap D25): with the rows gone there's nothing left to
    // keep from coming back.
    await db.run(`DELETE FROM prediction_deletions WHERE user_id = ?`, [userId]);
    // And the late due-date moves counted beside them (step 173).
    await db.run(`DELETE FROM prediction_postponements WHERE user_id = ?`, [userId]);
    // And the answers moved between categories (step 184).
    await db.run(`DELETE FROM prediction_refiles WHERE user_id = ?`, [userId]);
    // The person's own categories (roadmap D39) go with the predictions in them.
    await db.run(`DELETE FROM categories WHERE user_id = ?`, [userId]);
    await clearAgeBucket();
    await db.run(`DELETE FROM warmup_results`);
    await db.run(`DELETE FROM warmup_progress`);
  });
  await checkpointAfterWipe();
}
