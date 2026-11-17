# Handoff

**Branch:** `builder/cleanup-stale`, from `master` at `2636ff2` (2026-11-16). This file is the
current state, overwritten each PR. The history is in `docs/design/BUILT_LOG.md` (rows 157–187
cover the last stretch) and in git; it isn't repeated here.

## Where things stand

- **`master` = `origin/master` = `2636ff2`:** steps 1–187 built, merged and pushed. The last was
  step 187, the launch page (BUILT_LOG row 187, roadmap D66).
- **This branch:** the stale-code and docs cleanup the owner asked for: trim unused code,
  check every Markdown document against the code, and compact what is outdated or describes
  finished work at length. It removes the `CUSTOM_CATEGORY_SYNC`, `TITLE_EDIT_SYNC` and
  `GUEST_ANALYTICS` flags (all were on) with their off-branches, plus `isHeldLocally` and
  `forTheServer`; uninstalls `expo-crypto` and `expo-status-bar` (nothing imported them);
  retires NEXT_STEPS into `docs/SHIP_READINESS.md` "Open work"; and replaces the
  playtest round briefs 11–19, 21 and 22 with one index, `docs/design/research/round-plans.md`.
  Not merged.
- **Cleanup result:** the full check passes (188 suites, 2,437 tests), the harness check
  passes, and `check.sh --release` passes (expo-doctor 20/20, no dependency drift, iOS export
  7.31 MB, both public pages 200). Also gone: five unused imports and locals, `isKnownEvent`,
  a dead style, two unused test hooks, three test-only exports and the eight `.gitkeep`
  files. A citation check over every doc and code comment shows no reference broken by the
  cleanup (16 were broken before, 2 now: an old permission entry in
  `.claude/settings.local.json` and a path in `docs/design/research/libraries.md`). The code
  diff and the docs had one read-only Opus review each; the code came back clean, and the
  docs' findings are fixed. Removing `expo-crypto` drops a native module, so it lands with
  build 3; nothing on the phone changes. Left on purpose: comments in Supabase migrations
  006–008 still name the removed flags (migrations are history), and the dormant Refine code.

- **Server side, confirmed 2026-11-16 with `npx supabase functions list` and `secrets list`:** the secret is
  `REVENUECAT_DELETE_KEY` (the misspelled one is gone); `coach` (version 14) and
  `delete-account` (version 11) were deployed 2026-11-15, after the last change to either
  function's code.

## On the phone

- **TestFlight 1.0.0 (build 2)** is on the owner's iPhone 17 (iOS 26). It contains steps
  through 186, not 187.
- **Confirmed from the owner's screenshots (2026-11-16):** times follow the 24-Hour Time switch
  (step 185); the paywall's three plans load at $34.99 a year, $4.99 a month and $79.99
  lifetime. After the trial move, the paywall shows "1 month free, then $34.99 a year" on
  Annual and no trial on Monthly (Session 1 item 9 passes). The same screenshot shows the
  title under the clock again: build 2 predates step 187's fix, which Session 3 item 27
  checks on build 3.
- **Found:** the paywall showed the free month on Monthly and none on Annual. The
  introductory offer was attached to `calibrate_plus_monthly`; the owner moved it to
  `calibrate_plus_annual` in App Store Connect (2026-11-16; no code change, no new build).
  Session 1 items 9–10 confirm it on the phone.
- **Not yet seen on a device:** the launch page's hand-over from the splash and the lock screen
  drawn as the launch page (step 187, needs build 3); the paywall's top below the clock (step
  187); step 184's moved-answer lines; guest counts reaching the live project (a row in
  `guest_analytics_events` after a fresh install's Warm-up) and a reworded prediction syncing
  its date (step 186).
- **Earlier, on the development build:** the app lock works ("The face ID lock works now",
  2026-11-15; the passcode fallback is Session 1 item 17); Log's title row clears the Dynamic Island
  (2026-11-12). No item-by-item results for step 180's checks yet.
- **The on-phone checklist** runs in three sessions: Session 1, items 1–18 on build 2;
  Session 2, items 19–24; Session 3, items 25–28 on build 3. No results yet. The 28 items are
  `docs/HUMAN_VERIFICATION.md` "Stage 1 on-phone checklist"; the longer lists are Batches C
  and D, where `/device-check` records results.

## Not reviewed

Reviews are the owner's call (2026-11-15): no reviewer agents after each feature; he asks for
them after several. Not reviewed yet: step 180's round-2 fixes (in `b30235d`), steps 183–187
(`6222465..2636ff2`) and this cleanup branch. When he calls for it: `record-auditor` for step
184 and step 180's reminder change, `code-reviewer` for the rest.

## Owner to-dos, in order

1. Session 1 (items 1–18 on build 2), then send the results; the agent turns failures into
   fixes (`/device-check`).
2. Build 3: `npx eas build --profile production --platform ios`, then
   `npx eas submit --profile production --platform ios`.
3. Sessions 2 and 3.

Done: the secret rename, both function deploys and the trial move (above).

**Blocked on the owner:** the password reset (needs a custom mail sender in Supabase,
`SHIP_READINESS.md` decisions 6 and 12); the under-13 local-only rule (a legal call, decision
2); decisions 5, 8, 9 and 13 (13 before the public release); the beta app description and
review information before outside testers. Everything open, with who does it, is in
`docs/SHIP_READINESS.md` "Open work".

## Notes that still hold

- **Before installing from TestFlight,** delete the development build or Erase first. They
  share a bundle id, so the SQLite data carries over, a Plus mirror from a Test Store purchase
  included (code review, 2026-11-15).
- **`.env.example`** may still list a Google client id variable (the code reviewer says line
  11). Agents don't open `.env` files; it is the owner's to delete.
- **D64's two calls stand as built** (owner, 2026-11-15: "Assume both work for now"):
  reminders have no Happened / Didn't while the lock is on; a phone with no passcode opens
  after one notice.
- **The lock is optional** and off by default. It came from the AI playtests' top privacy
  finding, not from real users; TestFlight feedback decides whether it stays (told to the
  owner 2026-11-15).
- **RevenueCat's "could not check" store status** means the App Store Connect API key is
  missing; that key is optional.
- **AI playtests are finished** (`docs/SHIP_READINESS.md`, "The call"): the next evidence is
  real people on TestFlight (`docs/TESTFLIGHT_PLAN.md`).
- **The phone reaches the dev server through the tunnel** (`npx expo start --dev-client
  --tunnel`, port 8081). The web build for the playtest agents is
  `bash scripts/web-serve.sh start` (port 8097); its database empties on a restart, so reseed
  from `/dev/seed`, and `stop` can miss the server on Windows (`docs/tooling-notes.md`).

## Working rules

Reviews only on the owner's call. All code and tests, and the reviews he calls, are done by
Opus subagents at `xhigh` effort; design, evaluation of screenshots and bugs, playtest design
and delegation are done by Fable (the main session), which doesn't implement directly (owner,
2026-11-16).

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. Last full run on this branch
  (2026-11-16): 188 suites, 2,437 tests; `check.sh --release` passed too. Commit only after `check.sh` itself exits 0: piping it through `tail` once hid a
  failure. If `tsc` reports three typed-route errors, the generated route types are a stub;
  restart the web server after edits under `app/` (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED` (it does on this branch).

## Read first

`CLAUDE.md`, `docs/SHIP_READINESS.md`, `docs/TESTFLIGHT_PLAN.md`,
`docs/HUMAN_VERIFICATION.md`, `docs/design/BUILT_LOG.md`.
