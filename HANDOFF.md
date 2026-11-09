# Handoff

**Branch:** `builder/limits-fixes`, from `builder/playtest-limits` (ddd4952, the eighth playtest round's write-up). Nothing pushed; `builder/playtest-limits`, `builder/agent-harness`, `builder/device-fixes`, `builder/expo-fix`, `builder/score-holes`, `builder/build-prep` and `master` are still local only.

## What this PR did

Step 161: the findings from the eighth blind playtest round (`docs/design/research/playtest-2026-11-08b.md`) that need no decision. JS only: a reload on the phone, no new build. The full list is the step's row in `docs/design/BUILT_LOG.md`.

- **Record safety (findings 1, 2, 4, 6, 25):**
  - Save tapped three times in one frame saves once (`submittingRef`).
  - "Answer it now" on a Can't tell writes nothing until Yes or No. The store then reopens and answers in one transaction (`resolve(…, { answeringSkip: true })`, through `unskipPrediction`, which only touches a row still skipped), still held to D45's week. "Leave it as can't tell" backs out, and VoiceOver hears both changes.
  - Chip taps wait 400 ms after "N more" or "Show fewer" (new), so a double tap can't choose the chip that slid under it.
  - Text limits count and cut by character as a person sees it (`src/engine/graphemes.ts`, reached through `src/store/text.ts`). An edit at the limit trims only what was typed or pasted (`fitEdit`), never the end of the text.
  - Two ±5 taps before a render move twice.
- **Stale or missing (3, 13, 20, 21):** Today's identity line follows a rename; a second tap on any tab scrolls to the top (`useScrollToTop`); History lists only categories with predictions, plus the chosen one; Edit asks before a changed draft is swiped away (`useEditDraftGuard`).
- **Large text and narrow screens (14, 16, 17, 18, 26, 27):**
  - You's switch goes under a label that can't share its line, at the trailing edge.
  - The range cells wrap before two counts touch.
  - The 70/85/90 marks hug their ticks, at most 1.5× size.
  - An edge-pinned n= label is checked where it is drawn.
  - Categories puts Rename and the switch on their own line under a name they'd cut.
  - Insights' badge pills share the widest one's width at the current text size.
  - A typed emoji icon starts at the text edge.
  - On web, the note box grows.
- **Words (11, 28, 29):**
  - Counts and streaks are grouped ("1,001-day streak") on Today, Insights, the card subline and the recaps.
  - A built-in name at a phrase start is capitalised ("Furthest off: Finance.").
  - Section counts say "predictions".
  - "Answer now" carries the early warning as its hint.
  - The icon button names the current icon.
- **Not changed:** the details screen still reads what you said before the title (DESIGN_SYSTEM §7.10, deliberate).
- **Review:**
  - `record-auditor`: HOLDS, no blocker. Its race (a sync landing between the check and the reopen) is closed with a single guarded statement, its count-format mismatch is fixed, and it asked for a same-day skip test, which is added.
  - `code-reviewer` round 1: no blockers. All four should-fix items are done: the edit-aware cut, the pill-width ratchet, the VoiceOver announcements and the race. Three nits were taken too.
  - `code-reviewer` round 2: no blockers. Its should-fix is done: the `fitEdit` tests also run without `Intl.Segmenter`, the path the phone likely takes. Its backspace guard (a deletion from a value already over the limit goes through) is taken too. Not taken: the pill width still only grows at one text size until the screen remounts; harmless while "Getting started" is the longest tier.

## In progress / broken

- **Seen on web** (2026-11-08), before the round-1 review fixes, at 320 wide and 200% zoom with a 1,001-day record: Categories with long names, Insights' range cells, score scale, chart labels and badge pills, You's switch rows, History's filters and the tab re-tap. Screenshots are in `.playwright-mcp/limits-fixes/` (git-ignored).
  - The review fixes were not re-seen: the automation browser came back with an empty profile, so the switch's trailing edge on its second line hasn't been looked at.
- **Left as is (review notes):**
  - The store's `reopen` is no longer called by any screen, but it can still reopen a Yes or No (three store tests use it). Restrict it to skips or delete it when those tests are reworked.
  - Notification bodies and VoiceOver excerpts still cut titles by UTF-16 unit (`src/notifications/copy.ts`, `src/components/ui/textLanguage.ts`), which was already so; `fitGraphemes` can fix them.
  - "N more" and "Show fewer" unmount themselves, so VoiceOver focus has nowhere to go.
  - The chart's "n=" labels aren't grouped.
- **Hermes:** `Intl.Segmenter` likely isn't there, so the phone uses `splitGraphemesFallback` (tested for emoji, flags, keycaps and accents; stricter for Indic and Hangul). `localCount` falls back to plain digits if `Intl.NumberFormat` is missing.

## Next step

- **Owner, on the iPhone** (reload; `/device-check` can write the full list):
  1. At the largest Larger Text size: You's switch rows, Categories with a long name, Insights' range cells, the 70/85/90 scale and the badge pills, then lower the size again and check the pills shrink.
  2. Double-tap "N more" in Log; double-tap +5.
  3. Type a family emoji at a category name's limit; type in the middle of a full title; type Chinese or Japanese near a limit (does composition survive?).
  4. Mark a prediction Can't tell, tap "Answer it now", then "Leave it as can't tell": it stays Can't tell.
  5. Edit an open prediction, change the title, swipe the sheet down: "Discard changes" is offered.
  6. Tap each tab twice after scrolling.
  7. A category with an emoji icon: it lines up with the text edge.
- **Agent:** steps 157–159; the playtest's "needs the owner" findings wait on `/design`.

## Read first

`HANDOFF.md`, `CLAUDE.md`, `docs/app-profile.md`, `docs/agent-harness.md`, `docs/NEXT_STEPS.md`, `docs/HUMAN_VERIFICATION.md`.

## Open decisions

- **Owner:**
  - pricing (P1);
  - EU trader status;
  - Pages;
  - the domain;
  - email confirmation for strangers;
  - the 2026-11-08 playtest's group 4 (Insights' hierarchy, the 70/85/90 meter's label, the recap's lead) and group 6 (sheet headers, vocabulary, formats);
  - finding 17: Share above or below the card's settings.
  - from `record-auditor`: say in D45 that an answered Can't tell gets its own 24-hour correction window from the Yes or No (the code and `corrections.ts` already read it so); and whether to accept that the skip week and same-day rule use the device clock.
  - the eighth round's "needs the owner" findings (5, 7 with `expo-localization`, 8–13, 19, 22, 23, 27's note editing, 30–35).

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. It does: 156 suites, 1,809 tests. If `tsc` reports three typed-route errors, the generated route types are a stub (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED`. It does.
