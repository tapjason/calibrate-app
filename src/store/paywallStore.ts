// Paywall store (L4). Owns the purchase flow's state and is the one place
// that orchestrates billing.
//
// Layer note: like authStore → @/supabase and coachStore → @/ai/coach, this
// store calls an L5 service and holds none of its logic. The split matters
// here specifically: entitlementStore must stay a dumb, always-safe mirror of
// "is this user Plus?", so the SDK calls, the plan list, and the in-flight
// purchase state live in this store instead, and the only thing that crosses
// over is a finished Entitlement pushed through setEntitlement().
//
// Nothing in the app blocks on this store. The core loop and every shareable
// artifact are free (CLAUDE.md), so a paywall that can't load its plans
// degrades to a screen that says so — never to a broken app.

import { create } from 'zustand';

import {
  fetchEntitlement,
  fetchPlans,
  isBillingAvailable,
  purchasePlan,
  restorePurchases,
  type PlusPlan,
} from '@/billing/revenuecat';

import { useEntitlementStore } from './entitlementStore';

/** What the paywall should tell the user after an action. */
export type PaywallNotice =
  | null
  | 'purchased'
  | 'restored'
  | 'nothing_to_restore'
  | 'unavailable'
  | 'failed';

interface PaywallState {
  /** Purchasable plans, annual first. Empty until loadPlans() succeeds. */
  plans: PlusPlan[];
  /** True while offerings are being fetched. */
  loadingPlans: boolean;
  /** packageId of the purchase in flight, or null. Disables the buttons. */
  purchasing: string | null;
  /** True while a restore is in flight. */
  restoring: boolean;
  /**
   * Outcome of the last action, for the screen to render. A user cancelling
   * the store sheet clears it — backing out is not an error and must not
   * leave a message on screen.
   */
  notice: PaywallNotice;
  /** False when the build has no billing SDK or no API key configured. */
  available: boolean;

  loadPlans: () => Promise<void>;
  /** Buy a plan. Returns true when the user is Plus afterwards. */
  purchase: (packageId: string) => Promise<boolean>;
  /** Restore prior purchases. Returns true when the user is Plus afterwards. */
  restore: () => Promise<boolean>;
  /**
   * Ask RevenueCat what this user owns and push it into entitlementStore.
   * Called at startup and after sign-in — it is what catches a subscription
   * that lapsed, was refunded, or was bought on another device.
   */
  refreshEntitlement: () => Promise<void>;
  clearNotice: () => void;
  reset: () => void;
}

const INITIAL = {
  plans: [] as PlusPlan[],
  loadingPlans: false,
  purchasing: null as string | null,
  restoring: false,
  notice: null as PaywallNotice,
  available: true,
};

export const usePaywallStore = create<PaywallState>((set) => ({
  ...INITIAL,

  loadPlans: async () => {
    set({ loadingPlans: true });
    const available = isBillingAvailable();
    if (!available) {
      // Expo Go, web, or a build with no API key. Calling into the SDK from
      // here would just log the same warning again.
      set({ ...INITIAL, available: false });
      return;
    }
    const plans = await fetchPlans(); // never throws; [] on any failure
    // No notice on an empty offering. `notice` reports the outcome of
    // something the user *did*; the screen renders its own unavailable line
    // from an empty plan list, and setting both stacked the same sentence
    // twice.
    set({ plans, loadingPlans: false, available: true });
  },

  purchase: async (packageId) => {
    set({ purchasing: packageId, notice: null });
    const result = await purchasePlan(packageId);

    if (result.status === 'purchased') {
      // Push the entitlement before clearing the in-flight flag so the screen
      // never repaints as "free, idle" for a frame between the two.
      await useEntitlementStore.getState().setEntitlement(result.entitlement);
      set({ purchasing: null, notice: 'purchased' });
      return true;
    }

    // 'cancelled' leaves no notice: the user chose to back out.
    set({
      purchasing: null,
      notice: result.status === 'cancelled' ? null : result.status,
    });
    return false;
  },

  restore: async () => {
    set({ restoring: true, notice: null });
    const result = await restorePurchases();

    if (result.status === 'restored') {
      await useEntitlementStore.getState().setEntitlement(result.entitlement);
      set({ restoring: false, notice: 'restored' });
      return true;
    }

    set({ restoring: false, notice: result.status });
    return false;
  },

  refreshEntitlement: async () => {
    if (!isBillingAvailable()) {
      // No SDK to ask. Leave the local mirror alone rather than downgrading —
      // entitlementStore.hydrate() already expires a stale one on its own, and
      // an Expo Go session must not wipe a real subscriber's mirror.
      set({ available: false });
      return;
    }
    // null means "couldn't find out", not "free" — see fetchEntitlement. Only
    // an actual answer overwrites the mirror; a refund or a lapse comes back
    // as a real free entitlement and does downgrade it.
    const entitlement = await fetchEntitlement();
    if (!entitlement) return;
    await useEntitlementStore.getState().setEntitlement(entitlement);
  },

  clearNotice: () => set({ notice: null }),

  reset: () => set({ ...INITIAL }),
}));
