import { FREE_ENTITLEMENT } from '@/types';

import {
  PRODUCT_ALIASES as WEBHOOK_PRODUCT_ALIASES,
  PRODUCT_IDS as WEBHOOK_PRODUCT_IDS,
} from '../../supabase/functions/revenuecat-webhook/entitlementFromEvent';
import {
  PRODUCT_ALIASES,
  PRODUCT_IDS,
  __setBillingDepsForTests,
  configureBilling,
  entitlementFromCustomerInfo,
  fetchEntitlement,
  fetchPlans,
  fetchTrialStatus,
  isBillingAvailable,
  isStaleEntitlement,
  logOutBilling,
  planForProduct,
  plansFromOfferings,
  purchasePlan,
  restorePurchases,
  trialStatusFromCustomerInfo,
  type BillingDeps,
  type RcCustomerInfo,
  type RcOfferings,
  type RcPackage,
} from './revenuecat';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function customerInfo(
  entitlement: Partial<{
    isActive: boolean;
    productIdentifier: string;
    expirationDate: string | null;
    periodType: string;
    willRenew: boolean;
  }> | null,
): RcCustomerInfo {
  if (!entitlement) return { entitlements: { active: {} } };
  return {
    entitlements: {
      active: {
        plus: {
          identifier: 'plus',
          isActive: entitlement.isActive ?? true,
          productIdentifier: entitlement.productIdentifier ?? PRODUCT_IDS.annual,
          expirationDate:
            entitlement.expirationDate === undefined
              ? '2027-01-01T00:00:00.000Z'
              : entitlement.expirationDate,
          periodType: entitlement.periodType ?? 'NORMAL',
          ...(entitlement.willRenew === undefined ? {} : { willRenew: entitlement.willRenew }),
        },
      },
    },
  };
}

function pkg(
  productId: string,
  priceString: string,
  introPrice?: RcPackage['product']['introPrice'],
): RcPackage {
  return {
    identifier: `pkg_${productId}`,
    product: { identifier: productId, priceString, introPrice },
  };
}

const OFFERINGS: RcOfferings = {
  current: {
    availablePackages: [
      pkg(PRODUCT_IDS.monthly, '$4.99'),
      pkg(PRODUCT_IDS.annual, '$29.99', {
        periodNumberOfUnits: 21,
        periodUnit: 'DAY',
        price: 0,
      }),
      pkg(PRODUCT_IDS.lifetime, '$59.99'),
    ],
  },
};

/** A fake SDK. Every method is overridable per test. */
function fakeDeps(overrides: Partial<BillingDeps> = {}): BillingDeps {
  return {
    configure: jest.fn(async () => {}),
    logIn: jest.fn(async () => {}),
    logOut: jest.fn(async () => {}),
    getOfferings: jest.fn(async () => OFFERINGS),
    getCustomerInfo: jest.fn(async () => customerInfo({})),
    purchasePackage: jest.fn(async () => customerInfo({})),
    restorePurchases: jest.fn(async () => customerInfo({})),
    isCancelledError: (e) =>
      Boolean(e && typeof e === 'object' && (e as { userCancelled?: boolean }).userCancelled),
    ...overrides,
  };
}

const KEY_VAR = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';

beforeEach(() => {
  process.env[KEY_VAR] = 'test_key';
  __setBillingDepsForTests(fakeDeps());
});

