# Blind playtest, 2026-11-13 (c): appeal, a randomized cast

Raw findings, 2026-11-13. The twentieth round and the fourth appeal round, the first since step 176
(D60). Eight blind runs on the web build, cast and briefed by the appeal kit
(`docs/playtest-appeal.md`). Five people were drawn at random across every §10 axis and three
were cast to fill the appeal rules' gaps. All eight had never been cast before. Plan and briefs:
`round20-plan-2026-11-13.md`.

These are what the testers saw, checked against the code; they are not decisions. **The testers
are AI agents playing people:** the appeal answers show where groups part ways, never a market
number, and nobody's price or "disappointed" is a forecast. Where they differ, `CLAUDE.md`,
`DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

## Method

- **Build:** `builder/step-173-owner-picks` at `7135744` (= master), the web build on port 8097,
  started after that commit.
- **Health check** (`web-playtester`, before the blind runs): all PASS. A fresh install through
  the Warm-up, a first log and the Day-0 card; the `day1`, `return`, `threshold` and `long-time`
  profiles (the threshold unlock and the return welcome back included); the paywall opened and
  closed; 320 × 568. One note: the text share's App Store link carries no campaign token because
  `APP_STORE_PROVIDER_TOKEN` is unset (finding 27).
- **Between runs** the main session closed the page (so no CDP override or installed clock
  carried over), cleared the OPFS database and localStorage, set the run's locale and time zone
  through CDP (`Emulation.setLocaleOverride`, `Emulation.setTimezoneOverride`), its size and
  appearance, then loaded the profile on `/dev/seed`.
- **Clocks:** real time, except run 4 (Somchai, 09:30 Bangkok on Saturday, so "I ran this
  morning" fits), run 7 (Lakshmi, 20:00 Chennai, after the stall) and run 8 (Katrin, 14:00
  Berlin, installed before seeding). Nadia's brief said "late in the evening", not midnight.
- **Stand-ins:** Increase Contrast through `prefers-contrast: more` for Nadia; CSS zoom 1.15
  (Nadia) and 1.25 (Lakshmi), set by the tester. Bold Text has no web stand-in. Rim played a
  left thumb with mis-taps; she set the slider with synthetic touches at a point on the bar and
  entered her date mis-tap into the web date box.
- **Interruptions:** runs 2, 3, 4, 5, 7 (away to `favicon.ico` and back) and 6 (browser back).
- **One brief error:** Somchai's brief called the café's quarter overdue; in the `threshold`
  profile it's due in five days. He answered it "Not yet", which is right for what he saw.

### The cast

| # | Persona | Age | Tech | Region | Money | Found it | Taste | Mindset | Stage (profile) | Screen, locale |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Nadia, retired draughtswoman, Manchester (from Kharkiv) | 67 | L2 | UK, Ukrainian first | careful | a Facebook short | minimal | privacy-minded | the day after starting (`day1`) | 440 × 956 dark, Increase Contrast, zoom 1.15, en-GB |
| 2 | Youssef, lycée pupil, Casablanca | 16 | L4 | North Africa | pocket money | a French science podcast | warm | competitive | back after 3 weeks (`return`) | 320 × 568 light, en-MA |
| 3 | Callum, game programmer and carer, Cardiff | 23 | L5 | UK | comfortable | a TikTok | playful | anxious | fresh install | 375 × 812 dark, en-GB |
| 4 | Somchai, coffee roaster, Chiang Mai | 47 | L3 | Southeast Asia (kreng jai) | prepaid, careful | App Store search | plain | sceptical | one from unlocking (`threshold`) | 375 × 812 light, en-TH |
| 5 | Rim, pharmacy assistant, Tunis (wildcard) | 24 | L2 | North Africa | prepaid, tight | App Store search | plain | privacy-minded | fresh install | 390 × 844 light, en-TN |
| 6 | Mateo, fintech sales, Santiago | 31 | L4 | Latin America | comfortable | a friend's card | warm | social, curious | fresh install | 402 × 874 dark, en-CL |
| 7 | Lakshmi, flower seller, Chennai | 58 | L1 | South Asia | prepaid, tight | her son installed it | warm | curious, practical | fresh install | 390 × 844 dark, zoom 1.25, en-IN |
| 8 | Katrin, head of procurement, Hamburg | 51 | L4 | Western Europe | pays for premium | her executive coach | premium | practical | five months (`long-time`) | 440 × 956 light, en-DE |

The draws and their fixes are in the plan. New §10 rows: all eight.

## The persona table

| # | Persona | Verdict | Score | Five-second | If it disappeared |
|---|---|---|---|---|---|
| 1 | Nadia | unsure: "It is tidy and it is honest, but I don't know yet what it gives me, and if my son opens it, my blood pressure is the first thing he sees." | 6 | maybe | not |
| 2 | Youssef | keep: "Franchement it's honest and it talks maths to me, not like a kid, but right now it can't help me shut Amine up in the group." | 7 | yes | somewhat |
| 3 | Callum | unsure: "Honest little thing and it kept my stuff when Mum shouted, but it's a grey box that won't tell me anything about myself for six weeks." | 6 | yes | somewhat |
| 4 | Somchai | keep: "It doesn't praise me, it counts. I keep it for my running, but I won't pay dollars for a robot to read my numbers to me." | 7 | yes | somewhat |
| 5 | Rim | unsure: "I keep it until the wedding to beat Aziz, but if my brothers open it they read everything, so I'll write my guesses in code or I delete it." | 6 | maybe | not |
| 6 | Mateo | keep: "Me lo quedo un mes, aunque sea para callarle la boca al Nico." | 7 | yes | somewhat |
| 7 | Lakshmi | unsure: "Rain and jasmine I know better than anyone, but this app talks like my son's office." | 4 | maybe | not |
| 8 | Katrin | keep: "It told me in two minutes that my 'sure' is really 65%… but it won't let me fix a typo, and it can't give me one page to hand my coach." | 7 | yes | somewhat |

Median 6.5 (mean 6.25). Four keep, four unsure, nobody leaves. Five somewhat disappointed, three
not, none very.

## Usability

| Task kind | 1 Nadia | 2 Youssef | 3 Callum | 4 Somchai | 5 Rim | 6 Mateo | 7 Lakshmi | 8 Katrin |
|---|---|---|---|---|---|---|---|---|
| First look / is it any good | done 5 | done 6 | done 5 | done 6 | wrong turn 4 | wrong turn 4 | done 3 | done 6 |
| What it asks first (Warm-up, or what's due) | done 7 | done 6 | done 6 | done 7 | done 6 | done 6 | done 4 | done 5 |
| A real prediction from their life | done 6 | done 5 (3 to file under Foot) | done 5 | done 6 (Log it again) | done 5 | done 5 | done 5 | done 6 |
| Recovery (fix or remove a mistake) | done 7 | done 6 | done 6 | done 6 | done 5 | done 7 | done 5 | wrong turn 4 |
| Findability (privacy, record, scoring) | done 4 (son: 2) | done 5 | — | done 4 | **gave up** 3 | — | — | done 6 |
| Show or tell someone | done 4 | **gave up** 3 | done 5 | wrong turn 4 | done 5 | done 5 | wrong turns 3 | wrong turn 4 |
| Keep or pay | done 6 | done 6 | done 5 | done 5 | done 6 | done 6 | done 4 | done 5 |

Two gave up: Youssef at "something to show Amine" (nothing compares), Rim at "my brothers can't
read it" (no lock). **Under 5:** the show-or-tell task in five runs of eight, as in rounds 13
and 14; privacy for both shared-phone people; the first look for Rim, Mateo and Lakshmi (a quiz,
not what they came for); the Warm-up for Lakshmi (about 42 taps, six minutes at her pace); the
scoring explanation for Somchai; fixing a number for Katrin; the custom category for Youssef.

**Expectation mismatches named by two or more runs:**
- The warm-up result is gone once a real answer exists (Nadia, Lakshmi; Callum hunted for it).
- "No clear lean" where a verdict was expected (Callum, Rim, Lakshmi).
- No category for their life, so it went under Work or Personal (Youssef, Rim, Lakshmi, Nadia).
- A lock or hidden words inside the app for a shared phone (Nadia, Rim).
- The Brier line as a sting (Youssef, Somchai, Katrin).
- One-word title edits treated as new words (Callum, Lakshmi).
- Prices in dollars and dates month-first in the date field (most runs; web-only, below).

## Comprehension

Twenty-four answers: nineteen right, five partly, none wrong.
- Mateo read his friend's squares correctly once he had found the key. He also read "score 78,
  give or take 5" as "about 22 points off, and luck could make it 73 to 83", which is right.
- Somchai explained the give-or-take as resampling, like an AQI reading on a given day.
- Katrin and Youssef could say what the rating averages and how the ranges are weighted.

**Partly:**
- Nadia couldn't recall her quiz result and couldn't find it again (finding 3).
- Lakshmi kept "7 of 10" but not "no clear lean" (finding 2).
- She also wasn't sure the phone would remind her: the web build never asks, so it's web-only.
- Somchai and Katrin both guessed, without being told, that a badge can fall (finding 16).

## Appeal

| # | 5-sec | Low (where) | High (where) | Ease | Appeal | Five words | Disappointed | Post | Pay |
|---|---|---|---|---|---|---|---|---|---|
| 1 Nadia | maybe | −1 (paywall: dollars, AI, sign-in; nothing for her son) | +2 (practice's real heights) | 4.5 | 4.25 | Calm, Honest, Respectful, Clever, Too technical | not | no | £0; £5–10 once for a lock |
| 2 Youssef | yes | −1 (streak gone, the 95% miss, Brier, the card) | +2 (88 → 89; practice) | 4.75 | 5.0 | Honest, Clever, Respectful, Too technical, Useful | somewhat | not now; a story once Foot has a badge | ~50 MAD a year, for the green theme |
| 3 Callum | yes | −1 (typo warning; empty Insights) | +2 (draft kept; the Warm-up card) | 4.75 | 4.25 | Honest, Clever, Respectful, Useful, Cold | somewhat | the Warm-up card to the WhatsApp group | £0; £2–3 once for a theme |
| 4 Somchai | yes | −1 (note lost; Brier) | +2 (the quiet unlock; "happened 6 of 8") | 5.25 | 4.5 | Honest, Calm, Respectful, Useful, Too technical | somewhat | the year recap, privately, to his daughter | 0; ~300 THB once for a habit record |
| 5 Rim | maybe | −1 (no lock; paywall) | +2 (the Warm-up card) | 4.5 | 4.25 | Honest, Simple, Calm, Respectful, Too technical | not | the Warm-up card to her brother | 10 TND once |
| 6 Mateo | yes | −1 ("20 more scored answers") | +2 (9 of 10; the Warm-up card) | 5.0 | 5.0 | Honest, Clever, Fun, Respectful, Cold | somewhat | the Warm-up card to the group | ~10.000 CLP a year |
| 7 Lakshmi | maybe | −2 (atomic numbers at Q2; the paywall) | +2 (the Warm-up card) | 3.5 | 4.25 | Too technical, Intimidating, Honest, Respectful, Calm | not | shown to her son only | ₹0 |
| 8 Katrin | yes | −1 (Brier; Edit won't take her number) | +2 ("about 65% would have matched") | 4.75 | 5.0 | Honest, Useful, Respectful, Calm, Too technical | somewhat | the year recap to her coach only | ~€20 a year; €30 or €60 once with a concrete Coach |

Ease is the mean of the first four pairs and appeal of the last four. Boring–exciting was 3 in seven
runs and 4 in one: the lowest pair again, as in rounds 13 and 14.

**Split it.**
- **Tech literacy.**
  - L1–L2 (Lakshmi 4, Nadia 6, Rim 6): nobody keeps; ease 3.5–4.5. All three reached the Warm-up
    result. Two were lost on privacy, and one (Lakshmi) on the Warm-up's content.
  - L3 (Somchai 7): keeps.
  - L4–L5 (Youssef 7, Callum 6, Mateo 7, Katrin 7): three keep. What they lack is a way to
    compare (Youssef, Mateo) or a summary (Katrin), not understanding.
- **Stage** splits more cleanly than age.
  - With a record (Nadia, Youssef, Somchai, Katrin): three of four keep.
  - Fresh installs (Callum, Rim, Mateo, Lakshmi): one of four keeps.
  - For fresh installs, the only reward on day one is the Warm-up card, and the rating is "20
    more" away.
- **Age.**
  - Under 26 (Youssef, Callum, Rim): one keeps. All three want to compare with someone.
  - 26–60: three of four keep; Lakshmi is the exception.
  - Over 60 (Nadia): unsure, on privacy.
- **Arrival.** The short videos (Nadia, Callum) promised "you're overconfident" and got "no clear
  lean": both unsure. App Store searchers split. The friend's card (Mateo) kept, but he had to dig
  for the squares. Family-installed (Lakshmi) is the round's low.
- **Culture.**
  - Modesty (Somchai, Lakshmi): neither would post publicly. Both would share privately with a
    child.
  - The two North Africans both wanted head-to-head with a sibling or friend.
  - Both shared-phone households (Nadia's son, Rim's brothers) asked for a lock.

**The mood curve.** Dips in three or more runs (P1 by the kit's rule):
- **The paid plan:** Nadia −1, Rim −1, Lakshmi −2.
- **The Brier line:** Youssef, Somchai and Katrin, −1 each.
- **"20 more" and the empty Insights:** Callum, Mateo and Lakshmi, −1 each.
- The Warm-up's "says nothing either way" took the win away for Callum, Rim and Lakshmi (0, 0
  and −1).

**Peaks to protect:**
- **The Warm-up card** ("9 of 10 right. I was 84% sure. How sure are you?"): +2 for Callum, Rim,
  Mateo and Lakshmi. It is the round's most-shared thing.
- **Practice:** +2 for Nadia and Youssef.
- **What each answer did:** "rating moved 88 → 89" and the quiet unlock, +2 for Youssef and
  Somchai.
- **The track record under the slider:** Youssef (it moved his number), Somchai (+2) and Katrin
  ("the feature").
- **The kept draft:** +2 for Callum.

**Words.**
- **Counts:** Honest 8, Respectful 8, Too technical 6, Calm 5, Clever 4, Useful 4, Cold 2,
  Simple 1, Fun 1, Intimidating 1.
- **Where the negative words came from:**
  - Too technical: How scoring works and the Insights footnotes, for the four second-language
    readers and Katrin.
  - Cold: Callum's grey card, and Mateo's view of the look.
  - Intimidating: Lakshmi's Warm-up.

## Step 176 in passing

- **Reminder words off by default.** Four people smiled at it: Nadia, Somchai ("my staff won't
  read 'I drink no alcohol'"), Rim and Mateo. Callum (ADHD) objected: "You said 70%" won't tell
  him which one it is (finding 22).
- **"Save and log another" keeps the category.** Liked by Youssef, Rim and Mateo. Callum noticed
  he could mis-file the next one without looking.
- **"Surest call that didn't happen".** Read, but it headlined a 95% miss for a 16-year-old who
  won't post it (Youssef). For Katrin it meant nothing until she turned the titles on.
- **The Can't tell note** ("until the end of Sat, Nov 14") puzzled Youssef: why tomorrow, on
  something due three weeks ago? It is D45's correction-window floor, but he wasn't told that.
- **The squares key** in How scoring works is where Mateo finally read his friend's card. It's
  the last section of a long page (finding 6).
- **The badge-drop line** wasn't met. No run lost a badge.

## What held up

- **Honesty is the brand, across all eight.** "It doesn't praise me, it counts" (Somchai) and
  "talks maths to me, not like a kid" (Youssef). Katrin: "a mirror for my gut".
- **"About 7 times in 10" under the number** was named by six runs as the line that made a
  percentage mean something.
- **The track record while choosing** changed two numbers on the spot (Youssef 70 → 65, Katrin
  90 → 70):
  - "Of your 27 scored calls at 60–80%, 17 happened";
  - "Answered 8 times before: happened 6 of 8".
- **Interruptions cost nothing in Log.** "Kept from before you left" brought back three
  half-typed predictions (Callum, Rim, Mateo). Saved work survived every interruption (Youssef,
  Lakshmi), and the answer run kept Katrin's place.
- **Delete, Edit and the date** were all done first time:
  - the delete confirmation;
  - Edit's "The number you said stays as it is: it's the record";
  - "Save, due Monday".
- **The unlock was quiet and serious** ("From here the number means something"). The answer
  run's "rating moved from 87 to 88" was liked by every run that saw it.
- **The paywall is trusted even where it isn't wanted.** People named "Plus adds interpretation,
  not access", the renewal reminder and the easy "Not now".
- **Privacy where it exists was noticed and praised:**
  - "Your predictions live only on this phone";
  - the digest never shows words;
  - recap titles off by default.
- **Nothing broke** at any size in any run.

## Ranked findings

Earlier rounds' numbers are kept where a finding repeats ("R14 #5").

### P1: lost before the first reward

1. **The Warm-up is someone else's school** (run 7, L1; R14 #4; runs 3, 5 and 6 called it trivia,
   kindly). Atomic numbers at question 2 nearly lost Lakshmi, a flower seller whose son
   installed it because "you know when the rain will come". Aconcagua, the Louvre and the Gold
   Rush are Western school knowledge in English. Her 7 of 10 felt like luck, and it taught her
   nothing about her own knowing. Rim's five-second read was "a geography quiz, not the family
   thing I searched for". **Needs the owner** (D18: the fixed ten; an everyday set; a first
   screen that says what the app is for before question 1).
2. **"No clear lean" is the honest answer and it reads as a shrug** (runs 3, 5, 7; R14 #5).
   Callum came from a TikTok promising "you're more overconfident than you think" and got 9 of
   10 and "it says nothing either way yet". For Rim and Lakshmi, "lean" means meat or thin. "You
   expected about 6 right" put a number in Lakshmi's mouth she never said. **Needs the owner**
   (D36's wording; lead with the counts in plain words for the L1–L2 reader).
3. **The Warm-up result disappears once a real answer exists** (runs 1, 7; Callum hunted). The
   share card swaps it for the "Calibrating" card after the first answer (`ShareCardPanel`,
   `card ? null : warmupCardCopy`). Nadia couldn't recall or show hers on day 2. Lakshmi found
   it only through "Share my card" at the bottom of Insights, under the Plus box. It is the most
   shared thing in this round. **Needs the owner** (keep it findable: in You, or beside the
   card).

### P1: no reason to come back (fresh installs)

4. **Nothing about me for weeks** (runs 3, 6, 7; R13). "20 more scored answers" is a −1 for three
   people. For Lakshmi it raised "is that 20 days?". Callum: "at three a week that's six weeks".
   Fresh installs kept at one in four, against three in four with a record. **Needs the
   owner.**
5. **No way to compare with a friend** (runs 2, 5, 6; R14 Dev). Youssef gave up on "show Amine I
   call better". Rim came because she argued with her brother. Mateo can't answer Nico's card
   for weeks. All three under 32, and all three asked for the same thing unprompted: both give a
   number on the same event, and see who's better calibrated. **Needs the owner** (a social
   feature is new scope; GROWTH §0).
6. **A friend's card isn't explained where an arrival looks** (run 6; R14 #6 partly fixed by
   D59's key). The key is in the text, but what the squares *are* is the last section of How
   scoring works. Mateo took 2 minutes and 5 taps. **Needs the owner** (a line on the Warm-up
   result or Today for someone who has never seen a card).

### P2: trust and privacy

7. **No lock and no hidden words inside the app on a shared phone** (runs 1, 5; earlier Rahel,
   Aisling, Carol).
   - The newest prediction sits word for word at the top of Today.
   - Nadia reworded "blood pressure" into "Morning number". Rim gave up and will "write in code
     or delete it".
   - Both L2, both privacy-minded, both in households where the phone is picked up.
   - Reminder words being off (D60) was praised, and it covers only the lock screen.

   **Needs the owner** (Face ID / passcode lock, or a "hide titles on Today" switch).
8. **The paid plan dips three runs** (runs 1, 5, 7).
   - Dollars on the web (web-only, below), but also the price level: about 93 TND or ₹2,500 a
     year.
   - For Lakshmi, the free month that converts reads as "the TV-channel trap my neighbour fell
     in".
   - Coach needs a sign-in and sends numbers to OpenAI: Nadia and Somchai didn't want that.
   - Katrin (premium) wants to see Trends before paying, since Insights already tells her what
     her 80% means.

   **Needs the owner** (regional pricing P1; a Trends preview).

### P2: tone and identity

9. **The Brier line is the app's harshest sentence, and a footnote** (runs 2, 4, 8). "Saying 64%
   every time… would score about the same" under an 87 read as "my judgement adds nothing"
   (Katrin) and "a parrot does as well as me" (Somchai). It never says whether that's normal or
   what to do. It is a dip for all three who read it. **Needs the owner** (D35/D59 wording;
   whether to show it on the unlock day).
10. **No category for their life** (runs 1, 2, 5, 7; R14 Ramón).
    - Football, family, weather and the flower market went under Personal or Work. ESOL
      homework went under Work and showed a Work chip on Nadia's card.
    - Adding one means a trip to You → Categories, then moving each prediction: 19 taps for
      Youssef.

    **Needs the owner** (add a category from Log's chips; widen the built-ins).
11. **Insights opens on a wall of grey footnotes** (runs 2, 4, 8; How scoring works also for runs
    1, 4, 6). Seven lines before the chart sit under the 87:
    - the badge marks;
    - range by range;
    - the give-or-take;
    - Brier;
    - Can't tell;
    - same-day;
    - streak.

    Katrin: "like the footnotes in an audit report". Somchai: "the app talks too much here".
    **Needs the owner** (collapse the footnotes under one "About this number").
12. **The recaps lead with what's missing, not what was done** (run 4).
    - In the week Somchai became Forecaster in health, both recaps led with "To reach Tracker
      or higher in work: 20 more", a category he doesn't use.
    - Youssef's week card headlined his 95% miss.
    - Katrin couldn't tell whether the year card's "Social 20 · Health 55" were scores or counts
      (they're scored answers; the chips show a bare number).

    **Needs the owner.**
13. **Corrections feel like being caught** (runs 2, 3, 7, 8).
    - **Youssef:** a mis-tapped No got a badge celebration. "Change answer" then removed both
      the badge card and the rating line (D50, D60 by design). "For two minutes I thought
      being honest had cost me Forecaster."
    - **Callum and Lakshmi:** a one-letter typo fix warns that it becomes a new prediction, and
      leaves "Words changed" for good (D45's titleKey ignores case and punctuation, not
      spelling).
    - **Katrin:** she mistyped 90 for 70 and found no way to fix it but delete and retype.

    **Needs the owner** (D50: a neutral "Your badge is unchanged" after a correction; D45: a
    grace period or a one-character tolerance; Edit could at least say "to change the number,
    delete it and log it again", see 24).
14. **A note typed after an answer is lost if the app is left, and can't be added later** (run 4).
    Somchai's "Ran 5 km, air OK today" was his reason to keep notes. **Needs the owner** (keep
    the reflection as a draft like Log's; let an answered prediction take a note).

### P2: sharing and worth

15. **What to show someone** (five runs under 5).
    - The card leads with the best category. Katrin: "Finance's weakness hides behind Tracker".
    - The card is grey without paid themes (Callum).
    - It's about health in a football group (Youssef).
    - What people actually shared:
      - the Warm-up card, to a friend or sibling (Callum, Rim, Mateo);
      - the year recap, privately to a child or a coach (Somchai, Katrin).
    - Two asked for a page the card isn't:
      - a one-page summary for a coach (Katrin);
      - "Running: 6 of 8, this month and last" for a daughter (Somchai).

    **Needs the owner.**
16. **Nowhere says a badge can fall** (runs 4, 8). D60 says it on the answer that drops one. How
    scoring works' Badges section explains the bars but not that a badge follows the record both
    ways, so both guessed. **No decision needed:** add D60's sentence to the Badges section.

### P2: what's wrong on the screen (no decision needed)

17. **"1 answers scored so far"** in the text share (run 1): `cardCopy.ts:287` has no singular.
18. **The year card contradicts itself when the averages match** (run 4). "70% confident on
    average, and 70% happened. On 20 answers, luck often moves it that far." This happens when the
    averages agree but a well-evidenced band is more than 5 points off (`wrappedCopy.ts`
    `noLean()`). "That far" points at a gap of zero. Say the band's gap, or drop the luck clause
    when the averages are within 5.
19. **Today contradicts itself one answer from the unlock** (run 4). "1 more scored answer and
    your score unlocks. One is ready to answer now." sits beside "At your recent pace, about 2
    days (around Nov 16)". Hide the pace line when the answers ready now would unlock the rating.
20. **The reminder example is in US date order** (runs 1, 3). You's line is "like 'Your
    prediction from Nov 6 · You said 70%'" (`SettingsView.tsx:283`), while a real reminder uses
    the phone's format ("6 Nov" in en-GB). Build the example with the same date call.
21. **"Can't tell" in an answer run moves on with no visible "Recorded"** (run 2). Yes and No show
    "Recorded: it happened". A skip is only announced to VoiceOver, so Youssef wasn't sure it
    saved.

### P3: polish

22. **Wordless reminders don't say which prediction** (run 3). "Your prediction from 13 Nov · You
    said 70%" names nothing when two were made the same day at the same number. Callum (ADHD)
    would swipe it away. **Needs the owner** (D60 (b): add the category, which is the person's
    own word only when they named it).
23. **The chart** (run 1, 440 at zoom 1.15): the 100% dot is drawn half above the plot frame,
    and the 60–80% grey bar runs through the "Overconfident" label. The left axis has no "%". The
    "n=" labels sit on their bars (runs 2, 4, 8). **No decision needed.**
24. **Edit doesn't say how to change a number** (run 8). "The number you said stays as it is:
    it's the record." could add "To change it, delete this one and log it again." **No decision
    needed** (it describes what's already possible).
25. **Day 0's streak and "Goal: 1 of 3"** read as a duty nobody chose (runs 1, 7; R13). **Needs
    the owner.**
26. **Small things.**
    - "This week: It comes due in the next 7 days" for one due tomorrow (run 7).
    - The −5 and +5 steppers sit 8 pt apart, tight for a left thumb (run 5).
    - No visual "juice" on save (run 3; haptics untested on web).
    - "Band by band" in How scoring works against "Range by range" on Insights, two words for
      one idea (runs 2, 4; deliberate per `ratingMeaningLine`'s `unit`; **needs the owner** to
      pick one).
27. **The share link carries no campaign token** (health check). `appStoreLink` adds `ct=` only
    with a provider token, and `APP_STORE_PROVIDER_TOKEN` is unset, so shares can't be counted
    per surface. **Needs the owner** (the token from App Store Connect).

### Web-only, so not ranked

- Prices in dollars (StoreKit gives local prices).
- The date field's month-first "11/14/2026" (iOS uses the native picker in the region's
  order).
- "19:00" in copy beside "07:00 PM" in the time field (`docs/tooling-notes.md`).
- "Sharing isn't available on this device" and "Share as text" doing nothing visible.
- The web switch's low-contrast off state and clipped-looking knob (Nadia).
- ⬜ drawn lilac by the browser's emoji font.
- The slider landing on 75 or 50 when the tool clicks its centre (Callum, Mateo: a click tool
  hits the element's middle; a finger taps where it lands, and `WARMUP_TAP_TIP` says so).
- No reminder prompt on Today: the web can't send notifications, so `ReminderPrompt` hides
  itself, and Lakshmi wasn't sure the phone would remind her.
- The "leave site?" dialog and the scrollbar jump.
- The development-only "Test data" row in You (behind `__DEV__`).
- Lakshmi's "not set yet" half under the Next bar at zoom 1.25.
- Rim's "Due…" line under the Save bar mid-scroll.
- Katrin's toast briefly over "Share my card" and the History chip row clipped at "Pe…" (it
  scrolls).

### Not verified (iPhone only)

- Reminders: whether the lock screen really hides the words, and Happened / Didn't with the words
  on.
- The share sheet and the exported PNG.
- Local App Store prices (₹, TND, CLP, THB, €) and the trial.
- The native date picker for Rim's Sunday.
- Dragging the slider.
- Haptics on save and answer.
- Bold Text and real Dynamic Type for Nadia and Lakshmi.
- Whether iOS keeps Resolve's note across an app switch (Somchai's loss was a web reload).
