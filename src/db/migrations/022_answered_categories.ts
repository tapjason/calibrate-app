// Where an answer was given, for a prediction this phone remembers a
// category for (review round 7, 2026-11-19; reproduced by the screens
// builder). The moved-answers count (D65, round 6) followed the path an
// answer took between categories, not where it ended up: logged in work,
// moved on the eve (a late change), answered in personal, then moved within
// the day personal → health → personal counted nothing, while personal →
// work → health → personal counted one moved answer. The count is now worked
// out afresh at the answer and after every move from where the answer is,
// where it was answered and the category remembered for it
// (`answerCountedAsMoved`, src/engine/corrections.ts), and where it was
// answered has to outlast a move back to the remembered category, which
// takes its row in prediction_refiles (017) away.
//
//   answered_category — the category it was answered in, as this phone saw
//                       it: written beside the answer, or at its first move
//                       on this phone when the answer came from another one.
//                       Null until then, and on every row from before this
//                       migration (read from the moved-answers row or the
//                       category before the move instead).
//
// No CHECK constraint, as for 018 and 021: an answer or a move must never
// fail on what this records. No words: a category id. Device-local and never
// synced, like the rest of the row: kept by sign-out with it, cleared by
// Erase and account deletion, removed when the prediction is deleted.

export const MIGRATION_022 = /* sql */ `
  ALTER TABLE prediction_category_origins ADD COLUMN answered_category TEXT;
`;
