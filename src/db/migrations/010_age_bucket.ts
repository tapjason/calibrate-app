// The declared age band (NEXT_STEPS item i).
//
// One row for this device. The only columns are the two bounds Apple's
// Declared Age Range API returns — not who declared it, not parental
// controls, not an install id. No user_id: it is the person holding the
// phone, and it is never synced. A missing row means we have no band.
// The checks refuse an empty row or a reversed range, so a bug cannot
// persist "we asked" or a nonsense pair.

export const MIGRATION_010 = /* sql */ `
  CREATE TABLE IF NOT EXISTS age_bucket (
    id          TEXT PRIMARY KEY DEFAULT 'me' CHECK (id = 'me'),
    lower_bound INTEGER,
    upper_bound INTEGER,
    CHECK (lower_bound IS NULL OR lower_bound >= 0),
    CHECK (upper_bound IS NULL OR upper_bound >= 0),
    CHECK (lower_bound IS NOT NULL OR upper_bound IS NOT NULL),
    CHECK (lower_bound IS NULL OR upper_bound IS NULL OR lower_bound < upper_bound)
  );
`;
