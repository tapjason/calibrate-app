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

/** Registered once at init so iOS can show the placeholder for hidden previews. */
export const REMINDER_CATEGORY = 'calibrate-resolution-reminder';
export const DIGEST_CATEGORY = 'calibrate-weekly-digest';

export const REMINDER_PLACEHOLDER = 'A prediction is ready to resolve';
export const DIGEST_PLACEHOLDER = 'Weekly check-in';

export const REMINDER_TITLE = 'Did it happen';
export const DIGEST_TITLE = 'Your week ahead';

const MAX_BODY = 80;

/**
 * "{title} · You said 70%". The stated confidence is in the reminder so that
 * someone who answers from the notification still sees what they said before
 * they know the outcome (hindsight bias; DESIGN_SYSTEM §7.10). The title is
 * trimmed so the whole body stays within MAX_BODY.
 */
export function reminderBody(title: string, confidence: number): string {
  const suffix = ` · You said ${confidence}%`;
  const room = MAX_BODY - suffix.length;
  const head = title.length <= room ? title : title.slice(0, room - 1).trimEnd() + '…';
  return head + suffix;
}

/** The Sunday digest. A leisure read — sent at the passive level. */
export function digestBody(pendingCount: number): string {
  if (pendingCount === 0) {
    return 'No open predictions. What do you think will happen this week?';
  }
  if (pendingCount === 1) return '1 prediction is open.';
  return `${pendingCount} predictions are open.`;
}
