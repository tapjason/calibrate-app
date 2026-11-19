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
through them yourself, using best app developer judgement"). **Decided by the agent
2026-11-19** (owner: "apply your smart recommendations"; each is his to overturn): 2 (built,
D70; counsel still to be asked), 9 (the switch is on the sign-in screen, D71 (d)) and the
interim half of 13 (988 on every topic, D71 (c)). **Still open:** 5, 8, 12 (waits on the
mail sender from 6) and the rest of 13. Everything still his, with a recommendation for
each, is in "The owner's list" below.

1. **The native batch (step 180).** Answered yes; built 2026-11-15 as step 180 (roadmap D64):
   an optional lock with Face ID and the passcode, and `expo-localization` for units by Region.
   It is in TestFlight build 2.
2. **Under-13.** The app asks Apple's age-range sheet once and does nothing with the
   answer. The policy audit's suggestion: when the range is under 13, keep the app
   local-only (no sign-in, no uploads, no Coach). That gives the question a purpose and
   makes "age assurance: yes" true on the rating form. It is a legal call (COPPA, and the
   Texas, Utah and Louisiana app-store laws in force since mid-2026).
   **Recommendation:** adopt the local-only rule before a US launch; ask counsel about the
   state-law duties. **Built 2026-11-19 as D70** on `builder/owner-decisions`, the agent's
   call on the owner's delegation: `docs/design/research/under-13-2026-11.md` has the rule,
   what it gates and the seven points for counsel. Left for the owner: the sandbox "Under
   13" check on the iPhone, and counsel.
3. **Guest usage counts.** Answered yes; built 2026-11-16 as step 186, after the owner applied
   Supabase migrations 007 and 008. A guest's eight funnel events go up with no id, as the
   privacy policy says, so the day-0 gates in GROWTH §7 can be read.
4. **Prices (P1).** Answered: $34.99 a year, $79.99 lifetime, $4.99 a month, set in App Store
   Connect on 2026-11-16.
