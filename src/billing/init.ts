// Billing startup (L5). Ties the RevenueCat SDK to the app's identity and
// keeps the local entitlement mirror honest.
//
// Same shape as notifications/digest.ts: an idempotent init() called once from
// the root layout, which reads the current store state and then subscribes for
// changes. Subscribing to a store from L5 is the sanctioned direction — the
// store knows nothing about this module.
//
// Everything here is fire-and-forget. Billing is not on the path to logging or
// resolving a prediction, so a failure logs and leaves the user on the free
// tier, which is a fully working app.

import { configureBilling, isBillingAvailable } from '@/billing/revenuecat';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';

let initialized = false;
let authUnsub: (() => void) | null = null;

/**
 * Hydrate the local mirror, point RevenueCat at the current user, and refresh
 * what they own. Safe to call once at startup; later calls are no-ops.
 */
export async function initBilling(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // The mirror first, and unconditionally: it is what gates Plus offline, in
  // Expo Go, and on web, where the SDK doesn't exist at all.
  await useEntitlementStore.getState().hydrate();

  if (!isBillingAvailable()) {
    // eslint-disable-next-line no-console
    console.debug('[billing] SDK or API key unavailable; local mirror only');
    return;
  }

  await configureBilling(useAuthStore.getState().userId);
  await usePaywallStore.getState().refreshEntitlement();

  // Sign-in handoff. A purchase made as a guest is attached to an anonymous
  // RevenueCat id; logging in moves it onto the Supabase user id so it follows
  // the account to the next device.
  authUnsub = useAuthStore.subscribe((state, prev) => {
    if (state.userId === prev.userId || !state.userId) return;
    void (async () => {
      await configureBilling(state.userId);
      await usePaywallStore.getState().refreshEntitlement();
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
