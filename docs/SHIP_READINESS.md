# Fairly Sure — ship readiness

**As of:** 2026-11-16 · `master` at `2636ff2` (steps 1–187, pushed), plus `builder/cleanup-stale`
(the stale-code and docs cleanup, not merged). First written 2026-11-14 at the owner's request
to evaluate what comes next: more refinement, more playtests, or the store.

Sources: 23 blind playtest rounds (`docs/design/research/`), the release audit and the App
Store policy audit of 2026-11-14, `GROWTH_AND_MONETIZATION.md` §0, §2 and §7, and
`docs/design/research/competitors-2026-11.md`. TestFlight 1.0.0 (build 2, steps through 186)
has been on the owner's iPhone since 2026-11-16; its results are not in yet.

## The call

**Stop the AI playtests and go to TestFlight.** The next useful evidence is real people on
real iPhones, and then the store's own numbers.

Why:

- **The rounds have converged.** The last four appeal rounds scored a median of 6.5, 7, 7
  and 7 of 10, with the same findings each time: people with a record keep the app (four of
  four, twice), people in their first week are split (one of four), and "too technical" is
  the most common complaint. A 24th round would say it again.
- **What's still uncertain can't be answered by agents.** Would a real newcomer finish the
  Warm-up, log something of their own, come back on day 1, share a card? Those are the
  gates in GROWTH §7, and they are read from App Store Connect and the app's own counts.
- **The code is healthy.** `bash scripts/check.sh --release` passed on 2026-11-15 (`6a38809`,
  step 184): 187 suites, 2,425 tests, `expo-doctor` 20 of 20, no dependency drift, a 6.90 MB
  iOS bundle, and the privacy and support pages loading. The policy audit found the app's own
  behaviour in order on subscriptions, notifications, account deletion, Sign in with Apple
  and AI consent.
- **What's left is outside the code:** the on-phone checks on TestFlight, two Edge Function
  deploys and a misspelled secret, the free trial moved to the annual plan, the App Store
  Connect listing, and decisions 2, 5, 8, 9, 12 and 13. See "Open work".

## The market, and what it means for launch

From GROWTH §2 and the November competitor research (not re-researched since):

- **Nobody else sells this the way this app does.** Calibration trackers are free or a few
  dollars once and read as tools for forecasting hobbyists. The apps people actually arrive
  from are habit and goal trackers (Streaks, Habitify, Strides, Finch), which teach "tick it
  today", a streak, and $30 to $40 a year. Fairly Sure's difference is the identity layer:
  "Sharp in health, Tracker in money", a card, and a result on day 0.
- **"Prediction" now means betting to many searchers** (Kalshi and Polymarket in 2026). The
  listing already says "No money, no odds, no betting". Keep sports and markets out of the
  screenshots.
- **Price.** Set in App Store Connect on 2026-11-16: $34.99 a year, $79.99 lifetime, $4.99 a
  month (P1 is closed). $34.99 sits at the 2026 median across apps ($34.80) and under Health
  & Fitness ($39.94); at the 15% Small Business rate it is about $29.74 in hand. No tester in
  any round would pay in week one, which is expected: Plus sells interpretation of a record
  that takes weeks to exist. Don't tune the paywall before the trial data exists.
- **The model's bet is the share loop**, and the rounds can't test it. In round 23 every
  first-week tester shared the Warm-up card, not the category card, so step 181 makes the
  Warm-up card lead until the rating unlocks. Whether shares bring installs is read from
  App Store campaign links (`APP_STORE_PROVIDER_TOKEN`, still unset).
- **Retention risk is the first week.** The app's first real reward (a rating) takes 20
  answers. What's there to carry people: the Warm-up result, daily practice, the first look
  at 10 answers, the streak. Watch day-1 and day-7 return on TestFlight before adding more.

## What was changed for the release candidate (step 181, D63)

Round 23's fixes and the agent's last calls before TestFlight, built 2026-11-14: `docs/design/BUILT_LOG.md`
row 181, with each call in `docs/design/UI_ROADMAP.md` D63 to overturn. Kept on purpose: the
perfect-calibration line, the Brier line, the badge bars and the 20-answer gates; real users decide.

## Open decisions for the owner

