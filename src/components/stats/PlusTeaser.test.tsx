import { fireEvent, render, screen } from '@testing-library/react-native';

import { useEntitlementStore } from '@/store/entitlementStore';

import { CoachPanel } from './CoachPanel';
import { PlusTeaser } from './PlusTeaser';
import { TrendsPanel } from './TrendsPanel';

describe('PlusTeaser', () => {
  it('is one card with one button', () => {
    const onUpgrade = jest.fn();
    render(<PlusTeaser onUpgrade={onUpgrade} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('plus-teaser-cta'));
    expect(onUpgrade).toHaveBeenCalled();
  });

  // CLAUDE.md: the paywall never touches the core loop or anything shareable.
  it('says what stays free', () => {
    render(<PlusTeaser onUpgrade={jest.fn()} />);
    expect(screen.getByText(/score, curve, badges and cards stay free/)).toBeTruthy();
  });

  it('makes the Trends line concrete once there is history', () => {
    render(<PlusTeaser onUpgrade={jest.fn()} monthsOnFile={3} />);
    expect(screen.getByText(/your 3 months on file/)).toBeTruthy();
  });
});

describe('panels under a shared teaser', () => {
  beforeEach(() => useEntitlementStore.setState({ isPlus: false }));

  it('render nothing for a free user when the screen owns the upsell', () => {
    const coach = render(<CoachPanel upsell={false} />);
    expect(coach.toJSON()).toBeNull();
    const trends = render(<TrendsPanel upsell={false} />);
    expect(trends.toJSON()).toBeNull();
  });
});
