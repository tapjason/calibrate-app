import { uploadsMayStart } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Whether usage counts may go up now (owner decision 2026-11-19, D69 (b);
 * guideline 5.1.1(ii)): nothing is sent before the person has seen the line
 * about them. The root layout asks before each flush; events are still
 * queued on the phone before then, just not sent.
 *
 * - Never while the under-13 rule applies, nor on a launch still waiting for
 *   Apple's age answer (`uploadsMayStart`, roadmap D70): the flush that was
 *   held then follows the answer (src/age/localOnly.ts).
 * - Signed in: yes. The sign-in screen says what goes up with the account
 *   before the account exists (`USAGE_NOTE`), and the switch is there and in
 *   You.
 * - A guest (or auth still loading): only once the line has been shown on
 *   this phone, which `UsageStatsNotice` stamps in the settings store when
 *   it is drawn (`usageNoticeShownAt`). Read from memory: while the stored
 *   settings can't be read the stamp is held there, and Usage stats reads as
 *   off anyway.
 *
 *   A guest who finished the Warm-up on a build from before the line has no
 *   stamp, and sends nothing: the line is on the Warm-up's first screen only,
 *   which a finished Warm-up doesn't show again. Their counts stay queued.
 *   Erase and account deletion clear the stamp with the Warm-up, so after
 *   either nothing goes up until the line is shown again.
 *
 * Either way the switch decides last: `flushEvents` sends nothing while
 * Usage stats is off.
 */
export function usageCountsMayGoUp(): boolean {
  if (!uploadsMayStart()) return false;
  if (useAuthStore.getState().status === 'authenticated') return true;
  return useSettingsStore.getState().usageNoticeShownAt !== null;
}
