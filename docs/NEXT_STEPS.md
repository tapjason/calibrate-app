# Fairly Sure — Next Steps an Agent Can Do Alone

**As of:** 2026-11-06 · **Branch:** `master` · **Baseline:** `bash scripts/check.sh`
ends in `CHECK PASSED`: `tsc --noEmit` clean, 147 suites / 1712 tests green (after
step 154, 2026-11-05).

`docs/HUMAN_VERIFICATION.md` lists what needs a person. This is the other half:
work an agent can finish from the repo with no device, no dashboard and no
purchase. Finished items are removed; their history is in git (`git log -- docs/NEXT_STEPS.md`).
UI work has its own list in `docs/design/UI_ROADMAP.md`, and unscheduled ideas
are parked in `docs/design/FUTURE_UI.md`.

---

## What the 2026-10-04 research pass changed

Five findings change the next iterations. Each is recorded in the document it
affects; this is the summary.

1. **Expo Go can't run this app on an iPhone.** The App Store's Expo Go stops at
   SDK 54. Apple never approved the SDK 55, 56 or 57 builds (Expo, May 2026;
   still "waiting on approval" in the SDK 57 notes). This project is SDK 55.
   Expo's workarounds are a simulator (needs a Mac), `eas go` (needs the $99
   Apple account) or a TestFlight beta group that is full. So with an iPhone
   and Windows, **there is no free on-device path**: the $99 account now gates
   *every* iPhone check, not only billing. `HUMAN_VERIFICATION.md` is
   re-ordered around this, and the web build is the only free way left to look
   at the app (item k).
2. **Third-party AI needs explicit, named consent** (Guideline 5.1.2(i), since
   2025-11-13). The Coach toggle is a real opt-in, but its copy doesn't say the
   numbers go to OpenAI. Item h.
3. **Texas age assurance is in force.** SB 2420 has applied to new Texas Apple
   Accounts since 2026-06-04 (the Fifth Circuit lifted the injunction; the
   Supreme Court declined to restore it on 2026-07-06). Apple's Q&A: "In those
   regions, you must check the age of the people using your app."
   `expo-age-range` ships in SDK 55 (alpha). How far this reaches a 4+ app with
   no user-to-user content is a legal call; the code is item i once you decide.
4. **The SDK has moved two majors.** 56 (2026-05-21) and 57 (2026-06-30) are
   stable; 58 has been in beta since 2026-09-15 (RN 0.88, the iOS 27 scene
   lifecycle, stable `expo-router/native-tabs`, `expo-app-intents`). SDK 55
   still builds with Xcode 26, which App Store uploads have required since
   2026-04-28, so the upgrade doesn't block the first build. Item j sequences it.
5. **The link-out commission won't settle before mid-2027.** The Supreme Court
   took Apple's appeal in June 2026 (decision likely no earlier than June 2027),
   the district-court fee proceeding has stalled, and the US link-out rate stays
   at 0% meanwhile. Nothing to build; `GROWTH_AND_MONETIZATION.md` §2 is updated.

---

## Open

| # | Item | Size | Why it matters |
|---|---|---|---|
| g | **Dependency drift within SDK 55.** `npx expo install --check` now lists 15 packages behind (re-run 2026-10-04: `expo` 55.0.26 → 55.0.31, `react-native` 0.83.6 → 0.83.10, `expo-router`, `expo-notifications`, `expo-sqlite`, `jest-expo`, …). Run `npx expo install --fix`, then `npm test`. | S | **Done 2026-11-07** (`builder/expo-fix`): `expo` 55.0.32, `react-native` 0.83.10; `--check` clean. |
| j | **SDK upgrade, 55 → 58**, as its own iteration *after* the first device build passes Batch C on 55. Go straight to 58 once it's stable, following `docs.expo.dev/router/migrate/sdk-57-to-58/`. 58 adopts the UIScene lifecycle through prebuild, makes React Native's strict TypeScript API the default, and has breaking changes in `expo-router`, `expo-sqlite` and `expo-file-system`, all of which this app uses. | L | Unblocks D3 (stable native tabs), FUTURE_UI A10 (`expo-app-intents`), stable `@expo/ui`, and the platform features in FUTURE_UI §D (widgets, Siri, an on-device Coach; research 2026-10-05). Upgrading *before* the first device run means nobody can tell whether a device bug comes from the app or from the upgrade. |

Done 2026-10-04 (second pass): **h** — Settings and the Coach panel now name
OpenAI before the first request; **k** — the web run-through, recorded at the
top of `HUMAN_VERIFICATION.md` Batch C, which also fixed six UI defects and
found the RevenueCat Test Store drift below.

