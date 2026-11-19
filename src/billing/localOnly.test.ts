// The under-13 rule in billing (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md). RevenueCat is never configured
// on a local-only phone (tried with an SDK seam whose every property access
// throws); on a launch that asks Apple, it waits for the answer, with no cap
// at launch and at most 5 s for the paywall; where the question isn't asked
// it starts exactly when it did before; and it starts once on a lift. A local
// entitlement mirror is left as it is.

import { setDbForTests } from '@/db/client';
import { upsertEntitlement } from '@/db/entitlements';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { FREE_ENTITLEMENT } from '@/types';

import { __resetBillingInitForTests, ensureBillingStarted, initBilling, refreshBilling } from './init';
import {
  __setBillingDepsForTests,
  configureBilling,
  fetchEntitlement,
  fetchPlans,
  fetchTrialStatus,
  isBillingAvailable,
  logOutBilling,
  PRODUCT_IDS,
  purchasePlan,
  restorePurchases,
  type BillingDeps,
  type RcCustomerInfo,
} from './revenuecat';

const KEY_VAR = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';
const REAL_USER = '11111111-2222-3333-4444-555555555555';
const UNDER_13 = { lowerBound: null, upperBound: 12 };
const ADULT = { lowerBound: 18, upperBound: null };
const LIFETIME = { is_plus: true, source: 'lifetime', expires_at: null } as const;

const PLUS_INFO: RcCustomerInfo = {
  entitlements: {
    active: {
      plus: {
        identifier: 'plus',
        isActive: true,
        productIdentifier: PRODUCT_IDS.annual,
        expirationDate: '2099-01-01T00:00:00.000Z',
        periodType: 'NORMAL',
      },
    },
  },
};

function fakeDeps(): BillingDeps & { configure: jest.Mock; logOut: jest.Mock } {
  return {
    configure: jest.fn(async () => {}),
    logIn: jest.fn(async () => {}),
    logOut: jest.fn(async () => {}),
    getOfferings: jest.fn(async () => ({ current: null })),
    getCustomerInfo: jest.fn(async () => PLUS_INFO),
    purchasePackage: jest.fn(async () => PLUS_INFO),
    restorePurchases: jest.fn(async () => PLUS_INFO),
    isCancelledError: () => false,
  };
}

/** An SDK seam whose every property access throws, and the properties tried. */
function throwingDeps(): { deps: BillingDeps; touched: string[] } {
  const touched: string[] = [];
  const deps = new Proxy({} as BillingDeps, {
    get(_target, prop) {
      touched.push(String(prop));
      throw new Error(`RevenueCat was reached: ${String(prop)}`);
    },
  });
  return { deps, touched };
}

