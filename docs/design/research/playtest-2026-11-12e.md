# Blind playtest, 2026-11-12 (e): did the step 171 fixes land

Raw findings, 2026-11-12. The sixteenth round, and a check on step 171 (the
no-decision fixes A1–A10 of `aggregate-2026-11-12.md`): eight people who ran
into those problems in rounds 12–15, brought back to the same start, screen
and stand-ins. Plan and cast: `round16-plan-2026-11-12.md`. These are what the
testers saw, checked against the code; they are not decisions. **AI agents
playing people:** the scores and feelings show where groups part ways, never
a market number. Where they differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and
`UI_ROADMAP.md` win.

## Method

- **Build:** `builder/playtest-fixes`. Two fixes went in during the round,
  each before the runs it affects:
  - **After the health check (`62ab91a`):** Log's Save had stayed pinned at
    large text, because only the button was measured. Now the whole bar is
    measured, and once it has left the pin it stays in the scroll. The
    chart's region labels also got 2 px of air.
  - **After run 2 (`7b3d64c`):** Linda still saw
    "Washington, D.C.." in practice. The first fix had covered only the
    spoken row.
- **Health check:** `web-playtester`, before the blind runs. Everything
  passed except Log's pinned Save (fixed above). It also found:
  - "D.C." is never among the Warm-up's ten questions; it comes from daily
    practice.
  - `years` shows "1,000 answered" and "1" open in History.
  - `years` has no reflections, so the clamp was checked on `stress`.
- **The cast:** eight returners, no wildcard. Each brief told the person's
  last run in their own words and never named a screen or a fix.
- **Block B, shortened:** the mood line, Smile and Almost-left notes, a score
  out of 10, the disappointment question, and "compared with last time".
- **Before each run:** OPFS and localStorage cleared, then the profile loaded.
- **Stand-ins:**
  - Linda: a 195 × 422 viewport for 390 × 844 at double text size.
  - Gloria: CSS zoom 1.5 on every page.
  - Mei: acted only on controls whose accessible name contains the visible
    words.

## The persona table

| # | Persona | Stage, screen | Verdict | Score (last) | Lose it |
|---|---|---|---|---|---|
| 1 | Amara, tailor, Nairobi, L3 | fresh install, 320 × 568 light | keep for now: "it kept my answer this time and it told me why Save was grey" | **7** (6) | somewhat |
| 2 | Linda, retired teacher, Dayton, L2 | fresh install, 195 × 422 light | keep: "this time nothing sat on top of what I was trying to read" | **7** (6) | somewhat |
| 3 | Ramón, taquería owner, Phoenix, L3 | fresh install, 440 × 956 light | keep for now: "it talks about Work now" | **7** (6) | somewhat |
| 4 | Dale, farmer, Iowa, L2 | five months, 440 × 956 light | keep: "it fixed the one thing I griped about" | **8** (7) | somewhat |
| 5 | Ruth, CBT therapist, Melbourne, L3 | 19 of 20, 402 × 874 light | unsure: for herself yes, a fragile client only with her | **7** (6) | somewhat |
| 6 | Ji-woo, product designer, Seoul, L5 | six days, 402 × 874 dark | keep: "the writing is the best part" | **7** (6) | somewhat |
| 7 | Mei, architect, Singapore, L4, Voice Control | five months, 402 × 874 light | keep: "for the first time in five months I logged a prediction by voice alone" | **9** (7) | **very** |
| 8 | Gloria, retired seamstress, San Antonio, L2 | three years, 375 × 812 dark, zoom 1.5 | keep: "my note looks neat now, and it says I guess well" | **8** (6) | **very** |

- **Scores:** every run went up, median 7 (6 last time). Seven of eight would
  keep it; Ruth would keep it for herself. All eight say "better".
- **Who gained most:** the two the app had failed outright, Mei (+2: she
  couldn't set a confidence) and Gloria (+2: three things she couldn't
  read).
- **Nobody gave up a task except one:** Ruth again found no switch for the
  streak (B5).

## Did each fix land

