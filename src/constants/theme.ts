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

export interface Palette {
  // Brand (indigo — matches the icon and splash). Chrome, never data.
  brand50: string;
  brand100: string;
  brand200: string;
  brand400: string;
  brand600: string;
  brand700: string;
  brand800: string;
  brand900: string;
  brand950: string;
  /** Text/icons on a brand600 fill. */
  onBrand: string;
  /** Brand as text or selection ink on the canvas. */
  brandText: string;

  // Neutrals (indigo-tinted).
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
  // Never used for Yes/No outcomes (rule 0.4).
  overMark: string;
  overText: string;
  underMark: string;
  underText: string;
  calibratedMark: string;
  calibratedText: string;

  // Integrity bonus (35–65%): a brand chip, not a green "good job".
  integrityText: string;
  integrityBackground: string;

  // Caution: a warning before an irreversible step (account deletion). Not
  // an outcome colour and never used for a miss.
  cautionText: string;
  cautionBackground: string;

  // Oracle emblem only: the gold hairline and the gradient's far stop.
  oracleGold: string;
  oracleViolet: string;
}

const light: Palette = {
  brand50: '#EEF2FF',
  brand100: '#E0E7FF',
  brand200: '#C7D2FE',
  brand400: '#818CF8',
  brand600: '#4F46E5',
  brand700: '#4338CA',
  brand800: '#3730A3',
  brand900: '#312E81',
  brand950: '#1E1B4B',
  onBrand: '#FFFFFF',
  brandText: '#4F46E5', // 5.83:1 on canvas

  canvas: '#F6F6FA',
  surface: '#FFFFFF',
  surfaceSunken: '#EFEFF6',
  hairline: '#E2E2EC',
  controlBorder: '#8A889E', // 3.44:1 on white (UI ≥ 3:1)
  textPrimary: '#16142E', // 16.6:1 on canvas
  textSecondary: '#4E4C66', // 7.64:1 on canvas
  textTertiary: '#6B6982', // 4.91:1 canvas · 4.62:1 sunken
  destructive: '#C4271C', // 5.75:1 on white

  overMark: '#D55E00',
  overText: '#B84E00',
  underMark: '#0084C7',
  underText: '#006C9E',
  calibratedMark: '#009E73',
  calibratedText: '#00785A',

  integrityText: '#3730A3', // brand800 on brand50: 8.88:1
  integrityBackground: '#EEF2FF',

  cautionText: '#92400E', // 6.37:1 on cautionBackground
  cautionBackground: '#FEF3C7',

  oracleGold: '#B7791F',
  oracleViolet: '#6D28D9',
};

/** DESIGN_SYSTEM §2.5 (roadmap D7, decided 2026-10-07). */
const dark: Palette = {
  brand50: '#1E1B4B',
  brand100: '#312E81',
  brand200: '#C7D2FE',
  brand400: '#818CF8',
  brand600: '#4F46E5',
  brand700: '#4338CA',
  brand800: '#A5B4FC',
  brand900: '#312E81',
  brand950: '#1E1B4B',
  onBrand: '#FFFFFF',
  brandText: '#818CF8', // 6.55:1 on dark canvas

  canvas: '#0C0B16',
  surface: '#17162A',
  surfaceSunken: '#211F36',
  hairline: '#2E2C47',
  controlBorder: '#6E6C88',
  textPrimary: '#F4F3FA',
  textSecondary: '#B9B7CE',
  textTertiary: '#9391AC',
  destructive: '#FF6B5E',

  overMark: '#E06B20',
  overText: '#F28A4B',
  underMark: '#2D96D8',
  underText: '#5CB4EC',
  calibratedMark: '#14A87B',
  calibratedText: '#3CC79A',

  integrityText: '#A5B4FC',
  integrityBackground: '#1E1B4B',

  cautionText: '#F5C77A', // 10.7:1 on dark cautionBackground
  cautionBackground: '#2A1A05',

  oracleGold: '#E8B64C',
  oracleViolet: '#6D28D9',
};

export const palettes = { light, dark } as const;

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
// Inter everywhere (roadmap D1, decided 2026-10-07): one face on iOS and web,
// so screenshots match the phone, numbers included (Inter's tabular figures
// via `tabularNums`). Five weights ship: 400, 500, 600, 700, 800.
//
// iOS embeds them at build time (the expo-font plugin in app.json) under the
// family "Inter", so fontFamily plus fontWeight picks the face. Web registers
// the same files under the same family with weight descriptors
// (src/constants/fonts.web.ts), and needs a fallback list: a bare unknown
// family falls through to the browser's serif default.

export const FONT_FAMILY: string = Platform.select({
  web: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  default: 'Inter',
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
