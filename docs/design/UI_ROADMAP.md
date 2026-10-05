# Calibrate — UI Roadmap

**As of:** 2026-10-04. The *what to build next* companion to
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

Device checks are listed in `docs/HUMAN_VERIFICATION.md` C2. Verification for
any new UI step: `npm test`, a web-build screenshot at phone width, and an iPhone run
for anything with haptics, symbols, sheets or glass (web shows none of them).
**Since 2026-10-04 an iPhone run means a development build** (the App Store's Expo
Go stops at SDK 54), which waits on the $99 Apple account, so "Needs an iPhone
check" above is one batch for the first device session, not something to do step
by step.

### 1.1 Building now (ninth batch: accessibility, 2026-10-05)

From reading the accessibility tree of every screen on the web build (what a
screen reader is handed), as the demo account.

| Step | Item | Size | State |
|---|---|---|---|
| 41 | Settings' switches say what they switch | S | **Done** 2026-10-05 · web-verified (named, checked state toggles) |
| 42 | Decorative pieces stay silent on every platform | S | **Done** 2026-10-05 · web-verified (no glyphs, ticks or doubled n= in the tree) |
| 43 | The rating and each badge row read as one sentence | S | **Done** 2026-10-05 · unit-tested; iOS behaviour (react-native-web drops labels on generic groups, so the web tree still shows the parts) |
| 44 | The Warmup's questions are headings, and each new one is announced | S | **Done** 2026-10-05 · web-verified (heading, labelled radiogroup); announcement unit-tested |

**41.** Each Settings switch was an unnamed "switch, on": its label and description
were separate text beside it, which VoiceOver doesn't attach to the control. The
whole row becomes one switch element named by its label, with the description as
its hint and the inner Switch hidden; tapping the row toggles it.

**42.** Icons, the score bar's ticks, the badge emblems and the chart's drawing are
marked hidden with iOS-only props, which the web build ignores: there a screen
reader heard icon-font characters, "70 85 90", and every "n=" label twice (the
step-16 halo). `aria-hidden`, which React Native maps on every platform, replaces
or joins them. Matters for the web Warmup (FUTURE_UI A8) and costs nothing on iOS.

**43.** The hero read as "92", "calibration rating" and loose tick numbers, and a
badge row as "finance", "3 more resolved → Tracker" (the arrow read aloud),
"Guesser". Each becomes one element: "Calibration rating, 92 out of 100." and
"Finance: Guesser. 3 more resolved to reach Tracker."

