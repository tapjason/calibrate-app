# Handoff

**Branch:** `builder/headline-fixes`, from `builder/playtest-11` (2e5cd71, D55–D57 decided), which is from `builder/reopen-and-erase` (step 166). Nothing pushed; the earlier `builder/` branches and `master` are still local only.

## What this PR did

Step 167, the eleventh round's no-decision fixes and a bug `record-auditor` found while checking D55–D57 (`docs/design/BUILT_LOG.md` row 167). JS only: a reload, no new build.
- **The headline names a lean first.** With one side only, Insights' chart title took the largest gap among ranges with 10 or more answers whatever its direction, so "You're well calibrated" could sit over an orange dot. `headlineRange` (`chartTakeaway.ts`) names the largest gap among the ranges that lean; Wrapped's verdict uses it; Trends' correction table sorts leaning rows first, then by gap, before its cut to five.
- **Words:** "1 more scored answer" singular in five places; Trends' rows name a category by its own name (an added one printed its id), wrapping beside its figure.
- **Plus with no connection:** "Plus plans couldn't load. Check your connection, then open this again." on a build with billing; "this build" only for a build without it. Plans start loading before the first paint.
- **The chart to VoiceOver:** each range also says where its dot sits against its grey bar ("75% is below that range."), position words, never a lean word.
- **Review:** `code-reviewer` twice, no blockers; every should-fix done (Trends' sort and names, two more plurals, the label's wording and "just" at a rounded tie, the docs). `record-auditor`: holds (R2, R4, R11). `policy-auditor`: pass.

The branch below, `builder/playtest-11`, holds the eleventh round: the competitor research, its plan, the playtest (`docs/design/research/playtest-2026-11-10.md`) and the owner's D55–D57.

## In progress / broken

- **Seen on web:** the audit's example record at 375 light and 320 dark (the title reads "You're overconfident at 80–100%" where it said "well calibrated"; the chart's label reads "50% is inside that range… 75% is below that range."); a 24-character category in Trends at 320, its name wrapping. Not seen: the one-line style on that row's figure (below).
- **Two web servers are running.** The one on 8097 dates from this morning and serves code from before this step; `web-serve.sh stop` can't find it (its pid file records a Git Bash pid, `docs/tooling-notes.md`), and ending it was refused to the agent. A fresh one runs on 8098 (`PORT=8098`), started before the last style change. Both are node processes whose command line names the port.

## Next step

- **Agent:** steps 168–170 (D55, D56, D57) in `docs/NEXT_STEPS.md`, with `record-auditor`'s conditions written there; then steps 157–159.
- **Owner:** stop the two web servers (ports 8097 and 8098), or allow the agent to; and fix `web-serve.sh stop` for Windows pids if you want it to work unattended.
- **Owner, on the iPhone:** `/device-check` can write the list from BUILT_LOG rows 162–167. New in 167: open Plus in airplane mode from a cold start (the spinner, then the connection line, no flash of it first) and online (the sandbox plans load); VoiceOver on Insights' chart.
- **Owner, before `eas submit`:** the in-app purchases attached to the submission, the Paid Apps Agreement active and RevenueCat's current offering set; otherwise a reviewer sees the empty-plans line (2.1(b)) (`policy-auditor`).
- **Owner:** republish the privacy policy once GitHub Pages is on (its in-app paths and §7 changed in step 166).
- **Not traced:** whether due-day and practice reminders already scheduled are cancelled right after an account deletion, before the next launch (flagged in step 166).

## Read first

`HANDOFF.md`, `CLAUDE.md`, `docs/app-profile.md`, `docs/agent-harness.md`, `docs/NEXT_STEPS.md`, `docs/HUMAN_VERIFICATION.md`.

## Open decisions

- **Owner:**
  - pricing (P1);
  - EU trader status;
  - Pages;
  - the domain;
  - email confirmation for strangers;
  - the 2026-11-08 playtest's group 4 (Insights' hierarchy, the recap's lead) and group 6 (sheet headers, vocabulary, formats); finding 17 there (Share above or below the card's settings);
  - the eighth round's "needs the owner" findings (5, 7 with `expo-localization`, 8–13, 19, 22, 23, 27's note editing, 30–35);
  - the tenth round's findings 7 (rules said after they apply) and 19 (statistical caveats an expert would want);
  - the eleventh round's (`playtest-2026-11-10.md`): findings 3–6, 8, 9, 11, 13–16 and 18–24, and the 90%-plus figure (12). Finding 10's two thresholds is D46 (step 157); the card's dot row in 8 is D47 (step 158);
  - D57's open point, now sharper: dots under 10 answers are coloured by lean while How scoring works says no lean is named below 10, so a leaning dot under 10 can still sit under "You're well calibrated" (`record-auditor`, step 167). Grey below 10, or qualify the title;
  - How scoring works doesn't name the 5-point floor (`direction.ts`), so a dot just outside its bar but uncoloured isn't explained;
  - the Plus card's sample and "what your 80% really means" now repeat free lines (D57 (d), P1); the App Store text's "as you set it" line (D57 (a));
  - from `record-auditor` (2026-11-10): History's "happened" counts same-day Yeses, so it isn't the scored count (R11); an open prediction deleted before its due day isn't counted (finding 6, D45's boundary).

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. It does: 160 suites, 1,875 tests. If `tsc` reports three typed-route errors, the generated route types are a stub; restart the web server after edits under `app/` (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED`. It does.
