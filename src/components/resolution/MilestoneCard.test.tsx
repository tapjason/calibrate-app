import { render, screen } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { haptics } from '@/components/ui/haptics';
import { FLIP_MS } from '@/components/ui/TierFlip';

import { BADGE_FOLLOWS, badgeFollows, MilestoneCard, milestoneCopy } from './MilestoneCard';

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
      /^New badge: Silver in health\./,
    );
  });

  it('says what badges follow, the same after Yes and No (D62)', () => {
    render(<MilestoneCard milestone={TIER_UP} />);
    expect(screen.getByTestId('milestone-tier_up').props.accessibilityLabel).toMatch(
      /Badges follow how well your numbers match what happens, not how often you’re right\.$/,
    );
  });

  // Record audit 2026-11-25: Bronze comes with the count alone, so a new
  // Bronze says so; every other tier keeps the line above.
  it('says what Bronze comes with, under a new Bronze only', () => {
    const bronze = { ...TIER_UP, from: 'guesser' as const, badge: 'tracker' as const };
    render(<MilestoneCard milestone={bronze} />);
    const label = screen.getByTestId('milestone-tier_up').props.accessibilityLabel;
    expect(label).toMatch(/^New badge: Bronze in health\./);
    expect(label).toMatch(
      /Bronze comes with 20 scored answers\. Silver and up follow how well your numbers match what happens\.$/,
    );
    expect(label).not.toMatch(/not how often you’re right/);
    expect(label).toBe(
      'New badge: Bronze in health. Bronze comes with 20 scored answers. Silver and up follow how well your numbers match what happens.',
    );
    for (const badge of ['forecaster', 'sharp', 'oracle'] as const) {
      expect(badgeFollows(badge)).toBe(BADGE_FOLLOWS);
    }
  });

  // Review round 3 (2026-11-25): with the unlock, the card already says "20
  // scored answers in", so a new Bronze there is named and nothing more.
  it('names a Bronze that came with the unlock, without its own line', () => {
    const milestone = {
      kind: 'rating_unlocked' as const,
      rating: 86,
      badge: { category: 'health' as const, badge: 'tracker' as const },
    };
    expect(milestoneCopy(milestone).body).toBe(
      '20 scored answers in. Here’s your rating. It’s rough for now and settles as you answer more. New badge, too: Bronze in health.',
    );
    render(<MilestoneCard milestone={milestone} />);
    const label = screen.getByTestId('milestone-rating_unlocked').props.accessibilityLabel;
    expect(label).toMatch(/New badge, too: Bronze in health\.$/);
    expect(label).not.toMatch(/Bronze comes with/);
    expect(label).not.toMatch(/Badges follow/);
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

// D76 (the voice pass, 2026-11-23): the owner's words, with the count from
// MIN_N_OVERALL; the badge sentence after it stays.
describe('milestoneCopy, the unlock', () => {
  // "Scored" (record audit 2026-11-23): a same-day answer isn't one.
  it("says it's rough for now, in the owner's words, counting scored answers", () => {
    expect(milestoneCopy({ kind: 'rating_unlocked', rating: 86 })).toEqual({
      title: 'Your calibration score is unlocked',
      body: '20 scored answers in. Here’s your rating. It’s rough for now and settles as you answer more.',
    });
  });
});

describe('milestoneCopy (step 179)', () => {
  it('names the badge that came with the unlock, and ends each sentence', () => {
    const unlocked = milestoneCopy({
      kind: 'rating_unlocked',
      rating: 86,
      badge: { category: 'health', badge: 'forecaster' },
    });
    expect(unlocked.body).toMatch(/New badge, too: Silver in health\. Badges follow/);
    // Every tier but Bronze keeps its line beside the unlock.
    for (const badge of ['forecaster', 'sharp', 'oracle'] as const) {
      expect(
        milestoneCopy({ kind: 'rating_unlocked', rating: 86, badge: { category: 'health', badge } }).body,
      ).toMatch(new RegExp(`New badge, too: .+ in health\\. ${BADGE_FOLLOWS}$`));
    }
    expect(milestoneCopy({ kind: 'rating_unlocked', rating: 86 }).body).not.toMatch(/New badge/);
    render(<MilestoneCard milestone={TIER_UP} />);
    expect(screen.getByTestId('milestone-tier_up').props.accessibilityLabel).toMatch(
      /scored answers\. Badges follow/,
    );
  });
});
