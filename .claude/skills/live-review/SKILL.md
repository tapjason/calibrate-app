---
name: live-review
description: After launch - weekly read of live data with the live-ops-analyst, turned into decisions and steps. Needs App Store Connect exports, crash or review data, RevenueCat charts or Supabase query results pasted in or saved under docs/live/.
argument-hint: "[optional: what the data covers]"
disable-model-invocation: true
---

Review the live app's data. $ARGUMENTS

1. **Data first.** If the user hasn't pasted data or saved files under `docs/live/`, list what to export (`docs/app-profile.md` §14: App Store Connect Analytics (retention, crashes, impressions → installs, campaigns), RevenueCat (trials, conversion), and the two validation queries in `docs/HUMAN_VERIFICATION.md` run in the Supabase SQL editor) and stop. Never query production yourself.
2. **Analyse.** Delegate to `live-ops-analyst` with the data (paths or the pasted text) and the dates it covers.
3. **Route.** For each issue in its table:
   - a design question: a proposed row for `docs/design/UI_ROADMAP.md` §2 (marked open, for `/design`);
   - a bug: a step in `docs/NEXT_STEPS.md` that points to the evidence;
   - an owner action: an item in `docs/HUMAN_VERIFICATION.md` with the exact steps.
4. **Record** a dated file `docs/live/review-<yyyy-mm-dd>.md` with the issues, the watch list and what was routed where.
5. Reply with the top three issues, what you routed, and the owner's list.

Never propose rewarding a confidence, a leaderboard, paywalling a card or showing a number built on noise to lift a metric, and never touch production.
