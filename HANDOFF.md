# Handoff

**Branch:** `builder/step-179-round22` (step 179, 2026-11-14), from `builder/step-178-owner-picks` (step 178, D62, and round 22, 2026-11-13), from `builder/step-177-round20` (step 177 and rounds 20–21; master is at step 177), from `builder/step-173-owner-picks` (step 173, D59, 2026-11-12; rounds 18–19 and steps 174–176, 2026-11-13; all pushed), from `builder/playtest-fixes` (steps 171–172 and rounds 16–17, pushed), from `builder/playtest-setup` (04accf4, playtest profiles, personas and rounds 12–15), from `builder/log-safe-top` (1851d9d, Log's top inset), from `builder/today-small` (1c6d0ae, step 159), from `builder/a11y-marks` (b72a941, step 158), from `builder/category-twenty` (8511b77, step 157), from `builder/habit-repeats` (34d3055, step 169), from `builder/plain-counts` (9597296, step 170), from `builder/due-date` (6b603fb, step 168), from `builder/headline-fixes` (5f7dbce, step 167), from `builder/playtest-11` (2e5cd71, D55–D57 decided), from `builder/reopen-and-erase` (step 166). Nothing pushed; the earlier `builder/` branches and `master` are still local only.

## What this PR did

**Step 179 (2026-11-14), round 22's ten fixes** (BUILT_LOG row 179; owner: "Build the ten fixes please"). Branch `builder/step-179-round22`, from `6061582`. JS only: a reload. No decisions: findings 1 (the read-only half), 2, 3, 9, 10 and 12–16 of `playtest-2026-11-13e.md`.
- **Hide the words** now covers Insights' badge rows and furthest-off line, the share card (own categories left off, said so, not stored as unticked) and the recaps (no titles switch).
- **"Use another number"** carries Edit's typed words, category and date.
- **The unlock card** names a badge earned on the same answer.
- **Words:** the friend fold explains the score and ranges; Edit's number note says one thing; Log's "nothing is counted against you"; "Show less"; the badge card's full stop; one full stop after a Spanish date or time; a "Your rating" heading.
- **An answer run** resumes after a kill (`resolveRunStore`, two hours), with its count and summary whole; closing it on screen starts the next one fresh.
- **Review fixes** (code review and record audit, round 1): the card is built only from what's shown, and with every category off it keeps the rating and "N categories not shown" (it had put back a category the person unticked, or vanished); the cards key on a name the person gave, not an icon; Trends and Coach cards hide names too; each answer is kept as it lands; Edit's values reach Log in memory, not the URL; after midnight they're kept as a new prediction; Erase and sign-out forget the run. Round 2: Today's identity line leaves off the same categories as the card (an icon-only built-in stays on both); the no-category card's VoiceOver label has no empty list; the recaps' "not shown" counts only categories answered in their span.
- **Record re-audit (round 2): HOLDS.** Its two owner questions, settled (owner: "Fix the issues", 2026-11-14): (1) a built-in given only an icon keeps its word on every list while the words are hidden, its icon shown as the default symbol (it read "Your own category" on Insights while Today and the card named it); (2) any category can come off the card, the last one too: no lock, and the card keeps the rating and "N categories not shown". Log's renumber note now says when the replaced one's delete is counted (a time zone can make it due today).
- **Their review** (code review: should-fix only; record audit: one blocker, fixed): the recaps' next badge named a category with open predictions only, which was never on the card ("To reach Tracker or higher in Trips"), with the words hidden and every category off; it now names only a category the card could show. Also: a Coach card's receipt said a renamed built-in's name under "Your own category"; Erase and account deletion now forget which categories were left off the card (with no lock, a kept choice could empty the next card); History's filter, the share chips' 44 pt target, You's switch text, DESIGN_SYSTEM §7.5 and D62 (d)'s amendment.
- **Calls made without asking** (the reviews' "Needs you", each from a rule already decided): the recaps' next badge stops pointing at a category with no answers (it reads the card's categories only); Erase forgets the card's left-off categories, as it forgets the categories themselves; with every category kept off, a card with no categories (D42's honest shape) rather than the Warm-up card; a built-in with only an icon stays on the cards (D40: they draw no icons); a run closed with × or a swipe starts fresh, only a kill resumes.
- **iPhone:** `docs/HUMAN_VERIFICATION.md` Batch C, "Added 2026-11-14 (step 179…)".

**Round 23 (2026-11-14), appeal in matched pairs on step 179:** `docs/design/research/playtest-2026-11-14.md` (plan `round23-plan-2026-11-14.md`), on `36a4b75`. Owner: "Fix the issues, and run another set of playtests. Make sure the criteria and combination factors differ slightly."
- **What differed:** four matched pairs (L1 against L5 from a friend's card; modest against bragging at five months; anxious against curious, killed mid-run; 15 against 66 on a shared phone), the wildcard in pair C; block B kept word for word plus B2 (sure before and managed after, taps to the first thing worth having, belief, thinking and frustration); two new profiles, `first-week-school` and `first-week-retired`; eight new personas (§10).
- **Results:**
  - median 7 (mean 6.9); five keep, three unsure, nobody leaves; two "very disappointed" (both long-time), one "not disappointed" (the 15-year-old);
  - with a record four of four keep; the first five minutes and first week one of four;
  - 24 of 24 end answers right; nobody gave up; the cast said 66% before tasks and managed 88% alone;
  - frustration 2–3, thinking 3–5; "Too technical" from seven of eight.
- **Step 179:** the run across a kill and "Use another number" with typed words worked for everyone who met them; hiding the words worked as built but reads as a lock and isn't.
- **No decision needed, not built:** #2 (part) speak a badge's rise and fall after an answer; #12 the double full stop after a Portuguese date on Resolve; #14 "doesn't count it as a deletion"; #15 no rewording note on the day it was logged; #18 the ±5 buttons' names; #19 the unnamed radio groups; #20 hints on Today's rating and identity line; #22 grey text at more contrast (a device check); #24 the ±5 buttons not shifting; #25 the chart's colliding labels.
- **Needs the owner:** #1 hiding (the Face ID lock in step 180; hide category names or one category); #2 a badge taken back by a correction; #3 "they still count in the totals"; #4 Share on the Warm-up card in week one, and the fold explaining it; #5 "about 6 weeks" on Today; #6 a plain line atop Insights; #7 the Brier line; #8 a plain card and a headline choice; #9 the perfect line; #10 the backlog recap; #11 region words under 10; #13 English dates (with `expo-localization`); #16 the same words open for the same day; #21 hearing the text share; #23 Resolve's reach; #26 earlier open calls.

**Round 22 (2026-11-13), appeal on step 178 with a diversified cast:** `docs/design/research/playtest-2026-11-13e.md` (plan `round22-plan-2026-11-13.md`), on `cc1235d`.
- **Results:**
  - median 7 (mean 6.6); five keep, three unsure, nobody leaves;
  - the first "very disappointed" of any appeal round (Jaylen, five months in); one "not disappointed" (Wanjiru, fresh);
  - with a record four of four keep; fresh installs one of three; both L1–L2 unsure;
  - 23 of 24 end answers right, one partly (no trial on web); one gave up (hiding her own category).
- **Step 178:** worked: the perfect line (all four understood it), "Use another number", the Warm-up result on Today, the first look, notes after an answer, badge news on the recap. Half: Hide the words (own names still on Insights, Log's chips, the card; a tap shows all), the friend fold (squares, not the score), the badge line's missing full stop.
- **No decision needed, not built:**
  - #1 (part): hide own category names on Insights, the share card and the recaps, and the recap's titles switch, while hiding;
  - #2: "Use another number" keeps the words typed in Edit;
  - #3: the unlocking answer names the badge that came with it;
  - #9: the friend fold explains the score and the ranges;
  - #10: Edit's number note and Log's "isn't counted" in plain words;
  - #12: "Show less" for the fold;
  - #13: the badge card's full stop;
  - #14: no double full stop after a Spanish date or time;
  - #15: a heading for How scoring works' personal paragraph;
  - #16: an answer run keeps its count and summary across a reload.
- **Needs the owner:**
  - #1 (part): Log's chips, the hidden card's wording, built-in names, the lock (step 180, documented);
  - #4: the perfect line beside "give or take" (wording);
  - #5: a run's badge changes once, at its end;
  - #6: what it's good for, in the newcomer's world (bettors, a friend's score);
  - #7: localisation and shorter lead lines;
  - #8: the reminder time for evening and morning events;
  - #11, #17–#22: walls of text, badge history, recap labels, ±5 taps, the Warm-up row, the week's backlog, shared phones.

**Step 178 (2026-11-13), the calls after round 21** (roadmap D62, BUILT_LOG row 178; owner: "Go with your recommendations for all open decisions, and start the building"). Branch `builder/step-178-owner-picks`, from `c366ff9`. JS only: a reload.
- **The record:**
  - a due-date move on the day the prediction was made isn't counted (round 21 #2);
  - new words on the eve of the due day or after are counted beside late moves, and Edit says so (`rewordingCounts`);
  - beside the rating, what perfect calibration would score on the same answers (`perfectReference`, about 85–88 at 20 answers), on Insights and How scoring works; the unlock card no longer says "the number means something";
  - the Brier line from 50 scored answers, with flat words, in the fine print.
- **Log:** "Use another number" in Edit on the day a prediction was made: Log as "Another number", the original replaced on save, uncounted.
- **Before 20:** "First look: you said about 75%… 6 of your 12 scored predictions happened. Too few to rate yet." from 10; "While you wait: today's practice" before the first answer; the Warm-up result one tap away on Today until the first save.
- **Privacy:** "Hide the words" also hides a category the person named, on the cards and Today's lines.
- **Insights:** the fine print (Brier, Can't tell, same-day, deleted, moved) under "More about your record"; "overall" in the multi-range chart titles; the caption says what orange, blue and green mean; "range" everywhere.
- **Recaps:** lead with a badge gained or lost over the span; the year card shows the rating.
- **Smaller:** "New badge:" and "A No can earn one…"; school-and-home starter ideas; D56's habit tip only on a repeat; "Got a friend's card?"; the trial button names the renewal price; notes after an answer; the dead category-unlock card removed; round 21's nine no-decision fixes.
- **Checked on web (8097):** Insights' perfect line and fold (long-time profile), the first look on Today (threshold profile), "Use another number" end to end (one card left, at the new number).
- **Simulated:** the badge bars for a perfect forecaster (D62 (a)), left as decided.
- **Reviews:** check passes (2,211 tests).
  - `code-reviewer`: no blockers; should-fix done (renumber in one transaction, only for one logged today, no kept draft in that mode, a guarded error path; the friend fold said aloud; a typed note asks before a swipe; `perfectReference` cached on the confidences; badge news only for categories answered since, "now" from the store; Share's tab labels capped; the × top-aligned on Log).
  - `record-auditor`: two blockers fixed (the perfect line could say "can't be told apart" over a chart naming a lean; the caption's green left out the 5-point floor); also the year card's "All time:", the badge line the same after Yes and No, no "Back to Getting started" on a recap.
  - `policy-auditor`: FAIL on an older gap, fixed: a trial showed to anyone, so a lapsed subscriber would be charged at once; now only when RevenueCat says eligible. History's filter chips no longer name own categories while hidden.
  - Fixes not re-reviewed.
- **Needs the owner (from the reviews):**
  - `docs/app-profile.md` §1 says "Audience: adults"; D62 tuned defaults for teenagers. Keep, or widen (and the crisis pre-filter runs only before a Coach call)?
  - Re-filing inside the 24-hour window isn't counted, and badge news now shows its result more.
  - "You're well calibrated overall" leaves out ranges under 10.
  - Today names a lower tier than the share card while "Hide the words" is on, without saying so.
  - Whether RevenueCat's eligibility check returns "eligible" on the Test Store and sandbox; "unknown" would hide the trial from new users too.
- **Not verified on the iPhone:** Edit handing over to Log by `router.replace` (and the Discard sheet); the keyboard over the note field; Share's tabs and the long paywall button at AX5; the back stack after Today's warm-up row.
- **iPhone:** `docs/HUMAN_VERIFICATION.md` Batch C, "Added 2026-11-13 (step 178…)".

**Round 21 (2026-11-13), appeal on step 177 with a shuffled cast:** `docs/design/research/playtest-2026-11-13d.md` (plan `round21-plan-2026-11-13.md`), on master `2c3444b`.
- **Results:**
  - median 6.5; seven keep (three for now), one unsure; all eight would be somewhat disappointed;
  - fresh installs keep at 3 of 4 (round 20: 1 of 4);
  - 24 of 24 end answers right; nobody gave up.
- **Step 177:**
  - Worked: "+ New category" (six own categories made in place), the Warm-up's intro, hiding the words (found in seconds).
  - Half-worked: the Warm-up's no-lean line (the counts landed, "lean" didn't), the kept Warm-up card (findable but tucked away), the Brier line (it still stings).
- **No decision needed, not built:**
  - #2: a due-date move on the day the prediction was made isn't counted, matching D61 (i);
  - #7: ±5 announces the new value;
  - #8: "New badge:" on the tile;
  - #11: drop the Warm-up card's "Real predictions next." once there's a category card;
  - #14: clear the can't-tell notice when the next card's answer lands;
  - #15: "Nothing under 40% answered";
  - #16: "shouldn't happen";
  - #17: no-break spaces, the dangling comma, the card-sheet tabs;
  - #18: chart caption colours, "Hide the words".
- **Needs the owner:**
  - #1 (P1 record, simulated): a perfectly calibrated person scores about 85 at 20 answers, so the rating is biased low at small counts and the app reads the gap as the person's;
  - #3: a one-tap "log it again with another number" on the day made;
  - #4: weeks before anything real;
  - #5: a lock, and hiding added category names;
  - #6: the Brier line's words;
  - #9: one vocabulary pass;
  - #10: defaults for teenagers and worries;
  - #12, #13: the friend's-squares line, and recaps that tell the person's own story;
  - #19, #20: the Warm-up result after an interruption, and the preselected trial.

**Step 177 (2026-11-13), round 20's fixes and the calls after it** (roadmap D61, BUILT_LOG row 177; owner: "go with your educated, informed, smart decisions on anything relying on me unless it is fundamentally breaking"). Branch `builder/step-177-round20`, from `802838e`. JS only: a reload.
- **Fixes (no decision):** findings 16–21, 23, 24 of `playtest-2026-11-13c.md`.
- **Decided and built (D61, the agent's calls, open to overturn):**
  - the Warm-up's intro and order, and its no-lean line in plain words;
  - the Warm-up card kept in Share, and a friend's squares explained;
  - "Hide the words on Today and History" in You (off by default);
  - the Brier line's meaning after a tie or a loss;
  - "+ New category" in Log and Edit;
  - "N scored" on the recap's chips;
  - open deletes counted from the eve, and not on the day made.
- **Kept:** the 20-answer gates; D50 (no rating line after Change answer); D45 (new words on any spelling change); the number as the record.
- **Not now, needs the owner:**
  - head-to-head with a friend;
  - a Face ID lock (a native package);
  - regional pricing and a Trends preview;
  - `APP_STORE_PROVIDER_TOKEN`;
  - Insights' footnotes folded;
  - a note kept or added after an answer;
  - Day 0's streak and goal.
- **Reviews:** check passes (2,171 tests). `code-reviewer` no blockers, should-fix done; `record-auditor` no blockers, wording tightened, the eve delete closed; `policy-auditor` PASS. Fixes not re-reviewed.
- **Open from the reviews:** a hidden card still shows a category the person named ("Divorce"); `docs/APP_PRIVACY.md` drift from before this step (the Coach's "fixed category enum" evidence, an on-device note for category names and icons); a Warm-up half-done under the old order starts over.
- **iPhone:** `docs/HUMAN_VERIFICATION.md` Batch C, "Added 2026-11-13 (step 177…)".

**Step 176 (2026-11-13), the owner's picks after round 19** (roadmap D60, BUILT_LOG row 176; owner: "go with your recommendations for open decisions"). JS only: a reload.
- **Built:**
  - a badge that falls is said on the answer that moved it, never after Change answer;
  - "Show the words in reminders" in You, off by default (owner, after the policy audit): "Your prediction from Nov 6 · You said 70%", no Happened / Didn't;
  - the squares explained in How scoring works, and Share says when they come;
  - the recap's surest calls from 60% only, renamed;
  - an ended streak said on Today for a week;
  - Can't tell names its last day; a late answer says when it was due;
  - the Warm-up's tap tip on its first three questions;
  - "Save and log another" keeps the category;
  - a leading emoji in a new category's name becomes its icon;
  - the guest Erase screen retitled.
- **Kept as built:** D50's "why" on the first move in a run; guest Erase scope.
- **Not now** (reasons in D60): the midnight day, the empty middle, weekday chips, the goal's "of 3", and the rest of round 19's P2–P3 list.
- **Reviews:** check passes (2,149 tests). `code-reviewer` no blockers; should-fix done (reschedules one at a time and a re-set cancels the earlier request; the stored `words` read loosely; the drop line only for the answer's category, naming the bar above where it landed; a store-level drop test; a DST case). `record-auditor` holds; its wording tightened ("no longer above", "until the end of", "was left", the strip's last two marks). `policy-auditor` no fail; wordless reminders lose Happened / Didn't (two alike could take the wrong answer), the line says what a locked iPhone shows, the Erase row is "Erase your data on this phone", policy §5 says what a reminder shows (effective date now Nov 13). Fixes not re-reviewed.
- **Needs the owner (from the reviews):** a correction after the drop line leaves no trace (count corrections on Insights?); a badge that falls by a correction, a re-file or a sync is said nowhere. Decided: "Show the words in reminders" starts off (owner).
- **Owner actions, unchanged:** publish the privacy policy (GitHub Pages; still a 404); RevenueCat's launch call stays (named in the policy).
- **iPhone:** `docs/HUMAN_VERIFICATION.md` Batch C, "Added 2026-11-13 (step 176…)".

**Round 20 (2026-11-13), appeal with a randomized cast:** `docs/design/research/playtest-2026-11-13c.md` (plan `round20-plan-2026-11-13.md`), on `7135744`.
- **Method:** eight people never cast before (new §10 rows, Nadia to Katrin); five drawn at random across every axis, three cast for the friend's card, a family install at L1 and a premium payer; each with its own locale and time zone.
- **Results:** median 6.5, four keep, four unsure; nineteen of 24 end answers right, five partly. With a record, three of four keep; fresh installs, one of four. L1–L2 nobody keeps.
- **No decision needed:** #16 (Badges says a badge can fall), #17 ("1 answers"), #18 (the year card's "that far" with no gap), #19 (the pace line beside "one is ready now"), #20 (the reminder example's US date), #21 (a visible "Recorded" for Can't tell in a run), #23 (the chart's 100% dot and label), #24 (Edit says how to change a number). Not built yet.
- **Needs the owner:**
  - the Warm-up's content and its "no clear lean" read for L1 and short-video arrivals (#1, #2);
  - keeping the Warm-up result findable (#3);
  - something to compare with a friend (#5);
  - a lock or hidden titles on a shared phone (#7);
  - regional pricing and a Trends preview (#8);
  - the Brier line's sting (#9);
  - adding a category from Log (#10);
  - Insights' footnotes (#11);
  - recaps that lead with what was missed (#12);
  - corrections that feel like being caught (#13);
  - a note lost on leaving (#14);
  - the provider token (#27).

**Round 19 (2026-11-13), a fortnight in the app:** `docs/design/research/playtest-2026-11-13b.md` (plan `round19-plan-2026-11-13.md`).
- **Method:** four diaries on four rhythms (16 days away, across midnight, weekly, low energy with Reduce Motion), with `Tomorrow 0–10` per sitting; four single sittings, each starting with three minutes and no task (sharing before 20, privacy, a slow phone on prepaid data, a dyslexic teenager with a stylus).
- **Results:**
  - scores median 6, three keep, five unsure (round 18: 7, seven keep);
  - UMUX-Lite 63.5 (ease held, "meets my requirements" fell);
  - trust in the numbers 3.9, acting on it 2.6;
  - comprehension 76% sure, 22 of 24 right;
  - three of four diaries' Tomorrow fell by the third sitting (Grace 7→6→4, Yusuf 6→6→5, Priya 4→5→3; Hannah 7→6→8).
- **Step 175** fixed what needed no decision (BUILT_LOG row 175): the Due line into view, "about it", the rating line once per run, "None saved now", Erase's list, the ±5 held level.
  - Code-reviewed (two should-fix, three nits, fixed) and record-audited (holds). The audit asks two things of the owner:
    - D50: the run now says the rating's "why" once, on the first card that shows a move; later drops show bare "moved from X to Y". Should it be the first card showing a *drop* instead?
    - A guest's Erase deletes only what was made without an account. An account that signed out on this phone keeps its rows. The confirmation and the policy now say so. Widen Erase instead? (`policy-auditor` before the policy is published.)
- **Needs the owner, in order:**
  1. a badge named on one answer and silently gone on the next (announce at the run's end, say when it drops, or hysteresis);
  2. the day ending at midnight for night workers ("ready" hours early; streak and practice split mid-shift);
  3. privacy: the policy 404 (Pages, third run) and nothing saying what a reminder shows on the lock screen (four runs over rounds 18–19);
  4. the squares never shown before 20 (the round's only wrong answer);
  5. the recap's "Surest thing that didn't" (six runs over two rounds);
  6. a streak ending without a word;
  7. then the empty middle (B3), Can't tell and "not yet", weekday chips, the goal's "of 3", Today's taps opening the rules, "am I getting better", a hit worth posting, the comeback week, data and battery, the Brier line, usage stats default, categories from Log, emoji names as icons, the Warm-up without dragging, How scoring works for a dyslexic reader, habits on day one.

**Round 18 (2026-11-13), days not minutes:** `docs/design/research/playtest-2026-11-13.md` (plan `round18-plan-2026-11-13.md`).
- **Method:** a diary over three sittings with the clock moved; a traveller from Kathmandu to New York; Arabic, British, NZ and US locales; a dropped connection.
- **Results:**
  - scores median 7, seven keep;
  - UMUX-Lite 72.9 (about 70 SUS);
  - trust in the numbers 4 everywhere, acting on it 3;
  - comprehension 80% sure, 96% right.
- **Step 174** fixed what needed no decision (BUILT_LOG row 174): step 173's swallowed category tap, the run's scroll, the coverage note's "logged", "Tracker or higher", switched-off reminder rows, the streak row's tap, the late-move note.
- **Needs the owner, in order:**
  1. privacy on a shared phone (titles, the lock screen; D52 (3) re-raised);
  2. the privacy policy 404 (Pages);
  3. the card at large text;
  4. corrections that raise the score with no trace;
  5. early deletes free while moves are counted;
  6. then "is it good" and the Brier line, tier words beside a sensitive category, reminders (time, whose clock, before the event), Today's verdict on every open, nothing to share before 20, the jumpy unlock estimate, US units first, Arabic numerals mixed in, Voice Control naming, categories (B4), answered categories locked.

Step 173 (`docs/design/BUILT_LOG.md` row 173, roadmap D59): the owner approved every recommendation after round 17 and the rounds 12–15 aggregate. JS plus SQLite migrations 015 (`prediction_postponements`) and 016 (`warmup_results.question_ids_json`): a reload.
- **Today:** no 70 / 85 / 90 under the rating; the rating opens How scoring works with the person's own line in points; the closest badge while none is earned.
- **Insights:** the rating in points; Can't tell from the first answer; why no badge when spread thin; Furthest off tied to the badge; the Brier line checked against luck (`brierEdge`); late due-date moves counted, Edit warns; "See your week".
- **Warm-up:** expected-and-got under the verdict; a place or a year first (old results keep their order); US units in the key.
- **Share:** keys under the text squares and the card strip (reverses D58's no-key).
- **Log:** "Save and log another" (in the footer, not on the save notice: a timed button fails VoiceOver); a draft kept a day (reverses D52 (1)), cleared by save, Start over, Discard, Erase, account deletion and leaving an account; starter ideas until the title is left.
- **You:** "Streak and daily goal" switch.
- **Reviews:** designs record-audited first (three wordings corrected); the build record-audited (holds, four should-fix done) and code-reviewed (round 1 blocker: finished Warm-ups' keys misaligned by the reorder, fixed with 016). Round 2 of the review: see "In progress".
- **Needs the owner:** deletes on the eve aren't counted while moves are (`deletionCounts` from the due day); late rewording that keeps its date isn't counted; US units read the language tag, not the Region setting, until `expo-localization` (new build); whether the chart can say "no clear lean" while a category leans.
- **iPhone:** `docs/HUMAN_VERIFICATION.md` Batch C, "Added 2026-11-12 (step 173…)".

Below it, step 172:

Step 172 (`docs/design/BUILT_LOG.md` row 172): round 16's no-decision fixes and two bugs from round 17. JS only: a reload. The scoring sheet's sticky ×; Log's and the Warm-up's scroll-into-view (`useScrollReveal`); stacked answer keys at large text (`AnswerKeyRow`); a second "Make a real prediction"; the unlocking answer's meaning line; the first-badge, recap and months wording; the give-or-take's method on How scoring works; the recap card's spoken "s"; "Logged again" only in the same category. Reviewed (no blockers) and record-audited (holds).

**Round 17 (2026-11-12), usability measured with SEQ and SUS:** `docs/design/research/playtest-2026-11-12f.md` (plan `round17-plan-2026-11-12.md`). Eight people new to rounds 12–16, in new combinations (colour vision on a long record, a screen reader on a first run, an anxious mind at the unlock, 320 with a habit, ADHD with interruptions, low numeracy at large text, a bettor on a crowded record, a quant one-thumbed). SUS mean 70.3 (60–77.5), scores median 7. Answering and logging SEQ 5–7 for everyone; under the benchmark: what the number or badge means (Today's unlabelled 70/85/90 marks, four runs), the card's marks and colour-only text squares, the Warm-up result's order. Step 172's fixes landed where testable; the stacked answer key needs the iPhone. New §10 persona: Wen.

Below it, step 171:

Step 171, the no-decision fixes A1–A10 from `docs/design/research/aggregate-2026-11-12.md` (`docs/design/BUILT_LOG.md` row 171). JS plus SQLite migration 014 (`warmup_progress.pick_json`): a reload, no new build.
- **Record and words:** a renamed category shows at once in Furthest off and the Coach cards; "D.C." gets one full stop; the recap's next badge breaks ties by predictions made; History's "not scored" says why (How scoring works' reason) and the evening-before advice.
- **Layout:** the Warm-up's and Log's pinned bars end the scroll once they'd take over a quarter of the window (`usePinnedFooter`); "Saved, due …" over any tab but Today after a save (`SavedNotice`); the chart's n= labels kept off dots, region labels and thin ranges' bars; a sticky × bar on Resolve and the details (`SheetCloseBar`); Log keeps the track-record line's room; gaps between touching targets; Categories' switch row; grouped counts in History; reflections clamped in History's list; Voice Control names "+5" / "−5" / "Sun".
- **Kept state:** the Warm-up keeps the current pick across a reload; the playtest loader resets every setting.
- **Traced, no bug:** round 12's rating lines (finding 4). Every screen reads one stored rating; an earlier answer, or a correction or delete (no line, by design), accounts for the moves.
- **Review:** `code-reviewer` no blockers, five should-fix done (a stale pick from the debounce, a double announcement, no sign on You, the × bar able to cover content, Save jumping with "Still needed"); `record-auditor` one blocker (the not-scored reason overclaimed: an answer just past midnight is scored), fixed. Fixes not re-reviewed.
- **Needs the owner:** History's rows stay flush (DESIGN_SYSTEM §7.11, D33); Save's spoken name stays "Save prediction, due …" (D55); the B list in the aggregate.
- **iPhone:** `docs/HUMAN_VERIFICATION.md` Batch C, "Added 2026-11-12 (step 171…)".
- **Round 16 (2026-11-12), did the fixes land:** `docs/design/research/playtest-2026-11-12e.md`. Eight returners, every score up (median 7, was 6), seven keep; Mei 9 (voice logging works), Gloria 8. All ten fixes landed (A2 after a mid-round fix to the visible answer-key rows; Log's pin latch after the health check). New no-decision items: How scoring works' × out of reach when opened at Badges (P1), the unlocking miss gets neither D50 line, Log's slider under Save at 320 after a category, the Warm-up's restored pick under the bar, "first badge, Tracker" untrue when Forecaster comes at 20, "20 to go" of what, the answer key at large text, a button at the Warm-up result's end, "4 months on file", identity-line capitals.

Below it, the playtest setup and rounds 12–15 (`builder/playtest-setup`, under "In progress" below).

Below that, Step 159, D48 (`docs/design/BUILT_LOG.md` row 159). JS only: a reload.
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
- **Rounds 14 and 15, then the aggregate (2026-11-12):** `playtest-2026-11-12c.md` (appeal, a second cast of eight, L1–L5, ages 16–74) and `playtest-2026-11-12d.md` (staying power: five round-13 people brought back on `day1`, `long-time`, `threshold`, `habit`, `first-week`, plus a 1,000-day wildcard). **`docs/design/research/aggregate-2026-11-12.md` is the one list from rounds 12–15**: A1–A10 need no decision (a renamed category's stale "Furthest off" line, "D.C..", the recap's tie, room under the fixed bars, a sign after a save from Insights, the Warm-up's current pick, the why on "not scored", the chart's labels at tiny counts, the loader resetting card settings, round 12's list); B1–B11 need the owner (record shaping first, then the first five minutes, the empty middle, the streak switch). New §10 personas: Teresa, Haruto, Ingrid, Nusrat, Earl.
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

- **Agent:** step 180, the native batch (a Face ID lock, `expo-localization`), installed with `npx expo install`, then a new development build the owner runs; after that, a playtest round on step 178.
- **Owner:** deploy the `coach` Edge Function (`supabase functions deploy coach`) so its prompt says 20; until then the phone re-checks at 20 and drops anything the server allowed at 15–19.
- **Owner:** decide whether `web-serve.sh stop` should be fixed for Windows pids, so it works unattended.
- **Owner, on the iPhone:** `/device-check` can write the list from BUILT_LOG rows 162–168; the new checks for 167–168, 158 and 159 are in `HUMAN_VERIFICATION.md` Batch C (2026-11-10): Save's label at large text sizes and VoiceOver, Plus in airplane mode, the chart's VoiceOver label, the card's strip as a PNG and under Color Filters.
- **Owner, before `eas submit`:** the in-app purchases attached to the submission, the Paid Apps Agreement active and RevenueCat's current offering set; otherwise a reviewer sees the empty-plans line (2.1(b)) (`policy-auditor`).
- **Owner:** republish the privacy policy once GitHub Pages is on (its in-app paths and §7 changed in step 166).
- **Not traced:** whether due-day and practice reminders already scheduled are cancelled right after an account deletion, before the next launch (flagged in step 166).

## Read first

`HANDOFF.md`, `CLAUDE.md`, `docs/app-profile.md`, `docs/agent-harness.md`, `docs/NEXT_STEPS.md`, `docs/HUMAN_VERIFICATION.md`.

## Open decisions

The owner said "go with your recommendations for all open decisions" (2026-11-13); D62
records the calls. The long list from rounds 8–12 and the step 157–170 reviews is closed
with it: much of it was settled by steps 171–178 (the pinned ×, a kept Log draft, Today's
70 / 85 / 90, categories from Log, a shared phone, the category-unlock card), and the rest
comes back only if a new round finds it again. Left with the owner:

- **Outside the code:**
  - GitHub Pages for the privacy policy (a 404 for several rounds; submission needs the URL);
  - prices, P1 (recommended: $34.99 a year, $79.99 lifetime, $4.99 a month; Apple's automatic prices elsewhere);
  - EU trader status (recommended: launch outside the EU first);
  - deploy `coach`; email confirmation on, with a custom sender before launch; the domain (not needed for v1); `APP_STORE_PROVIDER_TOKEN`.
- **The native batch (step 180), approved in principle by the same go:** a Face ID lock (`expo-local-authentication`) and `expo-localization` (US units by Region), then one new development build.
- **To revisit if wanted:** how strict the badge bars are (D62 (a): a perfect forecaster earns Sharp about 6 times in 10 at 50 answers, Oracle about 5 in 10 at 100).
- **Not now:** head-to-head with a friend; a then-and-now card; a Trends preview; the day-one streak and goal.

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. It does: 182 suites, 2,256 tests. The flake in `ResolvePrompt.test.tsx` › "a badge taken back" (about 1.3 s alone, past the 1 s default wait under full-run load; it failed twice running during round 23 and slipped into that round's commit, `5aa553c`) now waits up to 5 s per step, 20 s in all. Commit only after `check.sh` itself exits 0: piping it through `tail` hid that failure. If `tsc` reports three typed-route errors, the generated route types are a stub; restart the web server after edits under `app/` (`docs/tooling-notes.md`).
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED`. It does.
