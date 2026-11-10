# Handoff

**Branch:** `builder/playtest-09b-fixes`, from `builder/limits-fixes` (0967435, the tenth playtest round's write-up). Nothing pushed; `builder/limits-fixes`, `builder/playtest-limits`, `builder/agent-harness`, `builder/device-fixes`, `builder/expo-fix`, `builder/score-holes`, `builder/build-prep` and `master` are still local only.

## What this PR did

Branch `builder/before-the-score`, from `builder/miss-and-return` (step 163). Step 164: the owner's "Yes, estimate" on the tenth round's finding 2, recorded as D53. JS only.

- **Per category** (Insights): before its score unlocks, "You said about 90% on average, and 7 of the 9 scored predictions happened. Too few to read yet." (`categoryCounts` in `src/engine/patterns.ts`, `statsStore.categoryCounts`, `CategoryBadge` `counts`).
- **When the rating unlocks** (Today and Insights, while calibrating): "At your recent pace, about 3 weeks (around Nov 30)." (`src/engine/pace.ts`, `statsStore.unlockEstimateFor`, `UnlockProgress` `estimate`). None with fewer than 3 answers in the window; "more than a year" with no date past that.
- **Review:** `code-reviewer`, no blockers; both should-fix items done (Today memoises the estimate and skips it once rated; store-level tests for the filtering), plus the no-break-space and the year span. `record-auditor`: BROKEN on History's and Insights' "happened" disagreeing (same-day answers), fixed by saying "scored" on Insights; its open questions decided as above (a luck clause, a 3-answer minimum, no date past a year).

## In progress / broken

- Seen on web: the Welcome back card with a record back after eight weeks, and the rating line after a No (91 to 90). The fixes after review were not re-seen on web; they're unit-tested.
- The Warm-up's grey thumb now rests at the left end of its 50–100 track: check on the phone that it reads as unset.
- Steps 164 (per-category counts, the rating's date estimate) and 165 (one word for "resolved", the 70/85/90 labels, card headlines) follow on their own branches.

## Next step

- **Owner, on the iPhone:** the first ±5 from empty on the Warm-up and Log (and VoiceOver's first swipe); the line under an answer before and after the rating unlocks, and after Happened/Didn't on a reminder; the Welcome back card after a 15-day gap (date forward) and "Got it".
- **Owner, decisions:** 11–13 from the reply of 2026-11-09 (delete `reopen()`, the two D45 clarifications, clear Warm-up rows on account deletion).

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
