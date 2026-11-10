# Handoff

**Branch:** `builder/playtest-09b-fixes`, from `builder/limits-fixes` (0967435, the tenth playtest round's write-up). Nothing pushed; `builder/limits-fixes`, `builder/playtest-limits`, `builder/agent-harness`, `builder/device-fixes`, `builder/expo-fix`, `builder/score-holes`, `builder/build-prep` and `master` are still local only.

## What this PR did

Step 162: the findings from the tenth blind playtest round (`docs/design/research/playtest-2026-11-09b.md`) that need no decision. JS only: a reload on the phone, no new build (migration 013 runs on the next start). The full list is the step's row in `docs/design/BUILT_LOG.md`.

- **The Warm-up keeps its answers (finding 1):**
  - Each answer is saved as it's given, in a new device-only table, `warmup_progress` (SQLite migration 013), along with the ids of the questions answered.
  - A reload reopens the quiz at the next question. Kept answers to a different set of questions start it over.
  - Finishing, retaking or erasing drops the table's row.
  - `warmup_started` isn't fired again for a resumed quiz.
  - The quiz clears the chosen answer before the save, so the next question never shows a frame with the last answer still picked.
- **Words:**
  - **How scoring works (7):** now gives D45's floor for answering a Can't tell.
  - **Today's first-answer line (13):** names the reminder's part of the day (`partOfDay`).
  - **The empty week recap (10):** says "Nothing resolved this week." and drops "Log a prediction…" when one is open. "Came due" was false after a Can't tell (record audit).
- **Layout:**
  - **Practice (16):** scrolls Next into view once an answer is picked, and each question opens at its top.
  - **History (17):** the range filter survives a sheet over History and clears only on a tab change (`rangeClearsOnTabState`).
  - **Details (18):** the title is the screen's heading.
- **Tooling:**
  - `setDbForTests` closes the database it replaces. sql.js's fixed heap ran out with one more table.
  - `docs/tooling-notes.md` has the typed-routes stub's cause: any change under `app/` while the web server runs. It also lists the three known require cycles (22).
  - `docs/app-profile.md` R6 now includes D45's floor.
- **Review:**
  - `code-reviewer`: no blockers. All three should-fix items are done: the stale answer frame, practice's kept scroll offset, and a test for the History rule. Its nits are taken too (question ids on the kept answers, stale comments, the payload comment).
  - Not taken: an intro or "picking up where you left off" line on a resumed Warm-up. That's new copy.
  - `record-auditor`: HOLDS, no blocker. The recap wording, the exact floor wording, the R6 profile line and an isolation test are all done.

## In progress / broken

- **Seen on web** (2026-11-09, 320 × 568):
  - A reload at Warm-up question 5 reopens at 5, and finishing saves ten answers with no progress left.
  - History's range survives the Log sheet and clears on a tab change.
  - Practice's Next moves from 584 to 553 in a 568 window, and question 2 opens at its top.
  - Not seen on web: the copy changes and the details heading (unit tests only).
- **Left as is:**
  - `reopen()` can still put a Can't tell back to pending, which has no deadline. No screen calls it, so restrict it to skips or delete it before one does (record-auditor, and the step-161 review).
  - Deleting a signed-in account leaves the Warm-up rows (`warmup_results`, `warmup_progress`) on the phone, as `warmup_results` already did; Erase clears both. A question for `policy-auditor`.
  - At the largest text sizes, when the confidence control and Next together are taller than the screen, revealing Next cuts off the control's top. The Warm-up has the same limit.

## Next step

- **Owner, on the iPhone** (reload; `/device-check` can write the full list):
  1. Start a fresh Warm-up, close the app at question 5 and reopen: it continues at question 5.
  2. Practice at the largest text size: picking an answer brings Next into view inside the sheet, and question 2 opens at its top.
  3. History from an Insights range, then "+" and close: the range stays. Change tabs and come back: it's gone.
  4. VoiceOver's heading rotor on a prediction's details lands on its title.
  5. With no answers yet and the reminder at 8 AM, Today says "Your first answer: tomorrow morning".
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
  - finding 17 there: Share above or below the card's settings.
  - from `record-auditor`:
    - say in D45 that an answered Can't tell gets its own 24-hour correction window from the Yes or No;
    - whether to accept that the skip week and same-day rule use the device clock;
    - what `reopen()` should do to a skip.
  - the eighth round's "needs the owner" findings (5, 7 with `expo-localization`, 8–13, 19, 22, 23, 27's note editing, 30–35).
  - the tenth round's (`playtest-2026-11-09b.md`):
    - 1 (keep an unsaved Log draft);
    - 2 (per-category plain counts before 15, a date estimate);
    - 3 (card defaults for own-named categories, reminders without titles);
    - 4 (coming back after a gap);
    - 5 (where ±5 starts, D36);
    - 6 (after a miss);
    - 7–9 (one save model, "resolved", the 70/85/90 labels);
    - 10 (the card and recap headlines);
    - 11–15, 19, 20.

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. It does: 156 suites, 1,823 tests. If `tsc` reports three typed-route errors, the generated route types are a stub; restart the web server after edits under `app/` (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED`. It does.
