> **Raw research, 2026-10-05.** How the app asks for a confidence, and what the
> Warmup's verdict can honestly claim. Decisions drawn from it live in
> [`../UI_ROADMAP.md`](../UI_ROADMAP.md) (steps 46–51, decisions D13 and D14) and
> [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md); where they differ, those files win.

# Asking for a number (October 2026)

## 1. What a fresh run-through found

The web build, on a cleared browser profile at 402 × 874 and then with the demo
data, played as a new user would: the Warmup without touching the slider, a first
prediction, a resolve, every tab.

| # | Where | What happened | Became |
|---|---|---|---|
| F1 | Warmup | Tapping an answer and **Next** ten times, never moving the slider, gives "You run overconfident · You were 75% confident on average, and right 50% of the time", and the share card "I run hot · 75% sure, 50% right". The 75% is the slider's starting point, not anything the user said. | Step 49 (the verdict says so); decision **D13** |
| F2 | Warmup | The question bank's header says it is chosen "to make an overconfident user *visibly* overconfident", with items "where the obvious answer is wrong". See §3: that is how the research literature manufactures overconfidence. | Decision **D14** |
| F3 | Log | Confidence starts at 50%, inside the 35–65% integrity band, so the "Integrity bonus · honest uncertainty" chip shows before anything is touched, and an untouched save is stored with the bonus and counted as an "honest coin-flip" on Wrapped. | Decision **D13** |
| F4 | Log | **Save** is enabled on an empty form; tapping it prints the store's message "title is required" in red, lower-case, below the due date. DESIGN_SYSTEM §7.12 already says Save is disabled until there's a title. | Step 46 |
| F5 | Stats | A badge row tells a Forecaster with 30 resolved "20 more resolved → Sharp" whatever the score, though Sharp also needs a score above 85. The Wrapped badge line ("Sharp in work: 20 to go") has the same gap. | Step 47 |
| F6 | Share | The weekly and yearly cards put the hit rate second in size ("86% came in"). A hit rate rewards safe calls: that's correctness, and the app's rule is to reward calibration. | Step 48 |
| F7 | Paywall | "1 month free, then $29.90" names no period, and the monthly equivalent DESIGN_SYSTEM §7.6 asks for under Annual was never built. | Step 50 |
| F8 | Stats → History | The chart says "Of 57 things you called 80–100% likely, 38 happened", but there's no way to see which 57. History filters by category only. | Step 51 |

Smaller notes, not acted on: the web build's first paint is a default blue
spinner on white (the native splash covers it on a phone); "Coach (AI)" in
Settings is a live-looking switch for a free user; History's "N happened" is a
correctness count, but it sits beside "N answered" as a plain fact and only
the Wrapped headline was promoting it.

## 2. Preset values on the confidence control

**The evidence on anchoring is mixed at this scale.** Liu & Conrad (2019, four web
experiments, n = 3,744 / 490 / 697 / 902) found that on 101-point sliders a default
of 25, 50, 75 or 100 drew significantly more answers at exactly that value, which
"seems unlikely to accurately reflect respondents' actual position", but found no
significant or consistent effect on 21- and 7-point scales. Calibrate's controls are
step-5: 21 points on Log (0–100) and 11 on the Warmup (50–100). Maineri, Bison &
Luijkx (2021) did find that the handle's starting position affected answers in
multi-device surveys, with smartphone respondents more sensitive to it. Funke (2016)
reports negative effects of sliders against visual analogue scales and radio
buttons. So a step-5 preset probably pulls answers less than a 101-point one would.

