import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';

import { useAuthStore } from './authStore';
import { listCategoryDefs } from '@/db/categories';

import {
  categoryEmojiProblem,
  categoryIcon,
  categoryLabel,
  categoryNameProblem,
  categoryOptions,
  categoryTitle,
  isCategoryHidden,
  useCategoryStore,
} from './categoryStore';

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  useCategoryStore.setState({ defs: [] });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
});

// Roadmap D39: rename, add and hide categories.
describe('categoryStore', () => {
  it('starts with the five built-ins under their own names', () => {
    expect(categoryOptions()).toEqual(['work', 'health', 'finance', 'social', 'personal']);
    expect(categoryLabel('finance')).toBe('finance');
  });

  it('adds a category after the built-ins, with an id that is not its name', async () => {
    const id = await useCategoryStore.getState().add('  Grad   school ');
    expect(id).toMatch(/^c-[a-z0-9]{10}$/);
    expect(categoryLabel(id)).toBe('Grad school');
    const second = await useCategoryStore.getState().add('Family');
    expect(categoryOptions().slice(5)).toEqual([id, second]);
  });

  it('renames a built-in, and back', async () => {
    await useCategoryStore.getState().rename('finance', 'Money');
    expect(categoryLabel('finance')).toBe('Money');
    await useCategoryStore.getState().rename('finance', 'Finance');
    expect(categoryLabel('finance')).toBe('finance');
  });

  it('hides one from the choices, keeping it for an edit that has it', async () => {
    await useCategoryStore.getState().setHidden('social', true);
    expect(isCategoryHidden('social')).toBe(true);
    expect(categoryOptions()).not.toContain('social');
    expect(categoryOptions({ keep: 'social' })).toContain('social');
    expect(categoryOptions({ includeHidden: true })).toContain('social');
    await useCategoryStore.getState().setHidden('social', false);
    expect(categoryOptions()).toContain('social');
  });

  it('keeps what it was given across a reload', async () => {
    const id = await useCategoryStore.getState().add('Research');
    await useCategoryStore.getState().rename('work', 'Job');
    useCategoryStore.setState({ defs: [] });
    await useCategoryStore.getState().load();
    expect(categoryLabel(id)).toBe('Research');
    expect(categoryLabel('work')).toBe('Job');
  });

  it('refuses an empty, long or taken name, in plain words', async () => {
    expect(categoryNameProblem('   ')).toBe('Give it a name.');
    expect(categoryNameProblem('x'.repeat(25))).toBe('Keep it to 24 characters.');
    expect(categoryNameProblem('HEALTH')).toBe('Another category already has that name.');
    // Renaming a category to its own name, in another case, is fine.
    expect(categoryNameProblem('Health', 'health')).toBeNull();
    await expect(useCategoryStore.getState().add('Work')).rejects.toThrow(
      'Another category already has that name.',
    );
  });

  it('names an added category with no row of its own "Other"', () => {
    expect(categoryLabel('c-abcdef1234')).toBe('Other');
  });

  // A name the person typed shows as typed; style capitalising made
  // "Grad school" read "Grad School".
  it('titles a built-in by its word and a named one exactly as typed', async () => {
    expect(categoryTitle('health')).toBe('Health');
    const id = await useCategoryStore.getState().add('Grad school');
    expect(categoryTitle(id)).toBe('Grad school');
    await useCategoryStore.getState().rename('work', 'my job');
    expect(categoryTitle('work')).toBe('my job');
    expect(categoryTitle('overall')).toBe('Overall');
  });

  // Review 2026-11-01: hiding every category left Log nothing to save under.
  it('keeps the last category offered on', async () => {
    for (const c of ['work', 'health', 'finance', 'social'] as const) {
      await useCategoryStore.getState().setHidden(c, true);
    }
    await expect(useCategoryStore.getState().setHidden('personal', true)).rejects.toThrow(
      'Keep at least one category on',
    );
    expect(categoryOptions()).toEqual(['personal']);
  });

  // Review 2026-11-01: a built-in can always go back to its own word.
  it("keeps a renamed built-in's own word free for it", async () => {
    await useCategoryStore.getState().rename('health', 'Body');
    expect(categoryNameProblem('Health')).toBe('Another category already has that name.');
    expect(categoryNameProblem('Health', 'health')).toBeNull();
  });
});

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

// Roadmap D40: an emoji or a picture for any category, built-ins included.
describe('category icons', () => {
  it('gives a built-in an emoji, keeps it on disk, and goes back to the default', async () => {
    await useCategoryStore.getState().setIcon('health', { kind: 'emoji', emoji: ' 🏃 ' });
    expect(categoryIcon('health')).toEqual({ kind: 'emoji', emoji: '🏃' });
    const userId = useAuthStore.getState().userId as string;
    expect((await listCategoryDefs(userId)).find((d) => d.id === 'health')?.icon).toEqual({
      kind: 'emoji',
      emoji: '🏃',
    });
    // An icon alone leaves the name and the switch as they were.
    expect(categoryLabel('health')).toBe('health');
    expect(isCategoryHidden('health')).toBe(false);
    await useCategoryStore.getState().setIcon('health', null);
    expect(categoryIcon('health')).toBeNull();
  });

  it('gives an added category a picture, which a rename and a hide keep', async () => {
    const id = await useCategoryStore.getState().add('Grad school');
    await useCategoryStore.getState().setIcon(id, { kind: 'image', uri: PNG });
    await useCategoryStore.getState().rename(id, 'PhD');
    await useCategoryStore.getState().setHidden(id, true);
    expect(categoryIcon(id)).toEqual({ kind: 'image', uri: PNG });
    // And setting an icon keeps the name and the hide.
    await useCategoryStore.getState().setIcon(id, { kind: 'emoji', emoji: '🎓' });
    expect(categoryLabel(id)).toBe('PhD');
    expect(isCategoryHidden(id)).toBe(true);
  });

  it('refuses a word, or something that is not a picture', async () => {
    await expect(
      useCategoryStore.getState().setIcon('work', { kind: 'emoji', emoji: 'ok' }),
    ).rejects.toThrow('Use just one emoji.');
    await expect(
      useCategoryStore
        .getState()
        .setIcon('work', { kind: 'image', uri: 'https://example.com/a.png' }),
    ).rejects.toThrow("That picture couldn't be used.");
    expect(categoryIcon('work')).toBeNull();
  });

  it('takes exactly one emoji, joined ones and flags included', () => {
    for (const ok of ['🎓', '❤️', '👨‍👩‍👧', '🇯🇵', '👍🏽']) {
      expect(categoryEmojiProblem(ok)).toBeNull();
    }
    expect(categoryEmojiProblem('')).toBe('Pick an emoji.');
    expect(categoryEmojiProblem('🎓📚')).toBe('Use just one emoji.');
    expect(categoryEmojiProblem('A')).toBe('Use an emoji, not a letter.');
    expect(categoryEmojiProblem('🎓 x')).toBe('Use just one emoji.');
  });
});
