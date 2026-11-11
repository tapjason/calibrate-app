# Handoff

**Branch:** `builder/habit-repeats` (step 169), from `builder/plain-counts` (9597296, step 170), from `builder/due-date` (6b603fb, step 168), from `builder/headline-fixes` (5f7dbce, step 167), from `builder/playtest-11` (2e5cd71, D55–D57 decided), from `builder/reopen-and-erase` (step 166). Nothing pushed; the earlier `builder/` branches and `master` are still local only.

## What this PR did

Step 169, D56 (`docs/design/BUILT_LOG.md` row 169). JS only: a reload.
- **Said once:** Answer it now on a same-day prediction says the rule with the evening-before advice; Resolve opened from there (`?warned=<today>`) doesn't repeat its note; every other route keeps it.
- **After the answer:** "Not scored: you logged it today. Log the next one now, and its answer is scored from tomorrow." with "Log it again, due tomorrow" right under it, the same after Yes and No.
- **Log it again** names its date, and History's answered details offer it at any time; "Logged again, due …" on both screens while the same words are open.
- **Reminders:** a delivered reminder whose prediction changed, or whose answer would be same-day, opens the question instead of recording (`CLAUDE.md` Notification Service).
- **Review:** `code-reviewer`, no blockers; both should-fix items done (a repeat due today read as a bare date; the `warned` day check moved into a tested helper). `record-auditor` holds twice; round 2 caught a delivery-time check that iOS (seconds, not ms) would have turned into blocking every reworded prediction's one-tap answer, dropped as redundant with the date check.

Below it, step 170, D57 (`docs/design/BUILT_LOG.md` row 170). JS only: a reload.
- **Log's track record from 5:** "Of your 6 scored calls at 40–60%, 3 happened. Too few to read yet."; from 10 in the same shape ("Of your 21 scored work calls at 60–80%, 12 happened.").
- **Inside luck:** "You're well calibrated" only when every range with 10 or more is within 5 whole points; else "No clear lean at 60–80%" / "…in any range yet", with "your numbers expected about 14". The year recap, the Plus sample and the counts table agree. Today shows these reads, with its dot from the read's direction and none for a read both ways.
- **A lean** adds "You said about 88%; about 60% would have matched."; both sides one figure each. **Zero:** "No answers were Can't tell."
- **Review:** `code-reviewer`, no blockers, its should-fix items done (the sample's luck clause, Today's dot, the all-time line tested) and most nits. `record-auditor` round 1 BROKEN (the sample's luck clause, "well calibrated" judged on one range, Today's green dot by a two-sided read), round 2 BROKEN (the year recap), all fixed; the last fix is unit-tested, not re-audited.

