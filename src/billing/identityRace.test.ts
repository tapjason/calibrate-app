// Step 207: an answer from RevenueCat that comes back after an identity change
// was asked for belongs to the identity it started under (residual 11 in
// docs/design/research/under-13-2026-11.md; the owner's list, item 30). Before
// this, a read already under way when a sign-out came could return the old
// account's customer info after the sign-out had dropped the mirror to free,
// and whatever applied it (the paywall's refresh, `refreshBilling`, the
// identity sync's own refresh) wrote that account's Plus into the guest's
// store and SQLite mirror until the next foreground refresh.
//
// The fake SDK keeps an identity the way purchases-ios does, and every call
// answers for the identity it started under, however late it comes back.

import * as trackModule from '@/analytics/track';
import { setDbForTests } from '@/db/client';
import { getEntitlement } from '@/db/entitlements';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import * as trialReminder from '@/notifications/trialReminder';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { FREE_ENTITLEMENT } from '@/types';

import { __resetBillingInitForTests, ensureBillingStarted, initBilling, refreshBilling } from './init';
import {
  PRODUCT_IDS,
  __setBillingDepsForTests,
  configureBilling,
  fetchEntitlement,
  fetchPlans,
  logOutBilling,
  purchasePlan,
  restorePurchases,
  type BillingDeps,
  type RcCustomerInfo,
  type RcOfferings,
} from './revenuecat';

const KEY_VAR = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';
const ACCOUNT_A = '11111111-2222-3333-4444-555555555555';
const ACCOUNT_B = '66666666-7777-8888-9999-000000000000';
const UNDER_13 = { lowerBound: null, upperBound: 12 };
const ADULT = { lowerBound: 18, upperBound: null };
const INSTALL = '$RCAnonymousID:install';
const FRESH = '$RCAnonymousID:fresh';
const PACKAGE = `pkg_${PRODUCT_IDS.annual}`;

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
      { identifier: PACKAGE, product: { identifier: PRODUCT_IDS.annual, priceString: '$34.99' } },
    ],
  },
};

type Held = 'getCustomerInfo' | 'purchasePackage' | 'restorePurchases';

/**
 * An SDK with an identity. `owners` holds the app user ids that own Plus.
 * `hold(method)` makes that method's next call wait until the returned
 * release is called; it still answers for the identity it started under.
 * A purchase is credited, when it completes, to the identity it started under
 * unless `purchaseLandsOnCurrent` is set (the receipt posted after the log-out).
 */
function identitySdk(opts: { owners?: string[]; purchaseLandsOnCurrent?: boolean } = {}) {
  const owners = new Set(opts.owners ?? [ACCOUNT_A]);
  let current = INSTALL;
  const log: string[] = [];
  const gates: Partial<Record<Held, Promise<void>>> = {};
  const infoFor = (id: string) => (owners.has(id) ? PLUS_INFO : NO_PLUS_INFO);

  /** Wait at the method's gate, if one is set, and clear it for later calls. */
  const pass = async (method: Held) => {
    const gate = gates[method];
    delete gates[method];
    if (gate) await gate;
  };

  const deps: BillingDeps = {
    configure: jest.fn(async (_key: string, appUserId: string | null) => {
      log.push(`configure:${appUserId}`);
      current = appUserId ?? current;
    }),
    logIn: jest.fn(async (id: string) => {
      log.push(`logIn:${id}`);
      current = id;
    }),
    logOut: jest.fn(async () => {
      log.push('logOut');
      current = FRESH;
    }),
    isAnonymous: jest.fn(async () => current.startsWith('$RCAnonymousID:')),
    getOfferings: jest.fn(async () => OFFERINGS),
    getCustomerInfo: jest.fn(async () => {
      const asked = current;
      log.push(`getCustomerInfo:${asked}`);
      await pass('getCustomerInfo');
      return infoFor(asked);
    }),
    purchasePackage: jest.fn(async () => {
      const asked = current;
      log.push(`purchasePackage:${asked}`);
      await pass('purchasePackage');
      owners.add(opts.purchaseLandsOnCurrent ? current : asked);
      return infoFor(asked);
    }),
    restorePurchases: jest.fn(async () => {
      const asked = current;
      log.push(`restorePurchases:${asked}`);
      await pass('restorePurchases');
      return infoFor(asked);
    }),
    isCancelledError: () => false,
  };

  return {
    deps,
    log,
    current: () => current,
    hold(method: Held): () => void {
      let release: () => void = () => {};
      gates[method] = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

/** Let fire-and-forget work settle. */
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r));
};

