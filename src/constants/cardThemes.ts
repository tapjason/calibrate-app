// Share-card themes. The cosmetic half of Plus.
//
// The rule that shapes this file (CLAUDE.md): **nothing that produces a
// shareable artifact is ever paywalled.** So the default theme is free, always
// selectable, and the one every card falls back to. Plus sells *extra* themes —
// self-expression on top of an artifact the free tier already exports at full
// quality. A locked theme changes how a card looks, never whether it exists.
//
// Colors live here rather than in the card components so the identity card,
// the Wrapped card, and the picker can't drift apart, and so a future theme is
// one entry rather than three edits.
//
// Values are the app's own (roadmap D33, 2026-11-01), not a framework's
// palette; muted and accent are each ≥ 4.5:1 on their background.

/** Every color a card needs. */
export interface CardTheme {
  id: string;
  /** Shown in the picker. */
  name: string;
  /** False for the default theme; true for the Plus-only ones. */
  plus: boolean;
  background: string;
  /** Headline and primary text. */
  foreground: string;
  /** Sublines and the footer hook. */
  muted: string;
  /** Eyebrow and small caps. */
  accent: string;
  /** The footer's hairline. */
  divider: string;
}

/**
 * The free theme. Never gated, and the fallback for every unknown id — a card
 * whose theme can't be resolved still renders and still exports.
 */
export const DEFAULT_THEME: CardTheme = {
  id: 'midnight',
  name: 'Midnight',
  plus: false,
  background: '#131418',
  foreground: '#F3F4F6',
  muted: '#A6AAB3', // 7.91:1
  accent: '#8E929C', // 5.91:1
  divider: '#2A2C32',
};

/**
 * Wrapped's free theme. The identity card is dark and the recap is light, and
 * the two reading differently is the point: a recap and a verdict are
 * different artifacts. Both are free; a Plus theme applies to both. (Wrapped
 * was indigo until roadmap D33, 2026-11-01.)
 */
export const WRAPPED_DEFAULT_THEME: CardTheme = {
  id: 'midnight',
  name: 'Midnight',
  plus: false,
  background: '#ECEEF1',
  foreground: '#15171B',
  muted: '#4B4F58', // 7.06:1
  accent: '#5B5F69', // 5.50:1
  divider: '#D3D6DC',
};

export const CARD_THEMES: readonly CardTheme[] = [
  DEFAULT_THEME,
  {
    id: 'paper',
    name: 'Paper',
    plus: true,
    background: '#F4F4F0',
    foreground: '#17181B',
    muted: '#4F5259', // 7.10:1
    accent: '#5F626A', // 5.53:1
    divider: '#DCDCD6',
  },
  {
    id: 'ink',
    name: 'Ink',
    plus: true,
    background: '#08090A',
    foreground: '#F5F5F6',
    muted: '#A2A5AC', // 8.08:1
    accent: '#D2AE5B', // 9.44:1
    divider: '#25262A',
  },
  {
    id: 'forest',
    name: 'Forest',
    plus: true,
    background: '#10261F',
    foreground: '#E9F2EE',
    muted: '#9CC7B4', // 8.52:1
    accent: '#6CBB98', // 6.97:1
    divider: '#21423A',
  },
  {
    id: 'ember',
    name: 'Ember',
    plus: true,
    background: '#2A1411',
    foreground: '#FAF0EA',
    muted: '#E2AE94', // 8.88:1
    accent: '#E58A5F', // 6.74:1
    divider: '#4A261E',
  },
];

/**
 * Resolve a stored theme id for a user.
 *
 * Two ways to land on the default: an id nobody recognizes (a theme removed in
 * a later version, a corrupted preference), or a Plus theme held by someone
 * who is no longer Plus. The second is the one that matters — a lapsed
 * subscriber keeps every card they can make, just in the free look, and never
 * hits an error or an empty screen.
 */
export function resolveTheme(id: string | null | undefined, isPlus: boolean): CardTheme {
  const theme = CARD_THEMES.find((t) => t.id === id);
  if (!theme) return DEFAULT_THEME;
  if (theme.plus && !isPlus) return DEFAULT_THEME;
  return theme;
}

/** Themes this user can actually apply right now. */
export function availableThemes(isPlus: boolean): CardTheme[] {
  return CARD_THEMES.filter((t) => isPlus || !t.plus);
}
