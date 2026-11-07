# Handoff

**Branch:** `builder/expo-fix`, from `master`. `master` was fast-forwarded (locally, not pushed) to include `builder/build-prep` (step 155) and `builder/score-holes` (step 156). Item g of `docs/NEXT_STEPS.md`.

## What this PR did

The Apple Developer account is active (2026-11-07). This gets the code ready for the first iOS development build.

- **Item g:** `npx expo install --fix`: 15 patch updates inside SDK 55 (`expo` 55.0.26 → 55.0.32, `react-native` 0.83.6 → 0.83.10, `expo-router`, `expo-notifications`, `expo-sqlite`, `expo-apple-authentication`, `expo-dev-client` and others). `npx expo install --check` now says the dependencies are up to date. `@react-navigation/native` stays at 7.2.4 (the range became `^7.1.33`).
- **App Store id:** `APP_STORE_ID = '6831917395'` (`src/constants/app.ts`), so text shares end on the product page. That page is live only after release. Also `submit.production.ios.ascAppId` in `eas.json`.
- **The runbook** (`docs/HUMAN_VERIFICATION.md`, Build day): the Supabase Apple provider step and iPhone Developer Mode, which it didn't mention; what's done; EU trader status.

## Owner progress (2026-11-07)

- Paid Applications Agreement submitted (non-exempt payee). Pending approval.
- Identifier `app.fairlysure` registered, App Store Connect record created.
- Supabase Apple provider on, with `app.fairlysure` in Client IDs.
- `npx eas login` done, and the three `EXPO_PUBLIC_*` variables created for `development`.
- Undecided: EU trader status (DSA).

## In progress / broken

Nothing. Not yet built on EAS. `npm install` reports 35 audit warnings. They're in dev and build tooling and weren't introduced here, so they were left alone: `npm audit fix --force` would break SDK pins.

## Next step

- **Owner:** `npx eas build --profile development --platform ios`, then install it, `npx expo start --dev-client`, then Batch C and D.
- **Agent:** whatever the device build turns up, then step 157 (D46, `MIN_N_CATEGORY` 15 → 20), 158 and 159, per `docs/NEXT_STEPS.md`.
- **Owner, still open:** apply `supabase/migrations/008_title_edited_at.sql`, then the agent flips `TITLE_EDIT_SYNC`.

## Read first

`HANDOFF.md`, `CLAUDE.md`, `BUILD_PLAN.md`, `docs/NEXT_STEPS.md`, `docs/HUMAN_VERIFICATION.md` (Build day runbook).

## Open decisions

- **Owner:** pricing (P1), EU trader status, turning on Pages, the domain, export compliance (`usesNonExemptEncryption`).
- **From the November playtests, undecided:** the identity line naming the weakest category second, a terminology pass, a "hide titles in reminders" switch, a day-0 share card, "this weekend" due chips. D6, D11 and D12.

## Checks

`bash scripts/check.sh` must end in `CHECK PASSED`. It does: 147 suites, 1734 tests.
