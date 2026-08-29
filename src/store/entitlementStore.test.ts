import { setDbForTests } from '@/db/client';
import { upsertEntitlement } from '@/db/entitlements';
import { createTestDb } from '@/db/testing';
import { FREE_ENTITLEMENT, type Entitlement } from '@/types';

import { useEntitlementStore } from './entitlementStore';

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
