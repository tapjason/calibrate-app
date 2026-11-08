# Handoff

**Branch:** `builder/device-fixes`, from `builder/expo-fix` (item g, the App Store id, export compliance). `master` locally holds steps 155 and 156. Nothing pushed.

## What this PR did

Fixes from the first run on the owner's iPhone 17 (2026-11-07, development build over `--tunnel`).

- **Log's header was hidden.** The title field sat over "New prediction" and the ×. Log is now iOS's page sheet (`presentation: 'modal'` in `app/_layout.tsx`), not a formSheet. The likely cause, not confirmed on a device: the keyboard pushing a full-height formSheet up. The swipe-down and the draft guard are unchanged.
- **Categories:** Rename is its own pill button (ink on `surfaceSunken`, no new hue, D33) instead of grey text after the name. The switch is boxed at the row's 44pt height, because on the iPhone it sat above the row's centre (the web build was already centred).
- **Apple sign-in error text:** a provider switched off on Supabase ('Provider (issuer "https://appleid.apple.com") is not enabled') now reads "This way of signing in isn't available right now. Sign in with your email instead." (`authErrorText`).

## In progress / broken

- **Apple sign-in fails on the server:** the Apple provider isn't enabled on the live project, or wasn't saved. That's for the owner to fix, not code.
- **You → Your card alignment:** reported, not yet seen. Waiting on a screenshot.
- Not yet re-checked on the phone: the Log sheet and the switch box.

## Next step

- **Owner:** re-save the Supabase Apple provider; send a screenshot of Your card; reload the app and re-check Log and Categories; the notification checks.
- **Agent:** Your card once the screenshot arrives; then steps 157–159.

## Read first

`HANDOFF.md`, `CLAUDE.md`, `docs/NEXT_STEPS.md`, `docs/HUMAN_VERIFICATION.md` (Build day runbook).

## Open decisions

- **Owner:** pricing (P1), EU trader status, Pages, the domain, custom SMTP or no confirmation for email sign-up by strangers.

## Checks

`bash scripts/check.sh` must end in `CHECK PASSED`. It does: 147 suites, 1735 tests.
