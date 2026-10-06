import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { usePredictionStore } from '@/store/predictionStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import type { Prediction } from '@/types';

import {
  firstReminderDay,
  ReminderPrompt,
  shouldShowReminderPrompt,
} from './ReminderPrompt';

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

  it('waits a week after "Not now"', () => {
    const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
    expect(shouldShowReminderPrompt({ ...base, dismissedAt: daysAgo(6) })).toBe(false);
    expect(shouldShowReminderPrompt({ ...base, dismissedAt: daysAgo(7) })).toBe(true);
  });
});

describe('firstReminderDay', () => {
  it('names the soonest due date still ahead, skipping overdue ones', () => {
    const ahead = open('b', '2026-10-09T12:00:00.000Z');
    const day = new Date(ahead.due_date).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    expect(firstReminderDay([open('a', '2026-10-01T12:00:00.000Z'), ahead], NOW)).toBe(day);
    expect(firstReminderDay([open('a', '2026-10-01T12:00:00.000Z')], NOW)).toBeNull();
  });

  // Roadmap D9: the reminder is that evening, so noon having passed doesn't
  // mean it has.
  it('counts a prediction due earlier today until its evening reminder', () => {
    const now = new Date('2026-10-05T15:00:00.000Z');
    const dueToday = open('t', '2026-10-05T12:00:00.000Z');
    expect(firstReminderDay([dueToday], now)).not.toBeNull();
    expect(firstReminderDay([dueToday], new Date('2026-10-05T19:30:00.000Z'))).toBeNull();
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
