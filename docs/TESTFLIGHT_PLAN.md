# Fairly Sure — TestFlight plan

**No beta stage (the owner, 2026-11-20):** "I dont want to add beta testers, the beta testing
stage completely." There is no external TestFlight: stages 2 and 3 don't run, nobody but the
owner holds a build, and the app goes from his own phone checks to the store record, the
release gate and submission. What that gives up, by this plan's own account (below): the day-1 and
day-7 return of real newcomers and whether anyone shares unasked are first read after
launch, at the six-week gates (GROWTH §7), not before it. TestFlight itself stays, as the
way a production build reaches his phone.
Everything below about stages 2 and 3, the beta app description and the exit criteria is
kept as the plan that was not run.

**As of:** 2026-11-16 · `master` holds steps 1–187 (pushed); TestFlight 1.0.0 (build 2, steps
through 186) is on the owner's iPhone, and stage 1 has begun. This plan follows
`docs/SHIP_READINESS.md`, which says why the next evidence has to come from real people.
The step-by-step store setup stays in `docs/HUMAN_VERIFICATION.md` (Batches B0 to B2 and E);
this file says what TestFlight is for, who tests, in what order, what gets measured and what
decides the submission.

Apple's rules below were checked against Apple's and Expo's pages on 2026-11-15. Where Apple
doesn't document something, it says so.

## What TestFlight has to answer

Three questions the 23 AI rounds couldn't:

1. **Does it work on real iPhones?** The owner's phone has run development builds since
   2026-11-07 and the TestFlight build since 2026-11-16, but the lists haven't been worked
   through yet: sheets, the keyboard, VoiceOver, large text, notifications, Sign in with
   Apple, purchases.
2. **Do real newcomers get to the first reward and come back?** The Warm-up finished, a
   prediction of their own logged, an answer on day 1, a return in week two. The AI rounds
   said people with a record keep it and first-week people are split; that is the claim to
   test.
3. **Does anyone share without being asked?** The free tier is the growth plan
   (GROWTH §1). If nobody shares in a group of people who like you, that is worth knowing
   before launch.

## The three stages

| Stage | Who | How long | Ends when |
|---|---|---|---|
| 1. You alone | You, on the production build from TestFlight | 2 to 3 days | The core run-through passes and no crash or dead end remains |
| 2. Inner circle | 5 to 8 people who will tell you the truth | about a week | No new blocking problem for two days running |
| 3. Open beta | 20 to 50 people | 14 days | The exit criteria below are read |

Stage 1 uses **internal testing**: up to 100 App Store Connect users, and Apple states a
review requirement only for external testing. On an individual account you can give up to 50
other people access to App Store Connect, but for stage 1 you are the only tester.

Stages 2 and 3 use **external testing**: up to 10,000 testers. The first build needs
TestFlight App Review ("a full review"; later builds of the same version "might not"). It
needs a beta app description and beta review information. Apple gives no review time; plan
for a day or two before stage 2 can start. Invite by email for stage 2 and by a **public
link with a tester limit** (say 60) for stage 3, so the link can be posted without the beta
running away.

A build can be tested for **90 days**. There are no over-the-air updates in this app, so
every fix is a new build: about 30 minutes to build, then Apple's processing. Batch fixes:
at most one build every two or three days in stage 2, one a week in stage 3.

## Before the first build (your desk)

**Done by 2026-11-16:** the Paid Applications Agreement (active); GitHub Pages (the privacy
and support pages load); the decisions that changed the build or the products (the lock,
prices, guest counts, a custom mail sender: `SHIP_READINESS.md` decisions 1, 3, 4 and 6); the
three products and their prices; RevenueCat's App Store app on `plus`
and `default` with its `appl_` key (RevenueCat treats TestFlight purchases as sandbox: turn on
"View Sandbox Data" to see them); the three EAS `production` variables (the commands are in
`HUMAN_VERIFICATION.md`, "Build day runbook" step 3); the Apple provider in Supabase;
migrations 007 and 008; the account-deletion secrets.

**Done since:** the misspelled secret renamed `REVENUECAT_DELETE_KEY`; `coach` and
`delete-account` redeployed (confirmed 2026-11-16 with `npx supabase functions list` and `secrets list`); the free trial moved to
`calibrate_plus_annual` (owner, 2026-11-16).

**Still open before build 3:** a sandbox tester for yourself if there isn't one; check the Supabase project isn't paused.

Not needed for TestFlight: screenshots, the listing text, the age-rating form, App Privacy
answers. Apple documents only the beta description and beta review information as required
for external testing. They are all needed for the App Store submission, so they can be done
during stage 3.

## The build

```
npx eas build --profile production --platform ios
npx eas submit --profile production --platform ios
```

`eas submit` asks for your Apple ID the first time; EAS manages the certificate and profile.
The build number increments by itself (`autoIncrement`, remote); the version stays 1.0.0.
The export-compliance answer is already in `app.json`. When Apple's email says the build
finished processing, check it for warnings: a missing privacy-manifest reason or an icon
complaint would show there.

