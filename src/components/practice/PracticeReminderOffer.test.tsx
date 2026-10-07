import { fireEvent, render, screen } from '@testing-library/react-native';

import { PRACTICE_REMINDER_OFFER_COOLDOWN_DAYS, shouldOfferPracticeReminder } from './PracticeReminderOffer';
import { PracticeReminderOfferCard } from './PracticeReminderOfferCard';

const NOW = new Date('2026-10-07T20:00:00.000Z');
const base = {
  permission: 'undetermined' as const,
  notificationsEnabled: true,
  chosen: null,
  dismissedAt: null,
  now: NOW,
};

describe('shouldOfferPracticeReminder (roadmap step 89)', () => {
  it('offers while nothing is chosen and notifications can reach the person', () => {
    expect(shouldOfferPracticeReminder(base)).toBe(true);
    expect(shouldOfferPracticeReminder({ ...base, permission: 'granted' })).toBe(true);
  });

  it('stays away where notifications cannot arrive', () => {
    expect(shouldOfferPracticeReminder({ ...base, permission: 'unsupported' })).toBe(false);
    expect(shouldOfferPracticeReminder({ ...base, permission: 'denied' })).toBe(false);
    expect(shouldOfferPracticeReminder({ ...base, permission: null })).toBe(false);
    expect(shouldOfferPracticeReminder({ ...base, notificationsEnabled: false })).toBe(false);
  });

  it('stays away once a time is chosen', () => {
    expect(shouldOfferPracticeReminder({ ...base, chosen: { hour: 8, minute: 0 } })).toBe(false);
  });

  it('waits a week after "Not now"', () => {
    const day = 24 * 60 * 60 * 1000;
    const ago = (days: number) => new Date(NOW.getTime() - days * day).toISOString();
    expect(shouldOfferPracticeReminder({ ...base, dismissedAt: ago(2) })).toBe(false);
    expect(
      shouldOfferPracticeReminder({ ...base, dismissedAt: ago(PRACTICE_REMINDER_OFFER_COOLDOWN_DAYS) }),
    ).toBe(true);
  });
});

describe('PracticeReminderOfferCard', () => {
  it('offers three moments and a real "Not now"', () => {
    const onChoose = jest.fn();
    const onDismiss = jest.fn();
    render(<PracticeReminderOfferCard onChoose={onChoose} onDismiss={onDismiss} />);
    fireEvent.press(screen.getByTestId('practice-reminder-moments-lunch'));
    expect(onChoose).toHaveBeenCalledWith({ hour: 12, minute: 30 });
    fireEvent.press(screen.getByTestId('practice-reminder-dismiss'));
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.queryByTestId('practice-reminder-moments-off')).toBeNull();
  });

  it('confirms the choice and says where to change it', () => {
    render(
      <PracticeReminderOfferCard onChoose={() => {}} onDismiss={() => {}} confirmation="Set for 8:00 AM." />,
    );
    expect(screen.getByTestId('practice-reminder-confirmation')).toHaveTextContent('Set for 8:00 AM.');
    expect(screen.getByText('Change it or turn it off in You.')).toBeTruthy();
  });
});
