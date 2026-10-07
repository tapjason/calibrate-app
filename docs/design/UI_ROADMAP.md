# Calibrate — UI Roadmap

**As of:** 2026-10-07. The *what to build next* companion to
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (which holds the rules). Evidence in
[`research/`](research/); "before" screens from 2026-09-25 in [`baseline/`](baseline/).
Feature ideas beyond this roadmap are parked in [`FUTURE_UI.md`](FUTURE_UI.md).
Step-by-step history is in git (`git log -- docs/design/UI_ROADMAP.md` and the
`feat(ui|motion|resolve|share|…)` commits).

---

## 1. Where it stands

The redesign pass (2026-09-26 → 10-03) fixed every problem the baseline captures
and the 2026-09-28 code read found: tokens instead of ~200 hex literals and raw font
sizes, the big confidence control, neutral Yes/No, the chart redesign, Lens emblems,
sheets, Reanimated motion and the three celebration moments, the Warmup share card,
Post/Story share cards, the paywall restructure, receipt-first Coach cards, and
notification copy. **Everything below that isn't a §2 decision is built**; what's left
is checking it on an iPhone and the decisions.

| Step | State | Needs an iPhone check |
|---|---|---|
| 0 Correctness fixes | Done | — |
| 1 Tokens | Done — colour and type. Share cards and badges keep their own palettes and sizes by design (DESIGN_SYSTEM §3). | — |
| 2 Icons and haptics | Done — SF Symbols with Ionicons fallback; haptics per §6.1 (detent, commit, resolve, reveal, unlock). | Yes |
| 3 Confidence control | Done | Yes (detent haptic) |
| 4 Provisional states | Done, as a segmented bar plus the ghost chart. A ring is optional (FUTURE_UI §B). | — |
| 5 Chart redesign | Done | — |
| 6 Reanimated | Done, including the tier-up flip and confetti (step 17, 2026-10-04). Warmup score count-up and the landing haptic shipped 2026-10-03. | Yes |
| 7 Warmup → verdict → share | Done | — |
| 8 Lens emblem | Done | — |
| 9 Share cards | Done | — |
| 10 Paywall | Done (UI). Store config fixed in the Test Store 2026-10-01; App Store Connect must match. | — |
| 11 Sheets | Done. A typed reflection is guarded on swipe-down (Save / Discard / Keep editing). Web: the browser's Back saves it and a reload asks first (step 23). | Yes |
| 12 Everyday surfaces | Done, including receipt-first Coach cards (2026-10-03). | — |
| 13 Notifications | Done (copy, placeholders, passive digest). Actions and timing are D8 / D9. | Yes |
| 14 Decisions | D10 built 2026-10-04 (its one open question turned out to be checkable); the rest wait on §2. | — |
| 15 Web run-through | Done 2026-10-04: every Batch C box web can show, plus six fixes (chart label overlap, web tab bar, Wrapped verdict vs. Stats, offline sign-in text, the "Anonymous" analytics label, demo titles). Details in `HUMAN_VERIFICATION.md` Batch C. | — |
| 16 Chart-label halo | Done 2026-10-04 | — |
| 17 Tier-up flip and confetti | Done 2026-10-04. Replay at `/dev/celebrations`. | Yes (haptic timing, flip, confetti at 60 fps) |
| 18 Resolve several at once | Done 2026-10-04, web-verified | Yes (sheet, per-card haptic, swipe-down guard) |
| 19 Track record on the Log slider (free) | Done 2026-10-04, web-verified | — |
| 20 Personal correction table (Plus) | Done 2026-10-04, web-verified with the dev Plus preview | — |
| 21 Calibration by time horizon (Plus) | Done 2026-10-04, web-verified with the dev Plus preview | — |
| 22 "Log it again" after resolving | Done 2026-10-04, web-verified | Yes (sheet closes, Log tab shows) |
| 23 Web: Back keeps a typed reflection | Done 2026-10-04. Reload prompt seen on web; the Back save confirmed end to end on 2026-10-05, once History could show reflections. | — |
| 24 Wrapped through the store | Done 2026-10-04; `src/components/layering.test.ts` now guards the L6 → L4 → L3 arrow | — |
| 25 Web: explicit tab names | Done 2026-10-04, web-verified | — |
| 26 Demo titles without weekdays | Done 2026-10-04; a test keeps them that way | — |
| 27 History filter row on web | Done 2026-10-05, web-verified | — |
| 28 Identity line on Home | Done 2026-10-05, web-verified | — |
| 29 How scoring works | Done 2026-10-05, web-verified; a test holds the copy to the engine | Yes (full-height sheet) |
| 30 Paywall close control | Done 2026-10-05, web-verified; the screen now insets its top edge | Yes (clear of the notch) |
| 31 Reflections in History | Done 2026-10-05, web-verified | — |
| 32 Next due date while calibrating | Done 2026-10-05, web-verified | — |
| 33 History filters wait for a first resolution | Done 2026-10-05, web-verified | — |
| 34 An empty week says what's on the way | Done 2026-10-05, web-verified | — |
| 35 Stats' calibrating caption dated too | Done 2026-10-05, web-verified | — |
| 36 Privacy policy and terms in Settings | Done 2026-10-05; the privacy link appears once `PRIVACY_POLICY_URL` is set | — |
| 37 Reminders survive a relaunch | Done 2026-10-05, unit-tested | Yes (HUMAN_VERIFICATION D1) |
| 38 Notification permission in context | Done 2026-10-05, unit-tested; card previewed at `/dev/celebrations` | Yes (no alert over the Warmup; D1) |
| 39 A skip can be answered later | Done 2026-10-05, web-verified | — |
| 40 Starter ideas for a first prediction | Done 2026-10-05, web-verified | — |
| 41 Settings' switches named | Done 2026-10-05, web-verified | Yes (VoiceOver reads "Notifications, switch, on") |
| 42 Decorative pieces silent everywhere | Done 2026-10-05, web-verified | — |
| 43 Rating and badge rows as one sentence | Done 2026-10-05, unit-tested | Yes (VoiceOver) |
| 44 Warmup questions as announced headings | Done 2026-10-05, web-verified | Yes (VoiceOver hears each new question) |
| 45 Share cards read as one summary each | Done 2026-10-05, web-verified (each card is one image with a spoken summary, tiers in words) | Yes (VoiceOver) |
| 46 Log: Save waits for a title | Done 2026-10-05, web-verified (an empty Save used to print "title is required") | — |
| 47 Badge hints name the score too | Done 2026-10-05, unit-tested ("20 more resolved and a score above 85 → Sharp") | — |
| 48 Wrapped: expected vs happened | Done 2026-10-05, web-verified ("6 happened. You expected about 4." replaces "86% came in") | — |
| 49 Warmup verdict names a single number | Done 2026-10-05, web-verified ("You said 75% on all 10") | — |
| 50 Paywall prices say their period | Done 2026-10-05, web-verified ("then $29.90 a year", "Works out to $2.49 a month." from the Test Store) | Yes (with real App Store prices) |
| 51 A range opens its predictions | Done 2026-10-05, web-verified (Stats' 80–100% cell → History "You said 80–100%", 57 answered, matching the chart) | — |
| 52 Narrow screens: tick labels and card dates | Done 2026-10-05, web-verified at 320pt ("8590" → "85 \| 90"; "Ready to resolve" wraps instead of folding the date) | Yes (iPhone mini or SE with Display Zoom) |
| 53 Identity card on one fixed canvas | Done 2026-10-05, web-verified at 320, 375 and 402pt (same composition at each; it overflowed at 375) | Yes (the exported PNG is 1080 × 1440 / 1920 and matches the preview) |
| 54 D13: confidence starts empty | Done 2026-10-05, web-verified ("—% not set yet", grey thumb mid-range; Next and Save wait; no integrity chip until set) | Yes (tap-to-seek and touching the thumb on iOS; VoiceOver hears "not set") |
| 55 D14: the Warmup says its questions are tricky | Done 2026-10-05, web-verified (under an overconfident verdict only; the Day-0 card now says "10 tricky questions") | — |
| 56 Empty states get their symbol and a primary way forward | Done 2026-10-05, web-verified (Home, History, Share) | Yes (the SF Symbols) |
| 57 Every share card on the 360pt canvas | Done 2026-10-05, web-verified at 320 and 402pt (Warmup and Wrapped join the identity card) | Yes (exports 1080px wide) |
| 58 Resolve: said against happened | Done 2026-10-05, web-verified ("In your 60–80% range, 40 of 52 have happened. That's 77%, against the 69% you said.") | — |
| 59 Launch: the splash holds until the first screen | Done 2026-10-05, unit-tested (web has no native splash) | Yes (cold start goes indigo splash → Home, or → Warmup on a first run, with no white spinner screen or Home flash between) |
| 60 D9: reminders in the evening | Done 2026-10-05, unit-tested (19:00 local; a reminder set for another time is replaced at launch) | Yes (the notification arrives at 19:00 on the due day) |
| 61 D2: a day counts with three | Done 2026-10-05, web-verified (Home: "14-day streak · 3 more today makes it 15", then "15-day streak · Today counts" after three answers) | — |
| 62 D4: chance bars, give-or-take, counts as dots | Done 2026-10-05, web-verified ("Give or take 5 points"; the n=5 and n=8 dots in long bars) | — |
| 63 The streak on the Wrapped cards | Done 2026-10-05, web-verified ("15-day streak" under the counts, from two days up) | — |
| 64 Streak checkpoints at 7, 30, 100, 365, then yearly | Done 2026-10-06, web-verified with the clock moved (Home on day 7: tinted row, "A full week. Next milestone: 30 days"; day 6: "Tomorrow can make it 7: a full week"); the Resolve card unit-tested and previewed at `/dev/celebrations`; How scoring works lists them from the engine's constant. **Static on purpose**: the celebration is FUTURE_UI B1 | Yes (VoiceOver reads the row and card as one sentence) |
| 65 A run ends on what it came to | Done 2026-10-06, web-verified ("2 answered, 1 can't tell. 1 happened. You expected about 1.", then the streak row: a skip doesn't fill a pip) | — |
| 66 Account matches the other headerless screens | Done 2026-10-06, web-verified (Sign in and Erase on `canvas`, not white; Sign in closes with the paywall's round ×, now one `CloseButton`) | Yes (the × clear of the notch) |
| 67 Home's middle group is "Next 7 days" | Done 2026-10-06, web-verified (a prediction logged Tuesday "In a week" is due next Tuesday, and was listed under "This week") | — |
| 68 The ghost chart's key names only what's drawn | Done 2026-10-06, web-verified (no "Grey bars" sentence before the first dot; "Resolve a prediction and your first dot lands here." no longer reads as a line of the key) | — |
| 69 An empty History has a way forward | Done 2026-10-06, web-verified ("…The first one comes due Tue, Oct 13." and **Log a prediction**; "Oct" and "13" no longer split at 402pt). Home's and Stats' calibrating caption say "first" too until something resolves | — |
| 70 A 320pt pass: nothing that reads as one splits | Done 2026-10-06, web-verified at 320pt (chart title "80–100%" whole; paywall title wraps clear of the ×; "then $29.90 a year" together; the streak row breaks before "Next milestone") | Yes (iPhone SE / mini, and word joiners on iOS) |
| 71 The Warmup's answer key says the answer and the pick | Done 2026-10-06, web-verified at 320pt ("The Pacific · You picked “The Atlantic”" under a hollow mark; it read "✗ Which ocean…? The Pacific", as if the Pacific were the miss) | Yes (VoiceOver: one stop per question) |
| 72 The Warmup verdict opens at its top | Done 2026-10-06, web-verified at 375 × 667 (it opened on the chart, "You run overconfident" and the score's count-up above the fold, because the quiz had been scrolled to reach Next) | Yes (iPhone SE: the count-up is seen) |
| 73 Stats' badge rows keep one order | Done 2026-10-06, unit-tested and web-verified (a launch listed them alphabetically, a recompute in the app's order, so the rows moved after the first log) | — |
| 74 Every range on screen keeps its dash | Done 2026-10-06, web-verified with a page scan at 320–390pt (How scoring works broke "0–" / "20%" at 320 and 375; Log's track record, Wrapped, the counts table, History and Trends hold theirs too) | Yes (word joiners on iOS, with step 70) |
| 75 A new Log form starts at the top | Done 2026-10-06, web-verified at 375 × 667 (after a save, the next visit opened on "—% not set yet" with the title field scrolled away) | — |
| 76 A new History filter starts from the newest | Done 2026-10-06, web-verified (a range opened from Stats after scrolling History showed the last three of its eight) | — |
| 77 "1 of 2 has happened" | Done 2026-10-06, unit-tested | — |
| 78 Restore purchases as a text button | Done 2026-10-06, web-verified (an outlined capsule between the CTA and "Not now" read as a second call to action; DESIGN_SYSTEM §7.6 already said text button) | — |
| 79 A visible close on every sheet | Done 2026-10-07, unit-tested (the round × at the top of Resolve, the run, Share and How scoring works; Share's and scoring's bottom Done gone). Not web-verified: the dev server was stopped for memory that day | Yes (the × clear of the grabber; swipe-down still works) |
| 80 You: settings as a grouped list | Done 2026-10-07, unit-tested (whole-row targets with chevrons, switches, red Erase alone at the bottom; DESIGN_SYSTEM §7.21) | Yes (row highlight on press, VoiceOver row names) |
| 81 Erase is not a filled primary | Done 2026-10-07, unit-tested (Button's danger variant is outlined with a destructive edge and label) | — |
| 82 D3: four tabs and the floating "+" | Done 2026-10-07, unit-tested (Today · Insights · History · You; Log as a full-height sheet with a title, the × and a discard guard; the Warmup hands off to Today with Log open; "Log it again" replaces the Resolve sheet) | Yes (the "+" clear of the tab bar and home indicator; the Log sheet with the keyboard up; the Discard action sheet) |
| 83 D15: the rating prompt | Done 2026-10-07, unit-tested (`expo-store-review`; asked on Today after a finished run or the score unlock, ≥ 7 days and 10 answers, once per 90 days) | Yes (a development build shows the prompt every time; TestFlight never does, by Apple's design) |
| 84 D16: the trial-ending reminder | Done 2026-10-07, unit-tested (10:00 two days before a trial renews, the store's price, cancelled with the trial or the toggle; the paywall timeline's reminder step while notifications are on) | Yes (sandbox trials last minutes, so the 2-days-before time is already past: check the schedule in a log, or with a StoreKit config file's longer trial) |

Device checks are listed in `docs/HUMAN_VERIFICATION.md` C2. Verification for
any new UI step: `npm test`, a web-build screenshot at phone width, and an iPhone run
for anything with haptics, symbols, sheets or glass (web shows none of them).
**Since 2026-10-04 an iPhone run means a development build** (the App Store's Expo
Go stops at SDK 54), which waits on the $99 Apple account, so "Needs an iPhone
check" above is one batch for the first device session, not something to do step
by step.

### 1.1 Building now

Nothing in progress. Steps 16–63 shipped on 2026-10-04 and 10-05, 64–78 on 10-06, and 79–84 on 10-07 (§1.2). The tenth batch
(46–51) came from playing the web build as a new user on a cleared profile, and
from the research in [`research/confidence-2026-10.md`](research/confidence-2026-10.md):
how the app asks for a number, and what a ten-question Warmup can claim. It fixed
what the design system already decided (Save waiting for a title, the paywall's
monthly figure), made two lines honest (badge hints that skipped the score; a
Warmup verdict built on the slider's default), swapped Wrapped's hit rate for
expected-vs-happened counts, and let a chart range open the predictions behind
it. A second pass at 320 and 375pt widths (an iPhone mini or SE, with or without
Display Zoom) found the identity card overflowing its 3:4 box on 375pt phones, in
the preview and the exported PNG, so it now lays out on one fixed canvas (53), plus
two smaller wraps (52). The two findings that change product behaviour are
decisions **D13** and **D14** below; both were approved the same day and built as
steps 54 and 55. A third pass added symbols to the empty states (56), put the
Warmup and Wrapped cards on the same canvas (57), and, from the feedback research
in the same file (§6), the range's said-against-happened to the Resolve line (58),
and held the native splash until the first real screen is decided (59). Then three
decisions came back the same day: D9 (evening reminders, step 60), D2 (days, with a
three-a-day threshold, step 61) and D4 (honesty visuals, step 62).

The 2026-10-06 batch (64–71) started from the owner's call on the streak:
**checkpoints at 7, 30, 100 and 365 days, then yearly**, with the celebration
animation deliberately left out (parked as FUTURE_UI B1, with a proposed spec and
the open haptic question). Step 64 marks them still: the tinted Home row, the card on
the answer that earned it, and How scoring works. Step 65 gave a run's "All caught
up" what it came to and the streak row. The rest came from playing a cleared profile
and the demo data at 402 and 320pt: Account on the canvas with the paywall's close
(66), "Next 7 days" instead of a "This week" that held next Tuesday (67), a ghost
chart whose key explained bars it didn't draw (68), an empty History with no way
forward (69), ranges, prices and the milestone phrase splitting at 320pt (70), and a
Warmup answer key whose ✗ sat beside the right answer (71).

A second pass the same day (72–78) played a fresh profile and the demo data at
375 × 667, an iPhone SE's screen, where the short height showed what the wider
passes couldn't. Three
screens kept a scroll offset into content that had changed under it: the Warmup
verdict opened on its chart (72), Log reopened at an empty bottom after a save (75),
and History's filtered list opened mid-way (76). Stats' badge rows changed order
after the first log, because a launch and a recompute sorted them differently (73).
How scoring works split its ranges at 320 and 375pt, so `holdRanges` now runs
wherever a range is drawn (74). Two smaller ones: "1 of 2 have happened" (77) and a
Restore capsule competing with the paywall's one CTA (78).
The next useful read is still on an iPhone, with VoiceOver on for
steps 41, 43, 44 and 71.

### 1.2 From the element research (2026-10-06; built 2026-10-07)

[`research/elements-2026-10.md`](research/elements-2026-10.md) looked at how 18 apps
rated 4.7 or higher choose their controls, and at 8,057 of their recent reviews. Three
changes followed from it that needed no decision, because DESIGN_SYSTEM says how
(§7.7, §7.20, §7.21). All three were built on 2026-10-07, with the four decisions it
raised (D3, D7, D15, D16), which you made the same day: steps 79–84 in §1.

| Step | What | Why |
|---|---|---|
| 79 A visible close on every sheet | `CloseButton` at the top of Resolve (single and run) from the start, and of Share and How scoring works, whose bottom **Done** goes. On Resolve after an answer it does what Done does: the answer is already saved, and a typed reflection goes through the existing swipe-down guard. | Before an answer, Resolve can only be left by the grabber or a swipe on iOS, and on web by nothing but the browser's Back. HIG Toolbars and Sheets, NN/g bottom sheets; every sheet in the 4.7+ set has an ×. |
| 80 Settings as a grouped list | Whole-row targets with chevrons and current values, switches as now, footers for the explanations, Erase alone at the bottom (DESIGN_SYSTEM §7.21). | Rows today end in "Sign in", "See Plus" and "Read" capsules beside three switches, and only the capsule responds. HIG Lists; Streaks, Todoist; Chen et al.'s "design specification" complaints. |
| 81 Erase is not a filled primary | "Erase everything" / "Delete account" become an outlined capsule with a `destructive` label (a new `Button` variant), Cancel beneath. | The app's one irreversible action is its most prominent control. HIG Buttons: never give a destructive action the primary role. |

**Next:** dark mode (D7, decided: follow the system setting). It touches every
screen, so it waits on the web build being back up for a side-by-side check of
both appearances. The one structural call still open before 1.0 is the typeface
(D1); the system font is what's built.

### What's left in the parking lot

Every item still in `FUTURE_UI.md` needs something an agent can't supply:

| Item | What it waits on |
|---|---|
| A2 Daily drill | A bank of ~200 sourced questions (content, and fact-checking it), and D2: whether a drill counts toward the streak. |
| A4 Repeating predictions (automatic) | A `recurrences` table needs a Supabase migration applied to the live project, which is paused. "Log it again" (step 22) covers the manual half. |
| A7 Revising a confidence | A scoring rule written into `CLAUDE.md` first (the score stays on the first number). |
| A8 Web Warmup landing page | Hosting (the GitHub Pages switch) and the anonymous-funnel decision. |
| A9 Predict with a friend | Backend work, and real sync users first. |
| A10 Widgets, Siri Shortcut | The SDK 58 upgrade and a device build. |
| §B 👍/👎 on Coach cards | A new analytics event, and the event catalogue is declared in `APP_PRIVACY.md`. |
| §B Progress ring | Nothing, but it's optional: the segmented bar reads fine. Left parked on purpose. |
| §B1 Streak checkpoint celebration | Out of scope by the owner's call (2026-10-06): step 64 ships the checkpoints still. Specced in FUTURE_UI B1; needs the haptic call (Success or Rigid) and a device to tune it. |

And the decisions in §2 below.

---

## 2. Open decisions (need the owner's call before building)

| # | Decision | Recommendation | Why it needs sign-off |
|---|---|---|---|
| D1 | Typeface | **System font** (SF Pro + SF Rounded for numerals). Runner-up: Inter via `@expo-google-fonts/inter` for identical iOS/web rendering and more brand character. | Brand choice; affects every screen and the web screenshots. DESIGN_SYSTEM §3 assumes the system font until decided. |
| D2 | Streak unit | ~~Make the visible streak **weekly** ("a week with ≥ 1 log or resolution"), shown as week dots, with a silent grace week per month and back-fill when an overdue prediction is resolved. Keep the daily number internal.~~ **Decided 2026-10-05: days, with a threshold.** A day counts when at least 3 predictions are logged or answered in it, because a number that climbs every day is the appeal. Built as step 61: logging counts as well as answering (which fixes the "due dates aren't yours" problem), and Home shows the streak with what today adds. **Checkpoints decided 2026-10-06:** 7, 30, 100 and 365 days, then every further year, named on the day (step 64); their celebration animation is parked as FUTURE_UI B1. | Changes `UserStat.current_streak` semantics in `CLAUDE.md`. Resolutions happen when predictions come *due*, which the user doesn't control, so a daily streak breaks for reasons that aren't their fault — the worst case in Silverman & Barasch (JCR 2023). |
| D3 | Navigation | ~~Four tabs **Today · Insights · History · You**; Log becomes a "+" opening a sheet; native tabs (Liquid Glass) on iOS with JS tabs kept on web. **Build it after the SDK 58 upgrade**, where `expo-router/native-tabs` is stable (SDK 54–57 only have `unstable-native-tabs`, and 57 had an `initialRouteName` bug, expo#49897).~~ **Decided 2026-10-07: four tabs now, before 1.0; built as step 82** on the JS tabs, with Log as a sheet from a floating "+". Native Liquid Glass tabs follow the SDK 58 upgrade with the same layout. | Restructures navigation and routes. |
| D4 | Engine additions for honesty visuals | ~~Per-bucket **consistency band** (binomial 50% range at n), **expected count** per bucket for the "Dots" view, optional **bootstrap range** on the score.~~ **Approved and built 2026-10-05** (step 62): grey chance bars on the chart, "give or take" on the rating, and the counts as dots. | New engine outputs (core-domain / Layer 3). The UI must not compute them. |
| D5 | Expo SDK upgrade | **Refined 2026-10-04:** ship the first device build on 55, then go **straight to 58** once it's stable (beta since 2026-09-15: RN 0.88, stable native tabs, `expo-app-intents`, the iOS 27 scene lifecycle). Skip stopping at 56/57. Sequenced as `NEXT_STEPS.md` item j. | Cross-cutting and L-sized: 58 has breaking changes in `expo-router`, `expo-sqlite` and `expo-file-system` and makes RN's strict TypeScript API the default. Doing it after the first device run keeps device bugs attributable. |
| D6 | Milestone share cards and a "Year in Predictions" grid | Add share cards at Tracker unlock, first non-provisional score, and 50/100 resolutions; later, a Daylio-style one-cell-per-prediction grid. The 100- and 365-day streak checkpoints (step 64) are candidates too. | New share surfaces; scope call. |
| D7 | Dark mode | ~~**Support the system setting, no in-app toggle**, after the token migration (step 1) is done. Neutrals proposed in DESIGN_SYSTEM §2.5, all text ≥ 5.2:1.~~ **Decided 2026-10-07: follow the system setting in 1.0, no in-app toggle.** Building next, once the web build can show both appearances side by side. | HIG: people "generally expect all apps … to respect their preference". It doubles the visual QA surface (every screen, share-card preview, both glass extremes), and `app.json` is currently pinned to light. |
| D8 | Resolve from the notification | *Happened* / *Didn't* actions on the reminder, **foreground** first (opens straight into the resolved state). | Changes the resolve path and the notification service. Read the action from `getLastNotificationResponse()` at startup as well as the listener, or a cold-start tap is lost. `opensAppToForeground: false` is documented as waking the app headless on iOS, but reports of buttons missing when the app is killed (expo#36282) keep the background version behind a device test. |
| D9 | Reminder time | ~~Fire in the **evening of the due day** (e.g. 19:00 local), or at a user-set check-in time defaulting to that.~~ **Approved and built 2026-10-05** (step 60): 19:00 local on the due day; queued noon reminders move on the next launch. A user-set time is not built. | Behaviour change in L5. **Checked 2026-10-04:** every due date is stored at 12:00 local (`DuePicker`, `LogPredictionForm`), so reminders fire at noon today. The scheduler only acts on *changes* to the pending set and never reconciles at launch (`scheduler.ts` header), so moving the time also needs a launch-time reschedule of reminders already queued — that's the real size of this (M, not S). **Update 2026-10-05:** step 37 added the launch-time reconcile, so what's left is the new time and a reschedule of reminders whose time doesn't match: S–M. |
| D11 | An on-device Coach (FUTURE_UI P2) | Prototype it after the SDK upgrade: Apple Foundation Models first where available, the OpenAI Coach as fallback, both through the same grounding validator. Keep it Plus at first. | Changes the Coach's provider and privacy story (nothing leaves the phone on supported devices), and whether it stays Plus. |
| D12 | Widgets (FUTURE_UI P1) | Build the "ready to resolve" widget first, right after the SDK 56+ upgrade; the identity widget second. | A new native target and app group; scope and order are a product call. |
| D13 | The number before you touch it | ~~**Start both confidence controls empty**: the readout says "Set how sure you are", the thumb appears where it's first touched (the ±5 buttons start from the middle of the range), and Next / Save wait for a number. Watch `warmup_completed / warmup_started` either side of the change. Runner-up for the Warmup only: Hedge-style buttons (50 · 60 · 70 · 80 · 90 · 100), one tap each.~~ **Approved and built 2026-10-05** (step 54). The readout shows "—%, not set yet" and the thumb rests grey mid-range until the first drag, tap, touch or ±5. | Until then the Warmup started at 75% and Log at 50%. Tapping through the Warmup yields "I run hot · 75% sure, 50% right" on the first share card, about a number the user never chose (step 49 now says so, but still shares it). On Log, 50% sits inside the 35–65% band, so an untouched save earns the integrity bonus and counts as an "honest coin-flip" on Wrapped. Step-5 presets probably anchor little (Liu & Conrad 2019 found no consistent effect on 21-point sliders); the cost is that "didn't touch it" can't be told from "chose it". It adds one required interaction to the Day-0 funnel and the 15-second Log target, so it's your call. |
| D14 | What the Warmup's verdict can claim | ~~**(a) now, (c) later.** (a) Keep the ten questions and add one true line under an overconfident verdict: "These were picked to be tricky, so most people run hot here. Your own predictions are the real test." (c) Once A2's question bank exists, draw ten at random from it, so the verdict reflects the person rather than the selection. Option (b), swapping the three "obvious answer is wrong" items for plain ones now, is the cheap version of (c).~~ **Approved 2026-10-05.** (a) is built (step 55); (c) waits on A2's question bank (FUTURE_UI). | The bank's own header says it's chosen to make users "visibly overconfident", with items "where the obvious answer is wrong". That is how overconfidence is manufactured in the literature: selected items average .73 confidence for .64 correct, representative ones .73 for .72 (Juslin, Winman & Olsson 2000; Juslin 1994). So "You run overconfident" on Day 0, and the card that shares it, describes our questions as much as the user. But GROWTH §5.1 wants that moment as the hook. |
| D15 | Asking for a rating | ~~**Yes, with the system prompt** (`expo-store-review`'s `requestReview()`, after `npx expo install`): once, on Home after the sheet closes on a finished run ("All caught up") or on the answer that unlocked the score, whichever comes first, and only after 7 days and 10 answers. Never inside the sheet: HIG says not to interrupt a task. Never in the Warmup, never after a single answer (so a Yes is never what triggers it), never from a button. App-side at most once per 90 days; the system caps it at three a year.~~ **Decided 2026-10-07 as proposed; built as step 83.** | Every app in the 4.7+ set rates far above its written reviews (61% of recent written reviews are five-star against ratings of 4.7–4.95): most of the stars come from people who rate without writing, most likely through the system prompt. Calibrate never asks, so its rating would come only from those who seek out the store. A new native module and a new moment in the core loop (HIG: "Avoid asking… during onboarding"; Appbot: >400% more ratings per month, average unchanged). |
| D16 | A reminder before the trial converts | ~~**Yes:** a local notification 2 days before the month's trial renews, saying when it renews and at what price, both from the store ("Your free month ends Thursday" · "Plus then renews for a year at $29.99."), scheduled on purchase from the store's own expiry and cancelled if the trial is. Then the paywall's timeline gains the "we remind you" step DESIGN_SYSTEM §7.6 holds back until it's true.~~ **Decided 2026-10-07 as proposed; built as step 84** (10:00 local two days before, so it never lands at night). | Billing is the largest complaint in the sample: a third of all low reviews are about money, and the largest part of those mention a charge, a trial or cancelling (`research/elements-2026-10.md` §1.4). A new notification type in L5, and a promise on the paywall that has to hold. Like the others in DESIGN_SYSTEM §7.15 it carries no offer, only when the charge comes and how much. |
| D10 | What Skip means | ~~Relabel to "Can't tell / doesn't apply" with "It won't count toward your score", shown as a text button.~~ **Built 2026-10-04.** The open question was factual and the code answers it: skips are excluded from the score (`calibration.ts`), the streak (`streak.ts`), Wrapped (`wrapped.ts`), patterns and trends, and History already says "Not scored". So the line is true everywhere. One commit to revert if you'd rather keep a Skip button. | — |

---

### Notes from the 2026-10-04 pass, for when you decide

- **D2 (decided: days, three a day):** the old daily streak needed a resolution
  every day, which real use couldn't produce since resolutions come when
  predictions fall due. Counting logs too fixes that without giving up days.
- **D3 / D5:** sequenced after the SDK 58 upgrade (`NEXT_STEPS.md` item j);
  nothing to decide until then except whether you want the four tabs at all.
- **D4 (built):** on the demo chart the n=5 and n=8 dots now sit in long grey
  bars and the n=57 dot sits far below its short one: the overconfidence at
  80–100% is real, the small ones are within luck.
- **D7 (dark mode):** `app.json` still pins `userInterfaceStyle` to light and
  the tokens have one palette; the proposed neutrals in DESIGN_SYSTEM §2.5 are
  the starting point.

### Notes from the 2026-10-06 element research

- **Before launch, not after:** reviews punish a changed UI more than anything
  else in the sample (0.8% of five-star reviews, 6.1% of one- and two-star), and
  Chen et al. found 90% of "it used to look better" reviews are 1–2★. Navigation
  (D3), typeface (D1) and dark mode (D7) are the structural calls left, and they
  cost least while nobody has learned the current layout. Recommendation: decide
  all three before App Store submission; build whichever are wanted for 1.0.
- **D7:** customisation, themes and dark mode lean positive in five-star reviews
  (2.3×), and Chen et al.'s "customization" reviews are requests more than
  complaints (22% 1–2★). Evidence for supporting the system setting; the
  QA cost in the D7 row stands.
- **What stays:** labelled chips and pills, the slider with ±5, Share's segmented
  tabs and the bullet bar are what the top apps or the HIG would choose too
  (DESIGN_SYSTEM §7.20). The bar is a deliberate departure from the rings of WHOOP,
  Bevel and Oura: calibration bands are thresholds, not progress toward 100.

## 3. Reference apps

Best overall references, and what to take from each:

1. **(Not Boring) Habits** (ADA 2022, same $29.99/yr and $59.99 lifetime price points,
   paid skins) — the Resolve press → haptic → acknowledgement, and cosmetics as Plus.
2. **WHOOP / Oura** — one 0–100 score, named bands, a grey "calibrating" state; Oura's
   70/85 cut points match Calibrate's badge thresholds.
3. **Spotify Wrapped 2025 + Co–Star** — archetype + one real receipt + selective colour
   (500M shares on day one); blunt copy on a stark canvas.
4. **Gentler Streak** (ADA 2024) — no-guilt tone for Guesser and misses.
5. **Bevel** — free scores, paid AI interpretation: the closest analogue to Coach-as-Plus.
6. **Strava Year in Sport 2025** — counter-example: paywalling the recap drew public
   backlash, which backs "never paywall a shareable".

For how these and a dozen other 4.7+ apps choose individual controls (tabs, the add
action, sheets, settings rows, confirmations, the rating prompt), see
[`research/elements-2026-10.md`](research/elements-2026-10.md): Daylio and How We
Feel for logging in a few taps, Streaks and Todoist for Settings as a grouped list,
Oura for a short Liquid Glass tab bar with the add action beside it, and Clue as the
counter-example for upsells that interrupt.
