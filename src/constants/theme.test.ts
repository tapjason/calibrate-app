import { contrastRatio as contrast } from './contrast';
import { FONT_FAMILY, palettes, type, type Palette } from './theme';

type Pair = [fg: keyof Palette, bg: keyof Palette, min: number];

// DESIGN_SYSTEM §0 rule 7: text ≥ 4.5:1, controls and graphics ≥ 3:1.
// Guards the table in §2 — a token edit that breaks a pair fails here.
const PAIRS: Pair[] = [
  ['textPrimary', 'canvas', 4.5],
  ['textSecondary', 'canvas', 4.5],
  ['textTertiary', 'canvas', 4.5],
  ['textTertiary', 'surfaceSunken', 4.5],
  ['textTertiary', 'surface', 4.5],
  ['actionText', 'canvas', 4.5],
  ['actionText', 'surface', 4.5],
  ['onAction', 'action', 4.5],
  ['selectedText', 'selectedFill', 4.5],
  ['destructive', 'surface', 4.5],
  ['onAction', 'destructive', 4.5],
  ['cautionText', 'cautionBackground', 4.5],
  ['overText', 'surface', 4.5],
  ['underText', 'surface', 4.5],
  ['calibratedText', 'surface', 4.5],
  ['controlBorder', 'surface', 3],
  ['controlBorder', 'canvas', 3],
  ['action', 'canvas', 3],
  ['action', 'surface', 3],
  ['emblemMid', 'surface', 3],
  ['emblemMark', 'emblemMid', 3],
  ['emblemMark', 'emblemDeep', 3],
  ['overMark', 'surface', 3],
  ['underMark', 'surface', 3],
  ['calibratedMark', 'surface', 3],
  // "Continue with Google" (step 192), in Google's own Light and Dark themes:
  // its label at rest and pressed, and its outline, which carries the
  // button's edge on the canvas (the fill alone is about 1.1:1 there).
  ['googleButtonText', 'googleButtonFill', 4.5],
  ['googleButtonText', 'googleButtonPressed', 4.5],
  ['googleButtonStroke', 'canvas', 3],
];

describe('theme contrast (light)', () => {
  it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrast(palettes.light[fg], palettes.light[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('theme contrast (dark)', () => {
  // Every pair, onAction included: since D33 actions turn light in dark with
  // ink on them, so onAction is checked here too (it was white, and skipped).
  it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrast(palettes.dark[fg], palettes.dark[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('palette shape', () => {
  it('defines every light token in dark too', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });
});

// Roadmap D33 (decided 2026-11-01): Instrument Sans everywhere, so every token names it.
describe('type', () => {
  it('sets Instrument Sans on every text style', () => {
    for (const [name, style] of Object.entries(type)) {
      expect([name, style.fontFamily]).toEqual([name, FONT_FAMILY]);
    }
    expect(FONT_FAMILY.replace(/"/g, '').startsWith('Instrument Sans')).toBe(true);
  });

  it('only uses the weights the build embeds', () => {
    for (const style of Object.values(type)) {
      expect(['400', '500', '600', '700']).toContain(style.fontWeight);
    }
  });
});

// Roadmap D33: the brand has no hue. Nothing outside the calibration and
// caution roles, the destructive red and Oracle's gold may carry colour, so a
// hue can only ever mean over, under or on the line.
describe('ink chrome', () => {
  const HUED: (keyof Palette)[] = [
    'overMark', 'overText', 'underMark', 'underText', 'calibratedMark', 'calibratedText',
    'cautionText', 'cautionBackground', 'destructive', 'oracleGold',
  ];
  // One exception that means nothing about the record (step 192): the four
  // colours of Google's "G" on "Continue with Google", a third-party
  // trademark. Google's branding guidelines forbid a monochrome G, so the
  // mark keeps its colours, and it appears nowhere else (DESIGN_SYSTEM §2).
  // Exactly these four: the rest of the button (fill, pressed fill, outline,
  // label) is held near-neutral like any chrome.
  const THIRD_PARTY_MARK: (keyof Palette)[] = [
    'googleBlue', 'googleGreen', 'googleYellow', 'googleRed',
  ];
  // Chroma (max − min channel): saturation inflates near black, chroma doesn't.
  const chroma = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  it.each(['light', 'dark'] as const)('keeps every other %s token near-neutral', (mode) => {
    for (const [key, hex] of Object.entries(palettes[mode]) as [keyof Palette, string][]) {
      if (HUED.includes(key) || THIRD_PARTY_MARK.includes(key)) continue;
      expect([key, chroma(hex) < 0.08]).toEqual([key, true]);
    }
  });

  // The exemption is exact: every hued token outside the record's roles is
  // one of the G's four, and each of the four is hued, so the list can't
  // quietly cover a token it doesn't need to.
  it.each(['light', 'dark'] as const)(
    "exempts exactly the four colours of Google's G in %s",
    (mode) => {
      const huedOutsideRoles = (Object.entries(palettes[mode]) as [keyof Palette, string][])
        .filter(([key, hex]) => !HUED.includes(key) && chroma(hex) >= 0.08)
        .map(([key]) => key)
        .sort();
      expect(huedOutsideRoles).toEqual([...THIRD_PARTY_MARK].sort());
    },
  );

  // Google's own values, from its button SVGs, and the same in both
  // appearances: the G is never recoloured for dark mode.
  it("keeps the G in Google's colours, the same in light and dark", () => {
    const google = { googleBlue: '#4285F4', googleGreen: '#34A853', googleYellow: '#FBBC04', googleRed: '#E94235' };
    for (const key of THIRD_PARTY_MARK) {
      expect([key, palettes.light[key]]).toEqual([key, google[key as keyof typeof google]]);
      expect([key, palettes.dark[key]]).toEqual([key, palettes.light[key]]);
    }
  });
});

// Roadmap D47 (WCAG 1.4.11): the chart's luck-bar outline against what it is
// drawn over: the canvas, and the canvas under the 7% over and under region
// tints (CalibrationChart), light and dark.
describe('the luck bars against the chart (roadmap D47)', () => {
  const mix = (base: string, top: string, t: number) => {
    const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return (
      '#' +
      [0, 1, 2]
        .map((i) => Math.round(ch(base, i) * (1 - t) + ch(top, i) * t).toString(16).padStart(2, '0'))
        .join('')
    );
  };
  it.each(['light', 'dark'] as const)('%s: textTertiary ≥ 3:1 on the canvas and both tints', (mode) => {
    const p = palettes[mode];
    for (const bg of [p.canvas, mix(p.canvas, p.overMark, 0.07), mix(p.canvas, p.underMark, 0.07)]) {
      expect(contrast(p.textTertiary, bg)).toBeGreaterThanOrEqual(3);
    }
  });
});
