# Playtest round plans, rounds 11–22

One paragraph per blind playtest round whose plan was its own file. Each plan held the focus,
the cast with its wildcard draw, the start states and stand-ins, the briefs as sent and the
success criteria (for synthesis only). The findings, checked against the code, are in each
round's `playtest-*.md`, whose Method links here; the full brief is in git at the commit named.
Two plans stay as files: [`round20-plan-2026-11-13.md`](round20-plan-2026-11-13.md) (rounds
21–23 reuse its common blocks A, B and C) and the latest,
[`round23-plan-2026-11-14.md`](round23-plan-2026-11-14.md). Rounds 1–10 had no separate plan:
theirs is in each report's Method. Where a plan differs from `CLAUDE.md`, `DESIGN_SYSTEM.md` or
`UI_ROADMAP.md`, those win.

## Round 11

**2026-11-10, people who come from other goal apps.** Eight people never cast before, each from
a different kind of rival app: Keisha (Atlanta, a goal planner), Piotr (Kraków, 66, a habit
tracker, one thumb at 320), Kiri (Wellington, Finch), Jonas (Vienna, Apple's Fitness and
Reminders, offline), Valentina (Bogotá, no app, the wildcard), Carol (Alabama, a weight-loss
programme, back after five weeks, the edge of the audience), Farah (Montréal, an AI coach,
Arabic), Bex (Leeds, Beeminder, tritanopia). The aim: the eight hypotheses of
[`competitors-2026-11.md`](competitors-2026-11.md) §6 (commitment numbers on one's own goals, a
habit logged and closed on one day going "not scored", months-out dates, partial progress, a miss
parked as Can't tell, the welcome back after a bad result, trust in the trial copy, logging
without a widget or Siri), with the store text as the only briefing and a rival verdict at the
end. Findings: [`playtest-2026-11-10.md`](playtest-2026-11-10.md). Answered by steps 167
(findings 10, 17, 27), 168 (D55), 169 (D56) and 170 (D57); findings 10 and 8 also backed steps
157 (D46) and 158 (D47). Full brief: `git show 2636ff2:docs/design/research/round11-plan-2026-11-10.md`.

## Round 12

**2026-11-12, UI stress**, after the owner's iPhone showed Log's title row under the Dynamic
Island. The first round on the playtest profiles (`src/dev/playtestProfiles.ts`): Olu (Houston,
one thumb on a Pro Max, fresh install), Inès (Marseille, impatient, six days in), Lin (Vancouver,
a stylus, one answer from unlocking), Viktor (Rotterdam, a crowded record, bets on football), Mei
(Singapore, Voice Control), Tunde (Lagos, an old slow phone offline at 320), Gloria (San Antonio,
zoom 1.5 and Increase Contrast, three years), Aisling (Dublin, a tremor and a shared phone, the
wildcard). The aim: the biggest and smallest phones, large text, high contrast, crowded lists,
long and non-Latin text, four-digit counts, impatient taps and non-touch input, after a
`web-playtester` stress pass. Findings: [`playtest-2026-11-12.md`](playtest-2026-11-12.md),
aggregated with rounds 13–15 in [`aggregate-2026-11-12.md`](aggregate-2026-11-12.md). Answered by
step 171 (A1–A10) and D59 (step 173). Full brief:
`git show 2636ff2:docs/design/research/round12-plan-2026-11-12.md`.

## Round 13

