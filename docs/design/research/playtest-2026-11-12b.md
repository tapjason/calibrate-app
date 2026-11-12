# Blind playtest, 2026-11-12 (b): appeal

Raw findings, 2026-11-12. The first appeal round: eight blind runs on the web
build, cast and briefed by the appeal kit (`docs/playtest-appeal.md`) to ask
whether each person would choose the app, enjoy it, come back and tell
someone, rather than whether it holds up. Run to the plan in
`round13-plan-2026-11-12.md`, after a `web-playtester` health check of the
start states. The build is `builder/playtest-setup` (`6e6e28d`); nothing in
the app changed during the round. These are what the testers saw, checked
against the code; they are not decisions. **The testers are AI agents playing
people:** their appeal answers show where groups part ways and which words
and moments land or sting. They are not market estimates, and no share or
price below is one. Where they differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and
`UI_ROADMAP.md` win.

## Method

**The cast** (app-profile §10, "Choosing an appeal round's cast"): all eight
never cast before, seven of the twelve appeal personas added today plus the
wildcard. All five tech-literacy levels; ages 17 to 68; four from outside
the US, UK and Ireland; seven ways of arriving.

| # | Persona | Age | Tech | Region | Money | Found it | Taste | Mindset | Stage (profile) | Screen |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Bernard, retired bus mechanic, Glasgow | 61+ | L1 | UK | careful | his son installed it | plain | curious | fresh install | 375 × 812 light, zoom 1.25 |
| 2 | Dale, farmer, Iowa | 61+ | L2 | US | careful | an ag podcast | plain | sceptical, practical | fresh install | 440 × 956 light |
| 3 | Amara, tailor and parent, Nairobi | 26–40 | L3 | Sub-Saharan Africa | prepaid, tight | a friend's card (WhatsApp group) | warm | practical | fresh install | 320 × 568 light |
| 4 | Ruth, CBT therapist, Melbourne | 41–60 | L3 | Oceania | comfortable | a colleague suggested it | warm | sceptical for clients | fresh install | 402 × 874 light |
| 5 | Zara, sixth-former, Leeds | 13–17 | L4 | UK | none of her own | a friend's card (story), coming back | playful | social | back after 3 weeks (`return`) | 390 × 844 dark |
| 6 | Victoria, consulting partner, London | 41–60 | L4 | UK | pays for premium | an Economist piece | premium | competitive | five months (`long-time`) | 440 × 956 dark |
| 7 | Ji-woo, product designer, Seoul | 26–40 | L5 | East Asia (bragging frowned on) | comfortable | a design newsletter | crafted | curious | fresh install | 402 × 874 dark |
| 8 | Héctor, retired network engineer, Montevideo (wildcard) | 41–60 | L5 | Latin America | comfortable | a podcast | plain | sceptical | fresh install | 390 × 844 light |

**The wildcard's draw** (`random.SystemRandom`, every §10 axis): 41–60, L5,
Latin America, retired, comfortable, article or podcast, plain, sceptical,
first five minutes, health, on the move, 390 × 844, light, uses a commitment
device. Nothing needed fixing. New §10 row: Héctor.

**Changed from the first sketch.** Linda gave way to the wildcard. The only
"back after a gap" profile is a student's, so Zara took it, her return
prompted by a friend's new card (the share loop as re-engagement). Ruth
started fresh, since `first-week` is an office worker's week.

**Briefs.** Each carried the App Store page (block A), the appeal block B
word for word, the arrival in the person's terms (the friend's card as the
app's `shareText` writes it), four to six goals, an interruption where it
fitted (runs 1, 2, 3, 5: away to another page and back) and three end
questions. No CDP stand-ins: none of these people needed one.

