// RevenueCat billing (L5). The only module in the app that knows a payments
// SDK exists.
//
// Layer rule: imports from @/types, and `isLocalOnly` from the age store (a
// leaf) for the under-13 rule. It never touches another store — the
// paywallStore (L4) calls in here and pushes the result into
// entitlementStore, the same shape as coachStore → @/ai/coach.
//
// The under-13 rule (roadmap D70, 2026-11-19): while the phone is local-only,
// `apiKeyForPlatform()` returns '' and every function below already reads
// that as billing unavailable: RevenueCat is never configured, nothing is
// fetched, bought or restored, and Plus reads as unavailable. A local
// entitlement mirror already on the phone is left as it is (entitlementStore;
// `fetchEntitlement`'s null never overwrites it).
//
// A signed-out start (review 2026-11-19, round 2, item 1): RevenueCat keeps
// the app user id it cached, so one configured with no user after a sign-out
// it never heard of would still be the old account. `configureBilling(null)`
// logs such an account out before anything reads entitlements or buys, and
// every read and purchase waits for that (`identity`).
//
// An answer for an identity the app has left (step 207): an SDK call answers
// for the identity it started under, so one already under way when a sign-out
// is asked for comes back with the old account's customer info. Every read,
// purchase and restore notes the count of identity changes when it starts and
// hands its answer on only if the count hasn't moved (`identityGeneration`);
// the entitlement store asks again right before it writes
// (`isStaleEntitlement`, registered by src/billing/init.ts).
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

import { isLocalOnly } from '@/store/ageStore';
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
 * how a purchased product becomes an `EntitlementSource`, and a package whose
 * product isn't here (or in PRODUCT_ALIASES) never reaches the paywall.
 *
 * Lifetime is `calibrate_plus_lifetime_once`, a non-consumable (2026-11-26):
 * `calibrate_plus_lifetime` was created in App Store Connect as a
 * non-renewing subscription by mistake, and Apple can neither change a
 * product's type nor reuse its id.
 */
export const PRODUCT_IDS = {
  monthly: 'calibrate_plus_monthly',
  annual: 'calibrate_plus_annual',
  lifetime: 'calibrate_plus_lifetime_once',
} as const;

export type PlanId = keyof typeof PRODUCT_IDS;

/**
 * Other product ids that sell the same plan. A store product's price, trial
 * or type can't always be edited in place, so a corrected one gets a new id:
 * the RevenueCat Test Store's annual at $29.99 and monthly without a trial
 * (2026-11-03), and the first lifetime id, the non-renewing subscription
 * created by mistake (2026-11-26). That one was only ever bought in the
 * sandbox; it stays here so a test purchase of it still reads as lifetime.
 * Mirrored in the webhook's entitlementFromEvent.ts.
 */
export const PRODUCT_ALIASES: Readonly<Record<PlanId, readonly string[]>> = {
  monthly: ['calibrate_plus_monthly_notrial'],
  annual: ['calibrate_plus_annual_2999'],
  lifetime: ['calibrate_plus_lifetime'],
};

/** Which plan a store product sells, or null for one we don't know. */
export function planForProduct(productId: string | null | undefined): PlanId | null {
  if (typeof productId !== 'string') return null;
  return (
    (Object.keys(PRODUCT_IDS) as PlanId[]).find(
      (plan) => PRODUCT_IDS[plan] === productId || PRODUCT_ALIASES[plan].includes(productId),
    ) ?? null
  );
}

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
  /**
   * The store's own per-month figure for a subscription ("$2.50" for $29.99 a
   * year), localized by RevenueCat. Shown under the annual price, smaller,
   * because App Review wants the billed amount to stay the most prominent
   * price (DESIGN_SYSTEM §7.6). Absent or null: say nothing.
   */
  pricePerMonthString?: string | null;
}

