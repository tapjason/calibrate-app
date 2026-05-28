// First-signin handoff: move all rows that belong to the guest placeholder
// user_id over to the authenticated user_id.
//
// Layer rule: L2 (data access). Pure SQL — no Supabase, no stores. The
// authStore calls this on the guest→authenticated transition and then
// triggers a stats recompute so the derived numbers are rebuilt from the
// moved predictions.
//
// Strategy:
//   • predictions: UPDATE user_id (PK is `id`, no collision possible).
//   • user_stats / category_stats: DELETE both the guest's rows AND any
//     pre-existing rows for the destination user_id, then leave it to the
//     caller to recompute. Stats are derived; rebuilding is cheaper and
//     more correct than trying to merge two aggregate rows.

import { getDb, withTransaction } from './client';

/**
 * The device-local placeholder user_id used before any sign-in happens.
 * Stays stable across releases so users who installed before auth shipped
 * still see their data after they sign in.
 */
export const LOCAL_GUEST_USER_ID = 'local-user-v1';

export interface MigrationResult {
  predictionsMoved: number;
}

/**
 * Migrate guest rows to `newUserId`. Returns the number of predictions
 * actually moved so the caller can decide whether to trigger a stats
 * recompute / store reload.
 *
 * Safe to call when there's no guest data — every statement updates or
 * deletes zero rows in that case.
 */
export async function migrateGuestDataToUser(
  newUserId: string,
): Promise<MigrationResult> {
  if (newUserId === LOCAL_GUEST_USER_ID) {
    throw new Error('Cannot migrate guest data to the guest user id itself.');
  }

  return await withTransaction(async () => {
    const db = getDb();

    // We need a count of what we moved. SQLite's `changes()` isn't exposed
    // through our adapter, so query first then update.
    const before = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM predictions WHERE user_id = ?`,
      [LOCAL_GUEST_USER_ID],
    );
    const predictionsMoved = before?.n ?? 0;

    await db.run(
      `UPDATE predictions SET user_id = ? WHERE user_id = ?`,
      [newUserId, LOCAL_GUEST_USER_ID],
    );

    // Drop stats for both ids so the caller's recompute rebuilds cleanly.
    // Without this, the destination user's existing user_stats row would
    // cause a PRIMARY KEY conflict if we tried to UPDATE instead.
    await db.run(
      `DELETE FROM user_stats WHERE user_id IN (?, ?)`,
      [LOCAL_GUEST_USER_ID, newUserId],
    );
    await db.run(
      `DELETE FROM category_stats WHERE user_id IN (?, ?)`,
      [LOCAL_GUEST_USER_ID, newUserId],
    );

    return { predictionsMoved };
  });
}
