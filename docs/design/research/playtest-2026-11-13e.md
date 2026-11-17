# Blind playtest, 2026-11-13 (fifth): appeal on step 178, a diversified cast

Raw findings, 2026-11-13. The testers are AI agents playing people, so their scores, prices and
"disappointed" answers show where groups part ways and which words land or sting; nobody's price
or "disappointed" is a forecast. Where they differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and
`UI_ROADMAP.md` win.

Round 22, the sixth appeal round. Plan: [`round-plans.md`](round-plans.md#round-22). Build:
`builder/step-178-owner-picks` at `cc1235d` (step 178, D62).

## Method

- **Health check:** `web-playtester` passed every start state at 390 × 844: a fresh install
  through the Warm-up, the "While you wait" row and the Warm-up result row on Today, the friend
  fold, the five profiles, "Use another number" end to end, hiding the words, Plus. No console
  errors from app code.
- **The cast:** six drawn at random across every §10 axis with a step 178 feature each, two cast
  to fill the appeal rules (L1 and L2, a family install, a bettor). All eight new to the cast. The
  draws and their fixes are in the plan.
- **Between runs:** the page closed, the database and localStorage cleared, the locale and time
  zone set through CDP, a clock installed before seeding, the profile loaded, and from run 2 the
  history replaced so a back press can't reach the seed page.
- **Stand-ins:** Voice Control as names only (run 1); fatigue as slow reading (run 2); page zoom
  1.25 (runs 3, 7); `prefers-contrast: more` (run 4); the accessibility tree and keyboard only
  (run 6); a slow phone and data (run 8, CPU 4× and slow 3G, which the tester never felt: not
  verified).
- **Harness incidents:** run 1's back press reached `/dev/seed` (fixed for runs 2–8); in run 4
  the page went blank mid-run and came back without the clock and time zone, so its streak read
  1 instead of 6 after that (not ranked); the `return` profile already has an unlocked rating, so
  Tharani met the perfect line, not the first look; the demo records don't fit runs 4 and 6
  (an office worker's predictions on a 16- and a 17-year-old's phone).

| # | Persona | Age | Tech | Region | Language | Arrival | Stage (profile) | Screen | Locale, zone |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Shigeru, retired actuary, camera shop, Osaka | 68 | L3 | East Asia (modesty) | fluent second | a podcast | a daily habit (`habit`) | 390 × 844 light, Voice Control | en-JP, Tokyo, 21:30 |
| 2 | Tharani, data-science student after burnout, Colombo | 31 | L5 | South Asia | careful third | an article | back after three weeks (`return`) | 440 × 956 light, fatigue | en-LK, Colombo, 23:50 |
| 3 | Dawit, actuarial student, Dublin, Eritrean-born | 21 | L3 | UK and Ireland | careful third | his sister | one from unlocking (`threshold`) | 402 × 874 light, zoom 1.25 | en-IE, Dublin |
| 4 | Nafisa, Class 10, Dhaka | 16 | L4 | South Asia | dyslexic | a podcast | first week (`first-week`) | 320 × 568 light, more contrast | en-BD, Dhaka, 19:40 |
| 5 | Rêbaz, junior civil engineer, Erbil | 24 | L4 | Middle East | careful third | a friend's card | fresh | 440 × 956 dark | en-IQ, Baghdad, 23:40 |
| 6 | Jaylen, high-school senior, blind, Sacramento | 17 | L3 | US | native | his debate coach | five months (`long-time`) | 390 × 844 dark, screen reader | en-US, Los Angeles |
| 7 | Yolanda, fruit stall, Lima | 54 | L1 | Latin America | plain-language (Spanish) | her nephew | fresh | 375 × 812 light, zoom 1.25 | es-PE, Lima, 07:30 |
| 8 | Wanjiru, two matatus, bets on football, Nairobi | 47 | L2 | Sub-Saharan Africa | fluent second | App Store search | fresh | 375 × 812 dark, slow phone | en-KE, Nairobi, 20:15 |

## The persona table

| # | Persona | Verdict | Score | Five-second | If it disappeared |
|---|---|---|---|---|---|
| 1 | Shigeru | keep: "It counts honestly, it is modest about small samples, and it showed me my '90% I will walk' is really nearer 77%." | 7 | yes | somewhat |
| 2 | Tharani | keep: "It didn't punish me for disappearing and it tells me the truth about my 90%s, but at midnight it talks too much and it ate my words once." | 7 | yes | somewhat |
| 3 | Dawit | keep: "It's honest with me even on a lazy morning, and it wrote my Tigrinya without breaking." | 7 | yes | somewhat |
| 4 | Nafisa | unsure: "'Words hidden, open it to see them' is basically an invitation for Rafi, so I'd only write boring things in it." | 6 | maybe | somewhat |
| 5 | Rêbaz | keep: "I'll keep it until I beat Saman's 84." | 7 | yes | somewhat |
| 6 | Jaylen | keep: "It tells me I'm cocky at the top end with actual receipts, and it doesn't talk down to me. Now make it say something when I tap Yes." | 7 | yes | **very** |
| 7 | Yolanda | unsure: "El jueguito me gustó, saqué 10 de 10, pero todo está en inglés y lo de los dólares me asusta." | 6 | yes | somewhat |
| 8 | Wanjiru | unsure: "It's not tips, it's a mirror for my 'sure'. I'll keep it until Saturday night." | 6 | maybe | not |

**Overall:** median 7 (mean 6.6). Five keep, three unsure, nobody leaves. One "very
disappointed", the first in any appeal round (Jaylen, five months in: "five months of receipts").

**Against round 21** (median 6.5, seven keep, all somewhat): with a record, four of four keep
again; fresh installs fell back to one of three (round 21: three of four), and both L1–L2 runs are
unsure.

## Usability

| Task kind | 1 Shigeru | 2 Tharani | 3 Dawit | 4 Nafisa | 5 Rêbaz | 6 Jaylen | 7 Yolanda | 8 Wanjiru |
|---|---|---|---|---|---|---|---|---|
| First look | done 6 | done 6 | done 6 | wrong turn 4 (a cousin's week) | wrong turn 4 (Saman's 84) | done 6 | done 5 | done 6 |
| What it asks first, or what's due | done 6 | done 6 | done 7 | — | done 6 | — | done 5 | done 6 |
| A prediction from their life | done 6 | — | done 5 (Tigrinya, own category) | done 5 (own category) | done 6 | — | done 6 | done 5 (own category) |
| Recovery: another number | done 6 | **wrong turn 3** (typed words lost) | — | done 5 | — | — | — | done 5 |
| Findability | done 5 (perfect line), 5 (hide) | done 4 (perfect line), 6 (note) | **wrong turn 4** (the badge) | **gave up 3** (hide own category) | done 5 (friend fold) | done 6 (perfect line, fine print), **3** (badge changes) | done 7 (Warm-up result again) | **3** (what it's good for) |
| Show or tell | done 4 | done | done 5 | done 5 | done 5 | done 5 | done 5 | done 5 |
| Keep or pay | 6 | 5 | 6 | 4 | 6 | 6 | 4 | 6 |

**Gave up:** one (Nafisa, hiding her own category's name). **Under 5 on ease:**
- **Hiding from someone with the phone:** Nafisa 3, Shigeru 5.
- **What it's for, to a bettor:** Wanjiru 3.
- **Badge changes:** Dawit 4 (on the unlocking answer), Jaylen 3 (a week's changes).
- **Rewording, then another number:** Tharani 3.
- **What now, after the first save:** Yolanda 4.
- **The rest:** Saman's message (Rêbaz 4), a shared week (Nafisa 4), the perfect line (Tharani
  4), the paywall (Nafisa 4, Yolanda 4), showing a grandson (Shigeru 4).

**Expectation mismatches named by two or more runs:**
- Edit "won't change the number" and then "can still use another number": read as a no and a
  yes (Shigeru, Nafisa, Wanjiru); "a change on the day it was made isn't counted": counted as what
  (Nafisa, Wanjiru).
- Hide the words still shows the person's own category off the cards (Shigeru, Nafisa), and one
  tap shows everything.
- How scoring works is a wall where a short answer was wanted (Tharani, Dawit, Rêbaz, Yolanda,
  Wanjiru).
- ±5 taps to a high number (Shigeru, Dawit, Nafisa, Rêbaz).

## Comprehension

Twenty-three of 24 end answers right, one partly (Nafisa couldn't say what the trial turns into:
the web build shows no trial).
- **The perfect line**, all four who met it: Shigeru ("95, not 100, is the realistic best for my
  sample; the part beyond those ~5 points of luck is real"), Tharani, Dawit ("at 20 answers it
  can't tell me apart from perfect"), Jaylen ("about 8 of the 13 points I'm missing are on me").
- **Another number:** Shigeru, Nafisa and Wanjiru each said the first was replaced and not
  counted.
- **The badge on a miss:** Dawit ("I earned it by being honest, not by running"); Tharani smiled
  at it.
- **First look:** Dawit, "the raw count… the rating sorts my answers into ranges".
- **The friend's card:** Rêbaz decoded Saman's squares and his 84, but only after How scoring
  works.

## Appeal

| # | 5-sec | Low (where) | High (where) | Ease | Appeal | Five words | Disappointed | Post | Pay |
|---|---|---|---|---|---|---|---|---|---|
| 1 Shigeru | yes | −1 (perfect line beside "give or take 10"; the card) | +2 (practice) | 5.0 | 5.0 | Honest, Respectful, Trustworthy, Calm, Clever | somewhat | nothing online; the warm-up card to his grandson in person | ~¥1,000 a year |
| 2 Tharani | yes | −2 (typed words lost) | +2 (a badge on a miss) | 4.25 | 5.0 | Honest, Respectful, Calm, Too technical, Useful | somewhat | privately to her friend | ~LKR 1,500 |
| 3 Dawit | yes | 0 (the miss, fairly) | +2 (unlock, insights, his Tigrinya saved, the week recap) | 5.0 | 5.0 | Honest, Clever, Calm, Respectful, Useful | somewhat | to his sister on WhatsApp | €0–10 |
| 4 Nafisa | maybe | −2 (one tap reveals) | +2 (practice) | 4.5 | 4.25 | Honest, Clever, Useful, Respectful, Cold | somewhat | the warm-up card to her best friend | 200–300 taka |
| 5 Rêbaz | yes | 0 | +1 (quiz, first save, card) | 5.25 | 5.25 | Honest, Clever, Useful, Fun, Too technical | somewhat | the warm-up card to the group, as a reply | 5–10k IQD |
| 6 Jaylen | yes | −1 (the Brier line) | +2 (first screen) | 4.75 | 5.25 | Honest, Clever, Useful, Respectful, Too technical | **very** | the card in the debate group chat | ~$15; parents would pay |
| 7 Yolanda | yes | −2 (the paywall) | +2 (10 of 10; the card) | 4.25 | 5.0 | Fun, Kind, Clever, Honest, Too technical | somewhat | the warm-up card on Facebook | 0 (10 soles in Spanish) |
| 8 Wanjiru | maybe | −1 (Insights; "luck") | +2 (the card) | 4.5 | 4.5 | Honest, Clever, Respectful, Calm, Too technical | not | the warm-up card to her brother and family | ~KSh 1,000 |

Ease 4.7 and appeal 4.9 on average (round 21: 4.6 and 4.7). Boring–exciting is again the lowest
pair, 3–5 (mean 3.9).

**Split it.**
- **Tech literacy.**
  - L1–L2 (Yolanda, Wanjiru): both unsure (round 21: two of three kept for now).
  - L3 (Shigeru, Dawit, Jaylen): all keep.
  - L4 (Nafisa, Rêbaz): one each.
  - L5 (Tharani): keep.
- **Stage.**
  - With a record (Shigeru, Tharani, Dawit, Jaylen): four of four keep, one very disappointed.
  - First week (Nafisa): unsure.
  - Fresh (Rêbaz, Yolanda, Wanjiru): one of three keeps (round 21: three of four).
- **Age.** The teenagers split: Jaylen keeps (very disappointed), Nafisa is unsure (privacy at
  home). The over-65 keeps.
- **Arrival.** The friend's card (Rêbaz) keeps, to "beat" the friend; App Store search for a
  "prediction app" (Wanjiru) found something else and is unsure.
- **Culture.** The modest (Shigeru, Tharani) share privately or in person only: "'Forecaster in
  health' is boasting, and it is my health."
- **Money.** Nobody would pay today's price. Offers ran from nothing to about $15 a year (Jaylen,
  whose parents would pay).

**The mood curve.**
- **Peaks:** the practice (Shigeru, Nafisa +2, Wanjiru +1); the Warm-up result and its card
  (Yolanda, Wanjiru +2); a badge earned on a miss (Tharani +2); the unlock (Dawit +2).
- **Dips in three or more runs:** How scoring works and Insights as walls of text (Tharani,
  Rêbaz, Yolanda, Wanjiru); hiding that doesn't hide (Shigeru 0, Nafisa −2). The paywall dipped
  only for the prepaid L1 (Yolanda −2).
- **Smiles:** "A week is too short for a verdict" (Shigeru); "5 or 6 times in 10" (five runs);
  the "⚽ Football" example and "It rains here tomorrow" (Rêbaz, Wanjiru, Yolanda); Tigrinya and
  Sorani rendered whole (Dawit, Rêbaz); "Show the counts" read as a table (Jaylen).

**The words.** Honest 8, Clever 7, Respectful 6, Too technical 5, Useful 5, Calm 4.

## Step 178, judged by new eyes

- **Worked:**
  - **The perfect line:** all four who met it understood it, and nobody read it as a second score.
    Dawit: "it didn't oversell me." Jaylen found it on the first try.
  - **"Use another number":** found by everyone who needed it, 5–6 on ease, the first one gone.
  - **The Warm-up result on Today:** Yolanda, interrupted on it, found it again in one tap (7).
  - **The first look:** Dawit read it as counts, not a rating.
  - **Notes after an answer:** Tharani and Dawit both added one (6).
  - **Badge news on the recap:** the only place Jaylen learned "New this week: Sharp in health".
  - **"New badge:" on a miss:** "it really does reward honesty" (Tharani).
  - **The new starter ideas and the "⚽ Football" placeholder:** smiles in three runs.
- **Half worked:**
  - **Hide the words:** hides the cards, but not the person's own category elsewhere, and a tap
    shows all (finding 1).
  - **The friend fold:** found, but it explains the squares, not the score (finding 9).
  - **The fine print:** found by Jaylen; "Hide the fine print" is a second name (finding 12).
  - **The badge line:** its sentence runs into the tagline with no full stop (finding 13).
- **Not met:** a late rewording counted (no open prediction due tomorrow in the profiles); the
  habit tip on a repeat; the trial button (the web build shows no trial).

## What held up

- **The core loop for people with a record:** four of four keep, and comprehension is near
  perfect; "Answered 22 times before: happened 17 of 22" moved Shigeru's number, as it did in
  earlier rounds.
- **Interruptions:** every reload or pause kept the person's place and work (the Log draft, the
  run's answers, the Warm-up result).
- **Other scripts:** Tigrinya (Ge'ez), Sorani (right to left) and Spanish dates rendered whole.
- **Honesty lands:** "Honest" from all eight, "a 60% call that doesn't happen isn't a mistake"
  quoted in three runs.

## Ranked findings

### P1: the record and privacy

1. **Hide the words leaves the person's own words in view** (runs 1, 4).
   - With the switch on, Nafisa's "📚 SSC exam" still shows on Log's category chips, Insights'
     badge rows, Categories and the share card; Shigeru's "Recovery" on Insights and the card;
     the recap's "Show prediction titles" switch still flips and shows titles.
   - "Words hidden. Open it to see them." invites the tap, and one tap shows everything, with Edit
     and Delete.
   - Built-in names ("Forecaster in health" on Today) stay by design (D62 (d)), and told Shigeru's
     daughter-in-law about his heart.
   - **No decision needed:** apply D62 (d)'s rule wherever a name the person chose is shown read-only
     (Insights' badge rows and furthest-off line, the share card's chips, the recaps), and keep the
     recap's titles switch off while hiding. **Needs the owner:** Log's chips (choosing needs the
     name), the card's wording ("Open it to see them"), built-in names, and the lock (step 179, as
     documented).
2. **"Use another number" throws away words typed in Edit** (run 2). Tharani changed the words,
   then tapped "Use another number": Log opened with the old words, and at midnight she nearly
   saved "I go to the gym" at a new number. **No decision needed:** carry the edited words,
   category and date into the new Log.
3. **The unlocking answer hides the badge earned with it** (run 3). One milestone at a time, and
   the rating's unlock wins, so "Forecaster in health" was said nowhere on Resolve (D62 removed the
   category-unlock card, whose case this was). Dawit found it later on Today, half under the title
   bar. **No decision needed:** on the unlocking answer, the unlock card also names the badge that
   came with it.
4. **The perfect line beside "Give or take 10" reads as a contradiction** (run 1, a retired
   actuary). "Further off than luck alone explains" sits two lines from "give or take 10 points",
   and 88 + 10 reaches 95. They answer different questions (luck in the rating's own answers, and
   what a perfect forecaster scores on the same confidences), and the screen doesn't say so.
   **Needs the owner (wording):** say what each measures, or drop one beside the other.
5. **A badge given and taken back within a minute** (run 2). In an answer run, Forecaster on the
   gym miss, back to Tracker on the next card. D60 decided per-answer drops and no hysteresis.
   **Needs the owner:** announce a run's badge changes once, at its end.

### P1: a reason to stay, for the newcomer

6. **Nobody tells a newcomer what it's good for in their world** (runs 8, 5).
   - Wanjiru came for football: "if my 90s only come true 6 times in 10, I'm staking too much" is
     the answer she had to work out from How scoring works, while Insights showed a Plus box.
   - Rêbaz had nothing comparable to send back to Saman's "score 84" ("9 of 10 right" is another
     game); he wants the two cards side by side.
   - **Needs the owner:** the empty Insights' first line, and a friend comparison (D61 parked
     head-to-head).