Done 2026-11-02: **i** — Declared Age Range, owner option (a). `expo-age-range`
0.2.21 (the SDK 55 release; `npx expo install` with no version resolved 58 and
was not kept) and the `com.apple.developer.declared-age-range` entitlement.
One ask after the first screen is up, failing open, and only the age band is
stored. Nothing is gated on it. Device check: `HUMAN_VERIFICATION.md` D4.

## Suggested order for the next iterations

Re-planned 2026-11-06, while the Apple Developer enrollment is pending. The
owner chose to close the three score holes from the November playtests and do
the other pre-device work below before the first device build.

**Update 2026-11-07:** the account is active and build day has started, ahead
of steps 157–159 (the owner's choice: see it on the phone first). Steps 155
and 156 are on `master` (locally); B0's identifier, the App Store Connect
record (`6831917395`), the Supabase Apple provider, EAS login and variables
and item g are done. Next: the owner runs the development build.

1. **Step 155, build prep** (done): `scripts/check.sh`, the explicit
   EAS environment per profile, and the build day runbook at the top of
   `HUMAN_VERIFICATION.md` Tier 2.
2. **Step 156, D45: close the score holes** (done). A title edit counts as a new
   prediction from that day (`title_edited_at`, synced behind a flag until
   Supabase migration 008 is applied); deletions after an answer, or of an
   open one on or after its due day, are counted on Insights; a "Can't tell"
   can be answered only up to 7 days after its due date.
   **Step 160, the seventh playtest round's fixes** (done 2026-11-08, on
   `builder/playtest-limits`): groups 1, 2, 3, 5 and 7 of
   `docs/design/research/playtest-2026-11-08.md`. Groups 4 and 6 wait on the
   owner (`/design`).
3. **Step 157, D46:** a category's score unlocks at 20 answers, the same as
   its badge (`MIN_N_CATEGORY` 15 → 20).
4. **Step 158, D47: accessibility.** The chart's luck bars at 3:1 (WCAG
   1.4.11); the share card's dot row labelled and not colour-only.
5. **Step 159, D48: Today on a small phone.** Scroll to a newly saved card;
   open predictions above the streak and practice rows when nothing is ready.
   **Steps 167–170, the eleventh round** (decided 2026-11-10 from
   `docs/design/research/playtest-2026-11-10.md`; JS only, so a reload on the
   phone). The record conditions are `record-auditor`'s pre-build check of the
   same day.
   - **Step 167, no decision** (done 2026-11-10, on `builder/headline-fixes`; also
     Trends' table sorted leaning rows first, and its rows' category names): the chart's headline picks among ranges that
     lean first (`bothSides`, then the largest gap among non-calibrated solid
     ranges, the calibrated wording only when none leans), one selector shared
     by `chartTakeaway.ts` ~90, `wrappedCopy.ts` ~208 (`pooled()` only when no
     solid range leans) and `TrendsPanel.tsx` ~211; today "You're well
     calibrated" can sit over an orange 80–100% dot (R4, R11). Tests from real
     buckets (`computeCalibrationPoints`), not hand-set directions, plus one rule
     test: a title naming no lean means no solid range leans. With it, the
     round's other no-decision fixes: "1 more scored answers", the Plus screen
     offline ("this build" only for builds without billing), the chart's
     accessibility label saying inside, over or under per range.
   - **Step 168, D55** (done 2026-11-10, on `builder/due-date`): Log starts every prediction on Tomorrow (`LogPredictionForm`
     ~78 and the reset at ~204; the `firstEver` branch goes); Save names the
     date the store will save (it clamps, `predictionStore` ~245), rebuilt when
     the day turns (~85–94), from one helper shared with step 169's label;
     DESIGN_SYSTEM §7.12 and `app-profile.md` §2 updated.
   - **Step 169, D56:** the same-day copy (`PredictionDetails` ~176–181,
     `ResolvePrompt` ~168 and ~619, `AnsweredDetails` ~140) with reworded
     predictions keeping their own wording; Resolve's note hidden only from
     Answer it now's confirmation (`?warned=<local day>`, ignored once the day
     or the same-day state no longer matches), never from Today, History,
     notifications or runs; "Log it again, due …" on Resolve and on History's
     answered details, its date and the draft from one call, "Logged again,
     due …" from the soonest open match by `titleKey`; identical after Yes and
     No (R8). Check whether an edit reschedules the evening reminder.
   - **Step 170, D57, after 167** (done 2026-11-10, on `builder/plain-counts`): Log's track record from 5 in the overall
     range ("Too few to read yet"), from `bucketFor` / `categoryBucketFor`;
     the chart's "No clear lean" title through one helper with Wrapped's
     2026-11-04 rule, expected counts from the engine's `expected_yes` through
     `expectedPhrase`, the same in `coachSample`; "would have matched" only for
     leaning ranges of 10 or more, rounded as `furthestOffLine`; "No answers
     were Can't tell." in the unlocked branch; the new lines in the screen
     reader's chart summary (`chartDescription.ts` reads no lean today).
     `record-auditor` after; DESIGN_SYSTEM §7.2.1 and §7.12 updated.
