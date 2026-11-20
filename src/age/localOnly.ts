// Entering and leaving the under-13 rule (L5; roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md).
//
// Every upload path checks the rule itself (`isLocalOnly`, `uploadsMayStart`
// in src/store/ageStore.ts), so nothing here is what keeps data on the phone.
// This module does the housekeeping around the moments the rule changes:
//
//   Entering (the rule comes on, or is already on at launch):
//     - the queued usage counts are cleared (`clearEvents`): what was queued
//       before Apple's answer never goes up, even if the rule lifts later;
//     - the stamp saying the line about usage counts was shown is forgotten
//       (`forgetUsageNoticeShown`), once the settings have been read (a write
//       before then would store the defaults over the person's record), so a
//       guest's counts don't go up after a lift until the line is shown again;
//     - the session's background token refresh stops (`pauseSessionRefresh`);
//     - the Coach's cards and last answer are dropped.
//   Leaving (Apple's answer lifts it in a long run):
//     - a signed-in account syncs (`syncForUser`; it waits for Apple's answer
//       if that isn't in yet).
//   Uploads may start (settled and not local-only, after either a lift or
//   Apple's answer on a launch that asked):
//     - the session's refresh starts (`resumeSessionRefresh`): a client made
//       before this moment was made with it off (src/supabase/client.ts), and
//       the first tick refreshes a session that expired meanwhile;
//     - the usage counts flush, if they may (`flushEvents` checks Usage stats
//       and, for a guest, that the line was shown);
//     - RevenueCat starts, once (`ensureBillingStarted`; src/billing/init.ts
//       also starts it on its own).
//
// Rows on the phone are never touched: an account signed in when the rule
// comes on is frozen, not signed out (call 3).
//
// Layer rule: L5. Reads the age, auth and settings stores, and calls the
// analytics queue (L2), the analytics flush, the auth service's refresh pause
// and billing's start. The Coach store is required lazily: coachStore →
// analytics/track → authStore would otherwise make a require cycle at load.
// Never logs a band.

import { flushEvents } from '@/analytics/flush';
import { ensureBillingStarted } from '@/billing/init';
import { clearEvents } from '@/db/analytics';
import { useAgeStore } from '@/store/ageStore';
import { syncForUser, useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { pauseSessionRefresh, resumeSessionRefresh } from '@/supabase/auth';

let initialized = false;
let ageUnsub: (() => void) | null = null;
/** Waiting for the settings to be read, to forget the usage-notice stamp. */
let settingsUnsub: (() => void) | null = null;

/** An error for the log: its message only. */
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'unknown error';
}

/** Run one step; a step that throws or rejects is logged and the rest go on. */
function step(name: string, run: () => unknown): void {
  try {
    const result = run();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(undefined, (e: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(`[local-only] ${name} failed:`, messageOf(e));
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[local-only] ${name} failed:`, messageOf(e));
  }
}

function stopWaitingForSettings(): void {
  const unsub = settingsUnsub;
  settingsUnsub = null;
  try {
    unsub?.();
  } catch {
    // Nothing to keep.
  }
}

/** Forget the usage-notice stamp, once the settings have been read. */
function forgetUsageNoticeWhenRead(): Promise<boolean> | undefined {
  const settings = useSettingsStore.getState();
  if (settings.hydrated) {
    return settings.usageNoticeShownAt !== null ? settings.forgetUsageNoticeShown() : undefined;
  }
  if (settingsUnsub) return undefined;
  settingsUnsub = useSettingsStore.subscribe((state) => {
    if (!state.hydrated) return;
    stopWaitingForSettings();
    // Only if the rule still applies once they are read.
    if (!useAgeStore.getState().localOnly) return;
    step('forgetting the usage line', () =>
      state.usageNoticeShownAt !== null ? state.forgetUsageNoticeShown() : undefined,
    );
  });
  return undefined;
}

function enter(): void {
  step('clearing the usage counts', () => clearEvents());
  step('forgetting the usage line', () => forgetUsageNoticeWhenRead());
  step('stopping the session refresh', () => pauseSessionRefresh());
  step('clearing the Coach', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useCoachStore } = require('@/store/coachStore') as typeof import('@/store/coachStore');
    useCoachStore.getState().reset();
  });
}

function leave(): void {
  stopWaitingForSettings();
  step('syncing', () => {
    const { status, userId } = useAuthStore.getState();
    return status === 'authenticated' && userId ? syncForUser(userId) : undefined;
  });
}

function uploadsStart(): void {
  // Not on leaving alone: a lift that comes before Apple has settled would
  // start the timer while the answer is still pending.
  step('starting the session refresh', () => resumeSessionRefresh());
  step('flushing the usage counts', () => flushEvents(useAuthStore.getState().userId));
  step('starting billing', () => ensureBillingStarted(0));
}

/**
 * Follow the age store for the rest of the run: the housekeeping above when
 * the rule comes on or off, and the deferred uploads once they may start. Does
 * the entering work at once when the rule is already on (a stored under-13
 * band, read by `hydrateAgeGate` just before). Call once at launch, right
 * after `hydrateAgeGate()` (app/_layout.tsx). Idempotent (a second call does
 * nothing), never throws, and none of its steps rejects into a caller.
 */
export function initLocalOnly(): void {
  if (initialized) return;
  initialized = true;
  try {
    ageUnsub = useAgeStore.subscribe((state, prev) => {
      if (state.localOnly && !prev.localOnly) enter();
      else if (!state.localOnly && prev.localOnly) leave();
      const may = state.settled && !state.localOnly;
      const mayBefore = prev.settled && !prev.localOnly;
      if (may && !mayBefore) uploadsStart();
    });
    if (useAgeStore.getState().localOnly) enter();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[local-only] could not follow the age range:', messageOf(e));
  }
}

/** Test-only: stop following the age store and allow `initLocalOnly` again. */
export function __resetLocalOnlyForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetLocalOnlyForTests is only allowed when NODE_ENV=test');
  }
  try {
    ageUnsub?.();
  } catch {
    // Nothing to keep.
  }
  ageUnsub = null;
  stopWaitingForSettings();
  initialized = false;
}
