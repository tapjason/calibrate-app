# Handoff

**Branch:** `builder/build-prep` · **Not merged.** Step 155.

## What this PR did

Prepares the first iOS build while the Apple Developer account is pending.

- `scripts/check.sh`, the check this file has always pointed to: `tsc --noEmit`, then `jest --ci`, then `CHECK PASSED`. It stops at the first failure.
- `eas.json` names the EAS environment for each profile (development, preview, production) and requires eas-cli 20 or later, the version on this machine, which accepts the `environment` key. `eas config --profile development --platform ios` accepts it, and showed that EAS has no env vars yet.
- `docs/HUMAN_VERIFICATION.md` Tier 2 has a build day runbook: identifier capabilities, `eas login`, the three `eas env:create` lines (names only), item g, the build, the install. It also lists what's left on purpose: `ascAppId`, the export-compliance declaration (the owner's call), and the privacy-manifest check after the first upload.
- `docs/NEXT_STEPS.md` is re-planned for 2026-11-06 (steps 155–159, then build day). Its Pages note is corrected: `_config.yml` is on master.

No app code changed.

## In progress / broken

Nothing. Baseline: 147 suites / 1712 tests, `CHECK PASSED`.

## Next step

**Step 156, D45: close the score holes.** The plan is in `docs/NEXT_STEPS.md` item 2 under "Suggested order":

- a title edit sets `title_edited_at` (SQLite 012, Supabase 008, behind `TITLE_EDIT_SYNC`), and same-day scoring and the earliest due date measure from it;
- tombstones are kept after a push and counted on Insights;
- a "Can't tell" can be answered up to 7 days past due.

After that come steps 157 (`MIN_N_CATEGORY` 20), 158 (accessibility) and 159 (Today on a small phone). Leave item g and the SDK work for build day, as before.

## Read first

`HANDOFF.md`, `CLAUDE.md`, `BUILD_PLAN.md`, `docs/NEXT_STEPS.md`. For 156: `src/engine/sameDay.ts`, `src/engine/corrections.ts`, `src/db/predictions.ts`, `src/store/predictionStore.ts`, `src/supabase/sync.ts`.

## Open decisions

- **Owner:** pricing (P1), turning on Pages, the domain, enrollment (as yourself or a company), and export compliance (`usesNonExemptEncryption`).
- **From the November playtests, undecided:** the identity line naming the weakest category second, a terminology pass, a "hide titles in reminders" switch, a day-0 share card, "this weekend" due chips. D6, D11 and D12 in `docs/design/UI_ROADMAP.md`.

## Checks

`bash scripts/check.sh` must end in `CHECK PASSED`.
