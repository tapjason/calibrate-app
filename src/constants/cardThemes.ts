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
  background: '#0f172a',
  foreground: '#f8fafc',
  muted: '#94a3b8',
  accent: '#64748b',
  divider: '#1e293b',
};

/**
 * Wrapped's free theme. It has always been indigo where the identity card is
 * slate, and the two reading differently is the point — a recap and a verdict
 * are different artifacts. Both are free; a Plus theme applies to both.
 */
export const WRAPPED_DEFAULT_THEME: CardTheme = {
  id: 'midnight',
  name: 'Midnight',
  plus: false,
  background: '#1e1b4b',
  foreground: '#f8fafc',
  muted: '#c7d2fe',
  accent: '#a5b4fc',
  divider: '#312e81',
};

export const CARD_THEMES: readonly CardTheme[] = [
  DEFAULT_THEME,
  {
    id: 'paper',
    name: 'Paper',
    plus: true,
    background: '#faf7f2',
    foreground: '#1c1917',
    muted: '#78716c',
    accent: '#a8a29e',
    divider: '#e7e5e4',
  },
  {
    id: 'ink',
    name: 'Ink',
    plus: true,
    background: '#111827',
    foreground: '#f9fafb',
    muted: '#9ca3af',
    accent: '#6366f1',
    divider: '#374151',
  },
  {
    id: 'forest',
    name: 'Forest',
    plus: true,
    background: '#052e26',
    foreground: '#ecfdf5',
    muted: '#6ee7b7',
    accent: '#34d399',
    divider: '#065f46',
  },
  {
    id: 'ember',
    name: 'Ember',
    plus: true,
    background: '#2a0d0d',
    foreground: '#fff7ed',
    muted: '#fdba74',
    accent: '#fb923c',
    divider: '#7c2d12',
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
