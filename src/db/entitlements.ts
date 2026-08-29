// Local entitlement mirror. A single-row cache of the RevenueCat entitlement
// for offline Plus-gating (source of truth is RevenueCat server-side).
//
// The cardinal rule (CLAUDE.md): absence or any error defaults to FREE, never
// to Plus. getEntitlement encodes that in its type — it returns Entitlement,
// not Entitlement | null, resolving a missing row to FREE_ENTITLEMENT.

import {
  FREE_ENTITLEMENT,
  type Entitlement,
  type EntitlementSource,
  type GetEntitlement,
  type UpsertEntitlement,
} from '@/types';

import { getDb } from './client';

// The singleton row's fixed id (matches the CHECK (id = 'me') constraint).
const ROW_ID = 'me';

// is_plus is INTEGER 0/1 on disk; convert at this boundary.
interface EntitlementRow {
  is_plus: number;
  source: EntitlementSource;
  expires_at: string | null;
}

export const getEntitlement: GetEntitlement = async () => {
  const row = await getDb().get<EntitlementRow>(
    `SELECT is_plus, source, expires_at FROM entitlements WHERE id = ?`,
    [ROW_ID],
  );
  if (!row) return FREE_ENTITLEMENT;
  return {
    is_plus: row.is_plus === 1,
    source: row.source,
    expires_at: row.expires_at,
  };
};

export const upsertEntitlement: UpsertEntitlement = async (e: Entitlement) => {
  await getDb().run(
    `INSERT INTO entitlements (id, is_plus, source, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       is_plus    = excluded.is_plus,
       source     = excluded.source,
       expires_at = excluded.expires_at`,
    [ROW_ID, e.is_plus ? 1 : 0, e.source, e.expires_at],
  );
};