const signInAs = (userId: string) =>
  useAuthStore.setState({ userId, email: 'a@b.co', status: 'authenticated' });
const signOut = () =>
  useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });

async function expectFreeEverywhere() {
  expect(useEntitlementStore.getState().isPlus).toBe(false);
  expect(useEntitlementStore.getState().entitlement).toEqual(FREE_ENTITLEMENT);
  await expect(getEntitlement()).resolves.toEqual(FREE_ENTITLEMENT);
}

async function expectPlusEverywhere() {
  expect(useEntitlementStore.getState().isPlus).toBe(true);
  expect(useEntitlementStore.getState().entitlement).toMatchObject({ is_plus: true, source: 'annual' });
  await expect(getEntitlement()).resolves.toMatchObject({ is_plus: true, source: 'annual' });
}

/** Signed in as account A, billing started and A's Plus in the store and the mirror. */
async function startSignedInAsA(sdk: ReturnType<typeof identitySdk>) {
  __setBillingDepsForTests(sdk.deps);
  signInAs(ACCOUNT_A);
  await initBilling();
  await settle();
  expect(sdk.current()).toBe(ACCOUNT_A);
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  process.env[KEY_VAR] = 'test_key';
  __resetBillingInitForTests();
  __resetAgeStoreForTests();
  usePaywallStore.getState().reset();
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: false });
  signOut();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  __resetBillingInitForTests();
  __resetAgeStoreForTests();
  __setBillingDepsForTests(null);
  delete process.env[KEY_VAR];
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('a customer-info read under way when the identity changes', () => {
  it("a foreground refresh started as account A that comes back after the sign-out leaves the guest free, in the store and the mirror", async () => {
    const sdk = identitySdk();
    await startSignedInAsA(sdk);
    await expectPlusEverywhere();

    const release = sdk.hold('getCustomerInfo');
    const refreshing = refreshBilling();
    await settle();
    expect(sdk.log.at(-1)).toBe(`getCustomerInfo:${ACCOUNT_A}`);

    signOut();
    await settle();
    expect(sdk.log).toContain('logOut');
    await expectFreeEverywhere();

    // A's answer arrives now, after the sign-out.
    release();
    await refreshing;
    await settle();

    await expectFreeEverywhere();
  });

  it("the identity sync's own refresh (the auth listener's) for account A, answered after a sign-out, is dropped too", async () => {
    const sdk = identitySdk();
    __setBillingDepsForTests(sdk.deps);
    await initBilling();
    await settle();
    await expectFreeEverywhere();

    // The sign-in's refresh starts reading as A, and is held.
    const release = sdk.hold('getCustomerInfo');
    signInAs(ACCOUNT_A);
    await settle();
    expect(sdk.log.at(-1)).toBe(`getCustomerInfo:${ACCOUNT_A}`);

    signOut();
    await settle();
    release();
    await settle();

    await expectFreeEverywhere();
  });

  it('a read started and answered under one identity is still applied', async () => {
    const sdk = identitySdk();
    await startSignedInAsA(sdk);
    await useEntitlementStore.getState().setEntitlement(FREE_ENTITLEMENT);
    await expectFreeEverywhere();

    const release = sdk.hold('getCustomerInfo');
    const refreshing = refreshBilling();
    await settle();
    release();
    await refreshing;

    await expectPlusEverywhere();
  });

  it('with the under-13 rule coming on while the read is out, a sign-out RevenueCat never hears of still drops it', async () => {
    const sdk = identitySdk();
    await startSignedInAsA(sdk);

    const release = sdk.hold('getCustomerInfo');
    const refreshing = refreshBilling();
    await settle();

    // The rule: no key, so the sign-out reaches no SDK and RevenueCat still
    // holds A; only the mirror drops.
    await useAgeStore.getState().accept(UNDER_13);
    signOut();
    await settle();
    expect(sdk.log).not.toContain('logOut');
    await expectFreeEverywhere();
    const callsBefore = sdk.log.length;

    release();
    await refreshing;
    await settle();

    await expectFreeEverywhere();
    // Nothing was asked again: billing is off now, and RevenueCat still holds A.
    expect(sdk.log.slice(callsBefore)).toEqual([]);
    expect(sdk.current()).toBe(ACCOUNT_A);

    // The rule lifts later in the same run: RevenueCat is told of the sign-out
    // it missed before anything reads, so A's Plus never reaches the guest.
    await useAgeStore.getState().accept(ADULT);
    await settle();
    await refreshBilling();
    await settle();

    const after = sdk.log.slice(callsBefore);
    expect(after[0]).toBe('logOut');
    expect(after).toContain(`getCustomerInfo:${FRESH}`);
    expect(after).not.toContain(`getCustomerInfo:${ACCOUNT_A}`);
    expect(sdk.current()).toBe(FRESH);
    await expectFreeEverywhere();
  });
});

