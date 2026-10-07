# Calibrate — Design System

**Audience:** anyone (human or agent) changing `app/**` or `src/components/**`.
**Authority:** this file governs *how the app looks, moves and reads*. `CLAUDE.md`
governs *what the product does*; if the two conflict, `CLAUDE.md` wins and this file
gets fixed. Items tagged **Proposed** change product behaviour and need sign-off before
anyone builds them — they are listed with the other open questions in
[`UI_ROADMAP.md`](UI_ROADMAP.md) §2.

**Evidence:** every rule below traces to the sourced research in
[`research/`](research/) (market, libraries, visual-language, done 2026-09-25; patterns,
done 2026-09-28 and behind §2.5 and §7.10–§7.15; confidence, done 2026-10-05 and
behind §7.3, §7.14 and §7.18; elements, done 2026-10-06 from 18 apps rated 4.7+ and
8,057 of their reviews, behind §7.20 and §7.21; retention, done 2026-10-07, behind
the rest days in §7.9 and §7.22's daily practice and reminder). The
"before" screens are in [`baseline/`](baseline/) (web-build captures, so fonts and the
tab bar look like a browser's). Contrast ratios below were recomputed 2026-09-26 with
the WCAG 2.x formula.

**Status (2026-10-07):** the tokens are in code at `src/constants/theme.ts` (light
and dark both live, following the phone; Inter as the face), and `src/constants/theme.test.ts` pins every recorded
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
| **Easy before minimal** | Every control carries a word and stays visible; no gesture-only action; a familiar platform pattern beats a clever one. "Easy to use" is the praise in 204 of 4,899 five-star reviews; the most pared-down app in the set draws the most "unintuitive" ones. | `research/elements-2026-10.md` §1, NN/g icon usability |
| **Don't move the furniture after launch** | Structural changes (navigation, type, dark mode) land before the first public release. After it, a changed UI is the most punished thing in reviews. | `research/elements-2026-10.md` §1.3, Chen et al. 2021 ("comparative" reviews 90% 1–2★) |

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

### 2.5 Dark neutrals (D7: decided and built 2026-10-07, following the system setting)

Indigo-tinted, not an inversion. Ratios computed 2026-09-28 (WCAG 2.x). How it works:
each token in `colors` resolves where it's drawn (DynamicColorIOS on iOS, a CSS custom
property on web), so styles made once at load still switch; `themed()` does the same
for a colour outside the palette (the badge chips). Share cards never use `colors`:
an exported PNG keeps its own palette whatever the phone's appearance (`LensEmblem`
takes `palettes.light` there).

Rules dark mode taught (2026-10-07):
- **Every text style sets a colour token.** Unset, RN draws black, invisible on the
  dark canvas.
- **Brand text uses `brandText` on canvas or surface, `brand800` on `brand50`.**
  `brand600` and `brand700` are fills: as text on dark `brand50` they fall to 2:1.
- **White stays white:** switch thumbs and text on a brand fill use `onBrand`, never
  `surface`, which turns dark.

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

**Decision (roadmap D1, decided and built 2026-10-07): Inter everywhere**, numerals
included (`FONT_FAMILY`). One face on iOS and web, so web screenshots are a faithful
preview of type, with more brand character than the system font. Five weights ship,
400 · 500 · 600 · 700 · 800, the only ones used (a test holds the tokens to them).
iOS embeds them at build time (the expo-font plugin in `app.json`) under the family
"Inter", so `fontFamily` plus `fontWeight` picks the face; web registers the same files
under the same family (`src/constants/fonts.web.ts`) with a system fallback stack.
Header titles, tab labels, share cards and the chart's SVG labels use it too. It was
the system font (SF Pro, SF Rounded for numerals) until then.

- **Inter's `tnum` widens punctuation too**: use `tabularNums` only on numbers that
  animate or align in a column, never on a phrase ("15-day streak" read "15 - day").
