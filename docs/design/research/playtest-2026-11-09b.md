# Blind playtest, 2026-11-09 (b): a wider cast

Raw findings, 2026-11-09. Seven blind runs on the web build, all by personas
never cast before, after the cast was widened (commit e8de19d). Nothing in
the app changed since `playtest-2026-11-09.md` (step 161 is the build). These
are what the testers saw, checked against the code; they are not decisions.
Where they differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

## Method

Each blind run was a fresh agent with only the Playwright browser tools, no
repo and no docs, given a persona, goals (never button or screen names), an
interruption, three end-of-run questions and the fixed report format
(thinking aloud with "expected / got", ease 1–7 per task, severity 0–4 per
issue), one after another in one browser. Before them, `web-playtester`
checked titles in Japanese, Ge'ez (Tigrinya) and Spanish at 320 and 440, the
Warm-up under Reduce Motion, answer / change / Can't tell / answer later, and
Insights, the card and both recaps on demo data: all six checks passed, with
no console errors. Screenshots are in `.playwright-mcp/playtest-2026-11-09b/`
(gitignored).

**The cast.** Chosen by §10's rule as widened in e8de19d: nobody from the last
two rounds (Dana, Walt, Rosa, Ines, Kofi, Priya; Grace, Mateus, Leah, Sam,
Jun, Ingrid), only personas never cast before; one under 18 and two more
under 26 or over 60; a fresh install, a first week, a daily habit, a
long-time and a returning user; three non-native readers and one dyslexic
reader; one who thinks in "7 in 10"; seven different parts of life; one whose
misses hurt; one old small phone at 320; one edge of the audience (a
teenager); no two runs on the same screen and appearance.

| # | Persona | Age | Language | Locale | Numeracy | Access need | Tech | Mindset | Stage | Predicts | Stakes | Device | Screen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Lucía, school student, Mexico City | 13–17 | fluent second (Spanish first) | 24-hour, D/M | percentages | none | everyday | curious, impatient | first five minutes | exams | self-improvement | brother's old phone | 390 × 844 light |
| 2 | Hiroshi, retired engineer, Osaka | 61+ | careful second (Japanese titles) | other script | expert | Reduce Motion | everyday | sceptical, exact | first week (day 3) | health | self-improvement | old small phone | 320 × 568 light |
| 3 | Destiny, retail worker, Columbus | 18–25 | plain-language reader | US | "7 in 10" | none | everyday (phone only) | blunt | first five minutes | money | self-improvement | prepaid data | 375 × 812 dark |
| 4 | Marcus, HVAC technician, eight months sober | 26–40 | native | US | percentages | none | everyday | wary of judgement | daily habit (three weeks) | recovery and habits | a miss that hurts | new phone | 402 × 874 light |
| 5 | Ravi, software tester, autistic | 26–40 | native (UK) | UK | at ease | literal reading | expert | precise | long-time (five months) | work | curiosity | new phone | 440 × 956 dark |
| 6 | Rahel, Eritrean in Frankfurt | 26–40 | careful third (Tigrinya, German) | 24-hour, D/M | percentages | none | everyday | privacy-minded, careful | first week (day 4) | family | a miss that hurts | shared phone | 375 × 812 light |
| 7 | Conceição, retired biostatistician, Porto (wildcard) | 61+ | dyslexic reader (Portuguese first) | 24-hour, D/M | statistics expert | attention (ADHD) | expert | anxious | back after two months | sport | self-improvement | capped data | 402 × 874 dark |

**The wildcard's draw:** 61+, dyslexic reader, Spanish or Portuguese first,
statistics expert, Reduce Motion, expert, anxious, back after a gap,
interrupted mid-task, health, self-improvement, slow or capped data,
402 × 874, dark. Reduce Motion and health duplicated Hiroshi, so the access
need was drawn again (attention, ADHD) and the part of life set to the one no
other run had (sport). Capped data can't be set on a build that keeps
everything on the phone; it stayed as the persona's context. She is a new
persona, added to §10 with this round.

**Start states**, prepared by the main session between runs, each from a
cleared install: runs 1 and 3 fresh; run 2 the Warm-up (through its store),
then three predictions over days −3 to −1, two titled in Japanese
(`.playwright-mcp/seed-hiroshi.js`); run 4 the Warm-up, then 28 predictions
over 21 days with a 21-day streak and Personal renamed "Recovery"
(`seed-recovery.js`); run 5 the Warm-up, then `/dev/seed` demo data; run 6
the Warm-up, then four vague predictions, one in German (`seed-shared.js`);
run 7 the Warm-up, then 78 predictions over days −130 to −58 with ten left
open and Personal renamed "Futebol" (`seed-sport-gap.js`).
`.playwright-mcp/warmup-done.js` finishes the Warm-up for a seeded state.