export type PurchaseResult =
  /** Paid, and the entitlement is live. */
  | { status: 'purchased'; entitlement: Entitlement }
  /**
   * Paid, but the account on the phone changed while the purchase finished (a
   * sign-out with the store sheet up), and the identity the app means now
   * doesn't own Plus, or couldn't be asked: the purchase went to the account
   * that was signed in when it started. No entitlement: it isn't this
   * identity's, and any doubt reads as free. The paywall says where it went.
   */
  | { status: 'purchased_elsewhere' }
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
  /** False once the user has cancelled: it ends at expirationDate and won't renew. */
  willRenew?: boolean;
}

export interface RcCustomerInfo {
  entitlements: { active: Record<string, RcEntitlementInfo | undefined> };
}

export interface RcPackage {
  identifier: string;
  product: {
    identifier: string;
    priceString: string;
    /** Null for one-time purchases; an approximation for longer periods. */
    pricePerMonthString?: string | null;
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
  /**
   * The product ids this customer may still take the free trial on (Apple:
   * one introductory offer per subscription group). Optional so a test fake
   * can leave it out; the real SDK always has it.
   */
  introEligibleProducts?(productIds: string[]): Promise<ReadonlySet<string>>;
  /**
   * Whether the SDK's current app user id is one it made itself (anonymous)
   * rather than one this app gave it (`Purchases.isAnonymous`). Optional so a
   * test fake can leave it out, which is taken as anonymous (as before this
   * check existed); the real SDK always has it.
   */
  isAnonymous?(): Promise<boolean>;
}

let deps: BillingDeps | null = null;
/** `configure` has been called (set before it resolves; cleared if it fails). */
let configured = false;

/**
 * Whether RevenueCat's identity is the one the app means, for every read and
 * purchase below (review 2026-11-19, round 2, item 1). Each identity change
 * (the first configure, a log-in, a log-out) replaces it with a promise that
 * runs after the one before it, and every read and purchase waits for the
 * latest, so none reads entitlements, or buys, while a signed-out start is
 * still logging out an account the SDK had cached. False when that couldn't
 * be done (the SDK still reports an identified user, or a configure failed):
 * reads then say "couldn't find out" (null, the mirror left as it is) and
 * purchases "unavailable", until a sign-in (`logIn`) or the next launch tries
 * again (or, for a log-out that was owed, the next call: `settleOwedLogOut`).
 * Never rejects.
 */
let identity: Promise<boolean> = Promise.resolve(true);

/**
 * How many identity changes have been asked for in this run (step 207;
 * residual 11 of docs/design/research/under-13-2026-11.md). `identity` makes a
 * read or purchase wait for a change asked for before it starts; this catches
 * one asked for while it is under way. An SDK call answers for the identity it
 * started under, so a customer-info read already out when a sign-out is asked
 * for comes back with the old account's info, and applying it (the paywall's
 * refresh, `refreshBilling`, the identity sync's own refresh) would put that
 * account's Plus in the guest's store and mirror. Every function below notes
 * the count when it starts and hands an answer on only if the count is the
 * same when the answer comes (`askCurrentIdentity`).
 *
 * Advanced the moment a change is asked for, synchronously, by
 * `configureBilling` and `logOutBilling`, before either can return early: a
 * sign-out RevenueCat can't be told of (billing off by then, the under-13 rule
 * coming on in a long run) still makes an answer under way for the old account
 * stale. src/billing/init.ts calls them in the same synchronous run as the
 * userId change, so no answer can be checked in between.
 */
let identityGeneration = 0;

/** Note that an identity change was asked for: every answer still under way is now stale. */
function beginIdentityChange(): void {
  identityGeneration += 1;
}

/**
 * A sign-out RevenueCat couldn't be told of, though it was configured (review
 * round 1, item 2): the under-13 rule came on after billing started, so
 * `logOutBilling` found no key and RevenueCat kept the account. If the rule
 * lifts later in the same run, billing has already started and nothing
 * configures it again, so without this the next read would put that
 * account's Plus in the guest's store and mirror, and a purchase would land on
 * its customer. `settleOwedLogOut` tells RevenueCat once billing is usable
 * again, before any read, purchase or restore, and is owed again after a try
 * that fails. Only for this run: at the next
 * launch `configureBilling(null)` drops a cached account anyway
 * (`dropCachedAccount`).
 */
let logOutOwed = false;

/**
 * The change count each entitlement this module handed out was answered
 * under. Keyed by the object itself, which is always this module's own copy
 * (`answered`), so the shared FREE_ENTITLEMENT a sign-out writes is never
 * marked.
 */
const answeredUnder = new WeakMap<Entitlement, number>();

/** An entitlement as an answer under `generation`: a copy of its own, marked. */
function answered(e: Entitlement, generation: number): Entitlement {
  const own: Entitlement = { ...e };
  answeredUnder.set(own, generation);
  return own;
}

/**
 * Whether an entitlement this module handed out was answered for an identity
 * the app has since left (a change was asked for after it was read). False for
 * anything it didn't hand out: the free entitlement a sign-out writes, the
 * mirror's own row. The entitlement store asks this right before it writes,
 * in the same synchronous run as the write, so an answer that was current when
 * it came back but went stale on its way to the store is dropped there too
 * (src/billing/init.ts registers it).
 */
export function isStaleEntitlement(e: Entitlement): boolean {
  const generation = answeredUnder.get(e);
  return generation !== undefined && generation !== identityGeneration;
}

/** How many times a wait follows identity changes that keep coming before it gives up. */
const IDENTITY_ROUNDS = 3;

/**
 * Wait until RevenueCat is the identity the app means, after every change
 * asked for so far (one asked for during the wait included), and return the
 * change count that is. Null when that identity can't be trusted (`identity`
 * false), when billing went off during the wait (the under-13 rule: nothing is
 * then asked, and a sign-out it kept from RevenueCat leaves the old account
 * there), or when changes kept coming.
 */
async function settledIdentity(): Promise<number | null> {
  for (let round = 0; round < IDENTITY_ROUNDS; round += 1) {
    // A log-out RevenueCat is owed goes first, as an identity change of its own.
    settleOwedLogOut();
    const generation = identityGeneration;
    const trusted = await identity;
    if (!apiKeyForPlatform()) return null;
    if (generation === identityGeneration) return trusted ? generation : null;
  }
  return null;
}

/**
 * Ask RevenueCat something about the current customer, as the identity the
 * app means, and return the answer with the change count it is for, only if
 * no change was asked for while it was out. One that was is the old
 * identity's, so it is asked once more, as the new one. Null when it can't be
 * asked for the identity the app means. A throw from `ask` reaches the caller.
 */
async function askCurrentIdentity<T>(
  ask: () => Promise<T>,
): Promise<{ value: T; generation: number } | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generation = await settledIdentity();
    if (generation === null) return null;
    const value = await ask();
    if (generation === identityGeneration) return { value, generation };
  }
  return null;
}

