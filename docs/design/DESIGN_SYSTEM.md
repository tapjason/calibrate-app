# Calibrate — Design System

**Audience:** anyone (human or agent) changing `app/**` or `src/components/**`.
**Authority:** this file governs *how the app looks, moves and reads*. `CLAUDE.md`
governs *what the product does*; if the two conflict, `CLAUDE.md` wins and this file
gets fixed. Items tagged **Proposed** change product behaviour and need sign-off before
anyone builds them — they are listed with the other open questions in
[`UI_ROADMAP.md`](UI_ROADMAP.md) §2.

**Evidence:** every rule below traces to the sourced research in
[`research/`](research/) (market, libraries, visual-language, done 2026-09-25; patterns,
done 2026-09-28 and behind §2.5 and §7.10–§7.15). The
"before" screens are in [`baseline/`](baseline/) (web-build captures, so fonts and the
tab bar look like a browser's). Contrast ratios below were recomputed 2026-09-26 with
the WCAG 2.x formula.

**Status (2026-10-03):** the tokens are in code at `src/constants/theme.ts` (light
palette live, dark proposed), and `src/constants/theme.test.ts` pins every recorded
contrast pair. Colour is fully migrated: no hex literal is left in `app/` or
`src/components/` outside `BADGE_META` and `cardThemes`, which hold their own palettes
by design. Many font sizes are still raw numbers rather than `type.*`; migrating them
is in scope for the file you touch (rule 0.1). Dynamic Type caps live there too:
`DISPLAY_MAX_SCALE` (1.6×) for the one display number per screen and `CARD_MAX_SCALE`
(1.2×) for share cards, which are fixed-layout images. On web, `roundedFamily` carries a system fallback
list, because Chrome renders a bare `ui-rounded` as serif.

---

## 0. Non-negotiables (read this if nothing else)

1. **No new hex literals in components.** Import from `@/constants/theme`. Migrating an
   existing literal to a token is always in scope for the file you are touching.
2. **One hero per screen.** At most one display-size number, and it is never a
   countdown. Progress-to-unlock is a ring or segmented bar, not a big numeral.
3. **Never present noise as a number.** Provisional scores render as a
   calibrating/progress state, never as a headline figure (`CLAUDE.md` min-N rules).
4. **Yes and No look and feel identical.** Same animation, same haptic, same neutral
   colour. Green means *calibrated*, never *correct*; red never appears for an outcome.
5. **Colour is never the only channel.** Every semantic colour comes with a word, shape
   or position. Categories get icons, not colours.
6. **Indigo is chrome, not data.** Brand indigo marks actions and selection; the chart
   uses only the three calibration hues plus ink.
7. **Text contrast ≥ 4.5:1**, UI/graphic contrast ≥ 3:1, no text under 11 pt, tap
   targets ≥ 44×44 pt.
8. **Every animation respects Reduce Motion**; every haptic has a visual twin.
9. **Liquid Glass on the navigation layer only** — tab bar, toolbar buttons, sheet
   chrome. Never on cards, charts or share cards.
10. **Nothing shareable is paywalled, and no empty Share screen.** The Warmup result is
    the Day-0 card.
11. **Install native packages with `npx expo install`, never `npm i`.** npm `latest`
    of Reanimated, Lottie and Victory no longer supports RN 0.83 (§9).

---

## 1. Principles

| Principle | What it means on screen | Reference |
|---|---|---|
| **Identity leads, the number is the receipt** | "Forecaster" in words first; "score 78" beside it; the curve is the proof. | 16Personalities, Spotify Wrapped 2025 "Clubs" |
| **Restraint, then one pop of colour** | Near-monochrome canvas; colour reserved for the primary action and for meaning (over/under/calibrated). | Co–Star, Wrapped 2025 "selective pops of colour", HIG Color |
| **Honest about uncertainty** | Calibrating states, labelled regions, ranges shown as soft bands, n shown on every dot. Showing ranges barely costs trust (van der Bles 2020). | WHOOP "calibrating", Oura baseline |
| **Reward honesty, not correctness** | Neutral outcome styling; the integrity bonus is a brand chip, not a green "good job". | Product principle (`CLAUDE.md`) |
| **No guilt** | "Guesser" reads as a starting point; misses and broken streaks are never red, never animated. | Gentler Streak (ADA 2024), Finch |
| **Craft in the frequent path, celebration only at milestones** | Log and Resolve get a precise small acknowledgement; only three moments get the full treatment (§6.2). | (Not Boring) Habits (ADA 2022), HIG Motion |
| **Native first** | Real tab bar, sheets, SF Symbols, system haptics. | ADA 2025–2026 winners |

---

## 2. Colour

### 2.1 Brand (indigo — matches the icon and splash)

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `brand50` | `#EEF2FF` | selected chip / integrity chip background | — |
| `brand100` | `#E0E7FF` | pressed tint | — |
| `brand200` | `#C7D2FE` | secondary text on dark cards | 12.1:1 on `inkCard` |
| `brand400` | `#818CF8` | accent on dark surfaces | — |
| **`brand600`** | **`#4F46E5`** | primary CTA fill, selection, links, tab tint | white on it 6.29:1; as text on canvas 5.83:1 |
| `brand700` | `#4338CA` | pressed CTA | white on it 7.90:1 |
| `brand800` | `#3730A3` | text on `brand50` | 8.88:1 |
| `brand900` | `#312E81` | Sharp emblem fill | — |
| `brand950` | `#1E1B4B` | splash dark, Wrapped card | — |
| `inkCard` | `#141233` | free "Midnight" share-card background | — |

One tinted primary action per screen (HIG Color: "refrain from adding colour to the
background of multiple controls").

### 2.2 Neutrals (indigo-tinted; replace Tailwind gray)

| Token | Hex | Contrast | Replaces |
|---|---|---|---|
| `canvas` | `#F6F6FA` | — | `#F2F2F2` (React Navigation's default background), `#f9fafb`, `#f8fafc` |
| `surface` | `#FFFFFF` | — | |
| `surfaceSunken` | `#EFEFF6` | — | `#f3f4f6`, `#f1f5f9` |
| `hairline` | `#E2E2EC` | decorative only | `#e5e7eb`, `#d1d5db` |
| `controlBorder` | `#8A889E` | 3.44:1 on white (UI ≥ 3:1) | |
| `textPrimary` | `#16142E` | 16.6:1 on canvas | `#111827` |
| `textSecondary` | `#4E4C66` | 7.64:1 on canvas | `#6b7280` (4.32:1, fails body), `#374151`, `#4b5563` |
| `textTertiary` | `#6B6982` | 4.91:1 canvas · 4.62:1 sunken | `#9ca3af` (2.54:1, **fails**) |
| `destructive` | `#C4271C` | 5.75:1 on white | `#dc2626`, `#b91c1c` (sign-out, delete only) |

### 2.3 Calibration semantics (Okabe-Ito derived, colour-blind validated)

Cool = underconfident, warm = overconfident, green = on the line.

| Role | Chart mark (≥3:1) | Text on white | Chip text / bg | Dark card text on `inkCard` |
|---|---|---|---|---|
| `over` ("runs hot") | `#D55E00` (3.87) | `#B84E00` (5.09) | `#9A3F00` / `#FFF1E6` (6.15) | `#F28A4B` (7.31); mark `#E06B20` |
| `under` ("runs cool") | `#0084C7` (4.10) | `#006C9E` (5.77) | `#005A85` / `#E6F4FB` (6.68) | `#5CB4EC` (7.90); mark `#2D96D8` |
| `calibrated` ("on the line") | `#009E73` (3.42) | `#00785A` (5.48) | `#00664C` / `#E3F6EF` (6.22) | `#3CC79A` (8.44); mark `#14A87B` |
| `integrity` (35–65%) | `brand600` + `circle.lefthalf.filled` | `brand800` on `brand50` (8.88) | | `#A5B4FC` (9.05) |
| `oracleGold` (emblem hairline only) | `#B7791F` (graphic) | chip `#7A4F0E` / `#FDF6E7` (6.61) | | `#E8B64C` |

Validated with the dataviz palette validator (Machado 2009 CVD simulation): worst
colour-blind ΔE 11.0 (light) and 11.0 (dark), both pass. Brand indigo sits only 3.7 ΔE
from `under` for tritan viewers — the reason for rule 0.6.

### 2.4 Rules

- Outcome (Yes/No) = filled vs hollow **ink** glyph (`checkmark.circle.fill` /
  `xmark.circle`), never green/red.
- The hero score numeral is always `textPrimary`. Colour goes to the *direction* of
  miscalibration (over/under), never to good/bad.
- Categories are identified by SF Symbol + label only (§5).
- The app is pinned to light (`app.json` `userInterfaceStyle: "light"`). The dark
  values above exist for share cards; a future dark mode maps onto them.
- **Build the token file as light/dark pairs from the first commit** (e.g.
  `colors.light` / `colors.dark` behind a `useTheme()` hook), even while only light
  ships. The HIG says people "generally expect all apps … to respect their preference"
  and warns against an in-app appearance toggle; retro-fitting a flat token object means
  touching every file twice. Whether to ship dark is roadmap D7.

### 2.5 Dark neutrals (**Proposed**, D7)

Indigo-tinted, not an inversion. Ratios computed 2026-09-28 (WCAG 2.x).

| Token | Dark hex | on `canvas` | on `surface` |
|---|---|---|---|
| `canvas` | `#0C0B16` | — | — |
| `surface` | `#17162A` | — | — |
| `surfaceSunken` | `#211F36` | — | — |
| `hairline` | `#2E2C47` | decorative | |
| `controlBorder` | `#6E6C88` | 3.87 | 3.51 |
| `textPrimary` | `#F4F3FA` | 17.72 | 16.08 |
| `textSecondary` | `#B9B7CE` | 9.98 | 9.06 |
| `textTertiary` | `#9391AC` | 6.41 | 5.81 |
| link / selection text | `brand400` `#818CF8` | 6.55 | 5.94 |
| `destructive` | `#FF6B5E` | 6.99 | 6.35 |

Calibration marks and text use the "Dark card" column of §2.3 (marks ≥ 4.79:1 even on
dark `surfaceSunken`). The CTA keeps `brand600` + white (6.29:1); its fill is only
2.82:1 against dark `surface`, so CTAs on dark cards rely on the label, never on fill
alone.

---

## 3. Typography

**Decision (default; see `UI_ROADMAP.md` §2 D1):** the **system font** — SF Pro on iOS,
with **SF Rounded (`fontFamily: 'ui-rounded'`) for numerals, badge names and identity
words only**. Zero bytes, native Dynamic Type, and what the HIG and ADA winners use.
Trade-off: the Chromium web build falls back to the host system font and has no
`ui-rounded`, so web screenshots are not a faithful preview of type. If a distinctive
brand face is wanted later, Inter (`@expo-google-fonts/inter`, has `tnum`) is the
runner-up because it renders identically on iOS and web.

| Token | Face | Size/line (pt) | Weight | iOS style | Use |
|---|---|---|---|---|---|
| `display` | Rounded | 64/68 | Bold | custom (cap Dynamic Type at 1.6×) | the one hero number per screen |
| `readout` | Rounded | 48/56 | Bold | custom (cap at 1.6×) | the live number on a control or celebration (confidence readout, milestone card) |
| `titleXL` | Rounded | 34/41 | Bold | Large Title | screen titles, verdict headline |
| `title1` | Pro | 28/34 | Bold | Title 1 | section heroes, Warmup score |
| `title2` | Pro | 22/28 | Bold | Title 2 | quiz prompt, card headlines |
| `title3` | Pro | 20/25 | Semibold | Title 3 | group headers |
| `headline` | Pro | 17/22 | Semibold | Headline | row titles, buttons |
| `body` | Pro | 17/22 | Regular | Body | prediction text, copy |
| `callout` | Pro | 16/21 | Regular | Callout | explanations |
| `subhead` | Pro | 15/20 | Regular | Subhead | metadata |
| `footnote` | Pro | 13/18 | Regular | Footnote | captions, chart labels |
| `caption` | Pro | 12/16 | Medium | Caption 1 | chart ticks (minimum for charts) |
| `eyebrow` | Pro | 13/18, +0.4 tracking | Semibold, sentence case | Footnote | section labels (replaces ALL-CAPS grey) |

- `fontVariant: ['tabular-nums']` on every number that animates (count-ups) or aligns
  in a list/table. It maps to `font-variant-numeric` on web.
- Never Ultralight/Thin/Light. Never below 11 pt. Chart ticks move from 9 px to 12 pt.
- Everything scales with Dynamic Type; keep hierarchy when it does.
- **Share cards are the exception.** `IdentityCard`, `WarmupCard` and `WrappedCard` are
  fixed-layout artifacts exported as images (capped at 1.2×), with sizes tuned to the Post
  and Story shapes; they keep their own literal sizes. Everywhere else uses a token.

---

## 4. Space, radius, elevation

**Spacing (4-pt grid):** `2, 4, 8, 12, 16, 20, 24, 32, 40, 56`. Screen gutter 16 (20 on
Pro Max widths); card padding 16; within a group 8–12; between groups 24; between
sections 32.

**Radius (concentric: inner = outer − padding):**

| Token | pt | Use |
|---|---|---|
| `xs` | 6 | tick chips, tiny tags |
| `sm` | 10 | inputs, small chips |
| `md` | 16 | cards, list groups |
| `lg` | 24 | hero cards, sheet content |
| `xl` | 32 | share-card preview |
| `pill` | 999 | buttons (capsule), segmented controls, category chips |

**Elevation** — iOS is mostly flat; depth comes from glass on the nav layer.

| Level | Spec | Use |
|---|---|---|
| `e0` | no shadow; surface colour + 1 px `hairline` | default |
| `e1` | `shadowColor textPrimary`, opacity 0.06, radius 8, y 2 | cards on canvas |
| `e2` | opacity 0.12, radius 24, y 8 | floating "+", toasts, dragged items |
| glass | native tab bar, toolbar "+", sheet chrome (`GlassView` regular) | never on content |

RN 0.83 (New Architecture) supports `boxShadow` natively — no shadow library.

---

## 5. Icons

- **`expo-symbols` (`SymbolView`)** on iOS, with the current Ionicons as the
  Android/web `fallback`. `expo-symbols` is already in `node_modules` (via
  expo-router) but should be added explicitly with `npx expo install expo-symbols`.
  Moving off `@expo/vector-icons` now also pre-empts its deprecation in SDK 56.
- Filled symbols in the tab bar (HIG).
- Symbol map:

| Meaning | SF Symbol |
|---|---|
| work · health · finance · social · personal | `briefcase.fill` · `heart.fill` · `dollarsign.circle.fill` · `person.2.fill` · `person.fill` |
| integrity bonus / honest uncertainty | `circle.lefthalf.filled` |
| outcome yes / no (neutral ink) | `checkmark.circle.fill` / `xmark.circle` |
| insights tab | `chart.line.uptrend.xyaxis` |
| forecaster motif | `scope` |
| unlock | `lock.open.fill` |

- **No emoji in UI chrome or badges** (they render differently per platform and read
  as toys). Emoji are fine only in the plain-text share (§7.5).

---

## 6. Motion and haptics

Library: **Reanimated 4** (SDK 55 pin 4.2.1) — CSS transitions/animations for
micro-interactions, layout animations for list reveals. Every animation checks
`useReducedMotion()`. Haptics via **`expo-haptics`**, one fixed meaning each (HIG:
"use system-provided patterns according to their documented meanings").

### 6.1 Vocabulary

| Name | Spec | Haptic | Where |
|---|---|---|---|
| `press` | scale 0.97, spring (damping 20, stiffness 320), ~120 ms | none | buttons, tappable cards |
| `detent` | numeral roll 80 ms per 5% step | `selectionAsync` per step | confidence control, pickers |
| `commit` | card slides into list + check draws 250 ms | `impactAsync(Light)` | save prediction |
| `resolve` | same neutral check for Yes **and** No; card collapses 300 ms | `impactAsync(Medium)` for both | Resolve |
| `reveal` | count-up 700 ms ease-out; diagonal draws 400 ms; dots drop 60 ms stagger; regions fade 200 ms | `impactAsync(Rigid)` as the last dot lands | Warmup verdict, weekly Wrapped |
| `unlock` | ring completes 500 ms, morphs into numeral, symbol bounce | `notificationAsync(Success)` | rating / category unlock |
| `tierUp` | emblem flips on Y 600 ms, ring count increments, ≤ 40-particle confetti ≤ 1.2 s | `notificationAsync(Success)` | badge tier-up |
| `reduced` | all of the above → 200 ms cross-fade; no count-up, confetti or flips; haptics still fire | as above | Reduce Motion on |

### 6.2 Celebration budget

Full treatment (animation + success haptic + optional sound) for exactly three
moments: **Warmup verdict**, **score unlock** (overall or category), **badge tier-up**.
Weekly Wrapped gets `reveal` without confetti. Everything else is small and precise.

- `notificationAsync(Success)` is reserved for unlocks and tier-ups. Never for a Yes.
- **Never animate:** demotions, broken streaks, "No" outcomes. A score that slips below
  a threshold keeps its emblem and shows a text "holding" state.
- Sound is off by default (opt-in in Settings) and respects the silent switch.
- Animate the *number* in sync with the celebration (Brilliant's count-up), not just
  confetti.

---

## 7. Patterns

### 7.1 Hero score and provisional state

- **Identity on Home** (roadmap step 28): under the bar, the share card's headline,
  from the same helper: the best category's emblem and "Sharp in health" in `title3`,
  the contrast ("Guesser in finance") in `subhead` beneath. Tapping it opens Share.
  Hidden while every category is a Guesser.
- **Unlocked:** `display` numeral in `textPrimary`; beside/under it the band's identity
  word ("Forecaster"), a one-line verdict from the engine's direction of error ("You run
  a little hot above 70%"), and a thin bullet-graph bar with ticks at 70 / 85 / 90 and a
  marker. A month-over-month delta only when both months are non-provisional. No gauges.
- **Provisional:** never put the countdown in the hero slot (baseline 04/05 do —
  "20" reads as a score of 20). Show a **20-segment ring or bar** (15 per category):
  filled = resolved, hatched = pending "on their way", hollow = to go. Label:
  "Calibrating · 4 on their way · 16 to go". Pending predictions really will count,
  so this endowed progress is honest (Nunes & Drèze 2006: 19% → 34% completion).
  After "N more resolutions and your score unlocks.", the caption gives the wait a
  date (roadmap step 32): "The next one comes due Tue, Oct 6.", or "One is ready to
  resolve now." Nothing when nothing is open.
- **Ghost chart** before unlock: the full frame, diagonal and labelled regions with
  empty bucket slots — never an italic placeholder line.
- **Unlock** = the `unlock` motion (§6.1).
- **Proposed:** a soft "likely 71–78" range on the bar from a bootstrap of the MAE.
  Engine work — the component must receive the range, never compute it.

### 7.2 Calibration chart (`CalibrationChart`)

Keep the hand-rolled `react-native-svg` chart; invest in design, not a library.

1. **Title = takeaway** ("You're overconfident at 80%+"); subtitle in natural
   frequencies ("Of 12 things you called 80–100% likely, 7 happened").
2. **Regions labelled in place:** below the diagonal lightly warm-tinted, labelled
   *Overconfident*; above lightly cool-tinted, *Underconfident*; the diagonal labelled
   *Perfectly calibrated*. Position + tint + text = three channels.
3. **Dots** coloured by side (`over` / `under` / `calibrated`), sized by n, labelled
   with n. Connecting line 1.5 px neutral, or none — five buckets are not a function.
4. **Coverage row** under the chart: five bucket chips with counts, empty ones hatched
   ("You've never logged anything under 40%"). This is the spec's range-coverage caveat
   made visible; it links to the `CoverageNudge`.
5. Ticks "0%…100%" in `caption`, `textTertiary`.
6. Keep `describeCalibrationCurve()` for screen readers and add a "Show as table"
   disclosure.
7. Animate draw-in by animating `strokeDashoffset` on the existing polyline.
8. **Proposed:** a *consistency band* (the binomial 50% range a perfectly calibrated
   forecaster would hit at each bucket's n, drawn as a soft capsule, no end caps) and a
   **"Dots" view** (one icon-array row per bucket: n dots, filled = happened, plus a
   marker at the expected count). Both need per-bucket numbers from the engine/store;
   components must not do the binomial or expected-count math (layer rule).

Error bars with caps are banned — lay readers treat the caps as hard limits.

### 7.3 Confidence input (Log and Warmup)

The product's central input must carry visual weight (baseline 03 shows it as two
small ±5 buttons).

- A large percentage readout (≥ 48 pt, Rounded, tabular) with a natural-frequency
  companion: "70% · about 7 times in 10".
- A slider (`@react-native-community/slider`, `step={5}`, ticks at 20/40/60/80 = the
  bucket edges) with `selectionAsync` on each step. The 35–65 **integrity zone is
  visibly tinted** (`brand50`) and the bonus shows as a `brand` chip with
  `circle.lefthalf.filled` (replaces the failing 2.94:1 green text).
- **Keep** the ±5 buttons (or equivalent `accessibilityActions`) and the existing
  `adjustable` role from `src/components/ui/adjustable.ts` — the slider must not
  regress VoiceOver.
- Warmup range stays 50–100 (spec).

### 7.4 Badges — the "Lens" emblem

One SVG component, `<LensEmblem tier category progress size />`, used at 28 pt (lists),
64 pt (Insights header), 120 pt (tier-up) and 160 px @1080 (share cards). A
continuous-corner square (radius 28% of size) containing the **calibration diagonal**.
Tier is encoded by **fill + ring count + written label**, never colour alone:

| Tier | Emblem | Fill | Rings | Accent |
|---|---|---|---|---|
| Guesser | dashed outline, dotted diagonal | none | 0 | `#8A889E` |
| Tracker | solid outline, solid diagonal | `surfaceSunken` | 1 | `textSecondary` |
| Forecaster | filled | `brand600` | 2 | white diagonal |
| Sharp | filled, deep | `brand900` | 3 + bezel ticks | white diagonal |
| Oracle | gradient `#4F46E5`→`#6D28D9` | — | 4 + bezel | `oracleGold` hairline |

- The category SF Symbol sits small in a corner; the label is always written
  ("Sharp · Health").
- **Provisional / not yet earned:** blueprint rendering (outline, 40% opacity) with a
  progress arc and "9/15 to unlock". Implemented as `LensEmblem`'s `progress` prop: the
  outline goes dashed and faint, and a solid stroke traces it as far as the user has
  come (`src/components/ui/LensEmblem.tsx`).
- Each tier shows its receipt in one line: "Sharp: 52 resolved, score 87". Badge
  criteria stay in the engine (`evaluateBadge`); `src/constants/badges.ts` holds
  presentation only and loses its `emoji` field.
- Why not one hue per tier (16Personalities-style)? Five extra hues would collide with
  the over/under/calibrated semantics. The indigo ramp + gold gives each tier a distinct
  look without that cost.

### 7.5 Share cards

- **Hierarchy (at 1080 px wide):** identity line 88–96 px Rounded Bold ("Sharp in
  health", top category only) → contrast line 56 px ("Guesser in money") → one receipt
  36–40 px in natural frequencies ("Right 84% of the time I said 80%") → a mini visual
  with no axes (5-bucket dot strip), legible at thumbnail size → footer hook **≥ 32 px
  at ≥ 4.5:1**, phrased as a question: "What are you sharp at? · calibrate.app". (The
  current footer, `#64748b` on `#0f172a`, is 3.75:1 — the growth hook is the faintest
  text on the card.)
- **Formats:** Story 1080×1920 (keep content inside y ≈ 250–1580); Post 1080×1440 (3:4,
  the tallest ratio X and iMessage show uncropped); plus a **plain-text share**
  (Wordle-style, spoiler-free, never includes prediction titles):
  ```
  Calibrate · Week 38
  Sharp in health · Guesser in money
  ⬜🟩🟩🟧🟧  score 81
  calibrate.app
  ```
- **Day-0 card:** the Warmup verdict ("I run hot: 77% sure, 50% right") so Share is
  never empty.
- Gradients in cards are **SVG gradients** (they rasterise with `react-native-view-shot`);
  no Skia, blur or glass inside a card.
- Free theme "Midnight" on `inkCard`; Plus themes are cosmetic only.
- Offer per-category show/hide before sharing (Any Distance's eye toggles).

### 7.6 Paywall

Structure beats polish (design-only paywall tests win least often). Order: value header
→ 3 benefit rows (symbol + one line) → plan selector (radio cards, **Annual first and
preselected**, "$2.50/mo, billed yearly" equivalent, "1 month free" badge; Monthly with
no trial; Lifetime as a smaller third row) → **honest timeline** → **one** CTA.

- Timeline, in the store's own units: *Today* — full Plus access · *In 1 month* — your
  year starts; cancel at least 24 hours before. (A "we remind you" step belongs here
  only once the app actually schedules that reminder; it doesn't yet.)
- The CTA label follows the selected plan ("Start free month" / "Subscribe for
  $4.99/mo").
- **No trial toggle** — Apple rejects them under 3.1.2 since January 2026.
- Prices and trial length are **always what the store reports**; never hard-code them.
- Keep: "Restore purchases" as a text button, the "stay free forever" reassurance,
  trial-terms line, Terms/Privacy links.
- **Close** (roadmap step 30): a 44pt "×" on `surfaceSunken` at the top right,
  labelled "Close", as well as "Not now" at the bottom, which is below the fold on a
  phone. The screen insets its own top edge (a full-screen modal has no header).

### 7.7 Navigation and sheets

- Tab labels are single words with filled symbols. Never disable or hide a tab; explain
  empty sections in place.
- Sheets for scoped tasks, with a grabber: **Resolve** at the medium detent, **Share**
  large, **Paywall** full-screen modal with Close top-leading. Use expo-router
  `presentation: 'formSheet'` with fixed detents (`fitToContents` has open sizing bugs).
  Swipe-to-dismiss with unsaved text asks for confirmation.
- **Proposed** (roadmap D3): four tabs *Today · Insights · History · You*; "Log" stops
  being a tab (HIG: tabs navigate, they don't perform actions) and becomes a tinted "+"
  that opens a large-detent sheet; native tabs with Liquid Glass on iOS.

### 7.8 Empty states

Every empty state has an SF Symbol, one sentence in `textSecondary`, and a way forward
(button). No italic grey text. "Nothing to share yet" is never shown — see §7.5.

### 7.9 Copy and tone

- Blunt and human, like the existing verdict copy ("You run overconfident"). Lead with
  the sentence; the chart comes second.
- Numbers primary, words secondary — probability words mean different things to
  different people. Pair percentages with natural frequencies ("7 in 10").
- "Guesser" is a starting point, not a grade. Streak breaks read "New week, new calls."
- Sentence case everywhere; no ALL-CAPS labels.
- Badge gating is a trust feature — say it: "Badges need receipts."

### 7.10 Resolve

The most frequent meaningful moment in the app. Fast, neutral, honest, in that order.

- **Confidence first.** Headline: "On 3 Sep you said **70%**" (the percentage in
  `title1` Rounded), then the prediction text in `title2`, then the question "Did it
  happen?". People misremember their prior confidence once they know the outcome
  (Fischhoff 1975), so the stated number is read before the answer, never as small
  metadata.
- **Yes and No:** two equal capsules in the same neutral style (`surface` fill,
  `controlBorder` outline, `textPrimary` label, `checkmark.circle.fill` /
  `xmark.circle`). Neither is `brand600` and neither is red: rule 0.4, and HIG Buttons
  reserves red for destructive actions.
- **Skip is not a peer.** A text button below: "Can't tell / doesn't apply", with the
  line "It won't count toward your score." Equal weight would make skipping a miss as
  cheap as recording it. (Built 2026-10-04, roadmap D10.)
- **After the tap:** the `resolve` motion (§6.1), then one factual line about the bucket
  it landed in: "That's 6 of 9 in your 60–80% range." Counts, not a verdict, so safe
  below min-N. The count comes from the store; the component doesn't compute buckets.
  Then the optional one-line reflection ("What surprised you?"), never before the
  answer.
- Presented as a medium-detent sheet (§7.7). "Already resolved" and "not found" states
  follow §7.8.
- **Log it again** (roadmap step 22): after an answer, a secondary capsule under
  Done. It saves any reflection, closes the sheet and opens Log with the title,
  category and lead time carried over, and the confidence back at 50%: a fresh call,
  never the old number. Not offered inside a run.
- **A run** (three or more ready; roadmap step 18): Home's primary **Resolve all N**
  opens the same sheet with "2 of 5" and a thin brand progress bar above one prompt
  at a time. After an answer the finishing button reads **Next** (**Finish** on the
  last) and the reflection waits behind "Add a reflection"; Skip moves on at once.
  Advancing is always a tap, never a timer (WCAG 2.2.1), and a milestone shows on
  the card that earned it. Ends on "All caught up".

### 7.11 Prediction card and the Today list

- Layout: category symbol + word, then title (`body`, up to 3 lines), then one metadata
  line (`subhead`, `textSecondary`): "70% · due Fri 3 Oct". No ALL-CAPS, no brand
  colour on the confidence.
- **Due and past-due are neutral.** A prediction coming due is not a lapse. Group the
  Today list by date ("Ready to resolve", "This week", "Later") and let the group
  header carry the state. No amber, no "Overdue" label, no warning colour.
- Resolved (History): outcome as neutral ink glyph + word ("Happened" / "Didn't"), never
  ✓/✗ characters or green/red. Skipped reads "Not scored".
- Tapping a ready card opens Resolve (§7.10). Keep the single-sentence
  `accessibilityLabel`.
- **Reflection** (roadmap step 31): on a resolved card, a saved reflection shows under
  the title, quoted, in `footnote` italic `textSecondary`, at most four lines, and
  joins the card's accessible sentence ("Your note: …").

### 7.12 Log form

Completable in under 15 s (`CLAUDE.md`). Order: title → category → confidence (§7.3) →
due date → Save. (Category comes before confidence, as built: the track record under
the control reads the chosen category.)

- **Category:** chips with SF Symbol + word; selected = `brand50` fill, `brand800`
  text, plus a check symbol (not colour alone).
- **Due date:** chips "Tomorrow", "In a week", "In a month" and **"Pick a date"**,
  which opens the native picker (`@react-native-community/datetimepicker`, §9). Under
  the chips, the resolved date as a sentence: "Due Friday, 3 Oct."
- **Track record** (roadmap step 19): one `footnote` line in `textSecondary` under
  the confidence control, "Your 60–80% calls in finance: 7 of 12 happened." The
  category's band first, then all categories, and nothing below 10 resolved (the
  chart title's threshold). Counts, never advice: it must not say what to pick.
  Free, because this is the core loop.
- **Coverage nudge:** a quiet inline card on `surfaceSunken` above the title field. Its
  accept button is secondary; Save is the only primary action on the screen. Keep the
  current copy and the "Not now" cooldown.
- **Save:** one primary capsule, disabled until the title is non-empty, `commit` motion.

### 7.13 Coach cards and the support surface

Sources: HIG Generative AI (updated 2026-06), Google PAIR Explainability + Trust.
Behaviour is governed by `COACH_AGENT.md`; this section is only its look.

- **Lead with the receipt.** Each card: the `evidence` number in `title2` Rounded, what
  it counts in `footnote` ("in your 80–100% range · 12 resolved"), then the message
  (`body`), then the suggestion (`callout`, `textSecondary`). The number is already
  validated against the input; showing it lets the user check the Coach against the
  chart above it, which is the calibrated trust PAIR asks for.
- "AI" chip on the panel header (COACH_AGENT.md §5.6), plus once, under the first card:
  "Coach reads your numbers, not your predictions. It can be wrong."
- Loading copy says what's happening ("Reading your 5 categories…"), not "Loading".
- Each card has dismiss (×). Add 👍/👎 only once there's an analytics event to receive
  it; feedback is always voluntary, with no follow-up prompt.
- No celebration motion, no `oracleGold`; calibration hues only for the direction the
  card describes.
- **Support surface:** stays plain and visually unlike an insight: no AI chip, no
  evidence number, no feedback buttons, no card chrome shared with Coach.

### 7.14 Wrapped

- **Weekly** is built from what is true at small n, because a week almost never reaches
  20 resolutions and the verdict stays gated: (1) counts: "4 resolved · 3 logged · 1
  honest coin-flip"; (2) one factual receipt in natural frequencies: "You said 90%
  three times. All three happened."; (3) progress: the unlock ring or the next badge
  ("Tracker in health: 3 to go"); (4) the verdict only when the window earns it.
  Never a card whose main message is "not enough data".
- **Yearly** follows §7.5 and the Spotify structure: archetype line, one receipt,
  selective colour.
- **Verdict** (when the window clears min-N) follows the chart title's rule
  (§7.2, `chartTakeaway`): the worst bucket with ≥ 10 resolved names direction and
  range ("You ran overconfident at 80–100%."). Averages only speak when every such
  bucket is calibrated, because over- and underconfidence in different ranges
  cancel in the mean, and the card must never contradict Stats.
- Motion: `reveal` without confetti (§6.2), on the panel around the weekly card
  (never inside the card, which is captured to PNG), once a day per session, and
  only when the week has resolutions. The share button is disabled only when
  nothing resolved in the window, and then the card says what *will* be there.

### 7.15 Notifications

HIG Notifications: no sensitive content, a hidden-preview placeholder, no repeats for
the same thing, no instructions, title-style titles without ending punctuation.

| Notification | Title | Body | `previewPlaceholder` | `interruptionLevel` |
|---|---|---|---|---|
| Resolution reminder | Did it happen | `{title}` · You said 70% | A prediction is ready to resolve | `active` |
| Digest, open > 0 | Your week ahead | 3 predictions are coming due. | Weekly check-in | `passive` |
| Digest, open = 0 | Your week ahead | Nothing open. What do you think will happen this week? | Weekly check-in | `passive` |

- The confidence goes in the reminder so that resolving from the notification still
  puts the stated number first (§7.10).
- **Never mention the streak** in a notification.
- One reminder per prediction; no follow-ups.
- **Proposed** (roadmap D8): *Happened* / *Didn't* actions on the reminder via
  `setNotificationCategoryAsync`, as foreground actions that open straight into the
  resolved state. Background (no-open) action handling is only documented to reach JS on
  Android; verify on an iOS device before relying on it.
- **Proposed** (roadmap D9): fire the reminder in the evening of the due day, not at
  noon.

### 7.16 Trends (Plus)

The long view, in plain rows: label left in `textPrimary`, value right in
`textSecondary`, section titles as `eyebrow` in sentence case. Every row carries its
own n, and a row below its threshold shows counts, never a score.

- **What your confidence means** (roadmap step 20): the personal correction table.
  One row per category and band with ≥ 10 resolved (`MIN_N_BAND`), worst first, at
  most five: "Finance at 80–100% · 47% · 8 of 17". When the worst band is off, it
  leads as a sentence ("In finance, your 80–100% has come true 47% of the time.").
  With no qualifying band, one line names the closest one and its count instead.
- **By how far ahead** (roadmap step 21): rows for *Next day or sooner* (0–1 local
  days from logging to due), *Within a week* (2–7), *Within a month* (8–31) and
  *Further out*; empty horizons are left out. Score and direction from 15 resolved
  (`MIN_N_CATEGORY`), "N resolved · too few to score" below it, like a category.
- Labels that contain numbers or small words don't use `textTransform:
  'capitalize'` (it produced "Range You Use"); capitalise the string instead.

### 7.17 How scoring works

A full-height reading sheet (roadmap step 29), opened by "How is this scored?" under
the Stats rating and by a Settings row; never shown unasked, since the pitch is
identity, not statistics. Sections in `headline` with `body` text in
`textSecondary`: what the score measures, how it's worked out (the five bands and
their edges, one worked example from `CLAUDE.md`), why it waits, badges (a legend of
the five emblems with their criteria), honest uncertainty, what doesn't count.
Every number in the copy comes from the shared constants or `BADGE_META`, and a test
holds it to the engine.

---

## 8. Accessibility checklist (per change)

- [ ] Contrast: text ≥ 4.5:1, graphics/controls ≥ 3:1 (use the token table; don't
      eyeball new pairs).
- [ ] Nothing distinguished by colour alone (Differentiate Without Color).
- [ ] Dynamic Type: layout survives the largest size; `display` capped at 1.6×.
- [ ] VoiceOver: roles, labels, `adjustable` controls, chart description / table.
- [ ] Reduce Motion: `reduced` variant renders; haptics still fire.
- [ ] Reduce Transparency and both ends of the iOS 27 glass slider (ultraclear ↔
      tinted): anything floating on glass stays legible.
- [ ] Tap targets ≥ 44×44 pt.

---

## 9. Libraries

Pinned for **Expo SDK 55 / RN 0.83.6** (verified in
`node_modules/expo/bundledNativeModules.json`). Always `npx expo install <pkg>`.

| Need | Use | SDK 55 pin | Notes |
|---|---|---|---|
| Styling | `StyleSheet` + `src/constants/theme.ts` | — | Zero deps; migrate file by file. |
| Motion | `react-native-reanimated` + `react-native-worklets` | 4.2.1 / 0.7.4 | Jest: `setupFilesAfterEnv` with `require('react-native-reanimated').setUpTests()` and `jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))`. |
| Hero moments (optional) | `lottie-react-native` | 7.3.x | 7.4+ needs RN ≥ 0.84. Needs designer JSON. |
| Charts | existing `react-native-svg` | 15.15.3 | Animate via Reanimated. |
| Share export | existing `react-native-view-shot` | 4.0.3 | Stay pinned until the SDK moves. |
| Icons | `expo-symbols` | ~55.0.9 | Ionicons as fallback. |
| Haptics | `expo-haptics` | ~55.0.14 | Web: no-op, harmless. |
| Slider | `@react-native-community/slider` | 5.1.2 | Works on web. |
| Date picker | `@react-native-community/datetimepicker` | 8.6.0 | "Pick a date" on Log (§7.12). Check its web behaviour before relying on it in screenshots. |
| Glass accents | `expo-glass-effect` | 55.0.11 | iOS 26+; check `isLiquidGlassAvailable()`. `opacity: 0` breaks it. |
| Native tabs | `expo-router/unstable-native-tabs` | in expo-router 55 | Unstable until SDK 58. Keep JS `Tabs` in `_layout.web.tsx` (web renders a text-only top pill). |
| Sheets | expo-router `formSheet` | built in | Adopts Liquid Glass on iOS 26+. |

**Avoid:** NativeWind (v4 = full rewrite; v5 = RC "not for production"), Tamagui,
Gluestack, react-native-reusables, HeroUI Native (no web), React Native Paper
(Material idiom), Moti (unmaintained, Reanimated 4 breakage), Victory Native XL (no web;
v42 needs Skia ≥ 2.6), Skia inside share cards (view-shot can't capture GL), Rive,
react-native-ease, expo-mesh-gradient (no web), `@gorhom/bottom-sheet` (formSheet is
native), `@expo/ui` SwiftUI on SDK 55 (beta, no web).

**SDK upgrade note:** if/when the app moves past SDK 55, go straight to **57.0.9+**
(Hermes V1 + worklets memory regression in 56 and early 57). SDK 56 breaks
`@react-navigation/*` imports (codemod exists). SDK 58 stabilises NativeTabs.

---

## 10. The web build

The web export is used for automated screenshots and verification, so every screen and
share card must **render** on web. It is not a faithful preview of iOS: SF Symbols fall
back to Ionicons/Material, `ui-rounded` falls back, there is no glass or haptics, and
share-card *export* is native-only. Judge type and materials on a device or simulator.