**The larger problem is not anchoring, it's non-response.** A preset makes "didn't
touch it" indistinguishable from "chose it". In a survey that's missing data
counted as an answer; here it is a calibration point. On the Warmup, someone who
taps through gets a verdict about the number we picked (F1), and it's the first
thing the app offers to share. On Log, the untouched 50% earns a bonus meant for
honest uncertainty (F3). The survey-design answer is a scale with no preset handle
(a visual analogue scale whose marker appears where it's first touched), so a
missing answer stays missing.

**What other calibration tools do.** Neither of these two presets the number:

- *Hedge: Calibrated Trivia* (iOS) asks for confidence as discrete buttons:
  50 / 60 / 70 / 80 / 90 / 99.
- *Fatebook* (Sage) has you type the percentage.

So a "set it yourself" control is the norm in this niche, not friction peculiar to
Calibrate. Whether it costs Warmup completion is measurable: the funnel already
tracks `warmup_started` → `warmup_completed`.

## 3. What a ten-question Warmup can claim

The classic overconfidence result (people say 70–80% on two-choice general
knowledge and are right less often) depends heavily on **which questions** are
asked:

- Gigerenzer, Hoffrage & Kleinbölting (1991) argued that experimenters, like quiz
  writers, pick items where the usual cue misleads, and that a random sample from a
  natural domain removes most of the effect.
- Juslin (1994) showed it directly: "informal experimenter-guided selection of
  almanac items" produces overconfidence that disappears when items are sampled
  representatively.
- Juslin, Winman & Olsson's (2000) review across 95 data sets with selected items
  and 35 with representative ones: selected items averaged **.73 confidence for .64
  correct**; representative ones **.73 for .72**, with mean absolute bias .10 against
  .03, so the near-zero result isn't averaging hiding spread.
- The related hard–easy effect: hard item sets produce overconfidence and easy ones
  underconfidence.

The Warmup bank is a selected, hard-leaning set by design (F2: whale vs 737,
ballpoint vs microwave, aluminium vs iron, milk vs water). So "You run
overconfident" on Day 0 says at least as much about our ten questions as about the
user, and it goes out on a card with their name on it. That runs against the
principle the app is built on ("never present a number built on noise"; a badge on
lucky data "actively misleads the user about themselves").

It is also a product choice, not a bug: `GROWTH_AND_MONETIZATION.md` §5.1 wants the
Day-0 "you're overconfident" moment. Options are in decision D14.

## 4. Calibration in counts: expected vs happened

Every stated confidence is a fractional expected count: three calls at 70% expect
2.1 to happen. Summed over a window, "you expected about 5; 6 happened" compares
confidence with reality with no verdict and no rate, so it's honest at a week's
sample size, which is what DESIGN_SYSTEM §7.14 asks a weekly card to be. It is the
counts form of what forecasters call calibration-in-the-large (observed against
expected). That is the line the Wrapped cards now carry in place of the hit rate
(step 48). The engine computes the sum (`WrappedSummary.expected`); the copy only
rounds it.

One wording note from the build: "You expected about 4. 6 happened." puts two
numbers side by side, and on the card it read as "4.6". The outcome now comes
first: "6 happened. You expected about 4."

## 5. Paywall price lines

App Review (3.1.2) wants the billed amount to be the most prominent price; a
monthly equivalent of an annual plan is allowed in a subordinate position and
size, and a per-month figure in big type over a yearly charge is treated as
misleading. RevenueCat's `StoreProduct.pricePerMonthString` gives the store's own
localized figure ("$2.50" for $29.99 a year), so the app prints that and never
divides. Step 50: each price names its period ("then $29.99 a year"), and Annual
gets "Works out to $2.50 a month." beneath it in footnote size.

## 6. Feedback that teaches (added the same day, second pass)

What a person sees after a resolution decides whether the app teaches calibration or
just records it.

- Benson & Önkal (1992): forecasters given **calibration feedback** (what they said
  against what happened, by range) improved calibration and cut overforecasting, in
  one step after a session; **simple outcome feedback had very little effect**.
- Lichtenstein & Fischhoff (1980): overconfident people became well calibrated after
  intensive performance feedback with calibration graphs, and nearly all of the
  improvement came from the first session.
- Martin & Mandel (2025, two experiments, n = 610 and 871): per-trial feedback with
  a score (the "Practical" scoring rule) and trial-by-trial correctness both failed
  to improve calibration. The line between what works and what doesn't looks like
  *summarised said-against-happened by range* versus *a score or a right/wrong per
  item*.

Calibrate already gives the second kind at the moment of resolving ("In your 60–80%
range, 40 of 52 have happened": counts) and the first kind only on Stats. Step 58
adds the range's own comparison to the resolve line once it holds 10 (the chart
title's threshold): "That's 77%, against the 69% you said." Both numbers are the
engine's bucket, the same ones the free Stats table shows, so nothing moves out of
Plus (the Plus correction table is per category and band).

Not acted on: the same comparison under Log's track record line would be
feed*forward*, arguably the better moment, but DESIGN_SYSTEM §7.12 keeps that line
to counts so it can't read as advice on what to pick, and the per-category rate is
what Plus's correction table sells. Worth a decision if Plus's shape changes.

## 7. Other notes from the second pass

- **Sign-in has no "Forgot password?"** Password reset can't send until custom SMTP
  is set up (`ACCOUNT_SPEC.md`, option B, still yours), so a link would lead nowhere.
  Add it with SMTP.
- **D9 got smaller.** Step 37 made the reminder scheduler reconcile with the OS at
  launch, which D9 listed as its hidden cost. Moving reminders to the evening now
  needs that reconcile to also reschedule a reminder whose time doesn't match, and
  the new time itself: S–M rather than M.

## Sources

- Slider defaults: [Liu & Conrad 2019, *Where should I start? On default values for slider questions in web surveys*, Social Science Computer Review 37(2)](https://journals.sagepub.com/doi/abs/10.1177/0894439318755336) · [Maineri, Bison & Luijkx 2021, *Slider bars in multi-device web surveys*, SSCR](https://dx.doi.org/10.1177/0894439319879132) · [Funke 2016, *A web experiment showing negative effects of slider scales compared to visual analogue scales and radio button scales*, SSCR](https://www.researchgate.net/publication/276844531_A_Web_Experiment_Showing_Negative_Effects_of_Slider_Scales_Compared_to_Visual_Analogue_Scales_and_Radio_Button_Scales)
- Calibration tools: [List of probability calibration exercises (LessWrong), Hedge's 50–99 buttons](https://www.lesswrong.com/posts/LdFbx9oqtKAAwtKF3/list-of-probability-calibration-exercises) · [Fatebook](https://fatebook.io/)
- Item selection: Gigerenzer, Hoffrage & Kleinbölting 1991, *Probabilistic mental models*, Psychological Review 98(4) · Juslin 1994, *The overconfidence phenomenon as a consequence of informal experimenter-guided selection of almanac items*, OBHDP 57(2) · Juslin, Winman & Olsson 2000, *Naive empiricism and dogmatism in confidence research*, Psychological Review 107(2); its .73/.64 and .73/.72 figures as summarised in [Hard–easy effect](https://en.wikipedia.org/wiki/Hard%E2%80%93easy_effect) · [PMM theory, overconfidence, and representative sampling of items: a review of data](https://psycharchives.org/en/item/26c5b2d8-a933-474e-a21b-d9c5ce4ac27c) · [Klayman et al. 1999, *Overconfidence: it depends on how, what, and whom you ask*](https://www.sciencedirect.com/science/article/abs/pii/S0749597899928479) · [Moore & Healy, *The trouble with overconfidence*](https://healy.econ.ohio-state.edu/papers/Moore_Healy-TroubleWithOverconfidence.pdf)
- Feedback: [Benson & Önkal 1992, *The effects of feedback and training on the performance of probability forecasters*, International Journal of Forecasting](https://www.sciencedirect.com/science/article/abs/pii/016920709290066I) · Lichtenstein & Fischhoff 1980, *Training for calibration*, OBHP 26 (as summarised in [Training to improve calibration and discrimination](https://www.researchgate.net/publication/12270784_Training_to_Improve_Calibration_and_Discrimination_The_Effects_of_Performance_and_Environmental_Feedback)) · [Martin & Mandel 2025, *Calibration feedback with the Practical scoring rule does not improve calibration of confidence*, Futures & Foresight Science](https://www.researchgate.net/publication/385657124_Calibration_Feedback_With_the_Practical_Scoring_Rule_Does_Not_Improve_Calibration_of_Confidence)
- Paywall pricing: [Apple, Auto-renewable subscriptions](https://developer.apple.com/app-store/subscriptions/) · [RevenueCat, App Store rejections guide](https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections) · [Guideline 3.1.2(c) explained](https://getresubmit.com/guides/app-store-guideline-3-1-2-c-subscription-information)