/** How a RevenueCat Test Store key starts (an App Store key starts "appl_"). */
const TEST_STORE_PREFIX = 'test_';
let warnedTestStoreKey = false;

/**
 * Public SDK keys, safe to bundle: they authorize reads and purchases for one
 * app, and receipt validation happens on RevenueCat's servers.
 *
 * **Never a Test Store key in a release build.** RevenueCat's SDK ends the app
 * on purpose when it is configured with one outside a debug build, TestFlight
 * included: a native alert, then a fatal error at launch that no try/catch
 * here can stop (RevenueCat's Test Store docs; purchases-ios PR 5755; checked
 * 2026-11-15). The development environment holds exactly such a key, so a
 * production build made with the wrong variables would crash for every
 * tester and for App Review. With the key treated as absent, every function
 * below fails to "free" and the paywall says Plus isn't available on this
 * build, which the first TestFlight check will show.
 *
 * **No key on a local-only phone** (the under-13 rule, D70): every function
 * below reads '' as unavailable, so RevenueCat is never configured there and
 * nothing goes to it. Checked first, on every call.
 */
function apiKeyForPlatform(): string {
  if (isLocalOnly()) return '';
  const ios = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
  const android = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
  const key = (Platform.OS === 'android' ? android : ios).trim();
  if (!__DEV__ && key.startsWith(TEST_STORE_PREFIX)) {
    if (!warnedTestStoreKey) {
      warnedTestStoreKey = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[billing] a RevenueCat Test Store key in a release build: billing is off. ' +
          'Give this build environment the App Store ("appl_") key.',
      );
    }
    return '';
  }
  return key;
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
    async isAnonymous() {
      return await Purchases.isAnonymous();
    },
    async introEligibleProducts(productIds) {
      const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
      const eligible = Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
      return new Set(
        Object.entries(result)
          .filter(([, e]) => e?.status === eligible)
          .map(([id]) => id),
      );
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
  logOutOwed = false;
  identity = Promise.resolve(true);
  // A new SDK: nothing still out from the last one is an answer for it.
  beginIdentityChange();
}