An agent runs `eas build` only after you confirm the exact command, and never `eas submit`.
Build 2 went up on 2026-11-16 with steps through 186; build 3 carries step 187 (the launch
page) and the fixes from your first session.

## Stage 1: you alone (2 to 3 days)

Install from TestFlight, not the development build: it's what a reviewer and a tester run.
Start from a fresh install.

**Day 1, about an hour:**
- The core list (`HUMAN_VERIFICATION.md` Batch C, about 30 minutes): the Warm-up to its
  result and card, a first prediction in under 15 seconds, an answer, Insights, History,
  the share sheet with a real export, You's defaults, Erase.
- Sign in with Apple and with email; Apple's age-range sheet may appear (on a build that
  carries the D70/D71 review the app asks Apple at every launch, so after you share a
  range of 13 or over the sheet shouldn't show again, which D4 checks, and after a decline
  the app carries on); delete a throwaway account. On a build that carries D70, a band
  that includes ages under 13 keeps everything on the phone instead (no sign-in, backup,
  usage counts, Coach or Plus), and until Apple has answered on a first launch, sign-in
  says "Sign-in isn't ready yet. Try again in a moment." and the Plus plans don't load:
  the sandbox "Under 13" check and the "(review)" checks in `HUMAN_VERIFICATION.md` D4.
- Log one prediction due tomorrow so a real reminder arrives.

**Day 2, about an hour:**
- The 19:00 reminder: its words (hidden by default), a tap opens the question.
- A sandbox purchase (Batch D2): the paywall lists annual first with its "1 month free" pill,
  buy, restore, the Coach answers once signed in. In TestFlight a subscription renews every
  day, up to six times in a week, then stops.
- Large text at the biggest size on Today, Log, Resolve and the paywall; VoiceOver through
  the Warm-up, a log and an answer.
- The lists for steps 178 to 187 in Batch C.

Under way since 2026-11-16 as three sessions of the owner's on-phone checklist: Session 1,
items 1–18 on build 2; Session 2, items 19–24; Session 3, items 25–30 on build 3. The items
are listed in `docs/HUMAN_VERIFICATION.md`, "Stage 1 on-phone checklist".

Send the results as pass or fail per item with screenshots of failures. The agent turns
failures into one batch of fixes and you build again. Stage 1 ends when the core list
passes on the build that will go to other people.

## Stage 2: inner circle (about a week)

Five to eight people. Choose them to differ, the way the playtest casts did:

- two who aren't technical (a parent, a friend who mostly uses WhatsApp);
- one or two who track things already (a habit app, a fitness watch, a spreadsheet);
- one who reads English as a second language;
- one with large text or VoiceOver on, if you know someone;
- one sceptic who will say it's pointless if it is.

Ask for 10 minutes on day 1 and two minutes a day for a week. **Watch two or three of them
use it for the first time**, in person or on a call with their screen shared, and say
nothing while they do. Fifteen minutes of that is worth more than any survey: the AI rounds
predict exactly where they'll hesitate (the Warm-up's result, "Calibrating", what to log
first), and this is the check on those predictions.

## Stage 3: open beta (14 days)

Twenty to fifty people through the public link. Sources that fit the app: friends of the
inner circle (ask each to pass the link to two people), a forecasting or rationality
community, a running or study group, colleagues. Aim for at least a third who have never
heard the word "calibration".

Testers under 13 aren't the audience; don't recruit children (and see the under-13 decision
in `SHIP_READINESS.md`).

Day by day:
- **Day 0:** the invitation (below). They do the Warm-up and log something for tomorrow.
- **Day 2:** a three-question check-in (below).
- **Day 7:** nothing from you. Whether they're still opening it unprompted is the data.
- **Day 14:** the closing questions (below), and thanks.

## How it's measured

Three sources, none of which needs a new SDK:

1. **The app's own counts.** Since step 186 (migration 007 applied) the app sends
   funnel counts for people without an account (Warm-up started and finished, a prediction
   logged, answered, shared, practice done), with no account, device or install id. From
   round 5's build they go only after the Warm-up's first screen has shown its line about
   them and the Usage stats switch (D69 (b)), and not at all from a tester who turns the
   switch off there or in You. A tester who finished the Warm-up on build 2 has no saved
   "notice shown" stamp and never sees the line again (it is on the Warm-up's first screen
   only), so their phone sends no guest counts after the update unless they sign in
   (`usageCountsMayGoUp`, `src/components/warmup/usageNotice.ts`). The two queries
   at the end of `HUMAN_VERIFICATION.md` read the signed-in counts, and the note under them
   says how to add the guests'. Most testers won't sign in, so the guest counts are most of
   the data.
