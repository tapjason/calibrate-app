// RevenueCat billing (L5). The only module in the app that knows a payments
// SDK exists.
//
// Layer rule: imports from @/types only. It never touches a store — the
// paywallStore (L4) calls in here and pushes the result into
// entitlementStore, the same shape as coachStore → @/ai/coach.
//
// Two properties everything below is built around:
//
//   1. **Fail to free, always** (CLAUDE.md). Absence of the native module, a
//      missing API key, a network error, an unparseable payload — every one
//      of them resolves to FREE_ENTITLEMENT. There is no path through this
//      file where an error grants Plus.
//   2. **Optional to the core loop.** Nothing here throws at the caller.
//      react-native-purchases is a native module that does not exist in Expo
//      Go, in Jest, or on web, so it is lazily required behind a deps seam
//      (the pattern in share/export.ts) and its absence is a normal, expected
//      state that reads as `unavailable` rather than as a crash.
//
// RevenueCat's server-side receipt validation is the source of truth. This
// module only translates what it reports into our Entitlement shape.

import { Platform } from 'react-native';

import {
  FREE_ENTITLEMENT,
  type Entitlement,
  type EntitlementSource,
} from '@/types';

// ---------------------------------------------------------------------------
// Product / entitlement identifiers
// ---------------------------------------------------------------------------

/**
 * The RevenueCat entitlement identifier. Configured in the dashboard and
 * attached to all three products — one entitlement, three ways to buy it, so
 * gating never has to enumerate products.
 */
export const PLUS_ENTITLEMENT_ID = 'plus';

/**
 * Store product identifiers, mirrored in App Store Connect (L7). This map is
 * how a purchased product becomes an `EntitlementSource`.
 */
export const PRODUCT_IDS = {
  monthly: 'calibrate_plus_monthly',
  annual: 'calibrate_plus_annual',
  lifetime: 'calibrate_plus_lifetime',
} as const;

export type PlanId = keyof typeof PRODUCT_IDS;

/**
 * Display order. Annual first — GROWTH_AND_MONETIZATION.md §4 anchors on it,
 * and the re-verification adds a second reason: the AI retention penalty
 * concentrates in monthly plans (36% worse over 12 months) and Coach is what
 * converts. If Coach sells the subscription, monthly is the worst container
 * for it.
 */
export const PLAN_ORDER: readonly PlanId[] = ['annual', 'monthly', 'lifetime'];

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** A purchasable plan, normalized out of RevenueCat's offering payload. */
export interface PlusPlan {
  /** RevenueCat package identifier — what purchasePlan() is called with. */
  packageId: string;
  /** Which of our three products this is. */
  plan: PlanId;
  /** Localized, store-formatted price ("$29.99"). Never assembled by us. */
  priceString: string;
  /**
   * Free-trial length in days, or null when the plan has no free intro offer.
   * An approximation for anything expressed in months or years — use
   * `trialPeriod` for anything the user reads.
   */
  trialDays: number | null;
  /**
   * The trial exactly as the store expresses it: `{ count: 1, unit: 'MONTH' }`
   * for a one-month free trial.
   *
   * Kept alongside `trialDays` because a calendar month is 28–31 days, and
   * this is the one screen where being three days off is a billing claim
   * rather than a rounding error. Copy reads this; arithmetic reads
   * `trialDays`.
   */
  trialPeriod: TrialPeriod | null;
}

export type PurchaseResult =
  /** Paid, and the entitlement is live. */
  | { status: 'purchased'; entitlement: Entitlement }
  /** The user backed out of the store sheet. Not an error — say nothing. */
  | { status: 'cancelled' }
  /** No SDK, no key, or no such package. The paywall shows an unavailable state. */
  | { status: 'unavailable' }
  /** Everything else, including a declined card. */
  | { status: 'failed' };

export type RestoreResult =
  | { status: 'restored'; entitlement: Entitlement }
  /** Restore worked, but this account owns nothing. */
  | { status: 'nothing_to_restore' }
  | { status: 'unavailable' }
  | { status: 'failed' };

