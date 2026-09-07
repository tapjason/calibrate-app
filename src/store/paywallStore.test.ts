import {
  PRODUCT_IDS,
  __setBillingDepsForTests,
  type BillingDeps,
  type RcCustomerInfo,
  type RcOfferings,
} from '@/billing/revenuecat';
import { setDbForTests } from '@/db/client';
import { getEntitlement } from '@/db/entitlements';
import { createTestDb } from '@/db/testing';
import { FREE_ENTITLEMENT } from '@/types';

import { useEntitlementStore } from './entitlementStore';
import { usePaywallStore } from './paywallStore';

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

const NO_PLUS_INFO: RcCustomerInfo = { entitlements: { active: {} } };

const OFFERINGS: RcOfferings = {
  current: {
    availablePackages: [
      {
        identifier: 'pkg_annual',
        product: { identifier: PRODUCT_IDS.annual, priceString: '$29.99' },
      },
      {
        identifier: 'pkg_monthly',
        product: { identifier: PRODUCT_IDS.monthly, priceString: '$4.99' },
      },
    ],
  },
};

function fakeDeps(overrides: Partial<BillingDeps> = {}): BillingDeps {
  return {
    configure: jest.fn(async () => {}),
    logIn: jest.fn(async () => {}),
    logOut: jest.fn(async () => {}),
    getOfferings: jest.fn(async () => OFFERINGS),
    getCustomerInfo: jest.fn(async () => PLUS_INFO),
    purchasePackage: jest.fn(async () => PLUS_INFO),
    restorePurchases: jest.fn(async () => PLUS_INFO),
    isCancelledError: (e) =>
      Boolean(e && typeof e === 'object' && (e as { userCancelled?: boolean }).userCancelled),
    ...overrides,
  };
}

const KEY_VAR = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';

beforeEach(async () => {
  setDbForTests(await createTestDb());
  process.env[KEY_VAR] = 'test_key';
  __setBillingDepsForTests(fakeDeps());
  usePaywallStore.getState().reset();
  useEntitlementStore.setState({
    entitlement: FREE_ENTITLEMENT,
    isPlus: false,
    hydrated: true,
  });
});

afterEach(() => {
  setDbForTests(null);
  delete process.env[KEY_VAR];
  __setBillingDepsForTests(null);
  jest.restoreAllMocks();
});

describe('loadPlans', () => {
  it('loads the offering, annual first', async () => {
    await usePaywallStore.getState().loadPlans();
    const s = usePaywallStore.getState();
    expect(s.plans.map((p) => p.plan)).toEqual(['annual', 'monthly']);
    expect(s.loadingPlans).toBe(false);
    expect(s.notice).toBeNull();
    expect(s.available).toBe(true);
  });

  it('reports unavailable — not an error — when billing is not configured', async () => {
    delete process.env[KEY_VAR];
    await usePaywallStore.getState().loadPlans();
    const s = usePaywallStore.getState();
    expect(s.available).toBe(false);
    expect(s.plans).toEqual([]);
    expect(s.loadingPlans).toBe(false);
  });

  it('ends with no plans when the offering comes back empty', async () => {
    __setBillingDepsForTests(
      fakeDeps({ getOfferings: jest.fn(async () => ({ current: null })) }),
    );
    await usePaywallStore.getState().loadPlans();
    expect(usePaywallStore.getState().plans).toEqual([]);
    expect(usePaywallStore.getState().loadingPlans).toBe(false);
  });

  // `notice` reports what happened when the user did something. An empty
  // offering is a state the screen renders on its own; setting a notice too
  // put the same sentence on screen twice.
  it('sets no notice for an empty or unavailable offering', async () => {
    __setBillingDepsForTests(
      fakeDeps({ getOfferings: jest.fn(async () => ({ current: null })) }),
    );
    await usePaywallStore.getState().loadPlans();
    expect(usePaywallStore.getState().notice).toBeNull();

    delete process.env[KEY_VAR];
    await usePaywallStore.getState().loadPlans();
    expect(usePaywallStore.getState().notice).toBeNull();
  });
});

