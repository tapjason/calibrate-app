-- Categories the person adds (roadmap D39, decided 2026-11-01).
--
-- The app files a prediction under one of the five built-ins or under an
-- added category's id: "c-" and 4 to 24 lowercase letters or digits. Never
-- the name: names, renames and hidden flags stay on the device for now, so
-- no category name (the person's own text) reaches the server.
--
-- Not applied yet (the project is paused). Once applied, set
-- CUSTOM_CATEGORY_SYNC to true in src/constants/app.ts so those predictions
-- start syncing; until then the app keeps them on the phone.

alter table public.predictions
  drop constraint if exists predictions_category_check;

alter table public.predictions
  add constraint predictions_category_check
  check (
    category in ('work','health','finance','social','personal')
    or category ~ '^c-[a-z0-9]{4,24}$'
  );
