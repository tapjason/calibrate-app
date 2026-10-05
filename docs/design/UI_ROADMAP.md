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
| 11 Sheets | Done. A typed reflection is guarded on swipe-down (Save / Discard / Keep editing). Web: the browser's own Back skips the guard. | Yes |
| 12 Everyday surfaces | Done, including receipt-first Coach cards (2026-10-03). | — |
| 13 Notifications | Done (copy, placeholders, passive digest). Actions and timing are D8 / D9. | Yes |
| 14 Decisions | D10 built 2026-10-04 (its one open question turned out to be checkable); the rest wait on §2. | — |
| 15 Web run-through | Done 2026-10-04: every Batch C box web can show, plus six fixes (chart label overlap, web tab bar, Wrapped verdict vs. Stats, offline sign-in text, the "Anonymous" analytics label, demo titles). Details in `HUMAN_VERIFICATION.md` Batch C. | — |

Device checks are listed in `docs/HUMAN_VERIFICATION.md` C2. Verification for
any new UI step: `npm test`, a web-build screenshot at phone width, and an iPhone run
for anything with haptics, symbols, sheets or glass (web shows none of them).
**Since 2026-10-04 an iPhone run means a development build** (the App Store's Expo
Go stops at SDK 54), which waits on the $99 Apple account, so "Needs an iPhone
check" above is one batch for the first device session, not something to do step
by step.

### 1.1 Building now (moved from `FUTURE_UI.md`, 2026-10-04)

Items that need no owner decision, or whose decision `CLAUDE.md` already makes.
Each moves here from the parking lot when work starts, and into the table above
when it ships.

| Step | Item | From | Size | State |
|---|---|---|---|---|
| 16 | Halo behind the chart's "n=" labels | FUTURE_UI §B | S | **Done** 2026-10-04 |
| 17 | Tier-up: emblem flip and confetti | FUTURE_UI §B, DESIGN_SYSTEM §6.1 `tierUp` | M | **Done** 2026-10-04 · replay at `/dev/celebrations` |
| 18 | Resolve several at once | FUTURE_UI A3 | M | **Done** 2026-10-04 · web-verified |
| 19 | Track record on the Log slider (free) | FUTURE_UI A1 | S–M | **Done** 2026-10-04 · web-verified |
| 20 | Personal correction table (Plus) | FUTURE_UI A5 | M | **Done** 2026-10-04 · web-verified with the dev Plus preview |
| 21 | Calibration by time horizon (Plus) | FUTURE_UI A6 | S–M | **Done** 2026-10-04 · web-verified with the dev Plus preview |

**16. Chart-label halo.** The connecting line can run through an "n=" label (the
demo's n=8 at 20–40%). Draw each label twice: a 3pt stroke in the surface colour
underneath, then the label. Two layered `Text` elements rather than `paintOrder`,
whose support in react-native-svg is unverified.

**17. Tier-up.** DESIGN_SYSTEM §6.1: the emblem flips on Y over 600 ms (the old
tier turns away, the new one turns in) and up to 40 confetti pieces fall for at
most 1.2 s, with the Success haptic. No new dependency: the particles are
Reanimated views in the brand ramp. Only the tier-up gets confetti; a score
unlock keeps its spring-in card (§6.2 budget). Reduce Motion: no flip, no
confetti, a 200 ms fade; the haptic still fires.

**18. Resolve several at once.** When three or more predictions are ready, Home
offers **Resolve all N** above the "Ready to resolve" group. It opens a run in the
same sheet as single Resolve, showing "2 of 5", one `ResolvePrompt` at a time:
- Yes / No → the usual "Recorded" acknowledgement with its bucket line, then
  **Next** (the last card says **Finish**). The reflection is collapsed behind
  "Add a reflection"; Change answer stays.
- Skip ("Can't tell / doesn't apply") goes straight to the next card.
- A milestone shows on the card that earned it, so it interrupts the run where it
  happens rather than queueing to the end.
- **Next is a tap, not a timer.** The parking-lot note said "straight to the
  next"; an automatic advance takes control away (WCAG 2.2.1) and makes the
  bucket line easy to miss, so the run waits for the tap.
- The queue is a snapshot of the ready ids when the run opens; a card that was
  resolved elsewhere meanwhile is passed over silently. Ends on "All caught up".

**19. Track record on the Log slider (free).** Under the confidence control, once
that category's bucket for the chosen value has ≥ 10 resolved: *"Your 60–80% calls
in finance: 7 of 12 happened."* Below that, the same line across all categories
if the overall bucket has ≥ 10; below that, nothing. Counts, never a verdict, and
the same threshold as the chart title (`chartTakeaway`). The data comes from
`statsStore`; the screen does no bucket math.
- **Free, by `CLAUDE.md`'s rule** that the paywall never touches the core loop:
  the Log screen *is* the core loop. That settles FUTURE_UI's "free or Plus?".
- Anchoring is worth measuring (do stated confidences drift toward hit rates?),
  but that needs a new analytics event, and the catalogue is closed and declared
  in `APP_PRIVACY.md`, so that part waits for the owner.

**20. Personal correction table (Plus).** *"In finance, when you say 80–100%, it
happens about 65% of the time (38 of 57)."* One row per category and confidence
band with ≥ 10 resolved, worst first, at most five; calibrated rows say the
number means what it says. Rows below threshold never appear, so it can't print
0% or 100% from two predictions. Engine output in `trends.ts`, shown in the Plus
Trends panel. Free users see it named in the Plus teaser, not a blurred copy.

**21. Calibration by time horizon (Plus).** How far ahead a call was made, from
local calendar days between logging and the due date: *next day or sooner*,
*within a week*, *within a month*, *further out*. Each row carries its own n and is
provisional below 15 (`MIN_N_CATEGORY`), showing counts instead of a score, like
the category rows beside it in Trends.

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
