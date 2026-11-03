# Handoff

**Branch:** `builder/age-assurance` · **Not merged.**

## What this PR did

Declared Age Range (NEXT_STEPS item i, owner option (a)). On iOS 26+, after the first screen is up, the app asks Apple once per launch until a band is stored. SQLite keeps only the lower and upper bounds (`age_bucket`, migration 010). Web, Android, older iOS, a missing module, a decline, and any error store nothing and change nothing else. Nothing is gated on the band. The band is not synced. Erase and account deletion delete the row. Entitlement: `com.apple.developer.declared-age-range`. Package: `expo-age-range` 0.2.21 (SDK 55). `npx expo install` with no version resolved 58 and was not kept.

## In progress / broken

Nothing in this change is unfinished. There is no device here, so the Apple sheet is untested (HUMAN_VERIFICATION D4). `scripts/check.sh` is not in the repo.

## Next step

This waits on the owner. Buy the $99 Apple Developer account, then do **NEXT_STEPS item g** (SDK 55 dependency drift) on the day of the first EAS build. Do not start g earlier, and do not start item j or UI_ROADMAP D5 (SDK 58) until a device build on SDK 55 has passed Batch C. UI steps through 144 are built.

## Read first

`HANDOFF.md`, `CLAUDE.md`, `BUILD_PLAN.md`, `docs/NEXT_STEPS.md`. For this check: `src/age/ageRange.ts`.

## Open decisions

App name, pricing (P1), privacy-policy hosting, and the RevenueCat Test Store prices (NEXT_STEPS, "Waiting on you"). Age-rating questionnaire: answer **Yes** for age assurance. D6, D8, D11, and D12 in `docs/design/UI_ROADMAP.md` still need the owner. Do not gate any feature on the age band unless the owner decides to; the docs don't require it.

## Checks

`bash scripts/check.sh` must end in `CHECK PASSED`. Until that script exists, `npx tsc --noEmit` and `npm test` are the check, and both must pass.
