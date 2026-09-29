import { render, screen } from '@testing-library/react-native';

import { LensEmblem } from './LensEmblem';

const hidden = { includeHiddenElements: true } as const;

describe('LensEmblem', () => {
  it('renders every tier', () => {
    for (const tier of ['guesser', 'tracker', 'forecaster', 'sharp', 'oracle'] as const) {
      const { unmount } = render(<LensEmblem tier={tier} />);
      expect(screen.getByTestId(`lens-${tier}`, hidden)).toBeTruthy();
      unmount();
    }
  });

  // Decorative: the tier is always written beside it.
  it('is hidden from screen readers', () => {
    render(<LensEmblem tier="sharp" />);
    expect(screen.queryByTestId('lens-sharp')).toBeNull();
    expect(screen.getByTestId('lens-sharp', hidden).props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
  });

  it('draws a progress stroke only for a not-yet-earned tier with progress', () => {
    const { rerender } = render(<LensEmblem tier="tracker" />);
    expect(screen.queryByTestId('lens-tracker-progress', hidden)).toBeNull();

    rerender(<LensEmblem tier="tracker" progress={0.6} />);
    expect(screen.getByTestId('lens-tracker-progress', hidden)).toBeTruthy();

    rerender(<LensEmblem tier="tracker" progress={null} />);
    expect(screen.queryByTestId('lens-tracker-progress', hidden)).toBeNull();
  });
});
