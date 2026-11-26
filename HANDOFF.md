# Handoff

**Now, 2026-11-25: `master` holds 1.1.0's app code, merged and reviewed, not pushed.** The owner said
"Merge and review the 3 stacked branches": `builder/phase1-fixes` (D78), `builder/removals` (D79) and
`builder/badges` (D80) were fast-forwarded onto `master`, then reviewed in three rounds (code-reviewer,
record-auditor, policy-auditor, all on Opus at xhigh). Ends: code CLEAN, record HOLDS, policy's last FAIL
(the listing's screenshot list) fixed in the same commit; no code blocker in any round. Fixes: the inline
calendar shows only after "Pick a date" is tapped (Edit opened on a month grid); Edit's date line shows the
date Save keeps (`dueDateSavedForEdit`) and redraws at midnight; the paywall's renewal line carries the
24-hour rule for every subscription; Bronze copy says it comes with 20 scored answers (the explainer:
"…Bronze comes with 20 scored answers; Silver and up say how far you can trust your gut in that
category." — **a change to his approved line, awaiting his OK**); the Coach drops every medal word,
"golden", "top tier", "medal" and "badge"; the privacy policy (effective November 25, 2026, older-builds
sentence in §5), the listing (trivia, What's New draft, review notes 3,972 characters) and docs. `check.sh`
exit 0: 254 suites, 5,548 tests. Nothing on a device.
- **Coach redeployed by the owner, 2026-11-25:** version 19, from 6d9f3b3 (the round-3 medal words); 401
  without a token.
- **His, next:** confirm the 1.1.0 (17) build command;
  phone checks (HUMAN_VERIFICATION: Phase 1 fixes, Removals (D79), Medals and 11:59 (D80)); a signed-out
  paywall must show plans on TestFlight.
- **Pushing `master` publishes the privacy policy and support pages** (GitHub Pages serves `docs/`); the
  policy's date says November 25, 2026, so change it if the push is later.
- **Before submitting 1.1.0:** retake all six screenshots (APP_STORE_LISTING §5); attach the three Plus
  products and the group with complete metadata and the Annual free month; subtitle "Learn when to trust
  your gut", promo line 2 (suggested "Gold in health, Bronze with money?"); merge his four What's New lines
  into the draft (and consider D77/D78 in the review notes' New line); re-seed the demo account with Lifetime.
  His untracked `store-listing-paste-1.1.0.txt` no longer matches the listing.
- **Now: `builder/1.1.1` (2026-11-25), for build 17.** The owner: "Build 17 should only be 1.1.1 right now".
  `app.json` 1.1.1; the listing, privacy policy and support page say 1.1.1 (build 16 was 1.1.0, TestFlight
  only, with the older behaviour). The paywall's "Try again" when the plans don't load ("Plans didn't
  load."), his yes: Opus at xhigh; the version sweep: Sonnet. Not on a device: HUMAN_VERIFICATION "Paywall
  Try again (1.1.1, build 17)". His answers on the UI list are recorded in OWNER_UI_NOTES (one Share button;
  usage stats under Advanced; the Insights reorder in 1.3.0; a web mock before 1.2.0).
- **Simulator pass on 1.1.1** (preview build 58b2af8e from cac4c21, session 01a215c6, 12 min, stopped; shots in
  `.tooling/sim/2026-11-25-1.1.1/`): Log's calendar, the emoji, due words, removals, medal copy, the paywall
  (no key: no Try again) and dark pass. Edit's calendar left "Save changes" below the edge: fixed after the
  run (the reveal now spans the date block through Save and Cancel; Sonnet), not yet seen on a simulator.
  At the largest accessibility text size, Today's header clips and "Calibrating" / "New prediction" break
  mid-word: older than 1.1.1, for 1.2.0. Not reachable on a fresh release build: badges above Getting
  started, "due today by 11:59 PM", reminders. **His:** delete simulator session 01a215c6 on expo.dev.
- **Production build 1.1.1 (17)** (`457a48a7`, from 1f917c0, the owner confirmed the command 2026-11-25),
  finished on EAS: https://expo.dev/accounts/tapjason/projects/calibrate/builds/457a48a7-1c74-424b-b9c3-9c0e388b02fc
  *His:* `npx eas submit --profile production --platform ios`, choosing build 17; tag `submitted-1.1.1` on 1f917c0.
- **Release audit for 1.1.1 (17), `release-auditor` (Opus): GO** on 314bd81. `check.sh --release` exit 0
  (5,562 tests; doctor 20/20; no drift; bundle 7.22 MB, export 7.63 MB); JS only since build 16 except the
  version; `eas whoami` tapjason; three production env names. The owner OK'd the Bronze explainer line and
  the build command, and chose the slogan for the Warm-up card too (2026-11-25: "more relaxed and more
  empathetic"), added after the audit (one line in WarmupCard.tsx).
  **His, before Add for Review:** build 17's signed-out paywall shows three plans with prices (the 2.1(b) risk;
  the screenshot doubles as the products' review shot); `git push origin master` and check /privacy/ reads
  "Effective: November 25, 2026"; retake all six screenshots; in App Store Connect: version 1.1.1 with build 17,
  the three products finished and attached (Annual's free month), What's New, subtitle, promotional text (not
  "Sharp in health"), review notes; re-seed the demo account, Lifetime, one Coach request; then
  `git tag submitted-1.1.1 <build commit>`. Phone: HUMAN_VERIFICATION D79 over build 16, D80, D78, "Paywall
  Try again", a sandbox purchase, Coach, a cold-start baseline.
- **Simulator pass 2 on 1.1.1** (preview 7e403185 from 3360ffd, session 01a215ec, 11 min, stopped; shots in
  `.tooling/sim/2026-11-25-1.1.1-run2/`): WORKS. Edit's "Save changes" fully on screen right after "Pick a
  date" in all four cases (light, dark, custom and Tomorrow); every reachable 1.1.1 note in OWNER_UI_NOTES
  passes, judged by his words. Open for him: whether the Warm-up card's tagline ("How well do you know what
  you know?") also becomes "Learn when to trust your gut". **His:** delete sessions 01a215c6 and 01a215ec.
- **The owner's full UI list** (2026-11-25), each note with its status and the release it goes in:
  `docs/design/OWNER_UI_NOTES_2026-11.md`. The You page redesign for 1.2.0: `docs/design/YOU_REDESIGN.md`.
- **"WhatsApp-like categories" answered (2026-11-25):** all settings (notifications, privacy, Coach and the
  rest) contained in grouped categories on You, which the approved You page redesign does; it stays 1.2.0,
  reviewed by him before any of it is committed. Still open: what "due date centralized" means.
- Later Coach holes (record audit, not blocking): "highest tier", "next tier", "medalist", "trophy" pass.

---

**Now, 2026-11-25: `builder/badges`, branched from `builder/removals` (ad0c41b), committed, not merged or pushed.**
The owner's calls of 2026-11-25 (D80), for 1.1.0: badge names are medals (Tracker → Bronze, Forecaster →
Silver, Sharp → Gold, Oracle → Platinum; "Getting started" and every stored id unchanged, nothing about
earning changes); the word "sharp" is gone from the app's text; one explainer line ("Badges go Bronze,
Silver, Gold, Platinum. Each one says how far you can trust your gut in that category.") on Insights and in
How scoring works; card footers read "Learn when to trust your gut" (his slogan); Gold takes the gold chip,
Platinum the ink chip; Platinum's emblem face, blank on iOS and web before, now draws. An open prediction
due today reads "due today by 11:59 PM" (24-hour phones "by 23:59"); the reminder stays 7 PM. The Coach
forbids the medal words too. `check.sh` exit 0: 254 suites, 5,531 tests. Built by a general-purpose agent
on Opus at xhigh. Web captures in `.tooling/web/2026-11-25-badges/`. Not on any device: HUMAN_VERIFICATION
"Medals and 11:59 (D80)".
- **Coach redeployed by the owner, 2026-11-25:** version 18, from 1d8cde0 on this branch (the server half
  of the medal-word rule; the only server change from `master`); a request with no token gets 401.
- **His:** at submission, the
  slogan for the subtitle/promotional text (APP_STORE_LISTING.md), a new line for promotional text line 2
  ("Sharp in health, shaky with money?"), and a retaken share-card screenshot.
- **Release plan, confirmed by the owner 2026-11-25:** 1.1.0 = everything on this branch stack and the Plus
  subscriptions; the You page redesign waits for 1.2.0, reviewed by him before any of it is committed.

---

**Now, 2026-11-25: `builder/removals`, branched from `builder/phase1-fixes` (d3444da), committed, not merged or pushed.**
The owner's Phase 4 removals (D79): "Hide the words" gone; "Show the words in reminders" gone, so every
reminder reads "Your prediction from Nov 6 · You said 70%" with no Happened / Didn't (older builds'
scheduled reminders are redone at launch; delivered ones keep their buttons and safety rules);
Practice is "Trivia" on screen and its reminder is gone (older scheduled ones cancelled at launch);
"Got a friend's card?" gone; "+" only on Today. `check.sh` exit 0: 254 suites, 5,500 tests. Built by a
general-purpose agent on Opus at xhigh; docs by Sonnet. Web captures in `.tooling/web/2026-11-25-removals/`.
- **His to publish:** PRIVACY_POLICY.md (the reminder-words sentence, the event list) and SUPPORT.md
  changed; GitHub Pages needs republishing when 1.1.0 ships, not before.
- **Release plan, the main session's recommendation (owner to confirm):** 1.1.0 = the voice pass, D77,
  Phase 1 (D78), these removals, the "Due today by 11:59 PM" wording (next to build; the reminder stays
  7 PM), with the three Plus subscriptions attached (they were MISSING_METADATA; first subscriptions must
  ship with a version). 1.2.0 = the You page redesign (approved in the conversation of 2026-11-25:
  profile summary, Plus row, Settings rows Categories / Notifications / Appearance / Privacy / Help /
  Advanced, Account at the bottom) and the other big items. The owner reviews the You page before any
  of it is committed.

---

**Now, 2026-11-24: `builder/phase1-fixes`, branched from `master` (37a3cce), committed, not merged or pushed.**
The owner's Phase 1 of his UI feedback list (D78): "Add" on the new-category field, a category emoji
no longer clipped on iOS, "Pick a date" showing the full calendar at once (inline on iOS, the popup on
web), and due dates in words everywhere on screen ("due in 3 days", "due Nov 21 (Friday)"). `check.sh`
exit 0: 256 suites, 5,539 tests. Web playtest (`web-playtester`, Sonnet): all four pass, no console
errors, captures in `.tooling/web/2026-11-24-phase1/`. Built by `mobile-ui` on Opus at xhigh. Not on
any device: HUMAN_VERIFICATION "Phase 1 fixes".
- **Open, the owner's:** a Today due option (never scorable under D41: add as not scored, change the
  rule after /design, or skip; the main session recommends skip) and what "11:59 PM" should move.
- **Paywall shows no plans signed out** (build 15, his phone and a tester in Germany): two Opus
  diagnoses found no code cause (the identity hold is ruled out against the SDK source and a
  simulation). Leading candidates: Apple's age answer still pending so RevenueCat never started
  (a ~5 s spinner first; sign-in then says "Sign-in isn't ready yet"), or the store/RevenueCat
  returning no offering for a new anonymous customer (RevenueCat Customers in sandbox view shows
  whether one was made). Proposed, not built: a reason line and "Try again" on the paywall.
- The rest of the owner's list (phases 2–6) is in the conversation of 2026-11-24; not yet in the roadmap.

---

**Now, 2026-11-23: `master`, with `builder/voice-pass` merged in (fast-forward) on the owner's words
("Merge and review, if you think we are ready for a minor version bump then go ahead with the new
TestFlight build"), reviewed, not pushed. The voice and text pass (D76, step 212) and the two-choice control at 0 to 100% (D77, step
213), both the owner's that day.** `check.sh` exit 0: 255 suites, 5,506 tests. JS only, no migration,
nothing new leaves the phone. Build 15 on TestFlight has none of it.
- **Production build 1.1.0 (16)** (`8e96d34f`, from `66949b6`, the version bump on top of `77e6954`),
  finished on EAS:
  https://expo.dev/accounts/tapjason/projects/calibrate/builds/8e96d34f-35e2-44d3-9595-76413d89f100
  - *The version is his choice* (asked with the exact command, 2026-11-23: "Build as 1.1.0"), so build
    15 stays the 1.0.1 candidate. *For TestFlight only*; nothing reaches the store.
  - *Pre-flight:* `release-auditor` (Opus) said GO on `77e6954`: `check.sh --release` exit 0 (255
    suites, 5,506 tests; doctor 20/20; no drift; bundle 7.24 MB, export 7.65 MB, the same as build
    15; both pages 200); JS only since build 15, no migration; `eas whoami` and the three production
    environment names in place. `/release-gate` was not run: he waived it for an internal build
    ("go ahead with the new TestFlight build"). The RevenueCat key's prefix wasn't read; build 8's
    paywall is the last proof.
  - *His to do:* `npx eas submit --profile production --platform ios`, choosing build 16; add it to the
    internal group; then the phone checks (the release audit's list: the empty control and numbers
    under 50 in practice and Log, the reminder ask, Insights' short lines and folds, VoiceOver and
    large text on them, and build 15's nine lock and share-link checks if not yet done), recorded
    through `/device-check`. `git push origin master` is his too (7 commits ahead).
  - *Before an App Store submission of 1.1.0:* the review notes (trim about 260 characters, add the two
    additions), What's New, screenshots 01 to 04, the demo account's re-seed, his yes on the listing
    draft, `/release-gate` on the commit, the tag.
- **The review he called** (three rounds; `code-reviewer` and `record-auditor` three times,
  `policy-auditor` once, all Opus at xhigh): it ends CLEAN, HOLDS and no FAIL, and both say the
  result may go to an internal TestFlight build.
  - *Fixed in it:* a category's score was rounded down on Today's and the recap's next-badge line
    and rounded on Insights (in 1.0.0 too); practice's headline now follows the chart's per-range
    rule and can't call a record "close to calibrated" that isn't; Insights' short week line reads
    "About the same as last week." inside the give-or-take; Insights' bar lost its 70 / 85 / 90
    marks (with no caption they read as tiers for the rating); "scored" is back in four counts and
    the same-day heads-up says "won't be scored"; VoiceOver hears the two-choice hint in the
    control's label; the reminder ask names the weekly summary only while the digest is on; test
    gaps (How scoring works' wiring, large text on the readout).
  - *Left, by the reviewers' own word not blockers:* "On average you're about 14 points off." can be
    read as each answer's miss (his approved words); a Warm-up whose errors cancel across 50 reads
    "no clear lean" over two far-off grey dots (D36 against D77); a practice headline that names one
    range sits over a pooled line that can point the other way; "Can't tell" and the badge-fall line
    keep straight apostrophes beside curly ones; "Nothing else." on the reminder ask isn't quite
    true inside a Plus trial (as in 1.0.0).
  - *For the App Store submission, from the policy audit:* the review notes need a "Lock after"
    clause and a what's-new line (about 240 bytes have to come out first); screenshots 01 to 04 show
    old wording or folded text; both are written up in the listing draft.
- **D76, his words:** wording that sounds less like AI, "more personality, and hand-holding … less
  fancy words maybe, but not by too much … less text overall. Much of the score calculation based
  explanations do not need to be on the main page next to the score". He approved the sample sheet
  whole ("I like all your drafts, make the changes"):
  `docs/design/research/voice-sample-sheet-2026-11-23.md`; the plan and what is left of it:
  `voice-and-text-plan-2026-11-23.md` beside it.
  - *Built:* about 60 lines reworded on the Warm-up, Today, Log, open predictions, Resolve, Insights,
    practice and two recap lines. Insights' rating is the number, the bar, "On average you're about
    13 points off.", "What does this mean?", "Up 1 since last week." and the count; the full
    sentences sit on top of How scoring works. The furthest-off row unfolds its detail on a tap; the
    chart's key folds behind "How to read this chart".
  - *The main session's calls, his to overturn:* the coverage line keeps "scored" and says "things
    you thought were unlikely" (not the approved "things you felt sure about"); "20 scored answers
    unlock your score." keeps "scored" where he approved "20 answers"; the practice chart's key is
    folded too; the recap card's next-badge row keeps "To reach …".
- **D77, his words**, against the main session's advice (two answers' chances add to 100): "the
  minimum should never be 50%. It should also not default to -%, since that makes no sense in the
  UI". The Warm-up's and practice's control runs 0 to 100; a number under 50 is scored as said, never
  flipped.
  - *The main session's reading of "not default to -%":* every control still starts empty and Next
    and Save still wait (D13); the empty readout reads "Slide to set" instead of "—%, not set yet",
    on Log too. If he meant a starting number, that reverses D13 and is his to say.
  - *Seen in the web build:* a Warm-up with numbers on both sides of 50 spreads ten answers over
    five ranges, so its small chart zig-zags between dots of one to three answers.
- **Web playtest** (`web-playtester`, Sonnet): works, no console errors from app code; captures in
  `.tooling/web/2026-11-23-voice/`. Its three layout findings are fixed (the readout's height, the
  link's look, the long chart key). Old, not from this pass: at 320 x 568 the Warm-up's first
  question needs a scroll to reach the control, and the chart's "n=" labels sit on the dots.
- **Not run on any device:** everything above. The reminder ask ("Want a nudge at 7 PM on the day
  it's due?") can't show on web. VoiceOver on the new folds, the empty control and the rating's
  spoken give-or-take; Dynamic Type on the readout block and the furthest-off row.
  `HUMAN_VERIFICATION.md`'s unchecked items still quote old wording (the docs agent listed the
  lines); `/device-check` rewrites them for the next build.
- **Who built it:** `core-domain` (Opus, xhigh) for D77's data layer; `mobile-ui` (Opus, xhigh) three
  times (the control and Warm-up, Insights and How scoring works, Today to Resolve); `mobile-ui`
  (Sonnet) twice for exact follow-ups; general-purpose agents (Opus, then Sonnet) for the docs. The review's fixes: `mobile-ui` on Opus
  twice, Sonnet once.
- **Left from the plan:** the Warm-up's answer key folded to the misses, its intro, three starter
  ideas, Insights' empty boxes on Day 0 and the Plus card (the rest of the text-load cuts); a pass
  over You, the paywall and the account screens; the next-step line; the reminder promised before
  permission (`PredictionDetails.tsx`); the Brier line and the badge rows still read in the old
  voice.
- **Store listing:** a draft for 1.0.1 in `docs/design/research/store-listing-draft-1.0.1.md`
  (description 529 to 398 words, promotional text, What's New), not entered anywhere. Apple's rule,
  checked that day: the description changes only with a new version; promotional text at any time.
- **His:** a yes on the listing draft; whether build 15 is submitted as 1.0.1 first or a new build
  with this pass is (`eas build` on his confirmation, after a merge); the phone checks.

**Before it, 2026-11-23: branch `master`, three commits ahead of `origin/master`, not pushed. 1.0.0 is on
the App Store. `builder/lock-after` (which holds `builder/share-campaign-token`) is merged into
`master` (fast-forward) on the owner's words: "Merge for now, and you can bulid with testflight if
it doesn't impact the current release version please."**
- **Production build 1.0.1 (15)** (`fc8d843e`, from `393a680`, the version bump on top of `111bebb`):
  https://expo.dev/accounts/tapjason/projects/calibrate/builds/fc8d843e-8326-4c83-8c20-79cba6c71a1c
  - *For TestFlight only.* It doesn't touch the live 1.0.0: nothing reaches the store until a 1.0.1
    version is made on the App Store tab and sent for review. 1.0.0's train is closed, hence 1.0.1.
  - *Pre-flight:* `release-auditor` (Opus) said GO: `check.sh --release` exit 0 (254 suites, 5,411
    tests; doctor 20/20; no drift; bundle 7.24 MB, export 7.65 MB; both pages 200); JS only since
    `submitted-1.0.0` (only `app.json`'s version changed among the native files; no migration);
    `eas whoami` and the three production environment names in place. He confirmed the command
    ("Yes, run it"), which waived `/release-gate` for an internal TestFlight build.
  - *His to do:* `npx eas submit --profile production --platform ios`, choosing build 15; add it to
    the internal group; then the phone checks (the release audit's nine: the "Lock after" row, a
    return inside and outside the time, Immediately, a relaunch after swiping the app away, the
    cover in the app switcher, the age-range sheet behind the lock, the share link ending
    `?pt=129758335&ct=share-card-text&mt=8`), recorded through `/device-check`. `git push origin
    master` is his too.
  - *Before a 1.0.1 App Store submission:* What's New (say that the lock now waits 5 minutes for
    people who already had it on), the demo account's re-seed, a clause on "Lock after" in the
    review notes, and a review of D75 if he calls one.
- **"Lock after", D75, step 211** (the owner: "users should not have to unlock the phone if they
  are already opening the app … Only if they step away"; asked, he chose the "Lock after"
  choice): the app lock locks only after the person has been away longer than Immediately, 1, 5
  or 15 minutes, 5 to start, at launch and on coming back alike; the Unlock tap (D74) is
  unchanged. `CLAUDE.md` (the app-lock bullet), `UI_ROADMAP.md` D75, `DESIGN_SYSTEM.md` §7.25 and
  `BUILT_LOG.md` 211 have the rule and what was built. `core-domain` then `mobile-ui`, both on
  Opus at xhigh; `check.sh` exit 0, 254 suites, 5,411 tests. JS only.
  - *Not run on any device:* the row in You (two chips to a row at 320 and 375, Dynamic Type,
    light and dark; the web build can't show it, the lock isn't supported there), VoiceOver on
    the group, a return inside and outside the time, a restart after the app is killed in the
    background (the write has to land in iOS's background window; if it doesn't, it locks), the
    cover in the app switcher, and Apple's age-range sheet waiting for the cover. For
    `/device-check` on the next TestFlight build.
  - *No review was called.* It touches the lock and two consent-adjacent readers (the age check
    at launch, the Warm-up's usage line), so `code-reviewer` and `policy-auditor` fit if he
    calls one before 1.0.1.
  - *Seen once:* `predictionStore.test.ts` "an answer from another phone moved here…" failed
    in one full run (`moved: 0`) and passed alone and in every other run; unrelated to the lock.
- **OpenAI spend** (the owner, 2026-11-23): he set the organization's spend limit to $20. The
  Coach's own caps are per user (4 a minute, 25 a day, 400 output tokens, numbers-only input);
  usage tiers aren't worth chasing until `coach` logs show OpenAI's own 429s.
- **His name on the store page:** the Developer, Seller and App Privacy lines show his full legal
  name from the Apple Developer account; only Apple Developer Support can change it. The repo's
  pages say "Jason Zou".

**Before it, 2026-11-23: branch `builder/share-campaign-token`, off `master` (`2aaa769`), committed,
not merged or pushed.** The share campaign token is on (GROWTH §0 step 1): the owner made the
first campaign link in App Store Connect (`pt=129758335`, campaign `share-card-text`) and
`APP_STORE_PROVIDER_TOKEN` is set from it, so a text share's link is
`…/id6831917395?pt=129758335&ct=share-card-text&mt=8`, the same as Apple's own. Built by
`services` on Sonnet (one constant and one test; the brief was exact); `check.sh` exit 0, 253
suites, 5,303 tests. JS only. **1.0.0 on the store doesn't have it: counting starts with the
next build (1.0.1)**, his `eas build` and `eas submit` when there is more to ship with it. The
demo account needs a re-seed before that submission (its dates are relative to 2026-11-22).
Product Page Optimization tests wait for traffic (a few hundred page views a week).

**Before it, 2026-11-23: `master`. Version 1.0.0 (build 14) passed App Review (submitted
2026-11-22; Apple's mail: "It is now eligible for distribution") and App Store Connect shows
"Ready for Distribution" (the owner, 2026-11-23). `harness/expo-simulators` is merged into
`master` (fast-forward) and pushed with the tag `submitted-1.0.0`, on his words that day:
"Merge and push the tags, and I will delete the simulator sessoins."** That afternoon the US
store page loaded and Apple's public lookup didn't list the app yet. Still his: the paywall's
prices and free month on the App Store install, and deleting sessions `01a201f7`, `01a2043c`
and `01a204af` on expo.dev. The branch (below, as written 2026-11-22) was harness and docs only; no app code changed.
- **Expo Simulators is set up** (the owner, 2026-11-21: "adjust the harness to reflect the new
  change"). Expo's cloud iOS Simulator, driven by agents through the Expo MCP server.
  - *Account:* the owner's Expo account has it (`eas simulator:availability` true). eas-cli
    27.11.0 is global.
  - *Plugin:* `expo@claude-plugins-official`, project scope; its server `plugin:expo:expo` is
    signed in.
  - *Harness:* the new agent `sim-playtester`, the simulator pass in `/playtest`,
    `/device-check`, `/build` (`preview`) and `/release-gate`, and the permission entries the
    owner approved as drafted (agent-device `exec` allowed without asking).
  - *Docs:* `docs/tooling-notes.md` "Expo Simulators" has how to drive it and what the first
    runs taught.
  - *Cost:* $0.10 a minute, 60 minutes a month included through 2027; a simulator build is
    about $2.
- **Simulator build** `6b0fd5af` (profile `preview`, from `1b8d8ab`, app code = build 9's), run
  on the owner's confirmation.
  - The `preview` EAS environment has no Supabase or RevenueCat values: You shows no account
    row and the paywall says "Plus isn't available on this build yet." So a simulator run
    can't sign in or load prices, and sends nothing to the live server.
  - Release-style, so no demo data: every run starts from a fresh install. Three ways in, none
    built, are listed in tooling-notes.
- **Two runs.**
  - *Run 1 (dry run, 7 min):* proved the tools: taps by testID or coordinates, typing,
    scrolling with an accessibility diff, screenshots, dark mode, text size.
  - *Run 2 (13 min):* covered `HUMAN_VERIFICATION.md` D9. Every sheet's title and × passes and
    Practice passes, on the simulator.
  - *Passed on by the owner, not run:* the lock's Unlock tap (D74), the paywall's
    "$2.91 / month", D8's offline launch, VoiceOver. He: "if not, they are minor enough to
    document and pass on for the time being".
  - *Sessions:* he deleted run 1's on expo.dev. **Run 2's, `01a201f7`, is still to delete.**
  - *Run 3 (8 min, session `01a2043c`, still to delete):* the main flow end to end on the
    simulator build, whose app code is production build 14's. Works: Warm-up (slider tap, drag,
    ±5), the first log with the keyboard up, "+ New category", Edit, "Answer it now" with the
    early and same-day notes, Resolve, Change answer, the draft kept after a relaunch, History,
    Insights' fold, You's switches and time wheel, Share's card and the native share sheet, and
    dark mode on the four tabs and Log. Safe areas clear everywhere. Captures in
    `.tooling/sim/2026-11-22/run3/`.
- **Text-size findings, deferred** (the owner, 2026-11-22: "Text sizes fixed should be
  documented and ignored for now, since they are a very extreme accessbility edge case"). Not
  scheduled for 1.0.1 or any build; recorded in `HUMAN_VERIFICATION.md` D9.
  - At AX5 (the largest), the tabs' large titles clip and long words break mid-word
    ("Calibratin / g", "predicti / on", "80%" as a column), Today's streak row is cramped and
    Log's Save footer takes about a quarter of the screen.
  - From AX2 (run 3): "Today" and "History" lose their descenders under the bar's hairline,
    History's cards split "30%" into "30" over "%", the category chips are cut at the right
    edge, and Log's Save footer wraps to two lines.
- **App Review demo account, 2026-11-22:** created in Supabase (email-confirmed, a `+review`
  alias of the owner's dev address; credentials only in App Store Connect), seeded with
  `scripts/seed-demo-sql.mjs` (160 predictions, 153 answered; dates relative to that day, so
  re-seed if review slips), Plus granted in RevenueCat, and the Coach returned three cards on
  the owner's iPhone. Re-seed: the same script with the same user id replaces the demo rows.
- **The Coach's cards, for a later build** (the owner, 2026-11-22: "the feedback messages can
  be slightly more personalized? But so far it looks good for the time being"). Seen on the
  demo account: figures to two decimals ("84.76%", "47.62%", "71.43") where the app rounds
  everywhere else; a card headed "Health" whose insight is about Mondays (the weakest
  weekday), so the header doesn't match the body; and generic advice lines ("Consider
  adjusting your confidence in finance predictions."). A prompt and validator pass
  (`COACH_AGENT.md`), on Opus, with the §9 fixtures.
- **Text load, simulator run 4** (session `01a204af`, 6 min; the owner: "focuses on reducing
  text in non-setting related fields"): ranked cuts in
  `docs/design/research/text-load-2026-11-22.md`. Most touch decided copy, so they wait on the
  owner. Found along the way: an open prediction's details promise "a reminder at 7:00 PM"
  before iOS permission is granted (`PredictionDetails.tsx:158` reads only the app's switches).
- **Small, for a later build (not text size):** a large gap on the Sign in sheet; on Warm-up
  question 1 the slider sits partly under the footer until scrolled (the usage-count intro
  pushes it down); "Answer it now"'s early note sits about 10 pt above its button.
- **Build 9 has no phone checks left owed.**
- **Production build 1.0.0 (14)** (`47b5c09f`) is the newest and **the one to submit** (the
  owner, 2026-11-22: "Tag the very recent build for submission, and I will submit to app
  store"). Made from `d7341d8`, a docs-only commit; its app code is build 9's (everything after
  `b944a6c` is docs and harness), so D9's results and run 3 carry over. Builds 13 (same commit),
  12 (`56580bf`), 10 and 9 are superseded. **Tagged `submitted-1.0.0` on `d7341d8`** (local,
  annotated; pushing it is the owner's). His to do: `npx eas submit --profile production
  --platform ios`, choosing build 14, then select build 14 on the version page.

**Branch before this:** `master`. `builder/practice-sheet-header` (step 210, from the owner's device report on build 8; see "Build 8's device report" in the gate's block below) is merged into it (fast-forward) and pushed, 2026-11-21. **Production build 1.0.0 (9), from `b944a6c`, is the one to submit; build 8 is superseded.** Before it: `builder/offline-launch-headings` (step 209, two fixes from the release gate; see the gate's block below) is merged into it (fast-forward) and pushed, 2026-11-21, on the owner's words: "Merge the branc hadn push please, and I will submit this build". Production build 1.0.0 (8) was made from that commit, `7f61f60` (the gate's block below). Before it: `builder/owner-list-19-30` is merged into it (fast-forward) and
pushed, 2026-11-20, on the owner's words that day: "Review steps 202 through 206. If
everything passes then merge and push". The review ran its three rounds (step 207 below).
The push also published the privacy page without its on-device-scan paragraph. The branch
held D72, three of the owner's-list items the owner agreed to on 2026-11-19 ("Agree with
the entire owners list"; then "Start building your items and I will work on mine in
parallel"), built 2026-11-20 as steps 202 to 205, then D73 (206) and the review (207).

**The release gate, 2026-11-20 (the owner ran `/release-gate` while filling in App Store
Connect): NO-GO until his short list is done; nothing in build 7's code blocks.** First
submission, no `submitted-*` tag. The build is production 1.0.0 (7) from `590ab75`; only
docs changed since, so the gate read build 7's code. Every auditor on Opus (`xhigh` for
the four reviews).
- *The check:* `check.sh --release` exit 0 (249 suites, 5,256 tests; doctor 20/20; no
  drift; export 7.63 MB, bundle 7.22 MB; both pages 200).
- *Code review:* no blocker; the §8 checks are clean (no shipped migration edited, ids
  and identity unchanged, `EVENT_PROPS` closed, no flag early). **One should-fix, in
  since build 2:** a signed-in phone launched offline with an expired token waits about
  25 to 50 s on `getSession()` (`src/store/authStore.ts:868`, no timeout), then opens as
  the guest: an empty Today, the account's reminders cancelled, anything logged filed
  under the guest until the next sign-in the person starts. Read from auth-js 2.106.2's
  source; no device has shown it. Fix: a timeout, then open as the stored session's
  account. The owner decides 1.0 or the first update. Nits: the launch-error title has
  no colour token; no `+not-found` route; `UTC_OFFSET_SYNC`'s comment still names 011.
- *Record:* HOLDS, all of R1 to R12; every number on the six store screenshots
  recomputed from the demo data and matching. For later: History's "happened" counts
  answers that weren't scored; the give-or-take depends on row order; `demoData.test.ts`
  doesn't pin the low-end badges.
- *Policy:* the code passes. Round 1 failed four items of store text and docs, all fixed:
  the review notes (rewritten, `docs/APP_STORE_LISTING.md` §4: buy Plus before signing
  in, delete an account of your own, "Answer it now"), the caption "Badges you can’t luck
  into" (now "Badges need a real track record"), `APP_PRIVACY.md`'s default for Canada,
  the listing's header. Round 2 passed three and asked for the app-lock paragraph's two
  clauses back; applied as worded, unread by a reviewer. The published policy is true of
  build 7. Judgment calls left with the owner: the Coach needing an account after a
  guest purchase, "a third-party AI service" unnamed, "Manage or cancel any time" on
  plans with no trial (next build), Contests "None".
- *Playtest (web):* works; both flows at 402 × 874 and 320 × 568, light and dark; no app
  errors. Should-fix: the Warm-up result has no headings for VoiceOver
  (`src/components/warmup/WarmupVerdict.tsx:40, 119`). Notes: "80–100%" wraps at 320;
  a few sheets lack a heading or group name.
- *Release audit:* budgets, config, entitlements, lengths and the screenshots pass.
  Game Center ticked on the version and an empty Contact Information stop "Add for
  Review"; both are App Store Connect settings. iPhone Duo screenshots aren't required
  until April 2027.
- *Checked by the main session:* `auth.audit_log_entries` reads 0 rows (read-only), so
  the notes' Google sentence and the policy's claim hold.
- **What makes it NO-GO, all his:** (1) on the iPhone, never reported on any build: a
  due-day reminder arriving, the largest text size, VoiceOver through one log and
  answer; and on build 7 from TestFlight: Share → Save Image (the Info.plist has no
  `NSPhotoLibraryAddUsageDescription`; a crash there needs a new build) and the paywall
  showing the App Store's prices and the free month; (2) App Store Connect: Game Center
  off, Contact Information, the three products attached with review screenshots, the
  demo account seeded with a Lifetime grant and entered under Sign-In Information, the
  notes, the privacy answers, the age rating, the four storefronts, manual release.
- **The two code fixes are built (step 209; the owner: "Two code fixes now please.")**, on
  `builder/offline-launch-headings`: a phone that holds a sign-in opens as that account
  within 2 s, online or not (`CLAUDE.md` §10 has the rule), and the Warm-up result's two
  titles are headings. The full check passes (251 suites, 5,285 tests); the gate's
  code reviewer re-read the diff: clean. JS only, so no new development build, but
  **build 1.0.0 (7) is no longer the one to submit: a new production build is needed**
  (`eas build`, on his confirmation of the command), then `HUMAN_VERIFICATION.md` D8 and
  the gate's device list on it. The record and policy audits weren't re-run: the diff
  touches no score, no copy and no data leaving the phone (the reviewer's read).
- **Build 1.0.0 (8), 2026-11-21** (superseded the same day by step 210, below). Merged and pushed on his word
  (above); asked which build he meant, he chose "I run build 8 now". Production, commit
  `7f61f60`, finished on EAS
  (https://expo.dev/accounts/tapjason/projects/calibrate/builds/346f2208-e0a9-4980-ab78-52c60c0393e3);
  `check.sh --release` had passed on that tree. Nothing has run on the iPhone from it.
  His to do: `npx eas submit --profile production --platform ios`, install from
  TestFlight, `HUMAN_VERIFICATION.md` D8 and the gate's device list (a reminder arriving,
  largest text, VoiceOver through a log and an answer, Share → Save Image, the paywall's
  prices), then select build 8 on the version page. When he says it's submitted, tag
  `submitted-1.0.0` on `7f61f60`.
- **Build 8's device report, and step 210 (2026-11-21).** The owner on build 8 from
  TestFlight: "Save image works. Paywall works. Reminder and text size also work", with
  screenshots. Three things came of it, all built on `builder/practice-sheet-header`
  (253 suites, 5,302 tests; `check.sh --release` passed; unreviewed; nothing on the iPhone):
  - *The practice sheet* drew its question over the title and its × couldn't be tapped
    (the formSheet trap, `docs/app-profile.md` §18). It and Categories, which had the
    same shape, now keep the header inside the scroll view, as Share does.
  - *The app lock opens on a tap* (D74, his call, not vetoed): nothing asks for Face ID
    until Unlock is tapped, at launch and on return alike (the scope is the main
    session's call). The switch's line in You says so.
  - *The paywall's monthly figure* reads "$2.91 / month" (his wording); no colour, since
    the billed price has to stay the most prominent.
  His other calls: the Warm-up stays; he doesn't want the pre-release checks stretched,
  and UI on the phone matters most to him. **The free month wasn't on his paywall**: the
  app shows a trial only when Apple says the account can still take it, and his has most
  likely used it (he saw the trial on 2026-11-17); not confirmed, and he was asked to
  check the introductory offer is still on the annual product in App Store Connect.
  **Merged, pushed and built the same day** (the owner: "Yes to merge, pushing, and
  running."): `master` is `b944a6c`, and **production build 1.0.0 (9) from it finished on
  EAS and is the one to submit**
  (https://expo.dev/accounts/tapjason/projects/calibrate/builds/a05deed6-8e29-4c0b-b909-44015c939c2a).
  **Next, his:** `npx eas submit --profile production --platform ios`, install from
  TestFlight, and `HUMAN_VERIFICATION.md` D9: every sheet's title and ×, the lock's Unlock
  tap, the offline launch, and VoiceOver through a log and an answer unless he waives it;
  then select build 9 on the version page. When he says it's submitted, tag
  `submitted-1.0.0` on `b944a6c`.
- **Still for the first update (1.0.1):** "cancel any time" on plans with no trial, the
  three nits, and the notes from step 209's review (BUILT_LOG row 209).
- The screenshots: `screenshots/store/final-1206/` (git-ignored), six at 1206 × 2622;
  `APP_STORE_LISTING.md` §5 has the captions and how to re-render.

**After the merge, the same day (docs only, pushed):**
- **No beta stage.** The owner: "I dont want to add beta testers, the beta testing stage
  completely." No external TestFlight; stages 2 and 3 and their exit criteria don't run
  (`docs/TESTFLIGHT_PLAN.md`, `docs/SHIP_READINESS.md` "Open, in order" item 4). The path is
  now: builds from `master` (done) → his phone checks (done: "D4 and D6 pass", then "D5
  through D7 check out", neither item by item) → the privacy policy published (done) →
  the store record (next; he does the mail sender and the submission himself) →
  `/release-gate` → submit. Real newcomers' return and
  sharing are first read after launch.
- **The rewritten privacy policy and support page are published** (2026-11-20, effective
  that day; the owner: "D4 and D6 pass. Please continue with the policy and commit,
  merge, push anything remaining."). One commit: `docs/_config.yml` lists
  `PRIVACY_POLICY.md` and `SUPPORT.md`, and the two `.live.md` pages are deleted. Three
  things changed on the way, all the main session's calls:
  - *The policy's header comment moved* to `docs/PRIVACY_POLICY.notes.md`, off the site.
    It was 370 lines of steps, evidence and open legal questions, and an HTML comment is
    in a published page's source. The notes open with "Where this stands": what
    publishing waited on and what still changes the text (counsel, OpenAI's addendum,
    the UK or EU, `UTC_OFFSET_SYNC`, a larger Supabase plan, the in-app notice §11
    promises for the next change that matters, which isn't built).
  - *§3's sentence on OpenAI's logs* now carries the whole exception. The page was
    re-read that day (the notes asked for it before publishing): 30 days "unless longer
    retention is required by law, or is reasonably necessary to protect our services or
    any third party from harm". The policy had stopped at "its services".
  - *Docs that pointed at "the policy's header"* point at the notes (`APP_PRIVACY.md`,
    `APP_STORE_LISTING.md`, `OWNER_MESSAGES.md`, `supabase/README.md`); SHIP_READINESS
    item 35 is closed.
  Earlier that day, on his "Refine the held privacy policy", both OWNER comments left
  the text and three long sentences were reflowed. **No reviewer has read the text since
  those edits or these;** `/release-gate`'s policy audit is the next read. He gave no
  item-by-item results for D4 and D6: the sandbox "Under 13" box and the two Canada boxes
  are ticked in `docs/HUMAN_VERIFICATION.md`, and nothing else in those sections.
- **Guidance while logging** is recorded as a post-launch idea (the owner's list item 36),
  not designed, not built.
- **The three redeploys are done** and checked (item 1 below).
- **Builds, 2026-11-20** (the owner: "Start the two builds please"; pre-flight clean: tree
  clean at `590ab75`, the release check passed on that code, EAS account `tapjason`, the
  three variable names present in both environments; `/release-gate` not run, waived as an
  internal build for his phone checks, not the one to submit).
  - *Production:* **1.0.0 (7)**, commit `590ab75`, finished on EAS
    (https://expo.dev/accounts/tapjason/projects/calibrate/builds/94079be5-a5bb-4d8a-a93e-63cfec4eb563).
    The first try failed on a network error before EAS accepted it; the retry went
    through. His to do: `npx eas submit --profile production --platform ios`, then install
    from TestFlight. Build numbers 5 and 6 weren't made in this session.
  - *Development:* not rebuilt. One from `defdeb0` (which has `expo-secure-store` and
    `expo-crypto`; only docs changed since) finished that day at 1:07 PM, started by his
    account
    (https://expo.dev/accounts/tapjason/projects/calibrate/builds/59a4681e-f0d1-49c7-89db-2b4500026dee).
  - SQLite migrations 018 to 023 run on the phone with either and can't be edited after.

What the branch held:
- **202, D72 (a):** deleting a "Can't tell" is counted like deleting an open prediction.
  No screen offers that delete; the route that existed was a details sheet left open on a
  copy another phone then marked "Can't tell".
- **203, D72 (b):** Usage stats start off on a phone set to Canada until the person turns
  them on. The held privacy policy's §1, §2 and §2.3 say so, and its header's step 12 ties
  publishing to a build that carries it and to the device check (the app reads the region
  from the JS engine's locale; no iPhone has shown that it follows the Region setting).
- **204, D72 (c):** the local-only Plus page says where a subscription is managed.
- **205, D72 (d):** a US phone's support card names 988 on every topic; the two specialist
  numbers are gone from the app. The owner dropped items 23 and 27 (no emergency-number
  line, no helpline page in You, no line per country) and messages 1 to 3 in
  `docs/OWNER_MESSAGES.md`: "The purpose of my app is not to connect people to these
  helplines" (2026-11-20). **Superseded the same day by 206.**
- **206, D73:** the Coach's distress check is removed whole.
  The owner asked for the policy checker's results to be reviewed, "especially those
  related to suicide hotline that I do not think is relevant at all to the app, and should
  be excluded", and, asked how far, chose "Remove the whole check". Gone: the on-device
  scan of titles and notes (`src/ai/crisisFilter.ts`), the support card, every helpline
  line (988 included), "Back to Coach" and its stored set-asides
  (`src/engine/supportAside.ts`; a stored record that still holds them is rewritten
  without them when settings load). Stays: no words the person typed reach the model; the
  validators and the prompt still drop medical, referral and helpline wording from the
  Coach's output; the server's behaviour and the wire field `safe` (comments only changed
  under `supabase/`, so no redeploy depends on it). A `policy-auditor` run first (Opus,
  `xhigh`): no Apple rule read that day requires the check, and the AI-companion laws in
  force define a companion by conversation or a simulated relationship; read partly in
  secondary sources, and OpenAI's usage policies couldn't be opened. Both went to him as
  owner's list items 31 and 32 and he closed both the same day ("Definitely does not
  fall under the definition"; "The usage policies will definitely pass"): 31 reopens only
  if the Coach ever takes words, asks questions or holds a conversation. Helplines and
  distress detection are now out of scope for reviewers (`docs/app-profile.md` §7,
  `policy-auditor` rule 1). **The live privacy page's on-device-scan paragraph is removed
  in this change** (his yes, 2026-11-20): the check sent nothing, so the page is true of
  every build without it. It goes live on the next push of `master`; set its effective
  date to that day if it isn't 2026-11-20 (the held policy's header, step 13). Device check: `HUMAN_VERIFICATION.md` D7. For the
  review: Erase, sign-out and deletion no longer replace a settings record that can't be
  read (they did only for the set-aside keys), and `forgetUsageNoticeShown` is now the
  write that makes Erase report failure (`docs/ACCOUNT_SPEC.md` §3.5).
- **207, the review of 202 to 206** (three rounds, the most allowed; every builder and
  reviewer on Opus at `xhigh`; BUILT_LOG row 207). No blocker in any round.
  - *Record:* holds. *Code, steps 202 to 206:* clean.
  - *Policy:* the code passed each round; eight stale doc lines over the three rounds,
    all fixed as worded. Its last round's one line (the owner's list item 35) was fixed
    in the merge commit and is unread by a reviewer, as a last round's fixes always are.
  - *Built inside it, billing (item 30's first race):* every identity change advances a
    generation; an answer, purchase or restore that began under another identity is
    dropped and asked again; a purchase that lands on another account says so on the
    paywall (`purchased_elsewhere`) and writes nothing; a log-out RevenueCat never saw
    while the under-13 rule was on is settled before the next request in the same run.
    Paywall notices are spoken and cleared when the paywall opens.
  - *Built inside it, Canada:* Usage stats start off when either the Region setting or
    the language's region is CA; the held policy's words say so. No iPhone has shown how
    it reports either (`HUMAN_VERIFICATION.md` D6).
  - *Left, in `SHIP_READINESS.md`:* items 33 (RevenueCat's Restore setting), 34 (Quebec
    by region, for counsel), 35 (moot as worded since there are no outside testers: the held policy must be published
    before submission), and the small ones in item 25.

**Before this branch, `master`:** `builder/owner-decisions` is merged into it (fast-forward) and
pushed, 2026-11-19, on the owner's words that day: "Use all your recommendations for the
open decisions, and review, push, and merge.", then, with the review two rounds in,
"continue with next steps". Four commits came with it: `e77431e` (D70 and D71 as first
built), `b2557b0` (the review's rounds one and two), `b719ebd` (docs: the subagent's model
is weighed per task) and the round-three commit after it (`git log -1` names it). The
D70/D71 review is **finished**: three rounds, the most allowed.

**What the next session does first, in order**

1. **The server checklist, with him** (`supabase/README.md`). The agent runs the read-only
   checks through `npx supabase db query --remote --read-only`; he applies the migrations
   and runs the test statements (they write and roll back), unless he tells the agent to.
   **Done 2026-11-20: 010, 011 and 012 are applied (by him) and checked.** Every read-only
   check passes (010 2a to 2f; 011 1a to 1d and 3a to 3f; pg_cron on, 1.6.4; 012 5a to 5c
   and 7a to 7d, with 19 triggers and both jobs active as `postgres`). On his word ("Run
   the SQL commands through CLI with write allowed") the agent ran the test statements,
   each of which rolls itself back: T1 to T3, T5, T6, T8, T10, T11, T12 and T14 all PASS
   (T2 answers with 011's wording, as the README says); row counts are unchanged and no
   test row is left. 7c and 7d need the owner role: the read-only route runs as
   `supabase_read_only_user`, which 012 bars from `usage_counts_cutoff`. Not run: the
   optional T4, T7, T9 and T13. **Open:** 7e the day after (the purge's first run, 09:17
   UTC; read-only) and the weekly 7f. **The three redeploys are done** (the owner,
   2026-11-20, from `master` at `defdeb0`): `delete-account` version 13,
   `revenuecat-webhook` 14, `coach` 17 (`functions list`); the webhook's test event gives
   200 `ignored event type TEST`; a POST with no token gets 401 from `delete-account` and
   `coach`; on his phone the Coach answers and a throwaway account deletes. `UTC_OFFSET_SYNC` stays off for 1.0.
2. Done 2026-11-20: the review of steps 202 to 206 with item 30's billing fix inside it,
   the merge and the push; the web build's look at steps 204 and 206 passed (320 and 393
   pt, both appearances; guest Erase; no support card).
3. The next builds are his: a new development build and TestFlight build from `master`
   (`expo-secure-store` and `expo-crypto` are native), after `supabase/README.md`'s
   checklist. Done 2026-11-20 (the builds above), and the public pages were switched to
   the rewrite that day (the top of this file); the hold described further down is over.
4. **Next:** 7e the day after the migrations (read-only), then the store record
   (`docs/SHIP_READINESS.md` "Open, in order" item 5), the mail sender and password
   reset, `/release-gate`, the last production build, and his submit.

**What the merge holds**

- **D70, the under-13 rule,** confirmed by the owner 2026-11-19: when Apple's age range
  can include someone under 13 the app is local-only (no sign-in, sync, usage counts,
  Coach or RevenueCat; Plus isn't offered). `CLAUDE.md` §10 has the rule as it stands
  after the review; `docs/design/research/under-13-2026-11.md` has every call, the
  residuals and nine points for counsel; `src/age/egress.test.ts` fails when a new upload
  path forgets the gate and pins each listed file's count of network calls.
- **D71:** Erase removes everything on the phone, whoever's account it was under; the
  sign-in screen carries the usage-stats switch. Its other two parts (the support card's
  "Back to Coach", 988 on a US-territory phone) left the app with D73, and so did every
  support-card and set-aside fix the review bullets below describe.
- **The D70/D71 review (2026-11-19), rounds one and two.** Four reviewers in round one
  (two `code-reviewer`, `record-auditor`, `policy-auditor`), three in round two (two
  `code-reviewer`, `record-auditor`); no blocker in either. `docs/design/BUILT_LOG.md` row
  200 lists every fix. What changed behaviour:
  - *The age gate.* Any band that can include someone under 13 counts, a region's "under
    16" included (the agent's call, reversing its first one; it makes 13-to-15-year-olds
    there local-only). Apple is asked at every launch where the API runs, whatever band is
    stored, because a phone can change hands (with a stored 13+ band nothing waits). A
    stored band that can't be read keeps the gate shut unless Apple answers 13 or over.
    While Apple's answer is pending nothing is set up or sent: RevenueCat, the guest
    flush, the Coach and the rating prompt wait; a sign-in waits 5 s and is then refused
    for now ("Sign-in isn't ready yet. Try again in a moment."); only a sync goes on after
    60 s. The rule is checked again when Apple's or Google's sign-in sheet returns.
  - *The support card.* The tap re-checks first: a topic whose card hasn't been shown gets
    its card ("Other words matched too, so this message changed.", focus to the card's
    title, the button held for a second) before anything is set aside, even when one note
    matches two topics. A key goes when its words change, the prediction is deleted, or a
    list load no longer has them; sign-out, Erase and account deletion clear them,
    replacing a settings record that can't be read. The cap is 2,000.
  - *Erase.* It reports failure, and can be retried, if any cleanup doesn't land (the Log
    draft, the answer run, the settings, the age band, the cache of exports and images).
    Its confirmation counts the changes other accounts never pushed and says so, or says
    there may be some when it can't count.
  - *Billing.* A sign-out RevenueCat never saw (possible now that it doesn't run on a
    frozen account or while Apple's answer is pending) is applied when it next starts,
    before Plus is read.
  - *Copy.* How scoring works: "so a deleted miss is still counted" and "Only this phone
    keeps these counts; erasing your data here, deleting your account or deleting the app
    clears them." The sign-in usage line says what the counts are for.
- **Round three (2026-11-19, BUILT_LOG row 201):** one `code-reviewer` and one
  `policy-auditor`, both Opus at `xhigh`. No blocker.
  - *Code: one should-fix, fixed.* While the settings record can't be read, every list
    reload held another copy of the support card's set-aside keys, so memory grew for the
    whole run. Now at most one check is held: a newer one is folded into it, so a key
    survives only if the newer check accepts it and the older one did or it was added in
    between (plain "newest replaces" would have kept a key for words edited away). With
    nothing set aside, a list load no longer hashes every answered prediction. Two stale
    comments in `src/store/ageStore.ts` and `src/age/ageRange.ts` now say what the code
    does and what Apple's pages confirm.
  - *Code: read and found sound.* The billing hold can't lock out a guest: from
    react-native-purchases 10.9.0's source, its anonymity check always answers once the
    SDK is set up. From source only; `HUMAN_VERIFICATION.md` D5 shows it on the phone.
  - *Policy: FAIL on seven paperwork items, all applied as worded.* The held policy says
    a backup goes ahead if Apple hasn't answered within a minute, promises the waiting
    only on iOS 26 or later, and lists what RevenueCat's code caches among what Erase
    keeps; its header names steps 1 to 9 and the sandbox check as the preconditions for
    publishing (counsel, the UK and EU, and Canada change the text when they happen).
    `APP_PRIVACY.md` records the Coach summary as collected under Other User Content.
    The review notes say "signed out" before Erase and "a launch with no band stored"
    (3,929 of 4,000 bytes). Stale "uncommitted" labels are gone.
  - *A date this repo had wrong.* Utah and Louisiana were given as 2027 from secondary
    sources. Apple's post of 2026-02-24 says age categories are shared for new Apple
    Accounts in Utah from 2026-05-06 and in Louisiana from 2026-07-01 (fetched twice).
    The research note and `SHIP_READINESS.md` are corrected; item 26 puts it to counsel.
  - *Left as found:* two small billing races (the research note's residual 11, item 30),
    because no review round was left to read a billing change.
- **Known residuals, all in the research note's "Residuals" (eleven since round three):**
  supabase-js renews an expired (or nearly expired) stored session when the client is made
  and at `getSession()` whatever its settings, so a frozen account's sign-in is renewed at
  each start and a signed-in account's can be renewed before Apple answers; with Google,
  Supabase has created the user before the app can refuse the session; an email sign-in
  sent before a background under-13 answer goes through; once RevenueCat's SDK is
  configured it keeps refreshing on its own for that run; an adult whose Apple request
  never resolves gets no plans, purchase, restore or sign-in for that run; a signed-in
  account's sync goes ahead after 60 s without Apple's answer; a sign-out RevenueCat never
  saw stays in its cache on the phone; a stored age row that can't be read keeps an adult
  local-only; the second billing race (the slow paywall after a sign-out; the first was
  fixed in step 207).
- **The owner's decisions (2026-11-19):** every recommendation in
  `docs/SHIP_READINESS.md` "The owner's list" is adopted. **Two were wrong and are
  corrected there, and he agreed to both as corrected the same day:** item 7 (the UK is left out with the EU, since it
  needs a UK representative and policy content; launch storefronts are the US, Canada,
  Australia and New Zealand) and item 10 (stored IP addresses are declared as Diagnostics →
  Other Diagnostic Data). The agent's proposed rule after that mistake: a legal or
  store-form recommendation gets a `policy-auditor` check before it is put to the owner.
- **For the owner:** `docs/SHIP_READINESS.md`, "The owner's list": items 1 to 18 as
  adopted, 19 to 25 added by the review's first two rounds (the two corrections; deleting
  a "Can't tell" isn't counted; Usage stats on Canadian phones; two App Store Connect
  checks; two referral calls on the support card; the frozen account's server data, for
  counsel; a few smaller ones), and 26 to 30 by its third (Utah and Louisiana; helplines
  for Canada, Australia and New Zealand; the age-rating answer for the support card; a
  Plus subscriber on a local-only phone; the two billing races), and 31 and 32 by D73
  (the AI-companion laws; OpenAI's usage policies), both closed by him the same day. Every helpline item (decisions 8 and 13, items 13, 23,
  27, 28) is closed or moot.
  `docs/OWNER_MESSAGES.md` has what only he can send: since 2026-11-20 only message 4 (RevenueCat) and the OpenAI addendum. JS only: no new native
  package beyond the earlier review's two.

**Before that merge, `master` was `d1c23cf`:** the security and code review of 2026-11-18/19
(eight fix rounds, commits `c7bf083`, `6830354`, `7b5b0ea`, `893d404`, `800cd2f`,
`3d6439f`; D69), merged (fast-forward) and pushed 2026-11-19 on the owner's word.
**The public pages did not change with that push:** the repo is public and Pages serves
`master`'s `docs/`, so the rewritten `docs/PRIVACY_POLICY.md` and `docs/SUPPORT.md` are
held off the site and the pages live since 2026-11-18 are served from
`docs/PRIVACY_POLICY.live.md` and `docs/SUPPORT.live.md` (`docs/_config.yml` says how to
switch, in one commit, once the policy's header steps are done). What the review changed is in
`CLAUDE.md` (D41, D45, "Accounts and the data on the phone"). The next build must be a new
**development build and TestFlight build**: `expo-secure-store` and `expo-crypto` are native.
Before strangers get it, the owner works down `supabase/README.md`'s ordered checklist
(2026-11-19 section): audit-log setting and purge, migrations 010, 011, 012 with their checks,
pg_cron, three redeploys (`coach` from `master`, never `6830354`). `UTC_OFFSET_SYNC` stays
off for 1.0 (the agent's recommendation: it would put Coarse Location on the privacy label).
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
rounds on the fixes; its last round verifies round 7's deletion fix. **D70 and D71
(BUILT_LOG rows 198 to 201) have had all three review rounds** (the owner called the
review 2026-11-19): every finding is fixed or recorded as left. **Round three's own fixes
are unread by any reviewer**, as a last round's always are: the folded set-aside check in
`src/store/settingsStore.ts` and `src/engine/supportAside.ts` (tested, with three
mutations that fail), two comments, and the seven wording changes to the held privacy
policy, `APP_PRIVACY.md` and the review notes, applied as the auditor worded them.
Nothing has run on a real database or on
the iPhone: migrations 010–012 are proven only by the README's checks, the native changes
by the next development build, and the under-13 rule by the sandbox "Under 13" check
(`docs/HUMAN_VERIFICATION.md` D4). In the web build the local-only screens, both routes, the
sign-in switch and Erase's words were looked at on 2026-11-19 (`/dev/seed` has a
development-only control that sets an under-13 band). **Steps 202 to 207 have had their
three rounds** (2026-11-20). Unread by any reviewer: round three's own doc fixes. Nothing
from 202 to 207 has run on the iPhone; in the web build the local-only Plus line, the
Coach panel's sign-in state and guest Erase were looked at that day.

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
6. Then `docs/SHIP_READINESS.md`, "The owner's list": the server checklist, the new builds
   (the D70/D71 review is finished and merged), the mail sender, external
   TestFlight, the store record, the gate. On the next development build, the under-13
   checks in `docs/HUMAN_VERIFICATION.md` D4, what is left of D5, and D7 (no support
   card); the two that matter
   most: a guest can load plans, buy and restore on a fresh install, and a second launch
   with an adult age range shows no Apple sheet.

Done: the secret rename, both function deploys and the trial move (above).

**Blocked on the owner:** the password reset (needs a custom mail sender in Supabase,
`SHIP_READINESS.md` decisions 6 and 12); counsel and the sandbox check for the under-13
rule; his nod on the two corrected recommendations (no UK at launch; the IP address line);
the messages in `docs/OWNER_MESSAGES.md` (decisions 8 and 13);
(the beta app description is no longer needed: no beta stage). Everything open, with who does it, is in
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

Reviews only on the owner's call. Design, evaluation of screenshots and bugs, playtest design
and orchestration are always done by Fable (the main session), which doesn't implement
directly (owner, 2026-11-16). All code and tests go to subagents, the model weighed per task
(owner, 2026-11-19; `CLAUDE.md`, "Who does what"): Opus at `xhigh` effort for risky or
judgment work and for the reviews he calls, Sonnet for well-specified, low-stakes work.

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. Last full run
  (2026-11-20, with steps 202 to 207): 249 suites, 5,256 tests, exit 0 (250 and 5,923
  before 206 took out the distress check's tests). `check.sh --release` passed on the
  same tree that day: expo-doctor 20/20, dependencies up to date, iOS export 7.63 MB
  (bundle 7.22 MB), both public pages 200. Commit only after `check.sh` itself exits 0: piping it through `tail` once hid a
  failure. If `tsc` reports three typed-route errors, the generated route types are a stub;
  restart the web server after edits under `app/` (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED` (it does, 2026-11-19).

## Read first

`CLAUDE.md`, `docs/SHIP_READINESS.md`, `docs/TESTFLIGHT_PLAN.md`,
`docs/HUMAN_VERIFICATION.md`, `docs/design/BUILT_LOG.md`.
