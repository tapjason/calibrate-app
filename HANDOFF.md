# Handoff

**Branch:** `builder/notification-actions` · **Not merged.**

## What this PR did

D8, step 145. A resolution reminder offers Happened and Didn't. Choosing one records that answer once and opens the app on the resolved state (the acknowledgement, the range line, and a milestone or streak checkpoint when this answer earned it). Tapping the notification body still opens the question. Can't tell stays in the app. Web is unchanged.

Already-scheduled reminders are not rescheduled. The next launch registers the category, and the OS attaches the buttons when the reminder is delivered. A reminder that fires before this version has launched once still opens Resolve from a body tap.

## In progress / broken

Nothing in this change is unfinished. There is no device here, so the buttons are untested (`docs/HUMAN_VERIFICATION.md` batch D1). `scripts/check.sh` is not in the repo. Background actions (`opensAppToForeground: false`) are not built (expo#36282).

## Next step

Do not build background notification actions until a device confirms these buttons (HUMAN_VERIFICATION batch D1). The next owner call among the open UI decisions is D6. Do not start NEXT_STEPS item g or j, or UI_ROADMAP D5, before a device build on SDK 55 has passed Batch C.

PR #7 (`builder/age-assurance`) also adds `HANDOFF.md` and the `CLAUDE.md` line that says to read it. Whoever merges second resolves that conflict.

## Read first

`HANDOFF.md`, `CLAUDE.md`, `BUILD_PLAN.md`, `docs/design/UI_ROADMAP.md` (D8). For this change: `src/notifications/scheduler.ts`, `src/components/resolution/ResolvePrompt.tsx`.

## Open decisions

D6, D11, and D12 in `docs/design/UI_ROADMAP.md` still need the owner. D5 waits on a device build. App name, pricing (P1), privacy-policy hosting, and the RevenueCat Test Store prices are in NEXT_STEPS, "Waiting on you".

## Checks

`bash scripts/check.sh` must end in `CHECK PASSED`. Until that script exists, `npx tsc --noEmit` and `npm test` are the check, and both must pass.