describe('purchase', () => {
  it('grants Plus and mirrors it to SQLite', async () => {
    await expect(usePaywallStore.getState().purchase('pkg_annual')).resolves.toBe(true);

    expect(useEntitlementStore.getState().isPlus).toBe(true);
    expect(useEntitlementStore.getState().entitlement.source).toBe('annual');
    // The mirror is what gates Plus on the next cold start, offline.
    await expect(getEntitlement()).resolves.toMatchObject({ is_plus: true });

    const s = usePaywallStore.getState();
    expect(s.purchasing).toBeNull();
    expect(s.notice).toBe('purchased');
  });

  // Backing out of the store sheet is a normal thing to do. It must not leave
  // an error on screen.
  it('leaves no notice when the user cancels', async () => {
    __setBillingDepsForTests(
      fakeDeps({
        purchasePackage: jest.fn(async () => {
          throw { userCancelled: true };
        }),
      }),
    );
    await expect(usePaywallStore.getState().purchase('pkg_annual')).resolves.toBe(false);
    const s = usePaywallStore.getState();
    expect(s.notice).toBeNull();
    expect(s.purchasing).toBeNull();
    expect(useEntitlementStore.getState().isPlus).toBe(false);
  });

  it('surfaces a failure and stays free', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setBillingDepsForTests(
      fakeDeps({
        purchasePackage: jest.fn(async () => {
          throw new Error('declined');
        }),
      }),
    );
    await expect(usePaywallStore.getState().purchase('pkg_annual')).resolves.toBe(false);
    expect(usePaywallStore.getState().notice).toBe('failed');
    expect(useEntitlementStore.getState().isPlus).toBe(false);
  });
});

describe('restore', () => {
  it('restores a prior purchase', async () => {
    await expect(usePaywallStore.getState().restore()).resolves.toBe(true);
    expect(useEntitlementStore.getState().isPlus).toBe(true);
    expect(usePaywallStore.getState().notice).toBe('restored');
  });

  it('says so when the account owns nothing', async () => {
    __setBillingDepsForTests(
      fakeDeps({ restorePurchases: jest.fn(async () => NO_PLUS_INFO) }),
    );
    await expect(usePaywallStore.getState().restore()).resolves.toBe(false);
    expect(usePaywallStore.getState().notice).toBe('nothing_to_restore');
    expect(useEntitlementStore.getState().isPlus).toBe(false);
  });
});

describe('refreshEntitlement', () => {
  it('picks up a subscription bought on another device', async () => {
    await usePaywallStore.getState().refreshEntitlement();
    expect(useEntitlementStore.getState().isPlus).toBe(true);
  });

  it('downgrades when RevenueCat says the subscription is gone', async () => {
    useEntitlementStore.setState({
      entitlement: { is_plus: true, source: 'annual', expires_at: null },
      isPlus: true,
    });
    __setBillingDepsForTests(
      fakeDeps({ getCustomerInfo: jest.fn(async () => NO_PLUS_INFO) }),
    );
    await usePaywallStore.getState().refreshEntitlement();
    expect(useEntitlementStore.getState().isPlus).toBe(false);
  });

  // A failed refresh is not evidence of anything. Stripping Plus from a paying
  // subscriber because their plane had no wifi is the failure mode this guards.
  it('leaves a paying user alone when the call fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    useEntitlementStore.setState({
      entitlement: { is_plus: true, source: 'annual', expires_at: null },
      isPlus: true,
    });
    __setBillingDepsForTests(
      fakeDeps({
        getCustomerInfo: jest.fn(async () => {
          throw new Error('offline');
        }),
      }),
    );
    await usePaywallStore.getState().refreshEntitlement();
    expect(useEntitlementStore.getState().isPlus).toBe(true);
  });

  it('leaves the mirror alone on a build with no billing SDK', async () => {
    delete process.env[KEY_VAR];
    useEntitlementStore.setState({
      entitlement: { is_plus: true, source: 'lifetime', expires_at: null },
      isPlus: true,
    });
    await usePaywallStore.getState().refreshEntitlement();
    expect(useEntitlementStore.getState().isPlus).toBe(true);
    expect(usePaywallStore.getState().available).toBe(false);
  });
});
