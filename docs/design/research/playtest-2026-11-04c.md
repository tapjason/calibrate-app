> **Raw findings, night of 2026-11-04 into 11-05 (third round that day).**
> Five blind playtests of the web build after step 152, chosen to widen who
> the testers are: a teenager, a retired reader, someone using it for anxiety,
> a dyslexic shift lead and an interrupted parent. The fixes that needed no
> decision were built the same night as step 153 (`BUILT_LOG.md`). The rest
> are proposals for the owner and haven't been decided. Where they differ,
> `CLAUDE.md`, `DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

# Blind playtests (November 2026, fifth round)

## Method

Same as `playtest-2026-11-04.md`: each run was a fresh agent with only the
Playwright browser tools, no repo and no docs, given a persona, tasks and a
fixed report format, one after another in one browser. Runs 1–3 each started
from a freshly cleared install. Run 4 started from the demo data on a cleared
install (the first time the demo was loaded without earlier runs' predictions
under it), and run 5 kept what run 4 left. Screenshots are in
`.playwright-mcp/playtest-2026-11-04c/` (gitignored). No run signed in, bought
anything, erased data or left localhost. Run 2's larger text was CSS zoom at
135%, which scales everything (the tab labels included), so it overstates some
crowding and can't test Dynamic Type itself.

The browser clock crossed midnight during run 3 (America/Chicago), so its first
prediction was logged on Nov 4 and answered on Nov 5 and was scored; runs 4–5
were told "today is 2026-11-05".

| # | Persona | Start | Screen | Verdict | Ease |
|---|---|---|---|---|---|
| 1 | Zoe, 16, high-school junior, impatient, no money of her own | Fresh install | 375 × 667, light | **Unsure**: "I wanna see if I'm right about volleyball, but I can't share anything real" | 4/5 |
| 2 | Gloria, 72, retired librarian, reads every word, thinks in "probably" | Fresh install | 390 × 844, light, 135% | **Unsure**: "nobody scolded me, but I'll have to ask Danny what a Brier score is" | 3/5 |
| 3 | Leo, 24, social anxiety, logging fears for a therapist's exercise | Fresh install | 390 × 844, dark | **Unsure**: "'0 happened' is the point, but nothing in it knows these are fears" | 4/5 |
| 4 | Darnell, 35, warehouse shift lead, dyslexic, five months in, lunch break | Demo data | 320 × 568, light | **Unsure**: "every straight question gets a paragraph and two numbers that look the same" | 3/5 |
| 5 | Fatima, 39, pharmacist, three kids, one-handed, interrupted | Run 4's data | 390 × 844, dark | **Loses things** (on web): drafts vanish on reload; answers always stick | 3/5 |

**What landed.** The "about 7 times in 10" under every percentage was what made
the numbers usable for Gloria, and the line "It isn't about being right. A 60%
call that doesn't happen isn't a mistake" was the single most reassuring thing
she and Leo read. Answer wording is neutral ("Recorded: it didn't happen", no
red, Yes and No alike), the streak never threatens a loss, and the same-day
warning on "Answer it now" was called "clear and calm" (run 3). Log's track
record ("Your 80–100% calls in work: 14 of 20 happened") made Darnell drop from
80% to 70%: "That line's the best thing in here." Resolve all 3 and its "All
caught up. 3 answered. 2 happened. You expected 1 or 2." were fast and short.
An answer was never lost to back, reload or close, and the note survived
leaving without Done (run 5). Dark mode measured 5.6:1 or better throughout.
No console errors from app code.

## Fixed the same night (step 153)

| Finding | Run | Fix |
|---|---|---|
| Reopening an answered prediction (a reload after a mis-tap) showed "Already resolved. This prediction has already been recorded.": no answer named, no way to change it, and Close went to Today | 5 | Resolve shows the answer's own details in its place, as History does: "It didn't happen, answered Thu, Nov 5", the 24-hour window and "Change to" while it's open |
| The first answer said "A 85% call should come true about 9 times in 10", where the slider says "8 or 9 times in 10" | 3 | "An 85% call should come true 8 or 9 times in 10": the slider's own words, and "an" before 8, 11, 18 and 80–89 |
| At 135% text a long title lost its last words on Today and History ("…by my appointment on" lost "Monday") | 2 | Titles take up to 6 lines above a 1.15 text scale, 3 below (DESIGN_SYSTEM §7.11) |
| The chart's caption said "Only a dot outside its bar leans", while the Warm-up's headline, which reads all ten together, said "no clear lean" over a dot outside its bar | 3 | "A dot inside its bar is as close as luck allows." |
| Delete sat 6pt under "Answer it now" in an open prediction's details | 2 | Set apart (it still asks first) |
| The sign-in sheet said only "Everything already on this phone moves into your account", to someone whose notes are private | 3 | "…moves into your account, notes included, so another phone can restore it. We don't read or share it.", as the privacy policy §2.2 says |
| The week recap said "They come due within the week" of one due exactly seven days out | 1 | "…in the next 7 days" |

## Decisions for the owner

| Finding | Runs | Note |
|---|---|---|
| **Today's identity line names the weakest gated tier second** ("Forecaster in personal" over Work, higher on every number). Darnell's main category was hidden until he unticked Personal on the card | 4 (and 5 runs over the two rounds before) | By design (`shareLines`). Six runs over three rounds have now read it as a mistake |
| **A category's score shows at 15 resolved, its badge at 20**, so Social reads "Score 94" beside "Getting started" while Health's 94 is Sharp; How scoring works gives 20, 15 and 10 as thresholds | 2, 4 | `MIN_N_CATEGORY` 15 vs the badge's 20. Options: one number (20) for both, or say on the row why a 94 has no badge yet |
| **Too much text for lay readers.** How scoring works is 799 words, with "Brier", "squared gap", "base rate" and "at its low end"; the Badges paragraph is 12 lines at 320 pt before the tier list; every Resolve answer carries a 4-line sentence with two close percentages ("79%, against the 69%"); Insights is 4.3 screens on an SE | 2, 4 | Options: the tier list first under Badges, then the paragraph; a one-line Resolve read ("Your 60–80% calls: 41 of 52 happened") with the percentages on tap; a plain summary atop How scoring works |
| "Which category am I best at?" isn't stated anywhere, and "Am I getting better?" is one grey line between the give-or-take and the 0.22 vs 0.23 Brier line | 4 | Joins the identity-line decision |
| **Nothing real to share on day 0.** The card needs 20 answers, the week recap's Share is disabled, and the Warm-up card is all there is; the friend's card that brought Zoe in is weeks away | 1 | Growth loop (GROWTH §7). Options: a shareable first-week card ("3 calls on the way"), or the Warm-up card styled like the identity card |
| **The built-in categories read as adult** (Work, Finance; no School, Sports or weather), and renaming lives only in You → Categories | 1, 2 | D39 lets anyone rename or add. Option: an "Add your own" chip at the end of Log's categories |
| **Visual confirmation after Save.** The sheet closes and the new card can land below the fold (Gloria, Fatima; Priya last round). VoiceOver hears "Saved." since step 152 | 1, 2, 5 | Options: scroll Today to the new card and flash it, or a brief "Saved" line |
| Today on a phone with the sign-in card and practice row shows none of the upcoming predictions without scrolling | 2, 5 | Same as last round's decision; the 30-day sign-in card is the new contributor |
| **Due-date chips don't fit "by Sunday" or "this week".** "In a week" saved a Friday quiz as next Wednesday, a "this week" gym goal as next Thursday | 1, 5 | Joins the "tomorrow in the title" decision. Option: a "This weekend"/day-of-week row |
| **Lock-screen privacy.** A due reminder shows the prediction's title ("My friend is cancelling because she's upset with me · You said 75%") | 3 | Option: a "Hide titles in reminders" switch under Due-day reminders |
| **Fears and hopes.** Leo's use (a CBT behavioural experiment) works only if every prediction is a fear; nothing can say "your fears came true 1 in 6 times", and "Surest thing that didn't: 85%" frames the best news of the week as a miss | 3 | Product question, not a fix: a per-prediction "fear" mark, or a note in How scoring works that a fear that doesn't happen is good news |
| The first ±5 starts from 75% on the Warm-up and 50% on Log, so Gloria's "less sure" landed on 70% and her "probably" on 55% | 2 | D36 by design. Joins the copy points |
| "No clear lean" after 7 or 8 of 10 read as a shrug (Zoe) or as "is that good?" (Gloria) | 1, 2 | Already an open copy point |
| Yes/No and "Answer now" sit in the top half of their sheets; the bottom is empty | 5 | Option: anchor the answer buttons low, as Save is on Log |

## Web only, not fixed

- A typed Log draft is lost on reload, back or ×, with no prompt. On iOS the
  × and a swipe ask first (`useLogDraftGuard`, an action sheet); web has no
  action sheet, and a reload has no iOS equivalent short of the app being
  killed.
- The "+" draws a 32 pt disc; its 44 pt target comes from `hitSlop`, which a
  web measurement of the element doesn't see.
- "Pick a date" is a text box with YYYY-MM-DD, and the reminder time a 24-hour
  "19:00" field, on web; iOS uses the system pickers.
- "Share as text" fails silently in the headless browser (`AbortError`, also
  what a cancelled iOS share sheet returns).
- Prediction details don't say when the reminder comes on web, which sends no
  notifications; iOS shows "with a reminder at 7:00 PM".

## Not reproduced

- Run 4 found How scoring works opening with the Badges heading scrolled off
  the top. At 320 × 568 the jump put the heading at 16 pt from the top on the
  recheck; most likely the web font loaded after the one-time jump.

## Test artefacts, not app faults

- The fresh install's first-run redirect sends any full page load to the
  Warm-up until a prediction exists, so loading the demo on a cleared install
  took a throwaway prediction (logged, the demo loaded, then deleted).
- Run 2's zoom scaled the tab labels with everything else; on iOS they follow
  the system's own tab bar sizing.