- Inter runs wider than SF: check text in fixed-width spots at 320pt (the coverage
  cells' range labels sit at the 11pt floor for this reason).

| Token | Face | Size/line (pt) | Weight | iOS style | Use |
|---|---|---|---|---|---|
| `display` | Inter | 64/68 | Bold | custom (cap Dynamic Type at 1.6×) | the one hero number per screen |
| `readout` | Inter | 48/56 | Bold | custom (cap at 1.6×) | the live number on a control or celebration (confidence readout, milestone card) |
| `titleXL` | Inter | 34/41 | Bold | Large Title | screen titles, verdict headline |
| `title1` | Inter | 28/34 | Bold | Title 1 | section heroes, Warmup score |
| `title2` | Inter | 22/28 | Bold | Title 2 | quiz prompt, card headlines |
| `title3` | Inter | 20/25 | Semibold | Title 3 | group headers |
| `headline` | Inter | 17/22 | Semibold | Headline | row titles, buttons |
| `body` | Inter | 17/22 | Regular | Body | prediction text, copy |
| `callout` | Inter | 16/21 | Regular | Callout | explanations |
| `subhead` | Inter | 15/20 | Regular | Subhead | metadata |
| `footnote` | Inter | 13/18 | Regular | Footnote | captions, chart labels |
| `caption` | Inter | 12/16 | Medium | Caption 1 | chart ticks (minimum for charts) |
| `eyebrow` | Inter | 13/18, +0.4 tracking | Semibold, sentence case | Footnote | section labels (replaces ALL-CAPS grey) |

- `fontVariant: ['tabular-nums']` on every number that animates (count-ups) or aligns
  in a list/table. It maps to `font-variant-numeric` on web.
- Never Ultralight/Thin/Light. Never below 11 pt. Chart ticks move from 9 px to 12 pt.
- Everything scales with Dynamic Type; keep hierarchy when it does.
- **Share cards are the exception.** `IdentityCard`, `WarmupCard` and `WrappedCard` are
  fixed-layout artifacts exported as images (capped at 1.2×), with sizes tuned to the Post
  and Story shapes; they keep their own literal sizes. Everywhere else uses a token.
  The identity card lays out on one fixed canvas, 360 × 480 (Post) or 360 × 640
  (Story), on every phone; the preview scales the canvas to the screen, and content
  taller than the canvas (larger text, a long identity line) shrinks as one piece to
  fit (roadmap step 53, §7.5).

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

**Streak checkpoints** (7, 30, 100 and 365 days, then each further year; decided
2026-10-06) are the only streak days that get marked, and they're the planned fourth
moment. For now the acknowledgement is **static**: the milestone tint on Home's streak
row for the rest of that day, and `StreakCheckpointCard` on the answer that earned it.
No motion, and no Success haptic, which stays reserved below. Their celebration is
specced but not built (FUTURE_UI §B). A streak day that isn't a checkpoint never gets
one.

- `notificationAsync(Success)` is reserved for unlocks and tier-ups. Never for a Yes.
- **Never animate:** demotions, broken streaks, "No" outcomes. A score that slips below
  a threshold keeps its emblem and shows a text "holding" state.
- Sound is off by default (opt-in in Settings) and respects the silent switch.
- Animate the *number* in sync with the celebration (Brilliant's count-up), not just
  confetti.

---

## 7. Patterns

**Names (since D3, 2026-10-07):** Home is now *Today*, Stats is *Insights*, Settings is
*You*, and Log is a sheet. Sections written before then use the old names; read them
as the new ones.

### 7.1 Hero score and provisional state

- **Identity on Home** (roadmap step 28): under the bar, the share card's headline,
  from the same helper: the best category's emblem and "Sharp in health" in `title3`,
  the contrast ("Guesser in finance") in `subhead` beneath. Tapping it opens Share.
  Hidden while every category is a Guesser.
- **Unlocked:** `display` numeral in `textPrimary`; beside/under it the band's identity
  word ("Forecaster"), a one-line verdict from the engine's direction of error ("You run
  a little hot above 70%"), and a thin bullet-graph bar with ticks at 70 / 85 / 90 and a
  marker. A month-over-month delta only when both months are non-provisional. No gauges.
  The 70 label is centred on its tick; 85 sits left of its tick and 90 right of its own,
  because centred they ran together as "8590" at 320pt (roadmap step 52).
- **Provisional:** never put the countdown in the hero slot (baseline 04/05 do —
  "20" reads as a score of 20). Show a **20-segment ring or bar** (15 per category):
  filled = resolved, hatched = pending "on their way", hollow = to go. Label:
  "Calibrating · 4 on their way · 16 to go". Pending predictions really will count,
  so this endowed progress is honest (Nunes & Drèze 2006: 19% → 34% completion).
  After "N more resolutions and your score unlocks.", the caption gives the wait a
  date (roadmap step 32): "The next one comes due Tue, Oct 6." ("The first one" before
  any has resolved; the date never splits across lines), or "One is ready to resolve
  now." Nothing when nothing is open.
- **Ghost chart** before unlock: the full frame, diagonal and labelled regions with
  empty bucket slots — never an italic placeholder line. Its key names only what's
  drawn, so the grey-bars sentence waits for the first dot (roadmap step 68).
- **Unlock** = the `unlock` motion (§6.1).
- **Give or take** (roadmap D4, step 62): on Stats, a soft band on the bar and the line
  "Give or take 5 points with this many predictions." The engine bootstraps the
  rating and sets half the spread of the middle 80% either side of it
  (`statsStore.ratingRange`); centred on the rating because resampling only adds
  error, so percentiles would sit below a calibrated user's own score.
- **Streak** (roadmap D2, step 61): a row on Home under the rating: a flame, "12-day
  streak", what today adds ("1 more today makes it 13", or "Today counts") and three
  pips for today. A day counts with 3 predictions logged or answered. Gain framing
  only; an ended streak simply isn't shown until the next one starts.
- **Streak checkpoints** (step 64; 7, 30, 100, 365, then yearly): once today counts,
  the row names the next one ("Today counts. Next milestone: 30 days"). The day before
  one says so as a gain ("1 more today makes it 7: a full week"; "Today counts.
  Tomorrow can make it 7: a full week"). On the day itself the row takes the milestone
  tint (`brand50` fill, `brand200` hairline) and reads "7-day streak · A full week.
  Next milestone: 30 days" until midnight. Names: A full week, A full month, Triple
  digits, A full year, Two full years… Static until the celebration is built (§6.2).

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
   made visible; it links to the `CoverageNudge`. On Stats each filled chip is a
   button with the control outline ("80–100%: 57 resolved. Show them.") that opens
   History filtered to that range, under the line "Tap a range to see the predictions
   behind it." (roadmap step 51). Empty chips stay inert, and so does the Warmup's.
5. Ticks "0%…100%" in `caption`, `textTertiary`.
6. Keep `describeCalibrationCurve()` for screen readers and add a "Show as table"
   disclosure.
7. Animate draw-in by animating `strokeDashoffset` on the existing polyline.
8. **Chance bars and dots** (roadmap D4, built as step 62): behind each dot a grey
   capsule (`textSecondary` at 16%, 10pt wide, no end caps) spans the binomial 50%
   range a perfectly calibrated forecaster would hit at that bucket's n
   (`BucketStat.chance_low/high`). The caption and spoken description say what it
   is. "Show the counts" opens each range's said / happened / chance numbers and an
   icon array: a dot per prediction (ink when it happened, hollow when not), an
   upright `textSecondary` bar at the expected count (`expected_yes`), and "40 of 52
   happened; your numbers expected about 36." Above 60 predictions each dot stands
   for several. The engine does the binomial and expected-count math; components
   only draw it.

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
- **Starts empty** (roadmap D13, built as step 54): the readout shows "—%" in
  `textTertiary` at full size (so setting a number doesn't shift the layout) with "not
  set yet" beside it, the slider's thumb rests mid-range in `controlBorder` grey with
  no fill, and the first drag, tap on the track (`tapToSeek`), touch of the thumb or
  ±5 sets a real number; ±5 steps from the middle of the range. VoiceOver hears "not
  set", and the first swipe steps from the middle too. Next (Warmup) and Save (Log)
  wait for a number, and the integrity chip appears only once one is set. It used to
  start at 75% (Warmup) and 50% (Log, inside the integrity band), and "didn't touch
  it" couldn't be told from "chose it" (research: `confidence-2026-10.md` §2).

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
- The progress hint names every requirement still unmet: "3 more resolved →
  Tracker", "Score above 70 → Forecaster", or both, "20 more resolved and a score
  above 85 → Sharp" (roadmap step 47). Naming only the count promised a badge that
  resolving alone couldn't earn. Only the threshold is printed, never a provisional
  score.
- Each tier shows its receipt in one line: "Sharp: 52 resolved, score 87". Badge
  criteria stay in the engine (`evaluateBadge`); `src/constants/badges.ts` holds
  presentation only and loses its `emoji` field.
- Stats lists the badge rows in the app's one category order (`CATEGORIES` in
  `src/types`: work, health, finance, social, personal), as Log's chips and History's
  filters do (roadmap step 73). A launch used to read them alphabetically, so the rows
  changed places after the session's first log.
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
  the tallest ratio X and iMessage show uncropped). The identity card's canvas is
  360 pt wide on every phone and is captured at 3×, which is exactly these sizes
  (roadmap step 53); it used to take the screen's width, and on a 375pt phone its
  content overflowed the 3:4 box in the preview and the PNG alike. The Warmup and
  Wrapped cards use the same 360pt canvas with their own height (step 57), so every
  export is 1080px wide with the same line breaks on every phone. `ScaledCanvas`
  shows each one scaled to the screen; the scale sits on its wrapper, never on the
  captured card. Plus a **plain-text share**
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
preselected**, "1 month free" badge; Monthly with no trial; Lifetime as a smaller
third row) → **honest timeline** → **one** CTA.

- **Every recurring price names its period** ("1 month free, then $29.99 a year",
  "$4.99 a month"), in the plan row and the timeline. Lifetime stays the bare price
  under "Pay once, keep it". (Roadmap step 50.)
- **Annual's monthly figure** sits under its price in `footnote` `textSecondary`:
  "Works out to $2.50 a month." It is RevenueCat's `pricePerMonthString`, never our
  division, and absent when the store gives none. App Review 3.1.2: the billed
  amount stays the most prominent price.

- Timeline, in the store's own units: *Today* — full Plus access · *Two days before* — a
  notification with the date it renews and the price · *In 1 month* — your year
  starts; cancel at least 24 hours before. The middle step shows only while
  notifications are on, since only then does the app send it (roadmap D16, built
  2026-10-07; §7.15).
- The CTA label follows the selected plan ("Start free month" / "Subscribe for
  $4.99/mo").
- **No trial toggle** — Apple rejects them under 3.1.2 since January 2026.
- **Plus never interrupts.** No pop-up, nothing on launch or mid-task, at most one
  teaser per screen, and the × is always visible. Interrupting upsells, and an ×
  hidden in a corner, are what fill a 4.76-rated app's low reviews
  (`research/elements-2026-10.md` §1.4). Billing is the largest single complaint in
  the sample; a reminder before the trial converts is decision **D16**.
- Prices and trial length are **always what the store reports**; never hard-code them.
- Keep: "Restore purchases" as a text button (built as step 78; it was an outlined
  capsule that read as a second CTA), the "stay free forever" reassurance,
  trial-terms line, Terms/Privacy links.
- **Close** (roadmap step 30): a 44pt "×" on `surfaceSunken` at the top right,
  labelled "Close", as well as "Not now" at the bottom, which is below the fold on a
  phone. The screen insets its own top edge (a full-screen modal has no header).
  It's `CloseButton`, shared with Account (roadmap step 66), which had a bare "Close"
  text link on a white page; both Account screens now sit on `canvas` like the rest.

### 7.7 Navigation and sheets

- Tab labels are single words with filled symbols. Never disable or hide a tab; explain
  empty sections in place.
- Sheets for scoped tasks, with a grabber: **Resolve** at the medium detent, **Share**
  large, **Paywall** full-screen modal with the × at the top trailing edge
  (`CloseButton`, as built in step 30). Use expo-router
  `presentation: 'formSheet'` with fixed detents (`fitToContents` has open sizing bugs).
  Swipe-to-dismiss with unsaved text asks for confirmation.
- **Every sheet shows a way out before anything is done in it** (roadmap step 79, built
  2026-10-07): the
  round × (`CloseButton`) at the top, as well as the grabber and the swipe. HIG wants
  the standard Close symbol, not the word; NN/g advises a visible close rather than
  the grab handle alone; every sheet in the 4.7+ set has one. A sheet's one finishing action (Done,
  Next) stays the single filled capsule; a sheet that only reads (How scoring works)
  or only shares (Share) closes from the × and loses its bottom Done.
- **Four tabs** (roadmap D3, decided and built 2026-10-07): *Today · Insights · History
  · You*. Log stopped being a tab (HIG: tabs navigate, they don't perform actions): a
  56pt tinted "+" (`LogButton`, `brand600`, `e2`) floats above the tab bar's trailing
  end on every tab but You, and opens Log as a full-height sheet with its title ("New
  prediction") and the round ×. A typed, unsaved prediction asks before a swipe or the
  × discards it (Discard prediction / Keep editing). Lists end with room for the "+".
  You holds what Settings did, with "Your card" one row from the top. JS tabs for now;
  native tabs with Liquid Glass follow the SDK 58 upgrade with the same layout.

### 7.8 Empty states

Every empty state has an SF Symbol, one sentence in `textSecondary`, and a way forward
(button). No italic grey text. "Nothing to share yet" is never shown — see §7.5.
Built as step 56: `EmptyState` takes a `symbol` (36pt, `textSecondary`, hidden from
screen readers): `calendar.badge.plus` on Home, `clock.arrow.circlepath` on History,
`square.and.arrow.up` on Share. Its button is the primary capsule, since where an empty
state shows it is the screen's only action. History had none until step 69: before
anything resolves it says when the first answer comes ("The first one comes due Tue,
Oct 13.") and offers **Resolve it now** (one ready), **Resolve the first one** (two),
**Resolve all N** (three or more, Home's run threshold), or **Log a prediction**. A list emptied by its filters keeps just the sentence; the
filters are its way forward.

### 7.9 Copy and tone

- Blunt and human, like the existing verdict copy ("You run overconfident"). Lead with
  the sentence; the chart comes second.
- Numbers primary, words secondary — probability words mean different things to
  different people. Pair percentages with natural frequencies ("7 in 10").
- "Guesser" is a starting point, not a grade. The streak says what today adds, never
  what it would cost; when it ends it disappears quietly until the next one starts.
- **One a day keeps it, three is the goal** (D17, step 90): the streak row says what
  one prediction adds ("One prediction today makes it 16"), then the goal's progress
  ("Today counts. Goal: 1 of 3") with the pips, then "Today's goal met". The goal is
  never a condition: no line suggests the streak needs three.
- **Rest days** (roadmap step 87) are said as a relief, never as a miss: "Yesterday
  was a rest day", "1 rest day saved", "A rest day comes with day 7", "Today saved a
  rest day". A third line on the streak row, `caption` in `textTertiary`, and part of
  the row's one spoken sentence. The words *missed*, *lost* and *broke* never appear.
- Sentence case everywhere; no ALL-CAPS labels.
- Badge gating is a trust feature — say it: "Badges need receipts."
- **Things that read as one never split across lines** (roadmap step 70, checked at
  320pt): a range keeps its dash (`holdRanges`, a word joiner either side, applied
  wherever a range is drawn: the chart title and subtitle, Home's takeaway, Resolve's
  range line, and since step 74 How scoring works, Log's track record, the Wrapped
  card, the counts table, History's range chip and Trends), a price keeps its period
  ("$29.90 a year"), a date keeps its day ("Tue, Oct 13"), and the streak row keeps
  "Next milestone:" and "30 days" each whole (it may break between them, as it does in
  a run's "All caught up" card at 375pt, never after "Next"). Done where the text is
  drawn or with no-break spaces, so screen readers hear the same words.

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
  it landed in: "In your 60–80% range, 6 of 9 have happened." ("1 of 2 has" when
  one has: roadmap step 77). Counts, not a verdict, so safe below min-N. The count comes from the store; the component doesn't compute buckets.
  From 10 resolved in the range (the chart title's threshold), the range's own
  comparison follows: "That's 77%, against the 69% you said." (roadmap step 58).
  Said-against-happened is the feedback that moved calibration in the studies; bare
  outcomes barely did (`research/confidence-2026-10.md` §6).
  Then the optional one-line reflection ("What surprised you?"), never before the
  answer.
- Presented as a medium-detent sheet (§7.7). "Already resolved" and "not found" states
  follow §7.8.
- **A skip can be taken back** (roadmap step 39): a "Not scored" card in History opens
  Resolve with "You marked this as can't tell" and a secondary **Answer it now**,
  which reopens it. Only skips: they never counted, so answering later can't rewrite a
  score.
- **Streak checkpoint** (step 64): when the answer is the one that made today count
  and that reached a checkpoint, a still card in the milestone tint sits where the
  milestone card would: the flame and the day count in `readout`, the name ("A full
  week") and "Next milestone: 30 days." (one short line, so a three-digit figure
  still fits at 320pt; VoiceOver hears "7-day streak" first). When a score or badge
  milestone lands on the same answer, both show, the milestone first: `CLAUDE.md` names
  the checkpoint on the answer that earned it (it used to give way, until a review on
  2026-10-06). The sheet scrolls, so Done stays reachable.
- **Log it again** (roadmap step 22): after an answer, a secondary capsule under
  Done. It saves any reflection, closes the sheet and opens Log with the title,
  category and lead time carried over, and the confidence empty: a fresh call, never
  the old number. Not offered inside a run.
- **A run** (three or more ready; roadmap step 18): Home's primary **Resolve all N**
  opens the same sheet with "2 of 5" and a thin brand progress bar above one prompt
  at a time. After an answer the finishing button reads **Next** (**Finish** on the
  last) and the reflection waits behind "Add a reflection"; Skip moves on at once.
  Advancing is always a tap, never a timer (WCAG 2.2.1), and a milestone shows on
  the card that earned it. Ends on "All caught up" with what the run came to, in
  counts against the user's own numbers ("3 answered. 2 happened. You expected about
  2."; skips counted apart as "can't tell"), and the Home streak row beneath it, since
  a run of three is usually the one that makes the day count (roadmap step 65).

### 7.11 Prediction card and the Today list

- Layout: category symbol + word, then title (`body`, up to 3 lines), then one metadata
  line (`subhead`, `textSecondary`): "70% · due Fri 3 Oct". No ALL-CAPS, no brand
  colour on the confidence. The status ("Ready to resolve", "Happened") sits at the
  right of that line and wraps under it when the line is too narrow; the date holds
  together with no-break spaces (roadmap step 52).
- **Due and past-due are neutral.** A prediction coming due is not a lapse. Group the
  Today list by date ("Ready to resolve", "Next 7 days", "Later"; it said "This week"
  until roadmap step 67, which put next Tuesday in this week) and let the group
  header carry the state. No amber, no "Overdue" label, no warning colour.
- Resolved (History): outcome as neutral ink glyph + word ("Happened" / "Didn't"), never
  ✓/✗ characters or green/red. Skipped reads "Not scored".
- Tapping a ready card opens Resolve (§7.10). Keep the single-sentence
  `accessibilityLabel`.
- **History by range** (roadmap step 51): opened from a Stats coverage chip, History
  shows a selected-style chip "You said 80–100% ×" above the category filters; the
  two combine, × clears the range, and leaving the tab drops it. The summary line's
  "57 answered · 38 happened" then matches the chart's subtitle. The range edges come
  from the engine through `statsStore.confidenceRangeLow`. A new range or category
  opens the list at its newest (roadmap step 76); it used to keep the old offset.
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
- **Starter ideas** (roadmap step 40): only before the first prediction ever, five
  quiet rows under the empty title field ("Not sure where to start? Try one, then
  make it yours:"), one per category with its icon. A tap fills title and category,
  never confidence.
- **Track record** (roadmap step 19): one `footnote` line in `textSecondary` under
  the confidence control, "Your 60–80% calls in finance: 7 of 12 happened." The
  category's band first, then all categories, and nothing below 10 resolved (the
  chart title's threshold). Counts, never advice: it must not say what to pick.
  Free, because this is the core loop.
- **Coverage nudge:** a quiet inline card on `surfaceSunken` above the title field. Its
  accept button is secondary; Save is the only primary action on the screen. Keep the
  current copy and the "Not now" cooldown.
- **Save:** one primary capsule, disabled until the title is non-empty and a
  confidence is set (§7.3), `commit` motion.
  (Built as step 46; it used to answer an empty tap with the store's "title is
  required".) A failed save says "Couldn't save that. Try again.", never the store's
  developer message.
- **A new form starts at the top** (roadmap step 75): after a save, and when "Log it
  again" fills it. The tab keeps its scroll offset otherwise, and on a short phone the
  next visit opened on an empty "—%" with the title field out of sight.

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
  honest coin-flip", and under the big count, **what happened against what the
  user's own numbers expected**: "6 happened. You expected about 4." (roadmap step
  48; the sum of stated confidences comes from the engine). It replaced "86% came
  in": a hit rate rewards safe calls. Outcome first, since "about 4. 6 happened" read
  as 4.6. The yearly card uses the same line; (2) one factual receipt in natural frequencies: "You said 90%
  three times. All three happened."; (3) progress: the unlock ring or the next badge
  ("Tracker in health: 3 to go"); (4) the verdict only when the window earns it.
  Never a card whose main message is "not enough data". From a two-day streak, the
  card carries "15-day streak" under the counts in its accent (roadmap step 63). An empty week with open
  predictions due within it leads with "2 on the way" and says the recap fills in as
  they resolve (roadmap step 34).
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
| Trial ending (D16) | Your free trial ends Thursday | Plus then renews for a year at $29.99. | About your Plus trial | default |
| Practice (step 89) | One of five, changing daily: Today’s three · Three new questions · A quick three · Practice is ready · Today’s practice | That day's first question: "Which is farther north: Dublin or Moscow?" | Daily practice | default |

- The confidence goes in the reminder so that resolving from the notification still
  puts the stated number first (§7.10).
- **Never mention the streak** in a notification.
- **Permission in context** (roadmap step 38). Launch only checks; it never shows the
  iOS alert (HIG: "Avoid requesting permission at launch unless the data or resource
  is required for your app to function"). Once there is an open prediction, Home shows
  a quiet sunken card, "Want a reminder when it's due?", saying when the first one
  would come, with a secondary **Turn on reminders** (which shows the alert) and
  **Not now** (a week's cooldown). Settings' Notifications row adds **Allow
  reminders** while iOS hasn't been asked and **Open Settings** after a refusal.
- One reminder per prediction; no follow-ups.
- **The practice reminder is asked for, never assumed** (step 89): off until a moment
  is picked under a finished practice or in You, one a day only while that day's
  practice isn't done, and scheduled no more than three days past the last visit, so
  it falls silent for someone who has stopped opening the app. Its wording changes
  every day, because a repeated reminder wears out (Yancey & Settles 2020).
- **Proposed** (roadmap D8): *Happened* / *Didn't* actions on the reminder via
  `setNotificationCategoryAsync`, as foreground actions that open straight into the
  resolved state. Background (no-open) action handling is only documented to reach JS on
  Android; verify on an iOS device before relying on it.
- **Evening** (roadmap D9, built as step 60): the reminder fires at 19:00 local on the
  due day (`REMINDER_HOUR`); due dates are stored at noon, which asked about Friday's
  outcome before Friday was over. Each reminder records its time, and the launch
  reconcile replaces one set for another time.

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

### 7.18 Warmup verdict

The Day-0 payoff (`WarmupVerdictScreen`): eyebrow "Your warm-up", the verdict in
`title1` ("You run overconfident"), the receipt ("You were 77% confident on average,
and right 50% of the time."), the warm-up score in `title1` (never `display`: it must
not look like the real rating), the mini chart, one line of advice, the "not your
calibration rating" note, then the two actions before the answer key. It opens at
its top (roadmap step 72): the quiz shares its scroll view, and on a 667pt-tall phone
the verdict used to inherit the quiz's offset and open on the chart.

- **The answer key says it in words** (roadmap step 71): per question, the prompt in
  `subhead` secondary, then the right answer in semibold ink and the user's side of it
  ("· You got it", or "· You picked “The Atlantic”"), the fact, and the stated
  confidence at the right. The mark is the Resolve glyph pair in ink
  (`checkmark.circle.fill` / `xmark.circle`), not ✓/✗ text, and each row is one stop
  for VoiceOver. It used to print "✗ Which is longer? A Boeing 737", which read as if
  the 737 had been the wrong pick.

- **One number everywhere** (roadmap step 49): when all answers share a confidence,
  the receipt says it ("You said 75% on all 10, and were right 50% of the time.") and
  a second line notes that one number for the known and the guessed leaves part of
  the skill unused. Not shown when every answer was right, or under three answers.
- **Tricky questions** (roadmap D14, built as step 55): under an overconfident verdict
  only, after the advice, "These were picked to be tricky, so most people run hot
  here. Your own predictions are the real test." The bank is a selected,
  hard-leaning set, and selected items are where overconfidence comes from in the
  research (`research/confidence-2026-10.md` §3). Drawing the ten at random from a
  larger bank (D14 option c) waits on FUTURE_UI A2.

---

### 7.19 Launch

The native splash (indigo, `app.json`) stays up until the first real screen is
decided, then fades out over 250 ms (roadmap step 59): the database is open, the
stores are loaded, and a first run has been sent to the Warmup. It used to hide on
the first React frame, so a cold start cut from indigo to a white screen with a grey
spinner, and a first run showed Home for a moment before the Warmup replaced it. It
never holds longer than 4 s. The loading view behind it is `canvas` with a `brand600`
spinner, which is what the web build shows.

### 7.20 Choosing an element

What to reach for, from 18 apps rated 4.7+ and the HIG (`research/elements-2026-10.md`
§3). Pick the first row that fits; a custom control needs a reason the platform's
doesn't serve.

| You need | Use | Not | Why |
|---|---|---|---|
| Move between the app's sections | A tab bar of 3–5 single-word, labelled tabs | An action as a tab, a hidden menu | HIG Tab bars: "navigation, not… actions". Visible navigation was used by 89% vs 44% hidden (NN/g). Log as a tab is D3. |
| Start a new entry | A tinted "+" (in or beside the tab bar, or in the header), opening a sheet | An ordinary tab | None of the nine top apps that show it uses a tab. Built with D3: `LogButton`. |
| One of 2–5 closely related views | A segmented control, text only | Mixing icons and words; a segmented control for whole sections | HIG Segmented controls. Share's Card · This week · This year. |
| Filter a list | Horizontally scrolling pills, "All" first | A dropdown | Day One, Flighty, Bevel; History. |
| One of a few named options in a form | Chips with symbol + word, selected state not colour alone | A picker wheel | Log's category and due-date chips. |
| A number on a long scale | Slider + ±5 stepper, the value large | A slider alone; buttons for 21 values | HIG Sliders: "supplement… with a stepper". §7.3. |
| A number on a short scale (≤ 6) | One-tap buttons | A slider | Daylio and stoic.'s five faces; Hedge's 50 · 60 · 70 · 80 · 90 · 99. |
| An on/off setting with immediate effect | A switch on a list row | A capsule button | §7.21. |
| Go deeper from a row | The whole row, with a chevron and the current value | A button inside the row | HIG Lists: "use a disclosure indicator". §7.21. |
| Close a sheet or modal | The round × (`CloseButton`) at the top | The word "Close"; a grabber alone | HIG Toolbars; NN/g bottom sheets. §7.7. |
| The one thing to do on a screen | One filled capsule | Two filled capsules | HIG Buttons: "one or two prominent buttons per view". |
| A minor alternative to the main action (Change answer, Can't tell, Restore purchases) | A text button, brand subhead, 44pt target | An outlined capsule beside the primary | Step 78. |
| Confirm something irreversible | A screen that says what goes, an outlined capsule with a `destructive` label, Cancel beneath | A filled red primary | HIG Buttons: never give a destructive action the primary role. Step 81. |
| Explain a number | A text link beside it ("How is this scored?") opening a reading sheet | A tooltip, a long-press | WHOOP, Oura and Bevel put an ⓘ in the header of each score's screen; Calibrate's link does the same job with a word. |
| Ask for a rating | The system prompt after a finished run, never in the Warmup | A custom "Enjoying Calibrate?" pre-prompt; a button | HIG Ratings and reviews. D15, built: `src/review/ratingPrompt.ts`. |

### 7.21 You: settings as a grouped list (built as roadmap step 80)

The You tab is a grouped inset list, as iOS Settings, Streaks and Todoist are: one
`surface` card per group on the canvas, `radius.md`, rows divided by hairlines.

- **Groups:** *Account* ("Sign in ›" with "Not signed in. Your predictions live only
  on this phone." as the footer; signed in, a brand "Sign out" row under "Signed in as
  …") · *Your card ›* and *Calibrate Plus ›* ("Active" as its value when it is), with
  Plus's one line as the footer · *Notifications* (switch, and the "Allow reminders" /
  "Open Settings" row while iOS says no) · *Coach (AI)* and *Usage stats* (switches)
  · *About* (How scoring works ›, Privacy policy › once hosted, Terms of use ›) ·
  *Erase all data on this device* / *Delete account* alone at the bottom, in
  `destructive`, no chevron.
- **Rows:** the whole row is the target; a row that opens something ends in a chevron
  and, where there is one, its current value in `textSecondary`; a row that acts in
  place (Sign out, Erase) has no chevron and says so in its label's colour. An on/off
  row ends in a switch and is one `switch` element for VoiceOver (step 41, unchanged),
  its explanation under the label.
- **No capsule buttons inside rows.** They used to end in "Sign in", "See Plus" and
  "Read" capsules beside three switches, and only the capsule responded.
- HIG: "Minimize the number of settings you offer." Nothing moves to Settings that
  belongs to a task (the share card's theme stays on Share).
- **Practice reminder** (step 89): a stacked row in the Notifications group, its
  label and one line over four chips (Off, With coffee, At lunch, After dinner, each
  with its time), two to a row. With Notifications off the choice is kept and the line
  says nothing is sent.

### 7.22 Daily practice (built as roadmap steps 88–89)

Three two-choice questions a day, the same for everyone on the same day, kept apart
from everything real (`CLAUDE.md`, Daily practice).

- **On Today:** one row under the streak, the streak row's shape: a target symbol,
  "Today’s practice" over "3 questions, about 30 seconds", and **Start** in brand with
  a chevron; "1 of 3 answered" and **Continue** partway; done, a check, "Practice
  done" over "2 of 3 right. New ones tomorrow", and the chevron alone. The whole row
  opens the sheet. Not shown before the first prediction: on Day 0 the Warmup has
  just asked ten questions, and the next thing is the first real one.
- **The sheet:** full height like Log, title and the round ×. The Warmup's question
  form (segments, `title2` prompt, `ChoiceList`, the confidence control from 50%,
  nothing preset), one question at a time, answers held to the end like the Warmup.
- **The answers:** "2 of 3 right" in `title1`, never display size (a practice number
  must not look like the rating), "You expected about 2." under it, then the Warmup's
  answer key in a surface card, "Three new questions tomorrow.", the reminder offer
  (native only), and *Your practice so far*: counts and how many more until 20, then
  which way it leans, the two percentages and the chart. It ends on "Practice stays
  apart from your calibration rating, your badges and your streak."
- **Never:** a practice streak (one counter is enough, and it stays about real
  predictions), a claim that practice improves the score, red or green for a wrong or
  right answer, or a share card (a scope call, not made).

---

## 8. Accessibility checklist (per change)

- [ ] Both appearances (D7): the web build with dark emulated, at phone width; every
      text style sets a colour token.
- [ ] Contrast: text ≥ 4.5:1, graphics/controls ≥ 3:1 (use the token table; don't
      eyeball new pairs).
- [ ] Nothing distinguished by colour alone (Differentiate Without Color).
- [ ] Dynamic Type: layout survives the largest size; `display` capped at 1.6×.
- [ ] VoiceOver: roles, labels, `adjustable` controls, chart description / table.
      A number and its label are one element ("Calibration rating, 92 out of 100.");
      a row of facts is one sentence; a toggle row is one `switch` with the label as
      its name; decorative pieces carry `aria-hidden` (iOS-only props don't reach
      web); a share card is one `image` whose label says what it shows, tiers in
      words. Steps 41–45, 2026-10-05.
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
