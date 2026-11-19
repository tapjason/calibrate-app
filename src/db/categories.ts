// The person's own category names, hidden flags and order (roadmap D39), and
// their icons (D40).
// Device-local, like the settings; nothing syncs this table yet.

import { isCategory, type CategoryDef, type CategoryIconChoice } from '@/types';

import { getDb } from './client';

interface CategoryRow {
  id: string;
  user_id: string;
  name: string | null;
  hidden: number;
  position: number;
  created_at: string;
  icon_emoji: string | null;
  icon_image: string | null;
}

function toIcon(row: CategoryRow): CategoryIconChoice | null {
  if (row.icon_image) return { kind: 'image', uri: row.icon_image };
  if (row.icon_emoji) return { kind: 'emoji', emoji: row.icon_emoji };
  return null;
}

function toDef(row: CategoryRow): CategoryDef | null {
  if (!isCategory(row.id)) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    icon: toIcon(row),
    hidden: row.hidden === 1,
    position: row.position,
    created_at: row.created_at,
  };
}

/** This user's category rows, added ones in their order. */
export async function listCategoryDefs(userId: string): Promise<CategoryDef[]> {
  const rows = await getDb().all<CategoryRow>(
    `SELECT * FROM categories WHERE user_id = ? ORDER BY position ASC, created_at ASC`,
    [userId],
  );
  return rows.map(toDef).filter((d): d is CategoryDef => d !== null);
}

/**
 * How many of `userId`'s categories hold something only this phone has
 * (review round 6, for the sign-out question): one the person added (its id
 * and name never sync, D39), renamed, gave an emoji or picture (D40), or hid.
 * A built-in's row with none of those (renamed back to its own word, icon
 * reset to the default, shown again) has nothing to lose and isn't counted.
 * An empty name or icon reads as none, as `toDef` and `toIcon` read them.
 */
export async function countLocalOnlyCategories(userId: string): Promise<number> {
  const row = await getDb().get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM categories
       WHERE user_id = ?
         AND (id GLOB 'c-?*'
              OR COALESCE(name, '') != ''
              OR COALESCE(icon_emoji, '') != ''
              OR COALESCE(icon_image, '') != ''
              OR hidden = 1)`,
    [userId],
  );
  return Number(row?.n ?? 0);
}

/** Write one row whole: a new category, a rename, a hide or an icon. */
export async function upsertCategoryDef(def: CategoryDef): Promise<void> {
  await getDb().run(
    `INSERT OR REPLACE INTO categories
       (id, user_id, name, hidden, position, created_at, icon_emoji, icon_image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      def.id,
      def.user_id,
      def.name,
      def.hidden ? 1 : 0,
      def.position,
      def.created_at,
      def.icon?.kind === 'emoji' ? def.icon.emoji : null,
      def.icon?.kind === 'image' ? def.icon.uri : null,
    ],
  );
}
