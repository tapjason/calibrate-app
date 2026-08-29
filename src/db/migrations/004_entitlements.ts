// Local entitlement mirror for offline Plus-gating. RevenueCat is the
// server-side source of truth; this single row caches the last-known state so
// the app can gate features without a network round-trip.
//
// Singleton table: the CHECK (id = 'me') constraint plus a fixed primary key
// means there is at most one row — the current device's entitlement. Absence
// of the row is meaningful and safe: src/db/entitlements.ts maps "no row" to
// FREE_ENTITLEMENT, so the app fails to free, never to Plus.
//
// is_plus is INTEGER 0/1 (SQLite has no boolean); src/db/entitlements.ts
// converts at the boundary. source/expires_at mirror the Entitlement type.

export const MIGRATION_004 = /* sql */ `
  CREATE TABLE IF NOT EXISTS entitlements (
    id         TEXT PRIMARY KEY DEFAULT 'me' CHECK (id = 'me'),
    is_plus    INTEGER NOT NULL DEFAULT 0 CHECK (is_plus IN (0,1)),
    source     TEXT NOT NULL DEFAULT 'none'
                 CHECK (source IN ('none','trial','monthly','annual','lifetime')),
    expires_at TEXT
  );
`;
