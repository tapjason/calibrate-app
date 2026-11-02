// Category store (roadmap D39, decided 2026-11-01): the person renames any
// category, adds their own and hides one from Log's choices. Holds the local
// `categories` rows; predictions only ever carry the id, so a rename touches
// none of them.
//
// Layer rule: L4. Reads and writes through @/db; no business math.

import { create } from 'zustand';

import { listCategoryDefs, upsertCategoryDef } from '@/db/categories';
import { CATEGORIES, isBuiltInCategory, type Category, type CategoryDef } from '@/types';

import { useAuthStore } from './authStore';

const LAST_CATEGORY = 'Keep at least one category on: logging needs one.';

/** Long enough for "Grad school" or "Side project", short enough for a chip. */
export const CATEGORY_NAME_MAX = 24;

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
    const current = get().defs.find((d) => d.id === id);
    // A built-in renamed back to its own name needs no name of its own.
    const ownName = isBuiltInCategory(id) && clean.toLowerCase() === id ? null : clean;
    await upsertCategoryDef({
      id,
      user_id: userId,
      name: ownName,
      hidden: current?.hidden ?? false,
      position: current?.position ?? 0,
      created_at: current?.created_at ?? new Date().toISOString(),
    });
    await get().load();
  },

  setHidden: async (id, hidden) => {
    const userId = requireUserId();
    // Log needs a category to save (D29), so the last one offered stays.
    if (hidden && categoryOptions().filter((c) => c !== id).length === 0) {
      throw new Error(LAST_CATEGORY);
    }
    const current = get().defs.find((d) => d.id === id);
    await upsertCategoryDef({
      id,
      user_id: userId,
      name: current?.name ?? null,
      hidden,
      position: current?.position ?? 0,
      created_at: current?.created_at ?? new Date().toISOString(),
    });
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
