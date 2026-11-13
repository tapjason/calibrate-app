# Blind playtest, 2026-11-12 (f): usability, measured differently

Raw findings, 2026-11-12. The seventeenth round: usability and task success,
measured with standard instruments (SEQ, SUS, first clicks, errors), on eight
people new to rounds 12–16 whose axes are combined in new ways. Plan, cast
and criteria: `round17-plan-2026-11-12.md`. These are what the testers saw,
checked against the code; they are not decisions. **AI agents playing
people:** SUS and SEQ here are a structured way to compare tasks and people,
not benchmarks against real users. Where they differ, `CLAUDE.md`,
`DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

## Method

- **Build:** `builder/playtest-fixes`, at step 172 plus its review fixes
  (`fe472fe` to the review-fix commit).
- **Health check:** done by the main session, not `web-playtester`, because
  the round 16 health check had covered every profile. Checked:
  - the scoring sheet's × pinned at Badges (390, `long-time`);
  - Log at 320 bringing the slider into view after a category.
- **Measures:**
  - SEQ after each task (1–7; about 5.5 is the usual benchmark);
  - first click on each findability task;
  - errors and recoveries per task;
  - the mood line at four moments;
  - SUS once at the end (0–100; 68 is average);
  - best and worst moment;
  - HEART-style end questions.
- **Stand-ins:**
  - **Sam:** deuteranopia through CDP `Emulation.setEmulatedVisionDeficiency`.
    His report says no filter was visible to him, so he judged hues by their
    known confusion pairs.
  - **Kofi:** the accessibility tree and keyboard only.
  - **Destiny:** a 195 × 422 viewport.
  - **Wen:** thumb reach only.
- **Two bugs were fixed after the runs** (`1a5501f`): the recap card's
  spoken "s" (finding 9) and "Logged again" across categories (finding 8).

## The persona table

| # | Persona (new combination) | Stage, screen | Verdict | Score | SUS |
|---|---|---|---|---|---|
| 1 | Sam, paramedic, red-green colour blind | five months, 402 dark | keep | 7 | 72.5 |
| 2 | Kofi, blind accessibility consultant, L5 | fresh, 390 light, keyboard and tree | unsure: "not accessible yet" (mostly web focus) | 6 | 62.5 |
| 3 | Noor, anxious perfectionist accountant | one from unlocking, 375 light | keep | 7 | 70 |
| 4 | Hiroshi, 71, retired engineer, 320 phone | daily walk, 320 light | keep | 7 | 75 |
| 5 | Jun, 19, ADHD, interrupted | fresh, 375 dark | unsure | 6 | 75 |
| 6 | Destiny, 22, L2, uneasy with percentages, large text | fresh, 195 × 422 | keep for now | 7 | 70 |
| 7 | Seun, football bettor, crowded record | `stress`, 390 dark | unsure | 6 | 60 |
| 8 | Wen, quant risk manager, one thumb (wildcard) | fresh, 390 light | unsure, leaning keep | 7 | 77.5 |

- **SUS:** mean 70.3, median 71.25. That's above the usual 68, but spread
  from 60 (Seun) to 77.5 (Wen).
- **Scores:** median 7.
- **Lowest SUS, and why:**
  - Seun and Kofi. Seun's comes from badges across 13 categories.
  - Kofi's is mostly web focus handling, which isn't ranked.
- **Highest:** Wen, who checked the maths by hand and found it held.

## Task success (SEQ, errors, first clicks)

| Task kind | SEQ (runs) | Errors | First click off the path |
|---|---|---|---|
| Answering a due prediction | 7, 6, 7, 6 (Sam, Noor, Hiroshi, Seun) | 0 | none |
| Logging a prediction | 6, 6, 6, 5, 6, 5 | Jun 1, Destiny 1 (slider tap overshoot) | none |
| The Warm-up | 4 (Kofi), 6, 6, 6 | Kofi 2 (web focus) | none |
| Reading the Warm-up result and key | 4 (Kofi), 4 (Destiny), 7 (Jun) | 0 | none |
| **What my number or badge means** | **4 (Noor), 3 (Seun), 5 (Hiroshi)** | Noor 1, Seun 3 (dead taps) | **Noor and Seun: tapped the 88 on Today** |
| Reading the chart without colour | 5 (Sam) | 0 | none |
| **The card's marks, the text share** | **3, 2 (Sam)** | 1 (web share) | none |
| The weekly recap | 5 (Seun, by luck) | 0 | none |
| How scoring works | 6, 6 (Kofi, Wen) | 0 | none |

- **Answering and logging hold up** for every kind of person in the round.
- **Under the 5.5 benchmark:**
  - what the person's number or badge means;
  - the card's marks and the text share;
  - the Warm-up result for a screen reader and at large text.

## Did step 172 land

| Fix | Who | Landed? |
|---|---|---|
| Scoring sheet's × pinned | Seun (opened from Insights) | yes, "the X took me straight back". The Badges jump from Today's line wasn't reached: no category is past 20, so there's no identity line |
| Log brings the slider into view after a category | Hiroshi | yes, "no hunting" |
| The Warm-up's restored pick in view | Jun | yes, twice: Q3 with pick and 90% kept, Q7 with the pick and the % unset. His best moment |
| The unlocking miss keeps the meaning line | Noor | yes: "one that doesn't isn't a mistake" right after the miss. Her best moment |
| A button at the end of the Warm-up result | Destiny | yes, she used it |
| The answer key stacked at large text | Destiny | **can't be seen on web:** the narrow viewport leaves `fontScale` at 1, and stacking needs more than 1. iPhone only |
| "To reach … N more scored answers" | Seun | yes (and its spoken label after `1a5501f`) |
| "First badge … Tracker, or higher" | Seun | read and understood |

## Comprehension

**Right in every run that was asked:**
- what 70% means (Destiny: "7 out of 10… 3 out of 10 aren't supposed to
  happen");
- how the score is computed (Wen and Noor, by hand);
- a grey dot has under 10 answers (Sam);
- the correction window (Noor);
- what a badge needs (Seun).

**Wrong or unsure:**
- Seun read the 70 / 85 / 90 marks beside his overall 88 as "past Sharp"
  (finding 1).
- Sam guessed the card's marks with no key (finding 4).

## What held up

- **Answering:**
  - two taps;
  - "Your rating moved from 88 to 89", the best moment for Sam and Seun;
  - "All caught up. 3 answered. 1 happened. You expected 1 or 2."
- **Log's track record while setting a number:** it moved Hiroshi from 90
  to 80 and helped Sam pick 60.
- **"You expected about 7 right and got 7: just what you said."** Destiny's
  best line in the app.
- **How scoring works:** Wen reproduced the score, both worked examples, the
  Warm-up's verdict and its band by hand. Noor checked the arithmetic.
- **Labels for a screen reader:** Kofi called them "better than most apps I
  audit".

## Ranked findings

### P1

1. **What the number means isn't on the screen where people look**
   (runs 1, 3, 4, 7).
   - Today draws the 70 / 85 / 90 badge marks beside the overall rating with
     no words. They are a category's bars, but the overall number sits
     against them, so an 88 reads as "past Sharp" (Seun) or "a pass mark I'm
     about to drop under" (Noor).
   - Tapping the 88, the bar or Insights' "Getting started" pill does
     nothing: three dead taps for Seun, one for Noor.
   - "Is 86 good?" is answered nowhere plainly (Noor).
   - SEQ 3–4; four of eight runs.
   - **Needs the owner:** label the marks, drop them on Today, or make the
     rating open How scoring works.
2. **The Warm-up result buries its plainest line** (runs 2, 5, 6).
   - It leads with "On these ten, no clear lean". The line that explains
     it, "You expected about 7 right and got 7", comes three screens down,
     under the chart, at large text.
   - A screen reader hears both buttons before the explanation (Kofi).
   - Jun, arriving from a TikTok, heard "no clear lean" as "nothing".
   - **Needs the owner** (B2): move the expected-and-got line up under the
     counts, before the buttons.
3. **Colour carries meaning alone in the text share** (run 1).
   - ⬜⬜🟩🟩🟧 to a red-green colour-blind person is two white squares and
     three alike. His worst moment.
   - **Needs the owner** (D47 chose the squares).
4. **The card's strip and badge icons have no key** (run 1). Sam decoded the
   ▼ only because the chart had already told him. SEQ 3. **Needs the owner.**

### P2

5. **Insights gives mixed verdicts about the same answers** (runs 3, 4).
   - "Forecaster in health", "Furthest off: Health" and "You're
     overconfident at 80–100%", all about the same 22 walks (Hiroshi's worst
     moment).
   - The Brier line on unlock day reads "a parrot saying 65% would beat me"
     (Noor's worst moment, severity 3).
   - **Needs the owner** (B5).
6. **Spread thin, no badge, and no word why** (run 7).
   - 73 answers over 13 categories, all "Getting started", and Today shows
     no badge line at all.
   - Nothing says which category is closest, or that spreading is the
     reason. SUS 60.
   - **Needs the owner** (B3, B4).
7. **The give-or-take's method isn't stated** (run 8).
   - It feeds badges ("at its low end") and the card, but How scoring works
     doesn't say whether it resamples the answers or simulates outcomes.
     `CLAUDE.md` says it's a bootstrap.
   - **No decision needed:** one sentence naming the bootstrap.
   - **Needs the owner:** whether to note that several bands are tested at
     once (80% each), and that the score sits below 100 at small counts for
     a perfectly calibrated person.
8. **"Logged again" across categories** (run 7; round 12 #17). Words matched
   in another category, so Seun thought the app had copied his bet.
   **Fixed** (`1a5501f`).
9. **The recap card's spoken label dropped a final "s"** (run 8): "20 more
   scored answer." The regex `[.s]` should have been `[.\s]`. **Fixed**
   (`1a5501f`).
10. **The weekly recap is found only by luck under "Share my card"** (run 7;
    round 16 run 3). Two rounds running. **Needs the owner** (B7).
11. **Thumb reach** (run 8): the main "+" is 32 pt in the top-right corner,
    and every Close is top-right. Each is a regrip one-handed. iOS
    swipe-to-dismiss may cover the Closes. **Needs the owner.**
12. **Batch logging** (run 5): every save returns to Today, so four
    predictions took three extra trips. **Needs the owner** ("save and log
    another").
13. **The form jumps under the thumb** (runs 5, 8; round 12 #9):
    - Log's starter ideas vanish on the first letter, moving the chips up
      about 300 px.
    - The Warm-up's intro goes after question 1.

    **Needs the owner.**

### P3

14. **The slider's track tap differs between screens:** the middle is 75% in
    the Warm-up (a 50–100 scale) and 50% on Log (runs 5, 6, 8). D49 decided
    each scale. It isn't discoverable either: Wen spent nine +5 taps first.
15. **Small ones:**
    - A prediction's details don't say when it will ask (Destiny; 7 PM is in
      You).
    - Three due the same day read as a tie (Jun).
    - "Boldest call that landed" names the surest call (Seun; round 13 #21).
    - The reword note says "a new prediction from today" for one already
      made today (Hiroshi).
    - Edit's "Save changes" is below the fold at 568 (Hiroshi).
    - Give-away Warm-up items such as Venus against Enceladus (Wen).
    - The thesis statistic is unsourced (Wen).
    - No study or Home category (Jun, Noor).
    - "Johannesburg" runs past its answer button at 195 (Destiny).
    - The Warm-up chart is crowded at 195 (Destiny).
16. **The Plus sample says the 60–80% range "holds your rating up"** (Noor),
    which implies something drags it down without saying what.

### Web-only, so not ranked

- **Kofi's focus findings:** focus drops to the page on every screen change;
  hidden tabs stay focusable; the first Tab after Next lands on Skip; Space
  and arrow keys don't work on radios; Escape doesn't close sheets; ±5 isn't
  announced; heading levels. These are profile §18's web focus handling. He
  lists them for a native VoiceOver retest.
- **Real on iOS too, for the device check:** the Warm-up result's reading
  order (finding 2).
- **Sharing:** "Share as text" shows nothing in a browser.
- **The share link has no campaign token:** by design, until a provider
  token is set (`src/share/link.ts`, owner, App Store Connect).
- The answer key at 195 with `fontScale` 1, and the "Insigh…" tab label at
  195.
