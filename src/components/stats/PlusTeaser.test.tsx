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

// Roadmap D37: one Coach card on the person's own numbers, labelled as the app's.
describe('PlusTeaser sample', () => {
  it('shows a sample card, and says who wrote it', () => {
    render(
      <PlusTeaser
        onUpgrade={jest.fn()}
        sample={{ figure: '76%', label: 'came true at 60–80%', message: 'Your 60–80% calls…' }}
      />,
    );
    expect(screen.getByTestId('plus-teaser-sample')).toHaveTextContent(/Written by the app from your record/);
    expect(screen.getByText('76%')).toBeTruthy();
  });

  it('shows none without one', () => {
    render(<PlusTeaser onUpgrade={jest.fn()} />);
    expect(screen.queryByTestId('plus-teaser-sample')).toBeNull();
  });
});
