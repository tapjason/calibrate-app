> **Raw research, 2026-10-07.** What brings people back to an app like Calibrate,
> day after day, and which of those mechanics the evidence actually supports.
> Decisions drawn from it live in [`../UI_ROADMAP.md`](../UI_ROADMAP.md) (steps
> 87–89, decision D17) and [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) (§6.2,
> §7.15, §7.22); where they differ, those files win.

# Coming back: retention mechanics and their evidence (October 2026)

The earlier rounds chose how Calibrate looks ([`market.md`](market.md),
[`visual-language.md`](visual-language.md)), how its everyday surfaces work
([`patterns.md`](patterns.md)), how it asks for a number
([`confidence-2026-10.md`](confidence-2026-10.md)) and which controls it uses
([`elements-2026-10.md`](elements-2026-10.md)). This round asks what makes someone
open it again tomorrow, and next month.

Tags, as in `market.md`: **[primary]** is the experimenter's or the company's own
report of its own data; **[secondary]** is a vendor blog or a summary; **[unverified]**
is a number that appears only in secondary places with no primary source found.
Correlational findings are marked as such: "people who do X stay longer" is not
"X makes people stay".

## 1. Calibrate's return loop today

Played on the web build with the demo data and a cleared profile, against the code.

| What pulls someone back | When | Gap |
|---|---|---|
| A reminder on a prediction's due day (19:00) | Only when something comes due | Due dates are set days or weeks out, so a new user's first week can have **no reason to open the app at all** once the Warmup and first logs are done. |
| The Sunday digest | Weekly | Passive by design; it never interrupts. |
| The streak (step 61): a day counts with **3** predictions logged or answered | Daily | **The bar is high, and one missed day ends it.** A streak that ends shows nothing until the next one starts (by design: no guilt), so the only thing the person sees after a miss is that it's gone. |
| The score unlock and badges | After 20 resolutions (weeks) | The strongest identity hook arrives late, after the window in which most installs are lost. |
| Wrapped, the share card | Weekly / when shared | Growth more than return. |

So the gaps are a **daily** reason to open that doesn't depend on due dates, a habit
cue at a time the person chose, and a streak that survives an ordinary bad day.