// Review round 1, item 2: a sign-out while the under-13 rule kept billing off
// left RevenueCat holding the account (`logOutBilling` returned early with no
// key). If the rule lifted later in the same run, billing had already started,
// so nothing configured it again, and the next refresh read that account's
// Plus into the guest's store and mirror; a purchase would have landed on it.
describe('a log-out RevenueCat is owed while the rule keeps billing off', () => {
  /** Signed in as A with billing started, then the rule comes on and the person signs out. */
  async function signedOutUnderTheRule(sdk: ReturnType<typeof identitySdk>) {
    await startSignedInAsA(sdk);
    await useAgeStore.getState().accept(UNDER_13);
    signOut();
    await settle();
    expect(sdk.log).not.toContain('logOut');
    expect(sdk.current()).toBe(ACCOUNT_A);
    await expectFreeEverywhere();
  }

  it('while the rule stays on, nothing reaches RevenueCat, and the guest stays free', async () => {
    const sdk = identitySdk();
    await signedOutUnderTheRule(sdk);
    const callsBefore = sdk.log.length;
    const anonymityChecks = (sdk.deps.isAnonymous as jest.Mock).mock.calls.length;

    await refreshBilling();
    await usePaywallStore.getState().refreshEntitlement();
    await usePaywallStore.getState().loadPlans();
    await expect(usePaywallStore.getState().purchase(PACKAGE)).resolves.toBe(false);
    await expect(usePaywallStore.getState().restore()).resolves.toBe(false);
    await expect(ensureBillingStarted(0)).resolves.toBe(false);
    await expect(fetchEntitlement()).resolves.toBeNull();
    await settle();

    expect(sdk.log.slice(callsBefore)).toEqual([]);
    expect(sdk.deps.isAnonymous).toHaveBeenCalledTimes(anonymityChecks);
    expect(sdk.current()).toBe(ACCOUNT_A);
    await expectFreeEverywhere();
  });

  it('a purchase once the rule lifts is made as the fresh anonymous id, never onto A', async () => {
    const sdk = identitySdk({ owners: [ACCOUNT_A] });
    await signedOutUnderTheRule(sdk);

    await useAgeStore.getState().accept(ADULT);
    await settle();
    await expect(usePaywallStore.getState().purchase(PACKAGE)).resolves.toBe(true);

    const logOutAt = sdk.log.lastIndexOf('logOut');
    expect(logOutAt).toBeGreaterThan(-1);
    expect(sdk.log.indexOf(`purchasePackage:${FRESH}`)).toBeGreaterThan(logOutAt);
    expect(sdk.log.filter((e) => e === `purchasePackage:${ACCOUNT_A}`)).toEqual([]);
  });

  // The guard in revenuecat.ts itself, with nothing in init.ts to start it
  // (no initBilling here): every read, purchase and restore waits for the
  // owed log-out first.
  it.each([
    ['an entitlement read', () => fetchEntitlement(), 'getCustomerInfo'],
    ['a purchase', () => purchasePlan(PACKAGE), 'purchasePackage'],
    ['a restore', () => restorePurchases(), 'restorePurchases'],
  ] as const)('%s once billing is usable again runs as the fresh anonymous id', async (_name, run, method) => {
    const sdk = identitySdk({ owners: [] });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling(ACCOUNT_A);
    expect(sdk.current()).toBe(ACCOUNT_A);

    await useAgeStore.getState().accept(UNDER_13);
    await logOutBilling();
    expect(sdk.log).not.toContain('logOut');

    await useAgeStore.getState().accept(ADULT);
    await run();

    const logOutAt = sdk.log.indexOf('logOut');
    expect(logOutAt).toBeGreaterThan(-1);
    expect(sdk.log.indexOf(`${method}:${FRESH}`)).toBeGreaterThan(logOutAt);
    expect(sdk.log).not.toContain(`${method}:${ACCOUNT_A}`);
  });

  it('a sign-in once billing is usable again logs the old account out first, then in as the new one', async () => {
    const sdk = identitySdk();
    __setBillingDepsForTests(sdk.deps);
    await configureBilling(ACCOUNT_A);
    await useAgeStore.getState().accept(UNDER_13);
    await logOutBilling();

    await useAgeStore.getState().accept(ADULT);
    await expect(configureBilling(ACCOUNT_B)).resolves.toBe(true);

    expect(sdk.log.slice(-2)).toEqual(['logOut', `logIn:${ACCOUNT_B}`]);
    expect(sdk.current()).toBe(ACCOUNT_B);
  });

  it('a log-out RevenueCat was told of in the end is not run a second time', async () => {
    const sdk = identitySdk();
    __setBillingDepsForTests(sdk.deps);
    await configureBilling(ACCOUNT_A);
    await useAgeStore.getState().accept(UNDER_13);
    await logOutBilling();

    await useAgeStore.getState().accept(ADULT);
    await fetchEntitlement();
    await fetchEntitlement();
    await restorePurchases();

    expect(sdk.log.filter((e) => e === 'logOut')).toEqual(['logOut']);
  });
});