**Start states.** Fresh installs cleared by the main session; `return` and
`long-time` loaded on `/dev/seed`. **One carry-over:** the card's left-off
categories live in the settings (`settingsStore.ts:255`), which Erase, and
so a profile load, doesn't clear (`db/account.ts:30`). Zara (run 5) left two
categories off her card, and Victoria (run 6) inherited it: her "card hides
Work by default" is the carry-over, not a default. See finding 24.

**The health check** (`web-playtester`): every start state works, no errors
from app code. The Day-0 card has no "Share as text" (it needs the identity
card, `ShareCardPanel.tsx:160`). The text share's link has no `ct=` campaign
because there is no provider token yet (`share/link.ts:38`, by design).

## The persona table

| # | Persona | Verdict | Score | Five-second keep going | If it disappeared |
|---|---|---|---|---|---|
| 1 | Bernard | unsure: "the wee quiz was a laugh… but half the words are for folk wi' degrees, and I've nothing to see till Saturday" | 5 | maybe | not disappointed |
| 2 | Dale | unsure: "keeps honest books… but it's built for a fella in an office and it won't tell me a thing about my calls till spring" | 6 | maybe | not disappointed |
| 3 | Amara | unsure: "it told me 8 of 10 without shouting at me, but my money answer will take weeks and the practice is chemistry homework" | 6 | maybe | not disappointed |
| 4 | Ruth | unsure: "the bones are right, it never once says 'wrong', but there's a streak, a points ladder and a lot of maths I'd have to talk a fragile client past" | 6 | maybe | somewhat |
| 5 | Zara | keep: "I'm Forecaster in health and my 88 beats Maddie's 79, but if it looked less like a bank app I'd actually love it" | 6 | yes | somewhat |
| 6 | Victoria | keep: "the only thing on my phone that tells me, with receipts, that I'm too sure of myself at 80%-plus and that money is my blind spot" | 8 | yes | very |
| 7 | Ji-woo | unsure, kept until Wednesday: "honest and well written, but on day one I only got a trivia quiz and a card that brags" | 7 | yes | somewhat |
| 8 | Héctor | keep: "por fin alguien que hace la cuenta bien: no me da un número hasta tener 20 respuestas" | 7 | yes | somewhat |

Median score 6 (mean 6.4). Three keep, five unsure, nobody leaves.

## Usability

| Task | 1 Bernard | 2 Dale | 3 Amara | 4 Ruth | 5 Zara | 6 Victoria | 7 Ji-woo | 8 Héctor |
|---|---|---|---|---|---|---|---|---|
| 1 | wrong turn 3 | done 5 | wrong turn 5 | done 6 | done 6 | done 6 | wrong turn 5 | done 6 |
| 2 | done 5 | done 5 | done 5 | done 5 | wrong turn 4 | done 7 | done 5 | done 6 |
| 3 | wrong turn 5 | done 5 | done 5 | done 6 | done 6 | done 6 | done 6 | done 6 |
| 4 | wrong turn 4 | done 4 | done 4 | wrong turn 4 | partly 4 | done 5 | done 6 | done 6 |
| 5 | done 5 | done 4 | done 5 | done 4 | done 6 | done 6 | done 5 | done 5 |
| 6 | | done 5 | | | | | | |

Nobody gave up. **Under 5 on ease:** Bernard's "what is this and is it any
use" (3), and every task about **showing someone or seeing what it says
over time** (Bernard 4, Dale 4, Amara 4, Ruth 4, Zara 2→4): the share and
"over time" goals are where the day-one app has least to give. The first
real prediction was done by all eight, ease 5–6, in 25–90 s.

**Expectation mismatches** (several runs each): the Warm-up opens on a
chemistry question when the arrival promised something about their life
(runs 1, 2, 3, 4, 7); the day-one card is a quiz score, not the "Sharp in
health" card a friend posted or the newsletter showed (3, 7); Insights is
empty after the quiz (1, 4); the due date starts on Tomorrow though "Saturday"
was typed (1); tapping the identity line on Today opens the badge
explanation, not the card (5).

## Comprehension

