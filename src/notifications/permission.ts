// Notification permission, asked in context (roadmap step 38).
//
// Launch only checks (scheduler.ts and digest.ts each read the current answer
// and stay quiet without a grant). The system alert is shown here, when the
// user taps "Turn on reminders" on Home or "Allow reminders" in Settings: HIG
// asks apps to "wait to request permission until people actually use an app
// feature that requires access", and on a first run a launch-time alert lands
// on top of the Warmup. On a yes, both services start at once.
//
// Layer: L5. Screens call it directly, like any service action; it fails to
// the current state rather than throwing.

import { activateDigest } from './digest';
import {
  reminderPermission,
  requestReminderPermission,
  type ReminderPermission,
} from './scheduler';

export { reminderPermission, type ReminderPermission };

/** Show the system alert; on a yes, start reminders and the weekly digest. */
export async function askForReminders(): Promise<ReminderPermission> {
  const result = await requestReminderPermission();
  if (result === 'granted') {
    await activateDigest().catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[digest] start failed:', e);
    });
  }
  return result;
}
