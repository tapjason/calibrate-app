import { useEffect, useState } from 'react';

import {
  choosePracticeReminder,
  reminderTimeLabel,
} from '@/notifications/practiceReminder';
import { reminderPermission, type ReminderPermission } from '@/notifications/permission';
import { useSettingsStore, type PracticeReminderTime } from '@/store/settingsStore';

import { PracticeReminderOfferCard } from './PracticeReminderOfferCard';

/** "Not now" holds the offer back this long. */
export const PRACTICE_REMINDER_OFFER_COOLDOWN_DAYS = 7;

/**
 * Whether the practice sheet offers the reminder (roadmap step 89): only
 * where notifications exist and iOS hasn't refused them, with the
 * Notifications switch on, no time chosen yet, and not within a week of "Not
 * now".
 */
export function shouldOfferPracticeReminder(input: {
  permission: ReminderPermission | null;
  notificationsEnabled: boolean;
  chosen: PracticeReminderTime | null;
  dismissedAt: string | null;
  now: Date;
}): boolean {
  if (input.permission !== 'granted' && input.permission !== 'undetermined') return false;
  if (!input.notificationsEnabled || input.chosen !== null) return false;
  if (!input.dismissedAt) return true;
  const since = input.now.getTime() - Date.parse(input.dismissedAt);
  return !(since < PRACTICE_REMINDER_OFFER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

/** The offer under a finished practice. Native only: web has no notifications. */
export function PracticeReminderOffer() {
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const chosen = useSettingsStore((s) => s.practiceReminder);
  const dismissedAt = useSettingsStore((s) => s.practiceReminderOfferDismissedAt);
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
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

  const show =
    confirmation !== null ||
    shouldOfferPracticeReminder({ permission, notificationsEnabled, chosen, dismissedAt, now: new Date() });
  if (!show) return null;

  const choose = async (time: PracticeReminderTime) => {
    setBusy(true);
    try {
      const result = await choosePracticeReminder(time);
      setPermission(result);
      setConfirmation(
        result === 'granted'
          ? `Set for ${reminderTimeLabel(time)}.`
          : `Set for ${reminderTimeLabel(time)}, once notifications are allowed in iOS Settings.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PracticeReminderOfferCard
      onChoose={(t) => void choose(t)}
      onDismiss={() => void useSettingsStore.getState().dismissPracticeReminderOffer()}
      confirmation={confirmation}
      busy={busy}
    />
  );
}