7. **Plain-language and Spanish readers are left out** (runs 7, 8, 5). Yolanda's phone is in
   Spanish; only the dates follow it, and the long sentences she skipped carried the meaning. Three
   runs wanted a short answer where How scoring works gives a wall. **Needs the owner:**
   localisation, and shorter lead lines per section.
8. **The default reminder time doesn't fit evening or morning events** (runs 8, 5). A 19:00
   reminder lands before Saturday's football ends; Rêbaz's 7 am pour waits for 7 pm. One time for
   every prediction. **Needs the owner** (a per-prediction time, or the reminder after the due
   time).

### P2: words

9. **The friend fold explains the squares, not the score** (run 5). "Got a friend's card?" gives
   the squares' key, but not what "score 84, give or take 5" means or which range each square
   covers. **No decision needed:** add both to the line (the score in one sentence, the ranges low
   to high).
10. **Edit's number note reads as a no and a yes** (runs 1, 4, 8). "The number you said stays as
    it is: it's the record. You made it today, so you can still use another number."; and on Log,
    "A change on the day it was made isn't counted" (counted as what?). How scoring works has the
    plain words ("that's fixing a slip"). **No decision needed:** "It's the record from tomorrow.
    You made it today, so you can still change it:" over the button; on Log, "…Changing it on the
    day you made it is fixing a slip, so nothing is counted against you."
