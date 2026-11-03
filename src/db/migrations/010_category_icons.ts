// Category icons (roadmap D40, decided 2026-11-03): the person gives any
// category, a built-in included, an emoji or a small picture of their own.
// Two columns, at most one set: `icon_emoji` holds one emoji, `icon_image` a
// PNG data URI of about 120 pixels square. Device-local, like the names.

export const MIGRATION_010 = /* sql */ `
  ALTER TABLE categories ADD COLUMN icon_emoji TEXT;
  ALTER TABLE categories ADD COLUMN icon_image TEXT;
`;