/** Whether billing can run at all: SDK present and an API key configured. */
export function isBillingAvailable(): boolean {
  // The key first: on a local-only phone the SDK module isn't even loaded.
  return apiKeyForPlatform() !== '' && getDeps() !== null;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function sourceFor(info: RcEntitlementInfo): EntitlementSource {
  // A trial is a trial whatever product backs it — that distinction drives the
  // "your trial ends" copy, so it wins over the product mapping.
  const period = info.periodType?.toUpperCase();
  if (period === 'TRIAL' || period === 'INTRO') return 'trial';

  const plan = planForProduct(info.productIdentifier);
  if (plan) return plan;
  // Unknown product, active entitlement: honor the entitlement (RevenueCat
  // is the source of truth) and infer the source from whether it expires.
  return info.expirationDate ? 'monthly' : 'lifetime';
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

/** A free trial in progress (roadmap D16): when it ends, and what follows. */
export interface TrialStatus {
  /** When the trial ends and, unless cancelled, the paid plan starts. ISO. */
  endsAt: string;
  /** False once cancelled: nothing will be charged, so nothing to remind. */
  willRenew: boolean;
  /** The plan it turns into, or null for a product we don't know. */
  plan: PlanId | null;
}

/**
 * The free trial the customer is in, or null when they aren't in one. Pure
 * and total, like entitlementFromCustomerInfo: anything missing reads as no
 * trial, so the worst case is a reminder not sent, never a wrong one.
 */
export function trialStatusFromCustomerInfo(info: unknown): TrialStatus | null {
  const plus = (info as RcCustomerInfo | null)?.entitlements?.active?.[PLUS_ENTITLEMENT_ID];
  if (!plus || plus.isActive !== true) return null;
  if (plus.periodType?.toUpperCase() !== 'TRIAL' || !plus.expirationDate) return null;
  const plan = planForProduct(plus.productIdentifier);
  return { endsAt: plus.expirationDate, willRenew: plus.willRenew !== false, plan };
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

/**
 * The product ids in an offering that carry a free trial, for the
 * eligibility check: only those need asking about.
 */
export function trialProductIds(offerings: unknown): string[] {
  const packages = (offerings as RcOfferings | null)?.current?.availablePackages;
  if (!Array.isArray(packages)) return [];
  return packages
    .filter((pkg) => planForProduct(pkg?.product?.identifier) && trialPeriodFor(pkg))
    .map((pkg) => pkg.product.identifier);
}

/**
 * Normalize an offerings payload into our plan list, in PLAN_ORDER.
 * `eligible`: the products this customer may still take the free trial on
 * (D62, policy audit: a lapsed subscriber saw "Start 1 month free" and would
 * have been charged at once; Apple allows one introductory offer per
 * subscription group, guideline 3.1.2(a)). A trial shows only for those.
 * Left out, every trial shows (the store's product-level offer, as before).
 */
export function plansFromOfferings(
  offerings: unknown,
  eligible?: ReadonlySet<string> | null,
): PlusPlan[] {
  const packages = (offerings as RcOfferings | null)?.current?.availablePackages;
  if (!Array.isArray(packages)) return [];

  const plans: PlusPlan[] = [];
  for (const pkg of packages) {
    const productId = pkg?.product?.identifier;
    const plan = planForProduct(productId);
    // Unknown products are dropped rather than guessed at: the paywall would
    // otherwise show a plan whose price we can print but whose entitlement we
    // cannot describe.
    if (!plan) continue;
    if (typeof pkg.product.priceString !== 'string') continue;
    const trial = eligible && !eligible.has(productId) ? null : trialPeriodFor(pkg);
    plans.push({
      packageId: pkg.identifier,
      plan,
      priceString: pkg.product.priceString,
      trialDays: trialDaysFor(trial),
      trialPeriod: trial,
      pricePerMonthString:
        typeof pkg.product.pricePerMonthString === 'string'
          ? pkg.product.pricePerMonthString
          : null,
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
 * every other guest device on earth. Null gives this install's anonymous id
 * (minted on first use), which `logIn()` later aliases onto the real account;
 * an account id the SDK still holds from before a sign-out is logged out
 * first (`dropCachedAccount`), before anything reads entitlements.
 *
 * True when RevenueCat is configured for the identity asked for; false when
 * billing isn't available, the configure or log-in failed, or a signed-out
 * start couldn't drop a cached account (reads and purchases then wait, see
 * `identity`).
 */
export async function configureBilling(userId: string | null): Promise<boolean> {
  // An identity is asked for (anything but a signed-out call on a configured
  // SDK, which changes nothing): answers still out are now stale, whether or
  // not RevenueCat can be told (`identityGeneration`).
  if (userId !== null || !configured) beginIdentityChange();
  const apiKey = apiKeyForPlatform();
  if (!apiKey) return false;
  const d = getDeps();
  if (!d) return false;
  if (!configured) {
    // Set before the first await, so a log-in or log-out that comes while
    // this runs queues behind it (`changeIdentity`) instead of configuring
    // a second time.
    configured = true;
    // The configure sets the identity itself (a null one drops a cached
    // account), so no earlier log-out is still owed.
    logOutOwed = false;
    const start = (async (): Promise<boolean> => {
      try {
        await d.configure(apiKey, userId);
      } catch (e) {
        configured = false;
        // eslint-disable-next-line no-console
        console.warn('[billing] configure failed:', e);
        return false;
      }
      return userId === null ? await dropCachedAccount(d) : true;
    })();
    identity = start;
    return await start;
  }
  // A sign-out RevenueCat missed under the rule is told first: a log-in then
  // follows it exactly as it follows a sign-out RevenueCat heard.
  settleOwedLogOut();
  if (!userId) return await identity;
  // Already configured (as a guest, or for a previous account): move the
  // purchase history onto this user id rather than reconfiguring. After any
  // identity change still running, so it can't be undone by one.
  let loggedIn = false;
  await changeIdentity(async (before) => {
    try {
      await d.logIn(userId);
      loggedIn = true;
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[billing] configure failed:', e);
      // The SDK is still whoever it was: reads go on as they did.
      return before;
    }
  });
  return loggedIn;
}

/**
 * Run an identity change after the one before it, and make reads and
 * purchases wait for it. Never rejects: a change that throws reads as an
 * identity that can't be trusted.
 */
function changeIdentity(change: (before: boolean) => Promise<boolean>): Promise<boolean> {
  const next = identity.then(change).catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[billing] identity change failed:', e);
    return false;
  });
  identity = next;
  return next;
}

/** The SDK's own answer to "is the current user anonymous?", or null when it gave none. */
async function sdkSaysAnonymous(d: BillingDeps): Promise<boolean | null> {
  if (!d.isAnonymous) return null;
  try {
    const anonymous: unknown = await d.isAnonymous();
    return typeof anonymous === 'boolean' ? anonymous : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] could not tell whether the RevenueCat user is anonymous:', e);
    return null;
  }
}

/**
 * For a start with no signed-in user (review 2026-11-19, round 2, item 1):
 * make sure RevenueCat isn't still identified as an account this phone signed
 * out of. `configure` with a null app user id keeps the id the SDK cached
 * (purchases-ios `IdentityManager`: the configured id, else the cached one,
 * else a new anonymous id), so a sign-out RevenueCat never heard of (it
 * hadn't started: Apple's age answer pending, a local-only phone, a build
 * without a key, or an earlier run) would otherwise leave the previous
 * account's Plus readable here and land the next person's purchases on that
 * account's customer. Logs out when the SDK reports an identified user (or
 * can't say: `logOut` rejects for an anonymous one, which is harmless), then
 * asks again. True once the SDK reports an anonymous user. A seam with no
 * `isAnonymous` (a test fake) is taken as anonymous, as before.
 */
async function dropCachedAccount(d: BillingDeps): Promise<boolean> {
  if (!d.isAnonymous) return true;
  if ((await sdkSaysAnonymous(d)) === true) return true;
  try {
    await d.logOut();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] could not log out a previous account:', e);
  }
  return anonymousOrWarn(await sdkSaysAnonymous(d));
}

/** True for an anonymous user; otherwise warns that reads and purchases wait, and is false. */
function anonymousOrWarn(anonymous: boolean | null): boolean {
  if (anonymous === true) return true;
  // eslint-disable-next-line no-console
  console.warn(
    '[billing] RevenueCat may still hold a signed-out account: purchases and entitlement reads ' +
      'wait for a sign-in or the next launch',
  );
  return false;
}

/**
 * Drop the RevenueCat identity on sign-out, so whoever uses this device next
 * starts anonymous instead of inheriting the previous account's purchases.
 * No-op when billing was never configured, except that an answer still out
 * is dropped (`identityGeneration`). After any identity change still
 * running; reads and purchases wait for it, and stay held if the SDK still
 * reports an identified user afterwards (a seam with no `isAnonymous` is
 * taken at its word, as before).
 *
 * With RevenueCat configured but billing off (the under-13 rule came on after
 * it started), nothing reaches the SDK: the log-out is owed (`logOutOwed`)
 * and runs once billing is usable again, before any read, purchase or restore
 * (`settleOwedLogOut`).
 */
export async function logOutBilling(): Promise<void> {
  // First, whatever follows: an answer still out is the signed-out account's,
  // even when RevenueCat can't be told (`identityGeneration`).
  beginIdentityChange();
  if (!apiKeyForPlatform()) {
    // RevenueCat still holds the account: told later, never now (no key).
    if (configured) logOutOwed = true;
    return;
  }
  if (!configured) return;
  const d = getDeps();
  if (!d) return;
  // This log-out is the one any earlier sign-out was owed.
  logOutOwed = false;
  await changeIdentity(() => logOutAndCheck(d));
}

/**
 * Tell RevenueCat of a sign-out it missed while billing was off, once billing
 * is usable again (review round 1, item 2): queued as an identity change of
 * its own, so answers still out go stale and every read, purchase and restore
 * waits for it. Nothing while billing is off (the under-13 rule: no key, and
 * the SDK isn't touched), and nothing when no log-out is owed. Called by
 * every read, purchase and restore before it asks (`settledIdentity`,
 * `fetchPlans`), by `configureBilling`, and by src/billing/init.ts when
 * uploads may start again in a run where RevenueCat had already started.
 *
 * A try that fails (the SDK still reports an identified user afterwards) is
 * owed again (review round 2, item 4), so the next read, purchase, restore or
 * plans request tries once more instead of leaving the paywall's plans
 * unloadable for the rest of the run. Never a loop: one try per call, and
 * the call it fails under settles as "can't be trusted" (null, unavailable,
 * no plans). Not owed again when another identity change was queued after it
 * (a sign-in, or a sign-out that makes its own try): that one decides.
 */
export function settleOwedLogOut(): void {
  if (!logOutOwed || !apiKeyForPlatform() || !configured) return;
  const d = getDeps();
  if (!d) return;
  logOutOwed = false;
  beginIdentityChange();
  const attempt: Promise<boolean> = changeIdentity(async () => {
    const trusted = await logOutAndCheck(d);
    if (!trusted && identity === attempt) logOutOwed = true;
    return trusted;
  });
}

/**
 * Log RevenueCat out and say whether the identity can be trusted afterwards:
 * true once the SDK reports an anonymous user (or a seam with no
 * `isAnonymous` is taken at its word), else false with a warning.
 */
async function logOutAndCheck(d: BillingDeps): Promise<boolean> {
  try {
    await d.logOut();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] logout failed:', e);
  }
  if (!d.isAnonymous) return true;
  return anonymousOrWarn(await sdkSaysAnonymous(d));
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
  if (!apiKeyForPlatform()) return null;
  const d = getDeps();
  if (!d) return null;
  return await currentEntitlement(d);
}

/**
 * What RevenueCat says the identity the app means owns, or null when that
 * can't be found out (see fetchEntitlement). After any identity change still
 * running, never a signed-out account's, and never an answer that came back
 * after a change was asked for (`askCurrentIdentity`).
 */
async function currentEntitlement(d: BillingDeps): Promise<Entitlement | null> {
  try {
    // The SDK serves its own cached CustomerInfo when offline, so a throw here
    // is a genuine "no answer", not merely "no network".
    const answer = await askCurrentIdentity(() => d.getCustomerInfo());
    if (!answer) return null;
    return answered(entitlementFromCustomerInfo(answer.value), answer.generation);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] entitlement refresh failed:', e);
    return null;
  }
}