| Fix | Who checked it | Landed? | What they said or did |
|---|---|---|---|
| A1 stale name after a rename | Dale | **yes** | "Furthest off: Markets" on the first look; his name was even in Log's track record |
| A2 "D.C.." | Amara, Linda | **after a mid-round fix** | Linda saw it in practice's key; fixed after run 2 (the visible rows) |
| A3 recap's tie | Ramón | **yes** | "Tracker in work: 20 to go", not Finance |
| A4 room under the fixed bars | Amara, Linda, Ramón | **mostly** | Question 1 scrolled the slider into view (Amara). At double text, Next / Skip end the scroll and nothing covers the question (Linda). The due line is visible (Ramón, Linda). New: see findings 3 and 4 |
| A5 a sign after a save | Ruth, Ji-woo, Dale | **yes, but easy to miss** | Ruth and Dale saw "Saved, due …" and kept their place. Ji-woo missed it the first time (finding 5) |
| A6 the Warm-up keeps the pick | Amara | **yes** | Silver and 60% were still there after the interruption (but see finding 4) |
| A7 why "not scored" | Ji-woo | **yes** | "a call made and settled in one day says little", in her own words |
| A8 the chart at tiny counts | Ruth, Ji-woo | **yes** | n=1 sits whole beside its bar; nothing printed on "Overconfident"; nothing clipped |
| A10 Voice Control names | Mei | **yes** | "tap plus 5" and "tap Sat" work; Save's name still differs (D55) |
| A10 gaps | Amara, Mei, Dale | **yes, tight** | 8 px everywhere. Amara still worries about Skip under "See my result"; Dale's Rename and switch are close for thumbs |
| A10 "1,001", reflection clamp, × bar | Gloria, Ji-woo | **yes** | "1,001 answered", three lines and "…", and a solid bar behind the × on details |

## Comprehension

- **Correct in all eight runs:** what the n= labels count (Ruth, Ji-woo); why
  a same-day answer isn't scored (Ji-woo, Ramón); 20 scored answers before a
  score (Ramón, Amara, Linda); what a rename does to old calls (Dale); that a
  hidden category keeps its record (Dale).
- **Half right:**
  - Amara on when she could have a card like her friend's: "probably 20 in
    that one area, but the app didn't tell me that clearly".
  - Ruth knows a miss isn't a mistake, but from How scoring works, not from
    the miss screen.

## What held up

- **The writing:**
  - "One that doesn't isn't a mistake, and one that does isn't proof."
  - "A call made and settled in one day says little."
  - "Answered once before: it didn't happen."
  - "5 or 6 times in 10"
  - "Save, due Sunday"

  Ji-woo would steal the habit of saying what to do right after a rule.
- **Log's track record while setting a number:** Ruth dropped from 80 to 75;
  Mei thought twice; Dale saw it under his own Weather name.
- **"Your rating moved from 87 to 88" after a No** (Mei): honesty, not being
  right.
- **Daily practice is Linda's reason to come back:** her mood there was +3.
- **The save hint** ("To save, add a category and a confidence") rescued
  Amara twice.

## Ranked findings

### P1

1. **"How scoring works" from Today's identity line opens with its × out of
   reach.**
   - Seen in run 8, at large text: it opens at Badges with the close about
     six screens up, and there's no tab bar. Severity 3; Gloria almost left.
     Ji-woo hit the same scroll-away (run 6, 402).
   - Cause: `app/scoring.tsx` keeps the × inside `ScoringExplainer`, in the
     scroll, not on the sticky `SheetCloseBar` the other sheets got.
   - **No decision needed:** use the sticky bar.