// Review round 2, items 3 and 4: the owed log-out itself can fail (no
// connection, the SDK refusing), and the SDK then still reports account A.
describe('an owed log-out that fails', () => {
  /** A configured, a sign-out owed under the rule, then the rule lifted; no initBilling. */
  async function owedThenLifted(sdk: ReturnType<typeof identitySdk>) {
    __setBillingDepsForTests(sdk.deps);
    await configureBilling(ACCOUNT_A);
    await useAgeStore.getState().accept(UNDER_13);
    await logOutBilling();
    expect(sdk.log).not.toContain('logOut');
    await useAgeStore.getState().accept(ADULT);
  }

  /** getOfferings, logged with the identity it was asked under. */
  function logOfferings(sdk: ReturnType<typeof identitySdk>) {
    (sdk.deps.getOfferings as jest.Mock).mockImplementation(async () => {
      sdk.log.push(`getOfferings:${sdk.current()}`);
      return OFFERINGS;
    });
  }

  const asked = (sdk: ReturnType<typeof identitySdk>, method: string) =>
    sdk.log.filter((e) => e.startsWith(`${method}:`));

  it('while it keeps failing, nothing is read or bought as A: reads return nothing, the mirror stays free, a purchase is unavailable and there are no plans', async () => {
    // A owns Plus: a read as A would show it.
    const sdk = identitySdk({ owners: [ACCOUNT_A] });
    await owedThenLifted(sdk);
    logOfferings(sdk);
    (sdk.deps.logOut as jest.Mock).mockRejectedValue(new Error('offline'));

    await expect(fetchEntitlement()).resolves.toBeNull();
    await usePaywallStore.getState().refreshEntitlement();
    await expect(purchasePlan(PACKAGE)).resolves.toEqual({ status: 'unavailable' });
    await expect(usePaywallStore.getState().purchase(PACKAGE)).resolves.toBe(false);
    expect(usePaywallStore.getState().notice).toBe('unavailable');
    await expect(fetchPlans()).resolves.toEqual([]);
    await usePaywallStore.getState().loadPlans();
    expect(usePaywallStore.getState().plans).toEqual([]);
    await settle();

    expect(sdk.current()).toBe(ACCOUNT_A);
    expect(asked(sdk, 'getCustomerInfo')).toEqual([]);
    expect(asked(sdk, 'purchasePackage')).toEqual([]);
    expect(asked(sdk, 'getOfferings')).toEqual([]);
    await expectFreeEverywhere();
  });

  it('is owed again: each later call tries once more, and the first that works recovers, so plans load as the fresh anonymous id and the mirror stays free', async () => {
    const sdk = identitySdk({ owners: [ACCOUNT_A] });
    await owedThenLifted(sdk);
    logOfferings(sdk);
    const logOut = sdk.deps.logOut as jest.Mock;
    logOut
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'));

    // One try per call, never a loop.
    await expect(fetchPlans()).resolves.toEqual([]);
    expect(logOut).toHaveBeenCalledTimes(1);
    await expect(fetchEntitlement()).resolves.toBeNull();
    expect(logOut).toHaveBeenCalledTimes(2);
    await expect(purchasePlan(PACKAGE)).resolves.toEqual({ status: 'unavailable' });
    expect(logOut).toHaveBeenCalledTimes(3);
    await settle();
    expect(logOut).toHaveBeenCalledTimes(3);

    // The connection is back: the paywall's plans load, as the fresh id.
    await usePaywallStore.getState().loadPlans();
    expect(logOut).toHaveBeenCalledTimes(4);
    expect(sdk.current()).toBe(FRESH);
    expect(usePaywallStore.getState().plans.map((p) => p.packageId)).toEqual([PACKAGE]);
    expect(asked(sdk, 'getOfferings')).toEqual([`getOfferings:${FRESH}`]);

    await usePaywallStore.getState().refreshEntitlement();
    expect(asked(sdk, 'getCustomerInfo')).toEqual([`getCustomerInfo:${FRESH}`]);
    await expectFreeEverywhere();
    // Told at last: not again.
    await fetchEntitlement();
    expect(logOut).toHaveBeenCalledTimes(4);
  });

  it('a restore after a failed try tries once more too', async () => {
    const sdk = identitySdk({ owners: [ACCOUNT_A] });
    await owedThenLifted(sdk);
    (sdk.deps.logOut as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await expect(fetchEntitlement()).resolves.toBeNull();
    await expect(restorePurchases()).resolves.toEqual({ status: 'nothing_to_restore' });

    expect(asked(sdk, 'restorePurchases')).toEqual([`restorePurchases:${FRESH}`]);
  });

  it('a sign-in queued behind a try that fails is not logged out afterwards', async () => {
    const sdk = identitySdk({ owners: [ACCOUNT_B] });
    await owedThenLifted(sdk);
    const logOut = sdk.deps.logOut as jest.Mock;
    logOut.mockRejectedValueOnce(new Error('offline'));

    // The sign-in tells RevenueCat of the owed log-out first; that try fails,
    // and the log-in after it works.
    await expect(configureBilling(ACCOUNT_B)).resolves.toBe(true);
    expect(sdk.current()).toBe(ACCOUNT_B);

    await expect(fetchEntitlement()).resolves.toMatchObject({ is_plus: true });
    expect(logOut).toHaveBeenCalledTimes(1);
    expect(sdk.current()).toBe(ACCOUNT_B);
    expect(asked(sdk, 'getCustomerInfo')).toEqual([`getCustomerInfo:${ACCOUNT_B}`]);
  });
});

// Review round 2, item 5: the check before the store sheet looked only at the
// identity count, so an under-13 band that arrived while the offering loaded
// still opened the sheet.
describe('the rule coming on while a purchase loads the offering', () => {
  it('returns unavailable without opening the store sheet', async () => {
    const sdk = identitySdk({ owners: [] });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling(null);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (sdk.deps.getOfferings as jest.Mock).mockImplementation(async () => {
      await gate;
      return OFFERINGS;
    });

    const buying = usePaywallStore.getState().purchase(PACKAGE);
    await settle();
    expect(sdk.deps.getOfferings).toHaveBeenCalledTimes(1);

    await useAgeStore.getState().accept(UNDER_13);
    release();

    await expect(buying).resolves.toBe(false);
    expect(usePaywallStore.getState().notice).toBe('unavailable');
    expect(sdk.deps.purchasePackage).not.toHaveBeenCalled();
    await expectFreeEverywhere();
  });

  it('returns unavailable from purchasePlan itself', async () => {
    const sdk = identitySdk({ owners: [] });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling(ACCOUNT_A);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (sdk.deps.getOfferings as jest.Mock).mockImplementation(async () => {
      await gate;
      return OFFERINGS;
    });

    const buying = purchasePlan(PACKAGE);
    await settle();
    await useAgeStore.getState().accept(UNDER_13);
    release();

    await expect(buying).resolves.toEqual({ status: 'unavailable' });
    expect(sdk.deps.purchasePackage).not.toHaveBeenCalled();
  });
});

describe('the store asks again right before it writes', () => {
  it("an answer that was current when it came back, but reaches the store after the sign-out, is dropped there", async () => {
    const sdk = identitySdk();
    await startSignedInAsA(sdk);

    // A's answer, current when it came back...
    const answer = await fetchEntitlement();
    expect(answer).toMatchObject({ is_plus: true });
    // ...and a sign-out before anything applied it.
    signOut();
    await settle();
    await expectFreeEverywhere();

    if (answer) await useEntitlementStore.getState().setEntitlement(answer);

    await expectFreeEverywhere();
  });
});

describe('a purchase or restore that completes after the identity changes', () => {
  it("a purchase that went to account A is not written to the guest, and the paywall says where it went", async () => {
    const sdk = identitySdk({ owners: [] });
    await startSignedInAsA(sdk);
    await expectFreeEverywhere();
    const tracked = jest.spyOn(trackModule, 'track').mockResolvedValue(undefined);
    const reminder = jest.spyOn(trialReminder, 'refreshTrialReminder').mockResolvedValue(undefined);

    const release = sdk.hold('purchasePackage');
    const buying = usePaywallStore.getState().purchase(PACKAGE);
    await settle();
    expect(sdk.log.at(-1)).toBe(`purchasePackage:${ACCOUNT_A}`);

    signOut();
    await settle();
    release();

    await expect(buying).resolves.toBe(false);
    await settle();
    await expectFreeEverywhere();
    // Apple charged: neither "Nothing was charged" (failed) nor silence
    // (cancelled), but where the purchase went.
    expect(usePaywallStore.getState().notice).toBe('purchased_elsewhere');
    expect(usePaywallStore.getState().purchasing).toBeNull();
    // Not a backed-out purchase, and no event of its own (the catalogue is closed).
    const names = tracked.mock.calls.map(([name]) => name);
    expect(names).not.toContain('purchase_abandoned');
    expect(names).not.toContain('purchase_completed');
    // Nothing on this identity to schedule a trial reminder from.
    expect(reminder).not.toHaveBeenCalled();
  });

  it('purchasePlan reports it as purchased elsewhere, with no entitlement to hand on', async () => {
    const sdk = identitySdk({ owners: [] });
    await startSignedInAsA(sdk);

    const release = sdk.hold('purchasePackage');
    const buying = purchasePlan(PACKAGE);
    await settle();
    signOut();
    await settle();
    release();

    await expect(buying).resolves.toEqual({ status: 'purchased_elsewhere' });
    // Asked again as the identity the app means now, which owns nothing.
    expect(sdk.log.at(-1)).toBe(`getCustomerInfo:${FRESH}`);
  });

  it('with the under-13 rule on by the time it finishes, it is purchased elsewhere too, and nothing more is asked', async () => {
    const sdk = identitySdk({ owners: [] });
    await startSignedInAsA(sdk);

    const release = sdk.hold('purchasePackage');
    const buying = usePaywallStore.getState().purchase(PACKAGE);
    await settle();
    await useAgeStore.getState().accept(UNDER_13);
    signOut();
    await settle();
    const callsBefore = sdk.log.length;
    release();

    await expect(buying).resolves.toBe(false);
    await settle();
    expect(usePaywallStore.getState().notice).toBe('purchased_elsewhere');
    expect(sdk.log.slice(callsBefore)).toEqual([]);
    await expectFreeEverywhere();
  });

  it('a purchase whose receipt reached the identity the app now means is reported, and written, for that identity', async () => {
    const sdk = identitySdk({ owners: [], purchaseLandsOnCurrent: true });
    await startSignedInAsA(sdk);

    const release = sdk.hold('purchasePackage');
    const buying = usePaywallStore.getState().purchase(PACKAGE);
    await settle();
    signOut();
    await settle();
    release();

    await expect(buying).resolves.toBe(true);
    await settle();
    await expectPlusEverywhere();
    // Asked again as the fresh anonymous id, not taken from A's answer.
    expect(sdk.log.at(-1)).toBe(`getCustomerInfo:${FRESH}`);
  });

  it("a restore answered for account A after the sign-out is not written to the guest", async () => {
    const sdk = identitySdk();
    await startSignedInAsA(sdk);

    const release = sdk.hold('restorePurchases');
    const restoring = usePaywallStore.getState().restore();
    await settle();
    expect(sdk.log.at(-1)).toBe(`restorePurchases:${ACCOUNT_A}`);

    signOut();
    await settle();
    release();

    await expect(restoring).resolves.toBe(false);
    await settle();
    await expectFreeEverywhere();
    expect(usePaywallStore.getState().notice).toBe('nothing_to_restore');
  });

  it('a purchase started and finished as one identity is written as before', async () => {
    const sdk = identitySdk({ owners: [] });
    await startSignedInAsA(sdk);

    const release = sdk.hold('purchasePackage');
    const buying = usePaywallStore.getState().purchase(PACKAGE);
    await settle();
    release();

    await expect(buying).resolves.toBe(true);
    await expectPlusEverywhere();
    expect(usePaywallStore.getState().notice).toBe('purchased');
  });
});