11. **How scoring works and Insights are walls for a tired or plain reader** (runs 2, 3, 5, 7,
    8). **Needs the owner:** one plain lead line per section, the rest behind a tap.
12. **"More about your record" opens as "Hide the fine print"** (runs 1, 2): two names, and "fine
    print" sounds like hiding. **No decision needed:** "Show less".
13. **The badge card runs two sentences together** (run 2): "…with 20 or more scored answers
    Badges follow how well…" (the taglines have no full stop; step 178). **No decision needed.**
14. **A double full stop after a date that ends in one** (run 7): "sáb, 14 nov.." on Insights,
    "7:00 p. m.." in You (`dueGroups.ts:109`, `SettingsView.tsx:174`, `:208`). **No decision
    needed:** don't add a full stop after one.
15. **The personal paragraph sits above How scoring works' heading** (run 6), so a heading jump
    skips "Your rating is 87…". **No decision needed:** give it its own heading.

### P2: structure

16. **A reload mid-run restarts its count and its summary** (run 2): "1 of 3" after "4 of 6", and
    "None happened" at the end, for a night with a finished problem set. **No decision needed:**
    keep the run's start and its answers across a reload.
17. **What changed with my badges, and when** (runs 6, 3): only the week recap says it; a missed
    drop is gone. **Needs the owner** (a badge history on Insights).