Twenty-four answers; twenty right, four partly. Everyone could say what the
app is for, and every fresh install knew that nothing scores until answers
come in and that 20 unlock the rating. Héctor described the bands, the count
weighting and the Brier baseline from memory. The partial answers:
- Bernard (2): "no clear lean" read as "not too cocky, not too feart", then
  "luck… says nothing either way" as "so nothing much". The quiz's message
  arrived as a shrug.
- Amara (1): read "give or take 4" as a range correctly, but had never seen it
  explained on screen; she guessed.
- Zara (1): the card's squares meant nothing ("something about her sure-ness
  ranges").
- Ruth (1): understood "overconfident" exactly, and added that the word fights
  how an anxious client sees themselves: they'd never call themselves
  confident.

## Appeal

| # | 5-second | Lowest mood (where) | Highest mood (where) | Ease mean (pairs 1–4) | Appeal mean (5–8) | Five words | Disappointed | Would post (where) | Would pay |
|---|---|---|---|---|---|---|---|---|---|
| 1 Bernard | maybe | −1 (first question; "says nothing"; empty Insights; paywall) | +2 (practice 3 of 3; the card) | 3.75 | 4.5 | Honest, Calm, Respectful, Too technical, Confusing | not | family chat only ("Your auld da's no daft") | nothing; distrusts the free month |
| 2 Dale | maybe | −1 (first question; the card) | +1 (quiz result; first save) | 5.0 | 4.25 | Honest, Clear, Calm, Useful, Too technical | not | no | ~$10 a year if weather and markets were split |
| 3 Amara | maybe | −1 (a true answer "not scored"; paywall) | +2 (quiz result) | 4.5 | 4.25 | Kind, Honest, Simple, Clever, Too technical | not | yes, WhatsApp group ("8 of 10 ladies 😄 mine for money is loading") | KSh 500 at most |
| 4 Ruth | maybe | −1 (scoring page read as a client) | +2 (quiz result) | 5.0 | 4.25 | Honest, Calm, Respectful, Useful, Too technical | somewhat | no; would tell clients not to | A$0; ~A$40 if a client could share their record with her |
| 5 Zara | yes | −1 (Insights; paywall) | +2 (Forecaster unlock; practice) | 4.5 | 4.25 | Honest, Clever, Too technical, Calm, Personal | somewhat | yes, Instagram story ("88 > 79 @maddie 😌") | £0; £3–5 once for card colours |
| 6 Victoria | yes | −1 (the Brier line) | +2 (Today's headline; Answer all; the track record on Log) | 5.5 | 5.0 | Honest, Useful, Respectful, Clever, Calm | very | partners' WhatsApp ("87 ± 4. Your move."); never LinkedIn | lifetime $59.99, after seeing Trends |
| 7 Ji-woo | yes | −1 (Goal 1 of 3 and the streak; the card) | +2 (Save naming the date) | 5.25 | 4.25 | Honest, Calm, Respectful, Clever, Too technical | somewhat | one friend by DM ("너는 몇 개?"); never public | ₩0 now; ₩15–20k a year after months |
| 8 Héctor | yes | 0 (the card; the paywall) | +2 (quiz result; the scoring page) | 5.5 | 4.75 | Honest, Clear, Trustworthy, Respectful, Calm | somewhat | one ex-colleague on WhatsApp ("10 de 10, a ver vos") | ~$10 once; not the annual |

**Split it.**
- **By tech literacy.** The five-second read splits cleanly: every L1–L3 run
  said "maybe", every L4–L5 run "yes". "Too technical" came from all five runs
  at L1–L4 who started fresh or came back, and from Ji-woo (L5, about the
  scoring page and the idioms); not from Héctor (L5), who called the scoring
  page the best part, nor from Victoria (L4, five months in). The same pages (the Warm-up's chart caption, How
  scoring works, the Brier line) are "a lecture" at L1–L3 and "the reason to
  trust it" at L5.
- **By age.** Over 60 (Bernard, Dale): both "not disappointed", both lowest on
  boring–exciting, both put off by the badge and streak vocabulary ("Oracle.
  Come on."; "I'm retired, every day's a rest day"). Under 26 (Zara): the only
  run who would post in public, and the only one who wanted *more* ceremony
  (an unlock that feels like an unlock).
- **By arrival.** Both friend's-card arrivals (Amara, Zara) and the newsletter
  arrival (Ji-woo) came for a card like the one they'd seen, and a fresh
  install can't make one for weeks (finding 3). The family install (Bernard)
  needed something to show his son and found it only by scrolling. The
  podcast arrivals (Dale, Héctor) came for scorekeeping and found it
  credible; Dale's problem was the office framing, Héctor's the easy quiz.
- **By record.** The two runs with a record (Zara, Victoria) were the two most
  attached; the six fresh installs had nothing of their own in it yet, and
  four said "ask me again after Saturday / Wednesday". Disappointment tracks
  having data more than any persona trait.
- **By culture.** Posting a score is bragging for Ji-woo (Korea) and Bernard
  ("wouldnae post it anywhere public"); Amara posts to a closed group with
  self-mockery; Victoria to a peer group as a challenge; Zara to her story
  as a challenge. Six of eight would send the card to a person or a closed
  group; one would post publicly. The "How sure are you?" line worked as a
  dare in every culture that shared.

**The mood curve.** The **first screen dips** for five of six fresh installs
(the chemistry question). The **Warm-up's result peaks** for Amara, Ruth and
Héctor (+2: "It isn't about being right", no grade, honest about luck) and
dips for Bernard (−1: "so what was the quiz for?") and Ji-woo (0: "honest,
but flat"); the same screen is both, by literacy. **First save** is up in
every run (+1 or +2): "Save, due Saturday" and the frequency line ("about 7
times in 10") are the two most-praised things in the round. **The streak and
"Goal: 1 of 3"** dip on first sight for Ruth, Ji-woo and Héctor. **Insights**
is flat to negative for everyone without a record, and for Zara. **The card**
is +2 for Bernard and +1 for Amara and Zara, 0 or −1 for the rest. **The
paywall** is −1 for three (dollars, an AI they don't want) and +1 for two who
called it the most honest they'd seen.

**Words.** Honest 8 of 8, Calm 7, Too technical 6, Respectful 5, Clever 4,
Useful 3, Clear 2; Kind, Simple, Personal, Trustworthy, Confusing 1 each.
Nobody chose Fun, Warm, Motivating, Satisfying, Appealing or Fresh. The only
negative words are Too technical (behind it: the Warm-up's chart caption, the
thesis example, How scoring works, the Brier line, "no clear lean") and
Confusing (Bernard: the same screens). **Boring–exciting** scored 3 in six of
eight runs and 4 in the other two, the lowest pair everywhere.

## What held up

- **"About 7 times in 10" under every number.** Praised in every run; Ji-woo
  called it "the best piece of UX writing in the app, and I'd steal it".
- **Save naming the date** ("Save, due Saturday"): smiles in runs 1, 2, 3, 6,
  7; Ji-woo would screenshot it for her team.
- **Honesty.** "Honest" from all eight. No score before 20 and the reason
  given; a miss never called wrong ("You picked 'Romania'"); "It isn't about
  being right" (Ruth would read it aloud in session); the anti-padding rules
  stated openly (Dale, Héctor); every score with its give-or-take.
- **The track record on Log** moved Victoria's number from 85 to 75 ("That's
  the product").
- **The paywall:** "Plus adds interpretation, not access" and the trial
  timeline; called the most honest paywall of the year (Ji-woo), "no catch I
  could find" (Dale). Nobody felt pushed.
- **Interruptions:** the Warm-up kept its place (Amara), a saved prediction
  survived (Bernard), Answer all kept its answers (Zara).
- **Privacy in one line:** "Your predictions live only on this phone"
  reassured Amara, Ruth and Héctor.
- **Practice:** "3 new questions tomorrow" was Bernard's reason to come back.

## Ranked findings

Appeal order (`docs/playtest-appeal.md`): a record risk first, then what loses
people before the first reward, then no reason to come back, tone and
identity, sharing and worth, polish. Repeats of the twelfth round
(`playtest-2026-11-12.md`) say so.

### P1: the record

1. **A due date can be moved once the outcome is known** (run 8, sceptic,
   L5). Edit on an open prediction changes the due date
   (`PredictionDetails.tsx`, `earliestDueForEdit`), and nothing counts a
   postponement the way a deleted due prediction is counted (D45). Héctor's
   case: Friday's blood-pressure reading comes in high on Thursday, so push
   Friday to next week. Not tested on or after the due day (a due prediction
   opens Resolve from Today; the details sheet handles a due one reached by
   link, line 187). **Needs the owner** (a D45-style rule: lock the date on
   the due day, or count a move made inside some window). Run
   `record-auditor` on it.

### P1: lost before the first reward

2. **The Warm-up opens on school trivia.** The same ten for everyone (D18), a
   fixed random draw whose first question is "Which element has the higher
   atomic number? Silver / Cobalt" (`practice.ts:365`). The first screen dipped
   for five of six fresh installs (runs 1, 2, 3, 4, 7: "isnae for the likes of
   me", "I farm", "I'm a tailor", "a cold open for exam anxiety"), and the
   daily practice opened Amara's day on "Plutonium or Radon" and she closed
   it. Metric units to a US farmer (6,961 m, 1.27 million km²); US and
   European places to a Kenyan and a Leeds teenager. At the other end Héctor
   got 10 of 10 at 92% and called questions 5–7 "a children's quiz" (Jupiter,
   Venus, Vancouver). Axes: L1–L3, non-Western, US units; L5 for "too easy".
   **Needs the owner** (D18: which kinds lead, whether the order is chosen,
   units by region).
3. **The day-one card isn't the card the arrival promised.** Both friend's
   card arrivals and the newsletter one came for "Sharp in health · Tracker in
   finance"; a fresh install gets "9 of 10 right. I was 77% sure. How sure are
   you?" (runs 3, 7), which Ji-woo, Ruth and Dale read as a trivia boast. It
   has no "Share as text" (health check), so the share loop's text form
   starts weeks in. Bernard (+2) and Amara (+1) liked it; the dare line worked
   in every culture that shared. **Needs the owner** (what Day 0 can share;
   GROWTH §0).
4. **The Warm-up's result reads like a report.** Runs 1, 7, and the chart
   caption in runs 2, 3, 4, 8. "Make a real prediction" and "Share my result"
   come before the evidence; the chart caption is five sentences; the thesis
   example arrives with no lead-in ("I'm not a student", "no source"); the
   page runs about 2,000 px at 402 wide. For Bernard, "no clear lean" then
   "says nothing either way yet" made the quiz feel pointless (the twelfth
   round's finding 27 again, at L1). The same screen was +2 for three runs
   who read the top three lines. **Needs the owner** (D18, D36: lead with one
   sentence and the chart; what L1 hears after 9 of 10).

### P1: no reason to come back

5. **Twenty answers, and no "when" until the third.** "0 of 20 scored" with
   no estimate on a fresh record (runs 1, 2, 3, 7: "well into next year",
   "past Christmas", "many weeks"); the pace line needs 3 scored answers in
   28 days (D53). Zara wanted "about 3 weeks to your next badge", not "9 more
   scored answers". **Needs the owner** (an estimate from the logging pace, or
   what the first week builds toward).
6. **Built for an office.** The five categories, the starter ideas ("finish my
   most important task", "read before bed") and the example ("I'll finish the
   draft") read as one life (runs 1, 2, 3, 5). Rain went under Work, the
   football under Personal, the chemistry test under Work; nobody saw on Log
   that they can add their own (Amara found it in You; Dale "wouldn't go
   looking in settings"). Dale's "one thing that would make me love it" was
   Weather, Markets and Machinery on Log; Bernard's, a place for the football
   and the horses. Axes: retired, farming, self-employed, in school. **Needs
   the owner** (an "Add your own" chip on Log; starter ideas by life, not by
   job).

### P2: tone and identity

7. **When a feared thing doesn't happen, nothing names it** (run 4,
   therapist). After No on "I'll stuff up the presentation" at 90%: "Recorded:
   it didn't happen", then admin ("Not scored: you logged it today") and "Log
   it again, due tomorrow" as the main button, which invites rehearsing the
   fear. Amara met the same after a client really paid that day: a true
   answer "isn't scored", then "Log it again" for a one-time payment.
   **Needs the owner** (D50, D56: a line that names a high-confidence miss
   plainly; when "Log it again" leads).
8. **Streak, daily goal and rest days from day one, with no way to hide
   them** (runs 2, 4, 7, 8; Bernard: "I'm retired, every day's a rest day").
   "Goal: 1 of 3" on the first save read as a failure message to Ruth's
   perfectionists, as Duolingo to Ji-woo and as stickK's pressure to Héctor;
   "nothing is lost when it ends" is only in How scoring works. **Needs the
   owner** (D17: a switch in You; the line on Today).
9. **The scoring words grade the person.** "A 40-point miss, and a score of
   60" and the Oracle ladder (Ruth: "a failed exam"; Dale: "Oracle. Come
   on."); "so a miss can't disappear without a trace" (surveillance, to a
   client who deletes out of shame); the card's subtitle "Where your judgment
   holds up, and where it doesn't." (`app/share/index.tsx:51`, a verdict on
   the person). Runs 2, 4. **Needs the owner** (copy).
10. **The Brier line: one line, opposite asks.** Victoria: the most important
    thing the app knows (her 0.23 equals the baseline, so no skill over
    saying 64% every time) is grey line four; make it the headline. Zara: it
    reads as "a robot saying 66% beats you", nearly left. The twelfth round's
    finding 5. **Needs the owner** (D24, D35).
11. **A badge unlock has no moment** (run 5, under 20). Forecaster in health
    arrived as a grey emblem "that looks like a settings icon"; "All caught
    up" and the recaps don't mention it. Her best moment "felt like a
    receipt". Planned, not built (`FUTURE_UI.md` §B). **Needs the owner.**
12. **Today's second line names a tier, not the weak spot** (run 6): "Tracker
    in finance" reads neutral while Insights says "Furthest off: Finance".
    The 70 / 85 / 90 bar under it has no label (runs 5, 6; the twelfth
    round's finding 5). **Needs the owner** (D27).

### P2: sharing and worth

13. **The way to the card.** Tapping "Forecaster in health" on Today opens the
    badge explanation (D27, as decided), when Zara wanted the card; Share is
    under You and at the foot of Insights (run 5). Bernard found his card two
    scrolls down (run 1). **Needs the owner.**
14. **"2 categories not shown" on the image** read as "snitchy" (run 5); D42
    decided the card says so. Recorded as a tension, not a reversal.
    **Needs the owner** only to revisit D42.
15. **Themes.** A locked theme opens the paywall with no preview on her own
    card (run 7); the free theme is grey on black, "not story-pretty" (run 5).
    **Needs the owner.**
16. **Nothing to compare against** (run 6, competitive): no benchmark,
    percentile or typical-user figure. New scope. **Needs the owner.**
17. **Plus on day one is worth nothing to anyone without a record.** Nobody
    would start the annual today. Victoria would buy lifetime after a sample
    of Trends; Zara and Héctor would pay a few pounds or dollars once
    (colours; month-by-month trends); Ruth would pay for a way for a client to
    share their record with her; Bernard distrusts "free month then they
    charge you". An AI reading their numbers interested nobody below L4.
    **Needs the owner** (GROWTH §4; a Trends sample on the Plus card).

### P3: polish

18. **"Washington, D.C.. You got it"**: the answer key's row joins the answer
    and the verdict with a full stop (`verdictCopy.ts:136`), doubled after
    "D.C.". Runs 1, 5, 7, 8. **No decision needed.**
19. **The week recap names an arbitrary category** (run 2): "Tracker in
    finance: 20 to go" for a farmer with two Work calls and one Finance; with
    every category at 0 resolved, the tie breaks alphabetically
    (`nextBadgeCopy.ts:58, 70`). **No decision needed:** break the tie by
    predictions made.
20. **Warm-up question 1 at 320 × 568:** the intro pushes the confidence
    control below the fixed Next / Skip bar, and Next is disabled with no
    visible reason until you scroll (run 3). On Log at 320, "Due Saturday,
    Nov 14" sits behind the fixed Save (run 3). **No decision needed**
    (padding under the fixed bars); check on an SE.
21. **The year recap** puts "Boldest call that landed: 95%" above "Surest
    thing that didn't: 95%" (run 6, `WrappedCard.tsx:84-87`): reads as a typo,
    and "boldest" for a 95% sounds wrong. **Needs the owner** (copy).
22. **"Score 98, give or take 8"** reads as up to 106 (run 6, Social on
    Insights). **Needs the owner** (say the range, capped).
23. **Date styles mixed on one screen** (run 7): "Thu, Nov 19", "Wednesday
    evening", "Due Wednesday, Nov 18", "Save, due Wednesday", "due Wed, Nov
    18"; and month-first for Glasgow, Melbourne and Nairobi (runs 1, 4; the
    twelfth round's finding 16). **Needs the owner.**
24. **Erase keeps the settings.** "Erase all data on this device" clears the
    database, the Warm-up and practice, but not the stored settings: the
    card's left-off categories, theme and shape, reminder times, dismissals
    (`db/account.ts:30`, `settingsStore.ts`). Found by the method (run 6
    inherited run 5's card). **Needs the owner** (what Erase means); **no
    decision needed** for the playtest loader to reset the card settings.
25. Smaller ones: "Your rating stays at 88. One answer nudges it either way."
    when nothing moved (run 6); Log's category chips wrap 3 + 2 with "Pick a
    date" alone (run 7); the Warm-up's Next and Skip touch (run 2, the twelfth
    round's finding 10); a half-typed prediction lost to a reload (run 2, its
    finding 14); `n=` labels on the dots (runs 5, 7, its finding 19); "Trends:
    your 4 months on file" after five (run 6, its finding 17); the track
    record the store page promises is invisible until five answers (runs 7,
    8, its finding 28).

### Web-only, so not ranked

Prices in US dollars (the store localises; "Works out to $2.49" is the
store's own figure, `paywallCopy.ts:118`, here the web fallback); the date
field typed as "2026-11-13" or "11/13/2026" instead of the iOS picker;
"Sharing isn't available on this device"; the slider ignoring arrow keys and
the many +5 taps where a phone would drag (runs 1, 3, 4, 5, 8: check the drag
on an SE, finding 2's people are the ones who won't drag); the "Test data and
playtest profiles (development only)" row on You (`__DEV__` only, seen by
runs 3, 4, 7, 8: worth a release-gate check that it can't ship).

## Not verified (iPhone only)

The 7 PM reminder and its Happened / Didn't (every fresh run's reason to come
back), the share sheet and WhatsApp or Instagram export, local App Store
prices in pounds, shillings, won and Australian dollars, the slider drag on
an SE, real Dynamic Type for Bernard, haptics, and the native date picker.
