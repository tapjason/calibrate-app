import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { __setDeviceLocaleForTests, __setPhoneClockForTests } from '@/constants/locale';
import { colors } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import type { Prediction } from '@/types';

import { ReminderPrompt, shouldShowReminderPrompt } from './ReminderPrompt';
import { nudgeTime, ReminderPromptCard } from './ReminderPromptCard';

const mockPermission = { current: 'undetermined' as string, answer: 'granted' as string };
const mockAsk = jest.fn(async () => mockPermission.answer);

jest.mock('@/notifications/permission', () => ({
  reminderPermission: jest.fn(async () => mockPermission.current),
  askForReminders: () => mockAsk(),
  // Pure date arithmetic, so the real one.
  reminderTimeFor: jest.requireActual('@/notifications/scheduler').reminderTimeFor,
}));

const NOW = new Date('2026-10-05T10:00:00.000Z');

function open(id: string, due: string): Prediction {
  return {
    id,
    user_id: 'u1',
    title: id,
    category: 'work',
    confidence: 60,
    created_at: '2026-10-01T10:00:00.000Z',
    due_date: due,
    status: 'pending',
    resolved_at: null,
    reflection: null,
    integrity_bonus: true,
  };
}

const base = {
  permission: 'undetermined' as const,
  openCount: 1,
  notificationsEnabled: true,
  dismissedAt: null,
  now: NOW,
};

describe('shouldShowReminderPrompt (roadmap step 38)', () => {
  it('asks once there is something to be reminded about', () => {
    expect(shouldShowReminderPrompt(base)).toBe(true);
    expect(shouldShowReminderPrompt({ ...base, openCount: 0 })).toBe(false);
  });

  it('never asks once iOS has an answer, on web, or with reminders off', () => {
    for (const permission of ['granted', 'denied', 'unsupported', null] as const) {
      expect(shouldShowReminderPrompt({ ...base, permission })).toBe(false);
    }
    expect(shouldShowReminderPrompt({ ...base, notificationsEnabled: false })).toBe(false);
  });

  // Roadmap D19: a first "Not now" on Day 0 mustn't cost the Day-1 reminder.
  it('comes back the next morning after a first "Not now"', () => {
    const evening = new Date(2026, 9, 5, 21, 30).toISOString();
    const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
    const show = (now: Date) =>
      shouldShowReminderPrompt({ ...base, dismissedAt: evening, dismissals: 1, now });
    expect(show(at(5, 23))).toBe(false);
    expect(show(at(6, 5, 59))).toBe(false);
    expect(show(at(6, 6))).toBe(true);
  });

  it('waits a week after a second "Not now"', () => {
    const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
    const show = (d: number) =>
      shouldShowReminderPrompt({ ...base, dismissedAt: daysAgo(d), dismissals: 2 });
    expect(show(1)).toBe(false);
    expect(show(6)).toBe(false);
    expect(show(7)).toBe(true);
  });
});