5. **EU.** Declare trader status (an individual's address and phone are published), or
   launch outside the EU first. Recommended: outside the EU first.
6. **Email sign-up.** Answered 2026-11-15: a custom mail sender. Not set up yet. Supabase's
   built-in sender reaches team members only, so a stranger who signed up by email would get
   no confirmation mail; since 2026-11-19 (D69 (c)) the app hides Create account until the
   sender works, and existing email accounts still sign in. Set it up, then turn Create
   account back on (`EMAIL_SIGN_UP_ENABLED`; `docs/ACCOUNT_SPEC.md` §1).
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
   switch on that screen before an EU launch. **Built 2026-11-19 (D71 (d)):** the sign-in
   screen shows the state and a switch, as the Warm-up's first screen has since D69 (b).
   Still a notice with an opt-out; an EU launch needs it off until chosen there (with 5).
10. **Moving an answer to another category.** Built 2026-11-15 as step 184 (roadmap D65), the
    agent's call: Insights counts a scored answer left in a different category from the one
    it was answered in, on this phone only; one moved back isn't counted. Since round 6 of
    the security review (2026-11-19, widening D69 (e)) it also counts a scored answer given
    in a different category from the one the prediction had when it was first moved after
    the day it was logged (`answerCountedAsMoved`, SQLite migrations 019 and 022). Since round 7
    (owner decision 2026-11-19) the rule is one sentence: a scored answer is counted when it
    ends up in a different category from the one it had at the end of the day it was logged
    (a rewording doesn't move that day), and a category change made while it was open, from
    the day before its due day but not on the day it was logged, is counted once, as a late
    change. Round 7 also counts an open prediction deleted on any day
    after the day it was logged (`deletionCounts`; from the eve of its due day until then).
11. **Uninstall `expo-auth-session`.** Answered yes; uninstalled with step 180.
12. **A password reset.** There is none: someone with an email account who forgets the
    password can't sign in again; their backup stays on the server, and a phone still signed
    in keeps its copy (since D69 (a), signing out removes it from that phone). It needs the mail sender
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
    **Built 2026-11-19 (D71 (c)), the agent's call on the second and third points:** a
    territory phone gets the 988 line on every topic (SAMHSA's FAQ, read that day: available
    "in all states and all five territories", for "many reasons … beyond suicide"), written
    without "(US)", and then "If 988 doesn't connect where you are: search for a local crisis
    line, or call your local emergency number." The two emails are drafted in
    `docs/OWNER_MESSAGES.md`; the other two numbers go on a territory phone only when those
    organisations confirm.

## The owner's list (2026-11-19), with the agent's recommendation for each

Written at the owner's request after the security review was merged. In order of when each
is needed.

**Before strangers get a build (external TestFlight)**

1. **The server checklist** in `supabase/README.md` (2026-11-19 section): the audit-log
   setting and purge, migrations 010, 011, 012 with their checks, `pg_cron`, the three
   redeploys. Nobody else can do it, and until it is done the limits and the 13-month purge
   exist only in the repo. *Recommendation: do it next, in one sitting, in the order
   written; `coach` is deployed from `master`, never from `6830354`.* Then say "the server
   steps are done" and the agent publishes the rewritten privacy and support pages (one
   commit: `docs/_config.yml`) with that day as the effective date.
2. **A new development build and TestFlight build** (two native packages). The agent runs
   `eas build` once the owner confirms the command. The phone checks are in `HANDOFF.md`.
3. **A review of D70 and D71** before that build goes to anyone else. *Recommendation:
   call one: `code-reviewer` and `policy-auditor` on the under-13 rule, `record-auditor` on
   Erase. It decides whether a child's data leaves the phone and it was built in a day.*
4. **The mail sender** (decision 6), then the password reset (12) and Create account back
   on. *Recommendation: buy the domain now (`fairlysure.app` if counsel clears the name, any
   domain otherwise), verify it with a transactional mail service that has a free tier, and
   enter its SMTP details in Supabase. DNS is the slow part, so start it first. It costs a
   few dollars a year. Until then Apple and Google sign-in carry stage 2.*
5. **The Supabase plan.** *Recommendation: stay on Free through TestFlight, move to Pro
   (about $25 a month; check the current price) before the public release.* Free has no automatic backups (verified
   2026-11-18), so a mistake in the dashboard or a bad migration could lose every backed-up
   prediction; the policy's "within 7 days" figures hold on both.

**Before submission**

6. **The under-13 rule (D70), built.** *Recommendation: keep it; run the sandbox "Under 13"
   check on the development build (`research/under-13-2026-11.md`, "What only the iPhone can
   show"); book an hour with a lawyer who does app privacy on the seven points listed there
   before the public US release; answer "age assurance: yes" on the rating form.*
7. **The EU (decision 5).** *Recommendation: launch without the 27 EU storefronts; keep the
   US, Canada, the UK, Australia and New Zealand.* The EU needs trader status (an
   individual's address and phone number published on the listing), opt-in consent for
   usage counts, and a look at under-16 consent ages. Revisit when the six-week gates are
   read (GROWTH §7).
8. **Usage-count consent (decision 9), built as a switch.** *Recommendation: enough for the
   storefronts in 7. Before any EU launch the agent makes it off until chosen on phones set
   to an EEA, UK or Swiss region.*
9. **OpenAI's Data Processing Addendum.** *Recommendation: execute it from the platform
   account that holds the Coach's key and keep the copy (`docs/OWNER_MESSAGES.md` §5); the
   policy then names OpenAI among the companies that process data on our behalf. Don't wait
   on Zero Data Retention: the policy already states the 30 days.*
10. **App Privacy answers** (`docs/APP_PRIVACY.md`). *Recommendation: Name: Yes (Google sends
    it before our trigger strips it). IP address: no data type of its own, since Apple's
    form has none and it isn't used to locate anyone; the policy discloses where it is
    stored. The Coach's summary: count it as collected (OpenAI keeps it up to 30 days). It
    adds no row: Other User Content is already declared, and as linked, which is the
    stricter answer. Location: No, see 11.*
11. **Time-zone offsets (`UTC_OFFSET_SYNC`).** *Recommendation: leave it off for 1.0.* Each
    phone already judges same-day answers in the zone it logged them in. Sync only closes
    the two-phone version of that hole, and it would put "Coarse Location" on the privacy
    label of an app whose pitch is privacy. Migration 011 is still needed for its other
    parts.
12. **RevenueCat's Sandbox Testing Access.** *Recommendation: leave it as it is through App
    Review; send the question in `docs/OWNER_MESSAGES.md` §4 now, and restrict it only on
    their written yes.*
13. **Helplines (decisions 8 and 13).** *Recommendation: send the three messages in
    `docs/OWNER_MESSAGES.md` (ThroughLine, the domestic-violence hotline, the eating-disorder
    alliance). Nothing waits on the answers: the app names nothing it hasn't confirmed.*
14. **The name.** *Recommendation: have counsel run the clearance search before screenshots
    and the listing are made, since a rename after that costs the most.*
15. **Screenshots.** *Recommendation: marketing frames composed from the web build at
    1320 × 2868 (the agent drafts them), checked against the phone for anything web draws
    differently. Apple requires the size, not a physical 6.9-inch phone.*

**After launch**

16. **The badge bars and the 20-answer gates (D62).** *Recommendation: leave them until the
    six-week read; real records decide.*
17. **`APP_STORE_PROVIDER_TOKEN`.** *Recommendation: copy the `pt=` number as soon as App
    Store Connect shows analytics; the share gate can't be read without it.*
18. **`decode-uri-component`, `jose` and `supabase/config.toml`** (the review's low items).
    *Recommendation: the agent pins all three in the first maintenance release, on the
    owner's yes to a dependency change; none is exploitable today.*

## What stands between here and the store

**Done** (by 2026-11-16): steps 1–187 on `master` and pushed; GitHub Pages on (the privacy and
support pages load); the Paid Applications Agreement active; the three products and their
prices in App Store Connect; RevenueCat's App Store app with the products on `plus` and in
`default`, and its `appl_` key; the three EAS `production` variables; the Apple provider on in
Supabase; migrations 006 to 008 applied; the account-deletion secrets set (the misspelled one renamed); `coach` and
`delete-account` redeployed 2026-11-15;
TestFlight 1.0.0 (build 2) on the owner's iPhone.

**Done since** (by 2026-11-18): steps 188–196 on `master` and pushed; builds 3 and 4; Session 3
items 25–30 on build 3; the Coach answers on the phone (step 189, with `REVENUECAT_READ_KEY`
and the two function deploys); Google sign-in set up and on (step 192, migration 009).

**Open, in order** (as of 2026-11-18; details and owners in "Open work" below):

1. **Close stage 1.** Session 3 items 31–33 on build 4, Session 2 (items 19–24), and Session
   1's item-by-item results. Then build 5 (steps 195 and 196) with its short device list in
   `HANDOFF.md`. The agent turns failures into one batch of fixes.
2. **One code review before strangers get a build** (the owner's call): nothing since step
   180's round 2 has been reviewed (steps 183–196 and the cleanup), and that stretch holds
   sign-in, account deletion, the Coach's Plus check and two record changes. Then
   `bash scripts/check.sh --release`.
3. **Mail before outside testers.** The custom mail sender in Supabase (decision 6), then the
   password reset (decision 12, the agent). Until the sender works, a stranger who signs up
   by email gets no confirmation mail, and "Confirm email" has to stay on for Google
   sign-in. Apple and Google sign-in work without it.
4. **TestFlight external testing:** the beta app description and beta review information
   (text in `docs/TESTFLIGHT_PLAN.md`), TestFlight App Review, then stage 2 (5 to 8 people,
   about a week, two or three first uses watched) and stage 3 (20 to 50 people, 14 days).
   Fixes go out in batches, one build every two or three days in stage 2 and one a week in
   stage 3.
5. **During stage 3, the store record:** the listing (`docs/APP_STORE_LISTING.md`), the
   age-rating questions, the App Privacy labels (`docs/APP_PRIVACY.md`, with the Coach's
   answers checked against OpenAI's current retention), the three products submitted for
   review with version 1.0.0 (Apple reviews an app's first in-app purchases with an app
   version; not checked against Apple's page here, so confirm it in App Store Connect), the
   demo account with Plus, the review notes, and the screenshots. **The screenshots need a plan:** the required set is 6.9-inch (1320 × 2868),
   the owner's iPhone 17 is not that size and there is no simulator; the web build renders
   that size as drafts (`APP_STORE_LISTING.md` §5).
6. **Decisions due before the public release:** "The owner's list" above, items 6 to 15.
   Decided and built 2026-11-19 on the owner's delegation: 2 (the under-13 rule, D70), 9
   (the sign-in switch) and the interim half of 13 (D71).
7. **Read the exit criteria** (`docs/TESTFLIGHT_PLAN.md`); a row in "stop and fix" gets a fix
   and another week.
8. **The release gate** (`/release-gate`): the release, policy and record audits over the
   whole app, `check.sh --release`, then the last production build.
9. **Submit.** English-language storefronts, no paid installs. Read the gates at six weeks
   or 1,000 downloads (GROWTH §7).

## Open work

Everything still to do, in one place. It replaces NEXT_STEPS (retired 2026-11-16);
what's built is in `docs/design/BUILT_LOG.md`, and the owner's step-by-step checks are in
`docs/HUMAN_VERIFICATION.md`. "Agent" work waits on the owner's word where noted.

**Before build 3 (owner)**

- Done: the secret is renamed `REVENUECAT_DELETE_KEY`, and `coach` and `delete-account` are
  deployed from the current code (confirmed 2026-11-16 with `npx supabase functions list` and `secrets list`).
- Done: the free trial (one month, annual only, decided 2026-09-25) moved from
  `calibrate_plus_monthly` to `calibrate_plus_annual` in App Store Connect (owner,
  2026-11-16). Session 1 items 9–10 confirm it on the phone.
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
  the password reset (decision 12) and turns Create account back on. Until then Create
  account is hidden in the app (D69 (c)); existing email accounts still sign in.
- **The under-13 local-only rule** (decision 2): built 2026-11-19 (D70); counsel and the
  sandbox check are the owner's.
- **Decisions 5 and 8** (the EU, a helpline directory) and the rest of 13: "The owner's
  list" above.
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