6. **Build day,** once the account is active: B0 → **g** → the runbook →
   Batch C/D on the iPhone → B1/B2 → TestFlight.
   Owner, in order: enroll (as yourself or a company; a company needs a
   D-U-N-S number), register `fairlysure.app`, turn Pages on, decide P1, then
   B0 (Paid Applications Agreement first, since approval takes a day or more).
7. **j** (SDK 58), only after Batch C passes on 55; then D3, D5, D12 and D11.

---

## Waiting on you, not code

- **The $99 Apple Developer account** (active 2026-11-07) **gated any iPhone test** (finding 1).
  The only free check left is the web build (item k). When you want to see the
  app on your phone, this is the purchase. It also unlocks billing, TestFlight
  and submission.
- **Age assurance: decided (a), built 2026-11-02.** The check fails open and
  stores only the band. Nothing in the app is gated on it; say so if that
  should change. The age-rating questionnaire should answer **Yes** for age
  assurance on a build that includes it (`APP_STORE_LISTING.md` §1).
- **The new age-rating questionnaire.** Since 2026-01-31, App Store Connect
  blocks submissions until the updated questions are answered (in-app
  controls, capabilities, medical or wellness topics; AI features count toward
  content frequency). Proposed answers are in `APP_STORE_LISTING.md` §1.
- **Privacy policy: turn GitHub Pages on.** The URL is already set
  (`PRIVACY_POLICY_URL` in `src/constants/app.ts`,
  `https://tapjason.github.io/calibrate-app/privacy/`), so the paywall and
  Settings show it and it 404s until Pages is on. Merge first, then
  Settings → Pages → Deploy from a branch → `master` → `/docs`. Steps and
  how to confirm are in `HUMAN_VERIFICATION.md`. `docs/_config.yml` is on
  `master`, so it's ready; the Pages API still read 404 (off) on
  2026-11-06. The agent must not change the Pages setting.
- **The app name.** Chosen for now (2026-11-03): **Fairly Sure**
  (`APP_STORE_LISTING.md` §0; "Calibrate" is crowded and a registered mark).
  Screened 2026-11-03: no conflicting mark; the nearest is FAIRLY (AI
  compliance software, classes 9 and 42), low to moderate risk (§0 there).
  Still yours: a clearance opinion and filing by counsel (classes 9 and 42),
  the `.app` domain (the `.com` is parked for sale), and the App Store Connect
  record, which is the definitive check.
  Since 2026-10-08 it also blocks the share loop: a share's App Store link
  needs the app's App Store id, which needs the record, which needs the name
  (`GROWTH_AND_MONETIZATION.md` §0, step 1).
- **Pricing (P1).** The 2026 re-check puts $29.99/yr under the median annual
  price ($34.80 across apps, $39.94 in Health & Fitness) and $59.99 lifetime at
  only 2× annual. Recommendation: $34.99/yr and $79.99 lifetime, monthly
  unchanged (`GROWTH_AND_MONETIZATION.md` §4). Decide before the App Store
  Connect products are created; afterwards a change is a price change.
- **Guest funnel numbers: decided 2026-11-03 (D43), built, one step left.**
  A guest's eight funnel events go up with no id of any kind, to
  `guest_analytics_events`. Left: apply
  `supabase/migrations/007_guest_analytics_events.sql` to the live project,
  then set `GUEST_ANALYTICS` to true in `src/constants/app.ts`. Until then a
  guest's events wait for an account, as before. Once on, the aha rate is
  `warmup_completed / warmup_started` summed over both tables. With no id,
  guests' numbers are counts, not people: a reinstall counts twice. The
  share gate doesn't wait on this: App Store campaign links count every
  install from a share (GROWTH §7).
- **Reword dates on the server: one step left (D45, step 156).** Apply
  `supabase/migrations/008_title_edited_at.sql` to the live project, then set
  `TITLE_EDIT_SYNC` to true in `src/constants/app.ts`. Until then the date a
  prediction was reworded stays on the phone that made the edit, so another
  phone would score a same-day answer to it. Nothing fails meanwhile.
