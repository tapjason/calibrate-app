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
  // Chroma (max − min channel): saturation inflates near black, chroma doesn't.
  const chroma = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  it.each(['light', 'dark'] as const)('keeps every other %s token near-neutral', (mode) => {
    for (const [key, hex] of Object.entries(palettes[mode]) as [keyof Palette, string][]) {
      if (HUED.includes(key)) continue;
      expect([key, chroma(hex) < 0.08]).toEqual([key, true]);
    }
  });
});
