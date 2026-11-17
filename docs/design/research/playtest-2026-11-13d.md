# Blind playtest, 2026-11-13 (d): appeal, a shuffled cast, on step 177

Raw findings, 2026-11-13. This is the twenty-first round and the fifth appeal round. It is the
first round on step 177 (D61): eight blind runs on master at `2c3444b`, cast and briefed by the
appeal kit (`docs/playtest-appeal.md`).
- Six people were drawn at random across every §10 axis, each with a step 177 feature to meet.
- Two were cast to fill the appeal rules' gaps.
- All eight are new.

Plan and briefs: [`round-plans.md`](round-plans.md#round-21).

These are what the testers saw, checked against the code; they are not decisions. **The testers
are AI agents playing people:** the appeal answers show where groups part ways, never a market
number. Where they differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

## Method

- **Health check** (`web-playtester`): all PASS.
  - Step 177's paths:
    - the Warm-up's intro, order and no-lean line;
    - "+ New category", with Save held;
    - the Edit note;
    - the Warm-up card and the friend's-squares line;
    - Can't tell's notice in a run;
    - no pace line one answer from unlocking;
    - the Brier line;
    - Share's switch;
    - hidden words on Today and History;
    - the recap's "N scored";
    - the eve-delete text.
  - The `day1`, `return`, `threshold` and `long-time` profiles, and the paywall.
  - One note: an open prediction made today and due tomorrow shows the plain delete text, by
    design (D61 (i)).
- **Between runs** the main session closed the page, cleared storage, installed a clock where the
  brief needed one (before seeding), and set the locale and time zone through CDP.
- **Clocks:**
  - Leila: 19:00 Amman.
  - Imran: 10:00 Saturday, Karachi.
  - Omar: 18:00 Cairo.
  - Mrs Lau: 09:00 Saturday, Hong Kong.
  - Everyone else: real time.
- **Stand-ins:**
  - CSS zoom 1.25 for Leila and Mrs Lau.
  - Reduce Motion for Omar.
  - For Ellie, the accessibility tree and the keyboard only: screenshots as a record, never to
    find things.
- **Interruptions:** in all eight runs. Six left the app for `favicon.ico` and came back; two
  used the browser's back button.
- The cast, the draws and their fixes, and the briefs are in the plan.

| # | Persona | Age | Tech | Region | Found it | Stage (profile) | Screen, locale |
|---|---|---|---|---|---|---|---|
| 1 | Leila, vet nurse, Amman | 23 | L2 | Middle East | a podcast | day 2 (`day1`) | 320 × 568 dark, zoom 1.25, en-JO |
| 2 | Imran, travel agency, Karachi | 52 | L3 | South Asia | App Store | five months (`long-time`) | 440 × 956 light, en-PK |
| 3 | Lotte, vet student, Utrecht | 19 | L3 | Western Europe | App Store | back after 3 weeks (`return`) | 375 × 812 dark, en-NL |
| 4 | Omar, 15, Alexandria | 15 | L3 | North Africa | a short video | fresh | 440 × 956 light, Reduce Motion, en-EG |
| 5 | Ellie, 14, blind, Belfast | 14 | L2 | UK | her counsellor | fresh | 375 × 812 dark, accessibility tree and keyboard, en-GB |
| 6 | Thanh, biostatistics PhD student, Houston | 34 | L4 | US | his sister | one from unlocking (`threshold`) | 402 × 874 light, en-US |
| 7 | Mrs Lau, retired teacher, Hong Kong | 73 | L1 | East Asia | her grandson | fresh | 375 × 812 light, zoom 1.25, en-HK |
| 8 | Efua, product designer, Accra | 29 | L5 | West Africa | a friend's card | fresh | 390 × 844 dark, en-GH |

## The persona table

| # | Persona | Verdict | Score | Five-second | If it disappeared |
|---|---|---|---|---|---|
| 1 | Leila | keep for now: "I'll keep it until Saturday to see about Luna… but it talks too much and wouldn't let me fix my own number." | 6 | yes | somewhat |
| 2 | Imran | keep: "It tells me the truth about my money calls with numbers I can check, but it hides my client notes only from a glance, not from a finger." | 7 | yes | somewhat |
| 3 | Lotte | keep: "Hij is eerlijk en niet streng tegen me, dus hij mag blijven." ("It's honest and not hard on me, so it can stay.") | 7 | maybe | somewhat |
| 4 | Omar | keep for now: "The quiz was cool and 9 of 10 is going in the group, but I have to wait till Thursday for anything real." | 6 | yes | somewhat |
| 5 | Ellie | unsure: "It talks like it's for grown-ups at work, and it counted my date fix like I was trying to cheat." | 6 | yes | somewhat |
| 6 | Thanh | keep: "It doesn't oversell what it knows, which is rare. But my 85 is roughly what a perfect forecaster would get from 20 answers, and the app never says so." | 8 | yes | somewhat |
| 7 | Mrs Lau | keep for now: "for the three little questions every morning and to see whether my rain guesses come right, but I won't press anything that says Plus." | 6 | yes | somewhat |
| 8 | Efua | keep: "I can't fudge my number after the fact, which means Kojo couldn't either, so his 84 is real and I'm staying till my 20 are in." | 7 | yes | somewhat |

**Overall:** median 6.5 (mean 6.6). Seven keep (three "for now") and one is unsure. All eight
would be somewhat disappointed.

**Against round 20** (median 6.5): four kept, four were unsure, and three would not have been
disappointed. Fresh installs kept at three in four this round, against one in four.

## Usability

| Task kind | 1 Leila | 2 Imran | 3 Lotte | 4 Omar | 5 Ellie | 6 Thanh | 7 Lau | 8 Efua |
|---|---|---|---|---|---|---|---|---|
| First look | done 4 | done 5 | done 5 | done 7 | done 6 | done 6 | done 6 | wrong turn 4 (Kojo's squares) |
| What it asks first, or what's due | done 6 | — | done 6 | done 6 | done 4 | done 7 | done 5 | done 6 |
| A prediction from their life | done 6 (own category) | — | done 5 (own category) | done 5 (own category) | done 5 (own category) | done 7 | done 6 (own category) | done 6 |
| Recovery | **wrong turn 3** (number) | done 6 (delete) | done 6 (change answer) | **wrong turn 4** (number) | done 4 (date, counted) | done 6 (change answer) | done 5 (spelling) | **wrong turn 4** (number) |
| Findability | wrong turn 3 (reminder time) | done 6 (hide), 4 (Brier) | done 5 (streak) | done 6 (hide) | wrong turn 4 (when) | done 7 (badge rules) | done 6 (daily practice) | — |
| Show or tell | done 5 | wrong turns 3 (Warm-up card) | wrong turn 4 | done 6 | done 3 | done 6 | wrong turn 5 | done 5 |
| Keep or pay | 6 | 6 | 6 | 6 | 6 | 6 | 5 | 6 |

**Nobody gave up** (two did in round 20).

**Under 5:**
- **Changing a number made minutes ago:** three runs (Leila 3, Omar 4, Efua 4), after Katrin in
  round 20. Each did 13–19 taps to delete and retype it.
- **Showing someone:** Imran 3, Lotte 4, Ellie 3.
- **When the reminder comes:** Leila 3, Ellie 4. On the web the details sheet hides "with a
  reminder at 19:00" (web-only).
- **The rest:** Ellie's Warm-up (about 70 keyboard actions), Ellie's date fix, Imran's Brier
  line, and Efua decoding Kojo's message (three screens).

**Expectation mismatches named by two or more runs:**
- Edit won't change the number, and the way round is delete and retype everything (Leila, Omar,
  Efua; Mrs Lau and Ellie met the Edit warnings).
- Hidden words still show the category and emoji, and one tap shows everything (Imran, Omar).
- The Warm-up card is found only behind a second button (Leila, Imran, Thanh, Mrs Lau).
- Prices in dollars, and month-first date boxes (web-only).

## Comprehension

All twenty-four answers were right, a few with a hedge (round 20: nineteen right, five partly).
- **Efua** read her friend's squares correctly from the line under her Warm-up card: "his
  middle band is orange: too sure on coin flips".
- **Thanh** explained:
  - the Brier comparison, with what step 177's sentence adds ("my percentages don't yet separate
    the mornings I run from the ones I don't");
  - the give-or-take as an 80% bootstrap;
  - that a badge goes back when its low end falls to the bar or its count falls under 20.
- **Imran** explained why his delete wasn't counted: "only one due that day or the next".
- **Lotte** knew when her Can't tells close.
- **Ellie** said a missed worry "isn't a mistake".
- **Hedges:** Mrs Lau and Leila weren't sure of the reminder's hour. The web build hides it.

## Appeal

| # | 5-sec | Low (where) | High (where) | Ease | Appeal | Five words | Disappointed | Post | Pay |
|---|---|---|---|---|---|---|---|---|---|
| 1 Leila | yes | −1 (number locked; "Nothing under 40%" after a 30% log) | +2 (Luna under her own 🐾 group; practice) | 4.5 | 4.25 | Calm, Honest, Respectful, Personal, Too technical | somewhat | the Warm-up card to Rana, maybe a story | no; maybe 5 JOD a year later |
| 2 Imran | yes | −1 (Brier; hunting for the Warm-up card) | +1 (Insights; hide; the year recap) | 4.75 | 5.0 | Honest, Useful, Respectful, Calm, Too technical | somewhat | the year recap to his partner, privately | ~Rs 5,000 a year |
| 3 Lotte | maybe | −1 (the guilt pile; Brier) | +2 (Pim's own chip) | 4.75 | 4.5 | Honest, Kind, Calm, Personal, Too technical | somewhat | the card to Mum | €0–5 |
| 4 Omar | yes | −1 (number locked; streak gone on delete; Insights; paywall) | +2 (9 of 10; the Warm-up card) | 4.75 | 4.5 | Clever, Honest, Fun, Calm, Respectful | somewhat | the Warm-up card to the group | ~50 EGP a year for themes |
| 5 Ellie | yes | −2 (the date fix "counted") | +2 (no clear lean, "isn't about being right") | 4.25 | 4.25 | Honest, Calm, Respectful, Too technical, Judgemental | somewhat | no (private worries) | £0; £5 once by parents |
| 6 Thanh | yes | −1 (Brier; the alcohol miss; paywall) | +2 (Insights' 80% bands and bootstrap) | 5.0 | 5.25 | Honest, Respectful, Clever, Calm, Useful | somewhat | to his sister, "Day 1 vs week 6" | $0; lifetime to support |
| 7 Mrs Lau | yes | −1 (the yearly trial preselected) | +2 (9 of 10; practice) | 4.5 | 4.5 | Honest, Calm, Respectful, Clever, Too technical | somewhat | only her grandson, "Por Por 9 of 10 :)" | HK$0; won't start a trial |
| 8 Efua | yes | −1 (scoring page; number locked, then +1 "fair") | +2 (the Warm-up card decoding Kojo) | 4.5 | 5.0 | Honest, Clever, Respectful, Premium, Too technical | somewhat | the Warm-up card in the team chat | GH₵ 100–150 |

Ease 4.6 and appeal 4.7 on average (round 20: 4.6 and 4.6). Boring–exciting is again the lowest
pair: 3 or 4 in every run.

**Split it.**
- **Tech literacy.**
  - L1–L2 (Lau, Leila, Ellie): two keep for now, one is unsure (round 20: none of three).
  - L3 (Imran, Lotte, Omar): all keep.
  - L4–L5 (Thanh, Efua): keep. They are the only ones who could audit the maths, and one of them
    did (finding 1).
- **Stage.**
  - With a record: four of four keep.
  - Fresh: three of four keep, against one of four in round 20.
  - What changed for the fresh installs:
    - the first screen says what the app is for (four of four said so);
    - the Warm-up card is kept and shared (three of four sent it);
    - their own category made the first log theirs.
- **Age.**
  - Both under-16s want privacy from family: Omar from his mother, Ellie her worries. Both ran
    into adult defaults: office starter ideas, "thesis", and "log the next one the evening
    before" shown for a maths test.
  - Mrs Lau (73) keeps it for the daily practice.
- **Arrival.**
  - The friend's card (Efua) decoded and kept.
  - Family installs (Thanh 8, Lau 6) keep.
  - The counsellor's referral (Ellie) is the one unsure: the app speaks to work, not worries.
- **Culture.**
  - Modesty (Imran, Lau): share only privately, never publicly. This is the third round to say so.
  - A parent's or shared phone (Omar, and Imran's staff): hiding the words is welcome, but not
    enough (finding 5).

**The mood curve.** Dips in three or more runs:
- **The paid plan:** Omar, Ellie, Thanh and Lau.
- **The Brier line:** Imran, Lotte and Thanh.
- **The locked number and delete-and-retype:** Leila, Omar and Efua.

**Peaks to protect:**
- **The Warm-up result and card:** Omar, Ellie, Lau, Efua.
- **A first log under their own category:** Leila, Lotte.
- **Practice:** Leila, Lau.
- **Insights' method:** Thanh.

**Words.**
- **Counts:** Honest 8, Respectful 7, Calm 7, Too technical 6, Clever 4, Personal 2, Useful 2,
  then Kind, Fun, Premium and Judgemental 1 each.
- **Where the negative ones came from:**
  - Judgemental: Ellie's counted date fix.
  - Too technical: How scoring works, the Brier line, and the unexplained words (lean, Tracker,
    scored, rest day).

## Step 177, judged by new eyes

| Change | Verdict |
|---|---|
| The Warm-up's intro | **Works.** Four of four fresh installs said what the app is for from the first screen ("it says it in one sentence": Lau, Ellie). |
| Places and years first | **Works.** Cairo and African cities were smiles (Omar, Efua). Atomic numbers still came up for Lau (Warm-up question 6, then the practice). |
| The no-lean line in plain words | **Half works.** The counts landed for everyone. "Lean" is still a riddle (Omar: a wall; Lau and Leila: meat). "Your numbers expected about 8" reads as odd English to a teacher. |
| "+ New category" in Log and Edit | **The round's clearest win.** Six people made their own (🐾 My animals, 🐱 Pim, ✈️ Family & travel, Worries, Weather, and the health check's Pets) without leaving Log. A typed emoji became the icon: a smile in four runs. |
| Edit's note on the day it was made | **Understood, but the fix costs 13–19 taps** (finding 3). |
| Hide the words | **Found in seconds** (Imran, Omar), and it holds on Today, History, the range lists and the recap. One tap still shows everything, and a person's own category ("✈️ Family & travel") gives the subject away (finding 5). |
| The Warm-up card kept in Share | **Findable**, but behind a second button. Imran tried three places first. Its "Real predictions next." is stale after week one (finding 11). |
| The Brier line's meaning | **Lands with the statistician** (Thanh: "fairly put"). Imran needed three reads. To Lotte, "your numbers said less than your base rate would have" was still the harshest sentence (finding 6). |
| A friend's squares | **Works for the friend's-card arrival:** Efua decoded Kojo's card. **It is noise for everyone else:** Lau asked "what friend, what squares?" (finding 12). |
| No estimate one answer from unlocking | Nobody stumbled (Thanh). |
| "Last one recorded: can't tell." | Seen and understood (Lotte), but it stays up while the next card is answered (finding 14). |
| The eve delete counted | Read correctly (Imran). Its sibling, a due-date move, still counts a same-day typo fix (finding 2). |
| The recap's "N scored" | Nobody asked what the numbers were: a quiet success. |

## What held up

- **Honesty is the brand, again, in all eight runs.** Efua: "I can't fudge my number after the
  fact, which means Kojo couldn't either, so his 84 is real." The locked number frustrates people
  in the moment and wins their trust afterwards.
- **"About 7 times in 10" under every number:** "that is the Observatory's language" (Lau).
- **Interruptions cost nothing** in six of six, through the kept Log draft and the answer run.
  The Warm-up even kept Omar's place mid-quiz.
- **Your own record while you choose:** "Answered 6 times before: happened 4 of 6" (Thanh).
- **Tapping a range on the chart opens the exact predictions behind it:** "receipts" (Thanh,
  Imran).
- **The welcome back doesn't scold** (Lotte), and the streak can be hidden (Ellie, Lotte).
- **The paywall is trusted** even where it isn't wanted.

## Ranked findings

### P1: the record

1. **The rating is biased low at small counts, and the app reads the gap as the person's**
   (run 6, statistics expert). Simulated with the app's own formula (five bands, count-weighted
   absolute error), a perfectly calibrated person scores:

   | Answers | Mix | Mean | Middle 80% |
   |---|---|---|---|
   | 20 | Thanh's mix | **85** | 79–90 |
   | 20 | a typical 55–95% mix | 88 | — |
   | 50 | a typical 55–95% mix | 92 | — |
   | 100 | a typical 55–95% mix | 95 | — |

   So:
   - "Range by range, what you said averaged about 15 points away" puts on the person what is
     mostly sampling. With small ranges, absolute error is biased upward.
   - The badge bars sit on a compressed scale: 70, 85 and 90 at the low end, at 20, 50 and 100
     answers.
   - The grey bars handle this range by range; the headline number doesn't.
   - The unlock line "From here the number means something" says more than ±10 allows.

   **Needs the owner** (D24, D35, the badge bars). Options:
   - a chance reference beside the rating ("someone perfectly calibrated with your answers
     would typically score about 85 here");
   - a bias-corrected score;
   - keeping the score and rewording the line.

   Run `record-auditor` on whichever is chosen.
2. **A due date fixed on the day the prediction was made counts as a late move** (run 5). Ellie
   logged "I fail Monday's maths test" due tomorrow and moved it to Monday two minutes later.
   - Edit warned "the outcome may already be known".
   - Insights now keeps "1 prediction had its due date moved later".
   - "It felt like being called a cheat on day one" (−2).

   D61 (i) already exempts a delete on the day it was made; `postponementCounts` doesn't.
   **No decision needed:** exempt a move made on the prediction's own day, with the made day
   taken before this edit, so a rewording on the due day is still counted.

### P1: the first log, and the reason to come back

3. **Changing a number made minutes ago costs 13–19 taps** (runs 1, 4, 8; round 20 run 8). The
   note says what to do, but there's no button for it: Cancel, Delete, confirm, open Log,
   retype the words, choose the category again, set the number again. The due date resets to
   Tomorrow. Omar's streak row vanished while it was deleted. **Needs the owner:** a button on
   the day it was made, "Log it again with another number", that prefills the words, category
   and date and deletes the original. Deleting on the day made isn't counted (D61 (i)), and the
   number stays the record once a day has passed.
4. **Weeks before anything real, for the competitive and the curious** (runs 4, 8; round 20
   runs 3, 6, 7). "20 more scored answers" with the first answer a week out: Efua almost left
   there. The Warm-up card is the only day-zero payoff. **Needs the owner.**

### P2: trust and privacy

5. **Hidden words aren't private from someone who taps** (runs 2, 4).
   - One tap opens the words, with no lock.
   - A person's own category ("✈️ Family & travel") tells the story anyway.
   - **Needs the owner:** a Face ID or passcode lock is a native package (expo-local-authentication)
     and a new development build. Hiding added category names while the switch is on is a
     smaller step.
6. **The Brier line still stings** (runs 2, 3, 6). Its loss branch, "your numbers said less than
   your base rate would have", read as a put-down to Lotte; Imran needed three reads. Step 177's
   added sentence helped the reader who parsed it (Thanh). **Needs the owner:** shorter words,
   and whether to show it before the rating is past its noise (see finding 1).
7. **Ellie's screen reader** (run 5; mostly to confirm on the iPhone).
   - The ±5 buttons change the number silently: no announcement of the new value. **No decision
     needed:** announce "55%, 5 or 6 times in 10" after each step.
   - Focus falls to the page after Next, Save, Add and "Answer it now", and the slider isn't
     reachable by keyboard. Both are the web's (`docs/tooling-notes.md`); VoiceOver's adjustable
     on iOS is the real path. Check them with `/device-check`.

### P2: tone and identity

8. **A badge earned on a miss arrives with no word that it's new** (run 3; round 20 run 2).
   - A big "Forecaster in health" tile appears right after "No, I didn't sleep".
   - **No decision needed:** title it "New badge: Forecaster in health".
   - **Needs the owner:** whether to add "A No can earn one: badges follow how well your numbers
     match, not how often you're right."
9. **Unexplained words, every round** (runs 1, 4, 5, 7, 8): lean, run too sure, Calibrating,
   scored, rest day, Tracker, Getting started; band, range and "the 0–20% boxes" for one thing.
   **Needs the owner:** one vocabulary pass. Pick range or band, say "Getting started" means
   "fewer than 20", and gloss "lean".
10. **Defaults speak to office life** (runs 4, 5). Teenagers and a counsellor's referral met:
    - "my most important task" and "won't buy anything unplanned";
    - "thesis";
    - "the market";
    - "For something you do every day, log the next one the evening before" on a one-off maths
      test (D56's tip, shown for any same-day answer).

    **Needs the owner.**

### P2: sharing

11. **The Warm-up card is kept, but tucked away and stale** (runs 1, 2, 6, 7).
    - People looked in History, Practice and You before finding "Show my warm-up card".
    - Its footer, "10 questions. Real predictions next.", reads oddly six weeks or five months
      on.
    - **No decision needed:** drop the footer once there's a category card.
    - **Needs the owner:** a then-and-now card (Thanh: "Day 1 vs week 6").
12. **The friend's-squares line is noise for anyone who didn't come from a friend's card**
    (run 7). **Needs the owner** (D61 (d)): fold it behind "Got a friend's card?".
13. **The recaps miss the person's own story** (runs 2, 3, 6; round 20 run 4).
    - They lead with the next badge in a category the person barely uses.
    - They leave out a badge earned that week.
    - The year card leaves out the rating.
    - **Needs the owner.**

### P2: small breaks (no decision needed)

14. "Last one recorded: can't tell." stays up after the next card is answered, so two "recorded"
    lines show at once (run 3). Clear it when the next card's answer lands.
15. The recap's "Nothing under 40% this week" ignores an open 30% call logged an hour earlier
    (run 1). It counts answered calls only: say "answered".
16. A grammar slip in How scoring works and on the Warm-up result: "about 4 in 10 of them
    shouldn't" has no verb after it (run 7, an English teacher; Linda said the same in round
    14). Make it "shouldn't happen".
17. "About 9 times in / 10" breaks before the number; "Weather," leaves a comma dangling at a line
    end on the card; the card sheet's three tabs wrap at a large text size (runs 1, 7).

### P3: polish

18. **Small things in single runs:**
    - The chart's caption explains grey dots, not green, orange and blue (run 6).
    - The n= labels sit on their bars (runs 6, 8; recurring).
    - The chart joins dots even at n=1 (run 6).
    - "Hide the words on Today and History" is long enough that its switch drops below the label
      at 375 (run 3): shorten it to "Hide the words".
    - A starter idea's title says "tomorrow", which reads oddly on its due day (run 1).
    - The Save button names the date but not the number, so a fast tapper saved 55 for 85
      (run 4).
19. **Interrupted on the Warm-up result, Mrs Lau came back to Today**, with the result, "Share my
    result" and "make your first one about tomorrow" gone (run 7). **Needs the owner:** reopen
    the result until the first real prediction is saved.
20. **The paywall preselects the yearly trial** with "Start 1 month free" as the main button
    (runs 7, 8). "A free month that turns into a bill is the frightening kind" (Lau). **Needs the
    owner** (GROWTH §4).
21. **The recap's light card reads as the Plus Paper theme** (run 8). It's D33's free recap look,
    by design. **Needs the owner** only to revisit.

### Web-only, so not ranked

- Prices in dollars, including the store's "$2.49 a month" figure.
- The month-first date box.
- "Sharing isn't available" and the silent "Share as text".
- ⬜ drawn lilac.
- The details sheet hiding "with a reminder at 19:00" (`Platform.OS === 'web'`): Leila's and
  Ellie's reminder hunt.
- The slider's centre click.
- Focus to the page, every heading an `h1`, the nested switch, the unnamed loading progress bar.
- The "Due…" caption under the pinned Save bar mid-scroll.
- The History counts against the scrollbar, and the toast over "Share my card".
- The development-only row in You.

### Not verified (iPhone only)

- Reminders at 19:00, with and without words.
- The share sheet and the PNG.
- Local App Store prices and the trial.
- VoiceOver's adjustable slider, and whether ±5 is announced.
- Focus after sheets close.
- Real Dynamic Type for Leila and Mrs Lau.
- Ask to Buy on a parent's Apple ID (Omar).
- How the native date picker reads on a same-day fix.
