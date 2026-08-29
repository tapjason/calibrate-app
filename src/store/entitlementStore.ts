// Entitlement store (L4). The single place the app asks "is this user Plus?".
// Components and gated selectors read `isPlus` here — no component ever touches
// a billing SDK directly (CLAUDE.md convention).
//
// Layer note: this store holds NO billing logic. It hydrates from the local
// SQLite mirror (L2) and, in L5, the RevenueCat integration calls
// setEntitlement() to push the server-verified truth in. The dependency arrow
// points L5 → L4, never the reverse — same shape as the notification services
// subscribing to settingsStore.
//
// Cardinal rule (CLAUDE.md): absence or any error defaults to FREE, never Plus.

import { create } from 'zustand';

import { getEntitlement, upsertEntitlement } from '@/db/entitlements';
import { FREE_ENTITLEMENT, type Entitlement } from '@/types';

interface EntitlementState {
  /** Last-known entitlement, mirrored from RevenueCat. Starts FREE. */
  entitlement: Entitlement;
  /** Derived convenience flag kept in sync with `entitlement.is_plus`. */
  isPlus: boolean;
  /** True once hydrate() has run (whether or not a row existed). */
  hydrated: boolean;
  /** Load the mirrored entitlement from SQLite. Safe to call once at startup. */
  hydrate: () => Promise<void>;
  /** Push a new entitlement (from RevenueCat in L5); updates memory + mirror. */
  setEntitlement: (e: Entitlement) => Promise<void>;
}

export const useEntitlementStore = create<EntitlementState>((set) => ({
  entitlement: FREE_ENTITLEMENT,
  isPlus: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const e = await getEntitlement(); // never null — resolves to FREE if absent
      set({ entitlement: e, isPlus: e.is_plus });
    } catch (err) {
      // Fail to free — a read error must never grant Plus or block startup.
      set({ entitlement: FREE_ENTITLEMENT, isPlus: false });
      // eslint-disable-next-line no-console
      console.warn('[entitlement] hydrate failed; defaulting to free:', err);
    } finally {
      set({ hydrated: true });
    }
  },

  setEntitlement: async (e) => {
    // Update memory first so gating reacts immediately, then persist the mirror.
    set({ entitlement: e, isPlus: e.is_plus });
    try {
      await upsertEntitlement(e);
    } catch (err) {
      // The mirror is non-critical: RevenueCat remains the source of truth and
      // the in-memory value still gates this session. A failed write just means
      // the next cold start re-reads a stale (safe: free-or-older) mirror.
      // eslint-disable-next-line no-console
      console.warn('[entitlement] persist failed:', err);
    }
  },
}));
