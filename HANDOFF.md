# Handoff

**Branch:** `builder/score-holes`, based on `builder/build-prep` (step 155). **Not merged.** Merge build-prep first. Step 156, D45.

## What this PR did

Closes the three ways to game the score that the November blind playtests found (`docs/design/UI_ROADMAP.md` D45, the `CLAUDE.md` Resolution Module).

- **New words make a new prediction.** Changing an open prediction's words sets `title_edited_at`. A change of case, spacing, end punctuation or quote style doesn't (D32's `titleKey`).
  - `scoredFrom(p)` in `src/engine/sameDay.ts` is when the prediction counts as made. Same-day scoring and the earliest due date use it. `created_at` never moves.
  - Edit warns before Save, and the details say "Words changed <date>".
  - SQLite migration `012_score_holes`. Supabase `008_title_edited_at.sql`.
  - Push strips the column while `TITLE_EDIT_SYNC` is false (`forTheServer` in `src/supabase/sync.ts`). Pull keeps the later of the two dates, so a server without the column never clears it.
- **Deleted calls are counted.**
  - Tombstones stay after the push (`pushed_at`; `markDeletionPushed` replaces `clearDeletion`, and `isDeletedHere` replaces `isDeletionPending`).
  - A deletion is marked `counted` by `deletionCounts` in `src/engine/corrections.ts`: a scored Yes or No, or an open prediction deleted on or after its due day.
  - Insights shows `deletedLine`, and both delete confirmations say so first. A guest's tombstones move to the account at sign-in, marked pushed.
- **A "Can't tell" can be answered for a week.**
  - `SKIP_ANSWER_DAYS = 7`, with `skipLastDay` and `canAnswerSkip`. The deadline is never earlier than the day the 24-hour correction window closes, so a late skip can still be undone.
  - `predictionStore.reopen` refuses a skip past the deadline. Resolve's skipped view names the last day, then says it stays Can't tell.
- How scoring works lists all three under "What doesn't count".

## In progress / broken

Nothing in the code. Not web-verified yet: component tests cover the new text and buttons. Existing skips more than a week past due become final once this ships.

## Next step

- **Owner:** apply `supabase/migrations/008_title_edited_at.sql` to the live project, then set `TITLE_EDIT_SYNC` to true. Nothing fails before that.
- **Agent:** step 157, D46: `MIN_N_CATEGORY` from 15 to 20 (`src/types/index.ts`). Check its uses in `trends.ts`, `coachValidate.ts`, `patterns.ts`, `scoringCopy.ts`, `COACH_AGENT.md` and CLAUDE.md, and the tests that assume 15. Then 158 (accessibility) and 159 (Today on a small phone), per `docs/NEXT_STEPS.md`.

## Read first

`HANDOFF.md`, `CLAUDE.md`, `BUILD_PLAN.md`, `docs/NEXT_STEPS.md`, `docs/design/UI_ROADMAP.md` (D45).

## Open decisions

- **Owner:** pricing (P1), turning on Pages, the domain, enrollment (as yourself or a company), and export compliance (`usesNonExemptEncryption`).
- **From the November playtests, undecided:** the identity line naming the weakest category second, a terminology pass, a "hide titles in reminders" switch, a day-0 share card, "this weekend" due chips. D6, D11 and D12.

## Checks

`bash scripts/check.sh` must end in `CHECK PASSED`. It does: 147 suites, 1733 tests.
