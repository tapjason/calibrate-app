# Calibrate — UI Roadmap

**As of:** 2026-10-03. The *what to build next* companion to
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
| 6 Reanimated | Done except confetti and the emblem flip (FUTURE_UI §B). Warmup score count-up and the landing haptic shipped 2026-10-03. | Yes |
| 7 Warmup → verdict → share | Done | — |
| 8 Lens emblem | Done | — |
| 9 Share cards | Done | — |
| 10 Paywall | Done (UI). Store config fixed in the Test Store 2026-10-01; App Store Connect must match. | — |
| 11 Sheets | Done. A typed reflection is guarded on swipe-down (Save / Discard / Keep editing). Web: the browser's own Back skips the guard. | Yes |
| 12 Everyday surfaces | Done, including receipt-first Coach cards (2026-10-03). | — |
| 13 Notifications | Done (copy, placeholders, passive digest). Actions and timing are D8 / D9. | Yes |
| 14 Decisions | Waiting on §2. | — |

Device checks are listed in `docs/HUMAN_VERIFICATION.md` C2. Verification for
any new UI step: `npm test`, a web-build screenshot at phone width, and an iPhone run
for anything with haptics, symbols, sheets or glass (web shows none of them).

---

## 2. Open decisions (need the owner's call before building)

| # | Decision | Recommendation | Why it needs sign-off |
|---|---|---|---|
| D1 | Typeface | **System font** (SF Pro + SF Rounded for numerals). Runner-up: Inter via `@expo-google-fonts/inter` for identical iOS/web rendering and more brand character. | Brand choice; affects every screen and the web screenshots. DESIGN_SYSTEM §3 assumes the system font until decided. |
| D2 | Streak unit | Make the visible streak **weekly** ("a week with ≥ 1 log or resolution"), shown as week dots, with a silent grace week per month and back-fill when an overdue prediction is resolved. Keep the daily number internal. | Changes `UserStat.current_streak` semantics in `CLAUDE.md`. Resolutions happen when predictions come *due*, which the user doesn't control, so a daily streak breaks for reasons that aren't their fault — the worst case in Silverman & Barasch (JCR 2023). |
| D3 | Navigation | Four tabs **Today · Insights · History · You**; Log becomes a "+" opening a sheet; native tabs (Liquid Glass) on iOS with JS tabs kept on web. | Restructures navigation and routes; native tabs are `unstable-` on SDK 55. |
| D4 | Engine additions for honesty visuals | Per-bucket **consistency band** (binomial 50% range at n), **expected count** per bucket for the "Dots" view, optional **bootstrap range** on the score. | New engine outputs (core-domain / Layer 3). The UI must not compute them. |
| D5 | Expo SDK upgrade | Stay on 55 for this design work. When upgrading, go to 57.0.9+ (or 58 for stable NativeTabs). | Cross-cutting; several recommended APIs (stable NativeTabs, `@expo/ui`, variable fonts) only arrive after 55. |
| D6 | Milestone share cards and a "Year in Predictions" grid | Add share cards at Tracker unlock, first non-provisional score, and 50/100 resolutions; later, a Daylio-style one-cell-per-prediction grid. | New share surfaces; scope call. |
| D7 | Dark mode | **Support the system setting, no in-app toggle**, after the token migration (step 1) is done. Neutrals proposed in DESIGN_SYSTEM §2.5, all text ≥ 5.2:1. | HIG: people "generally expect all apps … to respect their preference". It doubles the visual QA surface (every screen, share-card preview, both glass extremes), and `app.json` is currently pinned to light. |
| D8 | Resolve from the notification | *Happened* / *Didn't* actions on the reminder, **foreground** first (opens straight into the resolved state). | Changes the resolve path and the notification service. Background actions reach JS only on Android per the Expo docs; iOS needs a device test. |
| D9 | Reminder time | Fire in the **evening of the due day** (e.g. 19:00 local), or at a user-set check-in time defaulting to that. | Behaviour change in L5; existing scheduled reminders would need rescheduling. |
| D10 | What Skip means | Relabel to "Can't tell / doesn't apply" with "It won't count toward your score", shown as a text button. | Visual weight is a design call, but the label states a product rule; confirm it matches how skips are treated everywhere (score, streak, Wrapped). |

---

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
