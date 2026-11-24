# Voice and text plan for 1.0.1 (2026-11-23)

A plan, not a decision record. Nothing here is built. Where it differs from `CLAUDE.md`,
`DESIGN_SYSTEM.md` or `UI_ROADMAP.md`, those win until the owner approves a step.

## Status, 2026-11-23 (end of day)

Built on `builder/voice-pass`: the whole sample sheet (this plan's steps 212, 214 and the sheet's
share of 215 and 216), recorded as **step 212, D76** in `BUILT_LOG.md`, and the two-choice control
at 0 to 100% with "Slide to set", **step 213, D77**. The step numbers in the table below are this
plan's own and no longer match `BUILT_LOG.md`. Still to do: the rest of 215 (the Warm-up's answer
key and intro, three starter ideas, Insights on Day 0, the Plus card), 216 (e) and the lines the
web playtest found still in the old voice (the Brier line, the badge rows, the practice record),
217, 218, 219 (drafted: `store-listing-draft-1.0.1.md`) and 220.

## The request

The owner, 2026-11-23: "I want to edit a lot of the wording in the app to sound [less] AI. Add
more personality, and hand-holding, I think a good tone would be to use less fancy words maybe,
but not by too much … use less text overall. Much of the score calculation based explanations do
not need to be on the main page next to the score, currently the app suffers from a lot of text
overcrowding as well." For 1.0.1, with the store description.

Four asks:
1. **Voice:** sound like a person. More personality, plainer words, but not dumbed down.
2. **Hand-holding:** say what to do next, especially in the first week.
3. **Less text:** fewer words on every main surface.
4. **Score explanations off the main page:** the number stays; how it is worked out goes one tap
   away.

Asks 2 and 3 pull against each other. The plan settles it this way: guidance is one line about
the next step, shown when it applies; explanations of rules move to How scoring works.

## What makes the current copy read as machine-written

Read from the copy modules (`ratingHeadline.ts`, `beforeScoreCopy.ts`, `patternCopy.ts`,
`streakCopy.ts`, `verdictCopy.ts`) and the text-load run
(`text-load-2026-11-22.md`):
- Every caveat is said in the same sentence as the fact ("…, each range counting by how many
  answers it holds").
- Long sentences joined by colons, semicolons and "since / so / though".
- The same fact said two or three ways on one screen (Today's Day-0 hero: three lines for
  "20 answers unlock it").
- Statistician's nouns where a person would use a verb ("range by range", "give or take",
  "can't be told apart from").
- The copy grew by answering playtest findings one sentence at a time (D53 to D63), and nothing
  was taken out.

## Proposed voice (to be agreed in step 212)

- Short sentences. One idea per line. The fact first; the reason a tap away.
- Talk to "you" like a friend who is good with numbers.
- Plain words, but keep the app's own: calibration, overconfident, the badge names.
- One word per thing everywhere ("too sure", "too cautious", "scored").
- A little warmth at the moments that matter (first answer, first badge, a streak checkpoint,
  the rating unlocking). Not on every line.
- A next step wherever the person might stall.