// ---------------------------------------------------------------------------
// The SDK seam
// ---------------------------------------------------------------------------

/** How a store expresses an introductory period. */
export type TrialUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

/** A free-trial length in the store's own units. */
export interface TrialPeriod {
  count: number;
  unit: TrialUnit;
}

/** The subset of RevenueCat's CustomerInfo we read. */
export interface RcEntitlementInfo {
  identifier: string;
  isActive: boolean;
  productIdentifier: string;
  expirationDate: string | null;
  /** 'NORMAL' | 'INTRO' | 'TRIAL' in the SDK. */
  periodType?: string;
}

export interface RcCustomerInfo {
  entitlements: { active: Record<string, RcEntitlementInfo | undefined> };
}

export interface RcPackage {
  identifier: string;
  product: {
    identifier: string;
    priceString: string;
    introPrice?: {
      periodNumberOfUnits: number;
      /** 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' */
      periodUnit: string;
      price: number;
    } | null;
  };
}

export interface RcOfferings {
  current: { availablePackages: RcPackage[] } | null;
}

/** Everything this module needs from react-native-purchases. */
export interface BillingDeps {
  configure(apiKey: string, appUserId: string | null): Promise<void>;
  logIn(appUserId: string): Promise<void>;
  /** Drop back to a fresh anonymous identity (sign-out). */
  logOut(): Promise<void>;
  getOfferings(): Promise<RcOfferings>;
  getCustomerInfo(): Promise<RcCustomerInfo>;
  purchasePackage(pkg: RcPackage): Promise<RcCustomerInfo>;
  restorePurchases(): Promise<RcCustomerInfo>;
  /** True when the thrown error is the user dismissing the store sheet. */
  isCancelledError(e: unknown): boolean;
}

let deps: BillingDeps | null = null;
let configured = false;

/**
 * Public SDK keys, safe to bundle: they authorize reads and purchases for one
 * app, and receipt validation happens on RevenueCat's servers.
 */
function apiKeyForPlatform(): string {
  const ios = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
  const android = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
  return Platform.OS === 'android' ? android : ios;
}

type PurchasesModule = typeof import('react-native-purchases').default;

function defaultDeps(): BillingDeps | null {
  // Lazy require. Absent on web, in Expo Go, and in Jest — all normal states.
  let Purchases: PurchasesModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Purchases = require('react-native-purchases').default as PurchasesModule;
    if (!Purchases) return null;
  } catch {
    return null;
  }

  return {
    async configure(apiKey, appUserId) {
      await Purchases.configure({ apiKey, appUserID: appUserId });
    },
    async logIn(appUserId) {
      await Purchases.logIn(appUserId);
    },
    async logOut() {
      await Purchases.logOut();
    },
    async getOfferings() {
      return (await Purchases.getOfferings()) as unknown as RcOfferings;
    },
    async getCustomerInfo() {
      return (await Purchases.getCustomerInfo()) as unknown as RcCustomerInfo;
    },
    async purchasePackage(pkg) {
      const result = await Purchases.purchasePackage(
        pkg as unknown as Parameters<PurchasesModule['purchasePackage']>[0],
      );
      return result.customerInfo as unknown as RcCustomerInfo;
    },
    async restorePurchases() {
      return (await Purchases.restorePurchases()) as unknown as RcCustomerInfo;
    },
    isCancelledError(e) {
      return Boolean(
        e &&
          typeof e === 'object' &&
          (e as { userCancelled?: boolean }).userCancelled,
      );
    },
  };
}

function getDeps(): BillingDeps | null {
  if (deps === null) deps = defaultDeps();
  return deps;
}

/** Test-only: swap the SDK seam (null resets to the real lazy require). */
export function __setBillingDepsForTests(next: BillingDeps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setBillingDepsForTests is only allowed when NODE_ENV=test');
  }
  deps = next;
  configured = false;
}

