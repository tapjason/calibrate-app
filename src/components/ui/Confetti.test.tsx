import { render, screen } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import {
  BRAND_CONFETTI,
  Confetti,
  CONFETTI_MAX_PIECES,
  confettiPieces,
} from './Confetti';

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

beforeEach(() => jest.mocked(useReducedMotion).mockReturnValue(false));

describe('confettiPieces', () => {
  // DESIGN_SYSTEM §6.1 tierUp: ≤ 40 particles.
  it('never exceeds the particle budget', () => {
    expect(confettiPieces(500, BRAND_CONFETTI)).toHaveLength(CONFETTI_MAX_PIECES);
    expect(confettiPieces(36, BRAND_CONFETTI)).toHaveLength(36);
    expect(confettiPieces(-3, BRAND_CONFETTI)).toHaveLength(0);
  });

  it('is the same burst every time for a seed', () => {
    expect(confettiPieces(12, BRAND_CONFETTI)).toEqual(confettiPieces(12, BRAND_CONFETTI));
    expect(confettiPieces(12, BRAND_CONFETTI, 1)).not.toEqual(
      confettiPieces(12, BRAND_CONFETTI, 2),
    );
  });

  it('launches every piece upward, in the palette it was given', () => {
    const pieces = confettiPieces(40, BRAND_CONFETTI);
    for (const p of pieces) {
      expect(p.vy).toBeLessThan(0);
      expect(BRAND_CONFETTI).toContain(p.color);
    }
  });
});

describe('Confetti', () => {
  it('renders one view per piece, hidden from screen readers', () => {
    render(<Confetti originX={10} originY={10} count={12} />);
    // Decorative and hidden from screen readers, so the query has to opt in.
    const burst = screen.getByTestId('confetti', { includeHiddenElements: true });
    expect(burst.props.accessibilityElementsHidden).toBe(true);
    expect(burst.props.pointerEvents).toBe('none');
    expect(burst.children).toHaveLength(12);
  });

  // §6.1 `reduced`: no confetti at all.
  it('renders nothing under Reduce Motion', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    render(<Confetti originX={10} originY={10} />);
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
  });
});
