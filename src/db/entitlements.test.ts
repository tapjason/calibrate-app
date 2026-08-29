import { FREE_ENTITLEMENT, type Entitlement } from '@/types';

import { getDb, setDbForTests } from './client';
import { getEntitlement, upsertEntitlement } from './entitlements';
import { createTestDb } from './testing';

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('entitlements db', () => {
  it('defaults to FREE when no row exists (never Plus)', async () => {
    expect(await getEntitlement()).toEqual(FREE_ENTITLEMENT);
  });

  it('round-trips a Plus entitlement', async () => {
    const e: Entitlement = {
      is_plus: true,
      source: 'annual',
      expires_at: '2027-01-01T00:00:00.000Z',
    };
    await upsertEntitlement(e);
    expect(await getEntitlement()).toEqual(e);
  });

  it('upsert updates the single row in place (stays a singleton)', async () => {
    await upsertEntitlement({
      is_plus: true,
      source: 'trial',
      expires_at: '2026-09-15T00:00:00.000Z',
    });
    await upsertEntitlement({
      is_plus: true,
      source: 'lifetime',
      expires_at: null,
    });

    expect(await getEntitlement()).toEqual({
      is_plus: true,
      source: 'lifetime',
      expires_at: null,
    });
    const count = await getDb().get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM entitlements`,
    );
    expect(count?.n).toBe(1);
  });

  it('can drop back to free after being Plus', async () => {
    await upsertEntitlement({ is_plus: true, source: 'monthly', expires_at: null });
    await upsertEntitlement(FREE_ENTITLEMENT);
    const got = await getEntitlement();
    expect(got.is_plus).toBe(false);
    expect(got.source).toBe('none');
  });
});