/**
 * The trial in progress (roadmap D16): null when there is none, undefined
 * when RevenueCat couldn't be asked, so a caller can leave a scheduled
 * reminder alone rather than cancel it on a bad connection.
 */
export async function fetchTrialStatus(): Promise<TrialStatus | null | undefined> {
  if (!apiKeyForPlatform()) return undefined;
  const d = getDeps();
  if (!d) return undefined;
  try {
    // Never the trial of an account signed out while the read was out: no
    // reminder for a trial the person on the phone now doesn't have.
    const answer = await askCurrentIdentity(() => d.getCustomerInfo());
    return answer ? trialStatusFromCustomerInfo(answer.value) : undefined;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] trial status failed:', e);
    return undefined;
  }
}

/**
 * Which trial products this customer may still use (D62). Unknown or an error
 * reads as none: RevenueCat's advice for an unknown status is the price
 * without the offer, so the screen never promises a trial the store won't
 * give. Undefined only when the SDK seam has no check (a test fake).
 */
async function trialEligibility(
  d: BillingDeps,
  offerings: unknown,
): Promise<ReadonlySet<string> | undefined> {
  if (!d.introEligibleProducts) return undefined;
  const ids = trialProductIds(offerings);
  if (ids.length === 0) return new Set();
  try {
    return await d.introEligibleProducts(ids);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] trial eligibility failed:', e);
    return new Set();
  }
}

