> **Raw findings, 2026-11-04 (second round that day).** Five blind playtests of
> the web build after step 151, each from an angle the earlier rounds hadn't
> taken. The fixes that needed no decision were built the same day as step 152
> (`BUILT_LOG.md`). The rest are proposals for the owner and haven't been
> decided. Where they differ, `CLAUDE.md`, `DESIGN_SYSTEM.md` and
> `UI_ROADMAP.md` win.

# Blind playtests (November 2026, fourth round)

## Method

Same as `playtest-2026-11-04.md`: each run was a fresh agent with only the
Playwright browser tools, no repo and no docs, given a persona, tasks and a
fixed report format, one after another in one browser. Run 1 started from a
freshly cleared install, run 2 kept its data, run 3 loaded the demo data on
top, and runs 4 and 5 kept what run 3 left. Screenshots are in
`.playwright-mcp/playtest-2026-11-04b/` (gitignored). No run signed in, bought
anything or erased data. Run 2 used the keyboard and the accessibility tree
only, standing in for a screen reader. Run 4 opened the paywall's Terms of Use
link, which went to apple.com in a new tab, and closed it unread; run 5 was
told not to follow links out.

| # | Persona | Start | Screen | Verdict | Ease |
|---|---|---|---|---|---|
| 1 | Priya, 41, nurse manager, wants to keep herself honest on habits (gym, cooking, bedtime) | Fresh install | 320 × 568, light | **Keep**: "It made me admit I'm really 30% on the gym" | 4/5 |
| 2 | Sam, 37, software tester, blind, keyboard and screen reader only | Run 1's data | 390 × 844, dark | **Unsure**: the words are clear, focus keeps dropping | 2/5 |
| 3 | Mia, 30, five months of honest use, back from a week away | Demo data | 393 × 852, light | **Handles it well**: "every slip I made had an obvious undo" | 4/5 |
| 4 | Dana, 33, product manager, deciding whether Plus is worth paying for | Run 3's data | 430 × 932, dark | **Not yet**: the free app is complete and the preview shows nothing new | 4/5 |
| 5 | Dr. Ruth Okafor, 48, professional forecaster, auditing the numbers for her students | Run 4's data | 390 × 844, light | **With caveats**: "honest to the decimal", but the words need care | n/a |

**What landed.** Run 5 re-derived the rating (88.27), every category score,
the Brier score (0.2227) and its baseline (0.230) from the History list, and
all matched to the decimal; every badge followed the stated low-end rule, and
every count reconciled across Insights, History's filters, the card and both
recaps. "Resolve all 3" with its "1 of 3" bar made a backlog feel like two
minutes (run 3); "Change to: …" right under Next and History's "Until 3:27 PM
tomorrow you can change the answer" made slips easy to fix. The paywall's
"Plus adds interpretation, not access", the trial timeline above the button
and an easy close found no dark pattern worth the name (run 4). The Warm-up
result read as kind and honest ("no label stuck on me", run 1). How scoring
works was called the best-written part by the screen-reader user. No console
errors from app code.

## Fixed the same day (step 152)

| Finding | Run | Fix |
|---|---|---|
| History showed a "Can't tell" as "Not scored", the same words as a same-day answer, and a forecaster took it for one for ten minutes | 5 | The row reads "Can't tell, not scored" |
| The recap's averages said "right 78% of the time", and the chart's screen-reader text "you were right 20% of the time", where they mean "happened": a 15% call that doesn't happen isn't wrong | 5 | "68% confident on average, and 78% happened"; "20% of them happened" |
| "Across all 147 answers" on the week card beside Insights' "1 of 148 answers was Can't tell" | 5 | "Across all 147 scored answers" |
| How scoring works: "beat that and your numbers carry real information", on a Brier of 0.22 against 0.23 | 5 | "Beat it clearly and your numbers say more than your base rate does; a gap of a hundredth or two can be luck." |
| With Lifetime or Monthly chosen, the paywall still said "Your free trial turns into a paid subscription", and Lifetime "Subscriptions renew automatically" | 4 | The fine print follows the chosen plan: Lifetime reads "One-time purchase. No subscription, no renewal." |
| "Cancel any time" sat on Monthly only, as if Annual couldn't be cancelled | 4 | Monthly's tag is "Month to month" |
| Plus was "advanced analytics" in You and on the Plus-active screen, "Trends" on the paywall | 4 | "Trends" everywhere |
| Nothing said Coach needs an account, to a signed-out buyer | 4 | The paywall's Coach line ends "once you sign in" |
| After "Change to", a reflection read as the opposite of the answer, with no way to take it off | 3 | "Remove note" under a note in History's details, at any time: a note changes no number and is the person's own words |
| An answer older than a day said when it locked, not why | 3 | "…for a day after they're given, so a miss can't be quietly undone later." |
| The week recap's screen-reader summary left out the badge line, the categories and the two calls | 2 | All of them are in it, leaving off hidden categories and titles as the card does |
| The warm-up card's summary ended "How sure are you?." | 2 | No doubled stop |
| "Answer it now" showed its early-answer warning without a screen reader hearing it | 2 | Announced as it appears |
| Saving on Log closed the sheet with nothing announced | 2 | "Saved." is announced |
| "50% is a coin flip — there are…" in the Warm-up, "…coin flip: there are…" in practice | 1 | The colon in both |