// D76 (the voice pass, 2026-11-23): "Want a nudge at 7 PM on the day it's
// due?" in the person's own time, then "Plus a quiet weekly summary. Nothing
// else." No date it starts on.
describe('ReminderPromptCard words', () => {
  afterEach(() => {
    __setPhoneClockForTests(null);
    __setDeviceLocaleForTests(null);
  });

  it('asks at the reminder time, the hour alone on the hour, and names the summary', () => {
    __setDeviceLocaleForTests('en-US');
    __setPhoneClockForTests(true);
    useSettingsStore.setState({ dueReminderTime: { hour: 19, minute: 0 } });
    const { unmount } = render(<ReminderPromptCard onAllow={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('reminder-prompt-title')).toHaveTextContent(
      /^Want a nudge at 7\sPM on the day it’s due\?$/,
    );
    expect(screen.getByTestId('reminder-prompt-body')).toHaveTextContent(
      'Plus a quiet weekly summary. Nothing else.',
    );
    expect(screen.queryByText(/starting/)).toBeNull();
    unmount();
  });

  // Policy review 2026-11-23: the summary is named only while it will be sent.
  it('names the weekly summary only while the digest is on', () => {
    __setDeviceLocaleForTests('en-US');
    __setPhoneClockForTests(true);
    const before = useSettingsStore.getState().digestEnabled;
    try {
      useSettingsStore.setState({ digestEnabled: true });
      const on = render(<ReminderPromptCard onAllow={jest.fn()} onDismiss={jest.fn()} />);
      expect(screen.getByTestId('reminder-prompt-body')).toHaveTextContent(
        'Plus a quiet weekly summary. Nothing else.',
      );
      on.unmount();

      useSettingsStore.setState({ digestEnabled: false });
      const off = render(<ReminderPromptCard onAllow={jest.fn()} onDismiss={jest.fn()} />);
      expect(screen.getByTestId('reminder-prompt-body')).toHaveTextContent('Nothing else.');
      expect(screen.queryByText(/weekly summary/)).toBeNull();
      off.unmount();
    } finally {
      useSettingsStore.setState({ digestEnabled: before });
    }
  });

  it('keeps the minutes off the hour, and on a 24-hour clock', () => {
    __setDeviceLocaleForTests('en-US');
    __setPhoneClockForTests(true);
    expect(nudgeTime({ hour: 19, minute: 30 })).toMatch(/^7:30\sPM$/);
    expect(nudgeTime({ hour: 8, minute: 0 })).toMatch(/^8\sAM$/);
    __setPhoneClockForTests(false);
    expect(nudgeTime({ hour: 19, minute: 0 })).toBe('19:00');
  });
});

describe('ReminderPrompt', () => {
  beforeEach(() => {
    mockPermission.current = 'undetermined';
    mockPermission.answer = 'granted';
    mockAsk.mockClear();
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    usePredictionStore.setState({ pending: [open('a', '2099-01-01T12:00:00.000Z')], resolved: [] });
  });

  afterEach(() => __setPersistenceForTests(null));

  it('shows the system alert only from its button, then goes away', async () => {
    render(<ReminderPrompt />);
    await waitFor(() => expect(screen.getByTestId('reminder-prompt')).toBeTruthy());
    expect(mockAsk).not.toHaveBeenCalled();

    // The press starts an async chain (ask, then set state); run it to the end
    // inside act so the assertion doesn't race it on a busy machine.
    await act(async () => {
      fireEvent.press(screen.getByTestId('reminder-prompt-allow'));
    });
    expect(screen.queryByTestId('reminder-prompt')).toBeNull();
    expect(mockAsk).toHaveBeenCalledTimes(1);
  });

  // Step 195: the card is sunken, where controlBorder is 2.93:1 in light.
  it('outlines its button for the sunken card', () => {
    const { unmount } = render(
      <ReminderPromptCard onAllow={jest.fn()} onDismiss={jest.fn()} />,
    );
    const allow = StyleSheet.flatten(screen.getByTestId('reminder-prompt-allow').props.style);
    expect(allow.borderColor).toBe(colors.textTertiary);
    // Before afterEach resets the settings store under it.
    unmount();
  });

  it('"Not now" starts the cooldown', async () => {
    render(<ReminderPrompt />);
    await waitFor(() => expect(screen.getByTestId('reminder-prompt')).toBeTruthy());
    fireEvent.press(screen.getByTestId('reminder-prompt-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('reminder-prompt')).toBeNull());
    expect(useSettingsStore.getState().reminderPromptDismissedAt).not.toBeNull();
  });

  it('stays hidden for someone who already answered', async () => {
    mockPermission.current = 'granted';
    render(<ReminderPrompt />);
    await waitFor(() => expect(mockAsk).not.toHaveBeenCalled());
    expect(screen.queryByTestId('reminder-prompt')).toBeNull();
  });
});