afterEach(() => {
  delete process.env[KEY_VAR];
  __setBillingDepsForTests(null);
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------

// The lifetime product's id changed (2026-11-26): `calibrate_plus_lifetime`
// was created in App Store Connect as a non-renewing subscription by mistake,
// and the non-consumable that replaced it is `calibrate_plus_lifetime_once`.
// Written out here rather than read from PRODUCT_IDS, so a wrong id fails.
describe('planForProduct', () => {
  it('reads the non-consumable lifetime id as lifetime', () => {
    expect(planForProduct('calibrate_plus_lifetime_once')).toBe('lifetime');
  });

  it('still reads the first lifetime id (sandbox purchases only) as lifetime', () => {
    expect(planForProduct('calibrate_plus_lifetime')).toBe('lifetime');
  });

  it('reads the subscriptions and their aliases', () => {
    expect(planForProduct('calibrate_plus_monthly')).toBe('monthly');
    expect(planForProduct('calibrate_plus_annual')).toBe('annual');
    expect(planForProduct('calibrate_plus_monthly_notrial')).toBe('monthly');
    expect(planForProduct('calibrate_plus_annual_2999')).toBe('annual');
  });

  it('knows nothing else', () => {
    expect(planForProduct('calibrate_plus_lifetime_twice')).toBeNull();
    expect(planForProduct('')).toBeNull();
    expect(planForProduct(null)).toBeNull();
    expect(planForProduct(undefined)).toBeNull();
  });

  // The webhook decides the server's Plus from its own copy of these lists.
  it("matches the webhook's lists exactly", () => {
    expect(WEBHOOK_PRODUCT_IDS).toEqual(PRODUCT_IDS);
    expect(WEBHOOK_PRODUCT_ALIASES).toEqual(PRODUCT_ALIASES);
  });
});

// Roadmap D16: what the reminder before a trial renews reads.
describe('trialStatusFromCustomerInfo', () => {
  it('reads a running trial, its end and the plan it turns into', () => {
    expect(
      trialStatusFromCustomerInfo(
        customerInfo({ periodType: 'TRIAL', expirationDate: '2026-11-07T15:00:00.000Z' }),
      ),
    ).toEqual({ endsAt: '2026-11-07T15:00:00.000Z', willRenew: true, plan: 'annual' });
  });

  it('knows a cancelled trial will not renew', () => {
    expect(
      trialStatusFromCustomerInfo(customerInfo({ periodType: 'TRIAL', willRenew: false }))
        ?.willRenew,
    ).toBe(false);
  });

  it('is null outside a trial, or for anything missing', () => {
    expect(trialStatusFromCustomerInfo(customerInfo({}))).toBeNull();
    expect(trialStatusFromCustomerInfo(customerInfo({ periodType: 'INTRO' }))).toBeNull();
    expect(
      trialStatusFromCustomerInfo(customerInfo({ periodType: 'TRIAL', expirationDate: null })),
    ).toBeNull();
    expect(trialStatusFromCustomerInfo(customerInfo(null))).toBeNull();
    expect(trialStatusFromCustomerInfo(undefined)).toBeNull();
  });
});

describe('entitlementFromCustomerInfo', () => {
  it('maps an active annual entitlement', () => {
    expect(entitlementFromCustomerInfo(customerInfo({}))).toEqual({
      is_plus: true,
      source: 'annual',
      expires_at: '2027-01-01T00:00:00.000Z',
    });
  });

  it('maps each known product to its source', () => {
    for (const [source, productIdentifier] of Object.entries(PRODUCT_IDS)) {
      const e = entitlementFromCustomerInfo(customerInfo({ productIdentifier }));
      expect(e.source).toBe(source);
    }
  });

  it('maps a product alias to its plan (the Test Store products, 2026-11-03)', () => {
    for (const [source, ids] of Object.entries(PRODUCT_ALIASES)) {
      for (const productIdentifier of ids) {
        expect(entitlementFromCustomerInfo(customerInfo({ productIdentifier })).source).toBe(source);
      }
    }
  });

  it('shows the Test Store offering as all three plans, annual first', () => {
    const plans = plansFromOfferings({
      current: {
        availablePackages: [
          pkg('calibrate_plus_monthly_notrial', '$4.99'),
          pkg('calibrate_plus_annual_2999', '$29.99', { periodNumberOfUnits: 1, periodUnit: 'MONTH', price: 0 }),
          pkg(PRODUCT_IDS.lifetime, '$59.99'),
        ],
      },
    });
    expect(plans.map((p) => p.plan)).toEqual(['annual', 'monthly', 'lifetime']);
    expect(plans[0].trialPeriod).toEqual({ count: 1, unit: 'MONTH' });
  });

  it('reports a trial as source=trial whatever product backs it', () => {
    const e = entitlementFromCustomerInfo(
      customerInfo({ productIdentifier: PRODUCT_IDS.annual, periodType: 'TRIAL' }),
    );
    expect(e).toMatchObject({ is_plus: true, source: 'trial' });
  });

  it('maps the non-consumable lifetime purchase to a lifetime that never expires', () => {
    expect(
      entitlementFromCustomerInfo(
        customerInfo({ productIdentifier: 'calibrate_plus_lifetime_once', expirationDate: null }),
      ),
    ).toEqual({ is_plus: true, source: 'lifetime', expires_at: null });
  });

  it('honors an unknown product but infers the source conservatively', () => {
    const expiring = entitlementFromCustomerInfo(
      customerInfo({ productIdentifier: 'some_future_sku' }),
    );
    expect(expiring).toMatchObject({ is_plus: true, source: 'monthly' });

    const nonExpiring = entitlementFromCustomerInfo(
      customerInfo({ productIdentifier: 'some_future_sku', expirationDate: null }),
    );
    expect(nonExpiring).toMatchObject({ is_plus: true, source: 'lifetime' });
  });

  // The cardinal rule: nothing ambiguous grants Plus.
  it.each([
    ['no entitlement', customerInfo(null)],
    ['isActive false', customerInfo({ isActive: false })],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nonsense'],
    ['an empty object', {}],
    ['a malformed active map', { entitlements: { active: null } }],
  ])('resolves %s to free', (_label, input) => {
    expect(entitlementFromCustomerInfo(input)).toEqual(FREE_ENTITLEMENT);
  });
});

describe('plansFromOfferings', () => {
  // Before 2026-11-26 the app knew only `calibrate_plus_lifetime`, so the
  // offering's non-consumable package was dropped and Lifetime never showed.
  it('lists Lifetime from a package carrying the non-consumable id', () => {
    const plans = plansFromOfferings({
      current: {
        availablePackages: [
          pkg('calibrate_plus_annual', '$34.99'),
          pkg('calibrate_plus_monthly', '$4.99'),
          pkg('calibrate_plus_lifetime_once', '$79.99'),
        ],
      },
    });
    expect(plans.map((p) => p.plan)).toEqual(['annual', 'monthly', 'lifetime']);
    expect(plans[2]).toMatchObject({
      packageId: 'pkg_calibrate_plus_lifetime_once',
      plan: 'lifetime',
      priceString: '$79.99',
      trialPeriod: null,
    });
  });

  it('returns plans in display order, annual first', () => {
    expect(plansFromOfferings(OFFERINGS).map((p) => p.plan)).toEqual([
      'annual',
      'monthly',
      'lifetime',
    ]);
  });

  it('carries the store-formatted price through untouched', () => {
    const annual = plansFromOfferings(OFFERINGS).find((p) => p.plan === 'annual');
    expect(annual?.priceString).toBe('$29.99');
  });

  // Roadmap step 50: the paywall prints the store's figure, never our division.
  it("carries the store's per-month figure, and null when there is none", () => {
    const withFigure = pkg(PRODUCT_IDS.annual, '$29.99');
    withFigure.product.pricePerMonthString = '$2.50';
    const plans = plansFromOfferings({
      current: { availablePackages: [withFigure, pkg(PRODUCT_IDS.lifetime, '$59.99')] },
    });
    expect(plans.find((p) => p.plan === 'annual')?.pricePerMonthString).toBe('$2.50');
    expect(plans.find((p) => p.plan === 'lifetime')?.pricePerMonthString).toBeNull();
  });

  it('reads a free intro offer as a trial length in days', () => {
    const plans = plansFromOfferings(OFFERINGS);
    expect(plans.find((p) => p.plan === 'annual')?.trialDays).toBe(21);
    expect(plans.find((p) => p.plan === 'monthly')?.trialDays).toBeNull();
  });

  it('keeps the trial unit the store reported, alongside the day count', () => {
    // The shipped offer is one calendar MONTH free on annual. 30 days is the
    // arithmetic; "1 month" is what the user is actually granted, and the
    // paywall reads the latter.
    const plans = plansFromOfferings({
      current: {
        availablePackages: [
          pkg(PRODUCT_IDS.annual, '$29.99', {
            periodNumberOfUnits: 1,
            periodUnit: 'MONTH',
            price: 0,
          }),
        ],
      },
    });
    expect(plans[0].trialPeriod).toEqual({ count: 1, unit: 'MONTH' });
    expect(plans[0].trialDays).toBe(30);
  });

  it('has no trial period when the intro offer is not free', () => {
    const plans = plansFromOfferings({
      current: {
        availablePackages: [
          pkg(PRODUCT_IDS.annual, '$29.99', {
            periodNumberOfUnits: 1,
            periodUnit: 'MONTH',
            price: 9.99,
          }),
        ],
      },
    });
    expect(plans[0].trialPeriod).toBeNull();
    expect(plans[0].trialDays).toBeNull();
  });

  it('converts non-day trial periods', () => {
    const plans = plansFromOfferings({
      current: {
        availablePackages: [
          pkg(PRODUCT_IDS.annual, '$29.99', {
            periodNumberOfUnits: 1,
            periodUnit: 'MONTH',
            price: 0,
          }),
        ],
      },
    });
    expect(plans[0].trialDays).toBe(30);
  });

  it('does not call a discounted intro price a trial', () => {
    const plans = plansFromOfferings({
      current: {
        availablePackages: [
          pkg(PRODUCT_IDS.annual, '$29.99', {
            periodNumberOfUnits: 21,
            periodUnit: 'DAY',
            price: 9.99,
          }),
        ],
      },
    });
    expect(plans[0].trialDays).toBeNull();
  });

  it('drops products it cannot map to a plan', () => {
    const plans = plansFromOfferings({
      current: {
        availablePackages: [pkg('mystery_sku', '$1.99'), pkg(PRODUCT_IDS.annual, '$29.99')],
      },
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].plan).toBe('annual');
  });

  it.each([
    ['null', null],
    ['no current offering', { current: null }],
    ['a malformed payload', { current: { availablePackages: 'nope' } }],
  ])('returns [] for %s', (_label, input) => {
    expect(plansFromOfferings(input)).toEqual([]);
  });
});

// D62, policy audit: Apple allows one introductory offer per subscription
// group, so a lapsed subscriber must not be shown "1 month free".
describe('fetchPlans and trial eligibility', () => {
  const annualTrial = async () =>
    (await fetchPlans()).find((p) => p.plan === 'annual')?.trialDays ?? null;

  it('shows the trial only to a customer who can still take it', async () => {
    const ask = jest.fn(async (ids: string[]) => new Set(ids));
    __setBillingDepsForTests(fakeDeps({ introEligibleProducts: ask }));
    await configureBilling('u1');
    expect(await annualTrial()).toBe(21);
    expect(ask).toHaveBeenCalledWith([PRODUCT_IDS.annual]);
  });

  it('drops the trial when the customer has had one, or the check fails', async () => {
    __setBillingDepsForTests(fakeDeps({ introEligibleProducts: async () => new Set<string>() }));
    await configureBilling('u1');
    expect(await annualTrial()).toBeNull();
    __setBillingDepsForTests(
      fakeDeps({
        introEligibleProducts: async () => {
          throw new Error('no group info');
        },
      }),
    );
    await configureBilling('u1');
    expect(await annualTrial()).toBeNull();
  });
});

describe('availability', () => {
  it('is false without an API key, even with the SDK present', () => {
    delete process.env[KEY_VAR];
    expect(isBillingAvailable()).toBe(false);
  });

  it('is false without the SDK, even with a key', () => {
    __setBillingDepsForTests(null);
    // No react-native-purchases resolves in Jest, so the lazy require fails
    // and the module stays in its unavailable state rather than throwing.
    expect(isBillingAvailable()).toBe(false);
  });

  it('short-circuits every operation when unavailable', async () => {
    delete process.env[KEY_VAR];
    await expect(configureBilling('u1')).resolves.toBe(false);
    await expect(fetchEntitlement()).resolves.toBeNull();
    await expect(fetchPlans()).resolves.toEqual([]);
    await expect(purchasePlan('pkg_x')).resolves.toEqual({ status: 'unavailable' });
    await expect(restorePurchases()).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('configureBilling', () => {
  it('configures once with the Supabase user id, then logs in on change', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);

    await expect(configureBilling('user-1')).resolves.toBe(true);
    expect(deps.configure).toHaveBeenCalledWith('test_key', 'user-1');

    await expect(configureBilling('user-2')).resolves.toBe(true);
    expect(deps.configure).toHaveBeenCalledTimes(1);
    expect(deps.logIn).toHaveBeenCalledWith('user-2');
  });

  it('returns false rather than throwing when the SDK fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setBillingDepsForTests(
      fakeDeps({
        configure: jest.fn(async () => {
          throw new Error('sdk exploded');
        }),
      }),
    );
    await expect(configureBilling('u1')).resolves.toBe(false);
  });
});

// Review 2026-11-19, round 2, item 1. `Purchases.configure` with a null app
// user id keeps the id the SDK cached (purchases-ios IdentityManager: the
// configured id, else the cached one, else a new anonymous one). A sign-out
// RevenueCat never heard of (it hadn't started) left the old account cached,
// so a later signed-out start read that account's Plus into the guest's
// mirror, and the next person's purchases would have landed on it. This fake
// keeps an identity the way the SDK does.
describe('a signed-out start with an account still cached', () => {
  const ANON = '$RCAnonymousID:install';
  const FRESH = '$RCAnonymousID:fresh';
  const isAnon = (id: string) => id.startsWith('$RCAnonymousID:');

  /**
   * A fake SDK with an identity: `cached` is what an earlier run left, and
   * the old account owns Plus. `logOut` rejects for an anonymous user, as the
   * SDK does. `log` records each call in order.
   */
  function sdkWithIdentity(opts: {
    cached: string | null;
    logOutKeepsIdentity?: boolean;
    isAnonymousThrows?: boolean;
  }) {
    const log: string[] = [];
    let current = opts.cached ?? ANON;
    const infoFor = (id: string) => (id === 'old-account' ? customerInfo({}) : customerInfo(null));
    const deps = fakeDeps({
      configure: jest.fn(async (_key: string, appUserId: string | null) => {
        log.push('configure');
        current = appUserId ?? opts.cached ?? ANON;
      }),
      isAnonymous: jest.fn(async () => {
        log.push('isAnonymous');
        if (opts.isAnonymousThrows) throw new Error('not configured');
        return isAnon(current);
      }),
      logOut: jest.fn(async () => {
        log.push('logOut');
        if (isAnon(current)) throw new Error('LogOut was called but the current user is anonymous');
        if (!opts.logOutKeepsIdentity) current = FRESH;
      }),
      logIn: jest.fn(async (id: string) => {
        log.push(`logIn:${id}`);
        current = id;
      }),
      getCustomerInfo: jest.fn(async () => {
        log.push(`getCustomerInfo:${current}`);
        return infoFor(current);
      }),
      purchasePackage: jest.fn(async () => {
        log.push(`purchasePackage:${current}`);
        return infoFor(current);
      }),
      restorePurchases: jest.fn(async () => {
        log.push(`restorePurchases:${current}`);
        return infoFor(current);
      }),
      getOfferings: jest.fn(async () => {
        log.push('getOfferings');
        return OFFERINGS;
      }),
    });
    return { deps, log, current: () => current };
  }

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('logs the cached account out before the first entitlement read', async () => {
    const sdk = sdkWithIdentity({ cached: 'old-account' });
    __setBillingDepsForTests(sdk.deps);

    await expect(configureBilling(null)).resolves.toBe(true);
    await expect(fetchEntitlement()).resolves.toEqual(FREE_ENTITLEMENT);

    expect(sdk.log).toEqual([
      'configure',
      'isAnonymous',
      'logOut',
      'isAnonymous',
      `getCustomerInfo:${FRESH}`,
    ]);
  });

  it('a read started while the start is still logging out waits for it', async () => {
    const sdk = sdkWithIdentity({ cached: 'old-account' });
    __setBillingDepsForTests(sdk.deps);

    const [configured, entitlement, trial] = await Promise.all([
      configureBilling(null),
      fetchEntitlement(),
      fetchTrialStatus(),
    ]);

    expect(configured).toBe(true);
    expect(entitlement).toEqual(FREE_ENTITLEMENT);
    expect(trial).toBeNull();
    expect(sdk.log.filter((c) => c.startsWith('getCustomerInfo'))).toEqual([
      `getCustomerInfo:${FRESH}`,
      `getCustomerInfo:${FRESH}`,
    ]);
    expect(sdk.log.indexOf('logOut')).toBeLessThan(sdk.log.indexOf(`getCustomerInfo:${FRESH}`));
  });

  it('an anonymous user stays as it is: no log-out, and a guest purchase still reads', async () => {
    const sdk = sdkWithIdentity({ cached: null });
    __setBillingDepsForTests(sdk.deps);

    await expect(configureBilling(null)).resolves.toBe(true);
    await fetchEntitlement();

    expect(sdk.deps.logOut).not.toHaveBeenCalled();
    expect(sdk.log).toEqual(['configure', 'isAnonymous', `getCustomerInfo:${ANON}`]);
    expect(sdk.current()).toBe(ANON);
  });

  it('a signed-in start asks nothing about anonymity and logs nothing out', async () => {
    const sdk = sdkWithIdentity({ cached: 'old-account' });
    __setBillingDepsForTests(sdk.deps);

    await expect(configureBilling('user-2')).resolves.toBe(true);

    expect(sdk.deps.isAnonymous).not.toHaveBeenCalled();
    expect(sdk.deps.logOut).not.toHaveBeenCalled();
    expect(sdk.current()).toBe('user-2');
  });

  it.each([
    ['the SDK still holds the account after logging out', { logOutKeepsIdentity: true }],
    ['the SDK cannot say who it holds', { isAnonymousThrows: true }],
  ])(
    '%s: nothing is read, bought or restored on it until a sign-in',
    async (_name, failure) => {
      const sdk = sdkWithIdentity({ cached: 'old-account', ...failure });
      __setBillingDepsForTests(sdk.deps);

      await expect(configureBilling(null)).resolves.toBe(false);
      await expect(fetchEntitlement()).resolves.toBeNull();
      await expect(fetchTrialStatus()).resolves.toBeUndefined();
      await expect(fetchPlans()).resolves.toEqual([]);
      await expect(purchasePlan(`pkg_${PRODUCT_IDS.annual}`)).resolves.toEqual({ status: 'unavailable' });
      await expect(restorePurchases()).resolves.toEqual({ status: 'unavailable' });

      expect(sdk.deps.getCustomerInfo).not.toHaveBeenCalled();
      expect(sdk.deps.getOfferings).not.toHaveBeenCalled();
      expect(sdk.deps.purchasePackage).not.toHaveBeenCalled();
      expect(sdk.deps.restorePurchases).not.toHaveBeenCalled();

      // A sign-in moves RevenueCat onto the account the app means: reads go on.
      await expect(configureBilling('user-2')).resolves.toBe(true);
      await expect(fetchEntitlement()).resolves.toEqual(FREE_ENTITLEMENT);
      expect(sdk.log.at(-1)).toBe('getCustomerInfo:user-2');
    },
  );

  it('a sign-in that comes while the start is still logging out runs after it, and stays', async () => {
    const sdk = sdkWithIdentity({ cached: 'old-account' });
    __setBillingDepsForTests(sdk.deps);

    await Promise.all([configureBilling(null), configureBilling('user-2')]);

    expect(sdk.deps.configure).toHaveBeenCalledTimes(1);
    expect(sdk.log).toEqual(['configure', 'isAnonymous', 'logOut', 'isAnonymous', 'logIn:user-2']);
    expect(sdk.current()).toBe('user-2');
  });

  it('a sign-out that leaves the SDK identified holds reads too; one that works lets them go on', async () => {
    const stuck = sdkWithIdentity({ cached: null, logOutKeepsIdentity: true });
    __setBillingDepsForTests(stuck.deps);
    await configureBilling('old-account');
    await logOutBilling();
    await expect(fetchEntitlement()).resolves.toBeNull();
    expect(stuck.deps.getCustomerInfo).not.toHaveBeenCalled();

    const works = sdkWithIdentity({ cached: null });
    __setBillingDepsForTests(works.deps);
    await configureBilling('old-account');
    await logOutBilling();
    await expect(fetchEntitlement()).resolves.toEqual(FREE_ENTITLEMENT);
    expect(works.log.at(-1)).toBe(`getCustomerInfo:${FRESH}`);
  });

  it('a configure that fails reads as unknown, never as the cached account', async () => {
    const sdk = sdkWithIdentity({ cached: 'old-account' });
    (sdk.deps.configure as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('sdk exploded');
    });
    __setBillingDepsForTests(sdk.deps);

    await expect(configureBilling(null)).resolves.toBe(false);
    await expect(fetchEntitlement()).resolves.toBeNull();
    expect(sdk.deps.getCustomerInfo).not.toHaveBeenCalled();
  });
});

// Step 207 (residual 11 of the under-13 notes): an SDK call answers for the
// identity it started under, so one still out when an identity change is
// asked for comes back with the old identity's customer info.
describe('an answer that comes back after an identity change', () => {
  const FRESH = '$RCAnonymousID:fresh';

  /**
   * A fake SDK with an identity: `owners` own Plus (in a trial when `trial`).
   * `hold()` makes the next customer-info read wait for its release, still
   * answering for the identity it started under.
   */
  function heldSdk(opts: { owners: string[]; trial?: boolean }) {
    let current = '$RCAnonymousID:install';
    let gate: Promise<void> | null = null;
    const reads: string[] = [];
    const infoFor = (id: string) =>
      opts.owners.includes(id)
        ? customerInfo(opts.trial ? { periodType: 'TRIAL', expirationDate: '2026-12-01T00:00:00.000Z' } : {})
        : customerInfo(null);
    const deps = fakeDeps({
      configure: jest.fn(async (_key: string, id: string | null) => {
        current = id ?? current;
      }),
      logIn: jest.fn(async (id: string) => {
        current = id;
      }),
      logOut: jest.fn(async () => {
        current = FRESH;
      }),
      getCustomerInfo: jest.fn(async () => {
        const asked = current;
        reads.push(asked);
        const held = gate;
        gate = null;
        if (held) await held;
        return infoFor(asked);
      }),
      getOfferings: jest.fn(async () => {
        const held = gate;
        gate = null;
        if (held) await held;
        return OFFERINGS;
      }),
    });
    return {
      deps,
      reads,
      hold(): () => void {
        let release: () => void = () => {};
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return release;
      },
    };
  }

  /** Let the calls already made reach the SDK. */
  const tick = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
  };

  it("hands on the new identity's answer, asked again, never the old one's", async () => {
    const sdk = heldSdk({ owners: ['account-a'] });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling('account-a');

    const release = sdk.hold();
    const reading = fetchEntitlement();
    await tick();
    await logOutBilling();
    release();

    await expect(reading).resolves.toEqual(FREE_ENTITLEMENT);
    expect(sdk.reads).toEqual(['account-a', FRESH]);
  });

  it("the trial reminder never gets the signed-out account's trial", async () => {
    const sdk = heldSdk({ owners: ['account-a'], trial: true });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling('account-a');

    const release = sdk.hold();
    const reading = fetchTrialStatus();
    await tick();
    await logOutBilling();
    release();

    await expect(reading).resolves.toBeNull();
  });

  it('a read overtaken again and again gives up as "couldn\'t find out", not as anyone\'s answer', async () => {
    const sdk = heldSdk({ owners: ['account-a', 'account-b', 'account-c'] });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling('account-a');

    const releaseFirst = sdk.hold();
    const reading = fetchEntitlement();
    await tick();
    await configureBilling('account-b');
    // The read asked again as B is held too, and overtaken in its turn.
    const releaseSecond = sdk.hold();
    releaseFirst();
    await tick();
    await configureBilling('account-c');
    releaseSecond();

    await expect(reading).resolves.toBeNull();
    expect(sdk.reads).toEqual(['account-a', 'account-b']);
  });

  it('a purchase whose identity changes while the offering loads never opens the store sheet', async () => {
    const sdk = heldSdk({ owners: [] });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling('account-a');

    const release = sdk.hold();
    const buying = purchasePlan(`pkg_${PRODUCT_IDS.annual}`);
    await tick();
    await logOutBilling();
    release();

    await expect(buying).resolves.toEqual({ status: 'failed' });
    expect(sdk.deps.purchasePackage).not.toHaveBeenCalled();
  });

  it('isStaleEntitlement: an answer read before a change is stale, a fresh one and the shared free one never are', async () => {
    const sdk = heldSdk({ owners: ['account-a'] });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling('account-a');

    const before = await fetchEntitlement();
    if (!before) throw new Error('no answer');
    expect(before).toMatchObject({ is_plus: true });
    expect(isStaleEntitlement(before)).toBe(false);

    await logOutBilling();
    expect(isStaleEntitlement(before)).toBe(true);
    const after = await fetchEntitlement();
    if (!after) throw new Error('no answer');
    expect(after).toEqual(FREE_ENTITLEMENT);
    expect(isStaleEntitlement(after)).toBe(false);
    // What a sign-out writes is never this module's answer.
    expect(isStaleEntitlement(FREE_ENTITLEMENT)).toBe(false);
  });

  it('a sign-out RevenueCat is never told of (billing off by then) still makes an answer under way stale', async () => {
    const sdk = heldSdk({ owners: ['account-a'] });
    __setBillingDepsForTests(sdk.deps);
    await configureBilling('account-a');

    const release = sdk.hold();
    const reading = fetchEntitlement();
    await tick();
    delete process.env[KEY_VAR];
    await logOutBilling();
    release();

    await expect(reading).resolves.toBeNull();
    expect(sdk.deps.logOut).not.toHaveBeenCalled();
    expect(sdk.reads).toEqual(['account-a']);
  });
});

