import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { UsageStatsSwitch } from '@/components/settings/UsageStatsSwitch';
import { APP_NAME } from '@/constants/app';
import { space } from '@/constants/theme';
import { useAgeStore } from '@/store/ageStore';
import { useLockStore } from '@/store/lockStore';
import { useSettingsStore, usageStatsStartOffHere } from '@/store/settingsStore';

/**
 * What the Warm-up's first screen says about usage counts (D69 (b)), with
 * what they're for (policy re-audit L1, 2026-11-19: consent asked without the
 * purpose isn't informed).
 */
export const WARMUP_USAGE_NOTE = `${APP_NAME} sends a few usage counts, with no account or device id, to see how the app is used. You can turn this off here or in You.`;

/**
 * The same line while Usage stats are off on a phone whose region starts them
 * off, Canada (owner, 2026-11-19: Quebec's law asks for the most private
 * setting by default). It doesn't say counts are being sent: none are until
 * the person turns the switch on, and then `WARMUP_USAGE_NOTE` is true again
 * and shown instead.
 */
export const WARMUP_USAGE_OFF_NOTE = `${APP_NAME} can send a few usage counts, with no account or device id, to see how the app is used. They’re off until you turn them on, here or in You.`;

/**
 * The line about usage counts on the Warm-up's first screen, with the same
 * Usage stats switch as You (owner decision 2026-11-19, D69 (b); guideline
 * 5.1.1(ii) asks for consent "even if … anonymous"). Nothing is sent before
 * it has been seen (`usageCountsMayGoUp`): drawn, it stamps when it was first
 * shown in the settings store (`markUsageNoticeShown`, kept across launches;
 * a second showing changes nothing). Not while the app lock covers it (D64):
 * drawn under the lock screen it hasn't been seen, so the stamp waits for the
 * unlock.
 *
 * The under-13 rule (roadmap D70): not drawn on a local-only phone, where no
 * count is ever sent, so the line would be untrue. On a launch still waiting
 * for Apple's age answer it is drawn, but the stamp waits for the answer
 * (`uploadsMayStart`): a band that turns the rule on takes the line away
 * before it can let anything go up.
 *
 * The line and the switch are `UsageStatsSwitch`, shared with the sign-in
 * screen so the two can't drift.
 *
 * On a phone whose region is Canada, Usage stats start off until the person
 * turns them on (owner, 2026-11-19), and while they are off the line says so
 * (`WARMUP_USAGE_OFF_NOTE`). The stamp is written all the same: it records
 * that the line was shown, and nothing goes up there until the switch is on
 * as well. Everywhere else the line is the same in both states, as before.
 */
export function UsageStatsNotice() {
  const markShown = useSettingsStore((s) => s.markUsageNoticeShown);
  const locked = useLockStore((s) => s.locked);
  const localOnly = useAgeStore((s) => s.localOnly);
  const settled = useAgeStore((s) => s.settled);

  // Once seen: on the first frame, or at the unlock if it was drawn under the
  // lock screen, and only once uploads may start. The store keeps the first
  // stamp, so this writes once.
  useEffect(() => {
    if (!locked && settled && !localOnly) void markShown();
  }, [locked, settled, localOnly, markShown]);

  if (localOnly) return null;

  // Read once per launch, like the region it comes from.
  const noteOff = usageStatsStartOffHere() ? WARMUP_USAGE_OFF_NOTE : WARMUP_USAGE_NOTE;

  return (
    <View style={styles.wrap}>
      <UsageStatsSwitch noteOn={WARMUP_USAGE_NOTE} noteOff={noteOff} testID="warmup-usage" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.sm },
});
