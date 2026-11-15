# Fairly Sure — ship readiness

**As of:** 2026-11-14 · **Branch:** `builder/step-181-release-candidate` · Written at the
owner's request to evaluate what comes next: more refinement, more playtests, or the store.

Sources: 23 blind playtest rounds (`docs/design/research/`), the release audit and the App
Store policy audit run on this branch the same day, `GROWTH_AND_MONETIZATION.md` §0, §2 and §7,
and `docs/design/research/competitors-2026-11.md`. Nothing here has run on the iPhone.

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
- **The code is healthy.** `bash scripts/check.sh --release` passed on 2026-11-14: 2,278
  tests, `expo-doctor` 20 of 20, no dependency drift, a 6.9 MB iOS bundle (the first
  baseline). Since step 182 its last step also fails while the privacy or support page
  doesn't load, so it will fail there until GitHub Pages is on.
  The policy audit found the app's own behaviour in order on subscriptions, notifications,
  account deletion, Sign in with Apple and AI consent.
- **What blocks the store is outside the code.** Two dead URLs, no products or prices in
  App Store Connect, no production environment for the build, and about 205 unticked device
  checks. See "What stands between here and the store".

## The market, and what it means for launch

From GROWTH §2 and the November competitor research (not re-researched today):

- **Nobody else sells this the way this app does.** Calibration trackers are free or a few
  dollars once and read as tools for forecasting hobbyists. The apps people actually arrive
  from are habit and goal trackers (Streaks, Habitify, Strides, Finch), which teach "tick it
  today", a streak, and $30 to $40 a year. Fairly Sure's difference is the identity layer:
  "Sharp in health, Tracker in money", a card, and a result on day 0.
- **"Prediction" now means betting to many searchers** (Kalshi and Polymarket in 2026). The
  listing already says "No money, no odds, no betting". Keep sports and markets out of the
  screenshots.
- **Price.** $29.99 a year sits under the 2026 median ($34.80; $39.94 in Health & Fitness).
  The standing recommendation is $34.99 a year, $79.99 lifetime, $4.99 a month. Decide
  before the products are created: changing after is a price change. No tester in any round
  would pay today's price in week one, which is expected: Plus sells interpretation of a
  record that takes weeks to exist. Don't tune the paywall before the trial data exists.
- **The model's bet is the share loop**, and the rounds can't test it. In round 23 every
  first-week tester shared the Warm-up card, not the category card, so step 181 makes the
  Warm-up card lead until the rating unlocks. Whether shares bring installs is read from
  App Store campaign links (`APP_STORE_PROVIDER_TOKEN`, still unset).
- **Retention risk is the first week.** The app's first real reward (a rating) takes 20
  answers. What's there to carry people: the Warm-up result, daily practice, the first look
  at 10 answers, the streak. Watch day-1 and day-7 return on TestFlight before adding more.

## What was changed for the release candidate (step 181, D63)

Judgement calls made under the owner's go, each recorded in `UI_ROADMAP.md` D63 to overturn:

- Share opens on the Warm-up card until the rating unlocks; "Got a friend's card?" explains
  a friend's Warm-up card as well.
- Today says when the rating unlocks only when that's three weeks off or nearer.
- The chart's "Overconfident" and "Underconfident" words wait for a range with 10 answers.
- "N categories not shown (still counted)" on cards and recaps.
- A correction says the rating and badges now follow the answer; a badge gained or lost is
  spoken to VoiceOver.
- Log says when the same words are already open for that day.
- Dates, times and counts are written in English on a phone set to another language.
- From the policy audit: Sign in with Apple asks for the email only; Apple's newer relay
  addresses are recognised; the Coach is told the app's current name; the App Privacy sheet,
  the support page and four listing claims were brought in line with the code.

Kept as they are, on purpose: the perfect-calibration line beside the rating, the Brier
line, the badge bars, the 20-answer gates. The evidence against each was one or two testers;
real users decide.

## Open decisions for the owner

Each is coded around: the app works either way.

