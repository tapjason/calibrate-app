-- Categories the person adds (roadmap D39, decided 2026-11-01).
--
-- The app files a prediction under one of the five built-ins or under an
-- added category's id: "c-" and 4 to 24 lowercase letters or digits. Never
-- the name: names, renames and hidden flags stay on the device for now, so
-- no category name (the person's own text) reaches the server.
--
-- Applied to the live project 2026-11-03, and CUSTOM_CATEGORY_SYNC in
-- src/constants/app.ts turned on the same day, so those predictions sync.

alter table public.predictions
  drop constraint if exists predictions_category_check;

alter table public.predictions
  add constraint predictions_category_check
  check (
    category in ('work','health','finance','social','personal')
    or category ~ '^c-[a-z0-9]{4,24}$'
  );
