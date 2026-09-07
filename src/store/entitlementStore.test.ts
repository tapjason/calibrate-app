import { setDbForTests } from '@/db/client';
import { upsertEntitlement } from '@/db/entitlements';
import { createTestDb } from '@/db/testing';
import { FREE_ENTITLEMENT, type Entitlement } from '@/types';

import { isEntitlementActive, useEntitlementStore } from './entitlementStore';

const PLUS: Entitlement = {
  is_plus: true,
  source: 'annual',
  expires_at: '2027-01-01T00:00:00.000Z',
};

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useEntitlementStore.setState({
    entitlement: FREE_ENTITLEMENT,
    isPlus: false,
    hydrated: false,
  });
});

afterEach(() => {
  setDbForTests(null);
});

describe('entitlementStore', () => {
  it('starts free and un-hydrated', () => {
    const s = useEntitlementStore.getState();
    expect(s.isPlus).toBe(false);
    expect(s.entitlement).toEqual(FREE_ENTITLEMENT);
    expect(s.hydrated).toBe(false);
  });

  it('hydrates to free when the mirror is empty', async () => {
    await useEntitlementStore.getState().hydrate();
    const s = useEntitlementStore.getState();
    expect(s.isPlus).toBe(false);
    expect(s.hydrated).toBe(true);
  });

  it('hydrates isPlus=true from a persisted Plus mirror', async () => {
    await upsertEntitlement(PLUS);
    await useEntitlementStore.getState().hydrate();
    const s = useEntitlementStore.getState();
    expect(s.isPlus).toBe(true);
    expect(s.entitlement).toEqual(PLUS);
  });

  it('setEntitlement flips isPlus and persists to the mirror', async () => {
    await useEntitlementStore.getState().setEntitlement(PLUS);
    expect(useEntitlementStore.getState().isPlus).toBe(true);

    // Re-hydrate from disk to prove it was written, not just held in memory.
    useEntitlementStore.setState({
      entitlement: FREE_ENTITLEMENT,
      isPlus: false,
      hydrated: false,
    });
    await useEntitlementStore.getState().hydrate();
    expect(useEntitlementStore.getState().isPlus).toBe(true);
  });

  it('can revoke Plus back to free', async () => {
    await useEntitlementStore.getState().setEntitlement(PLUS);
    await useEntitlementStore.getState().setEntitlement(FREE_ENTITLEMENT);
    expect(useEntitlementStore.getState().isPlus).toBe(false);
  });

  // The mirror is only corrected when RevenueCat can be reached. Without an
  // expiry check, an annual plan that lapsed while the device was offline
  // would grant Plus forever.
  it('does not grant Plus from a lapsed mirror', async () => {
    await upsertEntitlement({
      is_plus: true,
      source: 'annual',
      expires_at: '2020-01-01T00:00:00.000Z',
    });
    await useEntitlementStore.getState().hydrate();
    expect(useEntitlementStore.getState().isPlus).toBe(false);
  });

  it('does not let a service hand in an already-expired entitlement', async () => {
    await useEntitlementStore.getState().setEntitlement({
      is_plus: true,
      source: 'monthly',
      expires_at: '2020-01-01T00:00:00.000Z',
    });
    expect(useEntitlementStore.getState().isPlus).toBe(false);
  });

  it('fails to free (never Plus) when the read throws', async () => {
    // Drop the db so getEntitlement throws inside hydrate.
    setDbForTests(null);
    await useEntitlementStore.getState().hydrate();
    const s = useEntitlementStore.getState();
    expect(s.isPlus).toBe(false);
    expect(s.entitlement).toEqual(FREE_ENTITLEMENT);
    expect(s.hydrated).toBe(true);
  });
});

describe('isEntitlementActive', () => {
  const now = new Date('2026-09-07T00:00:00.000Z');

  it('is false for a free entitlement', () => {
    expect(isEntitlementActive(FREE_ENTITLEMENT, now)).toBe(false);
  });

  it('is true for a non-expiring (lifetime) entitlement', () => {
    expect(
      isEntitlementActive({ is_plus: true, source: 'lifetime', expires_at: null }, now),
    ).toBe(true);
  });

  it('is true up to the expiry and false after it', () => {
    const future = { is_plus: true, source: 'annual', expires_at: '2026-09-08T00:00:00.000Z' } as const;
    const past = { is_plus: true, source: 'annual', expires_at: '2026-09-06T00:00:00.000Z' } as const;
    expect(isEntitlementActive(future, now)).toBe(true);
    expect(isEntitlementActive(past, now)).toBe(false);
  });

  // Ambiguity resolves to free, everywhere.
  it('treats an unparseable expiry as expired', () => {
    expect(
      isEntitlementActive({ is_plus: true, source: 'annual', expires_at: 'soon' }, now),
    ).toBe(false);
  });
});