**44.** The Warmup is the first screen anyone sees. Its title and each question are
now headings (the question's reads "Question 3 of 10. Which is longer?"), the two
answers sit in a radio group named by the question, and because Next swaps the
question in place while focus stays on the button, each new question is announced.

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

And the decisions in §2 below.

---

## 2. Open decisions (need the owner's call before building)

| # | Decision | Recommendation | Why it needs sign-off |
|---|---|---|---|
| D1 | Typeface | **System font** (SF Pro + SF Rounded for numerals). Runner-up: Inter via `@expo-google-fonts/inter` for identical iOS/web rendering and more brand character. | Brand choice; affects every screen and the web screenshots. DESIGN_SYSTEM §3 assumes the system font until decided. |
| D2 | Streak unit | Make the visible streak **weekly** ("a week with ≥ 1 log or resolution"), shown as week dots, with a silent grace week per month and back-fill when an overdue prediction is resolved. Keep the daily number internal. | Changes `UserStat.current_streak` semantics in `CLAUDE.md`. Resolutions happen when predictions come *due*, which the user doesn't control, so a daily streak breaks for reasons that aren't their fault — the worst case in Silverman & Barasch (JCR 2023). |
| D3 | Navigation | Four tabs **Today · Insights · History · You**; Log becomes a "+" opening a sheet; native tabs (Liquid Glass) on iOS with JS tabs kept on web. **Build it after the SDK 58 upgrade**, where `expo-router/native-tabs` is stable (SDK 54–57 only have `unstable-native-tabs`, and 57 had an `initialRouteName` bug, expo#49897). | Restructures navigation and routes. |
| D4 | Engine additions for honesty visuals | Per-bucket **consistency band** (binomial 50% range at n), **expected count** per bucket for the "Dots" view, optional **bootstrap range** on the score. | New engine outputs (core-domain / Layer 3). The UI must not compute them. |
| D5 | Expo SDK upgrade | **Refined 2026-10-04:** ship the first device build on 55, then go **straight to 58** once it's stable (beta since 2026-09-15: RN 0.88, stable native tabs, `expo-app-intents`, the iOS 27 scene lifecycle). Skip stopping at 56/57. Sequenced as `NEXT_STEPS.md` item j. | Cross-cutting and L-sized: 58 has breaking changes in `expo-router`, `expo-sqlite` and `expo-file-system` and makes RN's strict TypeScript API the default. Doing it after the first device run keeps device bugs attributable. |
| D6 | Milestone share cards and a "Year in Predictions" grid | Add share cards at Tracker unlock, first non-provisional score, and 50/100 resolutions; later, a Daylio-style one-cell-per-prediction grid. | New share surfaces; scope call. |
| D7 | Dark mode | **Support the system setting, no in-app toggle**, after the token migration (step 1) is done. Neutrals proposed in DESIGN_SYSTEM §2.5, all text ≥ 5.2:1. | HIG: people "generally expect all apps … to respect their preference". It doubles the visual QA surface (every screen, share-card preview, both glass extremes), and `app.json` is currently pinned to light. |
| D8 | Resolve from the notification | *Happened* / *Didn't* actions on the reminder, **foreground** first (opens straight into the resolved state). | Changes the resolve path and the notification service. Read the action from `getLastNotificationResponse()` at startup as well as the listener, or a cold-start tap is lost. `opensAppToForeground: false` is documented as waking the app headless on iOS, but reports of buttons missing when the app is killed (expo#36282) keep the background version behind a device test. |
| D9 | Reminder time | Fire in the **evening of the due day** (e.g. 19:00 local), or at a user-set check-in time defaulting to that. | Behaviour change in L5. **Checked 2026-10-04:** every due date is stored at 12:00 local (`DuePicker`, `LogPredictionForm`), so reminders fire at noon today. The scheduler only acts on *changes* to the pending set and never reconciles at launch (`scheduler.ts` header), so moving the time also needs a launch-time reschedule of reminders already queued — that's the real size of this (M, not S). |
| D10 | What Skip means | ~~Relabel to "Can't tell / doesn't apply" with "It won't count toward your score", shown as a text button.~~ **Built 2026-10-04.** The open question was factual and the code answers it: skips are excluded from the score (`calibration.ts`), the streak (`streak.ts`), Wrapped (`wrapped.ts`), patterns and trends, and History already says "Not scored". So the line is true everywhere. One commit to revert if you'd rather keep a Skip button. | — |

---

### Notes from the 2026-10-04 pass, for when you decide

- **D2 (weekly streak):** the demo account shows "streak 21" on Stats. A daily
  number that high is only reachable with resolutions every single day, which
  real use won't produce, since resolutions come when predictions fall due.
  That's the D2 argument in one screenshot.
- **D3 / D5:** sequenced after the SDK 58 upgrade (`NEXT_STEPS.md` item j);
  nothing to decide until then except whether you want the four tabs at all.
- **D4 (honesty bands):** the demo chart makes the case. The 0–20% and
  20–40% dots (n=5, n=8) sit on the diagonal with the same visual weight as the
  n=57 dot; a band would show that the small ones could easily be 20 points off.
- **D7 (dark mode):** `app.json` still pins `userInterfaceStyle` to light and
  the tokens have one palette; the proposed neutrals in DESIGN_SYSTEM §2.5 are
  the starting point.

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
