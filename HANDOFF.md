# Handoff

**Branch:** `builder/playtest-09b-fixes`, from `builder/limits-fixes` (0967435, the tenth playtest round's write-up). Nothing pushed; `builder/limits-fixes`, `builder/playtest-limits`, `builder/agent-harness`, `builder/device-fixes`, `builder/expo-fix`, `builder/score-holes`, `builder/build-prep` and `master` are still local only.

## What this PR did

A stack of five branches, each from the one before, none pushed: `builder/playtest-09b-fixes` (step 162, the tenth round's no-decision fixes) → `builder/miss-and-return` (163, D49–D52) → `builder/before-the-score` (164, D53) → `builder/one-word` (165, D54) → `builder/reopen-and-erase` (166, the owner's decisions 11–13, this one). The owner's calls of 2026-11-09 on the tenth round are D49–D54 in `docs/design/UI_ROADMAP.md` §2; each step's row in `docs/design/BUILT_LOG.md` lists what changed. JS only throughout: a reload, no new build (SQLite migration 013 runs on the next start).

Step 166: `reopen` is deleted (no answer goes back to open); D45 now says an answered Can't tell gets its own 24-hour window and that the phone's clock is accepted; account deletion clears the Warmup and practice from the phone, its confirmation says so, and the privacy policy's in-app paths are corrected (You → …). Reviewed (no blockers) and policy-audited; their fixes are in.

Step 165:
- **Words (D54 a):** "resolve" leaves the screens. "Answer" is any answer; "scored" marks counts behind a score or badge. Done as exact phrase replacements; identifiers, testIDs, routes, notification ids and analytics names are unchanged (code-reviewer checked).
- **Marks (b):** a caption under Insights' score bar, at the score's low end (D35).
- **Headlines (c):** every top-tier category named, two short names at most; "Calibration N/100" leads a card with no badge; the score isn't repeated in the sub-line or the text share; Today's emblem sits on the first line.
- **Review:** `code-reviewer`, no blockers; all five should-fix items done (the last "resolved" in the text share, the repeated score, the emblem, the headline length budget, DESIGN_SYSTEM §7.5), the caption moved to Insights only. `record-auditor`: BROKEN on three wording blockers ("answered" meaning two sets; Wrapped's "Nothing answered" beside History's answered rows; the caption without "at its low end"), all fixed by the answered/scored split and the caption text.
- **Not re-reviewed:** the fixes after each step's review (163, 164, 165) weren't put through a second review round; they're unit-tested and the full check passes.

## In progress / broken

- **Seen on web** (320 wide): the Warm-up resuming after a reload; History's range under a sheet; practice's Next; the Welcome back card and the rating line after an answer; the per-category counts and the estimate; "Ready to answer", "Answer all 3", the marks caption on Insights only, "145 scored", "20 more scored answers…".
- **Left as is:** the year recap's badge row and a week recap of old answers (finding 10's other bullets); an estimate isn't floored by open due dates.

## Next step

- **Owner:** republish the privacy policy once GitHub Pages is on (its in-app paths and §7 changed in step 166).
- **Not traced:** whether due-day and practice reminders already scheduled are cancelled right after an account deletion, before the next launch (policy-auditor and code-reviewer both flagged it as outside step 166).
- **Owner, on the iPhone:** `/device-check` can write the list from the BUILT_LOG rows 162–165 (the Warm-up's resting thumb at the left end, the Welcome back card, the rating line after a reminder's buttons, the card with long names, VoiceOver on the new lines).
- **Agent:** steps 157–159.
- **Owner:** the eleventh playtest round (people from other goal apps) ran 2026-11-10 on branch `builder/playtest-11`: `docs/design/research/playtest-2026-11-10.md`, from the competitor research in `competitors-2026-11.md` and the plan in `round11-plan-2026-11-10.md` (eight new personas in `app-profile.md` §10, plus a "What they use now" axis). Median 6/10, seven unsure. Its "needs the owner" findings join the open decisions; the no-decision ones are 10 (a plural), 17 (Plus offline), 25 and 27. The six seed scripts are in `.playwright-mcp/` (gitignored).
- **Decided 2026-11-10 (owner):** D55 (Log starts on Tomorrow; Save names the date), D56 (the same-day rule said once; "Log it again" on History's answered details), D57 (Log's track record from 5; "No clear lean" headlines with expected counts; "would have matched" for leaning ranges; the zero Can't tell line). `record-auditor`'s pre-build check also confirmed a bug with no decision: the chart's headline can say "well calibrated" over a leaning range. **Agent:** steps 167–170 in `docs/NEXT_STEPS.md` (167 first). Still the owner's from this round: findings 3–6, 8, 9, 11, 13–16 and 18–24, the 90%-plus figure (12), the colour of a range under 10 (D57's open point), and the Plus sample now repeating free lines. Finding 10's two thresholds is already D46 (step 157), and the card's dot row in 8 is D47 (step 158).

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
