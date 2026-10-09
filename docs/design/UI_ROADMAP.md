# Calibrate — UI Roadmap

**As of:** 2026-10-09. The *what to build next* companion to
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (which holds the rules). Evidence in
[`research/`](research/); "before" screens from 2026-09-25 in [`baseline/`](baseline/).
Feature ideas beyond this roadmap are parked in [`FUTURE_UI.md`](FUTURE_UI.md).
What has been built, step by step (steps 0–103), is in
[`BUILT_LOG.md`](BUILT_LOG.md); this file holds only what is still open.

---


## 1. Where it stands

Every step through 103 is built (see [`BUILT_LOG.md`](BUILT_LOG.md)). The redesign
pass, the element and retention research batches, the Day-0 rework (D18) and the
daily-practice, rest-day and reminder features all shipped. **Everything not listed
in the parking lot or §2 is done**; what's left is a first session on an iPhone
(checklist: `docs/HUMAN_VERIFICATION.md` C2) and the decisions below.

Verification for any new UI step: `npm test`, a web-build screenshot at phone width
(320 and 375pt, both appearances), and an iPhone run for anything with haptics,
symbols, sheets or glass (web shows none of them). Since 2026-10-04 an iPhone run
means a development build (the App Store's Expo Go stops at SDK 54), which waits on
the $99 Apple account, so device checks are one batch for the first device session.

### What's left in the parking lot

Every item still in `FUTURE_UI.md` needs something an agent can't supply:

| Item | What it waits on |
|---|---|
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
| D1 | Typeface | ~~**System font** (SF Pro + SF Rounded for numerals). Runner-up: Inter via `@expo-google-fonts/inter` for identical iOS/web rendering and more brand character.~~ **Decided 2026-10-07: Inter; built as step 85.** | Brand choice; affects every screen and the web screenshots. DESIGN_SYSTEM §3 assumes the system font until decided. |
| D2 | Streak unit | ~~Make the visible streak **weekly** ("a week with ≥ 1 log or resolution"), shown as week dots, with a silent grace week per month and back-fill when an overdue prediction is resolved. Keep the daily number internal.~~ **Decided 2026-10-05: days, with a threshold.** A day counts when at least 3 predictions are logged or answered in it, because a number that climbs every day is the appeal. Built as step 61: logging counts as well as answering (which fixes the "due dates aren't yours" problem), and Home shows the streak with what today adds. **Checkpoints decided 2026-10-06:** 7, 30, 100 and 365 days, then every further year, named on the day (step 64); their celebration animation is parked as FUTURE_UI B1. **Lowered to one a day by D17 (2026-10-07)**, with three kept as the day's goal; rest days added as step 87. | Changes `UserStat.current_streak` semantics in `CLAUDE.md`. Resolutions happen when predictions come *due*, which the user doesn't control, so a daily streak breaks for reasons that aren't their fault — the worst case in Silverman & Barasch (JCR 2023). |
| D3 | Navigation | ~~Four tabs **Today · Insights · History · You**; Log becomes a "+" opening a sheet; native tabs (Liquid Glass) on iOS with JS tabs kept on web. **Build it after the SDK 58 upgrade**, where `expo-router/native-tabs` is stable (SDK 54–57 only have `unstable-native-tabs`, and 57 had an `initialRouteName` bug, expo#49897).~~ **Decided 2026-10-07: four tabs now, before 1.0; built as step 82** on the JS tabs, with Log as a sheet from a floating "+". Native Liquid Glass tabs follow the SDK 58 upgrade with the same layout. | Restructures navigation and routes. |
| D4 | Engine additions for honesty visuals | ~~Per-bucket **consistency band** (binomial 50% range at n), **expected count** per bucket for the "Dots" view, optional **bootstrap range** on the score.~~ **Approved and built 2026-10-05** (step 62): grey chance bars on the chart, "give or take" on the rating, and the counts as dots. | New engine outputs (core-domain / Layer 3). The UI must not compute them. |
| D5 | Expo SDK upgrade | **Refined 2026-10-04:** ship the first device build on 55, then go **straight to 58** once it's stable (beta since 2026-09-15: RN 0.88, stable native tabs, `expo-app-intents`, the iOS 27 scene lifecycle). Skip stopping at 56/57. Sequenced as `NEXT_STEPS.md` item j. | Cross-cutting and L-sized: 58 has breaking changes in `expo-router`, `expo-sqlite` and `expo-file-system` and makes RN's strict TypeScript API the default. Doing it after the first device run keeps device bugs attributable. |
| D6 | Milestone share cards and a "Year in Predictions" grid | Add share cards at Tracker unlock, first non-provisional score, and 50/100 resolutions; later, a Daylio-style one-cell-per-prediction grid. The 100- and 365-day streak checkpoints (step 64) are candidates too. | New share surfaces; scope call. |
| D7 | Dark mode | ~~**Support the system setting, no in-app toggle**, after the token migration (step 1) is done. Neutrals proposed in DESIGN_SYSTEM §2.5, all text ≥ 5.2:1.~~ **Decided 2026-10-07: follow the system setting in 1.0, no in-app toggle.** Built as step 86. | HIG: people "generally expect all apps … to respect their preference". It doubles the visual QA surface (every screen, share-card preview, both glass extremes), and `app.json` is currently pinned to light. |
| D8 | Resolve from the notification | *Happened* / *Didn't* actions on the reminder, **foreground** first (opens straight into the resolved state). | Changes the resolve path and the notification service. Read the action from `getLastNotificationResponse()` at startup as well as the listener, or a cold-start tap is lost. `opensAppToForeground: false` is documented as waking the app headless on iOS, but reports of buttons missing when the app is killed (expo#36282) keep the background version behind a device test. |
| D9 | Reminder time | ~~Fire in the **evening of the due day** (e.g. 19:00 local), or at a user-set check-in time defaulting to that.~~ **Approved and built 2026-10-05** (step 60): 19:00 local on the due day; queued noon reminders move on the next launch. A user-set time is not built. | Behaviour change in L5. **Checked 2026-10-04:** every due date is stored at 12:00 local (`DuePicker`, `LogPredictionForm`), so reminders fire at noon today. The scheduler only acts on *changes* to the pending set and never reconciles at launch (`scheduler.ts` header), so moving the time also needs a launch-time reschedule of reminders already queued — that's the real size of this (M, not S). **Update 2026-10-05:** step 37 added the launch-time reconcile, so what's left is the new time and a reschedule of reminders whose time doesn't match: S–M. |
| D11 | An on-device Coach (FUTURE_UI P2) | Prototype it after the SDK upgrade: Apple Foundation Models first where available, the OpenAI Coach as fallback, both through the same grounding validator. Keep it Plus at first. | Changes the Coach's provider and privacy story (nothing leaves the phone on supported devices), and whether it stays Plus. |
| D12 | Widgets (FUTURE_UI P1) | Build the "ready to resolve" widget first, right after the SDK 56+ upgrade; the identity widget second. | A new native target and app group; scope and order are a product call. |
| D13 | The number before you touch it | ~~**Start both confidence controls empty**: the readout says "Set how sure you are", the thumb appears where it's first touched (the ±5 buttons start from the middle of the range), and Next / Save wait for a number. Watch `warmup_completed / warmup_started` either side of the change. Runner-up for the Warmup only: Hedge-style buttons (50 · 60 · 70 · 80 · 90 · 100), one tap each.~~ **Approved and built 2026-10-05** (step 54). The readout shows "—%, not set yet" and the thumb rests grey mid-range until the first drag, tap, touch or ±5. | Until then the Warmup started at 75% and Log at 50%. Tapping through the Warmup yields "I run hot · 75% sure, 50% right" on the first share card, about a number the user never chose (step 49 now says so, but still shares it). On Log, 50% sits inside the 35–65% band, so an untouched save earns the integrity bonus and counts as an "honest coin-flip" on Wrapped. Step-5 presets probably anchor little (Liu & Conrad 2019 found no consistent effect on 21-point sliders); the cost is that "didn't touch it" can't be told from "chose it". It adds one required interaction to the Day-0 funnel and the 15-second Log target, so it's your call. |
| D14 | What the Warmup's verdict can claim | ~~**(a) now, (c) later.** (a) Keep the ten questions and add one true line under an overconfident verdict: "These were picked to be tricky, so most people run hot here. Your own predictions are the real test." (c) Once A2's question bank exists, draw ten at random from it, so the verdict reflects the person rather than the selection. Option (b), swapping the three "obvious answer is wrong" items for plain ones now, is the cheap version of (c).~~ **Approved 2026-10-05.** (a) is built (step 55); (c) waited on A2's question bank (FUTURE_UI); step 88's tables are that bank, so (c) is ready to build. | The bank's own header says it's chosen to make users "visibly overconfident", with items "where the obvious answer is wrong". That is how overconfidence is manufactured in the literature: selected items average .73 confidence for .64 correct, representative ones .73 for .72 (Juslin, Winman & Olsson 2000; Juslin 1994). So "You run overconfident" on Day 0, and the card that shares it, describes our questions as much as the user. But GROWTH §5.1 wants that moment as the hook. |
| D15 | Asking for a rating | ~~**Yes, with the system prompt** (`expo-store-review`'s `requestReview()`, after `npx expo install`): once, on Home after the sheet closes on a finished run ("All caught up") or on the answer that unlocked the score, whichever comes first, and only after 7 days and 10 answers. Never inside the sheet: HIG says not to interrupt a task. Never in the Warmup, never after a single answer (so a Yes is never what triggers it), never from a button. App-side at most once per 90 days; the system caps it at three a year.~~ **Decided 2026-10-07 as proposed; built as step 83.** | Every app in the 4.7+ set rates far above its written reviews (61% of recent written reviews are five-star against ratings of 4.7–4.95): most of the stars come from people who rate without writing, most likely through the system prompt. Calibrate never asks, so its rating would come only from those who seek out the store. A new native module and a new moment in the core loop (HIG: "Avoid asking… during onboarding"; Appbot: >400% more ratings per month, average unchanged). |
| D16 | A reminder before the trial converts | ~~**Yes:** a local notification 2 days before the month's trial renews, saying when it renews and at what price, both from the store ("Your free month ends Thursday" · "Plus then renews for a year at $29.99."), scheduled on purchase from the store's own expiry and cancelled if the trial is. Then the paywall's timeline gains the "we remind you" step DESIGN_SYSTEM §7.6 holds back until it's true.~~ **Decided 2026-10-07 as proposed; built as step 84** (10:00 local two days before, so it never lands at night). | Billing is the largest complaint in the sample: a third of all low reviews are about money, and the largest part of those mention a charge, a trial or cancelling (`research/elements-2026-10.md` §1.4). A new notification type in L5, and a promise on the paywall that has to hold. Like the others in DESIGN_SYSTEM §7.15 it carries no offer, only when the charge comes and how much. |
| D17 | How much a streak day takes | ~~**One** prediction logged or answered extends the streak, and the three pips stay as the day's goal ("1 of 3 today", a day that reaches three marked as such), with rest days as built. Practice still doesn't count toward it. Before deciding, the analytics can say how often active days stop at one or two (research §4).~~ **Decided 2026-10-07 as proposed; built as step 90.** | Reverses D2's threshold (decided 2026-10-05: "a number that climbs every day is the appeal", which this keeps). Duolingo's A/B test of exactly this, a single lesson extending the streak instead of the daily goal, raised day-14 retention 3.3%, daily actives 1%, and new users on a streak 19%, while fewer people met the daily goal (research/retention-2026-10.md §2.1). Changes `current_streak` in `CLAUDE.md`, the streak copy and How scoring works, and checkpoints arrive sooner for most people. |
| D18 | What Day 0 is for | ~~**A warm-up that teaches the mechanic, then a first real result the next day.** (1) The Warmup's ten come from the practice tables, not picked to be tricky (D14 c). (2) The result leads with counts ("You said 78% on average. 6 of 10 were right.") and a read of *these ten* ("On these ten, you ran hot"), not an identity ("You run overconfident"). (3) It bridges to the person's own plans, where overconfidence really lives: "Trivia is the warm-up. People are most overconfident about their own plans: students who expected to finish their thesis in 34 days took 56." **Predict something about tomorrow.** (4) The first prediction defaults to *Tomorrow* with starter ideas that resolve by then, so the first real "you said 70%, it happened" arrives on Day 1 at 19:00, not a week later. (5) The Day-0 card shares the counts as an invitation ("78% sure, 6 of 10 right. How sure are you?"), not a personality. Measure `warmup_completed`, the first log and D1 retention before and after.~~ **Decided 2026-10-07, for now: Day 0 is for calibration**, not for the identity hook. Points (1)–(5) are the plan; **not built yet**, and the Warmup works as before until they are. Step 94 (the same evening) is narrower and came first: a starter idea sets the due date its own words imply; a typed prediction still defaults to "In a week" until (4) is built. | The goal is calibration about your own goals. Trivia transfers weakly to other tasks (Lichtenstein & Fischhoff 1980); picked items manufacture overconfidence (D14); and the planning fallacy is the overconfidence a goal app should catch: Buehler, Griffin & Ross 1994, predicted 33.9 days, took 55.5, about 30% on time. It gives up the dramatic "You run overconfident" hook GROWTH §5.1 wanted, and changes onboarding, the Day-0 card and the Log default. |
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
