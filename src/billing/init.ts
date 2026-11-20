// Billing startup (L5). Ties the RevenueCat SDK to the app's identity and
// keeps the local entitlement mirror honest.
//
// Same shape as notifications/digest.ts: an idempotent init() called once from
// the root layout, which reads the current store state and then subscribes for
// changes. Subscribing to a store from L5 is the sanctioned direction — the
// store knows nothing about this module.
//
// Three rules this file exists to enforce:
//
//   1. **Only the local read is awaited.** Billing is not on the path to
//      logging or resolving a prediction, so the SDK's network calls are
//      fired and forgotten. Awaiting them would hold the app's startup gate —
//      and therefore the whole first paint — behind a subsystem the user may
//      not even have a subscription in.
//   2. **A guest is anonymous, never a placeholder id.** See appUserIdFor().
//   3. **Never configured on a local-only phone, nor while Apple's answer is
//      pending on a launch that asks** (the under-13 rule, roadmap D70, the
//      main session's call 2), with no cap anywhere. Configuring makes a
//      per-install anonymous RevenueCat record, so a child's first launch
//      would otherwise make one before the band arrives. RevenueCat starts
//      once uploads may start (`uploadsMayStart`: the age store is settled
//      and the phone isn't local-only): at once where the question isn't
//      waited for (web, Jest, Android, iOS before 26, a stored band of 13 or
//      over, whose ask runs in the background), exactly when it did before;
//      after the answer on a launch that asks; and once, on a lift, if the
//      rule comes off in a long run. The paywall waits at most 5 s for the
//      answer (`ensureBillingStarted`) and, with it still pending, starts
//      nothing: it shows that the plans couldn't load, and opening it again
//      once the answer is in works. A local entitlement mirror already on the
//      phone is left as it is: the rule doesn't take away a Plus mirror.

import {
  configureBilling,
  isBillingAvailable,
  isStaleEntitlement,
  logOutBilling,
  settleOwedLogOut,
} from '@/billing/revenuecat';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import {
  AGE_ANSWER_WAIT_MS,
  isLocalOnly,
  uploadsMayStart,
  useAgeStore,
  whenAgeSettled,
} from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { setStaleEntitlementCheck, useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { FREE_ENTITLEMENT } from '@/types';

let initialized = false;
/** RevenueCat has been started for this run (configure called once). */
let started = false;
/** The configure call of the latest identity sync, for `ensureBillingStarted`. */
let configuring: Promise<boolean> | null = null;
let authUnsub: (() => void) | null = null;
let ageUnsub: (() => void) | null = null;
let warnedUnavailable = false;

/**
 * The RevenueCat app user id for an app user id.
 *
 * A signed-out user gets **null**, not the guest placeholder. `authStore` never
 * leaves userId null — a guest is `LOCAL_GUEST_USER_ID`, which is one shared
 * constant baked into the bundle. RevenueCat treats the app user id as the
 * account, so configuring every guest device with that string would make one
 * guest's purchase read as an active entitlement on every other guest install.
 * Null gives the install's own anonymous id, which logIn() later aliases onto
 * the real account when the user signs in; an account id RevenueCat still
 * holds from a sign-out it never heard of is logged out first
 * (`configureBilling`).
 */
function appUserIdFor(userId: string | null): string | null {
  if (!userId || userId === LOCAL_GUEST_USER_ID) return null;
  return userId;
}

/** Configure for a user and pull down what they own. Swallows its own errors. */
async function syncIdentity(userId: string | null): Promise<void> {
  const configure = configureBilling(appUserIdFor(userId));
  configuring = configure;
  await configure;
  await usePaywallStore.getState().refreshEntitlement();
}

/**
 * Start RevenueCat for this run, once: configure for the current user and
 * refresh what they own, without waiting. Only after `initBilling` has read
 * the mirror, only once uploads may start (never on a local-only phone, never
 * while Apple's answer is pending on a launch that asks), and only on a build
 * with the SDK and a key. True when RevenueCat is started (now or before).
 *
 * Already started (the rule lifting in a long run, or the paywall opening): a
 * sign-out RevenueCat missed while the rule kept billing off is told now,
 * before anything reads or buys (`settleOwedLogOut`, review round 1, item 2;
 * every read, purchase and restore also waits for it).
 */
function startBilling(): boolean {
  if (started) {
    if (!isLocalOnly()) settleOwedLogOut();
    return true;
  }
  if (!initialized || isLocalOnly() || !uploadsMayStart()) return false;
  if (!isBillingAvailable()) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      // eslint-disable-next-line no-console
      console.debug('[billing] SDK or API key unavailable; local mirror only');
    }
    return false;
  }
  started = true;
  void syncIdentity(useAuthStore.getState().userId).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn('[billing] identity sync failed:', e);
  });
  return true;
}

/**
 * Hydrate the local mirror, then (without blocking) point RevenueCat at the
 * current user and refresh what they own: at once where Apple isn't being
 * asked, else once the age store is settled, and never while the phone is
 * local-only. Safe to call once at startup; later calls are no-ops.
 */
