# Rounds 12–15 aggregated: findings and fixes, 2026-11-12

One list from four rounds run on the same build in one day (`builder/playtest-setup`,
app unchanged since `6e6e28d`): thirty blind runs plus a stress pass and a
health check.

| Round | File | Focus | Runs | Median |
|---|---|---|---|---|
| 12 | `playtest-2026-11-12.md` | UI stress | 8 | — |
| 13 | `playtest-2026-11-12b.md` | appeal, first impressions | 8 | 6 |
| 14 | `playtest-2026-11-12c.md` | appeal, second cast | 8 | 6 |
| 15 | `playtest-2026-11-12d.md` | appeal, staying power (five returning) | 6 | 6.5 |

Every number here is from AI agents playing people: it says where groups part
ways, never what a market would do. The source files hold the evidence; this
file holds the decisions they need and the work that needs none. Where they
differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

## The picture in five lines

1. **Trust is won.** "Honest" from all 22 appeal runs; every comprehension
   answer in round 15 right; the sceptics (Dale, Héctor, Ingrid, Victoria)
   checked the maths and kept it.
2. **Answering is the best-made thing in the app** (round 15: every first task
   6–7 on ease), and the lines after an answer are the most-quoted writing.
3. **Appeal is decided by having a record.** Across 22 appeal runs, 7 of the
   11 fresh installs were "not disappointed" if it vanished; 10 of the 11 with
   a record were "somewhat" or "very" (the exception: Bernard, on his first
   answer). The first five minutes and the first six weeks are where people
   are lost.
4. **The first five minutes read as a school quiz**, and the honest Day-0
   result ("no clear lean") reads as a shrug to anyone who came for a verdict.
5. **Boring–exciting is the lowest pair in every appeal run** (3 in 18 of 22, 4 in the rest). Nobody
   chose Fun, Warm, Motivating or Satisfying. The app is respected more than
   enjoyed.

## A. Fixes that need no decision (one builder branch)

Each is a bug, a layout slip or a consistency fix within decided behaviour.

| # | Fix | Where | Seen in |
|---|---|---|---|
| A1 | A renamed category keeps its old name in "Furthest off" until something else redraws: subscribe the component to the category defs, and check every `categoryTitle` / `categoryLabel` call in a component that doesn't subscribe | `patternCopy.ts:20`, `CalibrationView.tsx:289` | R15 run 2 |
| A2 | "Washington, D.C.. You got it": don't add a full stop after an answer that ends in one | `verdictCopy.ts:136` | R13–15, 13 runs |
| A3 | The week recap's "next badge" tie breaks alphabetically, so it names a category with fewer predictions: break ties by predictions made | `nextBadgeCopy.ts:58, 70` | R13 run 2, R14 runs 3, 5 |
| A4 | Room under the fixed bars: Warm-up question 1's confidence control sits under Next / Skip at 320 wide and at 375 with large text, with Next disabled and no reason in view; Log's "Due Saturday" line sits behind the pinned Save | `WarmupQuiz`, `LogPredictionForm` | R13 run 3, R14 runs 1, 2, R15 runs 1, 6 |
| A5 | A save from Log opened over Insights or History gives no sign it worked: a short "Saved, due …" on the screen below | Log close path | R14 runs 6, 7, R15 runs 1, 5 |
| A6 | The Warm-up loses the current question's pick and number on return (earlier ones are kept) | `warmupStore` progress | R13 run 3, R14 run 8 |
| A7 | History's "not scored" details say what, not why: add D56's reason there | prediction details | R14 run 7 |
| A8 | The chart at tiny counts: `n=` labels collide with the field labels and sit over their bars, and a 0% dot is clipped by the axis | `CalibrationChart` | R12 #19, R15 runs 3, 5 |
| A9 | The playtest loader keeps the card's left-off categories (Erase keeps settings): reset the card settings on a profile load | `src/dev/loadProfile.ts` | R13 method |
| A10 | Round 12's no-decision list: Voice Control names that start with the visible words ("+5", "Save, due tomorrow"); trace the rating lines that disagree within minutes; reserve the track-record line's height on Log; a `space.sm` gap between touching targets (Warm-up Next/Skip, Edit/Answer it now, History rows, digest chips); the Categories switch layout; "1,001 answered" in History; clamp long reflections in History's list; a bar behind the floating × | see R12 #2, #4, #9, #10, #11, #17, #19, #20, #21 | R12, and Next/Skip again in R13 run 2 |