describe('fetchEntitlement', () => {
  it('returns what RevenueCat reports', async () => {
    await expect(fetchEntitlement()).resolves.toMatchObject({
      is_plus: true,
      source: 'annual',
    });
  });

  it('returns a real free entitlement when the user owns nothing', async () => {
    __setBillingDepsForTests(
      fakeDeps({ getCustomerInfo: jest.fn(async () => customerInfo(null)) }),
    );
    await expect(fetchEntitlement()).resolves.toEqual(FREE_ENTITLEMENT);
  });

  // The distinction the whole offline story rests on: "free" and "couldn't
  // ask" must not be the same value, or a failed call downgrades a subscriber.
  it('returns null — not free — when the call fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setBillingDepsForTests(
      fakeDeps({
        getCustomerInfo: jest.fn(async () => {
          throw new Error('offline');
        }),
      }),
    );
    await expect(fetchEntitlement()).resolves.toBeNull();
  });
});

describe('purchasePlan', () => {
  it('returns the granted entitlement', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    const result = await purchasePlan(`pkg_${PRODUCT_IDS.annual}`);
    expect(result).toEqual({
      status: 'purchased',
      entitlement: {
        is_plus: true,
        source: 'annual',
        expires_at: '2027-01-01T00:00:00.000Z',
      },
    });
    expect(deps.purchasePackage).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `pkg_${PRODUCT_IDS.annual}` }),
    );
  });

  it('reports cancellation distinctly from failure', async () => {
    __setBillingDepsForTests(
      fakeDeps({
        purchasePackage: jest.fn(async () => {
          throw { userCancelled: true };
        }),
      }),
    );
    await expect(purchasePlan(`pkg_${PRODUCT_IDS.annual}`)).resolves.toEqual({
      status: 'cancelled',
    });
  });

  it('reports a thrown purchase as failed', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setBillingDepsForTests(
      fakeDeps({
        purchasePackage: jest.fn(async () => {
          throw new Error('declined');
        }),
      }),
    );
    await expect(purchasePlan(`pkg_${PRODUCT_IDS.annual}`)).resolves.toEqual({
      status: 'failed',
    });
  });

  it('is unavailable when the package is not in the current offering', async () => {
    await expect(purchasePlan('pkg_nonexistent')).resolves.toEqual({
      status: 'unavailable',
    });
  });

  // A purchase that completes without granting the entitlement means the
  // dashboard is misconfigured. Never report that as success.
  it('fails when the completed purchase grants no entitlement', async () => {
    __setBillingDepsForTests(
      fakeDeps({ purchasePackage: jest.fn(async () => customerInfo(null)) }),
    );
    await expect(purchasePlan(`pkg_${PRODUCT_IDS.annual}`)).resolves.toEqual({
      status: 'failed',
    });
  });
});