- **Email sign-up for strangers.** Supabase's built-in sender only delivers to
  members of your Supabase organization, at 2 messages an hour (re-checked
  2026-10-04). "Confirm email" is on for testing (decided 2026-10-01); before
  strangers sign up, either configure custom SMTP or turn confirmation off
  (`ACCOUNT_SPEC.md` §1).
- **Demo account for App Review.** Create the user in the dashboard, run
  `node scripts/seed-demo-sql.mjs <user-uuid>` and paste the SQL into the SQL
  editor. Dates are relative to the run, so re-seed shortly before review. The
  credentials go in App Store Connect, never in the repo.
- **Sandbox purchases on the server.** `REVENUECAT_IGNORE_SANDBOX` exists and
  defaults to off. Keep it off through review: App Review purchases are sandbox
  too, and ignoring them would hand the reviewer a Coach that answers 403.
- **Account deletion, last two legs.** Apple token revocation needs a Sign in
  with Apple `.p8` key, and deleting the RevenueCat customer needs a
  write-scoped server key. The function already handles both once the secrets
  exist (`ACCOUNT_SPEC.md` §3).
- **Design decisions** in `docs/design/UI_ROADMAP.md` §2. D33 (2026-11-01, the
  Instrument direction: Instrument Sans and an ink brand) replaced D1's Inter. D1 (Inter), D3 (four
  tabs), D7 (dark mode follows the system), D15 (rating prompt) and D16 (trial
  reminder) were decided and built on 2026-10-07, so every structural call is
  made before submission. D17 (one a day keeps the streak) was built the same
  day; D18 (Day 0 is for calibration) was built 2026-10-08 and refined 2026-10-09
  with D20 (no warm-up score), and D19 (a first "Not now" lasts until morning) was
  built the same day. D23–D31, from the blind dry runs, were decided on 2026-10-10
  (`docs/design/UI_ROADMAP.md` §2) and built the same day as steps 123–131.
  **D32**, from the debiasing research (a typed prediction's own past outcomes on
  Log), was decided and built on 2026-10-12 as step 135.

---

## Sources

- Expo: [Expo Go and the App Store, May 2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026) · [SDK 56](https://expo.dev/changelog/sdk-56) · [SDK 57](https://expo.dev/changelog/sdk-57) · [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta) · [Native tabs](https://docs.expo.dev/router/advanced/native-tabs/) · [AgeRange (SDK 55)](https://docs.expo.dev/versions/v55.0.0/sdk/age-range/)
- Apple: [SDK minimum requirements](https://developer.apple.com/news/upcoming-requirements/) · [Updated App Review Guidelines, 5.1.2(i)](https://developer.apple.com/news/?id=ey6d8onl) · [Update for apps distributed in Texas (2026-06-03)](https://developer.apple.com/news/?id=sg176nne) · [Age assurance Q&A](https://developer.apple.com/support/age-assurance) · [Updated age ratings](https://developer.apple.com/news/?id=ks775ehf) · [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- Texas SB 2420: [Ashurst Perkins Coie on the Supreme Court denial](https://www.ashurstperkinscoie.com/en/insights/supreme-court-green-lights-the-texas-age-verification-law-for-app-stores/) · [Future of Privacy Forum, enacted acts compared](https://fpf.org/blog/comparing-enacted-app-store-accountability-acts/)
- Link-out commission: [Tech Times, 2026-09-15](https://www.techtimes.com/articles/327527/20260915/app-store-commission-limbo-enters-new-phase-apples-epic-merits-brief-opens-scotus-fight.htm) · [TechCrunch, Aug 2026 proposal](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/)
- Supabase: [Custom SMTP / default email limits](https://supabase.com/docs/guides/auth/auth-smtp) · [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- supabase/auth issue [#1308, Revoke Sign in with Apple tokens](https://github.com/supabase/auth/issues/1308)
- RevenueCat: [Account deletion rules on the App Store](https://www.revenuecat.com/blog/engineering/app-store-account-deletion) · [API v2](https://www.revenuecat.com/docs/api-v2)
- App Store: [Calibrate – Metabolic Health](https://apps.apple.com/us/app/calibrate-metabolic-health/id1514232557) · [Calibrate: Recovery & Fitness](https://apps.apple.com/us/app/calibrate-health-recovery/id6757204030)
- Screenshot specs (1320 × 2868 is still the 6.9-inch size, iPhone 17 Pro Max): [AppLaunchFlow 2026 guide](https://www.applaunchflow.com/blog/app-store-screenshot-specifications-2026)
