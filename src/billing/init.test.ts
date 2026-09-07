import { setDbForTests } from '@/db/client';
import { upsertEntitlement } from '@/db/entitlements';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { FREE_ENTITLEMENT } from '@/types';

import { __resetBillingInitForTests, initBilling, refreshBilling } from './init';
import {
  PRODUCT_IDS,
  __setBillingDepsForTests,
  type BillingDeps,
  type RcCustomerInfo,
} from './revenuecat';

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

function fakeDeps(overrides: Partial<BillingDeps> = {}): BillingDeps {
  return {
    configure: jest.fn(async () => {}),
    logIn: jest.fn(async () => {}),
    logOut: jest.fn(async () => {}),
    getOfferings: jest.fn(async () => ({ current: null })),
    getCustomerInfo: jest.fn(async () => PLUS_INFO),
    purchasePackage: jest.fn(async () => PLUS_INFO),
    restorePurchases: jest.fn(async () => PLUS_INFO),
    isCancelledError: () => false,
    ...overrides,
  };
}

const KEY_VAR = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';
const REAL_USER = '11111111-2222-3333-4444-555555555555';

/** Let the fire-and-forget identity sync settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  setDbForTests(await createTestDb());
  process.env[KEY_VAR] = 'test_key';
  __resetBillingInitForTests();
  usePaywallStore.getState().reset();
  useEntitlementStore.setState({
    entitlement: FREE_ENTITLEMENT,
    isPlus: false,
    hydrated: false,
  });
  useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });
});

afterEach(() => {
  __resetBillingInitForTests();
  setDbForTests(null);
  delete process.env[KEY_VAR];
  __setBillingDepsForTests(null);
  jest.restoreAllMocks();
});

describe('initBilling', () => {
  it('hydrates the local mirror even with no billing SDK', async () => {
    delete process.env[KEY_VAR];
    await upsertEntitlement({
      is_plus: true,
      source: 'lifetime',
      expires_at: null,
    });

    await initBilling();

    expect(useEntitlementStore.getState().isPlus).toBe(true);
    expect(useEntitlementStore.getState().hydrated).toBe(true);
  });

  // The guest id is one constant shared by every install. RevenueCat treats
  // the app user id as the account, so passing it would make one guest's
  // purchase read as active on every other guest device.
  it('configures a signed-out user as anonymous, never as the guest id', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);

    await initBilling();
    await flush();

    expect(deps.configure).toHaveBeenCalledWith('test_key', null);
    expect(deps.configure).not.toHaveBeenCalledWith('test_key', LOCAL_GUEST_USER_ID);
  });

  it('configures a signed-in user with their Supabase id', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    useAuthStore.setState({
      userId: REAL_USER,
      email: 'a@b.co',
      status: 'authenticated',
    });

    await initBilling();
    await flush();

    expect(deps.configure).toHaveBeenCalledWith('test_key', REAL_USER);
    expect(useEntitlementStore.getState().isPlus).toBe(true);
  });

  // Billing is not on the path to logging or resolving a prediction. Awaiting
  // the SDK here would hold the app's startup gate — and the first paint —
  // behind a network call.
  it('does not wait on the SDK before resolving', async () => {
    let release: () => void = () => {};
    const hang = new Promise<void>((resolve) => {
      release = resolve;
    });
    __setBillingDepsForTests(
      fakeDeps({
        configure: jest.fn(async () => {
          await hang;
        }),
      }),
    );

    await initBilling(); // must resolve while configure() is still pending

    expect(useEntitlementStore.getState().hydrated).toBe(true);
    release();
  });

  it('runs only once', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);

    await initBilling();
    await initBilling();
    await flush();

    expect(deps.configure).toHaveBeenCalledTimes(1);
  });
});

describe('identity transitions', () => {
  it('moves a guest purchase onto the account on sign-in', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    await initBilling();
    await flush();

    useAuthStore.setState({
      userId: REAL_USER,
      email: 'a@b.co',
      status: 'authenticated',
    });
    await flush();

    expect(deps.logIn).toHaveBeenCalledWith(REAL_USER);
    expect(useEntitlementStore.getState().isPlus).toBe(true);
  });

  // Without this, the next person to use the device inherits the previous
  // account's Plus — the SDK is still logged in as them.
  it('logs out and drops to free on sign-out', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    useAuthStore.setState({
      userId: REAL_USER,
      email: 'a@b.co',
      status: 'authenticated',
    });
    await initBilling();
    await flush();
    expect(useEntitlementStore.getState().isPlus).toBe(true);

    useAuthStore.setState({
      userId: LOCAL_GUEST_USER_ID,
      email: null,
      status: 'guest',
    });
    await flush();

    expect(deps.logOut).toHaveBeenCalled();
    expect(useEntitlementStore.getState().isPlus).toBe(false);
    expect(useEntitlementStore.getState().entitlement).toEqual(FREE_ENTITLEMENT);
  });

  it('ignores a token refresh that keeps the same user', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    useAuthStore.setState({
      userId: REAL_USER,
      email: 'a@b.co',
      status: 'authenticated',
    });
    await initBilling();
    await flush();

    useAuthStore.setState({ userId: REAL_USER, email: 'a@b.co', status: 'authenticated' });
    await flush();

    expect(deps.logIn).not.toHaveBeenCalled();
    expect(deps.logOut).not.toHaveBeenCalled();
  });
});

describe('refreshBilling', () => {
  it('is a no-op before init', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);

    await refreshBilling();

    expect(deps.getCustomerInfo).not.toHaveBeenCalled();
  });

  it('picks up a change made outside the app', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    await initBilling();
    await flush();
    useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false });

    await refreshBilling();

    expect(useEntitlementStore.getState().isPlus).toBe(true);
  });
});
