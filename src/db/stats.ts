// User + category stats CRUD. Same contract-typed pattern as predictions.ts.

import type {
  UserStat,
  CategoryStat,
  GetUserStat,
  UpsertUserStat,
  GetCategoryStat,
  UpsertCategoryStat,
  DeleteCategoryStat,
  ListCategoryStats,
} from '@/types';

import { getDb } from './client';

// SQLite has no boolean type; the provisional flags are stored as INTEGER 0/1
// and converted at this boundary (same pattern as integrity_bonus in
// predictions.ts). The DB row types below mirror the tables, with the flags as
// numbers; the mappers hand plain UserStat/CategoryStat objects to the rest of
// the app.

interface UserStatRow {
  user_id: string;
  calibration_rating: number;
  total_predictions: number;
  total_resolved: number;
  current_streak: number;
  rating_is_provisional: number; // 0 | 1
}

interface CategoryStatRow {
  user_id: string;
  category: CategoryStat['category'];
  predictions_made: number;
  predictions_resolved: number;
  calibration_score: number;
  score_is_provisional: number; // 0 | 1
  badge_level: CategoryStat['badge_level'];
}

const toUserStat = (r: UserStatRow): UserStat => ({
  user_id: r.user_id,
  calibration_rating: r.calibration_rating,
  total_predictions: r.total_predictions,
  total_resolved: r.total_resolved,
  current_streak: r.current_streak,
  rating_is_provisional: r.rating_is_provisional === 1,
});

const toCategoryStat = (r: CategoryStatRow): CategoryStat => ({
  user_id: r.user_id,
  category: r.category,
  predictions_made: r.predictions_made,
  predictions_resolved: r.predictions_resolved,
  calibration_score: r.calibration_score,
  score_is_provisional: r.score_is_provisional === 1,
  badge_level: r.badge_level,
});

export const getUserStat: GetUserStat = async (userId) => {
  const row = await getDb().get<UserStatRow>(
    `SELECT user_id, calibration_rating, total_predictions, total_resolved,
            current_streak, rating_is_provisional
       FROM user_stats WHERE user_id = ?`,
    [userId],
  );
  return row ? toUserStat(row) : null;
};

export const upsertUserStat: UpsertUserStat = async (s) => {
  await getDb().run(
    `INSERT INTO user_stats
       (user_id, calibration_rating, total_predictions, total_resolved,
        current_streak, rating_is_provisional)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       calibration_rating    = excluded.calibration_rating,
       total_predictions     = excluded.total_predictions,
       total_resolved        = excluded.total_resolved,
       current_streak        = excluded.current_streak,
       rating_is_provisional = excluded.rating_is_provisional`,
    [
      s.user_id,
      s.calibration_rating,
      s.total_predictions,
      s.total_resolved,
      s.current_streak,
      s.rating_is_provisional ? 1 : 0,
    ],
  );
};

export const getCategoryStat: GetCategoryStat = async (userId, category) => {
  const row = await getDb().get<CategoryStatRow>(
    `SELECT user_id, category, predictions_made, predictions_resolved,
            calibration_score, score_is_provisional, badge_level
       FROM category_stats
       WHERE user_id = ? AND category = ?`,
    [userId, category],
  );
  return row ? toCategoryStat(row) : null;
};

export const upsertCategoryStat: UpsertCategoryStat = async (s) => {
  await getDb().run(
    `INSERT INTO category_stats
       (user_id, category, predictions_made, predictions_resolved,
        calibration_score, score_is_provisional, badge_level)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, category) DO UPDATE SET
       predictions_made     = excluded.predictions_made,
       predictions_resolved = excluded.predictions_resolved,
       calibration_score    = excluded.calibration_score,
       score_is_provisional = excluded.score_is_provisional,
       badge_level          = excluded.badge_level`,
    [
      s.user_id,
      s.category,
      s.predictions_made,
      s.predictions_resolved,
      s.calibration_score,
      s.score_is_provisional ? 1 : 0,
      s.badge_level,
    ],
  );
};

export const deleteCategoryStat: DeleteCategoryStat = async (userId, category) => {
  await getDb().run(
    `DELETE FROM category_stats WHERE user_id = ? AND category = ?`,
    [userId, category],
  );
};

export const listCategoryStats: ListCategoryStats = async (userId) => {
  const rows = await getDb().all<CategoryStatRow>(
    `SELECT user_id, category, predictions_made, predictions_resolved,
            calibration_score, score_is_provisional, badge_level
       FROM category_stats
       WHERE user_id = ?
       ORDER BY category`,
    [userId],
  );
  return rows.map(toCategoryStat);
};
