// Billing startup (L5). Ties the RevenueCat SDK to the app's identity and
// keeps the local entitlement mirror honest.
//
// Same shape as notifications/digest.ts: an idempotent init() called once from
// the root layout, which reads the current store state and then subscribes for
// changes. Subscribing to a store from L5 is the sanctioned direction — the
// store knows nothing about this module.
//
// Two rules this file exists to enforce:
//
//   1. **Only the local read is awaited.** Billing is not on the path to
//      logging or resolving a prediction, so the SDK's network calls are
//      fired and forgotten. Awaiting them would hold the app's startup gate —
//      and therefore the whole first paint — behind a subsystem the user may
//      not even have a subscription in.
//   2. **A guest is anonymous, never a placeholder id.** See appUserIdFor().

import {
  configureBilling,
  isBillingAvailable,
  logOutBilling,
} from '@/billing/revenuecat';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { FREE_ENTITLEMENT } from '@/types';

let initialized = false;
let authUnsub: (() => void) | null = null;

/**
 * The RevenueCat app user id for an app user id.
 *
 * A signed-out user gets **null**, not the guest placeholder. `authStore` never
 * leaves userId null — a guest is `LOCAL_GUEST_USER_ID`, which is one shared
 * constant baked into the bundle. RevenueCat treats the app user id as the
 * account, so configuring every guest device with that string would make one
 * guest's purchase read as an active entitlement on every other guest install.
 * Null makes the SDK mint a per-install anonymous id, which logIn() later
 * aliases onto the real account when the user signs in.
 */
function appUserIdFor(userId: string | null): string | null {
  if (!userId || userId === LOCAL_GUEST_USER_ID) return null;
  return userId;
}

/** Configure for a user and pull down what they own. Swallows its own errors. */
async function syncIdentity(userId: string | null): Promise<void> {
  await configureBilling(appUserIdFor(userId));
  await usePaywallStore.getState().refreshEntitlement();
}

/**
 * Hydrate the local mirror, then (without blocking) point RevenueCat at the
 * current user and refresh what they own. Safe to call once at startup; later
 * calls are no-ops.
 */
export async function initBilling(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // The mirror first, and unconditionally: it is what gates Plus offline, in
  // Expo Go, and on web, where the SDK doesn't exist at all. This is a local
  // SQLite read and the only thing here worth awaiting.
  await useEntitlementStore.getState().hydrate();

  if (!isBillingAvailable()) {
    // eslint-disable-next-line no-console
    console.debug('[billing] SDK or API key unavailable; local mirror only');
    return;
  }

  void syncIdentity(useAuthStore.getState().userId).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn('[billing] identity sync failed:', e);
  });

  // Identity transitions, both directions.
  //
  // Sign-in: a purchase made as a guest is on an anonymous RevenueCat id;
  // logIn() moves it onto the Supabase user id so it follows the account.
  //
  // Sign-out: log the SDK out and drop the mirror to free, or the next person
  // to use this device inherits the previous account's Plus.
  authUnsub = useAuthStore.subscribe((state, prev) => {
    if (state.userId === prev.userId) return;
    const next = appUserIdFor(state.userId);
    void (async () => {
      try {
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
}

/**
 * Re-check what the user owns. Called when the app returns to the foreground —
 * the cheapest way to notice a renewal, a lapse, or a purchase made on another
 * device, none of which produce an event in this process.
 */
export async function refreshBilling(): Promise<void> {
  if (!initialized || !isBillingAvailable()) return;
  await usePaywallStore.getState().refreshEntitlement();
}

/** Test-only: drop the subscription and allow re-initialization. */
export function __resetBillingInitForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetBillingInitForTests is only allowed when NODE_ENV=test');
  }
  authUnsub?.();
  authUnsub = null;
  initialized = false;
}
