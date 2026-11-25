// The daily practice reminder (roadmap step 89), removed on 2026-11-25 (the
// owner: the daily practice is now called trivia, and its reminder goes).
//
// An earlier build kept up to three of them scheduled ahead of the last
// visit, each as `calibrate-practice-<day>` with `data.kind: 'practice'`. This
// takes back any still waiting, so none fires after the update. It runs at
// every launch: cheap, idempotent, and a phone that skips a version still
// gets it. One already delivered stays in Notification Center; a tap on it
// still opens today's trivia (the scheduler's pathFor).
//
// Layer rule: L5. Reads no store; every failure is logged and swallowed, like
// the other schedulers. No permission is needed to read or cancel the app's
// own scheduled requests.

import { Platform } from 'react-native';

/** The identifier an earlier build gave each practice reminder, before its day number. */
export const PRACTICE_REMINDER_ID_PREFIX = 'calibrate-practice-';

/** A request the OS has scheduled for this app, as the clean-up reads it. */
export interface ScheduledPracticeRequest {
  identifier: string;
  content: { data?: Record<string, unknown> | null };
}

export interface PracticeReminderApi {
  getAllScheduledNotificationsAsync(): Promise<ScheduledPracticeRequest[]>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
}

function defaultApi(): PracticeReminderApi | null {
  if (Platform.OS === 'web') return null;
  // Lazy: keep Jest and the web bundle off the native module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  return {
    async getAllScheduledNotificationsAsync() {
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      return requests.map((r) => ({
        identifier: r.identifier,
        content: { data: r.content.data as Record<string, unknown> | null },
      }));
    },
    async cancelScheduledNotificationAsync(id) {
      await Notifications.cancelScheduledNotificationAsync(id);
    },
  };
}

let api: PracticeReminderApi | null | undefined;

/** Test-only: swap the notifications module (null = unsupported), or restore it. */
export function __setPracticeReminderApiForTests(next: PracticeReminderApi | null | undefined): void {
  api = next;
}

/** Whether a scheduled request is one of an earlier build's practice reminders. */
export function isPracticeReminder(request: ScheduledPracticeRequest): boolean {
  return (
    request.identifier.startsWith(PRACTICE_REMINDER_ID_PREFIX) ||
    request.content.data?.kind === 'practice'
  );
}

/**
 * Cancel every practice reminder an earlier build left scheduled, and nothing
 * else (the due-day reminders, the digest and the trial notice keep theirs).
 * Resolves how many went. Never throws.
 */
export async function cancelPracticeReminders(): Promise<number> {
  const notifications = api === undefined ? defaultApi() : api;
  if (!notifications) return 0;
  let scheduled: ScheduledPracticeRequest[];
  try {
    scheduled = await notifications.getAllScheduledNotificationsAsync();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[practice] could not read scheduled reminders:', e);
    return 0;
  }
  let cancelled = 0;
  for (const request of scheduled) {
    if (!isPracticeReminder(request)) continue;
    try {
      await notifications.cancelScheduledNotificationAsync(request.identifier);
      cancelled += 1;
    } catch (e) {
      // One that won't go doesn't keep the rest.
      // eslint-disable-next-line no-console
      console.warn('[practice] could not cancel a reminder:', e);
    }
  }
  return cancelled;
}
