# The owner's UI notes, November 2026

The owner's full list (pasted 2026-11-25), each note with where it stands. Read this before planning
1.2.0 or later. The You page redesign is specified in `YOU_REDESIGN.md`.

Status: **Built** = in 1.1.1 (build 17; the owner, 2026-11-25: "Build 17 should only be 1.1.1"); **1.2.0** = the You page redesign; **1.3.0** = Insights for new users;
**Open** = waits for the owner's answer; **Owner** = his action, no code.

| # | His note | Status | Where / what's left |
|---|---|---|---|
| 1 | Due dates could be clearer (tomorrow, in * days) | Built | D78: "due tomorrow", "due in 3 days", "due Nov 21 (Friday)" everywhere |
| 2 | Insights as a card is too much information for a new user | 1.3.0 | D76 (build 16) shortened the rating block; the new-user Insights (progress bar and one line until 20 scored answers, chart and categories after) isn't built |
| 3 | Use y- and x-axes on the calibration curve instead of describing it in words | 1.3.0 | Axes "What you said" (x) and "What happened" (y); not built |
| 4 | The dots don't make sense at a glance | 1.3.0 | With #3: redo the marks so they read without words; not built |
| 5 | Insights should have less, or move under You? | Open (after 1.3.0) | A tab decision (D3); decide once #2–#4 have slimmed Insights |
| 6 | More generic badge names | Built | D80: Bronze, Silver, Gold, Platinum |
| 7 | The Plus window shows no prices for a new user | Owner; 1.1.1 | The products were MISSING_METADATA; they ship attached to 1.1.1. A "Try again" button when the plans don't load goes into 1.1.1 (his yes, 2026-11-25) |
| 8 | You: remove all the excessive text | 1.2.0 | One line per row at most |
| 9 | "See your week" and the share card above the Plus ad | 1.2.0 on You; 1.3.0 on Insights | On You, in the profile summary above the Plus row. On Insights the buttons still sit below the Plus teaser, Coach and Trends; moved up in 1.3.0 (his call, 2026-11-25) |
| 10 | Differentiate the two options, or condense into one? | 1.2.0 on You; 1.3.0 on Insights | One button (his call, 2026-11-25: both open the same Share sheet, the card and the week as its slides). One "Share" that opens Share; the week is its second slide |
| 11 | Rework the slogan (and the promotional text it affects) | Built; Owner | Card footers "Learn when to trust your gut" (D80); the subtitle and promotional text are his to paste at submission |
| 12 | Delete "Got a friend's card?" | Built | D79 |
| 13 | Sign in / sign out at the bottom | 1.2.0 | The Account section, last |
| 14 | You: a profile summary, then options and settings | 1.2.0 | The profile summary card |
| 15 | Buttons for dark and light mode | 1.2.0 | Appearance: System / Light / Dark. New: needs a stored override of the phone's appearance |
| 16 | So much text in settings | 1.2.0 | As #8 |
| 17 | Add a due date for today | Skipped for now (his call) | An answer on the day it's logged isn't scored (D41), so a due-today prediction couldn't count |
| 18 | New prediction: the due date should be centralised (the bottom icon isn't needed?) | Built | His meaning (2026-11-25): setting a custom date shouldn't take a second tap to open the iOS calendar. D78: "Pick a date" opens the calendar at once. One case still takes a tap: Edit on a prediction that already has a custom date opens folded, the calendar a tap on the chip away (the review of 2026-11-25, so "Save changes" stays on the sheet) |
| 19 | "Add and choose it" more concise | Built | D78: "Add" |
| 20 | Fix the emoji for a new category | Built | D78 |
| 21 | Categories replace Insights for now? | Open (with #5) | |
| 22 | "Pick a date" should open at once | Built | D78; folded again when a picked date reopens (review of 2026-11-25) |
| 23 | Remove "Show the words in reminders" | Built | D79: reminders never show words |
| 24 | Practice: remove, or keep as Trivia (and remove its reminder) | Built | D79: Trivia, reminder gone |
| 25 | All Plus settings in their own place (the Coach switch) | 1.2.0 | The Plus row's page: Coach, Manage subscription, Restore |
| 26 | Analytics into a different setting | 1.2.0 | Usage stats under Advanced (his call, 2026-11-25) |
| 27 | Advanced settings | 1.2.0 | Advanced: Export predictions (CSV) |
| 28 | "+" only on the Today tab | Built | D79 |
| 29 | Categories somewhere more intuitive | 1.2.0 | A Settings row on You; revisit with #21 |
| 30 | "Hide the words" is redundant | Built | D79: removed |
| 31 | "Lock with Face ID" into a Privacy section | 1.2.0 | Privacy: Face ID, Lock after |
| 32 | Categorise settings like WhatsApp (visuals, privacy, account) | 1.2.0 | The whole redesign |
| 33 | Default to 11:59 PM | Built | D80: "due today by 11:59 PM"; the reminder stays 7 PM (his OK) |
| 34 | Time-based things (digest, reminder) into Notifications | 1.2.0 | The Notifications page |

## Order

1. **1.1.1 (build 17):** #1, 6, 11, 12, 18, 19, 20, 22, 23, 24, 28, 30, 33, and #7's "Try again". Owner: #7's
   products, #11's store copy.
2. **1.2.0, the You page:** #8, 13, 14, 15, 16, 25, 26, 27, 29, 31, 32, 34, and #9 on You. Spec: `YOU_REDESIGN.md`.
   He reviews a clickable web mock first (his call, 2026-11-25; not part of 1.1.1).
3. **1.3.0, Insights for new users:** #2, then #3 and #4 together; #9 and #10 on Insights.
4. **Then the tab question:** #5 and #21.

## Waiting on him
Nothing on this list (2026-11-25). #5 and #21 come back after 1.3.0.