**Stand-ins.** Reduce Motion and dark mode through `emulateMedia`; "the app
was closed" as a page reload (runs 1, 3, 4, 7); "the back swipe" as browser
back (runs 2, 5); "close it, your sister wants the phone" as Log's × (run 6).

**Web-only, so not ranked below:** Log's × and the back swipe dropping a
typed title without asking (runs 2 and 6; iOS asks first,
`useLogDraftGuard`: whether to keep a draft is finding 1); the date as a typed
ISO box; "Share my card" unavailable; the slider not taking arrow keys; the
+5 "jump" at 320 in run 2, which is Playwright scrolling the button into view
before its click (a DOM click moves nothing; checked by the main session);
"Privacy policy" opening GitHub Pages in a new tab (it 404s because Pages is
off, an owner step in the plan, not app code).

| # | Persona | Verdict | Score |
|---|---|---|---|
| 1 | Lucía | Keep, for now: "La quiz estuvo padre and it didn't make me pay for anything, but 20 answers before it tells me anything real is sooo far, I'll see what it says on Friday." | 7/10 |
| 2 | Hiroshi | Keep: "It shows its method like a proper technical report, so I trust it, but it threw away my Japanese text without asking, and it will not tell me on what date I will have a score." | 7/10 |
| 3 | Destiny | Unsure: "The quiz was kinda fun and I set up the money thing quick, but nothing tells me anything about my money for 11 days, and 'no clear lean' told me nothing at all." | 5/10 |
| 4 | Marcus | Keep: "It didn't kick me when I was down, but it couldn't answer the one thing I asked about my recovery, and it wanted to put 'Recovery' on a card for the internet." | 7/10 |
| 5 | Ravi | Keep: "The numbers agree with each other everywhere I checked, which is rare, but the app uses 'resolved' for two different things and only tells me the change-answer rule once it's too late to use it." | 7/10 |
| 6 | Rahel | Unsure: "It helps me see if my hope is too big, but anyone who opens my phone sees Mum's things on the first page, and I can't stop that." | 5/10 |
| 7 | Conceição | Keep: "It is the first app I've met that tells me my Brier score barely beats my own base rate and then says that gap could be luck. That is honest, so I trust it, even when it doesn't tell me what happened while I was away." | 7/10 |

Median 7. The two unsure are the plain-language reader who came for one
thing (money) and the reader on a shared phone. The experts (2, 5, 7) keep it
for the method page.

## Usability

Ease is the Single Ease Question (1 very hard, 7 very easy). "Wrong turn"
means done after a detour or a loss.

| Goal | Runs | Outcome | Ease (median) |
|---|---|---|---|
| Do the Warm-up | 1, 3 | done; **run 3's reload at question 5 lost every answer** | 4 |
| Log a prediction | 1, 2, 3, 4, 6, 7 | all done; 1 and 6 typed it twice | 5 |
| Pick up after an interruption | 1, 2, 3, 4, 6, 7 | Resolve kept everything (4, 7); **Log and the Warm-up kept nothing (1, 2, 3, 6)**; 7's place wasn't named | 3.5 |
| Answer what's due, or a pile | 2, 4, 5, 7 | done | 6 |
| Fix a wrong answer | 2, 4, 7 | done (3 taps) | 6 |
| Fix a prediction's date, category or words | 1, 5, 6 | done | 6 |
| Set the reminder time | 1, 3, 6 | done; 3 looked on the prediction first | 6 |
| Find how the score is computed | 2, 7 | done | 6 |
| Find when you'll have a score | 2 | half done: a count, no date | **4** |
| Find whether you're off in one category | 4 | **gave up** (9 answered, no read) | **2** |
| Find whether time away changed anything | 7 | done after a wrong turn | **4** |
| Find out what happens to the streak | 4, 7 | done after a wrong turn (4); **gave up** (7) | **3** |
| Find what 70 / 85 / 90 are | 5 | done after a wrong turn, never confirmed | **2** |
| Check that answered / resolved / scored agree | 5 | done after wrong turns | **3** |
| Find the rule for changing an answer | 5 | found only on a locked answer | **3** |
| Keep predictions private on a shared phone | 6 | not possible | **2** |
| A due prediction whose outcome isn't known yet | 6 | done after a wrong turn (left open) | **3** |
| Find what an answered miss means | 6 | done after a wrong turn | **3** |
| Say what the Warm-up result means | 3 | only from the share card | **4** |
| Delete a duplicate; hide a category; what's free | 3; 5; 1 | done | 6 |