Context [secondary]: vendor benchmarks put day-30 retention for health and fitness
apps somewhere between 3% and 12%, depending on whose SDK measured it
([UXCam](https://uxcam.com/blog/mobile-app-retention-benchmarks/),
[Pushwoosh](https://www.pushwoosh.com/blog/increase-user-retention-rate/)). The
spread itself says how soft these numbers are; the point is only that most installs
are gone within a month, so the first week is where retention is won.

## 2. The evidence, by mechanism

### 2.1 How hard a streak day is to earn

- **Duolingo, November 2020 [primary, A/B test].** The streak used to extend only
  when the daily XP goal was met. Letting a **single lesson** extend it instead
  raised day-14 retention **+3.3%**, daily actives **+1%**, daily learners on a
  streak **+10.5%** within 20 days, and **+19%** among new users. Fewer people met
  their daily goal, but more kept the habit; a year on, "just over half" of daily
  learners had a 7-day streak, up from about a third.
  ([blog.duolingo.com/improving-the-streak](https://blog.duolingo.com/improving-the-streak))
- This is the most direct causal evidence in the set, and it points against
  Calibrate's current rule. D2 chose **three** a day so that a counted day means
  something; Duolingo's test is the case where a harder day-rule cost retention and
  an easier one with the goal kept separately won it back. **Decision D17.**

### 2.2 Slack: a missed day that doesn't end the streak

- **Duolingo [primary].** Raising Streak Freeze capacity from one to two raised daily
  active learners **+0.38%**. A Freeze "allows you to hit pause on your streak for a
  day"; it is bought with gems.
  ([blog.duolingo.com/how-duolingo-streak-builds-habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit))
- **Sharif & Shu 2017, JMR 54(3) [primary, six studies].** An *emergency reserve*, a
  fixed, small amount of slack that has a cost to use, makes a goal more attractive
  **and** increases persistence: people work to avoid spending it. Free, unlimited
  slack doesn't do the same.
  ([ResearchGate](https://www.researchgate.net/publication/305517686_The_Benefits_of_Emergency_Reserves_Greater_Preference_and_Persistence_for_Goals_having_Slack_with_a_Cost))
- **Sharif & Shu 2021, OBHDP 163 [primary, one field and four lab studies].** After
  failing a subgoal, people whose goal had an emergency reserve felt more progress,
  stayed more committed and were more likely to keep going.
  ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0749597818304187))
- **Silverman & Barasch 2023, JCR 49(6) [primary, seven studies].** Seeing an intact
  streak increases further engagement relative to seeing a broken one, regardless of
  how much was actually done. The effect is larger when people blame the break on
  themselves, and **smaller when the streak can be repaired**.
  ([INSEAD](https://www.insead.edu/faculty-research/publications/journal-articles/or-track-how-broken-streaks-affect-consumer))
- **Lally et al. 2010, EJSP 40(6) [primary].** Habits took a median 66 days to form
  (18–254), and "missing one opportunity to perform the behaviour did not materially
  affect the habit formation process". A streak that ends on one miss punishes
  something the habit itself doesn't.
  ([Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674))

**What follows:** rest days, earned rather than bought, finite, and spent
automatically on a day that doesn't count. Earning them makes using one a small cost
(Sharif & Shu's condition); spending them automatically means a busy day never ends
a streak the person was keeping. **Built as step 87.**

### 2.3 Milestones

- **Duolingo [primary].** A milestone animation raised the chance a new learner was
  still active on day 7 by **+1.7%**. Learners who reach a 7-day streak are **3.6×**
  more likely to finish their course (correlational).
  ([blog.duolingo.com/how-duolingo-streak-builds-habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit))
- Calibrate names its checkpoints (step 64) without the motion; the celebration stays
  parked as FUTURE_UI B1 because it needs a device to tune. This evidence is a reason
  to build it at the first device session, not before.

### 2.4 Reminders

- **Yancey & Settles 2020, KDD [primary, A/B test on Duolingo's daily practice
  reminders].** Choosing the reminder's wording per user with a bandit that penalises
  recently seen templates raised daily actives **+0.5%**, new-user day-1 retention
  **+2.2%** and new-user day-7 retention **+2.0%** over a strong baseline. Repetition
  wears reminders out: "fresh" templates "tend to have higher impact", and always
  reusing the last template scored **0.5% worse** than picking at random.
  ([paper](https://research.duolingo.com/papers/yancey.kdd20.pdf))
- **Gollwitzer & Sheeran 2006, Advances in Experimental Social Psychology 38
  [primary, meta-analysis of 94 tests].** Implementation intentions ("when X happens,
  I'll do Y") improve goal attainment over a goal alone, **d = 0.65**.
  ([Konstanz](https://www.socmot.uni-konstanz.de/publications/implementation-intentions-and-goal-achievement-meta-analysis-effects-and-processes))

**What follows:** a reminder at a time the person picks, offered as a moment in their
day ("With coffee · 8:00 AM") rather than a bare clock time, and a different wording
each day. Its body is that day's first question, so each one is new by construction.
It never mentions the streak and never uses loss framing (DESIGN_SYSTEM §7.15).
**Built as step 89.**

### 2.5 A daily reason that doesn't wait on due dates

- **Wordle [primary, the creator's account].** One puzzle a day, the same for
  everyone: "it's one puzzle, and everybody is solving it." Its creator says he
  "deliberately did what you're not meant to do if growth is your goal".
  ([TechCrunch, 2022-01-12](https://techcrunch.com/2022/01/12/josh-wardle-interview-wordle/))
- **Duolingo Daily Quests**, three small tasks a day: "+25% daily actives" appears only
  in secondary write-ups. **[unverified]**
  ([Econsultancy](https://econsultancy.com/six-a-b-tests-used-by-duolingo-to-tap-into-habit-forming-behaviour/))
- **Does practice on trivia improve real calibration?** Mixed, so the app must not
  claim it:
  - Lichtenstein & Fischhoff 1980 [primary]: calibration improved with feedback,
    mostly after the first session, and carried over to *similar* tasks only.
    ([PDF](https://home.csulb.edu/~cwallis/382/certainty/overconfidence/Training%20to%20Improve%20Calibration.pdf))
  - Chang, Chen, Mellers & Tetlock 2016, JDM 11(5) [primary]: under an hour of
    probabilistic-reasoning training improved geopolitical forecasting Brier scores by
    **6–11%** across four years. ([JDM](https://www.sas.upenn.edu/~baron/journal/16/16511/jdm16511.pdf))
  - Gruetzemacher 2024, Futures & Foresight Science [primary, 153 students]: under
    thirty minutes of app-based training reduced overconfidence in a football
    forecasting tournament. ([Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1002/ffo2.177))
  - Martin 2025, Futures & Foresight Science [primary, N = 610 and 871]: trial-by-trial
    score feedback did **not** improve calibration.
    ([Wiley](https://onlinelibrary.wiley.com/doi/10.1002/ffo2.199))
  - Stone 2023, JBDM [primary]: automated calibration feedback reduced overconfidence
    on a blackjack task but not on predicting baseball games.
    ([Wiley](https://onlinelibrary.wiley.com/doi/full/10.1002/bdm.2334))
- **Representative questions.** Gigerenzer, Hoffrage & Kleinbölting 1991 (Psych
  Review 98) [primary]: when questions were sampled at random from a natural class
  (German cities over 100,000), overconfidence disappeared; with selected items, it
  appeared. This is the same finding behind D14 (Juslin, Winman & Olsson 2000).
  ([PhilPapers](https://philpapers.org/rec/GIGPMM))

**What follows:** three questions a day, the same three for everyone on the same day,
**drawn at random from reference tables** (city latitudes, country areas, years,
heights) rather than picked to be tricky. So the practice record describes the person,
not the question selection: the bank D14 (c) has been waiting for. Practice is kept
apart from the real score, like the Warmup, and the app says only that it is practice,
never that it improves the score. **Built as step 88.**

One adjustment, found by reading two weeks of generated questions: pairs drawn from
the whole of each table were about half giveaways ("Auckland or San Francisco, farther
north?"), and a practice that's mostly obvious is neither worth opening nor much use
for calibration. So pairs are drawn at random from those within a band of closeness
(at most 12° of latitude, a fourfold area, 100 years…), and at least far enough apart
that sources can't disagree on the answer. The band is chosen by distance, never by
whether the obvious answer is wrong, so the draw stays representative of "pairs this
close", not of "pairs that fool people". It does make the set harder than the whole
tables would be, and harder sets show more overconfidence (the hard-easy effect), which
is one more reason the practice record is labelled as practice.

### 2.6 Social accountability

- **Duolingo Friend Streak [primary, correlational].** "Learners with at least one
  Friend Streak are 22% more likely to complete their daily lesson."
  ([blog.duolingo.com/product-lessons-friend-streak](https://blog.duolingo.com/product-lessons-friend-streak/))
- Needs accounts on both sides, invites and a backend: FUTURE_UI A9, after sync has
  real users. Kept to calibration ("you were both 70%"), never a leaderboard.

## 3. Ranked for Calibrate

| # | Mechanic | Evidence | Fits the principles? | Status |
|---|---|---|---|---|
| 1 | Rest days: a missed day doesn't end the streak, up to two saved | 2.2 (strong, converging) | Yes: no guilt, honest count (a rest day adds nothing) | **Built, step 87** |
| 2 | An easier streak day, with three kept as the day's goal | 2.1 (A/B, +3.3% D14) | Yes, but it reverses D2 | **D17, approved and built as step 90** |
| 3 | Daily practice: three questions, same for everyone each day | 2.5 (design rationale; training effect mixed) | Yes, if kept apart from the score | **Built, step 88** |
| 4 | Practice reminder at a chosen moment, a new wording daily | 2.4 (A/B +2% new-user D7; d = 0.65) | Yes: opt-in, no streak, stops after three days away | **Built, step 89** |
| 5 | Checkpoint celebration | 2.3 (+1.7% D7) | Yes | Parked (FUTURE_UI B1): needs a device |
| 6 | Widgets ("2 ready to resolve") | No primary number found ([unverified] "+60% commitment") | Yes | Parked (P1/A10): native target |
| 7 | Friend streaks / predict with a friend | 2.6 (correlational) | Only as shared calibration | Parked (A9): backend |

**Not recommended:** a paid streak repair (Duolingo sells one; it would put a price on
a habit counter and invite "pay to keep it" pressure), notifications that frame the
streak as something to lose (§7.15 already forbids it, and the no-guilt principle is
one of the most praised things about Gentler Streak), and a second streak for practice
(two counters compete; the streak stays about real predictions).

## 4. What to measure

None of these need new analytics properties beyond the three events added with step
88 and 89 (`practice_started`, `practice_completed`, `practice_reminder_set`):

- D1 / D7 / D30 retention from the existing event timestamps, split by whether the
  person has used practice (correlational) and before/after 2026-10-07.
- Practice completion: `practice_completed / practice_started`, and how many days a
  week people practise.
- Reminder opt-in: `practice_reminder_set` against `practice_completed`.
- For D17: the share of active days that reach three, from `prediction_logged` and
  `prediction_resolved` per local day. If most active days stop at one or two, the
  three-a-day rule is ending streaks the habit doesn't deserve to lose.

## Sources

- Duolingo: [How Duolingo's streak builds habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit) · [Improving the streak](https://blog.duolingo.com/improving-the-streak) · [5 product lessons from Friend Streak](https://blog.duolingo.com/product-lessons-friend-streak/)
- Yancey, K. P., & Settles, B. (2020). *A Sleeping, Recovering Bandit Algorithm for Optimizing Recurring Notifications.* KDD '20. [PDF](https://research.duolingo.com/papers/yancey.kdd20.pdf)
- Sharif, M. A., & Shu, S. B. (2017). *The Benefits of Emergency Reserves.* Journal of Marketing Research 54(3), 495–509. [ResearchGate](https://www.researchgate.net/publication/305517686_The_Benefits_of_Emergency_Reserves_Greater_Preference_and_Persistence_for_Goals_having_Slack_with_a_Cost)
- Sharif, M. A., & Shu, S. B. (2021). *Nudging persistence after failure through emergency reserves.* OBHDP 163, 17–29. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0749597818304187)
- Silverman, J., & Barasch, A. (2023). *On or Off Track: How (Broken) Streaks Affect Consumer Decisions.* Journal of Consumer Research 49(6), 1095–1117. [INSEAD](https://www.insead.edu/faculty-research/publications/journal-articles/or-track-how-broken-streaks-affect-consumer)
- Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). *How are habits formed.* European Journal of Social Psychology 40(6), 998–1009. [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674)
- Gollwitzer, P. M., & Sheeran, P. (2006). *Implementation intentions and goal achievement: A meta-analysis.* Advances in Experimental Social Psychology 38, 69–119. [Konstanz](https://www.socmot.uni-konstanz.de/publications/implementation-intentions-and-goal-achievement-meta-analysis-effects-and-processes)
- Lichtenstein, S., & Fischhoff, B. (1980). *Training for calibration.* OBHP 26(2), 149–171.
- Chang, W., Chen, E., Mellers, B., & Tetlock, P. (2016). *Developing expert political judgment.* Judgment and Decision Making 11(5), 509–526. [PDF](https://www.sas.upenn.edu/~baron/journal/16/16511/jdm16511.pdf)
- Gruetzemacher, R. (2024). *Calibration training for improving probabilistic judgments using an interactive app.* Futures & Foresight Science 6(2), e177. [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1002/ffo2.177)
- Martin (2025). *Calibration Feedback With the Practical Scoring Rule Does Not Improve Calibration of Confidence.* Futures & Foresight Science 7(1). [Wiley](https://onlinelibrary.wiley.com/doi/10.1002/ffo2.199)
- Stone (2023). *Automated calibration training for forecasters.* JBDM 36(4), e2334. [Wiley](https://onlinelibrary.wiley.com/doi/full/10.1002/bdm.2334)
- Gigerenzer, G., Hoffrage, U., & Kleinbölting, H. (1991). *Probabilistic mental models: A Brunswikian theory of confidence.* Psychological Review 98(4), 506–528. [PhilPapers](https://philpapers.org/rec/GIGPMM)
- Wardle, J., interviewed in [TechCrunch, 2022-01-12](https://techcrunch.com/2022/01/12/josh-wardle-interview-wordle/)
- Retention benchmarks [secondary]: [UXCam](https://uxcam.com/blog/mobile-app-retention-benchmarks/) · [Pushwoosh](https://www.pushwoosh.com/blog/increase-user-retention-rate/)
- [Econsultancy, Six A/B tests used by Duolingo](https://econsultancy.com/six-a-b-tests-used-by-duolingo-to-tap-into-habit-forming-behaviour/) (the unverified Daily Quests figure)
