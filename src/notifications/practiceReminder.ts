// The daily practice reminder (roadmap step 89).
//
// Off until the person picks a moment in their day. The choices are moments
// as well as times ("With coffee · 8:00 AM"): an implementation intention,
// "when X, I'll do Y", roughly doubles follow-through over a bare intention
// (Gollwitzer & Sheeran 2006, d = 0.65; research/retention-2026-10.md §2.4).
//
// What it sends, and what it never does:
//   - One a day at the chosen time, only on a day whose practice isn't done.
//   - A different title each day, and the day's first question as the body:
//     Duolingo found reminders wear out when they repeat (Yancey & Settles
//     2020: always reusing the last template scored 0.5% worse than picking
//     at random), and a real question is new every day by construction.
//   - At most three days ahead of the last time the app was open. Someone who
//     stops opening it gets three, then silence, not a daily nag.
//   - Never the streak, never a loss ("don't lose…"), no instructions
//     (DESIGN_SYSTEM §7.15). Follows the single Notifications switch.
//
// Layer rule: L5. Reads settingsStore and practiceStore (L4), never the
// reverse; every failure is logged and swallowed, like the other schedulers.

import { AppState, Platform } from 'react-native';

import { track } from '@/analytics/track';
import { usePracticeStore } from '@/store/practiceStore';
import { useSettingsStore, type PracticeReminderTime } from '@/store/settingsStore';
import type { PracticeQuestion } from '@/types';

import { askForReminders, reminderPermission, type ReminderPermission } from './permission';

export const PRACTICE_REMINDER_CATEGORY = 'calibrate-practice-reminder';
/** Hidden-preview text. */
export const PRACTICE_REMINDER_PLACEHOLDER = 'Daily practice';
/** Days ahead of the last visit that reminders are kept scheduled. */
export const PRACTICE_REMINDER_DAYS_AHEAD = 3;

/** The moments on offer, as cues in a day rather than bare clock times. */
export const PRACTICE_REMINDER_MOMENTS: readonly ({ id: string; label: string } & PracticeReminderTime)[] = [
  { id: 'coffee', label: 'With coffee', hour: 8, minute: 0 },
  { id: 'lunch', label: 'At lunch', hour: 12, minute: 30 },
  { id: 'dinner', label: 'After dinner', hour: 20, minute: 30 },
];

/** Title-style, no ending punctuation, never the same two days running. */
export const PRACTICE_REMINDER_TITLES = [
  'Today’s three',
  'Three new questions',
  'A quick three',
  'Practice is ready',
  'Today’s practice',
] as const;

const MAX_BODY = 90;

/** "8:00 AM", in the phone's own clock style. */
export function reminderTimeLabel(time: PracticeReminderTime): string {
  return new Date(2000, 0, 1, time.hour, time.minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * "Which is farther north: Dublin or Moscow?" The day's first question, as the
 * reminder's body; a plain line if there's none or it runs long.
 */
export function practiceReminderBody(question: PracticeQuestion | undefined): string {
  const fallback = 'Three questions, about 30 seconds.';
  if (!question) return fallback;
  // Mid-sentence, a leading "The" reads lower-case: "…first: the Eiffel
  // Tower opens or Krakatoa erupts?"
  const mid = (o: string) => (o.startsWith('The ') ? `the ${o.slice(4)}` : o);
  const body = `${question.prompt.replace(/\?$/, '')}: ${mid(question.options[0])} or ${mid(question.options[1])}?`;
  return body.length <= MAX_BODY ? body : fallback;
}

export interface PlannedReminder {
  identifier: string;
  date: Date;
  title: string;
  body: string;
}

const identifierFor = (day: number) => `calibrate-practice-${day}`;
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * The reminders to have scheduled now: the chosen time on each of the next
 * days, today's only if it's still ahead and today's practice isn't done, at
 * most PRACTICE_REMINDER_DAYS_AHEAD of them. Pure, for the tests; days are the
 * local day numbers the practice store uses, `today` being `now`'s.
 */
export function practiceReminderPlan({
  now,
  today,
  time,
  doneToday,
  questionsFor,
}: {
  now: Date;
  today: number;
  time: PracticeReminderTime;
  doneToday: boolean;
  questionsFor: (day: number) => PracticeQuestion[];
}): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  for (let offset = 0; plan.length < PRACTICE_REMINDER_DAYS_AHEAD && offset <= PRACTICE_REMINDER_DAYS_AHEAD; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, time.hour, time.minute, 0, 0);
    if (offset === 0 && (doneToday || date.getTime() <= now.getTime())) continue;
    const day = today + offset;
    plan.push({
      identifier: identifierFor(day),
      date,
      title: PRACTICE_REMINDER_TITLES[mod(day, PRACTICE_REMINDER_TITLES.length)]!,
      body: practiceReminderBody(questionsFor(day)[0]),
    });
  }
  return plan;
}

