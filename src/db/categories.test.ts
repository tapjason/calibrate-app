// countLocalOnlyCategories (review round 6): what the sign-out question
// counts before it removes the person's own categories, which live only on
// this phone (roadmap D39, D40).

import type { CategoryDef } from '@/types';

import { countLocalOnlyCategories, listCategoryDefs, upsertCategoryDef } from './categories';
import { getDb, setDbForTests } from './client';
import { createTestDb } from './testing';

const def = (over: Partial<CategoryDef> & Pick<CategoryDef, 'id'>): CategoryDef => ({
  user_id: 'me',
  name: null,
  icon: null,
  hidden: false,
  position: 0,
  created_at: '2026-11-01T00:00:00.000Z',
  ...over,
});

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('countLocalOnlyCategories', () => {
  it('is 0 with no rows', async () => {
    expect(await countLocalOnlyCategories('me')).toBe(0);
  });

  it('counts one added, renamed, given an emoji or a picture, or hidden', async () => {
    await upsertCategoryDef(def({ id: 'c-thesis0001', name: 'Thesis', position: 1 }));
    await upsertCategoryDef(def({ id: 'health', name: 'Body' }));
    await upsertCategoryDef(def({ id: 'work', icon: { kind: 'emoji', emoji: '💼' } }));
    await upsertCategoryDef(
      def({ id: 'finance', icon: { kind: 'image', uri: 'data:image/png;base64,AAAA' } }),
    );
    await upsertCategoryDef(def({ id: 'social', hidden: true }));
    expect(await listCategoryDefs('me')).toHaveLength(5);
    expect(await countLocalOnlyCategories('me')).toBe(5);
  });

  it('leaves out a built-in back to its own word, default symbol and shown', async () => {
    await upsertCategoryDef(def({ id: 'personal' }));
    // An empty name or icon reads as none, as the category list reads it.
    await getDb().run(
      `INSERT INTO categories (id, user_id, name, hidden, position, created_at, icon_emoji, icon_image)
         VALUES ('health', 'me', '', 0, 0, '2026-11-01T00:00:00.000Z', '', '')`,
    );
    expect(await countLocalOnlyCategories('me')).toBe(0);
  });

  it('counts an added one even without a name: its id never leaves the phone either', async () => {
    await getDb().run(
      `INSERT INTO categories (id, user_id, name, hidden, position, created_at)
         VALUES ('c-noname0001', 'me', NULL, 0, 1, '2026-11-01T00:00:00.000Z')`,
    );
    expect(await countLocalOnlyCategories('me')).toBe(1);
  });

  it("counts only this account's", async () => {
    await upsertCategoryDef(def({ id: 'c-mine000001', name: 'Mine', position: 1 }));
    await upsertCategoryDef(def({ id: 'c-theirs0001', user_id: 'them', name: 'Theirs', position: 1 }));
    await upsertCategoryDef(def({ id: 'health', user_id: 'them', hidden: true }));
    expect(await countLocalOnlyCategories('me')).toBe(1);
    expect(await countLocalOnlyCategories('them')).toBe(2);
    expect(await countLocalOnlyCategories('nobody')).toBe(0);
  });
});