18. **Recap and card labels lead with counts; the verdict comes fourth** (run 6). **Needs the
    owner.**
19. **High numbers cost many ±5 taps** (runs 1, 3, 4, 5; Shigeru has a tremor). **Needs the
    owner** (D49; a ±10 step or typing the number).
20. **The Warm-up row leaves Today with the first save** (run 7: it was her way back). By design
    (D62); **needs the owner** only to keep it until the first answer.
21. **The week recap counts a backlog answered this week** (run 2: "1 happened, you expected about
    4" on her bad patch). It counts answers given in the week, as decided; **needs the owner** only
    to revisit.
22. **A shared phone mixes people's predictions** (run 4) and practice (run 1, a grandson's
    answers). **Needs the owner**, not now.

### P3: polish

23. **Small things in single runs:**
    - The chart's n= labels on bars and dots (runs 1, 4; the Warm-up chart, run 7).
    - Insights' range box counts scored answers, and History's list under it shows the unscored
      too, with nothing saying so (run 4).
    - Edit says the same-day rule twice (run 2).
    - The Tracker emblem reads as "no" (run 2).
    - "Down 3 since last week, from 5 answers given since then" when all five were tonight (run 2).
    - The card's key wraps with a stray "·" (run 2).
    - "chance 82–92%" in the counts table, and "Each dot is 2 predictions" for a screen reader
      (run 6).
    - The Warm-up called a 9 of 10 luck, which stung (run 8; D36's rule, worded by D61).

### Web-only, so not ranked

"Share as text" and the share sheet (runs 3, 4, 5, 6, 7, 8); no announcement after Yes or No and
focus not moving into sheets (run 6; `announceForAccessibility` and focus are native, profile
§18); the chart read as an unnamed image with doubled n= labels (run 6; the component carries a
label); the month-first date box (runs 2, 3, 4); USD with no trial on the paywall (runs 4, 7, 8;
the web build has test plans and no eligibility check); the due-day reminder line on a
prediction's details is hidden on web, which is where Yolanda looked for "how will I be asked"
(run 7); nested switches in the tree (run 6); the development-only test-data row in You (runs 5, 8;
`__DEV__`).

### Not verified (iPhone only)

VoiceOver announcements after an answer, a badge change and a share; focus into sheets; Voice
Control's name matching; Dynamic Type at the largest sizes (runs used page zoom); the trial
button, eligibility and local prices; notifications at 19:00; a slow phone (the throttle didn't
take).
