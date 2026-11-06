-- When a prediction's words were last changed (roadmap D45, decided
-- 2026-11-06). A reworded prediction counts as one made then: an answer that
-- day isn't scored, and it can't be due before the next day. Changing "The
-- Fed holds rates" to "The Fed does NOT hold rates" at the same 70% on the
-- day the news came out was the same as moving the number after the fact
-- (blind playtest 2026-11-05).
--
-- Nullable, no default: older rows and older clients leave it empty. Clients
-- send it only once TITLE_EDIT_SYNC in src/constants/app.ts is on, which
-- waits for this migration on the live project; before it, an upsert naming
-- the column would fail on every sync.

alter table public.predictions
  add column if not exists title_edited_at timestamptz;