After them: `code-reviewer`, `/check`, a web pass, `/device-check` for the
layout ones.

## B. Decisions for the owner, ranked

Each with the evidence and the options. Ranked by the appeal kit's order:
the record, then what loses people before the first reward, then the empty
middle, then tone, sharing and worth.

### B1. Three ways to shape the record (run `record-auditor` first)

- **A due date can be moved once the outcome is known** (R13 run 8): nothing
  counts a postponement the way a deleted due prediction is counted (D45).
  Options: lock the date from the due day; count a move made inside the last
  day before it; or say so on Insights as the deletions are.
- **"Can't tell" lets the misses wait** (R14 run 7): skip everything, answer
  only what happened within the week (D45). Options: show the "Can't tell"
  count from the first answer, not only once unlocked; or count a skip that
  turns into a Yes differently.
- **Sure things still buy a badge** (R14 run 5; D41 says it raises the cost
  and doesn't end it). Recorded as the competitive user's read; revisit only
  if B1's other two change.

### B2. The first five minutes (D18, D36)

Evidence: the first screen dipped for most fresh installs across R13–R14
("isnae for the likes of me", "I farm", "I'm a tailor", "my chem teacher at
1 am"); the practice opened on atomic numbers again the same day; metric
units for a US farmer; US places for Leeds, Osaka, Oslo and Seoul; too easy
for an L5 (10 of 10 at 92%). The result page: buttons before the chart, a
five-sentence caption, about 2,000 px; "no clear lean" read as "so what was
the quiz for?" at L1 and "the app shrugged" by those who came for a verdict.
Options:
1. **Order the ten** so the first is an everyday kind (places, years), keep
   the random draw for the rest (D18 forbids picking tricky, not ordering).
2. **Units and places by region** (the practice tables already hold both).
3. **The result as one sentence and one chart** first, the bridge and the
   share after, the caption behind "What the grey bars mean".
4. **Say something about the person even when there's no lean**: "You were
   about as sure as you should have been" is the same rule in warmer words.

### B3. The empty middle, day 2 to week 6 (D53, D57, D58)

Evidence: "0 of 20" and "20 more" in three places; no "when" until three
scored answers (D53); "Too few to read yet" in four places; Ji-woo down a
point on day 6; Ramón "20 Friday nights"; Dev "what am I racing?". What
people asked for is honest: plain counts sooner ("your busy-night guesses: 3
of 4 happened"), a rough "when" from the logging pace on a fresh record, an
estimate with a range (R14 run 7: it jumped 12 days on one answer). Options:
plain counts by category from the first answer (counts only, no lean, R4
intact); the pace estimate from logged, not answered, predictions in week
one; the estimate as a range.

### B4. A life that isn't an office's (D39)

Evidence: R13–R15, nine runs: rain under Work, the football under Personal,
the chemistry test under Work, a taquería's staff, a farmer's markets; "Add
your own" found only in You (Dale after five months; "I wouldn't go looking
in settings"). Options: an "Add your own" chip on Log; starter ideas by life
(weather, family, school, a shop), not by job; weather, sport and school in
the icon grid; let Today and the card lead with a category the person picks
(Dale: "Sharp in health" for a farmer).

### B5. Pressure and tone (D17, D24, D27, D50)

- **A way to turn off the streak and the daily goal** (R13 runs 4, 7, 8, R15
  run 3 given up; "Goal: 1 of 3" on day one read as failure, as Duolingo, as
  stickK). The clinician's deal-breaker. A switch in You; the "nothing is lost
  when it ends" line on Today.
- **"Overconfident" five times in one evening** (R14 run 4) and **the field
  labels on the chart** at tiny counts (R15 runs 1, 3, 5: a grey n=1 dot in a
  field printed "Underconfident"). Hide the field labels and the connecting
  line until a range has 10 (D58's rule, carried to the chart's furniture).
- **The Brier line splits by group**: the professional wants it as the
  headline (R13 run 6), the teenager, the therapist and the student want it
  explained or away (R13 run 5, R14 run 6, R15 run 3). Options: keep it on
  Insights with "a hundredth or two can be luck" beside it; or behind "More".
- **Words that grade the person**: "a 40-point miss, and a score of 60"; the
  Oracle ladder; "This one is part of your record now"; "Where your judgment
  holds up, and where it doesn't."; ✕ beside "it didn't happen".
- **After a feared thing doesn't happen** (R13 run 4): a plain line naming a
  high-confidence miss ("You were 90% sure. It didn't happen.") instead of
  admin first; "Log it again" not leading after a one-off.
- **A rating that rises after a miss, a badge after a No**: one line on why.

### B6. Habits (D13, D32, D38, D56)

Evidence: R15 runs 4 and 6 (Héctor, Earl), R13 run 1 (Bernard). "Log it
again" leaves the confidence empty, so a daily habit costs 6–8 taps a night;
nothing shows "walked 17 of 22 days"; one reminder time asks about a 7 PM
meeting at 7 PM; "Log it again" offered for one-offs (a client's payment, a
release). Options: one tap for "same as last time" on a repeated title (the
anchoring D13 guards against is weaker when the title record is on screen);
the title record in its own words on that prediction's details; a per-
prediction reminder time; "Log it again" only when the title has repeated.

### B7. Sharing (D27, D42, D47, GROWTH §0)

Evidence: 22 appeal runs, one would post publicly; six of eight in R13 and
most of R14 would send it to one person or a closed group; the "How sure are
you?" dare is what travels. Asks: a legend for the squares (R14 run 6: a
friend's blue square unreadable); the way to the card from Today (the
identity line opens scoring, D27); the Day-0 card isn't the card that brought
them, and has no text share; a share for the daily practice result (the
Wordle habit, R14 run 2); themes previewed before the paywall; the recap as
a share image without in-app nudges; the streak on the card (R15 run 6);
"2 categories not shown" (D42, decided) read as "snitchy"; a friends board
(R13 run 6, R14 run 5) is new scope.

### B8. Long-time users (D37, GROWTH §4)

Evidence: R15 run 6 (Earl, 1,000 days) gave up on "did I get better?": only
"since last week", this year, or Plus Trends. Also: no 1,000-day moment, the
streak not tappable and below the fold on an SE, no search in History.
Options: a free then-and-now line once there are two years of a range
(counts only); 1,000 as a milestone; the streak row opening its history.

### B9. Privacy and what the phone shows (R12 #7, D31)

Evidence: the due-day reminder's body is the prediction's words
(`scheduler.ts:315`), on by default at 7 PM, and You doesn't say so (R14 run
8, a 16-year-old sharing a room); usage stats on by default (R14 run 7);
Erase keeps the stored settings (R13 finding 24); "lives only on this phone"
frightens long-time users who won't sign in (R13 run 6, R15 run 6). Options:
a "show the words in reminders" switch, or neutral text by default; say what
Erase keeps; `policy-auditor` on the usage-stats default.

### B10. What Plus is worth (GROWTH §4, P1)

Evidence: nobody in 22 appeal runs would start the annual plan on the day;
the asks are specific: a sample of Trends (Victoria, Earl), a friends board
(Dev), a therapy mode without streak and badges (Ruth), a habit mode
(Héctor), card colours once (Zara, Nusrat). "Start 1 month free" sits above
"free forever" (R14 run 1), Annual comes pre-ticked (R15 run 1). Store prices
localise, so the dollar complaints are web-only. Options: a Trends sample on
the Plus card; reorder the paywall's reassurance; consider a one-time
cosmetic pack.

### B11. Drafts (R12 #14)

A half-typed prediction is lost to an interruption: R12 runs 1, 2, 8, R13
run 2, R14 runs 1 (her −2, the deepest dip of the day: "I thought I broke
it") and 5. On iOS an app switch keeps memory; a kill doesn't. Keep a draft
for a while.

## C. What to protect

"About 7 times in 10" under every number; "Save, due Saturday"; the
after-answer lines ("one answer can't say much; 20 can", "isn't a mistake…
isn't proof", "8 of 12 have happened… against the 70% you said"); misses
recorded flatly, Yes and No the same; the track record and title match on
Log; Answer all and "All caught up… You expected 1 or 2"; the welcome back
without guilt; correcting within 24 hours; renaming without loss; "lives
only on this phone" for the privacy-minded; the honest paywall ("Plus adds
interpretation, not access"); the free CSV export; speed at 1,000 answers.

## Suggested order

1. **A1–A10** on one builder branch, then review and a web pass.
2. **`record-auditor` on B1**, since it can change what the record means.
3. **`/design` on B2, B3 and B5's streak switch**: the three that decide
   whether a new person stays.
4. B4–B11 as the owner chooses.
