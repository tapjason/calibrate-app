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

/**
 * Whether a mirrored entitlement is still good at `now`.
 *
 * The mirror is only refreshed when RevenueCat can be reached, so without this
 * an expired annual plan would keep granting Plus forever to a device that
 * never comes back online. A null `expires_at` means lifetime (or a plan the
 * store reports as non-expiring) and never lapses; an unparseable date is
 * treated as expired, because the cardinal rule is that ambiguity resolves to
 * free.
 */
export function isEntitlementActive(e: Entitlement, now: Date = new Date()): boolean {
  if (!e.is_plus) return false;
  if (e.expires_at === null) return true;
  const expiry = Date.parse(e.expires_at);
  if (Number.isNaN(expiry)) return false;
  return expiry > now.getTime();
}

export const useEntitlementStore = create<EntitlementState>((set) => ({
  entitlement: FREE_ENTITLEMENT,
  isPlus: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const e = await getEntitlement(); // never null — resolves to FREE if absent
      // A lapsed mirror is not Plus. The row is left on disk as-is: a refresh
      // from RevenueCat is what corrects it, and rewriting it here would just
      // guess at a source of truth this layer doesn't have.
      set({ entitlement: e, isPlus: isEntitlementActive(e) });
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
    // Update memory first so gating reacts immediately, then persist the
    // mirror.
    //
    // No expiry check here, deliberately. What arrives through this action is
    // a fresh answer from RevenueCat, which knows things the local clock does
    // not — a billing grace period, a promotional grant, a device whose clock
    // is simply wrong. Re-deciding it here would also let memory and the
    // persisted row disagree: the mirror would say is_plus while gating said
    // free. The clock only gets a vote in hydrate(), where there is nothing
    // fresher to trust.
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
