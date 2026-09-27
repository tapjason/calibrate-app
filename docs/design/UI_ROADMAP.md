# Calibrate — UI Roadmap

**As of:** 2026-09-26. The *what to build next* companion to
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (which holds the rules). Evidence in
[`research/`](research/); "before" screens in [`baseline/`](baseline/).

---

## 1. What the baseline shows

Captured from the web build on 2026-09-25.

| Screen | Problem | Fix (DESIGN_SYSTEM §) |
|---|---|---|
| 01 Warmup | The capture only caught a loading spinner, and first run opens on a blank spinner with no brand. **Re-shoot this one.** | Branded first screen, no spinner (§7.3, step 7) |
| 02 Verdict | Big blue "73" looks like a real rating, then the caveat contradicts it. Two overlapping dots, no region labels, axis text at 2.54:1. **No way to share the result**, although the spec says Warmup produces the first card. | Identity headline + reveal, "Warm-up score" at `title1`, share card (§7.2, §7.5) |
| 03 Log | Confidence (the central input) is two small ±5 buttons. Integrity text is 2.94:1 green. | Big readout + slider + tinted integrity zone (§7.3) |
| 04 Home | Giant blue "20" is the *countdown*, styled like a score. Every card repeats "Pending". | Progress ring, cards grouped by due date (§7.1) |
| 05 Stats | Another "20"; italic placeholder instead of a chart; four identical 🎲 Guesser chips; two grey "See Plus" slabs that look disabled. | Ghost chart, Lens emblems, one Plus teaser card (§7.1, §7.2, §7.4) |
| 06 History | Italic empty text at ~2.3:1, no way forward. | Proper empty state (§7.8) |
| 07 Share | "Nothing to share yet" on Day 0 even though the Warmup produced a result. | Warmup card as the Day-0 card (§7.5) |
| 08 Paywall | Three equal cards with three "Choose" buttons, no preselection, no timeline. | Annual-first selector + honest timeline + one CTA (§7.6) |
| All | UI is Tailwind blue `#2563eb`; icon/splash are indigo `#4F46E5`. ~200 hard-coded hex literals across 31 files (~40 distinct values). | Tokens (§2) |

---

## 2. Build order

Biggest visual gain for the least risk first. Each step is shippable on its own and
keeps `npm test` green. Steps 1–5 need no product sign-off.

1. **Tokens.** Create `src/constants/theme.ts` (colour, type, space, radius, shadow
   from DESIGN_SYSTEM §2–§4). Migrate files one PR at a time; start with the contrast
   failures (`#9ca3af`, the integrity green, the share-card footer). Swap `Button` to
   `brand600` and a capsule shape. No new dependencies.
2. **Icons and haptics.** `npx expo install expo-symbols expo-haptics`; symbols with
   Ionicons fallback; haptics per the §6.1 table (no Success haptic on Resolve).
3. **Confidence control.** `npx expo install @react-native-community/slider`; big
   readout, natural-frequency line, tinted integrity zone; keep ±5 and the `adjustable`
   a11y behaviour. Update the Log and Warmup component tests.
4. **Provisional states.** Replace the "20" hero on Home and Stats with the segmented
   progress ring (resolved / pending / to go) and the ghost chart. Uses counts the
   stores already expose; if "pending" isn't exposed, hand the store change to
   core-domain.
5. **Chart redesign.** Takeaway title, labelled regions, dots coloured by side with n,
   coverage row, 12 pt ticks, "Show as table". Keep `describeCalibrationCurve()`.
6. **Reanimated.** `npx expo install react-native-reanimated react-native-worklets`,
   add the Jest `setupFilesAfterEnv` file (DESIGN_SYSTEM §9) **in the same PR**, then:
   press feedback, score count-up, chart draw-in, the three celebration moments.
7. **Warmup → verdict → share.** Branded first screen, big confidence control with
   detent haptics, segmented progress, verdict reveal, Warmup share card, "Start
   tracking real calls" CTA that opens Log. Fixes the Day-0 growth gap.
8. **Lens emblem.** `LensEmblem` SVG component; drop `emoji` from `BADGE_META`;
   blueprint + progress arc for unearned tiers.
9. **Share-card redesign.** New hierarchy, Story + Post formats, text share, footer hook
   ≥ 32 px at ≥ 4.5:1, per-category show/hide.
10. **Paywall restructure.** DESIGN_SYSTEM §7.6. Check the store config first (§3).
11. **Sheets** for Resolve (medium detent) and Share (large). Needs a new dev build.
12. Anything in §4 once decided.

Verification for every step: `npm test`, then a web-build screenshot compared against
`baseline/`, and for steps 2, 3, 6, 11 a run on an iOS simulator or device (web shows
no haptics, symbols, glass or `ui-rounded`).

---

## 3. Known issues outside the code

- **Paywall store config.** The test store showed Annual at **$29.90** (spec: $29.99)
  and a **1-month trial on Monthly** too (spec: annual only). Prices and trials are read
  from the store and never assembled in code (`src/billing/revenuecat.ts`), so this is a
  RevenueCat / App Store Connect setting. Fix it there before redesigning the paywall;
  the redesign assumes a trial on Annual only.
- **Baseline 01** needs re-shooting once the Warmup has a real first screen.

---

## 4. Open decisions (need the owner's call before building)

| # | Decision | Recommendation | Why it needs sign-off |
|---|---|---|---|
| D1 | Typeface | **System font** (SF Pro + SF Rounded for numerals). Runner-up: Inter via `@expo-google-fonts/inter` for identical iOS/web rendering and more brand character. | Brand choice; affects every screen and the web screenshots. DESIGN_SYSTEM §3 assumes the system font until decided. |
| D2 | Streak unit | Make the visible streak **weekly** ("a week with ≥ 1 log or resolution"), shown as week dots, with a silent grace week per month and back-fill when an overdue prediction is resolved. Keep the daily number internal. | Changes `UserStat.current_streak` semantics in `CLAUDE.md`. Resolutions happen when predictions come *due*, which the user doesn't control, so a daily streak breaks for reasons that aren't their fault — the worst case in Silverman & Barasch (JCR 2023). |
| D3 | Navigation | Four tabs **Today · Insights · History · You**; Log becomes a "+" opening a sheet; native tabs (Liquid Glass) on iOS with JS tabs kept on web. | Restructures navigation and routes; native tabs are `unstable-` on SDK 55. |
| D4 | Engine additions for honesty visuals | Per-bucket **consistency band** (binomial 50% range at n), **expected count** per bucket for the "Dots" view, optional **bootstrap range** on the score. | New engine outputs (core-domain / Layer 3). The UI must not compute them. |
| D5 | Expo SDK upgrade | Stay on 55 for this design work. When upgrading, go to 57.0.9+ (or 58 for stable NativeTabs). | Cross-cutting; several recommended APIs (stable NativeTabs, `@expo/ui`, variable fonts) only arrive after 55. |
| D6 | Milestone share cards and a "Year in Predictions" grid | Add share cards at Tracker unlock, first non-provisional score, and 50/100 resolutions; later, a Daylio-style one-cell-per-prediction grid. | New share surfaces; scope call. |

---

## 5. Reference apps

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
