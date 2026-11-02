// Which categories a set of predictions uses (roadmap D39). Layer rule: L3,
// imports only from @/types.

import { CATEGORIES, isBuiltInCategory, type Category, type Prediction } from '@/types';

/**
 * Every category the predictions use, built-ins first in the app's order and
 * the person's own after them by id, so the order is the same on every call.
 * The engine and stats walked the five built-ins; added ones need walking too.
 */
export function categoriesIn(predictions: readonly Prediction[]): Category[] {
  const used = new Set(predictions.map((p) => p.category));
  const added = [...used].filter((c) => !isBuiltInCategory(c)).sort();
  return [...CATEGORIES.filter((c) => used.has(c)), ...added];
}
