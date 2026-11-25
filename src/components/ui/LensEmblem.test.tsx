import { render, screen } from '@testing-library/react-native';

import { palettes } from '@/constants/theme';

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

  // Roadmap D80: gold edges Gold and Platinum (Oracle's alone until then).
  it('edges Gold and Platinum in gold, and no other tier', () => {
    const outline = (tier: 'forecaster' | 'sharp' | 'oracle') => {
      const { UNSAFE_root, unmount } = render(<LensEmblem tier={tier} palette={palettes.light} />);
      const rects = UNSAFE_root.findAll(
        (n: { type: unknown; props: { stroke?: unknown } }) => n.type === 'RNSVGRect' && n.props.stroke !== undefined,
      );
      const stroke = rects[0].props.stroke as { payload: number };
      unmount();
      return `#${(stroke.payload & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;
    };
    expect(outline('sharp')).toBe(palettes.light.medalGold);
    expect(outline('oracle')).toBe(palettes.light.medalGold);
    expect(outline('forecaster')).not.toBe(palettes.light.medalGold);
  });

  // Found with D80: react-native-svg drops a gradient stop it can't read as
  // a plain colour, and the app's dynamic tokens aren't one, so Platinum's
  // face drew empty in the app. Its stops are plain hex now.
  it('gives Platinum a face in the app, not only on a card', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { UNSAFE_root } = render(<LensEmblem tier="oracle" />);
    const gradient = UNSAFE_root.findAll((n: { type: unknown }) => n.type === 'RNSVGLinearGradient')[0];
    // Three stops, each an offset and a colour.
    expect((gradient.props as { gradient: number[] }).gradient).toHaveLength(6);
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/not a valid color/));
    warn.mockRestore();
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
