> **Raw research, 2026-11-10.** Kept for its sources and reasoning. Nothing here is
> decided: the hypotheses in §6 feed the eleventh playtest round
> ([`round11-plan-2026-11-10.md`](round11-plan-2026-11-10.md)), and §7 lists points for
> the owner. Where this differs from `CLAUDE.md`, `DESIGN_SYSTEM.md` or `UI_ROADMAP.md`,
> those win. [`market.md`](market.md) (2026-09-25) covers the same field for visual
> design; this file covers what people bring with them from it.

# Goal and prediction apps: what people bring with them (November 2026)

Labels as in `market.md`: **[verified]** read on the primary page on 2026-11-10 (App
Store listings are US snapshots of that day and will drift); **[secondary]** reported by
a third party or a search summary I could not trace to a primary page; **[unverified]**
could not be confirmed. *Read* marks my inference.

## 0. Why this

Fairly Sure is listed under Productivity with "habit" and "goal" among its keywords
(`APP_STORE_LISTING.md` §1), and the first goal in `CLAUDE.md` is "Did you do what you
said you'd do?". So most people who find it will have used a goal or habit app first, and
they arrive with that app's idea of what logging, a miss, a streak and a price are. Ten
playtest rounds have tested people by ability, language and stage. None has tested
people by **where they came from**. This file maps the field by the habits it teaches.

## 1. The field at a glance

| App | Kind | What you log | Outcome | A miss | Price (US) | Ratings | Label |
|---|---|---|---|---|---|---|---|
| Strides | goal planner | habits, targets with a pace line, averages, projects | progress toward a number or date | behind the pace line | free (3 trackers by the developer; one reviewer says 1), Plus $39.99/yr, lifetime listed | 4.8★, 19K | [verified] |
| Griply | goal planner | life areas → goals → habits | progress | — | free tier 2 goals, 2 habits | — | [secondary, vendor] |
| Habitify | habit tracker | daily habits, counts | done, skipped, failed, partial | a "mindful pause" asks why | Plus $29.99/yr, Pro $49.99/yr or $8.99/mo, lifetime $119.99 | 4.6★, 7.2K | [verified] |
| Streaks | habit tracker | up to 24 tasks | done | the streak breaks | one-time (US$5.99 on 2026-09-25; $4.99 elsewhere) | 4.8★, 27K (Sept) | [verified Sept / secondary] |
| Way of Life | habit tracker | yes / no / skip per habit, daily | green, red, skipped | a red day | 3 habits free, about $5 to unlock | — | [secondary] |
| Habitica | gamified | dailies, habits, to-dos | XP and gold | missed dailies cost HP | subs $4.99/mo to $47.99/yr, gems | 4.3★, 3.7K | [verified; HP loss secondary] |
| Finch | gamified, self-care | small goals, mood | the pet grows | none ("positive reinforcement without penalties", Sept listing) | free, Plus at several prices ($34.99 to $69.99 listed) | 4.9★, 774K, Editors' Choice | [verified] |
| Atoms (James Clear) | identity habits | small habits, daily lessons | votes for "the kind of person you want to become" | — | 3 habits free; Pro $39.99/yr to $69.99/yr by source | — | [secondary, prices conflict] |
| Beeminder | commitment, money | any number over time | stay above the bright red line | "derailing is not failing", but it charges: $5, $10, $30, $90, $270, $810, $2430 | free (payment method needed), $8, $16 or $81/mo | — | [verified] |
| stickK | commitment, money | a contract with a referee | referee's verdict | money to a charity or anti-charity | free; charged only on failure | — | [secondary] |
| WOOP | technique | wish, outcome, obstacle, plan | — | — | free | — | [secondary] |
| Commit, Goals – AI Action Planner, Become, Vesper | AI coach | a goal, by voice or chat | check-ins | catch-up plans for missed days | Vesper Pro $15.99/mo, $149.99/yr | small | [secondary]; one, "AI Accountability Coach", left the store (last seen 2026-07-28) |
| Apple Fitness rings, Reminders | built in | automatic movement; reminders | a closed ring, a tick | an open ring | free | — | general knowledge |

## 2. What each kind teaches its users

### 2.1 Goal planners: a number, a date, a pace
Strides has four tracker types: Habit (streak calendar), Target (a number by a date,
drawn with a pace line and a projected line), Average and Project (milestones)
[verified]. Its users think in **progress toward a target** ("12 of 24 books") and in
long horizons (a year, a quarter). Its known friction is choosing the type: users stuck
on whether something is a habit, a goal, a project or an average [secondary, unstar.app,
early 2026]. *Read:* a Strides user will want "read 24 books this year" to show progress,
and will set due dates months out.