Draft before and after. **The owner approved every row but "First answer" on 2026-11-23** ("Yes
lets go with the draft for all of them except the First Answer"); that sets the level of the
voice. Each one that states a record fact still needs the record check before it ships.

| Where | Now | Draft |
|---|---|---|
| Insights, under the rating | "Range by range, what you said averaged about 14 points away from how often those things happened, each range counting by how many answers it holds." | "On average you're about 14 points off." with "What does this mean?" opening How scoring works |
| Insights, under that | "Even perfectly calibrated, 20 answers like yours would typically score about 86, since luck alone moves each range. At this count, your score can't be told apart from perfect calibration." | Off the page, into How scoring works. On the page at most: "With 20 answers, that's about as good as anyone can tell." |
| Today, Day 0 | "Your first answer: tomorrow evening" / "0 of 20 scored, 1 on its way" / "20 more scored answers and your score unlocks." | "Your first answer lands tomorrow evening. 20 answers unlock your score." |
| Answer it now, same day | "It's due Wed, Nov 11. You logged it today, so an answer today isn't scored. From tomorrow it is." | "Heads up: an answer today won't count, because you logged it today. Tomorrow it will." |
| First answer (not approved; the owner: the second part "could combine into something about sample size, and should flow as one sentence") | "A 70% call should come true about 7 times in 10, so one answer can't say much; 20 can." | Proposed: "70% means right about 7 times in 10. It takes around 20 answers before we can tell how you're doing." |
| Warm-up, no lean | "Your numbers expected about 8 right, and you got 9. On ten answers luck often moves it that far, so it can't tell yet whether you run too sure, too cautious or about right." | "You expected about 8 and got 9. Too close to call on ten questions." |
| Today, the reminder ask | 31 words | "Want a nudge at 7 PM on the day it's due?" |
| Log, starter ideas | "Not sure where to start? Try one, then make it yours:" | "Stuck? Try one:" |

## What does not change

- **The record's facts.** No number before 20 scored answers; a same-day answer is said to be
  unscored once, before it is given; the lean rule and its words stay consistent; the integrity
  counts (deleted, moved, late changes) stay reachable under "More about your record".
  Shorter wording must not turn "no clear lean" into "well calibrated" or name a lean the rule
  doesn't.
- **Consent, money and legal copy.** The usage-count line (D71 d, D72 b), the paywall's trial
  and 24-hour wording (Apple's rule), the under-13 page, and the confirmations for Delete, Erase
  and Sign out can be made plainer but keep every fact. A policy check covers them.
- Yes and No get identical feedback. The streak is never said as a loss.
- The share card's fixed design. Accessibility labels follow the visible words.
- Settings (You, Categories, Account) are last in line: the owner's text-load request left them
  out, and they are read rarely.

## Steps

Numbered on from 211. Every step updates the tests that pin the words, and the sentences
`CLAUDE.md` and `DESIGN_SYSTEM.md` quote. Models follow `CLAUDE.md` "Who does what".

| Step | What | Who | Waits on |
|---|---|---|---|
| 212 | **Voice guide and sample sheet.** Rewrite `DESIGN_SYSTEM.md` §7.9 as the voice, with about 25 before-and-after lines covering each surface. Record D76 in `UI_ROADMAP.md`: decided copy from D13 to D75 may be reworded and moved within the limits above. | Main session | The owner's examples, then his yes on the sheet |
| 213 | **Text inventory of the rated states.** Run 4 saw only Day 0 and Day 1. Count words per screen on the demo data: Today and Insights with a rating, badges and leans, Resolve after an answer, Share, the recaps. | `web-playtester` | Nothing |
| 214 | **Score explanations off the main surfaces.** Insights' rating keeps the number, the bar and one line; the points line's detail, the perfect-calibration line, give-or-take and "since last week" move into How scoring works behind "What does this mean?". Today's hero goes to one line. The chart keeps its title and loses its second sentence to a tap. Reverses the placement in D59, D62 and D68, not their content. | `mobile-ui`, Opus | 212, 213 |
| 215 | **Day 0 and Day 1 cuts.** The ten ranked cuts in `text-load-2026-11-22.md`: the Warm-up result's chart key and extra lessons, its answer key folded to the misses, the reminder ask, the streak's rest-day line before it matters, the repeated same-day note, three starter ideas, Insights' empty boxes and badge explainer on Day 0. | `mobile-ui`, Opus for the Warm-up verdict and same-day lines, Sonnet for the rest | 212 |
| 216 | **The voice pass, surface by surface**, in the approved voice: (a) Warm-up, first log, first answer; (b) Today, Log, Resolve, details; (c) Insights and How scoring works; (d) Share, the recaps, notifications; (e) You, the paywall's own words and the account screens. | `mobile-ui` and `services`; Sonnet where the sheet fixes the words, Opus for lines that state a score, lean, badge or count | 212; (c) after 214 |
| 217 | **A next-step line.** One line of guidance at the moments a new person stalls: after the Warm-up, after the first log, after the first answer, on a day nothing is due, when the rating unlocks. Uses slots that exist; no new screen. | `design-analyst` first (which moments, what evidence), then `mobile-ui` | 212 |
| 218 | **The reminder promised before permission** (`PredictionDetails.tsx:158`, found in run 4): read the iOS permission, then say "reminders off" or nothing. | `mobile-ui` with `services`, Sonnet | Nothing |
| 219 | **The store listing** (below). | Main session | 212 |
| 220 | **Check, review, build.** A blind playtest with two personas (a newcomer and a numbers person: is it warmer, is anything now missing). A review if the owner calls one: `record-auditor` (every record rule is still said somewhere and no shortened line overclaims), `policy-auditor` (consent, paywall and store copy), `code-reviewer`. Then a new 1.0.1 build, the phone checks and the submission. | Main session, the reviewers, the owner | 214 to 219 |

Order: 212 and 213 first, 218 at any time, then 214 and 215, then 216 and 217, then 219 and 220.

**Step 212's sample sheet is drafted** (2026-11-23): `voice-sample-sheet-2026-11-23.md`, about 35
lines, waiting on the owner. The source inventory behind it counted long sentences (over 12
words) per surface: open predictions and Resolve about 35, Insights about 28, Today about 12,
the Warm-up and the recaps about 9 each, Log about 4, History and notifications none. So 216
starts with Resolve and Insights, and notifications need no pass.

## The store listing (step 219)

What Apple's pages say (checked 2026-11-23 by `platform-api-checker`; sources below):

| Field | When it can change |
|---|---|
| Promotional text | Any time, no new version. |
| Description | Only with a new app version. |
| App name | When a new version is created or the version's status allows edits. |
| Privacy policy URL | In an editable status; goes live with the next version. |
| What's New | Required for every version after the first. |
| App Review notes | Any time. |
| Subtitle, keywords, screenshots, support URL, categories | Not confirmed: the pages' "Editable" column did not survive the fetch. Screenshots are locked while a version waits for review. Treat all of them as changing with a new version. |
| Custom product pages | Their own screenshots, promotional text and keywords, reviewed without an app version. They don't change the main page. |

- A new version needs a build attached. Build 15 was uploaded after 1.0.0's release, so it can be
  attached to 1.0.1; a voice pass needs a newer one.
- So the new description goes live with 1.0.1. The promotional text can change today.

The work:
- **Description:** rewrite `APP_STORE_LISTING.md` §2 in the new voice and cut it from about 480
  words to about 250. The first three lines carry the page (the rest is behind "more"). Keep
  "No money, no odds, no betting", the subscription paragraph and the two links (Guideline
  3.1.2).
- **Promotional text:** a new 170 characters, his to paste whenever he likes.
- **What's New for 1.0.1:** the lock's "Lock after", and the simpler wording.
- **Screenshots:** retake any whose screen changed in 214 to 216 (`APP_STORE_LISTING.md` §5).
  Store screenshots have to show the app as it is.
- **Subtitle and keywords:** stay unless the owner wants them reopened.
- Also owed for the submission, from `HANDOFF.md`: the demo account's re-seed and a clause on
  "Lock after" in the review notes.

## For the owner

1. **Examples.** Three to five lines he likes the sound of, from any app or his own rewrite of a
   line here. Or his reaction to the drafts above: which are right, which go too far.
2. **How far the personality goes:** plain and warm, or with some humour.
3. **Build 15.** This plan holds the 1.0.1 App Store submission for the voice pass; build 15
   stays on TestFlight. The other way is to submit build 15 as 1.0.1 now and ship the voice
   pass as 1.0.2.
4. **Settings and account copy:** in this pass (216 e) or left for later.

## Raised 2026-11-23: a confidence below 50% on the two-choice questions

The owner asked whether the Warm-up's and practice's control should go below 50%, since "70%
confident in the first position does not automatically mean 30% in the second position".

The main session's read, not a decision:
- On a question with two answers where exactly one is right, the two chances add up to 100. Being
  30% sure of the answer picked is the same as being 70% sure of the other one, so the person
  should pick the other. That is why the floor is 50% (D13, D49), and the scoring depends on it.
- The feeling behind it is real: "I'm not sure of either" feels like 30% and 30%. In numbers
  that feeling is 50%, the coin flip. People's separate confidences often don't add up to 100,
  and that is one of the things the app exists to show.
- Real predictions on Log already run from 0 to 100%.
- What could answer the feeling without breaking the score: say what 50% means on the control
  ("50% = no idea, a coin flip"); or, as a later feature, questions with three or four answers,
  where the floor is 33% or 25%.

## Sources (Apple, read 2026-11-23)

- https://developer.apple.com/app-store/product-page/
- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- https://developer.apple.com/help/app-store-connect/update-your-app/create-a-new-version/
- https://developer.apple.com/help/app-store-connect/manage-builds/choose-a-build-to-submit/
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions/
- To read by eye for the unconfirmed rows:
  https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties
