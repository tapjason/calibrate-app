# Blind playtest, 2026-11-12 (d): appeal, staying power

Raw findings, 2026-11-12. The third appeal round of the day: five people from
round 13 who said "ask me again later", brought back on the playtest profile
that puts them there, plus a wildcard on the longest record. Same build
(`builder/playtest-setup`, app unchanged since `6e6e28d`), same kit. Plan and
cast: `round15-plan-2026-11-12.md`. These are what the testers saw, checked
against the code; they are not decisions. **AI agents playing people:** the
appeal answers show where groups part ways, never a market number. Where they
differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

## Method

Six runs, each on a §9 profile after a full wipe (device and stored
settings): Bernard on `day1` (his first answer due tonight), Dale on
`long-time`, Ruth on `threshold` (the 20th answer due), Héctor on `habit`,
Ji-woo on `first-week`, and the wildcard Earl on `years` (1,000 days). Each
brief carried what the person said in round 13. Deviations from the appeal
cast rules, on purpose: no first-five-minutes runs, nobody under 26, no L4.

**Profile artifacts.** `years` cycles seven confidences (15–95%) through the
same five titles, so Earl's walk record reads "happened 115 of 201" across
every confidence, beside "55 of 59" for the 80–100% range: the two lines
measure different things, but no real person logs the same walk at 15%.
`day1`'s titles are the starter ideas (Bernard tapped the first idea offered).

## The persona table

| # | Persona (stage) | Round 13 | Now | Verdict | Disappointed |
|---|---|---|---|---|---|
| 1 | Bernard (first answer due) | 5, unsure, five-second maybe | **6**, leaning keep, five-second yes | "the gate bit and the Celtic bit are fine… but the graphs and that wee essay under them are no for me, and twenty answers at two a week is Easter" | not |
| 2 | Dale (five months) | 6, unsure | **7, keep** | "it finally tells my weather calls from my market calls, and it doesn't lie about either one" | somewhat |
| 3 | Ruth (20th answer) | 6, unsure | **6**, unsure | "nearly everything it says after a miss is kind and factual, but I still can't switch off the streak or the badge ladder" | somewhat |
| 4 | Héctor (three weeks of walks) | 7, keep | **7, keep** | "it grades my confidence, not my walking, and it makes me rebuild the same 90% with six or eight taps every night" | somewhat |
| 5 | Ji-woo (six days) | 7, unsure | **6**, leaning keep | "very honest, very careful writing, but after six days it still tells me nothing about me, and the chart with my first dots looks broken" | somewhat |
| 6 | Earl (1,000 days, wildcard) | — | **7, keep** | "I'm not walking away from 1,002 days, but after three years it ought to tell me if I got any better without asking for thirty bucks" | very |

Median 6.5. Three keep, three unsure. **What moved them:** Bernard up a point
on the first answer itself ("A 70% call should come true about 7 times in 10,
so one answer can't say much; 20 can."); Dale up a point the moment renaming
gave him Weather against Markets; Ji-woo down a point because the first dots
she came back for looked broken and nothing else had arrived.

## Usability

| Task | 1 Bernard | 2 Dale | 3 Ruth | 4 Héctor | 5 Ji-woo | 6 Earl |
|---|---|---|---|---|---|---|
| 1 | done 6 | done 7 | done 7 | done 7 | done 6 | done 6 |
| 2 | wrong turn 3 | wrong turn 5 | done 4 | done 5 | done 5 (2 for what she found) | wrong turns 3 |
| 3 | done 5 | done 6 | wrong turn 4 | done 6 | done 5 | **gave up** 2 |
| 4 | done-ish 3 | done 6 | **gave up** 2 | done 4 | done 3 as work | done 4 |
| 5 | done 4 | done 6 | decided | done 5 | done 6 | done 5 |

**Answering is the best-made thing in the app**: every run's first task was
6 or 7. The two give-ups are the same kind of ask, unanswerable for free:
Ruth's "can a client switch off the streak?" (no switch exists) and Earl's
"has three years made me better?" (Plus Trends only). The lows under 4:
"what does this mean for me now" for Bernard (the Insights graph), something
to tell his son, something celebrating 1,000 days, the week recap as design
work.

## Comprehension

Eighteen answers, all right. Bernard explained his first answer in the app's
own words; Héctor checked the rating, the Brier score and its baseline by
hand and they matched (84.7 → 85, 0.217 against 0.196). The two
misunderstandings were in reading the screen, not the rule: Ruth and Ji-woo
read the chart's "Overconfident" field as a verdict on grey, too-few dots
(finding 4).

## Appeal

| # | Low (where) | High (where) | Ease | Appeal | Five words | Post | Pay |
|---|---|---|---|---|---|---|---|
| 1 Bernard | −2 (Insights after one answer) | +2 (first answer; practice) | 4.0 | 4.25 | Honest, Respectful, Too technical, Calm, Simple | tell his son on the phone | nothing |
| 2 Dale | −1 (Brier; the card before trimming) | +2 (the track record on Log) | 5.25 | 4.75 | Honest, Useful, Simple, Respectful, Trustworthy | text Gary the trimmed card | ~$10 a year |
| 3 Ruth | −2 (no streak switch) | +2 (her miss answered) | 5.0 | 5.0 | Honest, Calm, Respectful, Useful, Too technical | no | A$20–30 once, for a "therapy mode" |
| 4 Héctor | 0 (the miss; the card) | +2 (Insights) | 4.25 | 4.75 | Honest, Clever, Respectful, Too technical, Useful | maybe the week recap to his daughter | lifetime only for a habit mode |
| 5 Ji-woo | −1 (first answer; "6 weeks"; first dots; recap) | +2 (practice) | 5.25 | 4.25 | Honest, Calm, Respectful, Clear, Too technical | no | ₩20k a year once there's a score |
| 6 Earl | −1 (115 of 201; "nothing is lost"; paywall) | +2 (first screen; Log it again) | 5.0 | 4.25 | Honest, Useful, Calm, Respectful, Too technical | the year recap on Facebook | ~$10 a year for Trends |

**Words:** Honest 6 of 6 (22 of 22 across the three appeal rounds),
Respectful 6, Too technical 5, Calm 4, Useful 4. Boring–exciting 3 in all six.
**Split:** the four with months or years of record (Dale, Ruth, Héctor,
Earl) rated it highest on interesting (5–6); the two in the first week
(Bernard, Ji-woo) still wait for anything about themselves.

## What held up

Answering (every run 6–7: "three taps, that's the job done"); the
after-answer lines ("one answer can't say much; 20 can", "8 of 12 have
happened. That's 67%, against the 70% you said"; Ruth: "the CBT behavioural
experiment in one line"); misses recorded flatly, Yes and No the same; the
track record and title match on Log (moved Dale 80→75 and Héctor 90→80);
"Log it again" for a routine (Earl: "my whole evening in one tap"); renaming
categories without losing anything (Dale); the range tile opening its
predictions in History; History keeping its place (Earl); speed with 1,000
answers (Insights in about 80 ms, History paging smoothly at 320 wide); the
honest paywall.

## Ranked findings

Earlier rounds' numbers where a finding repeats (R12 = `playtest-2026-11-12.md`,
R13 = `…12b`, R14 = `…12c`).

### P1

1. **A renamed category keeps its old name in "Furthest off"** (run 2): after
   Finance → Markets, Insights' rows say Markets but the line above still
   says "Furthest off: Finance." `furthestOffLine` reads the name through
   `categoryTitle` (`patternCopy.ts:20`), a one-off read of the store, and
   `CalibrationView` (`:289`) doesn't subscribe to the category defs, so a
   rename doesn't redraw it. Dale: "the one thing that made me doubt my five
   months were safe." **No decision needed:** subscribe to the defs (and
   check every other `categoryTitle` / `categoryLabel` call in a component
   that doesn't).
2. **The empty middle** (runs 1, 5; R13 #5, R14 #9). From the first answer to
   about week six the app says "Too few to read yet" in four places and
   "about 6 weeks (around Dec 22)". Ji-woo: "six days in, nothing about me";
   Bernard: "twenty answers at two a week is Easter". **Needs the owner**:
   what 3–19 scored answers can honestly show (plain counts by category, the
   streak of answered calls, a first "of your 80% calls, 2 of 2 didn't" in
   counts only).
3. **The streak and daily goal can't be switched off** (run 3, given up;
   R13 #8), and the streak row looks tappable and does nothing (runs 3, 6).
   Ruth's deal-breaker for recommending it to anxious clients; she'd pay
   A$20–30 once for a mode without the streak, goal and badge ladder.
   **Needs the owner** (D17).
4. **The chart at tiny counts reads as a verdict** (runs 1, 3, 5). After one
   answer Bernard's grey dot sat in a field printed "Underconfident" (−2,
   almost left); Ruth's 90% dot in "Overconfident"; Ji-woo's first two dots
   joined by a steep line, with "n=2" colliding with "Overconfident" ("Ove
   n=2 confident"), "n=1" over its grey bar and the 0% dot clipped by the
   axis. D58 greys the dots, but the field labels and the connecting line
   still shout. **No decision needed** for the overlaps and the clipped dot
   (with R12 #19); **needs the owner** for hiding the field labels and the
   line until a range has 10.
5. **"Did I get better?" has no free answer** (run 6, given up). Free shows
   "since last week" and this year; three years of change is Plus Trends
   only, with no preview. Earl would pay about $10 a year for exactly that.
   **Needs the owner** (D37, GROWTH §4: a one-line then-and-now, or a Trends
   sample on the Plus card).

### P2

6. **A daily habit costs 6–8 taps a night** (runs 4, 6): "Log it again" never
   carries the confidence (decided, against anchoring), so 90% is eight "+5"
   from the resting 50. Héctor: "exactly the tedium that killed stickK."
   **Needs the owner** (one tap for "same as last time" on a repeated title,
   or start the thumb at the record's rate).
7. **A habit isn't shown in its own terms** (run 4): nothing says "walked 17
   of 22 days"; "Forecaster in health" reads as praise for a man skipping a
   quarter of his prescribed walks, right above "You're overconfident at
   80–100%" on the same data. **Needs the owner.**
8. **One reminder time for everything** (run 4): his 7 PM rehab meeting is
   asked about at 7 PM, before he can know. **Needs the owner** (D38).
9. **The card and Today lead with the top tier, not the category that
   matters** (run 2: "Sharp in health" for a farmer of weather and markets;
   three unticks to change it); "Oracle in personal and 3 more" when all four
   are Oracle (run 6). **Needs the owner** (D27, D54).
10. **Renaming is found too late** (run 2: five months of translating Work into
    weather); the icon grid has no weather or farm picture; Rename sits
    against the switch (R12 #11). **Needs the owner** (R13 #6, R14 #10).
11. **The week recap as a share image** (runs 3, 4, 5, 6): in-app nudges
    printed on it ("Log something you think won't happen", "Tracker in
    health: 19 to go"); seven type styles in eleven lines; "Boldest call that
    landed" and "Surest thing that didn't" both 90% for a one-habit user; the
    Health badge earned that week left off; small type at 320. Earl would post
    the year recap only because it carries his streak. **Needs the owner.**
12. **No moment for 1,000 days** (run 6; milestones are 7, 30, 100, 365, then
    yearly), the streak below the fold on an SE, and not on the card. **Needs
    the owner.**
13. **The 20th answer doesn't name what it earned** (run 3): Resolve shows a
    bare "86" ("out of 100" missing) and "From here the number means
    something"; the Forecaster badge appears silently on Today. **Needs the
    owner** (R13 #11).
14. **Miss details read as a permanent mark** (run 3): "This one is part of
    your record now… so the record can't be rewritten later." Beside "isn't
    scored" it also reads as a contradiction (run 5). **Needs the owner**
    (copy).
15. **Save from Insights gives no sign** (runs 1, 5; R14 #20, third round).
    **No decision needed.**
16. **An open prediction doesn't say when it will ask** (run 1: "We'll ask you
    Wednesday at 7 PM"); his one fear was forgetting. **Needs the owner**
    (copy on the details).

### P3

17. Two record lines on Log saying the same thing (run 4: the title match and
    the range line) or seeming to disagree (run 6, partly the profile
    artifact). History's "6 answered, 4 happened, 1 not scored" beside
    Insights' "3 of 5" for the same range (run 3). "Log it again, due
    Saturday" for a one-off release (run 5; R13 #7). "2 on their way" read as
    answered (run 5). History has no search or jump to a month (run 6). The
    share tabs wrap at 375 with large text (run 1). "D.C.." again (runs 1, 5).
    "judgment" for an Australian (run 3). A day with only a "Can't tell"
    doesn't keep the streak (`streak.ts:94`, by design; Earl's fear).

### Web-only, so not ranked

Dollar prices, the typed date field, "Share as text" showing nothing, the
development-only row on You.
