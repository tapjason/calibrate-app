# Handoff

**Branch:** `builder/privacy-policy-url` · **Not merged.**

## What this PR did

Set `PRIVACY_POLICY_URL` to `https://tapjason.github.io/calibrate-app/privacy/`. Once the owner turns GitHub Pages on for `master` / `docs`, that URL is `docs/PRIVACY_POLICY.md` (`permalink: /privacy/`). `docs/_config.yml` publishes only that page and a one-line index, so the rest of `docs/` is not a site and Liquid in the research notes cannot fail the build. Paywall and Settings show the Privacy link. The policy's effective date is November 2, 2026, and it describes CSV export as free.

## In progress / broken

The link is in the app and **404s until Pages is enabled on `master`**. Do not enable Pages before this commit is on `master`: without `docs/_config.yml` the build processes every Markdown file (and can fail) and `/privacy/` does not exist. `scripts/check.sh` is not in the repo.

## Next step

Merge, then immediately: GitHub → the repo → **Settings** → **Pages** → **Build and deployment** → Source **Deploy from a branch** → Branch **`master`**, folder **`/docs`** → Save. Open `https://tapjason.github.io/calibrate-app/privacy/` and confirm the policy renders (HTML, not raw Markdown, not a 404). Also open `https://tapjason.github.io/calibrate-app/HUMAN_VERIFICATION` and confirm it 404s. Do not change the Pages setting from the agent. The steps are in `docs/HUMAN_VERIFICATION.md` (Batch E).

## Read first

`HANDOFF.md`, `CLAUDE.md`, `BUILD_PLAN.md`. For this change: `src/constants/app.ts`, `docs/_config.yml`, `docs/PRIVACY_POLICY.md`.

## Open decisions

App name, pricing (P1), and the RevenueCat Test Store prices (NEXT_STEPS, "Waiting on you"). PRs #7 (`builder/age-assurance`) and #8 (`builder/notification-actions`) also add `HANDOFF.md` and the `CLAUDE.md` line; whoever merges second resolves that conflict. Do not start NEXT_STEPS item g or j until a device build on SDK 55 has passed Batch C.

## Checks

`bash scripts/check.sh` must end in `CHECK PASSED`. Until that script exists, `npx tsc --noEmit` and `npm test` are the check, and both must pass.