/** Let fire-and-forget work settle. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

beforeEach(async () => {
  setDbForTests(await createTestDb());
  process.env[KEY_VAR] = 'test_key';
  __resetBillingInitForTests();
  __resetAgeStoreForTests();
  usePaywallStore.getState().reset();
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: false });
  useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  __resetBillingInitForTests();
  __resetAgeStoreForTests();
  __setBillingDepsForTests(null);
  delete process.env[KEY_VAR];
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('RevenueCat under the rule (D70)', () => {
  it('every operation reads as unavailable, touching nothing in the SDK', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    const { deps, touched } = throwingDeps();
    __setBillingDepsForTests(deps);

    expect(isBillingAvailable()).toBe(false);
    await expect(configureBilling(null)).resolves.toBe(false);
    await expect(configureBilling(REAL_USER)).resolves.toBe(false);
    await expect(logOutBilling()).resolves.toBeUndefined();
    await expect(fetchEntitlement()).resolves.toBeNull();
    await expect(fetchTrialStatus()).resolves.toBeUndefined();
    await expect(fetchPlans()).resolves.toEqual([]);
    await expect(purchasePlan('$rc_annual')).resolves.toEqual({ status: 'unavailable' });
    await expect(restorePurchases()).resolves.toEqual({ status: 'unavailable' });

    expect(touched).toEqual([]);
  });

  it('without the rule, the same seam is reached', async () => {
    const { deps, touched } = throwingDeps();
    __setBillingDepsForTests(deps);

    await configureBilling(null);

    expect(touched).toContain('configure');
  });
});

describe('initBilling and the age answer', () => {
  it('where the question is not asked, configures at once, as before', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);

    await initBilling();

    // Called in the same turn as the mirror's read, not after a wait.
    expect(deps.configure).toHaveBeenCalledTimes(1);
    expect(deps.configure).toHaveBeenCalledWith('test_key', null);
  });

  it('never configures on a local-only phone, even once settled', async () => {
    const { deps, touched } = throwingDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(UNDER_13, { willAsk: true });

    await initBilling();
    useAgeStore.getState().markSettled();
    await settle();
    await refreshBilling();

    expect(touched).toEqual([]);
  });

  it('on a launch that asks, configures only after the answer, with no cap', async () => {
    jest.useFakeTimers();
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(null, { willAsk: true });

    await initBilling();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(deps.configure).not.toHaveBeenCalled();

    await useAgeStore.getState().accept(ADULT);
    useAgeStore.getState().markSettled();
    expect(deps.configure).toHaveBeenCalledTimes(1);
  });

  it('an under-13 answer on a launch that asks means it is never configured', async () => {
    const { deps, touched } = throwingDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(null, { willAsk: true });

    await initBilling();
    await useAgeStore.getState().accept(UNDER_13);
    useAgeStore.getState().markSettled();
    await settle();

    expect(touched).toEqual([]);
  });

  it('configures once when the rule lifts in a long run', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(UNDER_13, { willAsk: true });
    await initBilling();
    useAgeStore.getState().markSettled();
    expect(deps.configure).not.toHaveBeenCalled();

    await useAgeStore.getState().accept(ADULT);
    await settle();
    expect(deps.configure).toHaveBeenCalledTimes(1);

    // Later changes of band don't configure it again.
    useAgeStore.getState().forgetBand();
    await useAgeStore.getState().accept({ lowerBound: 16, upperBound: 17 });
    await settle();
    expect(deps.configure).toHaveBeenCalledTimes(1);
  });

  it('leaves a Plus mirror already on the phone as it is', async () => {
    await upsertEntitlement(LIFETIME);
    const { deps } = throwingDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(UNDER_13, { willAsk: false });

    await initBilling();
    await refreshBilling();
    await usePaywallStore.getState().refreshEntitlement();

    expect(useEntitlementStore.getState().isPlus).toBe(true);
  });

  it("an account frozen by the rule that signs out leaves no Plus behind, and RevenueCat isn't reached", async () => {
    await upsertEntitlement(LIFETIME);
    const { deps, touched } = throwingDeps();
    __setBillingDepsForTests(deps);
    useAuthStore.setState({ userId: REAL_USER, email: 'a@b.co', status: 'authenticated' });
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    await initBilling();
    expect(useEntitlementStore.getState().isPlus).toBe(true);

    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });
    await settle();

    expect(useEntitlementStore.getState().entitlement).toEqual(FREE_ENTITLEMENT);
    expect(touched).toEqual([]);
  });
});

describe('ensureBillingStarted (the paywall)', () => {
  it('waits at most 5 s for the answer, then goes on as today', async () => {
    jest.useFakeTimers();
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(null, { willAsk: true });
    await initBilling();

    const starting = ensureBillingStarted();
    await jest.advanceTimersByTimeAsync(4_999);
    expect(deps.configure).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    await expect(starting).resolves.toBe(true);
    expect(deps.configure).toHaveBeenCalledTimes(1);
  });

  it('goes on as soon as the answer comes', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(null, { willAsk: true });
    await initBilling();

    const starting = ensureBillingStarted();
    useAgeStore.getState().markSettled();

    await expect(starting).resolves.toBe(true);
    expect(deps.configure).toHaveBeenCalledTimes(1);
  });

  it('never configures on a local-only phone', async () => {
    const { deps, touched } = throwingDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    await initBilling();

    await expect(ensureBillingStarted()).resolves.toBe(false);
    expect(touched).toEqual([]);
  });

  it('an under-13 answer within the 5 s means no configure', async () => {
    const { deps, touched } = throwingDeps();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(null, { willAsk: true });
    await initBilling();

    const starting = ensureBillingStarted();
    await useAgeStore.getState().accept(UNDER_13);
    useAgeStore.getState().markSettled();

    await expect(starting).resolves.toBe(false);
    expect(touched).toEqual([]);
  });

  it('is false on a build with no SDK or key, and never throws', async () => {
    delete process.env[KEY_VAR];
    await expect(ensureBillingStarted()).resolves.toBe(false);
  });
});
