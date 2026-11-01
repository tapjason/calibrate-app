// Design tokens. The single home for colour, type, space, radius and
// elevation — components import from here and never write a hex literal
// (CLAUDE.md, DESIGN_SYSTEM.md §0 rule 1).
//
// Values are transcribed from docs/design/DESIGN_SYSTEM.md §2–§4, where every
// text pair's contrast ratio is recorded. Don't eyeball a new pair: add it
// there with its ratio first.
//
// Colours follow the phone's appearance (roadmap D7, decided 2026-10-07: the
// system setting, no in-app toggle). Each token in `colors` is one value that
// resolves to its light or dark hex where it's drawn, so a StyleSheet created
// once at load still switches with the appearance:
//   - iOS: DynamicColorIOS, which UIKit resolves per trait collection.
//   - Web: a CSS custom property, with a prefers-color-scheme rule.
//   - Android: light only for now (no device to check it on).
// Share cards don't use `colors`: an exported image keeps its own palette
// (`palettes`, cardThemes) whatever the phone's appearance.

import { DynamicColorIOS, Platform, type TextStyle } from 'react-native';

import { contrastRatio } from './contrast';

export interface Palette {
  // Actions and selection, drawn in ink (roadmap D33: the brand has no hue,
  // so the only colour on screen means over, under or on the line). Chrome,
  // never data.
  /** Primary action fill, a selected chip's fill, selection border, a switch that's on. */
  action: string;
  /** A primary action while pressed. */
  actionPressed: string;
  /** Text and icons on an `action` fill; also a switch's thumb. */
  onAction: string;
  /** Tappable text on the canvas or a surface (a text button, a link). */
  actionText: string;
  /**
   * A quiet chosen state: a selected plan or option row, a checkpoint row.
   * Selected chips take `action` instead (D33).
   */
  selectedFill: string;
  /** Text on `selectedFill`. */
  selectedText: string;
  /**
   * A quiet tone for what's highlighted but not chosen: a checkpoint's edge,
   * the current step, an unlock bar.
   */
  emphasis: string;

  // Neutrals (cool graphite).
  canvas: string;
  surface: string;
  surfaceSunken: string;
  hairline: string;
  controlBorder: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  destructive: string;

  // Calibration semantics: warm = over, cool = under, green = on the line.
  // Never used for Yes/No outcomes (rule 0.4). The only hues in the app.
  overMark: string;
  overText: string;
  underMark: string;
  underText: string;
  calibratedMark: string;
  calibratedText: string;

  // Caution: a warning before an irreversible step (account deletion). Not
  // an outcome colour and never used for a miss.
  cautionText: string;
  cautionBackground: string;

  // The Lens emblem (DESIGN_SYSTEM §7.4). Tier is carried by fill, rings and
  // the written label; these give the filled tiers their faces.
  /** Forecaster's face. */
  emblemMid: string;
  /** Sharp's face, and where Oracle's gradient starts. */
  emblemDeep: string;
  /** The diagonal and bezel drawn on a filled face. */
  emblemMark: string;
  /** Oracle only: the gold hairline and the gradient's far stop. */
  oracleGold: string;
}

// Values and their contrast ratios: DESIGN_SYSTEM §2 (roadmap D33, decided
// 2026-11-01). theme.test.ts pins every pair the app draws.
const light: Palette = {
  action: '#15171B', // white on it 17.9:1
  actionPressed: '#3A3D45',
  onAction: '#FFFFFF',
  actionText: '#15171B', // 16.3:1 on canvas
  selectedFill: '#E3E5E9',
  selectedText: '#15171B', // 14.2:1 on selectedFill
  emphasis: '#C9CCD3',

  canvas: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceSunken: '#E9EBEE',
  hairline: '#DDE0E5',
  controlBorder: '#858993', // 3.50:1 on white, 3.18:1 on canvas (UI ≥ 3:1)
  textPrimary: '#15171B', // 16.3:1 on canvas
  textSecondary: '#4B4F58', // 7.46:1 on canvas
  textTertiary: '#646873', // 5.06:1 canvas · 4.66:1 sunken
  destructive: '#C4271C', // 5.75:1 on white

  overMark: '#D55E00',
  overText: '#B84E00',
  underMark: '#0084C7',
  underText: '#006C9E',
  calibratedMark: '#009E73',
  calibratedText: '#00785A',

  cautionText: '#7E4600', // 6.67:1 on cautionBackground
  cautionBackground: '#FBEFD6',

  emblemMid: '#5B5F69',
  emblemDeep: '#15171B',
  emblemMark: '#FFFFFF',
  oracleGold: '#B7791F',
};

