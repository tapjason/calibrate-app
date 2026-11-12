# Handoff

**Branch:** `builder/playtest-setup` (playtest profiles and personas, 2026-11-12), from `builder/log-safe-top` (1851d9d, Log's top inset), from `builder/today-small` (1c6d0ae, step 159), from `builder/a11y-marks` (b72a941, step 158), from `builder/category-twenty` (8511b77, step 157), from `builder/habit-repeats` (34d3055, step 169), from `builder/plain-counts` (9597296, step 170), from `builder/due-date` (6b603fb, step 168), from `builder/headline-fixes` (5f7dbce, step 167), from `builder/playtest-11` (2e5cd71, D55–D57 decided), from `builder/reopen-and-erase` (step 166). Nothing pushed; the earlier `builder/` branches and `master` are still local only.

## What this PR did

Step 159, D48 (`docs/design/BUILT_LOG.md` row 159). JS only: a reload.
- **Order:** with nothing ready, the open predictions come before the streak, backup nudge and practice rows; with something ready, the daily rows follow it as before. The reminder ask stays under the score either way (owner).
- **After a save,** Today scrolls to the new card only when it isn't all on screen, and only as far as needed (its bottom just above the tab bar; just below the top when above the view or too tall), both the owner's calls. The mark comes from Log's save (`justSavedId`), and every other tab drops it, so a sync pull or a save over another tab never moves Today.
- **Review:** `code-reviewer` three times, no blockers. Round 1: an explicit save mark instead of a 60 s window, the wrong "Log it again" route in the docs, and the two owner questions (the reminder ask's place, scroll only when out of view). Round 2: the Day-0 scroll with the reminder ask on a real iPhone (owner: just into view), and the mark not dropped over You. All done; round 3 clean.

Below it, step 158, D47 and D58 (`docs/design/BUILT_LOG.md` row 158). JS only: a reload.
- **The luck bars** are outlined in `textTertiary`, 4.6:1 or better on every chart background, light and dark.
- **The card's strip** runs between "0%" and "100%" with a ring (on the line), ▲ (came true more often than said), ▼ (less) and a dash (empty), no key; VoiceOver hears it in the card's label.
- **D58, no lean mark under 10** (owner, during the build): a grey dot on the chart (the Warm-up's too), a small grey dot on the card, ⬜ in the text share; the caption adds "A grey dot has fewer than 10 answers, too few to read yet." while one is drawn; the strip and squares wait until some range has 10.
- **Review:** `code-reviewer` twice (round 1 a blocker, the thin-range ▼; round 2 should-fix only, all done); `record-auditor` twice (round 1 the same blocker, round 2 holds; its test and doc items done). The owner's three answers after round 2 (the Warm-up grey, the caption line, no all-grey strip) are unit-tested and seen on web, not re-reviewed.

Below it, step 157, D46 (`docs/design/BUILT_LOG.md` row 157). JS only: a reload.
- **A category's score at 20,** with its first badge (`MIN_N_CATEGORY` 15 → 20); below it, the plain counts. The Coach function's copy says 20 too (pinned by a test), live once deployed.
- **The demo record** keeps every category unlocked (153 answers; "Sharp in health · Tracker in finance"); the App Review note and the seed screen say 153.
- **D46–D48** written into `UI_ROADMAP.md` §2 (chosen 2026-11-06, never recorded there).
- **Review:** `code-reviewer`, no blockers, its fixture and doc items done; `record-auditor` holds.

Below it, step 169, D56 (`docs/design/BUILT_LOG.md` row 169). JS only: a reload.
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

- **Log under the Dynamic Island (owner, iPhone 17, 2026-11-12): fixed and confirmed on the phone.** Log was the one sheet without a top inset; it now has `SafeAreaView edges={['top']}` like Resolve, Scoring and Share (zero inside the page sheet). Which way in showed it full screen was never pinned.
- **Playtest setup (2026-11-12):** eight playtest profiles on `/dev/seed` (`src/dev/playtestProfiles.ts`, app-profile §9), reachable on the iPhone from a development-only row in You; `/dev/…` skips the first-run redirect in development builds; ten new personas in §10 (Olu to Yusuf) and new axis values; `/playtest` has a stress pass for a stress focus.
- **Appeal rounds set up (2026-11-12):** `docs/playtest-appeal.md` (21 factors that decide whether people want the app, block B for every brief: the five-second read, a mood line, the eight UEQ-S pairs, reaction words, the disappointment question, the friend sentence, the card and the price; and the synthesis); twelve new personas in app-profile §10 (Bernard to Ji-woo) spread over tech literacy L1–L5, new axes (tech literacy, life stage, region and culture, money, how they found it, taste), "Choosing an appeal round's cast", a First impression row in §12; `/playtest appeal` in the skill.
- **Thirteenth round, appeal (2026-11-12):** `docs/design/research/playtest-2026-11-12b.md` (plan `round13-plan-2026-11-12.md`). Eight runs, L1–L5, ages 17–68; median 6/10, three keep, five unsure, nobody leaves. L1–L3 all "maybe" at five seconds, L4–L5 all "yes". "Honest" from all eight, "Too technical" from six; boring–exciting the lowest pair everywhere. Top: a due date can be moved once the outcome is known (P1 record, needs the owner, run `record-auditor`); the Warm-up opens on a chemistry question; the day-one card isn't the card friends post; the Warm-up result reads like a report; no "when" for 20 answers; categories and ideas built for an office. No decision needed: the "D.C.." double stop (`verdictCopy.ts:136`), the week recap's alphabetical tie (`nextBadgeCopy.ts`), padding under the fixed bars at 320, the playtest loader resetting the card settings (Erase keeps settings: finding 24). New §10 persona: Héctor.
- **Twelfth blind round, UI stress (2026-11-12):** `docs/design/research/playtest-2026-11-12.md`, plan `round12-plan-2026-11-12.md`. Scores 6, 6, 7, 6, 7, 8, 6, 5; four keep, four unsure. No decision needed (agent can do): Voice Control names starting with the visible words (2), trace the rating lines (4), reserve the track-record line's height on Log (9), gaps between close targets incl. the Warm-up's Next and Skip (10), Categories' switch layout (11), "1,001" in History (17), chart n= labels (19), clamp reflections in History (20), a bar behind floating × (21). The app is portrait only, so landscape is web-only now in §9, §10 and the skill; `web-playtester` can't run the CDP stand-ins, so the main session does.

- **Seen on web for 159** (320 × 568): Day 0 on a fresh install, no scroll and the hero in view; with the demo record, "In a week" from Today brings the new card to just above the tab bar; a save from History leaves Today at the top; with nothing ready, the cards come before the streak and practice rows. Not seen: the reminder ask, which never shows on web.
- **A flaky test:** `LogPredictionForm › clamps confidence steppers at 0 and 100` failed once under the full suite's load, then passed alone and on rerun.

- **Seen on web for 158:** the demo record at 375, light and dark: the n=5 and n=8 dots grey, the caption's grey-dot line, the card's strip "grey, grey, ring, ring, ▼" and its label; a fresh Warm-up's result with two grey dots and the line.

- **Seen on web:** the audit's example record at 375 light and 320 dark (the title reads "You're overconfident at 80–100%" where it said "well calibrated"; the chart's label reads "50% is inside that range… 75% is below that range."); a 24-character category in Trends at 320, its name wrapping. Not seen: the one-line style on that row's figure (below).
- **Seen on web for 157:** a finance category at 17 answers on Insights at 375: plain counts and "3 more scored answers to reach Tracker", no score; work at 22 keeps its score.
- **Seen on web for 169:** at 320, a walk logged that morning: Answer it now's one warning, Resolve with no second note, the advice with "Log it again, due tomorrow" under it after Yes and after No, Log opening with the title and "Save, due tomorrow", History's "Logged again, due tomorrow." and "Log it again, due tomorrow".
- **Seen on web for 170:** Farah's record (21 at 66%, 12 happened) on Insights at 375 ("No clear lean at 60–80%", "your numbers expected about 14", "No answers were Can't tell."), the same read on Today, Log's thin line at 320, and a leaning record in dark at 320 ("You said about 88%; about 60% would have matched.").
- **Seen on web for 168:** Log at 320, light and dark: a first and a second prediction both on Tomorrow, "Save, due tomorrow", and "Save, due Tue, Nov 17" on one line for In a week.
- **The web server** runs on 8099 (8097 may be the owner's other session), restarted after each change; its database empties on a restart, so reseed from `/dev/seed`. `web-serve.sh stop` still can't find a server on Windows (`docs/tooling-notes.md`).

## Next step

- **Agent:** steps 157–159 are built; `docs/NEXT_STEPS.md` has what's next.
- **Owner:** deploy the `coach` Edge Function (`supabase functions deploy coach`) so its prompt says 20; until then the phone re-checks at 20 and drops anything the server allowed at 15–19.
- **Owner:** decide whether `web-serve.sh stop` should be fixed for Windows pids, so it works unattended.
- **Owner, on the iPhone:** `/device-check` can write the list from BUILT_LOG rows 162–168; the new checks for 167–168, 158 and 159 are in `HUMAN_VERIFICATION.md` Batch C (2026-11-10): Save's label at large text sizes and VoiceOver, Plus in airplane mode, the chart's VoiceOver label, the card's strip as a PNG and under Color Filters.
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
  - the eleventh round's (`playtest-2026-11-10.md`): findings 3–6, 8, 9, 11, 13–16 and 18–24, and the 90%-plus figure (12). Finding 10's two thresholds is D46 (step 157); the card's dot row in 8 is D47 (step 158); the chart's own calibrated dot is still told from the under one by colour and position only (a hollow dot there is open, finding 8);
  - from step 157's reviews: the "category score unlocked" celebration can no longer fire (the 20th answer is always the step up to Tracker, which wins): remove it, or have the Tracker card also say the score unlocked; a Coach encouragement may quote a category's score below 20 (older, wider now); Trends' correction table can read a band in a category Insights calls too few to read;
  - from step 169's reviews: the same-day advice line inside a run would say "Log the next one now" with no button (runs hold due predictions, so only a synced or time-zone edge reaches it); a sheet left open past midnight names yesterday's "tomorrow" until it re-renders (Log's Save names the true date);
  - from step 170's reviews: a green "on the line" dot beside "No clear lean…" on Today (the words claim less than the colour); "would have matched" rounded to 5 can sit near the number said ("You said about 88%; about 85% would have matched"); deleting a Can't tell isn't counted, so a miss skipped then deleted leaves no trace beside "No answers were Can't tell." (D45's boundary); an added category's own name sits before "calls" on Log's line ("Of your 12 scored Side business calls…");
  - How scoring works doesn't name the 5-point floor (`direction.ts`), so a dot just outside its bar but uncoloured isn't explained;
  - the Plus card's sample and "what your 80% really means" now repeat free lines (D57 (d), P1); the App Store text's "as you set it" line (D57 (a));
  - the twelfth round's (`playtest-2026-11-12.md`): 1 (pin the × on Log, Share and Scoring), 3 (say a changed answer where the eye is; Resolve's "Recorded:" lead), 5 (a plain "am I good", Today's unlabelled 70 / 85 / 90, the Brier line), 6 (a category's own read), 7 (a shared phone), 8 (Increase Contrast, Bold Text), 9's starter ideas and delete layout, 11's "Hidden" word, 12 (Answer all), 13 (rest days after a long streak), 14 (keep a Log draft), 15 (Erase's place), 18 (History's chips), 22 (the card's default categories), 23 (a monthly look);
  - from `record-auditor` (2026-11-10): History's "happened" counts same-day Yeses, so it isn't the scored count (R11); an open prediction deleted before its due day isn't counted (finding 6, D45's boundary).

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. It does: 167 suites, 1,965 tests. If `tsc` reports three typed-route errors, the generated route types are a stub; restart the web server after edits under `app/` (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED`. It does.