/** The purchasable plans. Empty when billing is unavailable or offerings fail. */
export async function fetchPlans(): Promise<PlusPlan[]> {
  if (!apiKeyForPlatform()) return [];
  const d = getDeps();
  if (!d) return [];
  // The trial check is per customer, and a plan shown must be buyable: never
  // as an account RevenueCat is still owed a log-out from.
  settleOwedLogOut();
  if (!(await identity)) return [];
  try {
    const offerings = await d.getOfferings();
    return plansFromOfferings(offerings, await trialEligibility(d, offerings));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] offerings failed:', e);
    return [];
  }
}

/** Buy a plan. The returned entitlement is whatever RevenueCat reports after. */
export async function purchasePlan(packageId: string): Promise<PurchaseResult> {
  if (!apiKeyForPlatform()) return { status: 'unavailable' };
  const d = getDeps();
  if (!d) return { status: 'unavailable' };
  // Never onto a signed-out account's customer.
  const generation = await settledIdentity();
  if (generation === null) return { status: 'unavailable' };
  try {
    // Re-reading the offering rather than holding the package object from
    // fetchPlans keeps the SDK's own object — which carries fields we don't
    // model — as the thing that actually gets purchased.
    const offerings = await d.getOfferings();
    const pkg = offerings?.current?.availablePackages?.find(
      (p) => p.identifier === packageId,
    );
    if (!pkg) return { status: 'unavailable' };
    // The under-13 rule came on while the offering loaded (no key now): the
    // store sheet isn't opened (review round 2, item 5).
    if (!apiKeyForPlatform()) return { status: 'unavailable' };
    // An identity change asked for while the offering loaded: the store sheet
    // isn't opened for an identity on its way out. Nothing has been charged,
    // which is what 'failed' says.
    if (generation !== identityGeneration) return { status: 'failed' };

    const info = await d.purchasePackage(pkg);
    if (generation !== identityGeneration) return await purchaseAfterIdentityChange(d);
    const entitlement = entitlementFromCustomerInfo(info);
    // A completed purchase that doesn't grant the entitlement means a
    // misconfigured dashboard. Report failure rather than handing back a free
    // entitlement the caller would read as success.
    if (!entitlement.is_plus) return { status: 'failed' };
    return { status: 'purchased', entitlement: answered(entitlement, generation) };
  } catch (e) {
    if (d.isCancelledError(e)) return { status: 'cancelled' };
    // eslint-disable-next-line no-console
    console.warn('[billing] purchase failed:', e);
    return { status: 'failed' };
  }
}

