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
  ['brandText', 'canvas', 4.5],
  ['onBrand', 'brand600', 4.5],
  ['destructive', 'surface', 4.5],
  ['onBrand', 'destructive', 4.5],
  ['integrityText', 'integrityBackground', 4.5],
  ['cautionText', 'cautionBackground', 4.5],
  ['overText', 'surface', 4.5],
  ['underText', 'surface', 4.5],
  ['calibratedText', 'surface', 4.5],
  ['controlBorder', 'surface', 3],
  ['overMark', 'surface', 3],
  ['underMark', 'surface', 3],
  ['calibratedMark', 'surface', 3],
];

describe('theme contrast (light)', () => {
  it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrast(palettes.light[fg], palettes.light[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('theme contrast (proposed dark)', () => {
  it.each(PAIRS.filter(([fg]) => fg !== 'onBrand'))('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrast(palettes.dark[fg], palettes.dark[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('palette shape', () => {
  it('defines every light token in dark too', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });
});

// Roadmap D1 (decided 2026-10-07): Inter everywhere, so every token names it.
describe('type', () => {
  it('sets Inter on every text style', () => {
    for (const [name, style] of Object.entries(type)) {
      expect([name, style.fontFamily]).toEqual([name, FONT_FAMILY]);
    }
    expect(FONT_FAMILY.startsWith('Inter')).toBe(true);
  });

  it('only uses the weights the build embeds', () => {
    for (const style of Object.values(type)) {
      expect(['400', '500', '600', '700', '800']).toContain(style.fontWeight);
    }
  });
});
