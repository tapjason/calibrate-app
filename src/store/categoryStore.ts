// Category store (roadmap D39, decided 2026-11-01): the person renames any
// category, adds their own and hides one from Log's choices; since D40
// (2026-11-03) they also give any of them an emoji or a picture. Holds the
// local `categories` rows; predictions only ever carry the id, so a rename
// touches none of them.
//
// Layer rule: L4. Reads and writes through @/db; no business math.

import { create } from 'zustand';

import { listCategoryDefs, upsertCategoryDef } from '@/db/categories';
import {
  CATEGORIES,
  isBuiltInCategory,
  type Category,
  type CategoryDef,
  type CategoryIconChoice,
} from '@/types';

import { useAuthStore } from './authStore';

const LAST_CATEGORY = 'Keep at least one category on: logging needs one.';

/** Long enough for "Grad school" or "Side project", short enough for a chip. */
export const CATEGORY_NAME_MAX = 24;

/**
 * A picked picture is about 120 pixels square (src/media/iconImage.ts), a few
 * kilobytes; anything far bigger isn't one of ours and isn't stored.
 */
export const CATEGORY_ICON_IMAGE_MAX_CHARS = 400_000;

interface CategoryState {
  defs: CategoryDef[];
  /** Read this user's rows. Safe to call again after a sign-in or erase. */
  load: () => Promise<void>;
  /** Add a category; returns its id. Throws with a sentence for a bad name. */
  add: (name: string) => Promise<Category>;
  /** Rename any category, a built-in included. Throws for a bad name. */
  rename: (id: Category, name: string) => Promise<void>;
  /** Hide from Log's choices, or show again. Its predictions stay. */
  setHidden: (id: Category, hidden: boolean) => Promise<void>;
  /**
   * Give any category its own icon (D40), or null for its default symbol.
   * Throws with a sentence for an emoji or picture that won't do.
   */
  setIcon: (id: Category, icon: CategoryIconChoice | null) => Promise<void>;
}

function requireUserId(): string {
  const { userId } = useAuthStore.getState();
  if (!userId) throw new Error('No active user');
  return userId;
}

/** "c-" and ten random lowercase letters and digits: an id, never the name. */
function newCategoryId(): Category {
  let s = '';
  while (s.length < 10) s += Math.random().toString(36).slice(2);
  return `c-${s.slice(0, 10)}`;
}

const tidy = (name: string) => name.trim().replace(/\s+/g, ' ');

/** A category's row as it stands, or a fresh one for a built-in without one. */
function currentDef(defs: CategoryDef[], id: Category, userId: string): CategoryDef {
  return (
    defs.find((d) => d.id === id) ?? {
      id,
      user_id: userId,
      name: null,
      icon: null,
      hidden: false,
      position: 0,
      created_at: new Date().toISOString(),
    }
  );
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  defs: [],

  load: async () => {
    const { userId } = useAuthStore.getState();
    set({ defs: userId ? await listCategoryDefs(userId) : [] });
  },

  add: async (name) => {
    const userId = requireUserId();
    const clean = tidy(name);
    const problem = categoryNameProblem(clean);
    if (problem) throw new Error(problem);
    const added = get().defs.filter((d) => !isBuiltInCategory(d.id));
    const def: CategoryDef = {
      id: newCategoryId(),
      user_id: userId,
      name: clean,
      icon: null,
      hidden: false,
      position: added.reduce((max, d) => Math.max(max, d.position), 0) + 1,
      created_at: new Date().toISOString(),
    };
    await upsertCategoryDef(def);
    await get().load();
    return def.id;
  },

  rename: async (id, name) => {
    const userId = requireUserId();
    const clean = tidy(name);
    const problem = categoryNameProblem(clean, id);
    if (problem) throw new Error(problem);
    // A built-in renamed back to its own name needs no name of its own.
    const ownName = isBuiltInCategory(id) && clean.toLowerCase() === id ? null : clean;
    await upsertCategoryDef({ ...currentDef(get().defs, id, userId), name: ownName });
    await get().load();
  },

  setHidden: async (id, hidden) => {
    const userId = requireUserId();
    // Log needs a category to save (D29), so the last one offered stays.
    if (hidden && categoryOptions().filter((c) => c !== id).length === 0) {
      throw new Error(LAST_CATEGORY);
    }
    await upsertCategoryDef({ ...currentDef(get().defs, id, userId), hidden });
    await get().load();
  },

  setIcon: async (id, icon) => {
    const userId = requireUserId();
    let clean: CategoryIconChoice | null = icon;
    if (icon?.kind === 'emoji') {
      const emoji = icon.emoji.trim();
      const problem = categoryEmojiProblem(emoji);
      if (problem) throw new Error(problem);
      clean = { kind: 'emoji', emoji };
    } else if (icon?.kind === 'image') {
      if (!icon.uri.startsWith('data:image/') || icon.uri.length > CATEGORY_ICON_IMAGE_MAX_CHARS) {
        throw new Error("That picture couldn't be used. Try another.");
      }
    }
    await upsertCategoryDef({ ...currentDef(get().defs, id, userId), icon: clean });
    await get().load();
  },
}));

