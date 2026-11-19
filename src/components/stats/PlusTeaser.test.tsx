import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
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
    render(<PlusTeaser onUpgrade={jest.fn()} monthsOnFile="3 months" />);
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

// The under-13 rule (roadmap D70): Plus isn't offered on a local-only phone,
// so Insights shows no Plus card and no panel shows an upsell.
describe('Plus surfaces under the under-13 rule', () => {
  beforeEach(() => useEntitlementStore.setState({ isPlus: false }));
  afterEach(() => act(() => __resetAgeStoreForTests()));

  it('draws no Plus card', () => {
    useAgeStore.setState({ localOnly: true });
    const onUpgrade = jest.fn();
    const teaser = render(<PlusTeaser onUpgrade={onUpgrade} monthsOnFile="3 months" />);
    expect(teaser.toJSON()).toBeNull();
    expect(screen.queryByTestId('plus-teaser-cta')).toBeNull();
  });

  it('draws no upsell in Coach or Trends, even where the screen asks for one', () => {
    useAgeStore.setState({ localOnly: true });
    const coach = render(<CoachPanel upsell onUpgrade={jest.fn()} />);
    expect(coach.toJSON()).toBeNull();
    const trends = render(<TrendsPanel upsell onUpgrade={jest.fn()} />);
    expect(trends.toJSON()).toBeNull();
  });

  it('draws them as usual without the rule', () => {
    useAgeStore.setState({ localOnly: false });
    render(<PlusTeaser onUpgrade={jest.fn()} />);
    expect(screen.getByTestId('plus-teaser-cta')).toBeTruthy();
    render(<TrendsPanel upsell onUpgrade={jest.fn()} />);
    expect(screen.getByTestId('trends-upsell-cta')).toBeTruthy();
  });

  // Trends on a Plus mirror already on the phone is unchanged.
  it('keeps Trends for a Plus mirror', () => {
    useEntitlementStore.setState({ isPlus: true });
    useAgeStore.setState({ localOnly: true });
    render(<TrendsPanel upsell={false} />);
    expect(screen.getByTestId('trends-panel')).toBeTruthy();
  });
});
