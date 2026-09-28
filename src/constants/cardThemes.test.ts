import {
  CARD_THEMES,
  DEFAULT_THEME,
  WRAPPED_DEFAULT_THEME,
  availableThemes,
  resolveTheme,
} from './cardThemes';
import { contrastRatio } from './contrast';

describe('the theme catalogue', () => {
  // CLAUDE.md: nothing that produces a shareable artifact is ever paywalled.
  // A free user must always have a working theme.
  it('keeps the default theme free', () => {
    expect(DEFAULT_THEME.plus).toBe(false);
    expect(WRAPPED_DEFAULT_THEME.plus).toBe(false);
    expect(availableThemes(false)).toContainEqual(DEFAULT_THEME);
  });

  it('offers extra themes to Plus', () => {
    expect(availableThemes(true).length).toBeGreaterThan(
      availableThemes(false).length,
    );
  });

  it('has unique ids', () => {
    const ids = CARD_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every theme a full palette', () => {
    for (const theme of CARD_THEMES) {
      for (const key of ['background', 'foreground', 'muted', 'accent', 'divider'] as const) {
        expect(theme[key]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe('resolveTheme', () => {
  it('returns a chosen theme for a subscriber', () => {
    expect(resolveTheme('forest', true).id).toBe('forest');
  });

  // A lapsed subscriber keeps every card they can make, just in the free look.
  // Never an error, never a blank card.
  it('falls back to free when the user is not entitled', () => {
    expect(resolveTheme('forest', false)).toEqual(DEFAULT_THEME);
  });

  it.each([
    ['an unknown id', 'chartreuse'],
    ['null', null],
    ['undefined', undefined],
  ])('falls back to free for %s', (_label, id) => {
    expect(resolveTheme(id, true)).toEqual(DEFAULT_THEME);
  });

  it('lets a free user keep using the free theme', () => {
    expect(resolveTheme(DEFAULT_THEME.id, false)).toEqual(DEFAULT_THEME);
  });
});

// Every text colour on a card is read at thumbnail size in a chat thread, and
// the footer hook (accent) is the growth loop's call to action — it can't be
// the faintest thing on the card. Text ≥ 4.5:1 (DESIGN_SYSTEM §0 rule 7).
describe('card theme contrast', () => {
  const themes = [DEFAULT_THEME, WRAPPED_DEFAULT_THEME, ...CARD_THEMES];
  it.each(
    themes.flatMap((t) =>
      (['foreground', 'muted', 'accent'] as const).map((k) => [
        t.name,
        t.id,
        k,
        t[k],
        t.background,
      ]),
    ),
  )('%s (%s) %s on background ≥ 4.5:1', (_name, _id, _key, fg, bg) => {
    expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(4.5);
  });
});