describe('restorePurchases', () => {
  it('returns the restored entitlement', async () => {
    await expect(restorePurchases()).resolves.toMatchObject({
      status: 'restored',
      entitlement: { is_plus: true },
    });
  });

  it('distinguishes an empty account from an error', async () => {
    __setBillingDepsForTests(
      fakeDeps({ restorePurchases: jest.fn(async () => customerInfo(null)) }),
    );
    await expect(restorePurchases()).resolves.toEqual({
      status: 'nothing_to_restore',
    });

    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setBillingDepsForTests(
      fakeDeps({
        restorePurchases: jest.fn(async () => {
          throw new Error('network');
        }),
      }),
    );
    await expect(restorePurchases()).resolves.toEqual({ status: 'failed' });
  });
});

// RevenueCat's SDK ends the app on purpose when a Test Store key reaches a
// release build, TestFlight included (checked 2026-11-15). The development
// environment's key is one, so the first production build is where it bites.
describe('a Test Store key outside development', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const dev = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = dev;
  });

  it('is never handed to the SDK in a release build: billing reads as unavailable', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[KEY_VAR] = 'test_AbCdEf123';
    g.__DEV__ = false;

    expect(isBillingAvailable()).toBe(false);
    await expect(configureBilling('user-1')).resolves.toBe(false);
    expect(deps.configure).not.toHaveBeenCalled();
    await expect(fetchPlans()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Test Store key in a release build'));
  });

  it('still works in a development build, and an App Store key works in both', async () => {
    const deps = fakeDeps();
    __setBillingDepsForTests(deps);
    process.env[KEY_VAR] = 'test_AbCdEf123';
    g.__DEV__ = true;
    expect(isBillingAvailable()).toBe(true);

    process.env[KEY_VAR] = 'appl_AbCdEf123';
    g.__DEV__ = false;
    expect(isBillingAvailable()).toBe(true);
    await expect(configureBilling('user-1')).resolves.toBe(true);
    expect(deps.configure).toHaveBeenCalledWith('appl_AbCdEf123', 'user-1');
  });
});