/** Whether billing can run at all: SDK present and an API key configured. */
export function isBillingAvailable(): boolean {
  return getDeps() !== null && apiKeyForPlatform() !== '';
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function sourceFor(info: RcEntitlementInfo): EntitlementSource {
  // A trial is a trial whatever product backs it — that distinction drives the
  // "your trial ends" copy, so it wins over the product mapping.
  const period = info.periodType?.toUpperCase();
  if (period === 'TRIAL' || period === 'INTRO') return 'trial';

  switch (info.productIdentifier) {
    case PRODUCT_IDS.monthly:
      return 'monthly';
    case PRODUCT_IDS.annual:
      return 'annual';
    case PRODUCT_IDS.lifetime:
      return 'lifetime';
    default:
      // Unknown product, active entitlement: honor the entitlement (RevenueCat
      // is the source of truth) and infer the source from whether it expires.
      return info.expirationDate ? 'monthly' : 'lifetime';
  }
}

/**
 * Translate RevenueCat's customer info into our Entitlement. Pure and total —
 * anything missing or malformed reads as free.
 */
export function entitlementFromCustomerInfo(info: unknown): Entitlement {
  const active = (info as RcCustomerInfo | null)?.entitlements?.active;
  if (!active || typeof active !== 'object') return FREE_ENTITLEMENT;

  const plus = active[PLUS_ENTITLEMENT_ID];
  // isActive is checked explicitly rather than inferred from the map's name:
  // `active` is RevenueCat's own filtered view, and if a future SDK version
  // changes what lands in it, the wrong default here is the expensive one.
  if (!plus || plus.isActive !== true) return FREE_ENTITLEMENT;

  return {
    is_plus: true,
    source: sourceFor(plus),
    expires_at: plus.expirationDate ?? null,
  };
}

const DAYS_PER_UNIT: Record<string, number> = {
  DAY: 1,
  WEEK: 7,
  MONTH: 30,
  YEAR: 365,
};

/**
 * The free-trial period a package offers, in the store's own units, or null.
 *
 * A discounted intro price is not a trial — only a free one is.
 */
function trialPeriodFor(pkg: RcPackage): TrialPeriod | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const unit = intro.periodUnit?.toUpperCase();
  if (!unit || !(unit in DAYS_PER_UNIT)) return null;
  const count = intro.periodNumberOfUnits;
  if (!Number.isFinite(count) || count <= 0) return null;
  return { count, unit: unit as TrialUnit };
}

/** The same trial as a day count, for arithmetic and analytics. */
function trialDaysFor(period: TrialPeriod | null): number | null {
  if (!period) return null;
  return period.count * DAYS_PER_UNIT[period.unit];
}

function planFor(productId: string): PlanId | null {
  return (
    (Object.keys(PRODUCT_IDS) as PlanId[]).find(
      (k) => PRODUCT_IDS[k] === productId,
    ) ?? null
  );
}

/** Normalize an offerings payload into our plan list, in PLAN_ORDER. */
export function plansFromOfferings(offerings: unknown): PlusPlan[] {
  const packages = (offerings as RcOfferings | null)?.current?.availablePackages;
  if (!Array.isArray(packages)) return [];

  const plans: PlusPlan[] = [];
  for (const pkg of packages) {
    const productId = pkg?.product?.identifier;
    const plan = typeof productId === 'string' ? planFor(productId) : null;
    // Unknown products are dropped rather than guessed at: the paywall would
    // otherwise show a plan whose price we can print but whose entitlement we
    // cannot describe.
    if (!plan) continue;
    if (typeof pkg.product.priceString !== 'string') continue;
    plans.push({
      packageId: pkg.identifier,
      plan,
      priceString: pkg.product.priceString,
      trialDays: trialDaysFor(trialPeriodFor(pkg)),
      trialPeriod: trialPeriodFor(pkg),
    });
  }

  plans.sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan));
  return plans;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Configure the SDK for a user. Idempotent and safe to call on every sign-in;
 * returns false when billing isn't available on this build.
 *
 * `userId` is the Supabase user id, so RevenueCat's app user id matches the id
 * everything else in the app keys on — that is what lets a purchase follow the
 * user to a new device.
 *
 * Pass **null** for a signed-out user. Never a placeholder: the app's guest id
 * is one shared constant across every install, and RevenueCat treats the app
 * user id as the account — one guest's purchase would then read as active for
 * every other guest device on earth. Null makes the SDK mint a per-install
 * anonymous id, which `logIn()` later aliases onto the real account.
 */