**2026-11-12, appeal**, the first round on the appeal kit (`docs/playtest-appeal.md`): would this
person choose it, enjoy it, come back and tell someone. All five tech levels: Bernard (Glasgow,
68, L1), Dale (an Iowa farmer, L2), Amara (a tailor in Nairobi, from a friend's card, 320), Ruth
(a CBT therapist in Melbourne), Zara (Leeds, 17, back after three weeks through a friend's card),
Victoria (a consulting partner in London, five months in), Ji-woo (a designer in Seoul), Héctor
(Montevideo, the wildcard). Findings: [`playtest-2026-11-12b.md`](playtest-2026-11-12b.md), in
the rounds 12–15 aggregate. Answered by step 171 and D59 (step 173). Full brief:
`git show 2636ff2:docs/design/research/round13-plan-2026-11-12.md`.

## Round 14

**2026-11-12, appeal, a second cast**, on the same build and kit: Teresa (Quezon City, L1), Linda
(Dayton, L2), Ramón (a taquería owner in Phoenix), Sophie (Lyon, five months in), Dev (Bengaluru,
from a friend's card), Haruto (Osaka, back after three weeks), Ingrid (Oslo, six days in), Nusrat
(Dhaka, 16, at 320, the wildcard). Findings:
[`playtest-2026-11-12c.md`](playtest-2026-11-12c.md), in the rounds 12–15 aggregate. Answered by
step 171 and D59 (step 173). Full brief:
`git show 2636ff2:docs/design/research/round14-plan-2026-11-12.md`.

## Round 15

**2026-11-12, appeal, staying power.** Five round-13 people who had said "ask me again later",
brought back on the profile that puts them there: Bernard (the evening his first one is due),
Dale (five months), Ruth (one answer from unlocking), Héctor (three weeks of a daily walk) and
Ji-woo (six days in), plus Earl (Tucson, 1,000 days, the wildcard). The aim: whether having a
record, the clearest split in rounds 13 and 14, keeps the app's promise. Findings:
[`playtest-2026-11-12d.md`](playtest-2026-11-12d.md), in the rounds 12–15 aggregate. Answered by
step 171 and D59 (step 173). Full brief:
`git show 2636ff2:docs/design/research/round15-plan-2026-11-12.md`.

## Round 16

**2026-11-12, did step 171's fixes land.** Eight people who ran into the aggregate's A1–A10 in
rounds 12–15, back on the same start, screen and stand-ins, trying what tripped them: Amara,
Linda (at zoom 2), Ramón, Dale, Ruth, Ji-woo, Mei (Voice Control) and Gloria. No wildcard.
Findings: [`playtest-2026-11-12e.md`](playtest-2026-11-12e.md). Answered by step 172. Full brief:
`git show 2636ff2:docs/design/research/round16-plan-2026-11-12.md`.

## Round 17

**2026-11-12, usability, measured differently**: SEQ after each task, first clicks, errors and
recoveries, SUS, critical incidents and HEART, in place of the appeal kit. Eight people new to
rounds 12–16, their axes combined in new ways: Sam (a paramedic, deuteranopia, five months), Kofi
(blind, keyboard and screen reader, fresh install), Noor (an anxious accountant one answer from
unlocking), Hiroshi (Osaka, 320, a daily habit), Jun (ADHD, interrupted), Destiny (uneasy with
percentages, double text), Seun (Lagos, bets on football, a crowded record), Wen (a risk manager
in Hong Kong, one thumb, the wildcard). Findings:
[`playtest-2026-11-12f.md`](playtest-2026-11-12f.md). Answered by step 172 (two bugs) and D59
(step 173). Full brief: `git show 2636ff2:docs/design/research/round17-plan-2026-11-12.md`.

## Round 18

**2026-11-13, days, not minutes.** A diary over three sittings with the browser's clock moved,
time-zone and locale stand-ins, and a dropped connection; measured by expected against actual
ease, how sure people were of what they understood, trust and UMUX-Lite; step 173 checked in
passing. Eight people new to rounds 16–17: Walt (67, macular degeneration, the largest text, five
months), Kai (a gamer one answer from unlocking, at the record's edge), Bea (a single parent, the
diary), Marcus (eight months sober, a daily habit), Amira (a nurse, the ar-SA locale), Carol
(Alabama, US units, offline), Kiri (the first week, at 320), Sanjana (15, Voice Control, across
time zones, the wildcard). Findings: [`playtest-2026-11-13.md`](playtest-2026-11-13.md). Answered
by step 174. Full brief: `git show 2636ff2:docs/design/research/round18-plan-2026-11-13.md`.

## Round 19

**2026-11-13, a fortnight in the app.** Four diaries on four rhythms: Grace (a Manchester baker,
then 15 days away, past the welcome back's 14), Yusuf (a night baker, across midnight), Priya
(Sunday to Sunday on five months), Hannah (long COVID, short windows, Reduce Motion). Four single
sittings aimed at open decisions, each opening with three minutes and no task: Rosa (sharing
before 20 answers), Elena (privacy on a long record), Tunde (a slow phone on prepaid data) and
Min-jun (16, a stylus in one hand, the wildcard). Findings:
[`playtest-2026-11-13b.md`](playtest-2026-11-13b.md). Answered by step 175 and D60 (step 176).
Full brief: `git show 2636ff2:docs/design/research/round19-plan-2026-11-13.md`.

## Round 21

**2026-11-13, appeal, a shuffled cast, on step 177 (D61).** Six drawn at random across every
§10 axis, each with a step 177 change to meet, and two cast to fill the appeal rules' gaps; all
new: Leila (a vet nurse in Amman), Imran (Karachi, five months, privacy-minded), Lotte (Utrecht,
ADHD, back after three weeks), Omar (15, Alexandria, dyslexic), Ellie (14, blind, Belfast, a
screen reader), Thanh (a biostatistics student in Houston, one answer from unlocking), Mrs Lau
(73, Hong Kong, L1), Efua (a designer in Accra, from a friend's card). Findings:
[`playtest-2026-11-13d.md`](playtest-2026-11-13d.md). Answered by D62 (step 178). Full brief:
`git show 2636ff2:docs/design/research/round21-plan-2026-11-13.md`.

## Round 22

**2026-11-13, appeal, a diversified cast, on step 178 (D62)**, drawn the same way: Shigeru (a
retired actuary in Osaka, a daily habit), Tharani (Colombo, back after three weeks, fatigue),
Dawit (a student in Dublin, one answer from unlocking), Nafisa (16, Dhaka, dyslexic, the first
week, at 320), Rêbaz (Erbil, from a friend's card), Jaylen (17, blind, Sacramento, five months, a
screen reader), Yolanda (a fruit stall in Lima, L1), Wanjiru (Nairobi, runs two matatus and bets
on football). Findings: [`playtest-2026-11-13e.md`](playtest-2026-11-13e.md). Answered by step
179; its top finding, a lock for the app, by D63 and D64 (step 180). Full brief:
`git show 2636ff2:docs/design/research/round22-plan-2026-11-13.md`.
