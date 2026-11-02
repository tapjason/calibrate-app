import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';

import { useAuthStore } from './authStore';
import {
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
