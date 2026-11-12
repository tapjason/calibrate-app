// The Warm-up's pick on the question it's on (blind playtests 2026-11-12b
// run 3 and 2026-11-12c run 8): the answers before it were kept, but a reload
// lost the option and number chosen on the current one. JSON, or null:
// { question_id, option: 0 | 1 | null, confidence: number | null }. A row may
// now hold a pick with no answers yet (question 1).

export const MIGRATION_014 = /* sql */ `
  ALTER TABLE warmup_progress ADD COLUMN pick_json TEXT;
`;