## Decisions for the owner

| Finding | Runs | Note |
|---|---|---|
| **Today on a small phone shows no predictions without scrolling.** At 320 × 568 the Calibrating card, streak row and practice row fill the screen; after saving, Priya couldn't see that it had been saved | 1 | D22 puts what's ready first, then streak and practice. Options: open predictions above practice when nothing is ready, or compact rows below 600 pt tall |
| **Habits that end at night.** "In bed by 11" is reminded at 7 PM (or 9:30 PM, her choice), before it can be known, and Today promised "Your first answer: tomorrow evening". There's no per-prediction time | 1 | Options: a "Next morning" reminder per prediction, or reminding the next morning when the reminder time is past the evening |
| A title that says "tomorrow" saved with the default "In a week" | 1 | By design: the first Log defaults to Tomorrow, later ones to In a week. Option: pick Tomorrow when the title says "tomorrow" or "tonight" |
| "Goal: 1 of 3" doesn't say three of what, or that it's optional; the streak row isn't tappable | 1 | Option: the streak row opens How scoring works at "Your streak", as the identity line opens Badges |
| Habit wording: "prediction", "resolutions", "Calibrating" read as forecasting to someone tracking her own goals | 1 | Product framing, not a fix. Joins the copy points |
| **Today's identity line names the weakest gated tier second** ("Sharp in health · Forecaster in personal", where Work outscores Personal on every number shown). A forecaster called it a selection bug | 5 (and 2, 3, 5 last round) | By design (`shareLines`, the weakest gated category). Four runs over two rounds have now read it as a mistake. Options as before: name the second-best, or keep the contrast for the share card only |
| The overall rating sits on a bar with unlabelled 70/85/90 ticks, so 88 ± 4 reads as "Sharp overall" | 5 | Already an open copy point (the ticks) |
| **The Plus preview sells nothing new.** The sample Coach card repeats Insights' free headline; Trends has no preview; a locked theme jumps straight to the paywall | 4 | Options: a sample on something Insights doesn't say (a category's month-by-month line), a blurred Trends chart, a theme preview with Share locked |
| Annual is preselected on every open, tagged "Best value" | 4 | DESIGN_SYSTEM §7.6 chose it. Mild; no change proposed |
| "Can't tell" in "Resolve all" has no "Recorded" screen and no Change button, so a mistaken tap on the last one lands on "All caught up" | 3 | Options: the same Recorded screen as Yes and No, or a "Change" on the summary |
| Moving a due date "a week later" in Edit: "In a week" counts from today, not from the current due date | 3 | Option: in Edit, the chips count from the current due date |
| Locked answers have no outlet, not even a note | 3 | D34 locks on purpose. Option: a note on a locked answer, which changes nothing |
| "Furthest off: finance … 8 of 17. About 45% would have matched" (8/17 is 47%) | 5 | Rounded to the nearest 5 on purpose (`furthestOffLine`). Option: say the exact figure |

## Web only, not fixed

These matter only if the web build becomes the web Warm-up (FUTURE_UI A8);
on iOS the confidence control is one adjustable element, and an inactive
tab screen should leave the accessibility tree (check with VoiceOver on the
first device build). Recorded for that day:

- A tab left behind stays in the Tab order while hidden: Shift+Tab from the
  tab bar on Today focused You's hidden "Erase all data on this device" (it
  still asks to confirm).
- Sheets open with focus on the page body, with no dialog role; closing one
  leaves focus there; Escape closes none.
- The confidence slider can't take focus and arrow keys don't move it; ±5
  works. Space doesn't pick a category radio (Enter does), and arrow keys
  don't move through radio groups or Share's tabs.
- Every switch in You has a hidden input that is still a Tab stop.
- Every heading is level 1.

## Test artefacts, not app faults

- The practice-reminder offer under a finished practice needs notification
  permission, which web doesn't have (`shouldOfferPracticeReminder`).
- The demo data answers something every day of the week before, so run 3's
  week away never showed a missed day, a rest day or a broken streak. A seed
  with a real gap would test it.
- "Works out to $2.49 a month" and "your 4 months on file" come from the web
  build's stand-in prices and the seed's dates.
- "Share as text" fails in the headless browser (`AbortError`).
