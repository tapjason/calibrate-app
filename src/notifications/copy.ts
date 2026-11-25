// Notification wording, in one place (DESIGN_SYSTEM §7.15).
//
// Rules from Apple's HIG (Notifications, Managing notifications):
// - short title-style titles with no ending punctuation, sentence-case bodies;
// - no instructions ("Tap to…") and no app name;
// - a generic placeholder for people who hide previews, since a prediction
//   title can be about health or money;
// - an interruption level that matches the real urgency;
// - never the streak: it counts resolutions, and a notification that nags
//   about it is the guilt the design avoids.

import { dateLocale, localTime } from '@/constants/locale';
import type { PracticeReminderTime } from '@/store/settingsStore';

/** Registered once at init so iOS can show the placeholder for hidden previews. */
export const REMINDER_CATEGORY = 'calibrate-resolution-reminder';
export const DIGEST_CATEGORY = 'calibrate-weekly-digest';

/**
 * Foreground actions on the resolution reminder (roadmap D8). Tapping one
 * opens the app straight into the resolved state. "Can't tell" stays an
 * in-app choice: a notification has no room to explain that it won't count.
 * `opensAppToForeground` is true on purpose. A background action is not
 * guaranteed to reach JS on iOS when the app is killed (expo#36282).
 */
export const REMINDER_ACTION_HAPPENED = 'happened';
export const REMINDER_ACTION_DIDNT = 'didnt';

export const REMINDER_ACTIONS: {
  identifier: string;
  buttonTitle: string;
  options: { opensAppToForeground: true };
}[] = [
  {
    identifier: REMINDER_ACTION_HAPPENED,
    buttonTitle: 'Happened',
    options: { opensAppToForeground: true },
  },
  {
    identifier: REMINDER_ACTION_DIDNT,
    buttonTitle: "Didn't",
    options: { opensAppToForeground: true },
  },
];

export const REMINDER_PLACEHOLDER = 'A prediction is ready to answer';
export const DIGEST_PLACEHOLDER = 'Weekly check-in';

export const REMINDER_TITLE = 'Did it happen';
export const DIGEST_TITLE = 'Your week ahead';

/**
 * The reminder's body, never with the words (roadmap D60 (b); every reminder
 * since 2026-11-25): "Your prediction from Nov 6 · You said 70%". The day it
 * was made and the number are enough to tell which one it is, and nothing
 * written shows on the lock screen. The stated confidence is in it so that
 * someone who opens it from the notification still sees what they said before
 * they know the outcome (hindsight bias; DESIGN_SYSTEM §7.10).
 */
export function reminderBodyWithoutWords(createdIso: string, confidence: number): string {
  const made = new Date(createdIso);
  const day = Number.isNaN(made.getTime())
    ? null
    : made.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' });
  return `${day ? `Your prediction from ${day}` : 'Your prediction'} · You said ${confidence}%`;
}

/**
 * "8:00 AM", in the phone's own clock style: the due-day reminders' and the
 * digest's times in You (D38).
 */
export function reminderTimeLabel(time: PracticeReminderTime): string {
  return localTime(new Date(2000, 0, 1, time.hour, time.minute), {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The weekly digest. A leisure read — sent at the passive level. */
export function digestBody(pendingCount: number): string {
  if (pendingCount === 0) {
    return 'No open predictions. What do you think will happen this week?';
  }
  if (pendingCount === 1) return '1 prediction is open.';
  return `${pendingCount} predictions are open.`;
}