1. **The native batch (step 180): yes or no.** Installing packages needs your go (the
   machine's permission rule held it back):
   `npx expo install expo-local-authentication@~55.0.18 expo-localization@~55.0.19`.
   It adds an optional Face ID lock, the top privacy finding of rounds 22 and 23 ("Hide the
   words" is a curtain: one tap opens a card). It needs `NSFaceIDUsageDescription`, the
   passcode as fallback (guideline 2.5.13), a cover for the app-switcher snapshot, one
   sentence in the privacy policy, and a new development build.
   **Recommendation:** yes, in the same build that goes to TestFlight, so there is one build.
   If you'd rather ship sooner, it can follow in 1.0.1; nothing depends on it.
2. **Under-13.** The app asks Apple's age-range sheet once and does nothing with the
   answer. The policy audit's suggestion: when the range is under 13, keep the app
   local-only (no sign-in, no uploads, no Coach). That gives the question a purpose and
   makes "age assurance: yes" true on the rating form. It is a legal call (COPPA, and the
   Texas, Utah and Louisiana app-store laws in force since mid-2026).
   **Recommendation:** adopt the local-only rule before a US launch; ask counsel about the
   state-law duties. Not built: it changes who can make an account.
3. **Guest usage counts.** The privacy policy says a guest's anonymous funnel counts are
   sent; the build sends nothing for guests (`GUEST_ANALYTICS` is off until Supabase
   migration 007 is applied). One of them has to change before the policy is published.
   **Recommendation:** apply 007 and turn the flag on. The day-0 gates in GROWTH §7 are
   blind without it.
4. **Prices (P1).** Recommended $34.99 a year, $79.99 lifetime, $4.99 a month.
5. **EU.** Declare trader status (an individual's address and phone are published), or
   launch outside the EU first. Recommended: outside the EU first.
6. **Email sign-up.** Supabase's built-in sender reaches team members only. Set up a custom
   sender, or turn email confirmation off, before strangers sign up.
7. **The keyword "habit".** The policy audit reads it as a 2.3.7 risk (the app isn't a
   habit tracker); the competitor research says habit-app users are who arrives. Low risk
   either way. Recommended: keep "goal", drop "habit".

Added 2026-11-15 (step 182 and its audits):

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
10. **Moving an answer to another category isn't counted.** Inside its 24-hour window it
    takes a scored miss out of one category's score. The app now says so after a move; it
    doesn't count moves on Insights, as it counts deletions. Nothing records a move today, so
    TestFlight can't show whether anyone does it. Moved out one by one, a category's misses
    leave its score (not the overall rating), which could carry a badge it hasn't earned.
    **Recommendation:** count moves on this phone, as deletions are, before the card is
    shared outside TestFlight; the line is enough for the beta.
11. **Uninstall `expo-auth-session`.** Unused since the Google sign-in code went. A package
    change, so it needs your yes: `npm uninstall expo-auth-session`, then the check.
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

In order. "Agent" steps need only your word; the rest are yours.

**Now**
1. Agent: commit step 181 (done on this branch) and merge the step 178 to 181 stack into
   `master`. You: `git push`.
2. You: turn GitHub Pages on (Settings → Pages → Deploy from a branch → `master` → `/docs`).
   The privacy policy and support URLs are both 404 today, which is a certain rejection.
3. You: accept the Paid Applications Agreement and add bank and tax details in App Store
   Connect. Approval takes a day or more, and StoreKit returns no products until it's active.
4. You: answer decisions 1 to 6 above.

**Then, about an hour at a desk** (`docs/HUMAN_VERIFICATION.md` Batches B0 to B2)
5. Create the in-app-purchase key (`.p8`), the three products (annual with the one-month
   trial, monthly, lifetime), the subscription group and a sandbox tester.
6. RevenueCat: add the App Store app, attach the products to `plus`, set the `default`
   offering, copy the `appl_` key.
7. Set the three EAS `production` variables (Supabase URL and anon key, the `appl_` key).
   Only the `development` environment has them today, so a production build would have no
   sync, no sign-in and no Plus.
8. Supabase: confirm the Apple provider is on; set the account-deletion secrets; deploy
   `coach`; apply migrations 007 and 008 if decided.

**Then the build**
9. Agent, if decision 1 is yes: build step 180 (about half a day), with its reviews.
10. You: `npx eas build --profile production --platform ios`, then `eas submit` to
    TestFlight.
11. You, on the TestFlight build: the core run-through (Batch C, about 30 minutes), sign-in,
    notifications, a sandbox purchase and restore (Batch D), large text and VoiceOver, then
    the lists added for steps 157 to 181. Send results; the agent turns failures into fixes.

**Then people**
12. TestFlight with 20 to 50 people you can ask, for two weeks. Watch: do they finish the
    Warm-up, log one of their own, answer on day 1, share unprompted, come back in week two.
13. Fill in App Store Connect: listing (`docs/APP_STORE_LISTING.md`), the 2026 age-rating
    questions (the policy audit's draft is in HANDOFF), App Privacy labels
    (`docs/APP_PRIVACY.md`), screenshots from the device, review notes with a seeded demo
    account that already has Plus. Before this: decision 13 (helplines on a phone set to a
    US territory) settled.
14. Submit. English-language storefronts, no paid installs. Read the gates at six weeks or
    1,000 downloads (GROWTH §7).

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
