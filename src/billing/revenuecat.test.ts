import { FREE_ENTITLEMENT } from '@/types';

import {
  PRODUCT_IDS,
  __setBillingDepsForTests,
  configureBilling,
  entitlementFromCustomerInfo,
  fetchEntitlement,
  fetchPlans,
  isBillingAvailable,
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

  it('reports a trial as source=trial whatever product backs it', () => {
    const e = entitlementFromCustomerInfo(
      customerInfo({ productIdentifier: PRODUCT_IDS.annual, periodType: 'TRIAL' }),
    );
    expect(e).toMatchObject({ is_plus: true, source: 'trial' });
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