export interface PracticeReminderApi {
  getPermissionsAsync(): Promise<{ granted: boolean }>;
  scheduleNotificationAsync(req: {
    identifier: string;
    content: { title: string; body: string; data?: Record<string, unknown>; categoryIdentifier?: string };
    trigger: { type: 'date'; date: Date };
  }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  setNotificationCategoryAsync?(
    identifier: string,
    actions: [],
    options: { previewPlaceholder: string },
  ): Promise<unknown>;
}

function defaultApi(): PracticeReminderApi | null {
  if (Platform.OS === 'web') return null;
  // Lazy: keep Jest and the web bundle off the native module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  return {
    async getPermissionsAsync() {
      return { granted: (await Notifications.getPermissionsAsync()).granted };
    },
    async scheduleNotificationAsync(req) {
      return await Notifications.scheduleNotificationAsync({
        identifier: req.identifier,
        content: req.content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: req.trigger.date },
      });
    },
    async cancelScheduledNotificationAsync(id) {
      await Notifications.cancelScheduledNotificationAsync(id);
    },
    async setNotificationCategoryAsync(identifier, actions, options) {
      return await Notifications.setNotificationCategoryAsync(identifier, actions, options);
    },
  };
}

let api: PracticeReminderApi | null | undefined;

/** Test-only: swap the notifications module (null = unsupported), or restore it. */
export function __setPracticeReminderApiForTests(next: PracticeReminderApi | null | undefined): void {
  api = next;
}

/**
 * Make the scheduled reminders match the plan. Every identifier in a window
 * around today is cancelled first (stable ids, so it's idempotent), then the
 * plan is scheduled; with the switch off or no time chosen, the plan is empty
 * and only the cancelling happens.
 */
export async function syncPracticeReminders({
  now = new Date(),
  today,
  time,
  enabled,
  doneToday,
  questionsFor,
}: {
  now?: Date;
  today: number;
  time: PracticeReminderTime | null;
  enabled: boolean;
  doneToday: boolean;
  questionsFor: (day: number) => PracticeQuestion[];
}): Promise<'scheduled' | 'cancelled' | 'skipped'> {
  const notifications = api === undefined ? defaultApi() : api;
  if (!notifications) return 'skipped';
  try {
    for (let day = today - 2; day <= today + PRACTICE_REMINDER_DAYS_AHEAD + 1; day += 1) {
      await notifications.cancelScheduledNotificationAsync(identifierFor(day));
    }
    if (!enabled || !time) return 'cancelled';
    // Check, never ask: permission is asked in context, when a time is picked.
    if (!(await notifications.getPermissionsAsync()).granted) return 'skipped';
    await notifications.setNotificationCategoryAsync?.(PRACTICE_REMINDER_CATEGORY, [], {
      previewPlaceholder: PRACTICE_REMINDER_PLACEHOLDER,
    });
    for (const r of practiceReminderPlan({ now, today, time, doneToday, questionsFor })) {
      await notifications.scheduleNotificationAsync({
        identifier: r.identifier,
        content: {
          title: r.title,
          body: r.body,
          data: { kind: 'practice' },
          categoryIdentifier: PRACTICE_REMINDER_CATEGORY,
        },
        trigger: { type: 'date', date: r.date },
      });
    }
    return 'scheduled';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[practice] reminder sync failed:', e);
    return 'skipped';
  }
}

/** Sync from the stores' current state. */
export async function refreshPracticeReminders(now: Date = new Date()): Promise<void> {
  const practice = usePracticeStore.getState();
  const settings = useSettingsStore.getState();
  const today = practice.today(now);
  await syncPracticeReminders({
    now,
    today,
    time: settings.practiceReminder,
    enabled: settings.notificationsEnabled,
    doneToday: practice.nextSlot(today) === null,
    questionsFor: practice.questionsFor,
  });
}

/**
 * The person picked a moment (or Off), on the practice sheet or in You. Saves
 * it, asks iOS for permission if it never has (in context: they just asked
 * for a reminder), and schedules. Returns where permission stands, so the
 * screen can say if iOS has them turned off.
 */
export async function choosePracticeReminder(
  time: PracticeReminderTime | null,
): Promise<ReminderPermission> {
  await useSettingsStore.getState().setPracticeReminder(time);
  let permission = await reminderPermission();
  if (time && permission === 'undetermined') permission = await askForReminders();
  await refreshPracticeReminders();
  if (time) void track('practice_reminder_set', { hour: time.hour });
  return permission;
}

let unsubs: (() => void)[] = [];

/**
 * Keep the reminders in step: at launch, whenever the app comes back to the
 * foreground (which moves the three-day window), when the time or the switch
 * changes, and when today's practice is finished (today's reminder goes).
 * Call once at startup.
 */
export function initPracticeReminder(): void {
  if (unsubs.length > 0) return;
  void refreshPracticeReminders();
  unsubs = [
    useSettingsStore.subscribe((state, prev) => {
      if (
        state.notificationsEnabled !== prev.notificationsEnabled ||
        state.practiceReminder !== prev.practiceReminder
      ) {
        void refreshPracticeReminders();
      }
    }),
    usePracticeStore.subscribe((state, prev) => {
      if (state.answers === prev.answers) return;
      const today = state.today();
      const done = (s: typeof state) => s.answers.filter((a) => a.day === today).length;
      if (done(state) !== done(prev)) void refreshPracticeReminders();
    }),
  ];
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active') void refreshPracticeReminders();
  });
  unsubs.push(() => sub.remove());
}

/** Test-only: drop the subscriptions. */
export function __resetPracticeReminderForTests(): void {
  for (const unsub of unsubs) unsub();
  unsubs = [];
}
