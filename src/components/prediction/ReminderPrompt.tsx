import { useEffect, useState } from 'react';

import {
  askForReminders,
  reminderPermission,
  reminderTimeFor,
  type ReminderPermission,
} from '@/notifications/permission';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Prediction } from '@/types';

import { ReminderPromptCard } from './ReminderPromptCard';

/** From the second "Not now", the prompt is held back this long. */
export const REMINDER_PROMPT_COOLDOWN_DAYS = 7;

/** The first "Not now" holds the prompt until this hour, local, the next day. */
export const REMINDER_PROMPT_MORNING_HOUR = 6;

/**
 * When a "Not now" given at `dismissedAt` stops holding the prompt back
 * (roadmap D19, decided 2026-10-09). The first holds it only until the next
 * morning: D18 makes a first prediction due the next evening, so a week would
 * silence the reminder that brings someone back on Day 1. From the second, a
 * week, as before.
 */
export function reminderPromptReturnsAt(dismissedAt: string, dismissals: number): Date {
  const at = new Date(dismissedAt);
  if (dismissals <= 1) {
    return new Date(
      at.getFullYear(),
      at.getMonth(),
      at.getDate() + 1,
      REMINDER_PROMPT_MORNING_HOUR,
    );
  }
  return new Date(at.getTime() + REMINDER_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Whether Home asks about reminders right now (roadmap step 38): only while
 * iOS hasn't been asked, once there is something to be reminded about, with
 * reminders still on in Settings, and not while a "Not now" holds it back
 * (D19: until the next morning the first time, a week after that).
 */
export function shouldShowReminderPrompt(input: {
  permission: ReminderPermission | null;
  openCount: number;
  notificationsEnabled: boolean;
  dismissedAt: string | null;
  /** How many times "Not now" has been answered; 1 when unknown. */
  dismissals?: number;
  now: Date;
}): boolean {
  if (input.permission !== 'undetermined') return false;
  if (input.openCount === 0 || !input.notificationsEnabled) return false;
  if (!input.dismissedAt) return true;
  const back = reminderPromptReturnsAt(input.dismissedAt, input.dismissals ?? 1);
  return input.now.getTime() >= back.getTime();
}

/**
 * The day of the soonest reminder still ahead, as "Tue, Oct 6", or null.
 * Reminders fire in the evening of the due day (roadmap D9), so one due at
 * noon today still counts until the evening.
 */
export function firstReminderDay(pending: readonly Prediction[], now: Date): string | null {
  const next = pending
    .map((p) => reminderTimeFor(p.due_date).getTime())
    .filter((t) => !Number.isNaN(t) && t > now.getTime())
    .sort((a, b) => a - b)[0];
  if (next === undefined) return null;
  return new Date(next).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Home's reminder prompt: reads the permission without asking, and shows the
 * card when it should. The system alert appears only from its button.
 */
export function ReminderPrompt() {
  const pending = usePredictionStore((s) => s.pending);
  // Due-day reminders need both switches (roadmap D31): with that one off,
  // asking iOS for them would be asking for something that won't be sent.
  const notificationsEnabled = useSettingsStore(
    (s) => s.notificationsEnabled && s.remindersEnabled,
  );
  const dismissedAt = useSettingsStore((s) => s.reminderPromptDismissedAt);
  const dismissals = useSettingsStore((s) => s.reminderPromptDismissals);
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const current = await reminderPermission();
      if (live) setPermission(current);
    })();
    return () => {
      live = false;
    };
  }, []);

  const now = new Date();
  const show = shouldShowReminderPrompt({
    permission,
    openCount: pending.length,
    notificationsEnabled,
    dismissedAt,
    dismissals,
    now,
  });
  if (!show) return null;

  const allow = async () => {
    setBusy(true);
    try {
      // Granted or refused, the answer is final for this card.
      setPermission(await askForReminders());
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReminderPromptCard
      firstDue={firstReminderDay(pending, now)}
      busy={busy}
      onAllow={() => void allow()}
      onDismiss={() => void useSettingsStore.getState().dismissReminderPrompt()}
    />
  );
}
