# Handoff

**Branch:** `builder/review-2026-11-18`, the owner-called security and code review of
2026-11-18/19: eight fix rounds on top of `6b71795`, commits `c7bf083`,
`6830354`, `7b5b0ea`, `893d404`, `800cd2f` and `3d6439f`. **Merged into `master`
(fast-forward) and pushed 2026-11-19** on the owner's word. **The public pages did not
change with that push:** the repo is public and Pages serves `master`'s `docs/`, so the
rewritten `docs/PRIVACY_POLICY.md` and `docs/SUPPORT.md` are held off the site and the
pages live since 2026-11-18 are served from `docs/PRIVACY_POLICY.live.md` and
`docs/SUPPORT.live.md` (`docs/_config.yml` says how to switch, in one commit, once the
policy's header steps are done). The owner's decisions are D69 in `docs/design/UI_ROADMAP.md`; what changed is in
`CLAUDE.md` (D41, D45, "Accounts and the data on the phone"). The next build must be a new
**development build and TestFlight build**: `expo-secure-store` and `expo-crypto` are native.
Before strangers get it, the owner works down `supabase/README.md`'s ordered checklist
(2026-11-19 section): audit-log setting and purge, migrations 010, 011, 012 with their checks,
pg_cron, three redeploys (`coach` from this branch's final commit, never `6830354`), then
tells the agent "011 is live" so `UTC_OFFSET_SYNC` can be turned on in a later build. The
rewritten privacy policy and support page publish only after those steps
(`docs/PRIVACY_POLICY.md`'s top comment), by the switch in `docs/_config.yml`.
Before this review: `master` held steps 1–196, the cleanup and the two studies, merged and
pushed 2026-11-18. The order of what is left before submission is
`docs/SHIP_READINESS.md`, "What stands between here and the store".
**Build 3** (1.0.0 (3), from `d7691ec`) finished on EAS 2026-11-18; the owner
submits it. `check.sh --release` passes on that commit (expo-doctor 20/20, no drift, iOS
export 7.32 MB, both public pages 200). This file is the
current state, overwritten each PR. The history is in `docs/design/BUILT_LOG.md` (rows 157–188
cover the last stretch) and in git; it isn't repeated here.

## Where things stand

- **`master` = `origin/master`:** steps 1–194 and the cleanup, merged (fast-forward) and pushed
  2026-11-17 and 2026-11-18. The privacy policy that names Google went live with that push. Build 2 on the phone has steps through 186.
- **The cleanup (`builder/cleanup-stale`):** the stale-code and docs cleanup the owner asked for: trim unused code,
  check every Markdown document against the code, and compact what is outdated or describes
  finished work at length. It removes the `CUSTOM_CATEGORY_SYNC`, `TITLE_EDIT_SYNC` and
  `GUEST_ANALYTICS` flags (all were on) with their off-branches, plus `isHeldLocally` and
  `forTheServer`; uninstalls `expo-crypto` and `expo-status-bar` (nothing imported them);
  retires NEXT_STEPS into `docs/SHIP_READINESS.md` "Open work"; and replaces the
  playtest round briefs 11–19, 21 and 22 with one index, `docs/design/research/round-plans.md`.
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

- **Step 188 (`builder/delete-confirm`):** the owner's TestFlight requests, round 1
  (BUILT_LOG row 188): Delete account and Erase ask again in a system alert; the Coach's
  disclosure says "a third-party AI service" instead of OpenAI; the paywall's "1 month free"
  pill, "No free trial" and a heading over the trial timeline; Sign in / Create account as a
  two-part switch. JS only, for build 3.

- **Step 189 (`builder/coach-plus-check`, BUILT_LOG row 189):** Session 1 item 13.
  - **Server.** When the `entitlements` row doesn't say Plus, `coach` asks RevenueCat directly:
    v2 active entitlements, through `supabase/functions/_shared/revenuecatLookup.ts`. On a yes it
    writes the row and serves the request. It fails closed and answers 403 `not_entitled`.
  - **Webhook.** A TRANSFER carries no entitlement, so `revenuecat-webhook` used to ignore it
    always. It now looks up each uuid in it and writes the result.
  - **Client.** A 403 gets its own words ("Coach couldn't confirm your Plus subscription
    yet…"). With no scored answer the Coach sends nothing and now says so ("Coach reads
    your scored answers, and you don't have one yet…").
  - **Probable cause of item 13:** this second case. Session 1's only answer is item 5's,
    which is same-day and so not scored, and build 2 called that "unavailable".
  - **Check:** 190 suites, 2,562 tests. Not reviewed, and not run on Deno: `_shared` bundling
    and the live RevenueCat responses are unverified.
  - **Owner steps (B4) done 2026-11-18:** `REVENUECAT_READ_KEY` set; `coach` version 16 and
    `revenuecat-webhook` version 13 deployed from this branch (`functions list`); the webhook
    boots on Supabase (an unsigned POST gets its own 401). Left: the retest after a scored
    answer. `entitlements` holds 1 row since (table-stats estimate, 2026-11-18; 0 before),
    `coach_usage` still 0. Deploy log warned about a comment the CLI read as an import (fixed since; harmless).
    What B4 asked for:
    1. A v2 secret key with `customer_information:customers:read` and
       `project_configuration:entitlements:read` only.
    2. `npx supabase secrets set REVENUECAT_READ_KEY=…`.
    3. Deploy `coach`, then `revenuecat-webhook --no-verify-jwt`.

- **Step 190 (`builder/password-rules`, BUILT_LOG row 190):** Create account asks for 8 or
  more characters with an uppercase letter, a lowercase letter and a number, as a four-row
  checklist; Sign in is unchanged. JS only, for build 4. The owner sets the matching rule in
  Supabase (`HUMAN_VERIFICATION.md` A5). Check: 190 suites, 2,585 tests. Not reviewed.

- **Colour study (2026-11-18):** `docs/design/research/colour-2026-11.md`; its mocks are at
  https://claude.ai/artifact/5wvN6NgASDwyLpMkLzcWRu (private to the owner). Decided as D67
  (below). Its leftovers are steps 195 and 196.
- **Step 195 (`builder/sunken-contrast`, commit `90358fa`, BUILT_LOG row 195):** the study's
  contrast leftovers. `controlBorder` is 2.93:1 on light `surfaceSunken`, so every edge drawn
  there takes `textTertiary` (4.66:1; 4.92:1 dark): a secondary button on the coverage,
  reminder and backup nudges (`onSunken` on `Button`), the practice offer's chips, the
  sign-in switch, Share's tabs and an empty coverage range. The chart's zone words sit on a
  canvas halo (4.62:1; "Overconfident" was 4.27:1 over its tint). A chosen moment chip stays
  ink while pressed (it was 1.19:1). DESIGN_SYSTEM's two wrong figures are corrected. No hex
  changed. Not built, the builder's alternative: darkening `controlBorder` itself (light
  `#7F838D`, dark `#727680`) clears every fill and would let the swaps go; the owner's call.
  Web build: every change measured at 393 and 320, light and dark; all pass.
- **D68, hierarchy on Insights and Today, decided 2026-11-18** (owner, on the mocks at
  https://claude.ai/artifact/6jdUjs8pnVtftkTjdPWVot: "Go with A"). **Step 196 (BUILT_LOG row
  196):** under Insights' rating the lines keep their words and order in three groups 12 pt
  apart, with the points line as the lead (`subhead`, ink); on Today the streak and practice
  rows sit 8 pt apart and the backup card follows them. Styles and one reorder. Not adopted:
  Insights B and C, Today B (worth another look once A is on the phone in dark). On the
  agent's recommendation the same day: `controlBorder` keeps its value, and the lead line
  stays as built beside the bolder link under it, to be judged on the phone. Web build: every
  gap measured in every state; all match.

- **Step 191 (same branch, BUILT_LOG row 191):** deleting an account that Supabase linked to
  Apple after an email sign-up now revokes Sign in with Apple (`hasAppleIdentity`; the app read
  only the first provider). JS only. Check: 190 suites, 2,612 tests. Not reviewed.
- **Step 192, Google sign-in (BUILT_LOG row 192): built and on.** The owner decided
  2026-11-18: Google through the system sign-in sheet with no SDK, no Facebook, the name and
  picture Google sends discarded. He finished `HUMAN_VERIFICATION.md` A6 the same day (Google
  Cloud, the Supabase provider, the redirect URL, migration 009, both triggers confirmed
  enabled), so `GOOGLE_SIGN_IN_ENABLED` is `true`, and the privacy policy (effective
  2026-11-18), `APP_PRIVACY.md` and the review notes say so. **The policy goes live when
  this branch is pushed to `master`, so push and build 4 go together.** "Confirm email" must
  stay on. Left for him after build 4: one Google sign-in on the phone (Session 3 item 32)
  and query 2 in the migration. Check: 195 suites, 2,756 tests. Not reviewed; nothing has
  run on a device.
- **D67, colour, decided 2026-11-18; steps 193 and 194 built (BUILT_LOG rows 193–194):** the
  streak row's flame is an outline until today counts, then filled, with a larger count and
  "Today's goal" under the dots; a checkpoint (7, 30, 100, 365, yearly) plays a moment once
  that day, on the answer's card or, after a log, on Today's streak row. Raspberry waits for
  TestFlight feedback; no orange flame, brand colour or warm neutrals. JS only, for build 4.
  Check: 194 suites, 2,751 tests. Not reviewed; motion and haptics have run in Jest and the
  web build only.

## On the phone

- **TestFlight 1.0.0 (build 2)** is on the owner's iPhone 17 (iOS 26). It contains steps
  through 186, not 187.
- **Confirmed from the owner's screenshots (2026-11-16):** times follow the 24-Hour Time switch
  (step 185); the paywall's three plans load at $34.99 a year, $4.99 a month and $79.99
  lifetime. After the trial move, the paywall shows "1 month free, then $34.99 a year" on
  Annual and no trial on Monthly (Session 1 item 9 passes). The same screenshot shows the
  title under the clock again: build 2 predates step 187's fix, which Session 3 item 27
  checks on build 3.
- **Session 1 (2026-11-17):** the owner reports everything working except item 13: Insights →
  Get feedback says "Coach is unavailable right now" while signed in with Plus. No item-by-item
  list yet, so the boxes stay unticked. Diagnosis so far (read-only, 2026-11-17): the live
  `entitlements` and `coach_usage` tables are both empty, so every Coach call stops at the
  server's Plus check (403); `OPENAI_API_KEY` is set and `REVENUECAT_IGNORE_SANDBOX` and
  `COACH_ALLOW_UNENTITLED` are not. The RevenueCat webhook never wrote the purchase. Asked the
  owner for: the webhook's URL, environment (Sandbox included?) and app scope in RevenueCat;
  the purchase's App User ID (a Supabase uuid, or `$RCAnonymousID`) and webhook delivery; the
  `coach` invocations' status. The fix (a setting, or the function asking RevenueCat when its
  table has no row) and kinder words than "unavailable" for a 403 wait on that.
- **Guest usage counts reach the live project** (step 186): `guest_analytics_events` holds 23
  rows (`supabase inspect db table-stats`, 2026-11-17).
- **Found:** the paywall showed the free month on Monthly and none on Annual. The
  introductory offer was attached to `calibrate_plus_monthly`; the owner moved it to
  `calibrate_plus_annual` in App Store Connect (2026-11-16; no code change, no new build).
  Session 1 items 9–10 confirm it on the phone.
- **Session 3 on build 3 (2026-11-18):** items 25–28 and 30 pass, and the Coach answers
  (item 13). Item 29 passes except the paywall's free-month pill, which the owner's Apple ID
  can't show: it has used the trial, and the paywall leaves the offer off for a customer the
  store says isn't eligible. Sessions 1 and 2 still have no item-by-item list.
- **Not yet seen on a device:** the launch page's hand-over from the splash and the lock screen
  drawn as the launch page (step 187, needs build 3); the paywall's top below the clock (step
  187); step 184's moved-answer lines; a reworded prediction syncing its date (step 186); all of
  step 188.
- **Earlier, on the development build:** the app lock works ("The face ID lock works now",
  2026-11-15; the passcode fallback is Session 1 item 17); Log's title row clears the Dynamic Island
  (2026-11-12). No item-by-item results for step 180's checks yet.
- **The on-phone checklist** runs in three sessions: Session 1, items 1–18 on build 2;
  Session 2, items 19–24; Session 3, items 25–30 on build 3 (results above) and items 31–33 on build 4. The 33 items are
  `docs/HUMAN_VERIFICATION.md` "Stage 1 on-phone checklist"; the longer lists are Batches C
  and D, where `/device-check` records results.

## Not reviewed

Reviews are the owner's call (2026-11-15). The 2026-11-18/19 review covered steps 180–196 and
the whole security surface (server, client, Coach, record, policy), with three re-review
rounds on the fixes; its last round verifies round 7's deletion fix. Nothing on this branch
has run on a real database or on the iPhone: migrations 010–012 are proven only by the
README's checks, and the native changes by the next development build.

## Owner to-dos, in order

1. Session 1 (items 1–18 on build 2), then send the results; the agent turns failures into
   fixes (`/device-check`).
2. Build 3: `npx eas build --profile production --platform ios`, then
   `npx eas submit --profile production --platform ios`.
3. Sessions 2 and 3.
4. Build 5 from `master` (steps 195 and 196).
5. On build 5, or a reload of the development build: the chart's zone words at 12 pt and the
   darker edges (backup nudge, practice offer, sign-in switch, Share's tabs), both
   appearances; on Today with VoiceOver, streak, practice, then the backup card; a
   checkpoint's confetti over the practice row; the Insights lead line at the largest text,
   and in dark beside "More about your record".
6. Then the order in `docs/SHIP_READINESS.md`: a code review of steps 183–196 (your call),
   the mail sender, external TestFlight, the store record, the open decisions, the gate.

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
  (2026-11-19, review round 8): 228 suites, 5,139 tests. `check.sh --release`
  passed on the same tree with the two new native packages: expo-doctor 20/20, iOS export
  7.58 MB (bundle 7.17 MB), both public pages 200. Commit only after `check.sh` itself exits 0: piping it through `tail` once hid a
  failure. If `tsc` reports three typed-route errors, the generated route types are a stub;
  restart the web server after edits under `app/` (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED` (it does on this branch).

## Read first

`CLAUDE.md`, `docs/SHIP_READINESS.md`, `docs/TESTFLIGHT_PLAN.md`,
`docs/HUMAN_VERIFICATION.md`, `docs/design/BUILT_LOG.md`.