export async function initBilling(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // An answer RevenueCat gives for an identity the app has since left (a read
  // or purchase still out when a sign-out came) never reaches the store or
  // the mirror (step 207): the store asks this right before every write.
  setStaleEntitlementCheck(isStaleEntitlement);

  // The mirror first, and unconditionally: it is what gates Plus offline, in
  // Expo Go, and on web, where the SDK doesn't exist at all. This is a local
  // SQLite read and the only thing here worth awaiting.
  await useEntitlementStore.getState().hydrate();

  // Identity transitions, both directions.
  //
  // Sign-in: a purchase made as a guest is on an anonymous RevenueCat id;
  // logIn() moves it onto the Supabase user id so it follows the account.
  //
  // Sign-out: log the SDK out and drop the mirror to free, or the next person
  // to use this device inherits the previous account's Plus. Before RevenueCat
  // has started (a local-only phone, Apple not yet answered, or no SDK or key
  // on this build) only the mirror drops, a local write that sends nothing:
  // an account frozen by the rule that signs out leaves no Plus behind, and
  // neither does one signing out before billing could start, if RevenueCat
  // then can't be reached (`fetchEntitlement`'s null never overwrites the
  // mirror). A start later configures whoever is signed in then; with no one
  // signed in, `configureBilling(null)` logs out the account the SDK still
  // has cached from that sign-out (or from one in an earlier run) before
  // anything reads entitlements or buys (review round 2, item 1). After it
  // started, with the rule on since, `logOutBilling` can't reach RevenueCat:
  // the log-out is owed and told once billing is usable again, before any
  // read or purchase (`settleOwedLogOut`, review round 1, item 2).
  //
  // Each transition reaches `configureBilling` or `logOutBilling` in this
  // listener's synchronous run, so an answer still out for the identity being
  // left is stale from the moment the userId changes, and is dropped whenever
  // it comes back (step 207, `identityGeneration` in revenuecat.ts).
  authUnsub = useAuthStore.subscribe((state, prev) => {
    if (state.userId === prev.userId) return;
    const next = appUserIdFor(state.userId);
    void (async () => {
      try {
        if (!started) {
          if (next === null) {
            await useEntitlementStore.getState().setEntitlement(FREE_ENTITLEMENT);
          }
          return;
        }
        if (next === null) {
          await logOutBilling();
          await useEntitlementStore.getState().setEntitlement(FREE_ENTITLEMENT);
          return;
        }
        await syncIdentity(state.userId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[billing] identity transition failed:', e);
      }
    })();
  });

  // Apple's answer on a launch that asks, or the rule lifting in a long run:
  // RevenueCat starts the first time uploads may start (settled, not
  // local-only), and only once.
  ageUnsub = useAgeStore.subscribe(() => {
    if (uploadsMayStart()) startBilling();
  });

  // Where the question isn't asked, exactly as before: now.
  if (uploadsMayStart()) startBilling();
}

/**
 * For the paywall: make sure RevenueCat has started before plans load. On a
 * launch still waiting for Apple's answer, waits for it at most `maxWaitMs`
 * (5 s); if the answer is still pending then, starts nothing and resolves
 * false (a cold-start deep link to the paywall starts this wait before Apple's
 * sheet has been read, so going on would make a RevenueCat record for a child
 * who takes longer). The paywall then says the plans couldn't load; opening it
 * again once the answer is in starts RevenueCat, which also starts on its own
 * the moment uploads may start (`initBilling`'s age subscription,
 * src/age/localOnly.ts). Never on a local-only phone. Waits for the configure
 * call itself. Resolves true when RevenueCat is configured, false when it
 * isn't (local-only, the answer pending, no SDK or key, a configure that
 * failed). Never rejects.
 */
export async function ensureBillingStarted(maxWaitMs: number = AGE_ANSWER_WAIT_MS): Promise<boolean> {
  try {
    if (!initialized) await initBilling();
    if (isLocalOnly()) return false;
    if (!useAgeStore.getState().settled) await whenAgeSettled(maxWaitMs);
    // `startBilling` refuses while the answer is pending or the rule applies.
    if (!startBilling()) return false;
    return (await configuring) ?? false;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[billing] could not start billing:', e);
    return false;
  }
}

/**
 * Re-check what the user owns. Called when the app returns to the foreground —
 * the cheapest way to notice a renewal, a lapse, or a purchase made on another
 * device, none of which produce an event in this process. Nothing before
 * RevenueCat has started, and nothing on a local-only phone.
 */
export async function refreshBilling(): Promise<void> {
  if (!initialized || !started || isLocalOnly() || !isBillingAvailable()) return;
  await usePaywallStore.getState().refreshEntitlement();
}

/** Test-only: drop the subscriptions and allow re-initialization. */
export function __resetBillingInitForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetBillingInitForTests is only allowed when NODE_ENV=test');
  }
  authUnsub?.();
  authUnsub = null;
  ageUnsub?.();
  ageUnsub = null;
  setStaleEntitlementCheck(null);
  initialized = false;
  started = false;
  configuring = null;
  warnedUnavailable = false;
}