**Expectation mismatches seen by two runs or more:** a typed title or
Warm-up gone after the app closed (1, 2, 3, 6); the first ±5 landing at 80 or
55, so a coin flip costs five taps and a sure answer one (1, 2, 3); the score
on Today moving after a miss with no word (4, 7); the streak row and "rest
days saved" doing nothing on a tap (4, 7); 70 / 85 / 90 unlabelled (4, 5, 7);
"20" meaning four different thresholds (2, 3, 7); not being told at the
moment of Can't tell that it can be answered later (5, 6, 7).

## Comprehension (answered from memory)

20 of 21 answers matched what the app means (`CLAUDE.md`).

- **Right:** what 70% means (1, 3: both said "about 7 times in 10", which they
  credited to the line under the number); a miss at 70% isn't a mistake (1);
  what Plus adds and what stays free (1); the streak and rest days (2, 4);
  when a score comes and how it's computed (2); same-day answers (2); the
  first quiz's result (1, 3); when the reminder comes (3); what the big number
  is (4, though not 70 / 85 / 90); resolved versus answered versus scored (5,
  who also found the word used both ways); what hiding a category does (5);
  what the sister would see (6); what changing words does (6); time away
  doesn't move the score (7); "give or take" as an 80% range (7).
- **Partly right (finding 7):** how long a Can't tell can still be answered
  (7: the skip screen said "end of Tue, Nov 10", How scoring works "a week
  after its due day"; both are true, D45's floor, and only one is said).
- **Right, and a finding anyway:** Destiny on the Warm-up: "I did good, but it
  doesn't count" (finding 2); Ravi on the change window: "a day", which he took
  to mean 24 hours, read only on a locked answer (finding 7).

## What held up

- **The method page earns trust from experts.** Hiroshi, Ravi and Conceição
  each named How scoring works as the reason they'd keep the app: band edges
  stated, worked examples, the give-or-take defined, the Brier line against
  the person's own base rate ("the most honest sentence I've seen in a
  consumer app", 7).
- **Every count reconciles.** Ravi checked 147 resolved across Insights, the
  chart, the card and History, the categories' sum, a move between
  categories, and Resolve's "41 of 52"; Conceição checked "You expected
  about 3" by hand.
- **The tone after a miss is right where it's said.** "Recorded: it didn't
  happen", no cheer and no lecture, and a miss still keeps the streak (4).
- **Answering and correcting** stay fast (3 taps) and the 24-hour window is
  said as a clock time where the change is made (2, 4, 5, 7).
- **"About 7 times in 10" under every percentage** carried the plain-language
  and "7 in 10" readers (1, 3, 4, 6).
- **Other scripts work:** Japanese, Ge'ez and Spanish titles saved, wrapped
  and showed on every screen at 320 (web check, 2, 6).
- **Plus never pushed the teenager:** it never popped up and says what stays
  free (1). Titles are off by default on recaps (4, 6, 7).
- **Reduce Motion is respected:** no slide or bounce (2).

## Ranked findings

"No decision" means the fix doesn't change what a screen says or how it's
arranged; "needs the owner" means it does, or touches a decided D number.
Each finding names the runs that hit it and the axis that exposed it.
"Again" marks a finding from `playtest-2026-11-09.md` that this cast hit too.

### P1: what loses people

1. **Work in progress is lost when the app closes, now in the Warm-up too**
   (1, 2, 3, 6; the interruption, on the move, shared phone). Destiny's
   reload at question 5 sent her back to question 1 with nothing kept: the
   Warm-up keeps answers in memory and saves only at the tenth
   (`warmupStore.answer`). She nearly tapped "Skip for now", on the screen
   that's meant to win her in the first minute. Log lost a typed title for
   Lucía (reload); on iOS the × and the back swipe would have asked (2, 6).
   *No decision* for the Warm-up: keep the answers given so far and reopen at
   the next question (the ten are the same for everyone). *Needs the owner*
   for Log (again, finding 1 there): keep an unsaved draft.
2. **Nothing about me for weeks** (1, 2, 3, 4; first five minutes, "7 in 10",
   a miss that hurts). The first read waits on 20 answers; a student with five
   exams a term (1) and someone predicting a monthly payday (3) can't get
   there for months, and Hiroshi couldn't find a date or an estimate ("how
   many days at my pace?"). Marcus gave up (ease 2) on "am I too sure about
   Recovery?" with 9 answered: the counts are in History, but Insights gives a
   category nothing before 15, the row isn't tappable, and the Plus card's
   "what your 80% really means" read as if the answer was paid. *Needs the
   owner:* a plain-counts line per category before its score unlocks ("You
   said about 90%; 7 of 9 happened"), never a lean (D35, D28); an estimated
   date for the rating from the person's pace.
3. **What other people can see** (4, 6; shared phone, a miss that hurts).
   - Every category, the person's own names included, is on the card and the
     recaps until switched off (`cardHiddenCategories`). Marcus's "Recovery"
     came first, and the week recap headlined "Surest thing that didn't: 90%":
     his missed meeting.
   - The due-day reminder's body is the prediction's title
     (`reminderBody(p.title, …)`, `scheduler.ts:315`), and nothing in the app
     says so. Rahel moved reminders to 07:00 to be safe.
   - Today shows full titles to anyone who opens the phone. There's no lock
     and no hidden titles; "hide" in Categories reads like privacy but isn't
     (6).
   - The Privacy policy link 404s, because GitHub Pages is off (an owner
     step in the plan).

   *Needs the owner* (D39, D42, the open "hide titles" item; worth a
   `policy-auditor` pass): an added category off the card by default; say
   what a reminder shows, and offer reminders without the title.
4. **Coming back says nothing** (7; back after a gap, anxious, ADHD; again,
   findings 5 and 7 there). No "welcome back". The rating on Today went
   91 → 89 with no word, and Insights said "Down 1 since last week, from 7
   answers": all seven were July–September predictions answered that
   morning. The streak was gone without a word, and the streak row and
   "2 rest days saved" do nothing on a tap (4, 7). "All caught up" counted
   only the answers since the interruption (7; again, finding 17). *Needs
   the owner.*

### P1: the record's story

5. **The ±5 buttons make a sure answer cheaper than an unsure one** (1, 2, 3;
   "7 in 10", impatient). From empty, the first tap lands next to where the
   resting thumb shows (D36): 80 or 70 in the Warm-up and practice, 55 or 45
   on Log. A coin flip then costs five taps and 70% costs one. Twice Destiny
   "just took 70 because it was one tap, which means I said I was surer than
   I was". Hiroshi wanted the starting value shown, and the same on every
   screen. This is a record risk, because effort shapes the stated number.
   *Needs the owner* (D36).
6. **A miss reads as a grade** (4, 6, 7; a miss that hurts, anxious).
   - The rating moves on Today at once, with nothing said (4: 90 → 87; 7:
     91 → 89).
   - The miss screen's "In your 80–100% range, 7 of 9 have happened" doesn't
     say whether that's good or bad. The longer form ("That's 81%, against
     the 90% you said") did help Conceição.
   - "A 60% call that doesn't happen isn't a mistake" appears on the Warm-up
     and in How scoring works, but not on the miss screen, where Marcus
     needed it.
   - The reflection box asks "What surprised you?" on a miss.
   - Log opened right after his miss with the coverage nudge ("Try one you
     think won't happen… the confident half of you… tells us far more"). The
     wording reads like self-help (4), and "far more" overstates: a 25% yes
     carries what a 75% no does (7).
   - The answered-miss details say only "so a miss can't be quietly undone
     later" (6).

   *Needs the owner.*
7. **Rules said after they apply, or said two ways** (5, 6, 7; literal
   reader, third language, statistics expert).
   - The 24-hour change window isn't on Resolve's "Change to" or in How
     scoring works. It's said only on a locked answer, as "a day" (5; again,
     finding 4).
   - Nothing at the moment of Can't tell says it can be answered later. How
     scoring works says "until a week after its due day", while the skip
     screen says "end of Tue, Nov 10" for a September match (7). Both are
     D45, which also never gives less than the correction window, but How
     scoring works leaves that floor out (`scoringCopy.ts:119`).
   - A Can't tell gets no "Recorded" screen and silently doesn't count toward
     the day's goal (5; again, finding 13).
   - On an answered prediction, a category move saves on the tap; an open
     prediction's Edit has Save and Cancel (5).

   *No decision:* add D45's floor to How scoring works ("…or a day after you
   chose it, whichever is later"). *Needs the owner:* the window on Resolve,
   the later-answer note on the skip, and one save model.
8. **One word, two meanings** (all seven; worst for 5, 6, 7).
   - "Resolved" means Yes or No on Insights ("147 resolved"), while History
     labels every answered card "resolved <date>", Can't tell included
     (`PredictionCard.tsx:91`). The details screen says "answered", and
     "Ready to resolve" means due.
   - "Resolutions" read as New Year's (1, 3), and "call" as a phone call (2).
   - Also read twice or more: "lean", "n=4", the grey-bars caption, "pad",
     "flatter", "on their way", "Goal: 1 of 3", "thesis".
   - "20" stands for four different thresholds (2, 3, 7; and the category
     score at 15).

   *Needs the owner* (the open terminology pass).
9. **70 / 85 / 90 are unlabelled** (4, 5, 7; third round running). They read
   as a rising trend (4, 7), they don't respond to a tap, and they're hidden
   from the accessibility tree (5). *Needs the owner* (again, finding 10).
10. **The card's and recaps' headlines contradict or skip** (3, 4, 5, 7).
    - "Calibrating" sits above "Calibration 89/100" when the rating has
      unlocked but no category has 20 (4; `shareLines` falls back to
      `UNGATED_IDENTITY`).
    - Of two Forecaster categories, the identity line names one and leaves
      out the other by an unstated rule (5).
    - The year recap headlines "Tracker in health: 6 to go" where Futebol is
      her main subject (7).
    - The week recap calls two months of old answers "your week" (7).
    - The week panel says "Nothing came due this week. Log a prediction and
      the story starts." after one was logged (3; `wrappedCopy.ts:68`).

    *No decision* for the last: drop "Log a prediction…" when one is open.
    *Needs the owner* for the rest (D27, D42).

### P2: the people the app wasn't shaped around

11. **A student has nowhere to file school, and can't find how to add it**
    (1; teenager). Log and Edit offer the five categories and no way to add
    one; Lucía found Categories in You "by luck". The starter ideas are adult
    ones. Exam marks come back days after the exam, so a due date on exam day
    asks too early: the due date means "when you'll know", and nothing says
    so. *Needs the owner:* a way from Log's chips to Categories; the due
    date's meaning on Log; student starter ideas.
12. **A due prediction whose outcome isn't known yet** (6; third language,
    careful). "The letter arrives this week" is due on Monday. Resolve offers
    only Yes, No and Can't tell, with no "not yet" and no way to move the
    date. *Needs the owner.*
13. **The reminder's time isn't on Log or the details screen** (3; again,
    finding 2), and **Today's "Your first answer: Friday evening" ignores the
    reminder time** (1: set to 4 PM). That line is fixed text
    (`dueGroups.ts:126–128`). *No decision* for the line: name the part of the
    day from `dueReminderTime`. *Needs the owner* for showing the time on
    Log.
14. **Repeats are hard to tell apart** (3, 7). The same words logged twice
    while the first is open get no warning (3). History rows show when a
    prediction was answered, not when it was due, so two "Porto win at home"
    rows differ only by percentage (7). *Needs the owner.*
15. **Defaults and small things a daily user meets** (4, 5). Log's due date
    is "In a week" after the first prediction (by design, D18), and a daily
    user changes it every night (4). A hidden category still says "4 more
    resolved to reach Tracker" on Insights (5). The Categories switch has no
    visible label (5). "Resolve all 3" disappears after one answer (5).
    *Needs the owner.*

### P2: layout (iOS too)

16. **Practice's Next sits below the fold at 320** (2: 551–597 in a 569 px
    window). The Warm-up scrolls its confidence into view when an answer is
    picked (`WarmupQuiz` `pick`); practice doesn't. *No decision:* reuse the
    reveal.
17. **History's "You said 80–100%" filter drops while the Log sheet is open
    over it** (4). `useFocusEffect` clears the range whenever History loses
    focus, and a sheet takes it. *No decision:* clear only on a tab change.
18. **The prediction details screen has no heading** (web check), unlike
    Resolve. *No decision:* the title as the screen's header for VoiceOver.

### P3: polish and method

19. **Statistical caveats an expert would want** (7). A binned score sits
    below 100 for a perfectly calibrated person at small counts, and with
    three ranges tested at 80% a calibrated person will sometimes see a lean
    called. The give-or-take covers part of this. *Needs the owner*
    (scoring copy).
20. **Times and dates in three styles** (6: "Nov 9", "2026-11-17", "7:00 AM"
    beside "07:00"; again, finding 3). *Needs the owner* (`expo-localization`,
    a new build).
21. **A lone character wraps onto its own line in a Japanese title** ("く";
    web check). Cosmetic, and depends on the font. Not ranked further.
22. **Three require cycles in `src/store`** (categoryStore ↔ authStore;
    authStore → practiceStore → analytics → authStore; authStore ↔
    predictionStore) show as console warnings (web check). *No decision:*
    note them in `docs/tooling-notes.md` as known, or break them.