Below it, step 168, D55 (`docs/design/BUILT_LOG.md` row 168). JS only: a reload.
- **Tomorrow:** every new prediction on Log starts on Tomorrow, after a save too; a starter idea and "Log it again" bring their own date.
- **Save names the date:** "Save, due tomorrow" / "Save, due Sunday" / "Save, due Tue, Nov 17", VoiceOver "Save prediction, due Tuesday, November 17"; the store's clamped date (`dueDateSavedAt`), moving on at midnight; worded by `dueWords`, for step 169 too.
- **Review:** `code-reviewer`, no blockers; the should-fix (a loose test pattern) and four nits done (the midnight test checks the chips, a long date may break after the weekday's comma, a picked date the calendar catches up with follows the clamp, the wording memoised, one shared day helper). Not re-reviewed: the fixes were small. Not taken: making the spoken label start "Save, due …" for Voice Control (D55 decided "Save prediction, due …"; both start with "Save").

Below it, step 167:

Step 167, the eleventh round's no-decision fixes and a bug `record-auditor` found while checking D55–D57 (`docs/design/BUILT_LOG.md` row 167). JS only: a reload, no new build.
- **The headline names a lean first.** With one side only, Insights' chart title took the largest gap among ranges with 10 or more answers whatever its direction, so "You're well calibrated" could sit over an orange dot. `headlineRange` (`chartTakeaway.ts`) names the largest gap among the ranges that lean; Wrapped's verdict uses it; Trends' correction table sorts leaning rows first, then by gap, before its cut to five.
- **Words:** "1 more scored answer" singular in five places; Trends' rows name a category by its own name (an added one printed its id), wrapping beside its figure.
- **Plus with no connection:** "Plus plans couldn't load. Check your connection, then open this again." on a build with billing; "this build" only for a build without it. Plans start loading before the first paint.
- **The chart to VoiceOver:** each range also says where its dot sits against its grey bar ("75% is below that range."), position words, never a lean word.
- **Review:** `code-reviewer` twice, no blockers; every should-fix done (Trends' sort and names, two more plurals, the label's wording and "just" at a rounded tie, the docs). `record-auditor`: holds (R2, R4, R11). `policy-auditor`: pass.

The branch below, `builder/playtest-11`, holds the eleventh round: the competitor research, its plan, the playtest (`docs/design/research/playtest-2026-11-10.md`) and the owner's D55–D57.

## In progress / broken

- **Seen on web:** the audit's example record at 375 light and 320 dark (the title reads "You're overconfident at 80–100%" where it said "well calibrated"; the chart's label reads "50% is inside that range… 75% is below that range."); a 24-character category in Trends at 320, its name wrapping. Not seen: the one-line style on that row's figure (below).
- **Seen on web for 169:** at 320, a walk logged that morning: Answer it now's one warning, Resolve with no second note, the advice with "Log it again, due tomorrow" under it after Yes and after No, Log opening with the title and "Save, due tomorrow", History's "Logged again, due tomorrow." and "Log it again, due tomorrow".
- **Seen on web for 170:** Farah's record (21 at 66%, 12 happened) on Insights at 375 ("No clear lean at 60–80%", "your numbers expected about 14", "No answers were Can't tell."), the same read on Today, Log's thin line at 320, and a leaning record in dark at 320 ("You said about 88%; about 60% would have matched.").
- **Seen on web for 168:** Log at 320, light and dark: a first and a second prediction both on Tomorrow, "Save, due tomorrow", and "Save, due Tue, Nov 17" on one line for In a week.
- **The web server** on 8097 was started this session for step 168; the two stale ones were stopped at the owner's word. `web-serve.sh stop` still can't find a server on Windows (`docs/tooling-notes.md`).

## Next step

- **Agent:** steps 157–159 in `docs/NEXT_STEPS.md` (all three eleventh-round steps, 167–170, are built).
- **Owner:** decide whether `web-serve.sh stop` should be fixed for Windows pids, so it works unattended.
- **Owner, on the iPhone:** `/device-check` can write the list from BUILT_LOG rows 162–168; the new checks for 167–168 are in `HUMAN_VERIFICATION.md` Batch C (2026-11-10): Save's label at large text sizes and VoiceOver, Plus in airplane mode, the chart's VoiceOver label.
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
  - from step 169's reviews: the same-day advice line inside a run would say "Log the next one now" with no button (runs hold due predictions, so only a synced or time-zone edge reaches it); a sheet left open past midnight names yesterday's "tomorrow" until it re-renders (Log's Save names the true date);
  - from step 170's reviews: a green "on the line" dot beside "No clear lean…" on Today (the words claim less than the colour); "would have matched" rounded to 5 can sit near the number said ("You said about 88%; about 85% would have matched"); deleting a Can't tell isn't counted, so a miss skipped then deleted leaves no trace beside "No answers were Can't tell." (D45's boundary); an added category's own name sits before "calls" on Log's line ("Of your 12 scored Side business calls…");
  - D57's open point, now sharper: dots under 10 answers are coloured by lean while How scoring works says no lean is named below 10, so a leaning dot under 10 can still sit under "You're well calibrated" (`record-auditor`, step 167). Grey below 10, or qualify the title;
  - How scoring works doesn't name the 5-point floor (`direction.ts`), so a dot just outside its bar but uncoloured isn't explained;
  - the Plus card's sample and "what your 80% really means" now repeat free lines (D57 (d), P1); the App Store text's "as you set it" line (D57 (a));
  - from `record-auditor` (2026-11-10): History's "happened" counts same-day Yeses, so it isn't the scored count (R11); an open prediction deleted before its due day isn't counted (finding 6, D45's boundary).

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. It does: 163 suites, 1,923 tests. If `tsc` reports three typed-route errors, the generated route types are a stub; restart the web server after edits under `app/` (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED`. It does.