/** DESIGN_SYSTEM §2.5. Actions turn light on the dark canvas, with ink on them. */
const dark: Palette = {
  action: '#F2F3F5', // ink on it 16.2:1
  actionPressed: '#C9CCD2',
  onAction: '#15171B',
  actionText: '#F2F3F5', // 17.3:1 on dark canvas
  selectedFill: '#2A2D33',
  selectedText: '#F2F3F5', // 12.4:1 on selectedFill
  emphasis: '#454952',

  canvas: '#0E0F12',
  surface: '#18191D',
  surfaceSunken: '#222429',
  hairline: '#2D3036',
  controlBorder: '#6E727C',
  textPrimary: '#F2F3F5',
  textSecondary: '#B4B8C0',
  textTertiary: '#8D919B',
  destructive: '#FF6B5E',

  overMark: '#E06B20',
  overText: '#F28A4B',
  underMark: '#2D96D8',
  underText: '#5CB4EC',
  calibratedMark: '#14A87B',
  calibratedText: '#3CC79A',

  cautionText: '#F5C77A', // 10.5:1 on dark cautionBackground
  cautionBackground: '#2A1C06',

  emblemMid: '#9EA2AB',
  emblemDeep: '#F2F3F5',
  emblemMark: '#15171B',
  oracleGold: '#E8B64C',
};

export const palettes = { light, dark } as const;

/**
 * The fixed palette that reads on a share card's own background: the dark
 * palette's light marks on a dark card, the light palette's on a light one.
 * Fixed either way, so an exported PNG doesn't follow the phone (D7).
 */
export function paletteOn(background: string): Palette {
  return contrastRatio(background, light.surface) > 4.5 ? dark : light;
}

// Web: one stylesheet of custom properties, light at :root and dark under the
// media query, filled in as themed() is called (module load, in practice).
const webVars: string[] = [];
let webStyle: { textContent: string | null } | null = null;

function writeWebVars(): void {
  if (typeof document === 'undefined') return;
  if (!webStyle) {
    const el = document.createElement('style');
    el.setAttribute('data-calibrate-colors', '');
    document.head.appendChild(el);
    webStyle = el;
  }
  const light = webVars.map((v) => v.split('|')[0]).join('');
  const dark = webVars.map((v) => v.split('|')[1]).join('');
  webStyle.textContent =
    `:root{${light}}` + `@media (prefers-color-scheme: dark){:root{${dark}}}`;
}

/**
 * One colour that follows the appearance: `lightHex` in light mode,
 * `darkHex` in dark. For tokens outside the palette that still need both
 * (BADGE_META's chips). `name` must be unique; it names the web variable.
 */
export function themed(name: string, lightHex: string, darkHex: string): string {
  if (Platform.OS === 'ios') {
    // An opaque colour object, typed as the string RN styles accept: every
    // consumer passes it to a style or a native colour prop, none reads it.
    return DynamicColorIOS({ light: lightHex, dark: darkHex }) as unknown as string;
  }
  if (Platform.OS === 'web') {
    const variable = `--cal-${name}`;
    webVars.push(`${variable}:${lightHex};|${variable}:${darkHex};`);
    writeWebVars();
    return `var(${variable}, ${lightHex})`;
  }
  return lightHex;
}

/** The palette every screen draws with, light or dark by the phone's setting. */
export const colors: Palette = Object.fromEntries(
  (Object.keys(light) as (keyof Palette)[]).map((key) => [
    key,
    themed(key, light[key], dark[key]),
  ]),
) as unknown as Palette;

// ---- Type (DESIGN_SYSTEM §3) ----
// Instrument Sans everywhere (roadmap D33, decided 2026-11-01; Inter until
// then, D1): one face on iOS and web, so screenshots match the phone, numbers
// included (its tabular figures via `tabularNums`). Four weights ship: 400,
// 500, 600, 700.
//
// iOS embeds them at build time (the expo-font plugin in app.json) under the
// family "Instrument Sans", so fontFamily plus fontWeight picks the face. Web
// registers the same files under the same family with weight descriptors
// (src/constants/fonts.web.ts), and needs a fallback list: a bare unknown
// family falls through to the browser's serif default.

export const FONT_FAMILY: string = Platform.select({
  web: '"Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  default: 'Instrument Sans',
});

const FONT = FONT_FAMILY;

/**
 * For react-native-svg text, which takes the family as a prop rather than a
 * style. The same face as everything else.
 */
export const svgFontFamily: string = FONT_FAMILY;

export const type = {
  display: { fontFamily: FONT, fontSize: 64, lineHeight: 68, fontWeight: '700' },
  /** The live number on a control or a celebration (confidence readout, milestone). */
  readout: { fontFamily: FONT, fontSize: 48, lineHeight: 56, fontWeight: '700' },
  titleXL: { fontFamily: FONT, fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontFamily: FONT, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontFamily: FONT, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontFamily: FONT, fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontFamily: FONT, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontFamily: FONT, fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontFamily: FONT, fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontFamily: FONT, fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontFamily: FONT, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontFamily: FONT, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** Section labels. Sentence case — replaces ALL-CAPS grey. */
  eyebrow: { fontFamily: FONT, fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.4 },
} satisfies Record<string, TextStyle>;

/**
 * Dynamic Type caps (DESIGN_SYSTEM §3, §8). Body text scales freely; the one
 * display-size number per screen stops at 1.6x so it can't push everything
 * else off screen, and share cards stop at 1.2x because they are fixed-layout
 * artifacts exported as images.
 */
export const DISPLAY_MAX_SCALE = 1.6;
export const CARD_MAX_SCALE = 1.2;

/** Every number that animates or aligns in a column. */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

// ---- Space, radius, elevation (DESIGN_SYSTEM §4) ----

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const elevation = {
  e1: {
    shadowColor: light.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  e2: {
    shadowColor: light.textPrimary,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;
