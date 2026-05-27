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

export const getUserStat: GetUserStat = async (userId) => {
  return await getDb().get<UserStat>(
    `SELECT user_id, calibration_rating, total_predictions, total_resolved, current_streak
       FROM user_stats WHERE user_id = ?`,
    [userId],
  );
};

export const upsertUserStat: UpsertUserStat = async (s) => {
  await getDb().run(
    `INSERT INTO user_stats
       (user_id, calibration_rating, total_predictions, total_resolved, current_streak)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       calibration_rating = excluded.calibration_rating,
       total_predictions  = excluded.total_predictions,
       total_resolved     = excluded.total_resolved,
       current_streak     = excluded.current_streak`,
    [
      s.user_id,
      s.calibration_rating,
      s.total_predictions,
      s.total_resolved,
      s.current_streak,
    ],
  );
};

export const getCategoryStat: GetCategoryStat = async (userId, category) => {
  return await getDb().get<CategoryStat>(
    `SELECT user_id, category, predictions_made, predictions_resolved,
            calibration_score, badge_level
       FROM category_stats
       WHERE user_id = ? AND category = ?`,
    [userId, category],
  );
};

export const upsertCategoryStat: UpsertCategoryStat = async (s) => {
  await getDb().run(
    `INSERT INTO category_stats
       (user_id, category, predictions_made, predictions_resolved,
        calibration_score, badge_level)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, category) DO UPDATE SET
       predictions_made     = excluded.predictions_made,
       predictions_resolved = excluded.predictions_resolved,
       calibration_score    = excluded.calibration_score,
       badge_level          = excluded.badge_level`,
    [
      s.user_id,
      s.category,
      s.predictions_made,
      s.predictions_resolved,
      s.calibration_score,
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
  return await getDb().all<CategoryStat>(
    `SELECT user_id, category, predictions_made, predictions_resolved,
            calibration_score, badge_level
       FROM category_stats
       WHERE user_id = ?
       ORDER BY category`,
    [userId],
  );
};
