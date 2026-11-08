# Handoff

**Branch:** `builder/device-fixes`, from `builder/expo-fix` (item g, the App Store id, export compliance). `master` locally holds steps 155 and 156. Nothing pushed.

## What this PR did

Fixes from the first run on the owner's iPhone 17 (2026-11-07, development build over `--tunnel`).

- **Log's header was hidden.** The title field sat over "New prediction" and the ×, with no keyboard up (owner's screenshot). Two changes: Log is iOS's page sheet (`presentation: 'modal'` in `app/_layout.tsx`), not a formSheet, and the title row is the first thing inside the form's scroll view (`header` prop on `LogPredictionForm`), so nothing can be laid over it. Likely cause: react-native-screens resizes a formSheet's scroll view to the whole sheet and, on the new architecture, can put it at the top (`RNSScreenContentWrapper.mm`, `coerceChildScrollViewComponentSizeToSize`). The swipe-down and the draft guard are unchanged; the × now scrolls with the form, as on Your card.
- **Categories:** Rename is its own pill button (ink on `surfaceSunken`, no new hue, D33) instead of grey text after the name. The switch is boxed at the row's 44pt height, because on the iPhone it sat above the row's centre (the web build was already centred).
- **Apple sign-in error text:** a provider switched off on Supabase ('Provider (issuer "https://appleid.apple.com") is not enabled') now reads "This way of signing in isn't available right now. Sign in with your email instead." (`authErrorText`).

## In progress / broken

- **You → Your card alignment:** reported, not yet seen. Waiting on a screenshot.
- Confirmed on the phone (2026-11-07): Apple sign-in works; Log's form no longer overlaps its header. Not yet re-checked: the switch box, and the Practice sheet (same header-beside-scroll shape as the old Log, not reported).
- **Switches (You):** the device screenshot with a dev-only frame outline showed the iOS 26 switch (63 × 28pt) is drawn exactly in its measured frame and centred in the row, between the label and a two-line description, lining up with neither. Each switch row now puts the switch on the label's line with the description full width beneath (`ToggleRow`). Every switch goes through `src/components/ui/ToggleSwitch.tsx`; the outline is removed. Categories (one-line rows) not yet re-checked.

## Next step

- **Owner:** re-save the Supabase Apple provider; send a screenshot of Your card; reload the app and re-check Log and Categories; the notification checks.
- **Agent:** Your card once the screenshot arrives (on web at 402pt it renders as designed, so it's native-only); the switches if the box didn't do it; then steps 157–159.

## Read first

`HANDOFF.md`, `CLAUDE.md`, `docs/NEXT_STEPS.md`, `docs/HUMAN_VERIFICATION.md` (Build day runbook).

## Open decisions

- **Owner:** pricing (P1), EU trader status, Pages, the domain, custom SMTP or no confirmation for email sign-up by strangers.

## Checks

`bash scripts/check.sh` must end in `CHECK PASSED`. It does: 147 suites, 1735 tests.