Each is coded around: the app works either way. **Answered:** 1, 3, 4, 6, 7, 10 and 11 (owner,
2026-11-15: "Yes for all answers"; 7 and 10 were the agent's calls the same day, on "iterate
through them yourself, using best app developer judgement"). **Still open:** 2 (a legal call),
5, 8, 9, 12 (waits on the mail sender from 6) and 13 (due before the public release).

1. **The native batch (step 180).** Answered yes; built 2026-11-15 as step 180 (roadmap D64):
   an optional lock with Face ID and the passcode, and `expo-localization` for units by Region.
   It is in TestFlight build 2.
2. **Under-13.** The app asks Apple's age-range sheet once and does nothing with the
   answer. The policy audit's suggestion: when the range is under 13, keep the app
   local-only (no sign-in, no uploads, no Coach). That gives the question a purpose and
   makes "age assurance: yes" true on the rating form. It is a legal call (COPPA, and the
   Texas, Utah and Louisiana app-store laws in force since mid-2026).
   **Recommendation:** adopt the local-only rule before a US launch; ask counsel about the
   state-law duties. Not built: it changes who can make an account.
3. **Guest usage counts.** Answered yes; built 2026-11-16 as step 186, after the owner applied
   Supabase migrations 007 and 008. A guest's eight funnel events go up with no id, as the
   privacy policy says, so the day-0 gates in GROWTH §7 can be read.
4. **Prices (P1).** Answered: $34.99 a year, $79.99 lifetime, $4.99 a month, set in App Store
   Connect on 2026-11-16.
5. **EU.** Declare trader status (an individual's address and phone are published), or
   launch outside the EU first. Recommended: outside the EU first.
6. **Email sign-up.** Answered 2026-11-15: a custom mail sender. Not set up yet. Supabase's
   built-in sender reaches team members only, so until then a stranger who signs up by email
   gets no confirmation mail. Set it up, or turn email confirmation off, before strangers sign
   up (`docs/ACCOUNT_SPEC.md` §1).
7. **The keyword "habit".** Answered (the agent's call, as recommended): "habit" dropped and
   "goal" kept (step 183).
8. **A helpline directory outside the US.** The Coach's support message now shows US
   helplines on a US phone and, for anywhere else, "search for a crisis line in your
   country, or call your local emergency number". Naming findahelpline.com would be more
   useful, but its terms require written permission for commercial use.
   **Recommendation:** email ThroughLine (the contact is on findahelpline.com/terms) and
   name it once they agree. Until then the app names nothing.
9. **Usage stats at sign-in: notice, or a switch.** The sign-in screen now says what is
   sent and how to turn it off (notice and opt-out). Guideline 5.1.1(ii) says "secure user
   consent"; the policy audit reads the notice as enough for App Review and can't settle it
   for the Irish storefront. **Recommendation:** keep the notice for TestFlight; add a
   switch on that screen before an EU launch.
10. **Moving an answer to another category.** Built 2026-11-15 as step 184 (roadmap D65), the
    agent's call: Insights counts a scored answer left in a different category from the one
    it was answered in, on this phone only; one moved back isn't counted.
11. **Uninstall `expo-auth-session`.** Answered yes; uninstalled with step 180.
12. **A password reset.** There is none: someone who signs up by email and forgets the
    password keeps their phone's data but can't sign in again. It needs the mail sender
    and a redirect configured in Supabase first (decision 6). **Recommendation:** build it
    after TestFlight stage 1, once mail works; until then the support page is the route.

Added 2026-11-15 (the second review of step 182 and its policy check):

13. **Helplines on a phone set to a US territory.** A phone whose region is Puerto Rico,
    Guam, the US Virgin Islands, American Samoa or the Northern Mariana Islands was told
    "Outside the US: search for a crisis line in your country" and shown no number. Built:
    on the self-harm and distress topics it now gets the 988 line, as a US phone does
    (SAMHSA's 988 FAQ: "anyone located in a U.S. state, territory or tribal land"). Not
    built, because it isn't confirmed for all five: the domestic-violence line (government
    sources name Puerto Rico, the US Virgin Islands and Guam; the hotline's own site states
    no service area, and nothing confirms the number connects from a territory) and the
    eating-disorders line (confirmed for none of the five; its
    staffed hours are US Eastern business hours). On those two topics a territory phone
    still sees "Outside the US…", which is the wrong frame for it. Three things are yours:
    - ask the National Domestic Violence Hotline and the National Alliance for Eating
      Disorders whether they serve the five territories, then say which lines to show;
    - until they answer, whether those two topics should show 988 on a territory phone
      rather than no number (a referral call, not an engineering one);
    - the words "(US)" and "Outside the US:" for someone in a territory, who may read "the
      US" as the states.
    **Recommendation:** send the two emails; keep today's build as it is for TestFlight
    (the Coach needs Plus and a sign-in, so few testers reach this surface). Settle it
    before the public release: the hold shouldn't ship by default.

## What stands between here and the store

**Done** (by 2026-11-16): steps 1–187 on `master` and pushed; GitHub Pages on (the privacy and
support pages load); the Paid Applications Agreement active; the three products and their
prices in App Store Connect; RevenueCat's App Store app with the products on `plus` and in
`default`, and its `appl_` key; the three EAS `production` variables; the Apple provider on in
Supabase; migrations 006 to 008 applied; the account-deletion secrets set (one misspelled);
TestFlight 1.0.0 (build 2) on the owner's iPhone.

**Open, in order** (details and owners in "Open work" below):

1. Rename the misspelled secret; deploy `coach` and `delete-account`; move the free trial from
   monthly to annual.
2. Session 1 on build 2 (items 1–18 of the on-phone checklist in `docs/HUMAN_VERIFICATION.md`); the agent turns
   failures into fixes.
3. Build 3 (`npx eas build --profile production --platform ios`, then
   `npx eas submit --profile production --platform ios`): step 187 and the Session 1 fixes.
4. Sessions 2 (items 19–24) and 3 (items 25–28, on build 3). The full lists are Batches C and D
   in `docs/HUMAN_VERIFICATION.md`.
5. TestFlight with 20 to 50 people you can ask, for two weeks (`docs/TESTFLIGHT_PLAN.md`).
   Watch: do they finish the Warm-up, log one of their own, answer on day 1, share unprompted,
   come back in week two.
6. Fill in App Store Connect: listing (`docs/APP_STORE_LISTING.md`), the 2026 age-rating
   questions (§1 there), App Privacy labels (`docs/APP_PRIVACY.md`), screenshots from the
   device, review notes with a seeded demo account that already has Plus. Before this:
   decision 13 settled.
7. Submit. English-language storefronts, no paid installs. Read the gates at six weeks or
   1,000 downloads (GROWTH §7).

## Open work

Everything still to do, in one place. It replaces NEXT_STEPS (retired 2026-11-16);
what's built is in `docs/design/BUILT_LOG.md`, and the owner's step-by-step checks are in
`docs/HUMAN_VERIFICATION.md`. "Agent" work waits on the owner's word where noted.

**Before build 3 (owner)**

- **Rename the Supabase secret** `REVENUTCAT_DELETE_KEY` to `REVENUECAT_DELETE_KEY`. Until
  then account deletion skips the RevenueCat customer delete (logged, not an error).
- **Deploy the two functions:** `npx supabase functions deploy coach` and
  `npx supabase functions deploy delete-account`. The live `coach` predates the repo's prompt
  (the Fairly Sure name, the 20-answer minimums); neither redeploy is confirmed yet.
- **Move the free trial** from `calibrate_plus_monthly` to `calibrate_plus_annual` (App Store
  Connect, the introductory offer). The trial is one free month on annual only (decided
  2026-09-25); build 2's paywall showed it on monthly.
- **Session 1** on build 2 (items 1–18) and its results; the agent turns failures into fixes
  (`/device-check`, then a step per batch).

**The builds and the beta**

- **Build 3**, then Sessions 2 and 3 (owner). An agent runs `eas build` only after the owner
  confirms the exact command, and never `eas submit`.
- **Before outside testers:** the beta app description and beta review information in App
  Store Connect (owner; the text is in `docs/TESTFLIGHT_PLAN.md`, "Ready-to-use text").
- **A sandbox tester and the In-App Purchase key:** confirm a sandbox tester exists and the
  `.p8` In-App Purchase key is on RevenueCat's App Store app (owner). A sandbox purchase
  (Batch D2) proves both.

**Before submission (owner)**

- **Decision 13** settled.
- **App Store Connect:** the listing, the age-rating answers, the App Privacy answers,
  screenshots from the device (the agent prepares the list, `docs/APP_STORE_LISTING.md` §5)
  and the review notes (§4 there).
- **A demo account for App Review:** create the user in Supabase, run
  `node scripts/seed-demo-sql.mjs <user-uuid>` and paste the SQL into the SQL editor, then
  grant it Plus in RevenueCat (a promotional entitlement). Dates are relative to the run, so
  re-seed shortly before review. The credentials go in App Store Connect, never in the repo.
- **Keep `REVENUECAT_IGNORE_SANDBOX` unset** through App Review: reviewers buy in sandbox, and
  ignoring sandbox purchases would hand them a Coach that answers 403.

**Waiting on the owner's decision or setup, then the agent**

- **The custom mail sender** in Supabase (decision 6, needs a domain); then the agent builds
  the password reset (decision 12). Until then email sign-up reaches only Supabase team
  members' addresses.
- **The under-13 local-only rule** (decision 2, a legal call); the agent builds it on a yes.
- **Decisions 5, 8 and 9** (the EU, a helpline directory, a consent switch at sign-in).
- **`APP_STORE_PROVIDER_TOKEN`:** once App Store Connect shows analytics, the owner creates one
  campaign link and copies its `pt=` number (`docs/HUMAN_VERIFICATION.md` B2); the agent sets
  the constant. Until then text shares link to the App Store with no campaign token, so
  installs from shares aren't counted (the share gate, GROWTH §7).
- **The name:** counsel's clearance and filing (classes 9 and 42) and the `fairlysure.app`
  domain (`docs/APP_STORE_LISTING.md` §0). Blocks nothing in the build.
- **The Coach in the App Privacy label:** confirm its answers still match OpenAI's current
  API data retention before submitting (left for the owner by the step 181 policy audit;
  `docs/APP_PRIVACY.md`).

**Agent, on the owner's call**

- **Code review** of step 180's round-2 fixes, steps 183–187 (`6222465..2636ff2`) and the
  cleanup branch: `record-auditor` for step 184 and step 180's reminder change,
  `code-reviewer` for the rest.
- **Known and left:** a "Change answer" inside 600 ms of an answer can speak the first
  answer's badge line under VoiceOver; the version in You has no build number (TestFlight's
  feedback carries it; reading it would take `expo-application`, a native package); in Erase,
  a reload that throws skips the clear (the retry does it); `answerKeyUnits.ts` reads the
  region its own way; `LogPredictionForm › clamps confidence steppers at 0 and 100` failed
  once under full-suite load.

**Later**

- **The Expo SDK upgrade, 55 to 58**, as its own iteration after the first release is stable
  ("Not before launch" below), following `docs.expo.dev/router/migrate/sdk-57-to-58/`. It has
  breaking changes in `expo-router`, `expo-sqlite` and `expo-file-system`, all used here, and
  unblocks stable native tabs (UI_ROADMAP D3, D5), `expo-app-intents` (FUTURE_UI A10) and the
  platform features in FUTURE_UI §D. Upgrading before the device checks pass would leave a
  device bug's cause unclear.

## Not before launch, and why

- **Head-to-head with a friend, a plain share card, a headline choice.** Asked for in three
  rounds. They wait on the share gate: if shares don't bring installs, more share surfaces
  are the wrong investment (GROWTH §0 step 6).
- **Other languages.** Dates are now English everywhere; full localisation is a release of
  its own. Spanish and Portuguese readers were the clearest ask.
- **The Expo SDK upgrade (55 to 58).** SDK 55 builds with Xcode 26, which Apple requires
  today. Apple will require the iOS 27 SDK from April 2027, so the upgrade is due in the
  first quarter of 2027, after the first release is stable.
- **A 24th playtest round.** Only after TestFlight, and only on what real users trip on.

## Sources (kept from NEXT_STEPS)

- Expo: [Expo Go and the App Store, May 2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026) · [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)
- Texas SB 2420 (decision 2): [Ashurst Perkins Coie on the Supreme Court denial](https://www.ashurstperkinscoie.com/en/insights/supreme-court-green-lights-the-texas-age-verification-law-for-app-stores/) · [Future of Privacy Forum, enacted acts compared](https://fpf.org/blog/comparing-enacted-app-store-accountability-acts/) · [Apple, update for apps distributed in Texas](https://developer.apple.com/news/?id=sg176nne)
- Supabase (decisions 6 and 12): [Custom SMTP / default email limits](https://supabase.com/docs/guides/auth/auth-smtp) · [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- supabase/auth issue [#1308, Revoke Sign in with Apple tokens](https://github.com/supabase/auth/issues/1308)
- RevenueCat: [Account deletion rules on the App Store](https://www.revenuecat.com/blog/engineering/app-store-account-deletion) · [API v2](https://www.revenuecat.com/docs/api-v2)
