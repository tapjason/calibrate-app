import { useEffect, useState } from 'react';

import {
  askForReminders,
  reminderPermission,
  type ReminderPermission,
} from '@/notifications/permission';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Prediction } from '@/types';

import { ReminderPromptCard } from './ReminderPromptCard';

/** "Not now" holds the prompt back this long. */
export const REMINDER_PROMPT_COOLDOWN_DAYS = 7;

/**
 * Whether Home asks about reminders right now (roadmap step 38): only while
 * iOS hasn't been asked, once there is something to be reminded about, with
 * reminders still on in Settings, and not within a week of "Not now".
 */
export function shouldShowReminderPrompt(input: {
  permission: ReminderPermission | null;
  openCount: number;
  notificationsEnabled: boolean;
  dismissedAt: string | null;
  now: Date;
}): boolean {
  if (input.permission !== 'undetermined') return false;
  if (input.openCount === 0 || !input.notificationsEnabled) return false;
  if (!input.dismissedAt) return true;
  const since = input.now.getTime() - Date.parse(input.dismissedAt);
  return !(since < REMINDER_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

/** The soonest due date still ahead, as "Tue, Oct 6", or null. */
export function firstReminderDay(pending: readonly Prediction[], now: Date): string | null {
  const next = pending
    .map((p) => Date.parse(p.due_date))
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
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const dismissedAt = useSettingsStore((s) => s.reminderPromptDismissedAt);
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
