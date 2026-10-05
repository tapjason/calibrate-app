import { render, screen } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { haptics } from '@/components/ui/haptics';
import { FLIP_MS } from '@/components/ui/TierFlip';

import { MilestoneCard } from './MilestoneCard';

// Reduce Motion is a system setting; mock only that hook. The default export
// (Animated) has to be carried over by hand, since spreading a module object
// drops it.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  };
});

jest.mock('@/components/ui/haptics', () => ({
  haptics: {
    commit: jest.fn(),
    detent: jest.fn(),
    resolve: jest.fn(),
    reveal: jest.fn(),
    unlock: jest.fn(),
  },
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReducedMotion).mockReturnValue(false);
  jest.mocked(haptics.unlock).mockClear();
});

afterEach(() => jest.useRealTimers());

/** Emblems and confetti are decorative (hidden from screen readers). */
const HIDDEN = { includeHiddenElements: true } as const;

const TIER_UP = {
  kind: 'tier_up',
  category: 'health',
  badge: 'forecaster',
  from: 'guesser',
} as const;

describe('MilestoneCard — tier-up (DESIGN_SYSTEM §6.1 tierUp)', () => {
  it('flips from the tier the user had to the new one', () => {
    render(<MilestoneCard milestone={TIER_UP} />);
    expect(screen.getByTestId('tier-flip-from-guesser', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('tier-flip-to-forecaster', HIDDEN)).toBeTruthy();
  });

  it('bursts confetti', () => {
    render(<MilestoneCard milestone={TIER_UP} />);
    expect(screen.getByTestId('confetti', HIDDEN)).toBeTruthy();
  });

  it('lands the Success haptic as the new face turns in, once', () => {
    render(<MilestoneCard milestone={TIER_UP} />);
    jest.advanceTimersByTime(FLIP_MS / 2 - 1);
    expect(haptics.unlock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(haptics.unlock).toHaveBeenCalledTimes(1);
  });

  it('under Reduce Motion: no confetti, and the haptic fires at once', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    render(<MilestoneCard milestone={TIER_UP} />);
    expect(screen.queryByTestId('confetti', HIDDEN)).toBeNull();
    jest.advanceTimersByTime(0);
    expect(haptics.unlock).toHaveBeenCalledTimes(1);
  });

  it('says it all in words for screen readers', () => {
    render(<MilestoneCard milestone={TIER_UP} />);
    expect(screen.getByTestId('milestone-tier_up').props.accessibilityLabel).toMatch(
      /^Forecaster in health\./,
    );
  });
});

describe('MilestoneCard — score unlock', () => {
  // The celebration budget (§6.2): confetti belongs to the tier-up alone.
  it('keeps the spring-in card, without confetti or a flip', () => {
    render(<MilestoneCard milestone={{ kind: 'rating_unlocked', rating: 78 }} />);
    expect(screen.queryByTestId('confetti', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('tier-flip', HIDDEN)).toBeNull();
    jest.advanceTimersByTime(0);
    expect(haptics.unlock).toHaveBeenCalledTimes(1);
  });
});
