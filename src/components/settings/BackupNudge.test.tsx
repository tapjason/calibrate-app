import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import type { Prediction } from '@/types';

import { BackupNudge, shouldShowBackupNudge } from './BackupNudge';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const base = {
  accountsAvailable: true,
  signedIn: false,
  oldestCreatedAt: daysAgo(31),
  dismissedAt: null,
  now: NOW,
};

// Roadmap D31: back it up after 30 days on one phone, quietly.
describe('shouldShowBackupNudge', () => {
  it('asks a guest whose oldest prediction is 30 days old', () => {
    expect(shouldShowBackupNudge(base)).toBe(true);
    expect(shouldShowBackupNudge({ ...base, oldestCreatedAt: daysAgo(29) })).toBe(false);
    expect(shouldShowBackupNudge({ ...base, oldestCreatedAt: null })).toBe(false);
  });

  it('never asks someone signed in, or on a build without accounts', () => {
    expect(shouldShowBackupNudge({ ...base, signedIn: true })).toBe(false);
    expect(shouldShowBackupNudge({ ...base, accountsAvailable: false })).toBe(false);
  });

  it('keeps 30 days quiet after "Not now"', () => {
    expect(shouldShowBackupNudge({ ...base, dismissedAt: daysAgo(29) })).toBe(false);
    expect(shouldShowBackupNudge({ ...base, dismissedAt: daysAgo(30) })).toBe(true);
  });
});

describe('BackupNudge', () => {
  const old: Prediction = {
    id: 'p1',
    user_id: 'local-user-v1',
    title: 'Old one',
    category: 'work',
    confidence: 60,
    created_at: '2020-01-01T12:00:00.000Z',
    due_date: '2020-01-08T12:00:00.000Z',
    status: 'resolved_yes',
    resolved_at: '2020-01-08T12:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
  };

  beforeEach(() => {
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    useAuthStore.setState({ accountsAvailable: true, status: 'guest' });
    usePredictionStore.setState({ pending: [], resolved: [old] });
    useSettingsStore.setState({ backupNudgeDismissedAt: null });
  });

  afterEach(() => {
    __setPersistenceForTests(null);
  });

  it('offers sign-in, and goes quiet on Not now', async () => {
    const onSignIn = jest.fn();
    render(<BackupNudge onSignIn={onSignIn} />);
    fireEvent.press(screen.getByTestId('backup-nudge-sign-in'));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('backup-nudge-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('backup-nudge')).toBeNull());
    expect(useSettingsStore.getState().backupNudgeDismissedAt).not.toBeNull();
  });
});