### 2.2 Habit trackers: tick it today
Habitify marks a habit **done, skipped or failed**, logs partial progress, lets you
pause a habit "when life changes", and after a skip or a fail asks you to note why (a
"mindful pause") [verified]. Way of Life is yes / no / skip with green and red days
[secondary]. Streaks is a tick per task with a streak [verified]. All of them **open and
close a goal on the same day**: you tick tonight what you did today. Complaints centre
on widgets (Habitify's redesign "ruined" them), weekly habits that don't fit the daily
model, and a day counting only when every habit is done [verified reviews].

### 2.3 Gamified: rewards for ticks
Habitica turns ticks into XP and gold and, by reviewers' accounts, takes HP for missed
dailies, which some find motivating and others anxious-making [verified listing;
punishment secondary]. Finch grows a pet and has no penalties [verified]. A two-year
Finch reviewer notes that people "just tick off tasks to earn rewards without doing
them" and asks for photo proof [verified review]. *Read:* self-report is the weak point
of every app here, and the reward is what invites the fudge. Fairly Sure's answer is to
reward nothing about the outcome (`CLAUDE.md`: "reward calibration, not correctness").

### 2.4 Commitment devices: money on the line
Beeminder charges when you cross your line, on a tripling schedule from $5 to $2,430,
asks after each derailment whether it was "legit", offers a stricter "No-Excuses Mode",
and archives a goal only after a week's countdown [verified]. stickK charges "only upon
Failure", with a referee [secondary]. *Read:* these users have learned that **saying
you're sure is a way to make yourself do it**. Asked "how sure are you?", they will
answer with their commitment, near 100%. They also expect an excuse route, which in
Fairly Sure looks like "Can't tell".

### 2.5 Identity: who you want to become
Atoms builds habits "based on the kind of person you want to become" [secondary]. That
is identity as **aspiration**. Fairly Sure's identity ("Sharp in health") is identity
as **receipts** (`CLAUDE.md`, Project Overview). Same word, opposite direction.

### 2.6 AI coaches: tell me what to do
The 2026 crop (Commit, Goals – AI Action Planner, Become, Vesper, which phones you)
turn a spoken goal into a plan, check in daily and write "catch-up" plans after missed
days [secondary]. None has visible traction; one has left the store. *Read:* their
users expect the app to talk first and to plan. Fairly Sure's Coach (Plus, sign-in)
interprets numbers and never plans.

### 2.7 Built-ins: the free default
Apple's Fitness rings track movement automatically and Reminders is free. *Read:* for
many iPhone owners the competitor is not an app but doing nothing extra. Anything manual
has to earn its place against automatic.

## 3. The calibration apps launched since September

`market.md` had Fatebook (web), Manifold, Metaculus and GJOpen. Since then, several iOS
apps doing what Fairly Sure does have appeared, none with traction yet:

| App | What it has | Price | Ratings | Label |
|---|---|---|---|---|
| Futures Study (Hessam Zahedi) | calibration curve, Brier, by band and domain; **import from Fatebook or a spreadsheet**; JSON/CSV export; six foresight frameworks; widget, Watch, Spotlight; three worked sample entries on day one. **v2.0 (Oct 24): practice rounds of ten known-answer questions, error ranges per band, forecast revision, a shareable track-record card.** "Data Not Collected." | $4.99 one-time | 5.0, 1 rating | [verified] |
| Prior: Calibration Trainer (Brandon Wang) | trivia training with a confidence slider, range questions (Pro), a prediction journal (**10 active predictions free**), **a global Brier leaderboard**, Brier trend (Pro). "Your calibration curve is the most honest thing about you." | free, Pro $4.99 / $34.99 | too few to show | [verified] |
| Predict It | predictions, calibration graph, Brier; rated 17+ | — | — | [secondary; listing 404 today] |
| Foresee: Predictions Tracker | records predictions, accuracy | — | — | [secondary] |
| Présage | on-device (SwiftData), live diagonal | — | — | [unverified; site did not resolve] |
| Hedge: Calibrated Trivia | a calibration game | — | 5 (Nov 3) | `APP_STORE_LISTING.md` §0 |

*Read:* the features overlap more each month. Futures Study's v2.0 alone added practice
questions and a shareable card. What none of them shows is **per-category identity with
count gates and a luck band**, a Warm-up that refuses to call a lean on luck, or the
same-day and deletion rules. That is the difference to defend, and to say in the
listing. What they have and Fairly Sure lacks: **import**, **revising a forecast**
(Fairly Sure locks the confidence on purpose, D25), a **leaderboard** (left out on
purpose), a widget and Watch, and a one-time price.

## 4. What goes wrong in this category

- **Free tiers that bite on day one.** Strides 1–3 trackers, Way of Life 3, Atoms 3,
  Griply 2 + 2, Prior 10 journal predictions. It is the most repeated complaint
  ("close to useless without Premium", Strides, July 2025) [verified review; others
  secondary]. Fairly Sure caps nothing in the core loop.
- **Paywalls after setup, features moved behind them, widgets removed**
  [secondary, review aggregators].
- **Data lost on a new phone** when backup was manual (Way of Life), and streaks gone
  after a reinstall or a sync error [secondary]. Fairly Sure without an account is
  local-only; an iPhone restored from a backup keeps app data, a phone set up fresh does
  not. The sign-in nudge comes after 30 days (D31).
- **Trial billing distrust.** Fabulous has years of "charged after I cancelled"
  reports, many from web sign-ups outside Apple [secondary, user reports]. Fairly Sure's
  paywall already states the conversion and the 24-hour rule.
- **Guilt and dependency.** Half of 141 lapsed Fitbit users described guilt about
  stopping (University of Washington, 2016) [secondary]. A study of the Lift habit app
  found reminders and streaks build repetition but also dependency: people quit the app
  and then the behaviour (Northumbria) [secondary].
- **Short lives.** Thirty-day retention for health and fitness apps is quoted at 3–8%
  [secondary, mixed vintages]; no productivity figure found.

## 5. Where Fairly Sure meets those habits

| They expect (from) | Fairly Sure does | Risk |
|---|---|---|
| "How sure" = how committed (Beeminder, stickK, Atoms) | Asks for a chance; the record measures it | Own goals logged at 95–100%, then read as failure when one misses |
| Tick it today (habit trackers) | No "today" due date; an answer on the day it was logged isn't scored (D41) | A habit user's natural flow fills History with "not scored" |
| A year-long target with progress (Strides) | Yes or No on a due date; the first prediction defaults to Tomorrow (D18) | Nothing comes back for months; "12 of 24" has nowhere to go |
| Partial progress (Habitify, Strides) | Happened / Didn't / Can't tell | People bend a 4-of-5 week into Yes, or into Can't tell |
| A recurring habit (all trackers) | "Log it again" after an answer | Retyping every day, or giving up |
| An excuse for a miss (Beeminder's "legit") | Can't tell is for unknown outcomes; Insights counts them beside the rating | A known miss parked as Can't tell (a record risk, §5 of the profile) |
| No penalty, warmth (Finch, Gentler) | Neutral counts; identical Yes/No feedback; D50's line after an answer | Reads as cold beside a pet |
| A comeback plan (AI coaches), a mindful pause (Habitify) | The Welcome back card after 14 days (D51) | Untested against someone who left after a bad result |
| Revise as you learn (Futures Study, sales CRMs) | The confidence is the record; never editable (D25) | Forecasters and salespeople look for it |
| Widgets, Siri, Watch, automatic data (built-ins) | None | Manual logging has to earn its place |
| Friends, parties, leaderboards (Habitica, Prior) | A share card; no social graph | Competitive people find nothing to compete in |
| A cap and an early paywall (most) | No cap; Plus sells Coach, Trends, themes | The difference may go unnoticed unless it's said |
| Their data on a new phone (Way of Life's lesson) | Local unless signed in; CSV export free | People who never sign in can lose it |

## 6. Hypotheses for the eleventh round

Each is a claim a run can support or not. The plan maps runs to them.

- **H1 Commitment, not chance.** People from goal apps put 90–100% on their own goals
  and give a commitment reason ("if I say less I'm planning to fail"). Nothing before
  the first miss changes that.
- **H2 Same-day ticking.** A habit-tracker user tries to log and close a goal on one
  day and ends up with "not scored" answers, without knowing why.
- **H3 Long horizons.** A goal planner sets due dates months out and finds nothing to
  come back for this week.
- **H4 Partial outcomes.** A goal with partial progress gets forced into Yes or into
  Can't tell.
- **H5 The excuse route.** Someone used to "legit derailments" marks a miss with a
  reason as Can't tell, and the Can't tell count on Insights is or isn't enough to show
  them what that does.
- **H6 Coming back after a bad result.** The Welcome back card reads as an invitation,
  not a reminder of failure, to someone who left because of a miss (a weigh-in).
- **H7 No cap goes unnoticed.** People from capped apps don't notice that nothing is
  capped, and the trial copy is or isn't believed by someone burned before.
- **H8 Built-ins.** Someone who lives in Fitness rings and Reminders won't log by hand
  without a widget or Siri, unless the first result is worth it.

## 7. Desk findings for the owner (no playtest needed)

1. **Pricing (P1).** The goal-app annual prices found cluster at $30–$50: Habitify Plus
   $29.99, Strides $39.99, Atoms $39.99 (secondary), Habitica $47.99, Habitify Pro
   $49.99. GROWTH §4's $34.99 sits inside that band; $29.99 is at its floor. The direct
   rivals price low and once (Futures Study $4.99), or $34.99 (Prior Pro, period not
   stated).
2. **Import.** Futures Study imports from Fatebook and spreadsheets, so a forecaster
   can bring a record with them. Fairly Sure exports CSV but imports nothing. Whether
   that matters depends on whether forecasters are a target; the cast so far suggests
   they keep it for the method page (`playtest-2026-11-09b.md`).
3. **The listing's difference.** With practice questions and share cards now in a rival,
   the store copy's strongest unshared claims are the per-category identity with count
   gates, the luck band in the Warm-up, and the rules that stop padding.
4. **The keywords.** "habit" and "goal" bring habit-tracker users. Either the first
   minutes meet them (H1–H4), or the keywords cost more than they bring. App Store
   Connect's search-term data will tell once there is some.

## 8. Could not verify

Présage's site (did not resolve); Predict It's listing (404 today); the 2026 prices for
Atoms, Streaks and Way of Life (sources conflict); Griply's figures (vendor only); the
habit-app abandonment percentages that circulate (92% in 60 days, 52% in 30), which
trace to no primary study; whether Finch still says "without penalties" (not on
today's listing).

## Sources

- Strides listing: https://apps.apple.com/us/app/strides-habit-tracker/id672401817
- Habitify listing: https://apps.apple.com/us/app/habitify-habit-tracker/id1111447047
- Habitica listing: https://apps.apple.com/us/app/habitica-gamified-taskmanager/id994882113
- Finch listing: https://apps.apple.com/us/app/finch-self-care-pet/id1528595748
- Beeminder pricing and pledges: https://www.beeminder.com/money
- stickK listing and terms: https://apps.apple.com/app/stickk/id776128765 · https://stickk.zendesk.com/hc/en-us/articles/206119378
- Futures Study listing: https://apps.apple.com/us/app/futures-study/id6788912818
- Prior: Calibration Trainer listing: https://apps.apple.com/us/app/-/id6761640659
- Foresee: https://apps.apple.com/ca/app/id6447700092 · Predict It: https://apps.apple.com/gb/app/predict-it/id6572290258 · Présage: https://presage.pages.dev/
- Fatebook on mobile: https://forum.effectivealtruism.org/posts/8t363y2uXe4sEXacM/new-unofficial-fatebook-android-app
- Griply comparisons (vendor): https://griply.app/compare/griply-vs-strides
- Complaint themes, 1–3 star reviews, early 2026: https://unstar.app/blog/streaks-habitica-way-of-life-strides-habit-tracking-apps-ranked-2026
- Atoms prices and reviews: https://atoms.jamesclear.com · https://yourstory.com/2024/05/james-clear-atoms-app-transform-habits · https://world.hey.com/luke.sizmur/my-atoms-review-1f3bd5df
- AI coaches: https://apps.apple.com/us/app/id6747647035 · https://apps.apple.com/us/app/-/id6757492168 · https://apps.apple.com/app/id6757384398 · https://apps.apple.com/lu/app/vesper-ai/id6444138264 · https://appshunter.io/ios/app/ai-accountability-coach/id6763578748
- WOOP: https://healthify.nz/apps/w/woop-app
- Lapsed Fitbit users: https://phys.org/news/2016-09-life-fitbit-appealing-guilty-free.pdf
- Lift habit app dependency: https://researchportal.northumbria.ac.uk/en/publications/dont-kick-the-habit-the-role-of-dependency-in-habit-formation-app/
- Fabulous billing: https://help.thefabulous.co/en/support/solutions/articles/101000500823-why-was-i-charged-after-my-free-trial- · https://discussions.apple.com/thread/256198931
- Retention benchmarks: https://businessofapps.com/data/health-fitness-app-benchmarks · https://phiture.com/mobilegrowthstack/managing-retention-rate-benchmarks-and-expectations/
