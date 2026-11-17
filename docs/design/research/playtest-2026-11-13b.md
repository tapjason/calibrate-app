# Blind playtest, 2026-11-13b: a fortnight in the app

Raw findings, 2026-11-13. This is the nineteenth round:
- four diaries, each on a different rhythm, with the clock moved between sittings;
- four single sittings aimed at open decisions, each starting with three minutes and no task.

Measures are kept from round 18, plus a `Tomorrow 0–10` after every diary sitting. Eight people
new to rounds 17–18. The plan, cast and criteria are in [`round-plans.md`](round-plans.md#round-19).

These are what the testers saw, checked against the code; they are not decisions. **AI agents
playing people:** the numbers compare tasks and people. They aren't benchmarks against real users.
Where they differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

## Method

- **Build:** `builder/step-173-owner-picks` at `818eb35` (step 174 served). From run 8, `49ed17d`
  was served (the round's first fixes).
- **The diaries:**
  - Grace: Monday morning, Tuesday evening, then 16 days away.
  - Yusuf: across midnight. Friday 23:50, Saturday 07:10, Saturday 23:55.
  - Priya: Sunday, Wednesday, the next Sunday.
  - Hannah: days 0, 2 and 5, with Reduce Motion.
  - The same agent continued after the main session moved the clock.
- **The single sittings:**
  - Rosa: sharing before 20 answers.
  - Elena: privacy on a long record.
  - Tunde: an old phone on prepaid data. CPU 4× slower, about 1.6 Mbps at 150 ms, 320 × 568.
  - Min-jun (the wildcard): a dyslexic teenager with a stylus.
- **Profiles that fit the person:** five fresh installs. Priya and Elena on `long-time`, Tunde on
  `return`.
- **Locales:** en-GB (Grace, Yusuf, Priya, Hannah), en-US (Rosa), en-DE (Elena), en-NG (Tunde),
  en-KR (Min-jun), each with its own time zone set before seeding.
- **The wildcard's draw** (`random.SystemRandom`): 13–17, dyslexic reader, East Asia, thinks in
  "7 in 10", motor (one hand, stylus), recovery and habits, in school, privacy-minded, a family
  member installed it. Crossing time zones became on a bus (round 18 had the traveller). New §10
  row: Min-jun.
- **Bugs fixed during the round:**
  - `49ed17d`, after runs 1–4: the Due line into view; "about it" for one; the rating line once
    per answer run; the rest-day line says when none are left.
  - After run 8: the Erase confirmation's list; the Warm-up's +5 held level. Not yet seen in the
    web build: these two.

## The persona table

| # | Persona | Stage, screen, stand-ins | Verdict | Score | UMUX-Lite | Trust (numbers / fair / act) |
|---|---|---|---|---|---|---|
| 1 | Grace, 58, baker, plain reader (diary) | fresh, +1 day, +16 days; 375 light, en-GB | keep for now | 6 | 66.7 | 4 / 5 / 2 |
| 2 | Yusuf, 30, night baker (diary) | fresh, across midnight; 402 dark, en-GB | unsure | 6 | 66.7 | 4 / 4 / 2 |
| 3 | Priya, 45, product director (diary) | five months, Sundays; 440 light, en-GB | keep (Sundays) | 7 | 75 | 4 / 4 / 4 |
| 4 | Hannah, 30, long COVID (diary) | fresh, days 0, 2, 5; 390 light, Reduce Motion | keep | 7 | 75 | 4 / 4 / 3 |
| 5 | Rosa, 24, social-media manager | fresh, 402 light, en-US | unsure | 5 | 58.3 | 4 / 4 / 2 |
| 6 | Elena, 52, data-protection lawyer | five months, 375 dark, en-DE | unsure | 5 | 58.3 | 4 / 4 / 3 |
| 7 | Tunde, 24, delivery rider | back after 3 weeks, **320 × 568**, CPU 4×, slow network, en-NG | unsure | 6 | 58.3 | 4 / 3 / 3 |
| 8 | Min-jun, 16, dyslexic, stylus (wildcard) | fresh, 390 dark, en-KR, Seoul | unsure | 6 | 50 | 3 / 4 / 2 |

- **Scores:** median 6, mean 6.0. Three keep, five unsure. Round 18: median 7, seven keep.
- **UMUX-Lite:** mean 63.5. Round 18: 72.9. Ease held (5–6 everywhere); "meets my requirements"
  fell (3–5), and the single sittings aimed at open decisions pulled it down: sharing, privacy,
  a slow phone, a habit tracker it isn't.
- **Trust:**
  - "I trust the numbers": 4 in seven runs; Min-jun 3, with nothing shown yet;
  - "It treats me fairly": 4.0;
  - "I'd change what I do because of it": 2.6, the lowest item again.
- **What made people act**, again a count of their own record on Log: Priya dropped 85 to 55 on
  "10 of 22" in finance; Tunde thought twice about his 80% for Arsenal on "17 of 25".

## The diaries: Tomorrow, per sitting

| Diary | Sitting 1 | Sitting 2 | Sitting 3 | Words |
|---|---|---|---|---|
| Grace | 7 | 6 | 4 | Painless, Polite, Patient |
| Yusuf | 6 | 6 | 5 | Literal, Nagging, Day-shaped |
| Priya | 4 | 5 | 3 | Honest, Useful-ish, Sobering |
| Hannah | 7 | 6 | 8 | Gentle, Kind, Patient |

- Three of four curves fall by the third sitting. The fall is in what there is to come back for,
  not in ease:
  - Grace: "about 3 months" to any read.
  - Yusuf: predictions turning ready at midnight, hours early.
  - Priya: a 151-day streak gone without a word.
- Hannah's rose: the streak switched off, "isn't a mistake" on a bad day, nothing asked of her.
  The one drop in her sittings was the recap calling her 40% walk the "surest thing that didn't".
- Round 18's diary (Bea) said the same: kind at every return, little to care about before 20.

## How sure of what they understood

There were 24 comprehension answers (Elena and Tunde gave 1–5, mapped onto 50–100%). People were
on average **76% sure, and 22 of 24 were right.**
- **Confidently wrong:** none. **Wrong:** Rosa on the squares, 25% sure: she guessed Wordle (green
  right, orange wrong). They mean no clear lean, too sure, too cautious.
- **Can't be known from the app:** Elena's last answer (1 of 5) and Min-jun's third (65%) both
  turned on what the phone shows someone else, the lock screen included. Nothing in the app says.
- Three other answers sat at 65% or less (Hannah, Rosa, Elena).

## Task success: expected against actual

| Task kind | Expect → SEQ (runs) | Errors |
|---|---|---|
| Answering what's due | 6 → 7 (Grace, Yusuf, Priya, Hannah, Tunde) | Yusuf 1 (no "not yet") |
| Logging one or a few | 5–6 → 6 (six runs) | Grace 1 (web date box) |
| The Warm-up | 4–5 → 5 (Grace, Yusuf, Hannah) | 0; Min-jun skipped at question 3 |
| Turning down the streak | 3 → 6 (Hannah) | 0 |
| Catching up after two or three weeks | 5–6 → 5–7 (Grace, Priya, Tunde) | 0 |
| "Is it any good / what does it say" | 3–5 → 4–6 (Grace, Yusuf, Priya, Hannah) | 0 |
| Fixing a prediction's words, with a reload | 5 → 6 (Min-jun) | 0 (the unsaved edit lost) |
| Something to post or show | 3–4 → **1–3** (Rosa, Tunde, Min-jun) | Rosa gave up (the squares) |
| Where the data is and what's sent | 4 → 4–5 (Elena, Min-jun) | 1 each (the policy 404) |
| A reminder that doesn't show my words | 3–4 → **2–3** (Elena, Min-jun) | Min-jun gave up |
| Data and battery on prepaid | 3 → **3** (Tunde, gave up) | 0 |

- **Better than expected:** turning down the streak, answering, logging in batches, coming back.
- **Under 5, or given up:** sharing (three runs), the lock screen (two), data and battery,
  "is it any good" at its low end.

## Did step 174 land

| Change | Who | Landed? |
|---|---|---|
| The first category tap takes | Grace, Hannah, Min-jun, Rosa | yes, every time |
| The streak row opens Your streak | Grace, Hannah, Min-jun | yes. Hannah found the switch through it; Min-jun found it a wall |
| The answer run starts at the top | Priya, Tunde, Grace | no complaints |
| Coverage note says scored answers | Grace, Hannah | read; "under 40%" still trips on a 40% call (third run) |
| "Tracker or higher" | Rosa, Tunde, Min-jun | read without a misreading |

## What held up

- **Answering.** "Calm, no fireworks" (Grace); "quiet and fair, no confetti" (Hannah). "Isn't a
  mistake" took the sting out of a hard No.
- **Coming back.** Grace after 16 days and Tunde after three weeks: Welcome back, Answer all,
  late answers counted.
- **"Times in 10."** Grace, Hannah and Min-jun named it unprompted.
- **"Save, due Sunday" and "Save and log another"** (Hannah, Tunde, Min-jun).
- **Offline by default.** "Not signed in. Your predictions live only on this phone" was
  Min-jun's best sentence; logging and deleting sent nothing (Elena checked the network).
- **Korean titles** worked everywhere (Min-jun).

## Ranked findings

### P1

1. **A badge named on one answer and gone on the next, without a word** (run 7).
   - In the answer run, Tunde's 20th health answer showed "Forecaster in health". The next one, a
     No at high confidence, pulled the category's low end under 70. Today and Insights then said
     "Tracker in health" (score 80, give or take 11, from 21). Nothing on screen said it had
     dropped.
   - Badges are computed afresh on every read (CLAUDE.md, Badge Levels), so this is the rule
     working. What the screen does with it is the problem: "If I'd screenshotted that banner for
     my guys, I'd have been posting a lie." His best moment and his worst were 30 seconds apart.
   - **Needs the owner:**
     - name a new tier only at the run's end, on what the run left;
     - say when a tier drops ("Back to Tracker in health: the last answer moved its low end
       under 70");
     - or hold a tier until the low end falls a few points further (hysteresis, which changes the
       badge rule).
2. **The day ends at midnight, but a night worker's day doesn't** (run 2).
   - At 00:00, both of Yusuf's 23:50 predictions turned "Ready to answer", though neither outcome
     could be known before 06:00 or that afternoon.
   - His streak day and daily goal split across one shift ("logged ten minutes ago now counts as
     yesterday"), and the practice reset mid-break.
   - "Your first answer: tomorrow evening" became "is ready" at midnight, hours before the
     evening it had promised.
   - Answering at 07:10 something logged at 23:52 the day before is scored. That's D41 as
     written, and he found it fair.
   - **Needs the owner:** "ready" from the reminder's time on the due day rather than from
     midnight, or a day-start setting for shift workers (both touch D41's local day and the
     streak).
3. **Privacy: the policy 404s, and nothing says what a reminder shows** (runs 6, 8; round 18 runs 3, 8).
   - The policy link opens "Site not found", for the second round running. It was where Elena
     went first.
   - On every launch the build calls RevenueCat (e.revenue.cat events and
     api.revenuecat.com subscribers, with a per-install anonymous id), signed out and on the free
     plan. Traced to the entitlement check (`configureBilling(null)`). The unpublished policy
     names it (§2 and its processors table). Against the store page's "No tracking", Elena read
     it as tracking.
   - Logging and deleting sent nothing at all (Elena checked).
   - Lock-screen content isn't said anywhere, and there's no app lock. Titles sit in full on Today
     and History. This is the third run over rounds 18–19.
   - Min-jun's deciding question: whether a reminder would show "토요일 손가락 운동…" on his lock
     screen beside his mum. No setting and no word, so he turned the digest off "just in case".
     That's four runs over rounds 18–19 (Sanjana, Bea, Elena, Min-jun).
   - **Needs the owner:** publish the policy (GitHub Pages); a line in You on what a reminder
     shows and what goes where (with run 7's data question); B9 (D52 (3) closed privacy beyond
     that).
4. **The squares Rosa installed for appear nowhere before 20 answers** (run 5).
   - A friend's text share brought her: ⬜🟩🟧. In the app, the squares exist only on the text
     share, and only once a range has 10 answers. Before that she had nothing of her own to post
     but the Warm-up card.
   - The round's one confidently wrong answer: asked what the squares mean, she said Wordle
     (green right, orange wrong), 25% sure. Under D35 they mean no clear lean, too sure, too
     cautious.
   - **Needs the owner** (B7: what a newcomer can share, and where the squares are explained).
5. **The recap's "Surest thing that didn't" and "Boldest call that landed"** (runs 1, 4; round 18
   runs 2, 3, 4; round 19 run 3).
   - Hannah logged a walk at 40%. On a bad day, it didn't happen. The recap called it "Surest
     thing that didn't: 40%, I'll manage the walk". It undid what Thursday's "isn't a mistake"
     had done: her worst moment.
   - Grace laughed at the same line. "Boldest" reads as betting.
   - That's six runs over rounds 18–19 (R13 #21 first).
   - **Needs the owner**, strongly: the line's name, or a floor under which no call is "surest".
6. **A 151-day streak ended without a word** (run 3).
   - Priya's two rest days went on Monday and Tuesday. Today said "The last 2 days were rest
     days", but not that none were left. Thursday ended the streak. On Sunday the row had gone
     and the end card said "1-day streak".
   - **Fixed in part** (`49ed17d`): the rest-day line now says "None saved now; the next comes
     with day N".
   - **Needs the owner:** saying a streak has ended (D51 does only after 14 days away).

### P2

7. **The empty middle** (runs 1, 3; round 18 run 3).
   - At two or three a week, Grace's estimate read "about 3 months (around 10 Mar 2027)". That was
     her worst moment: "months before it tells me anything".
   - The third diary over two rounds where week two had nothing to care about before 20.
   - **Needs the owner** (B3).
8. **Can't tell sounds final, and there's no "not yet"** (runs 2, 4).
   - "It won't count toward your score" reads as final, though a Can't tell can be answered for a
     week (D45).
   - Yusuf's sleep prediction sat "Ready to answer" for seven hours with no way to say "not yet".
   - Hannah felt Can't tell tempting as an escape from a hard No.
   - **Needs the owner** (D10's label; D52 (10) closed "not yet").
9. **Due dates people say in words** (runs 1, 4; round 16).
   - Three of Grace's four predictions needed Pick a date.
   - Hannah typed "on Thursday", and the due date stayed on Tomorrow.
   - **Needs the owner:** weekday chips (D55 left them out).
10. **The daily goal's "of 3"** (runs 4, 8).
    - On day one, Hannah read "Goal: 1 of 3" as being behind already.
    - Min-jun's physio says three times a day, so "Goal: 2 of 3" read as counting his exercises.
    - **Needs the owner** (D17: the goal is asked of nobody; off until day 2, or named "3 a
      day: the app's goal").
11. **Today's rating and badge line open the rules** (run 7).
    - These were two of Tunde's first three taps. Each time he wanted his numbers and got How
      scoring works.
    - D59 chose this for the rating.
    - **Needs the owner:** the badge line to Insights' badges instead?
12. **"Am I getting better?"** (run 3; round 18 run 3).
    - One free sentence ("Up 3 since last week…"); Trends is behind Plus with no preview.
    - Priya's Sunday decision ("bet lower on money") is never linked back.
    - **Needs the owner** (GROWTH, Plus).
13. **Nothing worth posting that shows a hit** (runs 5, 7; round 18).
    - Tunde: the card's ▼ "too sure" and the recap's "None of your 80–100% happened" — "the
      group chat would finish me". He wanted "Arsenal calls: 7 of 9".
    - Rosa: practice has no share; locked themes go to the paywall with no preview.
    - "2 categories not shown" invites "what are you hiding".
    - **Needs the owner** (B7, B10).
14. **The weekly recap counts a comeback day as "this week"** (run 7).
    - Six answers given late on Tunde's first day back made a week with "1 happened. You expected
      about 3."
    - Grace's recap said "You expected less than 1" for a week of old answers.
    - **Needs the owner.**
15. **Data and battery** (run 7).
    - On prepaid data, that's the first question. The only hint: "Not signed in. Your predictions
      live only on this phone."
    - **Needs the owner**, with finding 3's line in You.
16. **The Brier line reads as a put-down** (runs 3, 7; round 18 runs 1, 2, 4).
    - Tunde: "sounds like an insult". Priya: the most important sentence, as a footnote, with no
      so-what.
    - **Needs the owner** (B5).
17. **Usage stats are on by default** (runs 6, 8).
    - Decided ON; a guest's counts go up with no id.
    - Elena questioned the default for a lawyer's client. Min-jun, 16 and never signing in, asked
      why it's on, and turned it off.
    - **Needs the owner** (policy-auditor at the gate).
18. **No Shop, Energy or Football** (runs 1, 4, 7).
    - Testers wanted a category Log doesn't offer, and can't add one from Log.
    - Categories are added in You (D39).
    - **Needs the owner** (B4).
19. **A leading emoji in a category name isn't used as its icon** (run 5).
    - Rosa named hers "🍸 Nights out" and then set the icon too.
    - **Needs the owner**: pre-fill the icon from a leading emoji, or leave the name as typed.

20. **The Warm-up without dragging** (runs 4, 8).
    - With ±5 only, a question costs 7–9 taps from the coin flip. Hannah took about 45 taps and
      three minutes for "60 seconds". Min-jun, on a stylus, skipped at question 3: "homework".
    - **Needs the owner** (a tap on the track already sets any number; whether the Warm-up says
      so, or offers 60 / 70 / 80 / 90 chips).
21. **How scoring works is a wall for a dyslexic reader** (run 8; run 7).
    - The streak row and the badge line land mid-page in long grey paragraphs. He lost his place
      twice; "Today joins it with that; until then, yesterday's streak still stands" took three
      reads.
    - **Needs the owner** (a lead line per section, or the section alone).
22. **A daily habit shows nothing until the next day** (run 8).
    - D41 keeps same-day answers unscored, and the week's recap reads "2 on the way". "Are you
      doing them?" has no answer on day one.
    - D56 decided the habit flow; **needs the owner** only if habits are a use to court.

### P3

23. **The Erase confirmation didn't list everything** (run 6).
    - It named predictions, reflections and the Warm-up. It left out categories and icons,
      practice, the unsent usage queue, the kept draft and the age range, and it didn't say that settings stay.
    - **Fixed**: it now names all of them. The policy's "removes everything" line now says
      settings stay.
24. **"One answer nudges it either way…" three times in one answer run** (run 3).
    - **Fixed** (`49ed17d`): once per run. Single Resolve still says it each time.
25. **"Answer what you remember about each" with one left** (run 1).
    - **Fixed** (`49ed17d`): "about it".
26. **The Due line half behind the Save bar with Pick a date open** (runs 1, 7; round 18 run 5).
    - **Fixed** (`49ed17d`): opening Pick a date scrolls the line into view.
    - At 320 × 568 the chips also sit under the fixed bar until scrolled (run 7). The content
      scrolls, so nothing is lost.
27. **The recap's empty badge mark** (run 5): the "Getting started" lens with no progress (dashed,
    with a slash) read as a broken image. **Needs the owner** (DESIGN_SYSTEM's emblem).
28. **Coverage note: "under 40%" leaves out 40** (run 4; round 18 runs 3, 5).
    - The bucket boundary is 40, so 40% sits in 40–60.
    - **Needs the owner**: wording only, but it names the bucket rule.
29. **Got it on the welcome back looks small** (runs 1, 7): about 39 × 36 drawn, and Grace never
    tapped it. Its `hitSlop` of 8 makes the target about 55 × 52 on the phone, so the problem is
    how it looks: a quiet word, easy to miss. No decision needed if it stays as it is.
30. **Resolve, three weeks late:** "On 6 Nov you said 75%" without the due date, so "today" in the
    title is ambiguous (run 7). **Needs the owner.**
31. **The Warm-up's +5 dropped about 10 px mid-tap** (run 8): when the frequency wrapped to a
    second line, the inline steppers, centred on the row, moved down. **Fixed**: held level with
    the number's first line.
32. **Edit's unsaved words are lost on a reload** (run 8). Log keeps a draft (D59); Edit doesn't.
    **Needs the owner.**
33. **"Save and log another" clears the category** (run 8): for a run of exercise predictions he
    wanted Health kept. D59 starts the form over. **Needs the owner.**
34. **Words read twice:** "calibrating" against "calculated", "scored" against "stored" (run 8);
    "call" for a guess (run 1).

### Web-only, so not ranked

- "Sharing isn't available on this device" (runs 5, 7) and the page scrolling the card away after
  it: the web has no share sheet.
- No practice-reminder offer under a finished practice (run 1): it waits on notification
  permission, which the web build doesn't have.
- The slider ignoring the arrow keys (run 7): on the phone it's the VoiceOver adjustable.
- Open time of 10–17 s under a 4× CPU throttle (run 7): a dev bundle, not the release build.
  The real iPhone SE timing is for `/device-check`.
- History's filter chips running off the right edge at 320 (run 7): one deliberately scrolling
  row (`history.tsx`), not a break.
- The ISO date box under Pick a date (runs 1, 4).
- Prices in dollars (run 3).
- Small targets measured in the browser (run 8): the "+" is drawn at 32 but has a 44 pt target
  (`LogButton`'s `hitSlop`); the digest's day chips and History's "All" are 36 high, which is
  `docs/app-profile.md` §18's web-measure trap. Worth a stylus try on the phone.
