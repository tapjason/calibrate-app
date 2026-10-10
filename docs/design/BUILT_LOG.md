# Calibrate — UI build log

What was built, step by step, moved out of [`UI_ROADMAP.md`](UI_ROADMAP.md) on
2026-10-09 so the roadmap holds only what is still open. Step numbers (and the
"D" decision numbers they cite) are referenced from code comments, tests and
`CLAUDE.md`; this file is where a step number is explained. New steps are appended
here, not to the roadmap. Git history (`git log -- docs/design/`) has the diffs.

---

## Steps and batches

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
| 79 A visible close on every sheet | Done 2026-10-07, unit-tested and web-verified at 375 × 667 (the round × at the top of Resolve, the run, Share and How scoring works; Share's and scoring's bottom Done gone) | Yes (the × clear of the grabber; swipe-down still works) |
| 80 You: settings as a grouped list | Done 2026-10-07, unit-tested and web-verified (whole-row targets with chevrons, switches, red Erase alone at the bottom; DESIGN_SYSTEM §7.21) | Yes (row highlight on press, VoiceOver row names) |
| 81 Erase is not a filled primary | Done 2026-10-07, unit-tested and web-verified (Button's danger variant is outlined with a destructive edge and label) | — |
| 82 D3: four tabs and the floating "+" | Done 2026-10-07, unit-tested and web-verified at 375 × 667 (Today · Insights · History · You; Log as a full-height sheet with a title, the × and a discard guard; the Warmup hands off to Today with Log open; "Log it again" replaces the Resolve sheet) | Yes (the "+" clear of the tab bar and home indicator; the Log sheet with the keyboard up; the Discard action sheet) |
| 83 D15: the rating prompt | Done 2026-10-07, unit-tested (`expo-store-review`; asked on Today after a finished run or the score unlock, ≥ 7 days and 10 answers, once per 90 days) | Yes (a development build shows the prompt every time; TestFlight never does, by Apple's design) |
| 84 D16: the trial-ending reminder | Done 2026-10-07, unit-tested (10:00 two days before a trial renews, the store's price, cancelled with the trial or the toggle; the paywall timeline's reminder step while notifications are on) | Yes (sandbox trials last minutes, so the 2-days-before time is already past: check the schedule in a log, or with a StoreKit config file's longer trial) |
| 85 D1: Inter everywhere | Done 2026-10-07, unit-tested and web-verified at 375 and 320pt (five weights embedded on iOS, registered on web; tokens, chrome, cards and chart labels; the streak headline drops `tnum`, the coverage cells' labels sit at 11pt, the Log placeholder is shorter) | Yes (needs a new build: the fonts are embedded at build time; check weights render, not a faux bold) |
| 86 D7: dark mode follows the phone | Done 2026-10-07, web-verified in both appearances with a contrast scan (DynamicColorIOS / CSS variables; navigation themes; badge chips; six colourless text styles, three brand700 texts and the switch thumbs fixed; share cards keep fixed colours) | Yes (Settings → Display → Dark: every tab, sheet and the chart; a card exported in dark matches one exported in light) |
| 87 Rest days | Done 2026-10-07, unit-tested and web-verified with the clock moved (the demo's 15-day streak shows "2 rest days saved"; a day later with nothing done, "Yesterday was a rest day. 1 more saved." and still 15). Every 7 counted days save one, up to 2; a day that doesn't count spends one and adds nothing; derived, never stored | Yes (VoiceOver reads the three lines as one sentence) |
| 88 Daily practice | Done 2026-10-07, unit-tested and web-verified at 375 and 320pt in both appearances (Today's row, the quiz, "2 of 3 right. You expected about 3.", the answer key, the record's "17 more"; the next day's three with the clock moved). Three questions a day from reference tables, the same for everyone, kept apart from the score | Yes (the sheet, the slider's detent haptic, VoiceOver per question) |
| 89 Practice reminder at a chosen moment | Done 2026-10-07, unit-tested (scheduling, titles, three-day window, permission in context, the tap route); the offer previewed at `/dev/celebrations` and You's row web-verified | Yes (HUMAN_VERIFICATION D1: the alert only on choosing, three requests, a tap opens practice) |
| 90 D17: one a day keeps the streak, three is the goal | Done 2026-10-07, unit-tested and web-verified at 375 and 320pt ("138-day streak. One prediction today makes it 139", then "Today counts. Goal: 1 of 3" after one log; the demo's streak grew from 15 because days with one or two now count, and nobody's goes down) | Yes (VoiceOver reads the row as one sentence) |
| 91 The chrome follows an appearance switch | Done 2026-10-07, unit-tested and web-verified (dark → light → dark → light with the app open: the header and tab bar change every time; the first switch after a load used to leave them in the old appearance under content that had changed). `useAppearance` in place of `useColorScheme` | Yes (switch Dark Mode from Control Centre with the app open) |
| 92 The date picker follows the appearance | Done 2026-10-07, web-verified in both appearances (the web input drew its date in Times New Roman and a black calendar icon on the dark surface; now Inter and `color-scheme`). iOS: `themeVariant="light"` removed | Yes (the compact picker and its popover in dark) |
| 93 One due chip chosen at a time | Done 2026-10-07, unit-tested and web-verified ("Pick a date" opened with "In a week" still chosen beside it) | — |
| 94 A starter idea brings its due date | Done 2026-10-07, unit-tested and web-verified ("A friend I message today replies the same day" was due in a week; now Tomorrow, the "this week" ones a week) | — |
| 95 Streak and scoring copy | Done 2026-10-07, unit-tested and web-verified at 320pt ("Goal: 2 of / 3" now wraps after "Today counts."; How scoring works says "Three a day is the daily goal" and names the daily practice among what doesn't count; the dev preview's rest-day rows no longer show a pip on a day with nothing done) | — |
| 96 Web: the chosen chip says so | Done 2026-10-07, unit-tested and web-verified (every radio, tab and toggle had no state in the accessibility tree on web, because react-native-web drops `accessibilityState`; `chosenProps` adds `aria-checked`, `aria-selected` or `aria-pressed` on web and leaves iOS as it was) | Yes (VoiceOver still reads the chosen chip as selected) |
| 97 D18 (1): the Warmup's ten come from the practice tables | Done 2026-10-08, unit-tested (ten distinct fair pairs, the same every time; the verdict's note is about sample size, the card drops "tricky"). The question bank file is deleted. Points (2)–(5) remain | Yes (the Warmup on a device: ten new questions read naturally) |
| 98 D18 (2): the Warmup result leads with counts and says "these ten" | Done 2026-10-08, unit-tested ("On these ten, you were overconfident"; "You said 78% on average. 6 of 10 were right."). Points (3)–(5) remain | Yes (read it once on a device) |
| 99 D18 (4): a first prediction is due tomorrow | Done 2026-10-08, unit-tested (the Log form's first-ever default is Tomorrow, later ones stay "In a week"; the five starter ideas all resolve by tomorrow). Points (3), (5) remain | — |
| 100 D18 (3): a bridge from trivia to your own plans | Done 2026-10-08, unit-tested (the thesis line under the verdict; the button reads "Predict something about tomorrow"). Only (5), the Day-0 card, remains | Yes (read it at 320pt) |
| 101 D18 (5): the Day-0 card shares counts as an invitation | Done 2026-10-08, unit-tested ("5 of 10 right" / "I was 77% sure. How sure are you?"; no "I run hot"). D18 is fully built; compare `warmup_completed`, the first log and D1 retention before and after | Yes (the card on a device) |
| 102 The Warmup's right answers are balanced by position | Done 2026-10-09, unit-tested and found in the web build (the fixed draw put 8 of 10 second, so "always B" scored 80% for everyone). Five first, five second; the Day-0 verdict, bridge and title web-verified at 375 × 667 | — |
| 103 A 100%-stated dot's "n=" label stays on the chart; the Warmup count keeps its last words together | Done 2026-10-09, unit-tested and web-verified at 320 (dark) and 375 (light): "n=10" had clipped to "n=1C" at the right edge, and "right." wrapped alone | — |
| 104 The Warmup names a lean only beyond luck | Done 2026-10-09, unit-tested and web-verified at 375 × 667 (85% on all ten, 5 right: "On these ten, you were overconfident"). The engine calls a lean only outside the central 80% of `chanceRange` at n and the mean confidence (`WARMUP_LEAN_MASS`); inside it, "On these ten, no clear lean" and "Ten answers can't tell a small lean from luck." The ±5 rule called a lean on 47–73% of perfectly calibrated people (`research/day0-2026-10.md` §2) | — |
| 105 D20: no warm-up score, one note | Done 2026-10-09, unit-tested and web-verified (the 0–100 count-up is gone; the counts lead and the chart shows them; the "small sample" note goes, since the bridge and the warm-up note already say it). The chart's landing haptic is unchanged | Yes (the reveal haptic still lands with the chart) |
| 106 Half the Warmup from the whole class | Done 2026-10-09, unit-tested (the second draw of five skips the practice's closeness band, with longitude under 90° so "east" has one answer). The band alone tilts toward overconfidence (hard–easy effect); the whole class alone was eight giveaways in ten. Changes the fixed ten, so a Warmup taken before today shows a mismatched answer key (pre-release only) | — |
| 107 The first answer ever says what the number means | Done 2026-10-09, unit-tested for Yes and No ("That's your first. A 70% call should come true about 7 times in 10, so one answer can't say much; 20 can." in place of the range line). From the second answer, the range line as before | Yes (read it in the Resolve sheet, and in a run) |
| 108 D19: a first "Not now" lasts until morning | Done 2026-10-09, unit-tested (the reminder card comes back at 06:00 local the day after a first "Not now", then a week after each later one; `reminderPromptDismissals` in settings, and a dismissal stored before today counts as one). A Day-0 "Not now" used to hide the card for a week, past the first prediction's Day-1 reminder | Yes (HUMAN_VERIFICATION D1) |
| 109 The Warmup's intro once, on the first question | Done 2026-10-09, web-verified at 375 × 667 (the eyebrow, title and intro sat above all ten questions, so Next was 35pt below the fold on every one: a scroll per question. Now on the first only, and two lines instead of three; Next is on screen for all ten) | — |
| 110 The ±5 buttons on the readout's row | Done 2026-10-09, web-verified at 375 and 320pt (on their own row under the slider they cost ~60pt on Log, the Warmup and practice. Inline from 360pt wide and up to 1.15× text; narrower or larger, they stay below, since at 320pt "100%" and the buttons overlapped by 4pt) | Yes (with Dynamic Type at its larger sizes) |
| 111 Log's Save pinned under the fields | Done 2026-10-09, web-verified at 375 × 667 and 320pt (Save was below the fold even after the starter ideas went; now the fields scroll and Save stays, over a hairline. With the keyboard up it sits behind it, which costs nothing: Save waits for a confidence, and setting one means the keyboard is down). The placeholder is dateless ("e.g. I'll finish the draft"), since "by Friday" sat over a first prediction due Tomorrow | Yes (the footer clear of the home indicator; the keyboard over the sheet) |
| 112 Share's buttons under the card | Done 2026-10-09, web-verified at 375 × 667 ("Share my card" was ~950pt down, under Shape, On the card and the themes; now straight under the preview, the options after it) | — |
| 113 "Make a real prediction" | Done 2026-10-09, web-verified (the Warmup result's primary, "Predict something about tomorrow", wrapped to two ragged lines in its capsule at 375pt; the bridge above it now ends "Make your first one about tomorrow.") | — |
| 114 D21: the "+" in the title bar | Done 2026-10-09, web-verified at 375 × 667 in both appearances (a 32pt indigo disc in a 44pt target at the right of the Today, Insights and History headers; the floating 56pt button and every list's clearance for it are gone) | Yes (the header button on iOS, its target, VoiceOver "Log a prediction") |
| 115 D22: Ready to resolve before the daily rows | Done 2026-10-09, web-verified at 375 × 667 (with three ready, "Resolve all 3" now shows on the first screen under the score; the streak, reminder and practice rows follow the ready cards, and come straight after the score when nothing is ready) | — |
| 116 The Share sheet holds still on web | Done 2026-10-09, unit-tested (two blind testers found it shaking sideways with its × and tabs untappable: the card's height follows its width, so a scrollbar appeared, narrowed the card, shortened the page and vanished again. `ScaledCanvas` ignores a scrollbar-sized widening) | — |
| 117 The Warmup's Next pinned | Done 2026-10-09, web-verified at 320 × 568 in dark (the question scrolls, Next stays under it with **Skip for now** as a text button; each question opens at its top, so the progress bar is never scrolled away) | Yes (the footer clear of the home indicator) |
| 118 The Warmup result's actions under the counts | Done 2026-10-09, web-verified at 320 × 568 (read, counts, the bridge, **Make a real prediction** and **Share my result** on the first screen; the chart, notes and answer key after) | — |
| 119 No place, mountain or person twice in the Warmup | Done 2026-10-09, unit-tested (three testers met Aconcagua twice in ten) | — |
| 120 The first ±5 sets the resting number | Done 2026-10-09, unit-tested (a blank control's first tap sets where the grey thumb rests, 75 in the Warmup and 50 on Log; it used to step past it to 80 or 45) | — |
| 121 Copy the blind testers misread | Done 2026-10-09, unit-tested: expected counts near a half say "2 or 3"; Resolve says "against the 47% you said on average"; Wrapped's verdict names its window ("This week, you ran …"); the paywall opens "Your score, curve and cards are free. Plus reads them for you and goes deeper." | — |
| 122 Chart ticks at narrow widths | Done 2026-10-09, unit-tested and web-verified at 320pt (the x labels drop the % where ticks are under 52pt apart; "80%100%" ran together) | — |

Device checks are listed in `docs/HUMAN_VERIFICATION.md` C2. Verification for
any new UI step: `npm test`, a web-build screenshot at phone width, and an iPhone run
for anything with haptics, symbols, sheets or glass (web shows none of them).
**Since 2026-10-04 an iPhone run means a development build** (the App Store's Expo
Go stops at SDK 54), which waits on the $99 Apple account, so "Needs an iPhone
check" above is one batch for the first device session, not something to do step
by step.

### 1.1 Building now

Nothing in progress. Steps 16–63 shipped on 2026-10-04 and 10-05, 64–78 on 10-06, and 79–96 on 10-07 (§1.2, the retention batch in §1.3, and the evening pass in §1.4). The tenth batch
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

Then the two structural calls left before 1.0, decided the same day: **Inter** as
the typeface (D1, step 85) and **dark mode** following the phone (D7, step 86).
Every structural decision the element research flagged is now made and built before
launch; what's left for 1.0 is the device run.

### 1.3 From the retention research (2026-10-07; built the same day)

You asked for features with high user retention.
[`research/retention-2026-10.md`](research/retention-2026-10.md) looked at what the
primary sources measured (Duolingo's own A/B tests and its KDD paper on practice
reminders, Sharif & Shu on emergency reserves, Silverman & Barasch on broken
streaks, Lally on habit formation, the calibration-training studies) and at
Calibrate's own return loop. It found three gaps: no daily reason to open the app
that doesn't wait on a due date, no cue at a time the person chose, and a streak that
one ordinary bad day ends. Three steps closed them, each additive and each recorded
in `CLAUDE.md`:

| Step | What | Evidence |
|---|---|---|
| 87 Rest days | Every 7 counted days save a rest day, up to 2, spent automatically on a day that doesn't count; the streak carries on without adding it. A third line on the streak row. | Duolingo: a second Streak Freeze slot, +0.38% daily actives. Finite, earned slack raises persistence (Sharif & Shu 2017, 2021); a repairable streak demotivates less when broken (Silverman & Barasch 2023); one miss doesn't undo a habit (Lally 2010). |
| 88 Daily practice | Three two-choice questions a day, the same for everyone, drawn from reference tables (not picked to be tricky), with the Warmup's form and answer key. Practice is kept apart from the score, the streak and Wrapped. | Wordle's one-a-day, same-for-everyone design. Calibration training's effect on real forecasts is mixed (Lichtenstein & Fischhoff 1980; Chang et al. 2016; Gruetzemacher 2024; Martin 2025), so the app never claims it. Random draws from a reference class don't manufacture overconfidence (Gigerenzer et al. 1991). |
| 89 Practice reminder | Off until a moment is picked ("With coffee · 8:00 AM"); one a day, only while the day's practice isn't done; a new title daily and the day's first question as the body; nothing past three days without a visit. | Duolingo's optimised daily reminders: +2.2% new-user D1, +2.0% D7 retention, and repetition wears them out (Yancey & Settles 2020). Implementation intentions, d = 0.65 (Gollwitzer & Sheeran 2006). |

The one change the evidence argues for that reverses an earlier call is decision
**D17** below: Duolingo's strongest retention result came from making a streak day
*easier* to earn. You approved it the same day; it's step 90. Not built: the checkpoint celebration (B1, +1.7% day-7 retention at
Duolingo) still waits on a device, and widgets and friend streaks on a native build
and a backend.

Step 88's tables also unblock **D14 (c)**, approved on 2026-10-05: the Warmup can
now draw its ten from a representative bank. Not done in this batch, because it
changes the Day-0 verdict and its card ("10 tricky questions"). A revised proposal
for the whole of Day 0 is **D18** below, decided the same evening: Day 0 is for
calibration. It's the next thing to build.

### 1.4 A pass over the day's batch (2026-10-07, evening)

Steps 79–90 all landed on one day, so the evening went back over them as a new user
would meet them: a cleared profile through the Warmup, the first log, practice and
the empty tabs, then the demo data, at 375 × 667 and 320pt, in both appearances and
with the appearance switched while the app was open. Six fixes, none of them a
product change:

- **Dark mode's loose ends** (91, 92). The first appearance switch after a load left
  the header and the tab bar in the old appearance under content that had changed:
  react-native-web's `useColorScheme` subscribes again on every render and drops the
  event when a re-render lands inside it. The date picker was still pinned to light
  on iOS, and on web drew its date in the browser's serif with a black calendar icon
  on the dark surface.
- **The Log form's due date** (93, 94). Opening "Pick a date" left "In a week"
  chosen beside it, two radios chosen in one group; and the one starter idea that
  resolves the same day ("A friend I message today replies the same day") was due in
  a week, so its reminder came six days after the answer was known. Each starter now
  sets the due chip its words imply. That isn't D18's point (4): a typed
  prediction still defaults to "In a week" until D18 is built.
- **Copy at 320pt and in How scoring works** (95). "Goal: 2 of / 3" split across lines;
  a sentence began with a numeral; the daily practice, kept apart from the score like
  the Warmup, wasn't listed under what doesn't count.
- **Selection on the web build** (96). react-native-web ignores `accessibilityState`,
  so on web no chip, answer, plan or tab ever read as chosen. That matters most for
  the Warmup, which A8 would put on the web as the share card's landing page.

The pass also checked what didn't need a fix: Today's Day-0 list, the practice row
and answer key, Insights' ghost chart, the empty Today and History (their "Log a
prediction" capsule beside the "+" is deliberate, and DESIGN_SYSTEM §7.8 now says
why), You's grouped list, the paywall and How scoring works at 320pt, and every
sheet's ×.