2. **TestFlight itself:** per tester, whether they installed, sessions and crashes; and
   feedback with screenshots (a tester takes a screenshot and chooses "Share Beta
   Feedback"). Crash reports can be downloaded for 120 days. Public-link testers show as
   anonymous.
3. **What they tell you:** the check-in and closing questions. The closing set repeats the
   questions the AI testers answered, so the two can be compared.

## Exit criteria

With 20 to 50 people these are counts, not rates to quote. Thresholds marked *ours* are the
ones GROWTH §7 set before any data.

| What | Go | Look closer | Stop and fix |
|---|---|---|---|
| Crashes on the core loop | none | one, understood and fixed | any that repeats |
| Finished the Warm-up, of those who started | 7 in 10 or more *(ours)* | 5 to 7 in 10 | under 5 in 10 |
| Logged a prediction of their own on day 0, of Warm-up finishers | half or more *(ours)* | 3 to 5 in 10 | under 3 in 10 |
| Answered something by day 2, of those who logged | half or more | 3 to 5 in 10 | under 3 in 10 |
| Still opening it in week two | 3 in 10 or more | 2 to 3 in 10 | under 2 in 10 |
| Shared a card without being asked | a few do | one or two | nobody, and nobody says they would |
| The same confusion named by three or more testers | none left unfixed | one, with a fix planned | several |
| "How would you feel if you could no longer use it?" | several "very disappointed" among week-two users | mostly "somewhat" | mostly "not" |

What each failure means is in GROWTH §7: a Warm-up or first-prediction failure is an
onboarding problem and comes before anything else; nobody sharing means growth has to come
from search and ratings, not more share features; nobody back in week two means the wait for
the first rating is too long, and the first look at 10 answers and the daily practice are
where to work.

The submission can go ahead with rows in "look closer". A row in "stop and fix" gets a fix
and another week.

## Ready-to-use text

**Beta app description (required for external testing):**

> Fairly Sure shows you how well your confidence matches what actually happens. Start with
> the 60-second warm-up, then log a few predictions about your own week ("I'll finish the
> report by Friday", 70%) and answer yes or no when they come due.

**What to test:**

> 1. Do the warm-up and tell us what you made of the result.
> 2. Log two or three predictions about your own week, due in the next few days.
> 3. Answer them when the reminder comes.
> 4. Anything that confused you, annoyed you or made you smile: take a screenshot and choose
>    "Share Beta Feedback".
> Purchases in this test build are free and never charged.

**Beta review notes:**

> No account is needed: everything except the optional Coach works signed out. Purchases use
> the sandbox. The Coach (an AI summary of the user's own statistics, off by default) needs
> an account with Plus; demo credentials are in the sign-in fields. No gambling, stakes or
> currency: predictions are private notes about the user's own life.

**The invitation:**

> I've built an iPhone app called Fairly Sure and I'd like your honest reaction before it
> goes on the App Store. It checks how sure you say you are against what actually happens.
> It takes about two minutes today and a few seconds a day for two weeks. Here's the link:
> <public link>. If something's confusing or dull, that's exactly what I need to hear.

**Day 2 check-in (three questions):**

> 1. In one sentence, what is this app for?
> 2. What did you log, and was it easy to think of something?
> 3. What nearly made you close it?

**Day 14 closing questions:**

> 1. How would you feel if you could no longer use Fairly Sure: very disappointed, somewhat
>    disappointed, or not disappointed? Why?
> 2. What does your number (or "Calibrating") mean, in your own words?
> 3. Did you show or send it to anyone? What did you send?
> 4. What would you text a friend about it, and which friend?
> 5. What's the one thing that would make you love it?
> 6. Would you pay for the extra insights? What would feel fair for a year?

## What the agent does, and when

- **Done before the first build:** a "Help and support" link and the app's version in You,
  so a bug report can say which version; step 182, the hardening pass (BUILT_LOG row 182);
  step 180, the app lock; step 186, guest counts on; step 187, the launch page.
- **On your word:** the password reset once the
  custom mail sender works.
- **After each stage:** your device results, TestFlight feedback and survey answers turned
  into a ranked fix list (`/device-check`, then a step per batch), each with its reviews.
- **During stage 3:** the App Store listing pass: the age-rating answers and App Privacy
  sheet against the final build, review notes, and the screenshot list for you to capture.
- **Never:** `eas build`, `eas submit`, anything in App Store Connect, RevenueCat or
  Supabase, or a push without being asked.

## Timeline

Counting from the day the Paid Applications Agreement is submitted:

| Days | What |
|---|---|
| 0 to 2 | Agreement in review; Pages on; decisions; products, RevenueCat, EAS variables (**done**, 2026-11-15 to 11-16) |
| 2 to 3 | Step 180; the first production build; stage 1 begins (**done**: build 2 installed 2026-11-16) |
| 3 to 6 | Stage 1; one fix build; submit that build for TestFlight App Review |
| 6 to 13 | Stage 2, with two or three first-use sessions watched |
| 13 to 27 | Stage 3; the listing prepared in parallel |
| 27 to 30 | Read the exit criteria; the last fix build; submit to App Review |

About a month to submission if nothing lands in "stop and fix".

## Not verified

Apple's pages don't say, so confirm each in App Store Connect as you reach it:

- whether products must be more than created ("Ready to Submit") for TestFlight purchases;
- whether a privacy policy URL is required for external testing (have it live anyway);
- how long TestFlight App Review takes, and how long a build takes to process;
- how a free trial behaves in TestFlight and whether a tester's trial can be reset;
- what name testers see on the invitation for an individual account (on the App Store an
  individual's legal name is shown as the seller);
- whether the age-range sheet behaves in TestFlight as in a development build.