export async function configureBilling(userId: string | null): Promise<boolean> {
  const d = getDeps();
  const apiKey = apiKeyForPlatform();
  if (!d || !apiKey) return false;
  try {
    if (!configured) {
      await d.configure(apiKey, userId);
      configured = true;
    } else if (userId) {
      // Already configured (as a guest, or for a previous account) — move the
      // purchase history onto this user id rather than reconfiguring.
      await d.logIn(userId);
    }
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] configure failed:', e);
    return false;
  }
}

/**
 * Drop the RevenueCat identity on sign-out, so whoever uses this device next
 * starts anonymous instead of inheriting the previous account's purchases.
 * No-op when billing was never configured.
 */
export async function logOutBilling(): Promise<void> {
  const d = getDeps();
  if (!d || !apiKeyForPlatform() || !configured) return;
  try {
    await d.logOut();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] logout failed:', e);
  }
}

/**
 * The current entitlement per RevenueCat, or **null when we could not find
 * out** — no SDK, no key, or the call failed.
 *
 * The null is deliberate and is the one place this module doesn't collapse to
 * FREE. "RevenueCat says this user is free" and "we couldn't reach RevenueCat"
 * must not be the same value: the caller overwrites the local mirror with the
 * former, and a plane-mode launch returning FREE would strip Plus from a
 * paying subscriber. Absence still fails safe, just one layer up — the mirror
 * itself starts free and expires itself (entitlementStore).
 */
export async function fetchEntitlement(): Promise<Entitlement | null> {
  const d = getDeps();
  if (!d || !apiKeyForPlatform()) return null;
  try {
    // The SDK serves its own cached CustomerInfo when offline, so a throw here
    // is a genuine "no answer", not merely "no network".
    return entitlementFromCustomerInfo(await d.getCustomerInfo());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] entitlement refresh failed:', e);
    return null;
  }
}

/** The purchasable plans. Empty when billing is unavailable or offerings fail. */
export async function fetchPlans(): Promise<PlusPlan[]> {
  const d = getDeps();
  if (!d || !apiKeyForPlatform()) return [];
  try {
    return plansFromOfferings(await d.getOfferings());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] offerings failed:', e);
    return [];
  }
}

/** Buy a plan. The returned entitlement is whatever RevenueCat reports after. */
export async function purchasePlan(packageId: string): Promise<PurchaseResult> {
  const d = getDeps();
  if (!d || !apiKeyForPlatform()) return { status: 'unavailable' };
  try {
    // Re-reading the offering rather than holding the package object from
    // fetchPlans keeps the SDK's own object — which carries fields we don't
    // model — as the thing that actually gets purchased.
    const offerings = await d.getOfferings();
    const pkg = offerings?.current?.availablePackages?.find(
      (p) => p.identifier === packageId,
    );
    if (!pkg) return { status: 'unavailable' };

    const entitlement = entitlementFromCustomerInfo(await d.purchasePackage(pkg));
    // A completed purchase that doesn't grant the entitlement means a
    // misconfigured dashboard. Report failure rather than handing back a free
    // entitlement the caller would read as success.
    if (!entitlement.is_plus) return { status: 'failed' };
    return { status: 'purchased', entitlement };
  } catch (e) {
    if (d.isCancelledError(e)) return { status: 'cancelled' };
    // eslint-disable-next-line no-console
    console.warn('[billing] purchase failed:', e);
    return { status: 'failed' };
  }
}

/** Restore purchases made on another device or before a reinstall. */
export async function restorePurchases(): Promise<RestoreResult> {
  const d = getDeps();
  if (!d || !apiKeyForPlatform()) return { status: 'unavailable' };
  try {
    const entitlement = entitlementFromCustomerInfo(await d.restorePurchases());
    if (!entitlement.is_plus) return { status: 'nothing_to_restore' };
    return { status: 'restored', entitlement };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] restore failed:', e);
    return { status: 'failed' };
  }
}