2. **The miss that unlocks the score gets neither D50 line** (run 5).
   - What she saw: the ⊗ mark and "Recorded: it didn't happen", then a big
     "86" with no "out of 100" and no word that a miss isn't a mistake.
     Severity 3, from the persona who'd recommend the app to anxious people.
   - Cause (`ResolvePrompt.answerNote`): `ratingBefore` was null (still
     provisional) and the rating after it isn't, so neither the meaning line
     nor the move line shows. The unlock milestone stands alone.
   - **No decision needed** for keeping the meaning line on that answer
     (it's answered while provisional, as D50 intends). **Needs the owner**
     for the ⊗ mark and "out of 100" on the milestone.
3. **Log at 320: the slider hides under the pinned Save after picking a
   category** (run 1).
   - Only "—% not set yet" shows; Amara had to know to swipe. Severity 2.
   - The Warm-up scrolls its slider into view after a pick (`WarmupQuiz`
     `pick`); Log doesn't.
   - **No decision needed:** the same scroll-into-view on Log after a
     category is picked.
4. **The Warm-up's restored pick sits under the bar** (run 1).
   - After the reload, the kept 60% was hidden under Next / Skip, so Amara
     first thought it was lost again. Severity 2.
   - **No decision needed:** scroll the confidence into view when a question
     opens with a restored pick.

### P2

5. **The save sign is easy to miss** (run 6; Ruth noticed it covering her
   table briefly).
   - It's a text bar above the tab bar for 3.5 s while the eyes are on the
     list's top. On History the new card landed third in Open with no
     highlight. Severity 2.
   - **Needs the owner:** longer, more central, or History scrolling to and
     marking the new card as Today does (D48).
6. **No streak or goal switch** (run 5, again; B5). Severity 3, given up.
   **Needs the owner.**
7. **The chart draws a solid line through grey dots** (runs 5, 6).
   - Two "too few to read" dots joined by a steep line read as a trend. The
     caption explains everything but the line. Severity 2.
   - **Needs the owner** (B5: hide the line and the field labels below 10).
8. **Insights for a long record leads with the Brier and badge-bar lines**
   (run 8; the Brier line also in runs 4 and 5).
   - Gloria waded through numbers before the plain "You're well calibrated".
   - Ruth heard "Saying 65% every time would score 0.23" as a put-down.
     Severity 2.
   - **Needs the owner** (B5).
9. **The badge can jump from "Getting started" straight to Forecaster**
   (run 5), though Insights said "A category earns its first badge, Tracker,
   at 20 scored answers there" (`CalibrationView.tsx:300`).
   - Forecaster needs 20 too, with the score's low end over 70, so the line
     is wrong for anyone whose score clears it.
   - Today's 70 / 85 / 90 ticks have no words (runs 5, 8).
   - **No decision needed** for making the line true ("its first badge at 20
     scored answers"); **needs the owner** for labels on the ticks.
10. **The weekly recap is hard to find** (run 3).
    - It sits under "Share my card" (Insights, You), with nothing on Insights
      or Today saying "This week". Ramón almost left on Insights.
    - "Weekly digest" (You) and "This week" read as two summaries.
    - Severity 2. **Needs the owner** (B7).
11. **"Tracker in work: 20 to go" doesn't say 20 of what** (run 3). With two
    Work guesses logged, it read as if they hadn't been counted.
    **No decision needed:** "20 answers to go", as Insights' rows say.
12. **The answer keys at large text squeeze the explanation into a narrow
    column, one word a line** (run 2). Warm-up and practice. Severity 2.
    **No decision needed:** stack the tick and percent above at large sizes.
13. **The share card and chart labels don't grow with the text size**
    (run 2): Linda couldn't read her own card at double size. Severity 2.
    **Needs the owner** (a larger or plain-text version; the card's design
    is fixed by D42).
14. **No way forward at the bottom of the Warm-up's result** (run 2): after
    the ten answers, Linda scrolled back up to find "Make a real prediction".
    Almost left. **No decision needed:** the button again at the end.
15. **A reflection is small italic grey, the hardest text on screen at night**
    (run 8). Severity 2. **Needs the owner** (type style).

### P3

16. **Statistics words:** "no clear lean", the grey-bars caption, "scored",
    "Tracker", "rest day", "Goal: 1 of 3" (runs 1–3, 5, 8). B2 and B5.
17. **No Sat / Sun date chips** (run 3: weekend guesses need Pick a date and
    typing), and 80% takes six or seven taps of +5 (runs 2, 3). Needs the
    owner.
18. **Office starter ideas, no Family category, a chemistry first question**
    (runs 1–3). B2 and B4.
19. **"Trends: your 4 months on file" after five months** (run 4; round 12
    #17 too). Check the month count. No decision needed.
20. **"Sharp in health. Tracker in Markets."**: mixed capitals in the
    identity line next to a renamed category (run 4). No decision needed:
    one case rule in the line.
21. **"Log it again, due tomorrow" on a weekly Sunday call** (run 8): D56
    carries the lead time, at least a day. Needs the owner.
22. **Small ones:**
    - "19:00" in the time box under "7:00 PM" (runs 1, 3, 7; round 8 #7).
    - A range tap on Insights switches to the History tab unannounced (runs
      6, 7).
    - The range chip's name doesn't start with its visible words (run 7).
    - History's category chips run off the edge (run 7; round 12 #18,
      owner).
    - "n=286 n=286" crowd the top dots at 1.5 zoom (run 8).
    - The y "0" and x "0%" crowd at the origin (run 6).
    - A straight and a curly apostrophe in Answer it now's warning (run 6).
    - Only "Remove note", no way to edit one (run 8).
    - "Hidden" shown only by grey (run 4; round 12 #11, owner).

### Web-only, so not ranked

- The typed date field (the iPhone has a wheel).
- The web switch's size and thumb colour (Dale).
- The bright scrollbar in dark mode (Gloria).
- Save's spoken name versus Voice Control on a real iPhone (Mei: judged only
  by accessible names).
- The details sheets not scrolling at 874, so Ji-woo couldn't test the ×
  over scrolled text there. Gloria could, at 1.5 zoom, and it held.

### Profile artefacts, not findings

- `long-time` has office titles under Dale's Weather, and 20 Social calls he
  says he never makes (run 4).
- The `first-week` brief named a Wednesday dinner the profile doesn't have
  (run 6).