/**
 * A purchase that completed after an identity change was asked for (a sign-out
 * while the store sheet was up): its customer info is the old identity's, so
 * it is never handed on. What the identity the app means now owns is asked
 * instead, and Plus there (the receipt reached it) is reported as purchased.
 * Otherwise (no Plus there, or no answer) the purchase went to the account
 * that was signed in when it started, where signing in again finds it:
 * 'purchased_elsewhere', which writes nothing and says so (review round 1,
 * item 1). Never 'cancelled', which said nothing although Apple had charged,
 * nor 'failed', which says nothing was charged.
 */
async function purchaseAfterIdentityChange(d: BillingDeps): Promise<PurchaseResult> {
  const now = await currentEntitlement(d);
  return now?.is_plus ? { status: 'purchased', entitlement: now } : { status: 'purchased_elsewhere' };
}

/**
 * Restore purchases made on another device or before a reinstall. A restore
 * answered after an identity change was asked for reports what the identity
 * the app means now owns, never the old one's answer.
 */
export async function restorePurchases(): Promise<RestoreResult> {
  if (!apiKeyForPlatform()) return { status: 'unavailable' };
  const d = getDeps();
  if (!d) return { status: 'unavailable' };
  const generation = await settledIdentity();
  if (generation === null) return { status: 'unavailable' };
  try {
    const info = await d.restorePurchases();
    const entitlement =
      generation === identityGeneration
        ? answered(entitlementFromCustomerInfo(info), generation)
        : await currentEntitlement(d);
    if (!entitlement) return { status: 'failed' };
    if (!entitlement.is_plus) return { status: 'nothing_to_restore' };
    return { status: 'restored', entitlement };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] restore failed:', e);
    return { status: 'failed' };
  }
}
