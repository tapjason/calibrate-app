// Which questions a finished Warm-up's answers belong to, in order (step 173).
// The answers were stored by position alone, so reordering the ten (an
// everyday kind first) would pair a finished Warm-up's answers with the wrong
// questions (record audit 2026-11-12). JSON string[], or null for a result
// saved before this: those read in the order they were asked then.

export const MIGRATION_016 = /* sql */ `
  ALTER TABLE warmup_results ADD COLUMN question_ids_json TEXT;
`;