/**
 * The name a category shows under: its own name if the person gave it one,
 * the built-in's word otherwise ("health", lowercase as it sits in a
 * sentence; chips capitalise it). An added one with no row (a prediction
 * synced from elsewhere, say) reads "Other".
 */
export function categoryLabel(id: Category): string {
  const def = useCategoryStore.getState().defs.find((d) => d.id === id);
  if (def?.name) return def.name;
  return isBuiltInCategory(id) ? id : 'Other';
}

/**
 * The name as a title, for a chip, a row or a card: a name the person gave
 * shows exactly as they typed it ("Grad school"); a built-in's own word is
 * capitalised ("Health"). Style-level capitalising turned "Grad school" into
 * "Grad School". 'overall' (a Coach card about everything) reads "Overall".
 */
export function categoryTitle(id: Category | 'overall'): string {
  if (id === 'overall') return 'Overall';
  const def = useCategoryStore.getState().defs.find((d) => d.id === id);
  if (def?.name) return def.name;
  const word = categoryLabel(id);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The person's own icon for a category (D40), or null for its default symbol. */
export function categoryIcon(id: Category): CategoryIconChoice | null {
  return useCategoryStore.getState().defs.find((d) => d.id === id)?.icon ?? null;
}

/**
 * The categories to offer, in order: the built-ins, then the added ones in
 * the order they were added. Hidden ones are left out unless asked for, or
 * unless one is the current choice (an edit keeps the category it has).
 */
export function categoryOptions(
  opts: { includeHidden?: boolean; keep?: Category | null } = {},
): Category[] {
  const defs = useCategoryStore.getState().defs;
  const hidden = new Set(defs.filter((d) => d.hidden).map((d) => d.id));
  const added = defs
    .filter((d) => !isBuiltInCategory(d.id))
    .sort((a, b) => a.position - b.position)
    .map((d) => d.id);
  return [...CATEGORIES, ...added].filter(
    (c) => opts.includeHidden || !hidden.has(c) || c === opts.keep,
  );
}

/** Whether a category is hidden from Log's choices. */
export function isCategoryHidden(id: Category): boolean {
  return useCategoryStore.getState().defs.some((d) => d.id === id && d.hidden);
}

/**
 * What's wrong with a name, as a sentence, or null: empty, too long, or
 * already another category's name (any case).
 */
export function categoryNameProblem(name: string, renaming?: Category): string | null {
  const clean = tidy(name);
  if (clean.length === 0) return 'Give it a name.';
  if (clean.length > CATEGORY_NAME_MAX) return `Keep it to ${CATEGORY_NAME_MAX} characters.`;
  const lower = clean.toLowerCase();
  const taken =
    categoryOptions({ includeHidden: true }).some(
      (c) => c !== renaming && categoryLabel(c).toLowerCase() === lower,
    ) ||
    // A built-in can always go back to its own word, so nothing else takes it.
    CATEGORIES.some((c) => c !== renaming && c === lower);
  return taken ? 'Another category already has that name.' : null;
}

interface GraphemeSegmenter {
  segment(text: string): Iterable<unknown>;
}
type SegmenterConstructor = new (
  locale?: string,
  options?: { granularity: 'grapheme' },
) => GraphemeSegmenter;

/**
 * How many characters a person sees: Intl.Segmenter where the engine has it;
 * elsewhere a length cap that still lets a family emoji or a flag count as one.
 */
function graphemeCount(text: string): number {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;
  }
  return text.length <= 16 ? 1 : 2;
}

/** Emoji by Unicode property, where the engine supports it; null where not. */
const PICTOGRAPHIC: RegExp | null = (() => {
  try {
    return new RegExp('\\p{Extended_Pictographic}|\\p{Regional_Indicator}|\\u20E3', 'u');
  } catch {
    return null;
  }
})();

/**
 * What's wrong with an emoji for an icon (D40), as a sentence, or null: it
 * must be exactly one emoji, not a letter, a word or several.
 */
export function categoryEmojiProblem(text: string): string | null {
  const clean = text.trim();
  if (clean.length === 0) return 'Pick an emoji.';
  if (/\s/.test(clean) || graphemeCount(clean) !== 1) return 'Use just one emoji.';
  const pictographic = PICTOGRAPHIC ? PICTOGRAPHIC.test(clean) : !/[A-Za-z0-9]/.test(clean);
  return pictographic ? null : 'Use an emoji, not a letter.';
}
