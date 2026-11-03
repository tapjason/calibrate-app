// Category icons (roadmap D40, decided 2026-11-03): the person gives any
// category, a built-in included, an emoji or a small picture of their own.
// Two columns, at most one set: `icon_emoji` holds one emoji, `icon_image` a
// PNG data URI of about 120 pixels square. Device-local, like the names.
//
// Its id stays '010_category_icons' (see index.ts): it was written as 010 on
// the same day as 010_age_bucket, and web builds had already run it under
// that id. A new id would run its ALTER TABLE again there and fail on the
// duplicate column.

export const MIGRATION_011 = /* sql */ `
  ALTER TABLE categories ADD COLUMN icon_emoji TEXT;
  ALTER TABLE categories ADD COLUMN icon_image TEXT;
`;
