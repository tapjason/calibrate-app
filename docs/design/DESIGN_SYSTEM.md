# Fairly Sure — Design System

**Audience:** anyone (human or agent) changing `app/**` or `src/components/**`.
**Authority:** this file governs *how the app looks, moves and reads*. `CLAUDE.md`
governs *what the product does*; if the two conflict, `CLAUDE.md` wins and this file
gets fixed. A rule that would change product behaviour is tagged **Proposed** and needs
the owner's sign-off, as a row in [`UI_ROADMAP.md`](UI_ROADMAP.md) §2, before anyone
builds it; nothing here is tagged now.

**Evidence:** every rule below traces to the sourced research in
[`research/`](research/) (market, libraries, visual-language, done 2026-09-25; patterns,
done 2026-09-28 and behind §2.5 and §7.10–§7.15; confidence, done 2026-10-05 and
behind §7.3, §7.14 and §7.18; elements, done 2026-10-06 from 18 apps rated 4.7+ and
8,057 of their reviews, behind §7.20 and §7.21; retention, done 2026-10-07, behind
the rest days in §7.9 and §7.22's daily practice and reminder; day 0 and day 1, done
2026-10-09, behind §7.5's Day-0 card, §7.10's first answer, §7.12's first due date
and §7.18; the blind dry runs, done 2026-10-09, behind D23–D31 across §7.1, §7.3–§7.5,
§7.10–§7.12, §7.14, §7.17, §7.21 and §7.23; debiasing and accessibility, done
2026-10-12, behind §7.12's own record (D32) and two items in §8). The
"before" screens are in [`baseline/`](baseline/) (web-build captures, so fonts and the
tab bar look like a browser's). Contrast ratios below were recomputed 2026-09-26 with
the WCAG 2.x formula.

**Visual direction (roadmap D33, decided and built 2026-11-01): Instrument.** The brand
has no hue. Actions and selection are drawn in ink, so the only colour on any screen
means over, under or on the line (§2). The face is Instrument Sans (§3). The identity
leads the hero, left-aligned, with the rating as its receipt on a gauge (§7.1), and
lists are grouped rows with each prediction's confidence in its own column (§7.11).
It came out of a review against the frontend-design skill
(`.claude/skills/frontend-design/`), which found the earlier look generic. The skill's
rule still holds: this file is the brief, and the skill's process, restraint and
writing rules apply within it (`CLAUDE.md`, Visual design).

**Status (2026-11-16):** the tokens are in code at `src/constants/theme.ts` (light
and dark both live, following the phone; Instrument Sans as the face), and `src/constants/theme.test.ts` pins every recorded
contrast pair. Colour is fully migrated: no hex literal is left in `app/` or
`src/components/` outside `BADGE_META` and `cardThemes`, which hold their own palettes
by design. A few font sizes are still raw numbers rather than `type.*` (the tab labels'
11pt, an emoji's size); migrating one is in scope for the file you touch (rule 0.1). Dynamic Type caps live there too:
`DISPLAY_MAX_SCALE` (1.6×) for the one display number per screen and `CARD_MAX_SCALE`
(1.2×) for share cards, which are fixed-layout images.

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
   or position. Categories get icons, not colours (a person's own icon, D40, is
   theirs: never a meaning).
6. **Ink is chrome, colour is data.** Actions and selection are ink (`action`); the
   chart and every other hue mean over, under or on the line. Nothing else on screen
   carries a hue except the destructive red, the caution amber, Oracle's gold and
   Google's own mark on its sign-in button (§2.4)
   (D33; `theme.test.ts` holds the rest near-neutral).
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
| **Identity leads, the number is the receipt** | "Sharp in health" first, left-aligned and large; the rating under it on its gauge; the curve is the proof (§7.1, D33). | 16Personalities, Spotify Wrapped 2025 "Clubs" |
| **Ink chrome, colour only for meaning** | Actions and selection in ink; colour only where it means over, under or on the line, so every hue on screen is information (D33). | Co–Star, Wrapped 2025 "selective pops of colour", HIG Color |
| **Honest about uncertainty** | Calibrating states, labelled regions, ranges shown as soft bands, n shown on every dot. Showing ranges barely costs trust (van der Bles 2020). | WHOOP "calibrating", Oura baseline |
| **Reward honesty, not correctness** | Neutral outcome styling; no confidence is ever rewarded for being a particular number (the integrity bonus went, D23). | Product principle (`CLAUDE.md`) |
| **No guilt** | "Getting started" reads as a starting point; misses and broken streaks are never red, never animated. | Gentler Streak (ADA 2024), Finch |
| **Craft in the frequent path, celebration only at milestones** | Log and Resolve get a precise small acknowledgement; only three moments get the full treatment (§6.2). | (Not Boring) Habits (ADA 2022), HIG Motion |
| **Native first** | Real tab bar, sheets, SF Symbols, system haptics. | ADA 2025–2026 winners |
| **Easy before minimal** | Every control carries a word and stays visible; no gesture-only action; a familiar platform pattern beats a clever one. "Easy to use" is the praise in 204 of 4,899 five-star reviews; the most pared-down app in the set draws the most "unintuitive" ones. | `research/elements-2026-10.md` §1, NN/g icon usability |
| **Don't move the furniture after launch** | Structural changes (navigation, type, dark mode) land before the first public release. After it, a changed UI is the most punished thing in reviews. | `research/elements-2026-10.md` §1.3, Chen et al. 2021 ("comparative" reviews 90% 1–2★) |

---

## 2. Colour

### 2.1 Actions and selection (ink — matches the icon and splash)

Since D33 (2026-11-01) the brand has no hue, and the tokens are named by role.

| Token | Light | Dark | Use | Contrast |
|---|---|---|---|---|
| **`action`** | **`#15171B`** | `#F2F3F5` | primary CTA fill, the "+", a switch that's on, a selected chip's fill, a selection border | `onAction` on it 17.9:1 / 16.2:1 |
| `actionPressed` | `#3A3D45` | `#C9CCD2` | a pressed CTA | |
| `onAction` | `#FFFFFF` | `#15171B` | text and icons on an `action` fill; a switch's thumb | |
| `actionText` | `#15171B` | `#F2F3F5` | tappable text (text buttons, links), set in semibold | 16.3:1 / 17.3:1 on canvas |
| `selectedFill` | `#E3E5E9` | `#2A2D33` | a quiet chosen state: a selected plan, a checkpoint row, the Coach box | |
| `selectedText` | `#15171B` | `#F2F3F5` | text on `selectedFill` | 14.2:1 / 12.4:1 |
| `emphasis` | `#C9CCD3` | `#454952` | highlighted but not chosen: a checkpoint's edge, a gauge's track, a row's scale | decorative |

- One filled primary action per screen (HIG Color: "refrain from adding colour to the
  background of multiple controls"). Selected chips are ink-filled too (§7.12); they
  are choices, not actions, and carry the bolder weight as well as the fill.
- In dark, actions turn light with ink on them (`onAction` flips). A switch's thumb
  follows `onAction` so it reads on a light track.
- Tappable text has no hue to mark it, so it is always semibold and says what it does.

### 2.2 Neutrals (cool graphite)

| Token | Hex | Contrast |
|---|---|---|
| `canvas` | `#F3F4F6` | — |
| `surface` | `#FFFFFF` | — |
| `surfaceSunken` | `#E9EBEE` | — |
| `hairline` | `#DDE0E5` | decorative only |
| `controlBorder` | `#858993` | 3.50:1 on white, 3.18:1 on canvas, 3.07:1 on `cautionBackground` (UI ≥ 3:1); 2.93:1 on sunken and 2.78:1 on `selectedFill` |
| `textPrimary` | `#15171B` | 16.3:1 on canvas |
| `textSecondary` | `#4B4F58` | 7.46:1 on canvas |
| `textTertiary` | `#646873` | 5.06:1 canvas · 4.66:1 sunken · 4.42:1 `selectedFill` (an edge there, not text) · the chart's luck-bar outline, ≥ 4.6:1 over its region tints in both appearances (D47) |
| `destructive` | `#C4271C` | 5.75:1 on white, 4.81:1 on sunken (sign-out, delete only) |
| `cautionText` / `cautionBackground` | `#7E4600` / `#FBEFD6` | 6.67:1 (account deletion's warning only) |

`controlBorder` is never an edge on `surfaceSunken` or `selectedFill`: it falls under 3:1
on both in light, and on `selectedFill` in dark (2.87:1). A control on a sunken card or track (a nudge's button, the practice
offer's moments, the raised segment of the sign-in switch and of Share's tabs, an empty
coverage range) or on the
checkpoint tint takes `textTertiary` for its edge (`onSunken` on `Button` and
`MomentChips`; steps 193 and 195).

The Lens emblem has its own three (§7.4): `emblemMid` `#5B5F69` (Forecaster),
`emblemDeep` `#15171B` (Sharp, and where Oracle's gradient starts) and `emblemMark`
`#FFFFFF` (the diagonal and bezel on a filled face); in dark `#9EA2AB`, `#F2F3F5` and
`#15171B`.

### 2.3 Calibration semantics (Okabe-Ito derived, colour-blind validated)

Cool = underconfident, warm = overconfident, green = on the line.

| Role | Chart mark (≥3:1) | Text on white | Chip text / bg | Text on a dark card |
|---|---|---|---|---|
| `over` ("runs hot") | `#D55E00` (3.87) | `#B84E00` (5.09) | `#9A3F00` / `#FFF1E6` (6.15) | `#F28A4B` (7.31); mark `#E06B20` |
| `under` ("runs cool") | `#0084C7` (4.10) | `#006C9E` (5.77) | `#005A85` / `#E6F4FB` (6.68) | `#5CB4EC` (7.90); mark `#2D96D8` |
| `calibrated` ("on the line") | `#009E73` (3.42) | `#00785A` (5.48) | `#00664C` / `#E3F6EF` (6.22) | `#3CC79A` (8.44); mark `#14A87B` |
| too few (a range under 10, D58) | `textSecondary` (chart dot); the card theme's `muted` (strip dot) | no lean word | | `muted` |
| `oracleGold` (emblem hairline only) | `#B7791F` (graphic) | chip `#7A4F0E` / `#FDF6E7` (6.61) | | `#E8B64C` |

Lean colours are drawn on `canvas` and `surface` only. In light a mark is never set on
`surfaceSunken` or `selectedFill` (`calibrated` measures 2.86:1 and 2.71:1 there), nor
lean text (`over` 4.26:1 and 4.03:1). Over the chart's region tints the words need a
canvas halo (§7.2).

Validated with the dataviz palette validator (Machado 2009 CVD simulation): worst
colour-blind ΔE 11.0 (light) and 11.0 (dark), both pass. That ΔE is the validator's
OKLab distance ×100, whose pass lines are 8 for colour-blind viewers and 15 for normal
vision; it is not CIEDE2000 (`research/colour-2026-11.md` §4). Since D33 the brand has no
hue, so no chrome can be mistaken for a calibration colour; indigo sat only 3.7 ΔE from
`under` for tritan viewers. Rule 0.6 keeps it that way.

### 2.4 Rules

- Outcome (Yes/No) = filled vs hollow **ink** glyph (`checkmark.circle.fill` /
  `xmark.circle`), never green/red.
- The hero score numeral is always `textPrimary`. Colour goes to the *direction* of
  miscalibration (over/under), never to good/bad.
- Categories are identified by SF Symbol + label only (§5), or by the person's own
  emoji or picture + label (D40, §7.24). That is the one place a hue appears that
  isn't over, under or on the line: it means "the icon you chose" and nothing else.
- **A third-party mark keeps its owner's colours.** "Continue with Google" (step 192, on
  the sign-in screen only) follows Google's branding rules, which forbid a monochrome G:
  the four-colour G from Google's own sample file (`googleBlue` `#4285F4`, `googleGreen`
  `#34A853`, `googleYellow` `#FBBC04`, `googleRed` `#E94235`, the same in both
  appearances), on Google's Light theme in light (`googleButtonFill` `#FFFFFF`,
  `googleButtonStroke` `#747775`, `googleButtonText` `#1F1F1F`, pressed `#E9E9E9`) and its
  Dark theme in dark (`#131314`, `#8E918F`, `#E3E3E3`, pressed `#282829`). It means "this
  is Google's button" and nothing about the record. The label is in the system font, like
  Apple's native button above it, not Instrument Sans (Google names Google Sans or Roboto;
  the app carries neither). `theme.test.ts` exempts exactly those four G tokens and fails
  on any other new hue. Apple's button stays first and the same size.
- The app follows the phone's appearance (`app.json` `userInterfaceStyle: "automatic"`;
  D7, built as step 86), with no in-app toggle: the HIG says people "generally expect
  all apps … to respect their preference" and warns against one. Every token is a
  light/dark pair (§2.5).

### 2.5 Dark neutrals (D7: decided and built 2026-10-07, following the system setting)

Cool graphite, not an inversion (D33). How it works:
each token in `colors` resolves where it's drawn (DynamicColorIOS on iOS, a CSS custom
property on web), so styles made once at load still switch; `themed()` does the same
for a colour outside the palette (the badge chips). Share cards never use `colors`:
an exported PNG keeps its own palette whatever the phone's appearance (`LensEmblem`
takes `paletteOn(card background)` there: the dark palette on a dark card, the light
on a light one).

Rules dark mode taught (2026-10-07):
- **Every text style sets a colour token.** Unset, RN draws black, invisible on the
  dark canvas.
- **Tappable text uses `actionText` on canvas or surface, `selectedText` on
  `selectedFill`.** `action` is a fill; text on it uses `onAction`.
- **`onAction` flips with the appearance** (D33): white on the ink fill in light, ink
  on the light fill in dark. Switch thumbs use it too, never `surface`.
- **Plain values read the appearance through `useAppearance`** (roadmap step 91),
  never react-native's `useColorScheme`. React Navigation's theme takes hex strings,
  so it's the one place a plain value is chosen per appearance, and on web
  `useColorScheme` lost the first switch after a load: the header and the tab bar
  kept the old appearance under content that had changed.
- **Native and browser controls follow the phone too:** no `themeVariant` on the
  date picker, and `color-scheme: light dark` on the web date input, whose calendar
  icon was black on the dark surface without it (step 92).

| Token | Dark hex | on `canvas` | on `surface` |
|---|---|---|---|
| `canvas` | `#0E0F12` | — | — |
| `surface` | `#18191D` | — | — |
| `surfaceSunken` | `#222429` | — | — |
| `hairline` | `#2D3036` | decorative | |
| `controlBorder` | `#6E727C` | 3.98 | 3.65 |
| `textPrimary` | `#F2F3F5` | 17.26 | 15.82 |
| `textSecondary` | `#B4B8C0` | 9.64 | |
| `textTertiary` | `#8D919B` | 6.07 | 5.57 |
| `actionText` | `#F2F3F5` | 17.26 | 15.82 |
| `destructive` | `#FF6B5E` | | 6.29 |

Calibration marks and text use the "Dark card" column of §2.3. On dark `surfaceSunken`
the marks measure 4.65:1 (`over`, the lowest), 4.78:1 (`under`) and 5.11:1
(`calibrated`), all over the 3:1 a mark needs, and the text 6.29:1 or more. The CTA is a
light fill with ink on it (16.2:1), and the fill stands 15.8:1 off dark `surface`.

---

## 3. Typography

**Decision (roadmap D33, decided and built 2026-11-01): Instrument Sans everywhere**,
numerals included (`FONT_FAMILY`). It replaced Inter (D1), the face the
frontend-design skill names first as the generated-app default. Instrument Sans is a
grotesque with a slightly condensed, drawn feel that suits an app about measuring, it
has tabular figures (`tnum`), and it is one face on iOS and web, so web screenshots
stay a faithful preview of type. Four weights ship, 400 · 500 · 600 · 700, the only
ones used (a test holds the tokens to them).
iOS embeds them at build time (the expo-font plugin in `app.json`) under the family
"Instrument Sans", so `fontFamily` plus `fontWeight` picks the face; web registers the
same files under the same family (`src/constants/fonts.web.ts`) with a system fallback
stack. Header titles, tab labels, share cards and the chart's SVG labels use it too.
The files carry "Instrument Sans" as their typographic family; that
iOS picks each weight from it is a device check (`docs/HUMAN_VERIFICATION.md`, D33).

- **Tabular figures** only on numbers that animate or align in a column (the rating,
  a row's confidence, counts), never on a phrase.
- After a face change, check text in fixed-width spots at 320pt (the coverage cells'
  range labels sit at the 11pt floor).
- Headlines in `title1` and up may take a little negative tracking (−0.4 on the
  identity line); body text keeps the face's own.

| Token | Face | Size/line (pt) | Weight | iOS style | Use |
|---|---|---|---|---|---|
| `display` | Instrument Sans | 64/68 | Bold | custom (cap Dynamic Type at 1.6×) | unused since D33 (both heroes take `readout`); kept for a future hero |
| `readout` | Instrument Sans | 48/56 | Bold | custom (cap at 1.6×) | the rating on Today and Insights; the live number on a control or celebration (confidence readout, milestone card) |
| `titleXL` | Instrument Sans | 34/41 | Bold | Large Title | screen titles, verdict headline |
| `title1` | Instrument Sans | 28/34 | Bold | Title 1 | section heroes, the Warmup's read |
| `title2` | Instrument Sans | 22/28 | Bold | Title 2 | quiz prompt, card headlines |
| `title3` | Instrument Sans | 20/25 | Semibold | Title 3 | group headers |
| `headline` | Instrument Sans | 17/22 | Semibold | Headline | row titles, buttons |
| `body` | Instrument Sans | 17/22 | Regular | Body | prediction text, copy |
| `callout` | Instrument Sans | 16/21 | Regular | Callout | explanations |
| `subhead` | Instrument Sans | 15/20 | Regular | Subhead | metadata |
| `footnote` | Instrument Sans | 13/18 | Regular | Footnote | captions, chart labels |
| `caption` | Instrument Sans | 12/16 | Medium | Caption 1 | chart ticks (minimum for charts) |
| `eyebrow` | Instrument Sans | 13/18, +0.4 tracking | Semibold, sentence case | Footnote | section labels (replaces ALL-CAPS grey) |

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
| `e2` | opacity 0.12, radius 24, y 8 | toasts, dragged items |
| glass | native tab bar, toolbar "+", sheet chrome (`GlassView` regular) | never on content |

RN 0.83 (New Architecture) supports `boxShadow` natively — no shadow library.

---

## 5. Icons

- **`expo-symbols` (`SymbolView`)** on iOS (a direct dependency, `~55.0.9`), with
  Ionicons as the web `fallback`. Relying less on `@expo/vector-icons` also pre-empts
  its deprecation in SDK 56.
- Filled symbols in the tab bar (HIG).
- Symbol map:

| Meaning | SF Symbol |
|---|---|
| work · health · finance · social · personal | `briefcase.fill` · `heart.fill` · `dollarsign.circle.fill` · `person.2.fill` · `person.fill` |
| outcome yes / no (neutral ink) | `checkmark.circle.fill` / `xmark.circle` |
| insights tab | `chart.line.uptrend.xyaxis` |
| forecaster motif | `scope` |
| unlock | `lock.open.fill` |

- **No emoji in UI chrome or badges** (they render differently per platform and read
  as toys). Emoji are fine in the plain-text share (§7.5) and as a category icon the
  person chose themselves (D40, §7.24); the app never picks one for them.

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
| `reveal` | count-up 700 ms ease-out; diagonal draws 400 ms; dots drop 60 ms stagger; regions fade 200 ms | `impactAsync(Rigid)` as the last dot lands | Warmup verdict (chart only, no count-up since D20), weekly Wrapped |
| `unlock` | the milestone card scales in on a spring (damping 14, stiffness 180); a ring completing into the numeral is parked with the ring (FUTURE_UI §B) | `notificationAsync(Success)` | rating unlock (`MilestoneCard`) |
| `tierUp` | emblem flips on Y 600 ms, ring count increments, ≤ 40-particle confetti ≤ 1.2 s | `notificationAsync(Success)` | badge tier-up |
| `checkpoint` | the card or the streak row scales in on `unlock`'s spring; the day count rolls up from the day before; the flame scales 1 → 1.15 → 1 once; ≤ 40-particle confetti only at 100, 365 and each further year | `impactAsync(Rigid)` at 7 and 30, `notificationAsync(Success)` from 100, once, as it lands | a streak checkpoint (step 194) |
| `reduced` | all of the above → 200 ms cross-fade; no count-up, confetti or flips; haptics still fire | as above | Reduce Motion on |

### 6.2 Celebration budget

Full treatment (animation + success haptic) for four moments: **Warmup verdict**,
**score unlock**, **badge tier-up**, and a **streak checkpoint from 100 days** (7 and
30 get the motion with a Rigid tap and no confetti).
Weekly Wrapped gets `reveal` without confetti. Everything else is small and precise.

**Streak checkpoints** (7, 30, 100 and 365 days, then each further year; decided
2026-10-06, the moment built as step 194 on the owner's word, D67) are the only streak
days that get marked. The `checkpoint` moment (§6.1) plays **once per local day**
(`streakMomentDay`, a device setting): on `StreakCheckpointCard` when an answer reached
it, or on Today's streak row when a log did, where Today scrolls the row into view
instead of the new card (§7.11) so the haptic has its visual twin. **One full moment
per answer:** when the same answer unlocks the rating or tiers a badge up, that moment
plays and the checkpoint card is still, with no haptic or confetti of its own. Nothing
plays while "Streak and daily goal" is off. The milestone tint stays on the row for the
rest of that day. A streak day that isn't a checkpoint never gets one. Only Jest and the
web build have run it; timing and 60 fps are for the iPhone.

- `notificationAsync(Success)` is reserved for unlocks, tier-ups and a checkpoint from
  100 days. Never for a Yes.
- **Never animate:** demotions, broken streaks, "No" outcomes. A score that slips below
  a threshold keeps its emblem and shows a text "holding" state.
- The app plays no sound of its own; a notification makes the system's.
- Animate the *number* in sync with the celebration (Brilliant's count-up), not just
  confetti.

---

## 7. Patterns

The four tabs are *Today*, *Insights*, *History* and *You*, and Log is a sheet (D3, §7.7).

### 7.1 Hero score and provisional state

- **Identity on Today** (roadmap step 28; D33 put it first): the share card's
  headline leads the hero, left-aligned, from the same helper: the best category's
  30pt emblem and "Sharp in health" in `title1` (tracking −0.4), the contrast
  ("Tracker in finance") in `callout` beneath, indented to start under the words. Hidden while every
  category is at Getting started. **D27 (2026-10-10):** only categories past the count gate
  (20 resolved) are named, so the contrast is never "Guesser in …", which means
  "fewer than 20 here" and read as a verdict. Tapping the line opens How scoring works
  at its Badges section (§7.17), not Share: two blind testers expected an
  explanation.
- **Unlocked** (D33): everything left-aligned. Under the identity, the gauge
  (`ScoreBar`): a 4pt `emphasis` track, an ink fill notched at 70 / 85 / 90 in the
  canvas colour, and a 3 × 20pt ink needle at the score, read like an instrument's
  scale. Under it the receipt: the rating in `readout` (48pt, `textPrimary`, tabular)
  with "calibration rating" beside it on its baseline. Then the one-line read from the
  engine's direction of error ("You're overconfident at 80–100%") with a 10pt dot in
  that direction's mark colour beside the words, the one place a hue appears in the
  hero. On Insights the receipt comes first (the chart is that screen's hero). A
  month-over-month delta only when both months are non-provisional. The 70 label is
  centred on its tick; 85 sits left of its tick and 90 right of its own, because centred
  they ran together as "8590" at 320pt (roadmap step 52).
- **Provisional:** never put the countdown in the hero slot (baseline 04/05 do —
  "20" reads as a score of 20). Show a **20-segment ring or bar** (20 per category too, D46):
  filled = resolved, hatched = pending "on their way", hollow = to go. Label:
  "Calibrating · 4 on their way · 16 to go". Pending predictions really will count,
  so this endowed progress is honest (Nunes & Drèze 2006: 19% → 34% completion).
  After "N more scored answers and your score unlocks.", the caption gives the wait a
  date (roadmap step 32): "The next one comes due Tue, Oct 6." ("The first one" before
  any has resolved; the date never splits across lines), or "One is ready to resolve
  now." Nothing when nothing is open.
- **The first answer leads** (D30, 2026-10-10): until anything has resolved, the
  block opens with one `headline` line above the bar naming the evening the first
  reminder comes: "Your first answer: tomorrow evening", "…: Friday evening" within a
  week, "…: Fri, Oct 16" beyond, "Your first answer is ready" when one is due. The
  0-of-20 bar and its caption follow. The newcomer read Day 0 as "come back in a
  week, then 20 more"; the nearest thing now comes first.
- **Ghost chart** before unlock: the full frame, diagonal and labelled regions with
  empty bucket slots — never an italic placeholder line. Its key names only what's
  drawn, so the grey-bars sentence waits for the first dot (roadmap step 68).
- **Unlock** = the `unlock` motion (§6.1).
- **Give or take** (roadmap D4, step 62): on Insights, a soft band on the bar and the line
  "Give or take 5 points with this many predictions." The engine bootstraps the
  rating and sets half the spread of the middle 80% either side of it
  (`statsStore.ratingRange`); centred on the rating because resampling only adds
  error, so percentiles would sit below a calibrated user's own score.
- **The lines under the rating on Insights** (D68, step 196): three groups, 12 apart
  and 4 within, after the marks caption, which stays with the bar. What the number
  means: the points line ("Range by range, …") leads in `subhead` ink, with the
  perfect-calibration line under it, whose endings answer its figure. How firm it is:
  the give-or-take, then since last week. Then the count ("153 scored, 9-day streak").
  All but the lead stay `footnote` in `textSecondary`. Whichever line of a group comes
  first takes the 12, and a group with none shown leaves no gap. Margins on the lines
  themselves, no wrapper, so VoiceOver's order and stops are as before. Six equal lines
  4 apart read as a wall in five playtest rounds.
- **Brier score** (D24): on Insights only, from 50 scored answers (`BRIER_MIN_N`, D62),
  one `footnote` line in `textSecondary` under "More about your record": "Brier score
  0.22, lower is better. Saying 64% every time, how often your calls came true, would
  score 0.23, so yours does better." (`brierLine`; a tie or a loss reads as `CLAUDE.md`
  says). Two decimals, from the engine (`statsStore.brier`, `brierBaseline`).
  Against the person's own base rate since D35 (step 140); "always saying 50% scores
  0.25" flattered anyone whose calls mostly happen. Never on Today, never on a card, never in `display`
  or `title` type: it keeps the rating honest for those who look, and stays out of
  everyone else's way.
- **Streak** (roadmap D2, step 61; its form step 193, D67): a row on Today under the
  rating. A 22 pt flame that is an **outline** in `textSecondary` until today counts and
  **filled** in `action` once it does (shape carries the state; an ended streak's is an
  outline in `textTertiary`); the count as its own figure (`title3`, bold) before "day
  streak", spoken as "12-day streak"; what today adds ("One prediction today makes it
  13", or "Today counts"); and three pips for the day's goal, captioned "Today's goal"
  (two lines, hidden from VoiceOver with the pips). No hue: a classic orange flame is
  `over`'s orange (`research/colour-2026-11.md`). On the milestone tint the caption and
  the rest line use `textSecondary` and a hollow pip's edge `textTertiary`
  (`textTertiary` reads 4.4:1 there, `controlBorder` 2.8:1). A day counts with one prediction logged or answered
  (D17, §7.9); three is the goal. Gain framing only. Since D60 (2026-11-13), for a week after a streak of 2 days or more ends,
  while none runs, the row says so plainly with no pips ("Your 151-day streak ended
  on Thursday" / "No rest day was left to cover it. One prediction today starts a
  new one"); after that it isn't shown until the next one starts.
- **Streak checkpoints** (step 64; 7, 30, 100, 365, then yearly): once today counts,
  the row names the next one ("Today counts. Next milestone: 30 days"). The day before
  one says so as a gain ("1 more today makes it 7: a full week"; "Today counts.
  Tomorrow can make it 7: a full week"). On the day itself the row takes the milestone
  tint (`selectedFill` fill, `emphasis` hairline) and reads "7-day streak · A full week.
  Next milestone: 30 days" until midnight. "Next milestone" starts a line of its own
  in the row (step 138), so "Next" never ends the line before it. Names: A full week,
  A full month, Triple digits, A full year, Two full years… Static until the
  celebration is built (§6.2).

### 7.2 Calibration chart (`CalibrationChart`)

Keep the hand-rolled `react-native-svg` chart; invest in design, not a library.

1. **Title = takeaway** ("You're overconfident at 80%+"); subtitle in natural
   frequencies ("Of 12 things you called 80–100% likely, 7 happened"). With a range
   leaning each way (D37, step 142), the title names both: "You're too sure at
   80–100% and too cautious at 60–80%", subtitle "Of 20 things you called 80–100%
   likely, 8 happened; about 40% would have matched. Of 55 at 60–80%, 42 happened;
   about 75% would have matched." (D57). Naming only the worst hid a
   power user's compression. With one side only, the title names the largest gap
   among the ranges that lean, never a bigger gap inside luck (`headlineRange`,
   step 167); the calibrated wording only when no range with ≥ 10 leans.
   **Inside luck** (D57, step 170): "You're well calibrated at 60–80%" only when every
   range with ≥ 10 is within 5 whole points of what was said (`closeToSaid`, the
   recaps' rule); otherwise "No clear lean at 60–80%" ("No clear lean overall
   yet" over several, and "You're well calibrated overall", since D62, naming the range
   furthest off in the subtitle), and the
   subtitle gives the expected count: "Of 21 things you called
   60–80% likely, 12 happened; your numbers expected about 14." **A lean** adds what
   would have matched, rounded to 5 as the category line is: "…, 38 happened. You
   said about 88%; about 65% would have matched."; both sides, one figure each. Today
   shows any of these titles (`chartVerdict`), never the chart's fallback, with the
   dot of its direction (`lean`), and no dot for a read both ways. On Insights,
   "More about your record" says "No answers are Can't tell." when there are none
   (D59, D62).
   **Furthest off** (D37): the first line under Category badges, `subhead` in
   `textPrimary`: "Furthest off: finance. You said about 85%, and 9 of 21 happened.
   About 45% would have matched." Only for a category past `MIN_N_CATEGORY` whose
   lean passes the one rule (D35); the matching number is what happened, to the
   nearest 5. **Since last week** (D37): a quiet line under the give-or-take, once the
   rating is unlocked a week ago and now and something was answered since: "Up 2
   since last week, from 6 answers given since then, within its give-or-take."
2. **Regions labelled in place:** below the diagonal lightly warm-tinted, labelled
   *Overconfident*; above lightly cool-tinted, *Underconfident*; the diagonal labelled
   *Perfectly calibrated*. Position + tint + text = three channels. Each word sits on a
   canvas halo, as the n labels do: over its tint, a grid line or a luck bar, `over` text
   measured 4.27:1 in light, under 4.5:1; on the canvas it is 4.62:1 (step 195).
3. **Dots** coloured by side (`over` / `under` / `calibrated`), sized by n, labelled
   with n. Connecting line 1.5 px neutral, or none — five buckets are not a function.
4. **Coverage row** under the chart: five bucket chips with counts, empty ones hatched
   ("You've never logged anything under 40%"): sunken, with "none" and a dashed
   `textTertiary` edge (step 195). This is the spec's range-coverage caveat
   made visible; it links to the `CoverageNudge`. On Insights each filled chip is a
   button with the control outline ("80–100%: 57 scored. Show them.") that opens
   History filtered to that range, under the line "Tap a range to see the predictions
   behind it." (roadmap step 51). Empty chips stay inert, and so does the Warmup's.
   A chip's range label stays on one line while it fits and otherwise breaks after
   its dash ("80–" over "100%"), the counts level along the bottom of the row (step
   138). Held whole, it was cut to "20–4…" at large text sizes, where the web can't
   shrink text to fit and iOS only shrinks it so far.
5. Ticks "0%…100%" in `caption`, `textTertiary`.
6. Keep `describeCalibrationCurve()` for screen readers and add a "Show as table"
   disclosure.
7. Animate draw-in by animating `strokeDashoffset` on the existing polyline.
8. **Chance bars and dots** (roadmap D4, built as step 62): behind each dot a grey
   capsule (`textSecondary` at 16%, 10pt wide, no end caps, outlined 1pt in `textTertiary`,
   which clears 4.6:1 on the canvas and both region tints, light and dark: WCAG 1.4.11,
   D47, step 158; the fill alone was about 1.2:1) spans the central 80% of
   the binomial outcomes a perfectly calibrated forecaster would hit at that bucket's
   n (`BucketStat.chance_low/high`; the central half until D35, step 140). It is the
   one lean rule: a dot is coloured as over or under only outside its bar, and by at
   least 5 points, and only from 10 answers (`MIN_N_BAND`): under that it is
   `textSecondary`, whichever side it fell (D58, step 158: no lean mark under 10, as
   no lean word). The caption ("Grey bars: where a perfectly calibrated dot lands 8
   times in 10 with that many predictions. A dot inside its bar can't be told apart
   from perfect calibration.", and, only while a grey dot is drawn, "A grey dot has
   fewer than 10 answers, too few to read yet.", owner 2026-11-10) and spoken
   description say what it is. The Warm-up's chart follows the same rule, so its
   dots are nearly always grey: its read takes all ten together, and its note says so. "Show the counts" opens each range's said / happened / chance numbers and an
   icon array: a dot per prediction (ink when it happened, hollow when not), an
   upright `textSecondary` bar at the expected count (`expected_yes`), and "40 of 52
   happened; your numbers expected about 36." Above 60 predictions each dot stands
   for several. The engine does the binomial and expected-count math; components
   only draw it.

Error bars with caps are banned — lay readers treat the caps as hard limits.

### 7.3 Confidence input (Log and Warmup)

The product's central input must carry visual weight (baseline 03 shows it as two
small ±5 buttons).

- A large percentage readout (`readout`, 48 pt, tabular) with a natural-frequency
  companion: "70% · about 7 times in 10".
- A slider (`@react-native-community/slider`, `step={5}`, ticks at 20/40/60/80 = the
  bucket edges) with `selectionAsync` on each step. No zone is tinted and no number
  earns a chip: the 35–65 integrity zone and its chip went with D23 (three of four
  blind testers couldn't say what the band meant).
- **Keep** the ±5 buttons (or equivalent `accessibilityActions`) and the existing
  `adjustable` role from `src/components/ui/adjustable.ts` — the slider must not
  regress VoiceOver. They sit on the readout's row, right-aligned, from 360pt wide
  and up to 1.15× text; narrower or larger, under the slider (step 110). On their
  own row they cost ~60pt and pushed Next and Save below the fold on a 667pt phone.
- Warmup range stays 50–100 (spec).
- **Starts empty** (roadmap D13, built as step 54): the readout shows "—%" in
  `textTertiary` at full size (so setting a number doesn't shift the layout) with "not
  set yet" beside it, the slider's thumb rests at the coin flip, 50%, in
  `controlBorder` grey with no fill (the left end of the Warmup's and practice's
  50–100 track), and the first drag, tap on the track (`tapToSeek`), touch of the thumb
  or ±5 sets a real number. The first ±5 steps from where the grey thumb rests, to 45 or
  55 on Log and 50 or 55 in the Warmup and practice, as VoiceOver's first swipe does
  (D49, step 163: resting mid-range at 75 made 70 one tap and a coin flip five; D36,
  step 141: three blind testers expected 55 from +5). VoiceOver hears "not set". Next
  (Warmup) and Save (Log) wait for a number. With a preset number, "didn't touch it"
  couldn't be told from "chose it" (research: `confidence-2026-10.md` §2).

### 7.4 Badges — the "Lens" emblem

One SVG component, `<LensEmblem tier category progress size />`, used at 28 pt (lists),
64 pt (Insights header), 120 pt (tier-up) and 160 px @1080 (share cards). A
continuous-corner square (radius 28% of size) containing the **calibration diagonal**.
Tier is encoded by **fill + ring count + written label**, never colour alone:

| Tier | Emblem | Fill | Rings | Accent |
|---|---|---|---|---|
| Getting started (`guesser`) | dashed outline, dotted diagonal | none | 0 | `controlBorder` |
| Tracker | solid outline, solid diagonal | `surfaceSunken` | 1 | `textSecondary` |
| Forecaster | filled | `emblemMid` (graphite) | 2 | `emblemMark` diagonal |
| Sharp | filled, deep | `emblemDeep` (ink) | 3 + bezel ticks | `emblemMark` diagonal |
| Oracle | gradient `emblemDeep`→`oracleGold` | — | 4 + bezel | `oracleGold` hairline |

- The category SF Symbol sits small in a corner; the label is always written
  ("Sharp · Health").
- **Provisional / not yet earned:** blueprint rendering (outline, 40% opacity) with a
  progress arc; the hint beside it says what's left. Implemented as `LensEmblem`'s `progress` prop: the
  outline goes dashed and faint, and a solid stroke traces it as far as the user has
  come (`src/components/ui/LensEmblem.tsx`).
- The progress hint names every requirement still unmet: "3 more scored answers to
  reach Tracker", "Score above 70 at its low end to reach Forecaster", or both, "20 more
  scored answers and a score above 85 at its low end to reach Sharp" (roadmap step 47).
  Naming only the count promised a badge that
  resolving alone couldn't earn. Only the threshold is printed, never a provisional
  score.
- Each tier shows its receipt in one line: "Score 87, give or take 3, from 52 scored".
  Badge criteria stay in the engine (`evaluateBadge`); `src/constants/badges.ts` holds
  presentation only, with no emoji.
- **The category's own score** (D28, 2026-10-10): on each Insights badge row, once
  the category is past `MIN_N_CATEGORY` (20 resolved since D46, `score_is_provisional` false),
  its score in the row's meta line ("Score 84, give or take 5, from 52 scored" since
  D35, step 140), rounded, in `textSecondary` (never a display size; the overall
  rating is the one hero). A tier above Tracker needs the score minus its
  give-or-take over the bar; when only that is short, the hint says "Score above 85
  at its low end to reach Sharp".
  Before that, the count to go and its plain counts (D53). A returning tester couldn't answer "how am I
  doing in money" with a number.
- **The first tier is "Getting started"** (D36, step 141; the id stays `guesser`):
  "Guesser" stung after one prediction. Its tagline says what it is: "Fewer than 20
  resolved here" (it read "Just getting started", which a five-month user took as a
  judgement). The upper tiers' taglines say "at its low end" since D35. Until any
  category has a badge, a line under Category badges says "A category earns its first
  badge, Tracker, at 20 answered there."
- Insights lists the badge rows in the app's one category order (`CATEGORIES` in
  `src/types`: work, health, finance, social, personal), as Log's chips and History's
  filters do (roadmap step 73), so the rows keep their places.
- Why not one hue per tier (16Personalities-style)? Five extra hues would collide with
  the over/under/calibrated semantics. Graphite, ink and gold give each tier a distinct
  look without that cost (D33). The badge chips beside the
  emblem follow the same ladder (`BADGE_CHIP_COLORS`): each tier a step darker grey, up
  to Sharp's mid grey, and Oracle gold. Sharp's chip stops short of ink because it
  holds the emblem, whose Sharp face is ink: on an ink chip the face vanished.

### 7.5 Share cards

- **Hierarchy (at 1080 px wide):** identity line 88–96 px Bold ("Sharp in
  health"; every category at the top tier, two short names at most, else "and N
  more", D54) → contrast line 56 px ("Tracker in money") → one receipt
  36–40 px in natural frequencies ("Right 84% of the time I said 80%") → a mini visual
  with no axes (5-bucket strip between "0%" and "100%", each range marked by shape as
  well as colour: a ring on the line, ▲ came true more often than said, ▼ less, a dash
  for an empty range and a small dot in the theme's `muted` for one under 10 answers,
  which shows no lean (D58); a one-line key under it since D59, "○ no clear lean ·
  ▲ too cautious · ▼ too sure · • under 10 answers · – none"; the strip waits until some range has 10, as
  it waits for the rating; D47, step 158; VoiceOver hears it inside the
  card's one label, with no lean word for a range under 10), legible at thumbnail size → footer: the
  app's name over the hook, phrased as a question, "Fairly Sure" / "What are you sharp
  at?", **≥ 32 px at ≥ 4.5:1** (15 and 14 pt on the 360 pt canvas, 45 and 42 px
  exported); `cardThemes.test.ts` holds every theme's text, the hook included, to 4.5:1.
- **On the Share sheet** (step 112): the preview, then **Share my card** and
  **Share as text** straight under it, then Shape, On the card and the themes.
  The options adjust; the action shouldn't wait below them.
- **Formats:** Story 1080×1920 (keep content inside y ≈ 250–1580); Post 1080×1440 (3:4,
  the tallest ratio X and iMessage show uncropped). The identity card's canvas is
  360 pt wide on every phone and is captured at 3×, which is exactly these sizes
  (roadmap step 53), so nothing overflows the 3:4 box on a narrow phone. The Warmup and
  Wrapped cards use the same 360pt canvas with their own height (step 57), so every
  export is 1080px wide with the same line breaks on every phone. `ScaledCanvas`
  shows each one scaled to the screen; the scale sits on its wrapper, never on the
  captured card. Plus a **plain-text share**
  (Wordle-style, spoiler-free, never includes prediction titles):
  ```
  My calibration · Fairly Sure
  Sharp in health · Tracker in money
  ⬜🟩🟩🟧🟧 score 81, give or take 3
  Low to high: 🟩 no clear lean · 🟧 too sure · 🟦 too cautious · ⬜ under 10 answers
  https://apps.apple.com/app/apple-store/id6831917395
  ```
  A range under 10 answers gets ⬜, as an empty one does: there's no lean to show
  there yet (D58). With every range under 10 there are no squares, and the line
  reads "Score 81, give or take 3".
  The last line is the App Store link (`@/share/link`, from `APP_STORE_ID`); it carries
  the campaign token (`ct=share-card-text`) now that `APP_STORE_PROVIDER_TOKEN` is set
  (2026-11-23, in builds after 1.0.0). An image share can't carry a link (the share sheet gets a bare PNG), so the
  name in the card's footer is its only way back to the store.
- **Which categories it names** (D27, 2026-10-10): the identity and contrast lines
  name only categories past the count gate (20 scored, Tracker or above). Best
  first, every one at that tier ("Forecaster in health and money", D54); the
  contrast is the weakest of those, shown only when its tier differs. With none
  past the gate yet, the identity line reads "Calibrating" over the dashed Getting started
  lens and the subline counts what's left ("12 more scored answers until my
  calibration unlocks"); once the rating is unlocked it leads instead ("Calibration
  89/100", the subline then "Give or take 3, from 148 scored answers"). The text
  share follows the same rule and says the score once.
- **Day-0 card:** the Warmup's counts as an invitation, so Share is never empty
  (D18 (5), step 101): "5 of 10 right" · "I was 77% sure. How sure are you?" ·
  "10 questions. Real predictions next." No lean ("I run hot" was as much luck as
  anything, `research/day0-2026-10.md` §2) and no 0–100 score.
- **The preview's edge** (D33): the Share and Wrapped previews draw a hairline
  (`hairline`) at the card's own corner radius (`CARD_RADIUS`), outside the captured
  card, so the PNG never carries it. The free cards sit close to the canvas in tone (the
  light Wrapped card on the light canvas, Midnight on the dark one, about 1.1:1) and had
  no edge without it. It is sized to the scaled card, not the preview's wrapper, so a
  widening the scale ignores (a web scrollbar going) can't leave it standing past the
  card.
- Gradients in cards are **SVG gradients** (they rasterise with `react-native-view-shot`);
  no Skia, blur or glass inside a card.
- Free theme "Midnight": graphite `#131418` for the identity card, and a light
  `#ECEEF1` for Wrapped, so a verdict and a recap read differently. Plus themes are
  cosmetic only. Every palette is the app's own (D33). A locked theme shows a small
  lock, not a ✦. Under the under-13 rule (D70) no theme is locked or offered: only the
  themes the phone can use are drawn (the free one, and Plus's with a Plus mirror already
  there), and with only the free one there is no picker.
- Offer per-category show/hide before sharing (Any Distance's eye toggles).
- **The shape and the categories left off are kept** between visits, like the theme
  (step 138). Any category can come off, the last
  one too (owner, 2026-11-14): the card then keeps the rating (or "Calibrating") and
  "N categories not shown". Erase and account deletion forget the choice.

### 7.6 Paywall

Structure beats polish (design-only paywall tests win least often). Order: value header
→ 3 benefit rows (symbol + one line) → plan selector (radio cards, **Annual first and
preselected**, "1 month free" badge; Monthly with no trial; Lifetime as a smaller
third row) → **honest timeline** → **one** CTA.

- **Every recurring price names its period** ("$34.99 a year after 1 month free",
  "$4.99 a month"), in the plan row and the timeline. Lifetime stays the bare price
  under "Pay once, keep it". (Roadmap step 50.)
- **Which plan has the trial is plain at a glance** (owner, 2026-11-17, from TestFlight:
  "the trial is not super clear"): a plan with a trial shows a filled pill beside its name
  ("1 month free", `action` / `onAction`) instead of its tagline, and its price row leads
  with the billed price ("$34.99 a year after 1 month free"); while one plan has a trial,
  a renewing plan without one says "No free trial" in `footnote` `textSecondary`
  (Lifetime never does); the timeline box opens with "How the free trial works". Without
  a trial on offer, Annual's tagline is "Best value" and nobody says "No free trial".
- **Annual's monthly figure** sits under its price in `footnote` `textSecondary`:
  "$2.50 / month", on one line (no-break spaces, no full stop). VoiceOver keeps the
  sentence, "Works out to $2.50 a month.", in the card's label, not a slash (the owner,
  2026-11-21; it read "Works out to $2.92 a month." on screen until then). It is
  RevenueCat's `pricePerMonthString`, never our division, and absent when the store
  gives none. App Review 3.1.2: the billed amount stays the most prominent price.

- Timeline, in the store's own units: *Today* — full Plus access · *Two days before* — a
  notification with the date it renews and the price · *In 1 month* — your year
  starts; cancel at least 24 hours before. The middle step shows only while
  notifications are on, since only then does the app send it (roadmap D16, built
  2026-10-07; §7.15).
- The CTA label follows the selected plan and says what follows a trial ("Start 1
  month free, then $34.99 a year" / "Subscribe for $4.99 a month" / "Buy once for
  $79.99", D62), in the store's own price and units. A trial shows only to a customer
  RevenueCat says can still take it (one introductory offer per subscription group);
  unknown reads as no trial.
- **No trial toggle** — Apple rejects them under 3.1.2 since January 2026.
- **A sample before paying** (D37, step 142): once the rating is unlocked, Insights'
  Plus card shows one card in the Coach card's shape, on `surfaceSunken` inside it:
  "A sample, on your own numbers", the receipt ("76% came true at 60–80%", the range
  used most with 10 or more answers), one line, and "Written by the app from your
  record. With Plus, Coach writes cards like this when you ask." The app writes it,
  never the model, and says so.
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
  It's `CloseButton`, shared with Account (roadmap step 66), whose screens sit on
  `canvas` like the rest.

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
  filled "+" (`LogButton`, a 32pt `action` disc in a 44pt target) sits at the
  trailing end of the title bar on Today, Insights and History (D21, step 114), and
  opens Log as a full-height sheet with its title ("New prediction") and the round ×.
  It floated above the tab bar until 2026-10-09 and sat over "Answer all", card text
  and the chart's top-right corner; in the header nothing is ever under it. A typed,
  unsaved prediction asks before a swipe or the × discards it (Discard prediction /
  Keep editing).
  You holds what Settings did, with "Your card" one row from the top. JS tabs for now;
  native tabs with Liquid Glass follow the SDK 58 upgrade with the same layout.

### 7.8 Empty states

Every empty state has an SF Symbol, one sentence in `textSecondary`, and a way forward
(button). No italic grey text. "Nothing to share yet" is never shown — see §7.5.
Built as step 56: `EmptyState` takes a `symbol` (36pt, `textSecondary`, hidden from
screen readers): `calendar.badge.plus` on Today, `clock.arrow.circlepath` on History,
`square.and.arrow.up` on Share. Its button is the primary capsule, since where an empty
state shows it is the screen's main action. On Today and History, **Log a prediction**
repeats the title bar's "+" (D3, D21) on purpose: in words, for someone who hasn't
learned the symbol yet, and only until there's something to list. History's empty state (step 69): before
anything resolves it says when the first answer comes ("The first one comes due Tue,
Oct 13.") and offers **Answer it now** (one ready), **Answer the first one** (two),
**Answer all N** (three or more, Today's run threshold), or **Log a prediction**. A list emptied by its filters keeps just the sentence; the
filters are its way forward.

### 7.9 Copy and tone

- Blunt and human ("On these ten, you were overconfident"), and about the evidence,
  never the person, until the evidence is enough (D18). Lead with
  the sentence; the chart comes second.
- Numbers primary, words secondary — probability words mean different things to
  different people. Pair percentages with natural frequencies ("7 in 10").
- "Getting started" is a starting point, not a grade. The streak says what today adds,
  never what it would cost; when one ends, the row says so plainly for a week, never as
  a loss (D60, §7.1).
- **One a day keeps it, three is the goal** (D17, step 90): the streak row says what
  one prediction adds ("One prediction today makes it 16"), then the goal's progress
  ("Today counts. Goal: 1 of 3") with the pips, then "Today's goal met". The goal is
  never a condition: no line suggests the streak needs three.
- **Rest days** (roadmap step 87) are said as a relief, never as a miss: "Yesterday
  was a rest day", "1 rest day saved", "A rest day comes with day 7", "Today saved a
  rest day". A third line on the streak row, `caption` in `textTertiary` (`textSecondary`
  on the milestone tint), and part of
  the row's one spoken sentence. The words *missed*, *lost* and *broke* never appear.
- Sentence case everywhere; no ALL-CAPS labels.
- Badge gating is a trust feature — say it: "Badges need receipts."
- **Things that read as one never split across lines** (roadmap step 70, checked at
  320pt): a range keeps its dash (`holdRanges`, a word joiner either side, applied
  wherever a range is drawn: the chart title and subtitle, Today's takeaway, Resolve's
  range line, and since step 74 How scoring works, Log's track record, the Wrapped
  card, the counts table, History's range chip and Trends), a count keeps its words
  ("1 of 3" and "3 times" in Log's own record), a price keeps its period
  ("$34.99 a year"), a date keeps its day ("Tue, Oct 13"), and the streak row starts
  "Next milestone" on a line of its own and keeps "30 days" whole (step 138; holding
  "Next milestone:" whole too broke it mid-word at large text sizes, "mileston / e").
  Done where the text is drawn or with no-break spaces, so screen readers hear the
  same words. One exception: the coverage chips' range labels, the narrowest in the
  app, break after the dash once they no longer fit one line (§7.2), rather than be
  cut short.

### 7.10 Resolve

The most frequent meaningful moment in the app. Fast, neutral, honest, in that order.

- **Confidence first.** Headline: "On 3 Sep you said **70%**" (the percentage in
  `title1`), then the prediction text in `title2`, then the question "Did it
  happen?". People misremember their prior confidence once they know the outcome
  (Fischhoff 1975), so the stated number is read before the answer, never as small
  metadata.
- **Yes and No:** two equal capsules in the same neutral style (`surface` fill,
  `controlBorder` outline, `textPrimary` label, `checkmark.circle.fill` /
  `xmark.circle`). Neither is the `action` fill and neither is red: rule 0.4, and HIG Buttons
  reserves red for destructive actions.
- **Skip is not a peer.** A text button below: "Can't tell / doesn't apply", with the
  line "It won't count toward your score." Equal weight would make skipping a miss as
  cheap as recording it. (Built 2026-10-04, roadmap D10.)
- **After the tap:** the `resolve` motion (§6.1), then one factual line about the bucket
  it landed in: "In your 60–80% range, 6 of 9 have happened." ("1 of 2 has" when
  one has: roadmap step 77). Counts, not a verdict, so safe below min-N. The count comes from the store; the component doesn't compute buckets.
  From 10 resolved in the range (the chart title's threshold), the range's own
  comparison follows: "That's 77%, against the 69% you said on average." (roadmap
  step 58; "on average" since step 121, as the figure is the range's mean).
  Said-against-happened is the feedback that moved calibration in the studies; bare
  outcomes barely did (`research/confidence-2026-10.md` §6).
  Then the optional one-line reflection ("Anything to remember about this one?", D50),
  never before the answer.
- **The first answer ever** (step 107) gets a teaching line in place of the range
  line, built from the stated number and identical for Yes and No: "That's your
  first. A 70% call should come true about 7 times in 10, so one answer can't say
  much; 20 can." A first "it happened" otherwise reads as *I was right* (outcome
  bias, Baron & Hershey 1988), which isn't what 70% means
  (`research/day0-2026-10.md` §6). From the second answer, the range line.
- **Changing the answer** (D34, step 139): the text button under the recorded answer
  says what it does, "Change to: it didn't happen" (or "it happened"), and switches
  the answer in place, keeping the reflection typed so far. Never back to open: that
  was one tap from "Can't tell", which parked a miss.
- Presented as a medium-detent sheet (§7.7). "Already answered" and "not found" states
  follow §7.8.
- **Opened from a prediction that isn't due yet**, it goes through the details sheet
  first (§7.23): Resolve is for the evening it comes due, and two testers landed on
  Yes/No a week early with no due date on screen.
- **A skip can be taken back** (roadmap step 39): a "Can't tell, not scored" card in History opens
  Resolve with "You marked this as can't tell" and a secondary **Answer it now**,
  which shows the question and writes nothing until Yes or No (then un-skips and
  answers in one step; step 161). Only skips: they never counted, so answering later can't rewrite a
  score.
- **Streak checkpoint** (step 64): when the answer is the one that made today count
  and that reached a checkpoint, a card in the milestone tint, which plays the
  `checkpoint` moment once (§6.2; still when a milestone plays on the same answer), sits where the
  milestone card would: the flame and the day count in `readout`, the name ("A full
  week") and "Next milestone: 30 days." (one short line, so a three-digit figure
  still fits at 320pt; VoiceOver hears "7-day streak" first). When a score or badge
  milestone lands on the same answer, both show, the milestone first: `CLAUDE.md` names
  the checkpoint on the answer that earned it. The sheet scrolls, so Done stays reachable.
- **Log it again** (roadmap step 22): after an answer, a secondary capsule under
  Done. It saves any reflection, closes the sheet and opens Log with the title,
  category and lead time carried over, and the confidence empty: a fresh call, never
  the old number. Not offered inside a run. **Its label names the date it brings**
  (D56, step 169): "Log it again, due tomorrow", "…due in a week", "…due in a month",
  else as Save says it (`logAgainWords`, from the same draft Log opens with).
  **After a same-day answer** (D41) the line in place of the range's record is advice,
  "Not scored: you logged it today. Log the next one now, and its answer is scored
  from tomorrow." ("you changed its words today" after a rewording), and the button
  sits right under it, above Done: a tester tapped Done under the old line and
  retyped his walk (blind playtest 2026-11-10, run 2). The same after Yes and No.
- **The note before Yes and No** for a same-day answer ("You logged this today, so an
  answer today isn't scored…") isn't repeated when Resolve opens from Answer it now's
  confirmation, which said it a moment before (D56): the route carries that day's key
  (`?warned=2026-11-10`, `sameDayWarned`), and every other route, and any later day,
  shows the note.
- **A run** (three or more ready; roadmap step 18): Today's primary **Answer all N**
  opens the same sheet with "2 of 5" and a thin `action` progress bar above one prompt
  at a time. After an answer the finishing button reads **Next** (**Finish** on the
  last) and the reflection waits behind "Add a reflection"; Skip moves on at once.
  Advancing is always a tap, never a timer (WCAG 2.2.1), and a milestone shows on
  the card that earned it. Ends on "All caught up" with what the run came to, in
  counts against the user's own numbers ("3 answered. 2 happened. You expected about
  2."; skips counted apart as "can't tell"), and Today's streak row beneath it, since
  a run of three is usually the one that makes the day count (roadmap step 65).

### 7.11 Prediction rows and the Today list

- **Rows, not cards** (D33): a list's predictions share one grouped `surface`
  (radius `md` on the outer corners only, hairlines between rows), via
  `PredictionCard`'s `position` (`rowPosition(index, count)`), not one card per
  prediction.
- **Layout:** the title (`body`, up to 3 lines, 6 above a 1.15 text scale); under it the category symbol and
  "Health, due Fri 3 Oct" (`footnote`, `textSecondary`); then the status ("Happened",
  "Ready to answer") in semibold ink with its glyph, when there is one to say. On the
  right, the stated confidence in its own column: "70%" in `headline` (tabular) over a
  44pt 0–100 scale, an `emphasis` track with an ink tick where the number sits, so a
  list reads at a glance for where its calls sit, as the chart does. No ALL-CAPS, no
  hue on the confidence, no dot between the parts. The date holds together with
  no-break spaces (roadmap step 52).
- **Section headers** (`SectionHeader`): the title in `headline` ink and the count at
  the right edge in tabular `subhead`, never "Title · N". Under a "Ready to answer"
  header the rows don't repeat it (`showReady={false}`); the row's accessible sentence
  still says it.
- **Due and past-due are neutral.** A prediction coming due is not a lapse. Group the
  Today list by date ("Ready to answer", "Next 7 days", "Later"; roadmap step 67) and
  let the group header carry the state. No amber, no "Overdue" label, no warning colour.
- **Order** (D22, step 115): the score or its progress; then, when anything is
  ready, "Ready to answer" with **Answer all N**; then the daily rows, the streak
  row and today's practice 8 apart as a pair, and the backup card after them (D68,
  step 196; it sat between the two); then "Next 7 days" and "Later". The pair's 8
  needs both rows: either alone keeps 16 to what follows, and the block keeps 16
  above and below. The streak row is drawn above the rows after it, so a
  checkpoint's confetti falls over the practice row (step 194). With nothing
  ready the open predictions still come first and the daily rows follow "Later"
  (D48, step 159): at 320 × 568 the score, streak and practice rows filled the
  screen and a card just saved couldn't be seen; with nothing open they follow the
  empty state. The reminder card ("Want a reminder when it's due?") stays right
  under the score either way, beside what it's about: on Day 0 it's the ask that
  brings someone back for the first answer (D19; owner, 2026-11-10).
- **After a save** (D48, step 159): on the focus after Log's sheet closes, Today
  (on a save that reached a streak checkpoint, the streak row instead of the new card,
  by the same rules, and the row plays the moment there: step 194)
  scrolls to the new card only when the whole card isn't already on screen, and
  only as far as needed: its bottom 16pt above the list's bottom edge, or 16pt
  below the top when it's above what's shown or taller than the screen, so its
  title shows (owner, 2026-11-10, both: on Day 0 a scroll to the top pushed "Your
  first answer: tomorrow evening" and the reminder ask off a small phone). It
  waits for the list's reports of what's on screen to settle (120 ms quiet, 600 ms
  at most). Without animation under Reduce Motion. Log's save marks the card
  (`justSavedId`); every other tab drops the mark as it regains focus (the tab
  layout's `screenListeners`), so a save made over Insights, History or You never
  moves Today later, and a sync pull never sets it. VoiceOver already hears
  "Saved.".
- Resolved (History): outcome as neutral ink glyph + word ("Happened" / "Didn't"), never
  ✓/✗ characters or green/red. Skipped reads "Can't tell, not scored".
- Tapping a ready card opens Resolve (§7.10); tapping one that isn't due yet opens
  its details (§7.23). Keep the single-sentence `accessibilityLabel`.
- **History holds open predictions too** (D26, 2026-10-10): an "Open" section, count at the right,
  above the resolved list, in due order, the same cards as Today's, so nothing logged
  is ever missing from History. The category filters apply to both; a confidence
  range (step 51) applies to the resolved list only, since open ones have no outcome.
  The summary line ("145 answered, 93 happened") still counts the resolved ones.
- **"Can't tell", counted** (D34, step 139): a quiet line on Insights, under "More about
  your record" (D62) from the first answer (D59), says how many answers the rating
  leaves out: "2 answers are Can't tell, so they aren't scored.", or "No answers are
  Can't tell."
- **Back it up** (D31, 2026-10-10): on Today, once the oldest prediction on the phone
  is 30 days old and nobody is signed in, a quiet sunken card under the daily rows
  (after the practice row since step 196):
  "Your predictions live only on this phone" over "Sign in to keep them if it's lost
  or replaced.", with a secondary **Sign in** (opens Account) and **Not now** (30
  days' quiet). Never before 30 days, never once signed in.
- **History by range** (roadmap step 51): opened from an Insights coverage chip, History
  shows a selected-style chip "You said 80–100% ×" above the category filters; the
  two combine, × clears the range, and leaving the tab drops it. The summary line's
  "57 answered, 38 happened" then matches the chart's subtitle. The range edges come
  from the engine through `statsStore.confidenceRangeLow`. A new range or category
  opens the list at its newest (roadmap step 76).
- **Reflection** (roadmap step 31): on a resolved card, a saved reflection shows under
  the title, quoted, in `footnote` italic `textSecondary`, at most four lines, and
  joins the card's accessible sentence ("Your note: …").

### 7.12 Log form

Completable in under 15 s (`CLAUDE.md`). Order: title → category → confidence (§7.3) →
due date → Save. (Category comes before confidence, as built: the track record under
the control reads the chosen category.)

- **Title:** one line that wraps and grows as it fills (step 138; a one-line field
  scrolled a long prediction out of view while it was typed). Return is Done, never a
  line break, and a pasted break becomes a space. Edit's title field is the same.
- **Category:** the person's own list since D39 (step 144): the built-ins under their
  names, then the ones they added (a tag symbol, `tag.fill`), and none they hid unless
  it's the current choice.
- **Category chips:** SF Symbol + word; selected = `action` (ink) fill with an
  `onAction` label and symbol, plus the bolder weight (not colour alone; D33). The
  due-date chips, History's filters, Share's category toggles and the practice
  moments select the same way. **None chosen to start** (D29,
  2026-10-10), and Save waits for one as it waits for a confidence; a starter idea or
  "Log it again" chooses it. A preset Work filed an untouched gym prediction under
  Work. The track record line reads all categories until one is chosen.
- **Due date:** chips "Tomorrow", "In a week", "In a month" and **"Pick a date"**,
  which opens the native picker (`@react-native-community/datetimepicker`, §9). Under
  the chips, the resolved date as a sentence: "Due Friday, 3 Oct." One chip is chosen
  at a time (roadmap step 93): while the picker is open "Pick a date" is the choice,
  even before the date moves off a preset's. Whenever "Pick a date" is the choice its field shows, including
  when Edit opens on a prediction due on a picked date (step 138; Edit showed the chip
  chosen and no field until a second tap).
- **Starter ideas** (roadmap step 40): only before the first prediction ever, five
  quiet rows under the empty title field ("Not sure where to start? Try one, then
  make it yours:"), one per category with its icon. A tap fills title, category and
  the due date its words imply, never confidence. Since D18 (4), step 99, all five
  resolve by tomorrow evening ("I'll get outside for a walk tomorrow"), and the first
  prediction's due date starts on **Tomorrow**, so the first real answer lands on
  Day 1 at 19:00. Since D55 (step 168) every prediction starts on **Tomorrow**: "In
  a week" caught five of eight testers who meant tomorrow or a weekday (blind
  playtest 2026-11-10). A starter idea and "Log it again" bring their own date.
- **Track record** (roadmap step 19): one `footnote` line in `textSecondary` under
  the confidence control, "Of your 12 scored finance calls at 60–80%, 7 happened."
  The category's band from 10 scored, then all categories from 10, then all
  categories **from 5** with "Too few to read yet" ("Of your 9 scored calls at
  40–60%, 4 happened. Too few to read yet.", D57, step 170; it was the one line
  that moved testers' numbers, and it vanished below 10). Nothing below 5
  (`TRACK_RECORD_MIN_N`). Counts, never advice: it must not say what to pick.
  Free, because this is the core loop.
- **Its own record** (D32, step 135): when the typed title matches predictions
  already answered, one `footnote` line in `textSecondary` right under the title
  field, inside its spacing: "Answered 3 times before: happened 1 of 3." (one:
  "Answered once before: it happened." or "…it didn't happen."; two: "twice"). The
  same words once case, spaces, end punctuation and curly quotes are set aside, so
  "Log it again" always shows it. Outcomes only, never the earlier confidences,
  which would anchor the new number; skips and open ones don't count. From the
  first answer, since it's the person's own record, not a score. Free.
- **Coverage nudge:** a quiet inline card on `surfaceSunken` above the title field. Its
  accept button is secondary; Save is the only primary action on the screen. Keep the
  current copy and the "Not now" cooldown.
- **Save:** one primary capsule, disabled until the title is non-empty and a
  confidence is set (§7.3), `commit` motion. **Pinned** under the scrolling fields
  over a hairline (step 111), so it is always on screen; the keyboard may cover it,
  since Save also waits for a confidence and setting one means the keyboard is down.
  (Step 46.) A failed save says "Couldn't save that. Try again.", never the store's
  developer message. Once the form is started, a `footnote` line over Save says what
  it is waiting for, in the form's own words: "To save, add a category and a
  confidence." An empty form has none, and Edit's **Save changes** does the same
  (step 138; a greyed-out Save said nothing about why).
  **Its label names the date it will save** (D55, step 168): "Save, due tomorrow",
  "Save, due Sunday" (two to six days out), "Save, due Tue, Nov 17" (further, with
  the year when it isn't this one), the date's spaces no-break so a wrapped label
  breaks after "due"; VoiceOver hears "Save prediction, due Tuesday, November 17".
  The date is the store's (`dueDateSavedAt`, after its clamp to tomorrow) and
  follows the day turning over; `dueWords` words it. At 320 the chips sat under
  this bar, so the date was out of sight at the moment of saving. Edit's **Save
  changes** doesn't name one (out of scope).
- **A new form starts at the top** (roadmap step 75): after a save, and when "Log it
  again" fills it. The tab keeps its scroll offset otherwise, and on a short phone the
  next visit opened on an empty "—%" with the title field out of sight.

### 7.13 Coach cards

Sources: HIG Generative AI (updated 2026-06), Google PAIR Explainability + Trust.
Behaviour is governed by `COACH_AGENT.md`; this section is only its look.

- **Lead with the receipt.** Each card: the `evidence` number in `title2`, what
  it counts in `footnote` ("in your 80–100% range · 12 scored"), then the message
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
- **No support surface** (D73, the owner, 2026-11-20): the card that replaced Coach when
  words in a prediction or note matched a distress list, its helpline lines and its way
  back to Coach are removed, with the on-device scan behind them. The panel shows the
  Coach's cards, its empty line or nothing, for everyone alike.

### 7.14 Wrapped

- **Weekly** is built from what is true at small n, because a week almost never reaches
  20 resolutions and the verdict stays gated: (1) counts: "4 scored · 3 logged",
  and under the big count, **what happened against what the
  user's own numbers expected**: "6 happened. You expected about 4." (roadmap step
  48; the sum of stated confidences comes from the engine), not a hit rate, which
  rewards safe calls. Outcome first, since "about 4. 6 happened" read
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
  (§7.2, `chartTakeaway`): among the buckets with ≥ 10 scored, the largest gap that
  leans names direction and range ("You ran overconfident at 80–100%.";
  `headlineRange`, step 167), never a bigger gap inside luck. Averages only speak
  when no such bucket leans, because over- and underconfidence in different ranges
  cancel in the mean, and the card must never contradict Insights.
- **The closing note** (D23, 2026-10-10) is about range, not a band: with a call
  under 40% in the window, "2 calls under 40% this week. The unlikely end keeps your
  score honest."; without, "Nothing under 40% answered this week. Log something you
  think won't happen." ("this year" on the year card).
- Motion: `reveal` without confetti (§6.2), on the panel around the weekly card
  (never inside the card, which is captured to PNG), once a day per session, and
  only when the week has resolutions. The share button is disabled only when
  nothing resolved in the window, and then the card says what *will* be there.

### 7.15 Notifications

HIG Notifications: no sensitive content, a hidden-preview placeholder, no repeats for
the same thing, no instructions, title-style titles without ending punctuation.

| Notification | Title | Body | `previewPlaceholder` | `interruptionLevel` |
|---|---|---|---|---|
| Resolution reminder | Did it happen | `{title}` · You said 70% (with "Show the words in reminders" on, D60; off, the default: "Your prediction from Nov 6 · You said 70%") | A prediction is ready to resolve | `active` |
| Digest, open > 0 | Your week ahead | 3 predictions are coming due. | Weekly check-in | `passive` |
| Digest, open = 0 | Your week ahead | Nothing open. What do you think will happen this week? | Weekly check-in | `passive` |
| Trial ending (D16) | Your free trial ends Thursday | Plus then renews for a year at $34.99. | About your Plus trial | default |
| Practice (step 89) | One of five, changing daily: Today’s three · Three new questions · A quick three · Practice is ready · Today’s practice | That day's first question: "Which is farther north: Dublin or Moscow?" | Daily practice | default |

- The confidence goes in the reminder so that resolving from the notification still
  puts the stated number first (§7.10).
- **Never mention the streak** in a notification.
- **Permission in context** (roadmap step 38). Launch only checks; it never shows the
  iOS alert (HIG: "Avoid requesting permission at launch unless the data or resource
  is required for your app to function"). Once there is an open prediction, Today shows
  a quiet sunken card, "Want a reminder when it's due?", saying when the first one
  would come, with a secondary **Turn on reminders** (which shows the alert) and
  **Not now**. The first "Not now" holds the card until 06:00 the next morning, so a
  Day-0 refusal doesn't cost the first prediction's Day-1 reminder; from the second,
  a week (D19, step 108). You's Notifications group adds **Allow
  reminders** while iOS hasn't been asked and **Open Settings** after a refusal.
- One reminder per prediction; no follow-ups.
- **The practice reminder is asked for, never assumed** (step 89): off until a moment
  is picked under a finished practice or in You, one a day only while that day's
  practice isn't done, and scheduled no more than three days past the last visit, so
  it falls silent for someone who has stopped opening the app. Its wording changes
  every day, because a repeated reminder wears out (Yancey & Settles 2020).
- **Happened / Didn't** (roadmap D8, built as step 145): foreground actions on the
  reminder. Tapping one records that answer and opens the app on the resolved
  state (the acknowledgement, the range line, a milestone when this answer
  earned one). Tapping the notification itself still opens the question.
  "Can't tell" stays in the app. Background actions are not used: on iOS an
  action that doesn't open the app is not guaranteed to reach JS when the app
  is killed (expo#36282).
- **Evening** (roadmap D9, built as step 60): the reminder fires at 19:00 local on the
  due day (`REMINDER_HOUR`), or at the time picked in You (D38); due dates are stored at noon, which asked about Friday's
  outcome before Friday was over. Each reminder records its time, and the launch
  reconcile replaces one set for another time.

### 7.16 Trends (Plus)

The long view, in plain rows: label left in `textPrimary`, value right in
`textSecondary`, section titles as `eyebrow` in sentence case. Every row carries its
own n, and a row below its threshold shows counts, never a score.

- **What your confidence means** (roadmap step 20): the personal correction table.
  One row per category and band with ≥ 10 resolved (`MIN_N_BAND`), the ones that lean
  first and then by gap (step 167), at most five: "Finance at 80–100% · 47% · 8 of
  17". The largest gap that leans leads as a sentence ("In finance, your 80–100% has
  come true 47% of the time."); with none leaning, no lead.
  With no qualifying band, one line names the closest one and its count instead.
- **By how far ahead** (roadmap step 21): rows for *Next day or sooner* (0–1 local
  days from logging to due), *Within a week* (2–7), *Within a month* (8–31) and
  *Further out*; empty horizons are left out. Score and direction from 20 resolved
  (`MIN_N_CATEGORY`), "N scored answers · too few for a score" below it, like a category.
- Labels that contain numbers or small words don't use `textTransform:
  'capitalize'` (it produced "Range You Use"); capitalise the string instead.

### 7.17 How scoring works

A full-height reading sheet (roadmap step 29), opened by "How is this scored?" under
the Insights rating, by Today's rating (D59) and by a row in You; never shown unasked, since the pitch is
identity, not statistics. Sections in `headline` with `body` text in
`textSecondary`: what the score measures, how it's worked out (the five bands and
their edges, that bigger bands count for more, one worked example from `CLAUDE.md`),
the Brier score in one paragraph (D24: what it adds, that lower is better, and since
D35 the yardstick of saying your own base rate every time), why it waits, badges (a legend of the five emblems with their
criteria), the whole range (log unlikely things too), your streak, what doesn't count (skips, the Warmup and, since step 95, the
daily practice). The chance-bar sentence says what it is: a perfectly calibrated
forecaster's dot lands inside it 8 times in 10, and the app calls a lean only for a
dot outside it (D35). Opened with `?section=badges` (from Today's identity line, D27) it
scrolls to Badges.
Every number in the copy comes from the shared constants or `BADGE_META`, and a test
holds it to the engine. A number that starts a sentence is spelled out ("Three a day
is the daily goal").

### 7.18 Warmup verdict

The Day-0 result (`WarmupVerdictScreen`), rebuilt by D18 (steps 97–101) and refined
on 2026-10-09 (104–107). Day 0 is for calibration, so the result describes *these
ten*, never the person. In order: eyebrow "Your warm-up"; the read in `title1` ("On
these ten, you were overconfident" / "…underconfident" / "On these ten, no clear
lean"); the counts ("You said 78% on average. 6 of 10 were right."); the line of
advice under them (since D59; "Your numbers expected about 8 right, and you got 9…");
the bridge ("Trivia is the warm-up. People are most overconfident about their own
plans: students who expected to finish a big school project in 34 days took 56. Make
your first one about tomorrow."); **Make a real prediction** and **Share my result**,
on the first screen even at 320 × 568 (step 118); then the mini chart, one
note ("This is a warm-up, not your calibration rating. That one needs 20 of your own
predictions.") and the answer key. The quiz before it pins **Next** under the
scrolling question, with **Skip for now** as a text button (step 117). It opens at its top (step 72).

- **A lean only beyond luck** (step 104). Ten answers move accuracy in steps of 10
  points, and the ±5 rule used elsewhere called a lean on 47–73% of perfectly
  calibrated people. The engine names one only outside the central 80% of
  `chanceRange` at n and the mean confidence (`WARMUP_LEAN_MASS`); since D35 that is
  the one rule everywhere, and the chart's grey bars draw the same 80%.
  Inside it the advice says what did happen, plainly (D36, worded by D61): "Your
  numbers expected about 8 right, and you got 9. On ten answers luck often moves it
  that far, so it can't tell yet whether you run too sure, too cautious or about
  right. Your own predictions are the real test." ("Ten answers can't tell a small
  lean from luck" alone read as "so… was I good?" at 9 of 10.)
  (`research/day0-2026-10.md` §2.)
- **"It isn't about being right"** (D36, step 141): under the two buttons, before the
  chart, the How scoring works line "It isn't about being right. A 60% call that
  doesn't happen isn't a mistake: about 4 in 10 of them shouldn't happen."
- **No 0–100 number** (D20, step 105). Ten answers can't carry one; the counts lead
  and the chart shows them.
- **Which ten** (steps 97, 102, 106). Drawn from the practice tables, the same ten
  for everyone, right answers five first and five second. Five come from inside the
  practice's closeness band and five from the whole class: the band alone tilts
  toward overconfidence (the hard–easy effect), and the whole class alone was eight
  giveaways in ten.
- **The answer key says it in words** (roadmap step 71): per question, the prompt in
  `subhead` secondary, then the right answer in semibold ink and the user's side of it
  ("· You got it", or "· You picked “The Atlantic”"), the fact, and the stated
  confidence at the right. The mark is the Resolve glyph pair in ink
  (`checkmark.circle.fill` / `xmark.circle`), not ✓/✗ text, and each row is one stop
  for VoiceOver.
- **One number everywhere** (roadmap step 49): when all answers share a confidence,
  the counts say it ("You said 75% on all 10. 5 of 10 were right.") and a second
  line notes that one number for the known and the guessed leaves part of the skill
  unused. Not shown when every answer was right, or under three answers.

---

### 7.19 Launch

The native splash (ink `#15171B`, dark `#0E0F12`, `app.json`) stays up until the first real screen is
decided, then fades out over 250 ms (roadmap step 59): the database is open, the
stores are loaded, and a first run has been sent to the Warmup, so a cold start never
cuts to a spinner or shows Today before the Warmup. It never holds longer than 4 s
(`SPLASH_MAX_MS`).

**The launch page** (D66, 2026-11-16, the owner's request on the first TestFlight build:
the splash cut straight to the Warm-up's first question). One page, `LaunchPage`: the
splash's ink in both appearances (`#15171B`, dark `#0E0F12`), the mark where the native
splash draws it (200 pt wide, centred on the screen), and the app's name under it in
`title1`. What sits on the ink uses the dark palette's values in both appearances, as a
share card keeps its own. It is used three times, so the three read as one:
- **At launch** (`LaunchScreen`): the native splash fades to the same picture, so nothing
  moves; the name fades in (350 ms), the page holds 1.1 s from the moment the app is ready,
  then fades to the first screen (300 ms). Once per cold start, never on a return from the
  background. Under Reduce Motion nothing fades: the name is there and the page is cut.
  Hidden from VoiceOver, which starts on the screen underneath.
- **The app lock and its cover** (§7.25).
- **Before the database opens:** the mark alone, which is what the web build shows first.

### 7.20 Choosing an element

What to reach for, from 18 apps rated 4.7+ and the HIG (`research/elements-2026-10.md`
§3). Pick the first row that fits; a custom control needs a reason the platform's
doesn't serve.

| You need | Use | Not | Why |
|---|---|---|---|
| Move between the app's sections | A tab bar of 3–5 single-word, labelled tabs | An action as a tab, a hidden menu | HIG Tab bars: "navigation, not… actions". Visible navigation was used by 89% vs 44% hidden (NN/g). Log as a tab is D3. |
| Start a new entry | A tinted "+" (in or beside the tab bar, or in the header), opening a sheet | An ordinary tab; a floating button over scrolling content | None of the nine top apps that show it uses a tab. `LogButton`, in the header since D21: floating, it covered buttons, cards and the chart. |
| One of 2–5 closely related views | A segmented control, text only | Mixing icons and words; a segmented control for whole sections | HIG Segmented controls. Share's Card · This week · This year. |
| Filter a list | Horizontally scrolling pills, "All" first | A dropdown | Day One, Flighty, Bevel; History. |
| One of a few named options in a form | Chips with symbol + word, selected state not colour alone | A picker wheel | Log's category and due-date chips. |
| A number on a long scale | Slider + ±5 stepper, the value large | A slider alone; buttons for 21 values | HIG Sliders: "supplement… with a stepper". §7.3. |
| A number on a short scale (≤ 6) | One-tap buttons | A slider | Daylio and stoic.'s five faces; Hedge's 50 · 60 · 70 · 80 · 90 · 99. |
| An on/off setting with immediate effect | A switch on a list row | A capsule button | §7.21. |
| Go deeper from a row | The whole row, with a chevron and the current value | A button inside the row | HIG Lists: "use a disclosure indicator". §7.21. |
| Close a sheet or modal | The round × (`CloseButton`) at the top | The word "Close"; a grabber alone | HIG Toolbars; NN/g bottom sheets. §7.7. |
| The one thing to do on a screen | One filled capsule | Two filled capsules | HIG Buttons: "one or two prominent buttons per view". |
| A minor alternative to the main action (Change answer, Can't tell, Restore purchases) | A text button, `actionText` subhead, 44pt target | An outlined capsule beside the primary | Step 78. |
| Confirm something irreversible | A screen that says what goes, an outlined capsule with a `destructive` label, Cancel beneath | A filled red primary | HIG Buttons: never give a destructive action the primary role. Step 81. |
| Explain a number | A text link beside it ("How is this scored?") opening a reading sheet | A tooltip, a long-press | WHOOP, Oura and Bevel put an ⓘ in the header of each score's screen; Fairly Sure's link does the same job with a word. |
| Ask for a rating | The system prompt after a finished run, never in the Warmup | A custom "Enjoying Fairly Sure?" pre-prompt; a button | HIG Ratings and reviews. D15, built: `src/review/ratingPrompt.ts`. |

### 7.21 You: settings as a grouped list (built as roadmap step 80)

The You tab is a grouped inset list, as iOS Settings, Streaks and Todoist are: one
`surface` card per group on the canvas, `radius.md`, rows divided by hairlines.

- **Groups, top to bottom** (`SettingsView`): *Account*, on a build with accounts ("Sign
  in ›" with "Not signed in. Your predictions live only on this phone." as the footer;
  signed in, an `actionText` "Sign out" row over "Signed in as … Your predictions are
  backed up. Signing out removes them from this phone, and signing back in brings them
  back. Categories you added or changed live only on this phone, so signing out removes
  them."; D69 (a)) · *Your card ›* and *Fairly Sure Plus ›* (`PLUS_NAME`; "Active" as its
  value when it is), with Plus's one line as the footer · *Categories ›* (below) ·
  three switches: **Streak and daily goal** (D59, on by default), **Hide the words**
  (D61, off) and the app lock, "Lock with Face ID" or as the phone has it (D64, §7.25)
  · *Notifications* (the main switch; under it, while it's on, **Due-day reminders**
  and **Weekly digest** switches, D31, each with its time under it while on (D38, step
  143: "Reminder time" beside the native compact time picker; the digest's seven day
  chips, Sun to Sat, and "Digest time"), and each switch's line says when ("On the day
  each prediction comes due, at 7:00 PM.", "How many are open, never their words,
  Sunday at 6:00 PM."); under the reminders' time, **Show the words in reminders** (D60,
  off by default); the "Allow reminders" / "Open Settings" row while iOS says no; the
  practice reminder) · **AI Refine** (hidden while `REFINE_ENABLED` is false), *Coach
  (AI)* and *Usage stats* (switches, the whole group gone under the under-13 rule, below;
  without Plus, Coach's line starts "Plus only.",
  and once it's on, "On for when you have Plus. Nothing is sent before then.", step
  138, since on it did nothing a free user could see) · *Your data* (**Export
  predictions (CSV)**, free since D31, a row that acts in place: no chevron, and the
  export symbol `square.and.arrow.up` at its end, since its ink label alone no longer
  marks it as tappable, step 137) · *About* (How scoring works ›, Privacy policy ›,
  Terms of use ›, Help and support ›, with the app's name and version as the footer) ·
  *Erase your data on this phone* (a guest) or *Delete account* (signed in), alone at
  the bottom in `destructive`, no chevron. Under the under-13 rule the Account group and
  the Plus row change (below); the rest of the list is as usual.
- **Rows:** the whole row is the target; a row that opens something ends in a chevron
  and, where there is one, its current value in `textSecondary`; a row that acts in
  place (Sign out, Erase) has no chevron and says so in its label's colour. An on/off
  row ends in a switch and is one `switch` element for VoiceOver (step 41, unchanged),
  its explanation under the label.
- **No capsule buttons inside rows:** beside a row's label, only the capsule responded
  (step 80).
- HIG: "Minimize the number of settings you offer." Nothing moves to You that
  belongs to a task (the share card's theme stays on Share).
- **Categories** (D39, step 144): its own group under Plus, "Categories ›" with the
  footer "Rename, add, hide or give an icon to the categories you log under." It opens a
  full-height sheet: a short line, then one card of rows, each the category's symbol,
  its name and "Rename" (a tap edits it in place, **Save** and Cancel) and a switch
  that offers it when logging. Under it "Add a category" with a field and a secondary
  **Add**, which waits for a free name ("Another category already has that name.").
  Predictions in an added category sync like any other, with only its id. Nothing is
  deleted here; hiding keeps the predictions and the record. The last category
  offered can't be switched off (logging needs one), and a built-in's own word
  stays free for it while it's renamed.
- **The usage line and its switch** (`UsageStatsSwitch`, shared by the Warm-up's first
  screen, D69 (b), and the sign-in screen, D71 (d), so the two can't drift): the line on
  the leading side and the iOS switch at the trailing edge, set on the line's first line,
  not centred on the block. One `switch` element for VoiceOver, "Usage stats", its state
  and the line shown; the inner switch hidden from it. The line is `footnote` on the
  Warm-up and `subhead` on the sign-in screen, in `textSecondary`. Where the line differs by
  state (the sign-in screen's on and off lines), the longer one always holds the height,
  drawn invisible under the shorter, so flipping the switch moves nothing below it. It is
  the same setting as You's Usage stats row.
- **Under the under-13 rule** (D70, 2026-11-19): the *Account* group of a guest is one
  static row, "Kept on this phone", in the rows' label style, with no chevron and nothing
  to tap, and a two-paragraph footer: "Because of the age range this iPhone shares with Fairly
  Sure, everything you log stays on this phone. Accounts, backup, usage counts, Coach and
  Plus are off. Your predictions, score, badges and cards work as usual, and Export
  predictions keeps a copy." and "The age range comes from this iPhone's Apple Account. To
  see it, open Settings, tap your name, then Personal Information, then Age Range for
  Apps." (the path in words, as Delete account gives Sign in with Apple's: no arrows in
  app text; the D70/D71 review). An account
  signed in before keeps its Sign out row, its footer "Signed in as …" followed by "Backup
  is off on this phone because of the age range it shares with Fairly Sure, so new changes
  stay here. What was backed up before stays on our server until you delete the account.
  Signing out removes your predictions from this phone, so export them first if you want a
  copy." The *Fairly Sure Plus* row and its footer go (Your card stays, with no footer),
  and so does the whole Coach (AI) and Usage stats group. Never an age in the words: only
  "the age range" (`src/components/age/localOnlyCopy.ts`, held to that by its test).
- **The local-only page** (`LocalOnlyPage`, D70): what the paywall and account routes show
  under the rule instead of their own views, since a deep link reaches both. Laid out as
  the account screen is: the round × at the top right, then on the canvas a `title2`
  title, one `subhead` `textSecondary` paragraph and one filled capsule, **Close**. Nothing
  on it offers a purchase or a sign-in. The paywall's: "Plus isn't offered on this phone" /
  "Because of the age range this iPhone shares with Fairly Sure, purchases are off here.
  Your score, chart, badges and cards are free." The account route's, for a guest: "No
  account on this phone" / "Because of the age range this iPhone shares with Fairly Sure,
  your predictions stay on this phone. To keep a copy, use Export predictions in You." For
  an account signed in before the rule came on, which only a deep link brings there:
  "Backup is off on this phone" with You's frozen footer as the body, word for word (the
  D70/D71 review: "No account on this phone" would be untrue of it).
- **Erase** (D71 (a)): the guest's confirmation screen says what goes, "everything Fairly
  Sure keeps on this phone, including anything left by an account that was signed in here
  before", then names it, and what stays: "Settings, like reminder times, and whether this
  phone has Fairly Sure Plus stay." The alert reads "Erase everything on this phone?" /
  "Nothing here has another copy unless an account backed it up. This can't be undone."
  When accounts signed in here before left changes that never reached the server, the
  alert counts them at the tap, between those two sentences: "3 changes an account made on
  this phone never reached our server and will be lost." ("1 change an account made…" for
  one; the D70/D71 review). While the count is read the **Erase everything** button is
  disabled, keeping its label (not "Erasing…": nothing is erased until the question is
  answered), and the read gives up after 3 seconds. A count that can't be read has its own
  sentence in that place, so the alert has three messages in all (the re-review's round
  two): "Changes an account made on this phone may not have reached our server; if so,
  they will be lost." If Erase can't finish a step, the screen shows "Couldn't finish
  erasing your data. Try again.", as before, and now also when a cleanup write failed
  silently.
- **Practice reminder** (step 89): a stacked row in the Notifications group, its
  label and one line over five chips (Off, With coffee, At lunch, After dinner, each
  with its time, and **Pick a time**, D31, which opens the time picker; once a time
  is picked the chip reads "Your time" over it, as the moments read, step 138), two
  to a row. With Notifications off the choice is
  kept and the line says nothing is sent.

### 7.22 Daily practice (built as roadmap steps 88–89)

Three two-choice questions a day, the same for everyone on the same day, kept apart
from everything real (`CLAUDE.md`, Daily practice).

- **On Today:** one row under the streak, the streak row's shape: a target symbol,
  "Today’s practice" over "3 questions, about 30 seconds", and **Start** in `actionText` with
  a chevron; "1 of 3 answered" and **Continue** partway; done, a check, "Practice
  done" over "2 of 3 right. New ones tomorrow", and the chevron alone. The whole row
  opens the sheet. Not shown before the first prediction: on Day 0 the Warmup has
  just asked ten questions, and the next thing is the first real one.
- **The sheet:** full height like Log, title and the round ×. The Warmup's question
  form (segments: answered in `action`, the current one in `controlBorder`, those to
  come in `hairline`, step 137; `title2` prompt, `ChoiceList`, the confidence control from 50%,
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


### 7.23 An open prediction (D25, 2026-10-10)

Tapping a prediction that isn't due yet, on Today or in History, opens a medium-detent
sheet with the round ×:

- **What you said, first:** "On Oct 4 you said **70%**", the category, the title in
  `title2`, then "Due Fri, Oct 16 · reminder that evening" (or "· reminders off"; on
  the web build, which sends nothing, the date alone).
- **Edit** (secondary capsule): the title, category and due date in place, with the
  Log form's fields and chips; **Save changes** as the one primary while editing,
  waiting for a non-empty title. The confidence is shown, never editable: it is the
  record (changing it is FUTURE_UI A7 and needs a scoring rule). A changed due date
  moves the reminder.
- **Delete** (text button in `destructive`): a confirmation sheet, "Delete this
  prediction? It won't count anywhere, and it can't be undone." with **Delete** as an
  outlined destructive capsule and **Cancel** beneath (§7.20). Synced as a deletion.
  When Insights will count the delete (`deleteIsCounted`; security review round 7), the
  sheet says why instead: "Delete this prediction? You logged it before today, so
  Insights will count it as deleted. This can’t be undone." on any day after the day it
  was logged (new words don't move that day), and "Delete this prediction? It’s due, so
  Insights will count it as deleted. This can’t be undone." on the day it was logged once
  it is already due (`canRenumber` tells the two apart, on one clock).
- **Answer it now** (text button, `actionText`): opens Resolve after one line, "It's due
  Fri, Oct 16. Answering early is fine; just answer what you know now." with
  **Answer now** and **Not yet**. Early answers count like any other. **On the day it
  was logged** the line says the rule once, with what to do (D56, step 169): "It's due
  Wed, Nov 11. You logged it today, so an answer today isn't scored. From tomorrow it
  is. For something you do every day, log the next one the evening before." ("You
  changed its words today, …" after a rewording, without the advice).
- A prediction that's due skips this sheet and opens Resolve, as before: the evening
  run stays two taps.
- **Once it's due anyway** (step 133): an edit can move the date to today, and a link
  can open a due one here. Then the date reads "Due today" (a past day promises no
  reminder) and **Answer it now** opens Resolve without the early line.
- **An answered one** (D34, step 139): a Yes or No in History opens the same sheet with
  what you said, the category, the title, and the outcome as glyph and words ("It
  didn't happen, answered Sun, Nov 1"), with the reflection if there is one. For a day
  after the answer: "Until 6:00 PM tomorrow you can change the answer, move it to
  another category or delete it. After that it's part of your record.", then **Change
  to: it happened** (secondary capsule), the category chips (a tap moves it), and
  **Delete** with the usual confirmation. After the day, one line instead: "Answers
  can be changed for a day after they're given. This one is part of your record now."
  At any time, under the outcome, **Log it again, due tomorrow** (secondary capsule,
  12 pt below the outcome; D56, step 169), or "Logged again, due Wed, Nov 11." while
  the same words are open (`openRepeatOf`; "Logged again, ready to answer." once its
  day has come), so one source doesn't stack. Resolve does the same after an answer.
  Never "Can't tell" here. A skip still opens Resolve (step 39).

### 7.24 Category icons (D40, 2026-11-03)

On You → Categories, each row starts with its icon in a 44 pt square button
(`hairline` border, `radius.sm`); tapping it opens the icon editor under that row,
for a built-in as much as for an added category. Tapping it again, or Done, closes it.

- **Heading:** the current icon at 28 pt and "Icon for Health" (`headline`).
- **Suggested emoji:** 24 in a wrapping grid of 44 pt cells (`SUGGESTED_CATEGORY_EMOJI`),
  a radio group; the chosen one has a 2 pt `action` border. A tap saves at once.
- **Or any emoji:** a field ("Type or paste one") and a secondary **Use**, enabled
  only for exactly one emoji; otherwise a footnote says why ("Use just one emoji.",
  "Use an emoji, not a letter.").
- **Choose a picture** (secondary; "Choose another picture" once one is set): the
  photo library with the system's square crop, then shrunk to 120 px. The web picker
  has no crop step, so the centre square is taken. A failed pick says "That picture
  couldn't be used. Try another." and keeps the icon. Footnote: "Pictures stay on
  this phone. Share cards keep their own look."
- **Use the default** (text button, only when an icon is set) and **Done**, right-aligned.
- **Rendering** (`CategoryIcon`): an emoji at the icon size (85% until the
  2026-11-03 playtest found it smaller than the symbols beside it), a picture at
  the icon size with corners of a quarter of it, both in their own colours and hidden
  from VoiceOver like every icon here (the word beside it says what it is).
- **Not on share cards or Wrapped** (owner's call, 2026-11-03): the exported card
  keeps its fixed design, so a photo never leaves the phone by accident. Neither the
  cards nor Share's own controls draw category icons.

---

### 7.25 The app lock (D64, 2026-11-15; built as roadmap step 180)

- **The switch** is one more row in You's group with "Streak and daily goal" and "Hide the
  words" (§7.21), named for what the phone has in use: "Lock with Face ID", "Lock with Touch
  ID" or "Lock with iPhone passcode". It never names a method the phone lacks or isn't using,
  and it is hidden on a build that can't lock. Its line ends by saying reminders aren't covered.
- **The lock screen and the cover** are the launch page (§7.19, D66): the mark and the app's name, and when locked a line and an
  **Unlock** button under them, in the page's fixed colours (the app's own primary is ink in
  the light appearance and would vanish on it). The cover (the app not in front while the
  lock is on) is the mark and the name alone. No Face ID glyph: Apple's symbol isn't drawn by
  the app, and iOS's own prompt carries it.
- **It sits in front of every screen and sheet** on the iPhone (`FullWindowOverlay`: a view in
  the app's window, kept in front of whatever is presented after it), with VoiceOver kept
  inside it. The keyboard and a system alert have windows of their own and can sit above it;
  the keyboard is dismissed while it is up. No motion in or out: a lock that fades shows
  what's behind it.
- **It scrolls**, padded by the safe area, and only the name is capped (`DISPLAY_MAX_SCALE`):
  at the largest text sizes the lines and the button are taller than the screen, and the
  button is the way in.
- **It opens on a tap** (D74, the owner, 2026-11-21): the phone's check starts only when
  Unlock is tapped, at launch and on coming back alike. Until then it started by itself
  the moment the app was in front, which he found too sudden when switching back.
- **"Lock after"** (D75, the owner, 2026-11-23) sits under the switch while the lock is on
  and the phone can lock: the practice reminder's stacked row (label, one line, chips two
  to a row, a radio group; `OptionChip`), "Immediately", "1 minute", "5 minutes" (the
  default), "15 minutes", the number and its unit kept together. Its line: "It locks every
  time you leave it." or "Come back within 5 minutes and it opens without asking." The
  switch's first sentence follows it: "Locks Fairly Sure each time it opens or comes back
  to the front…" at Immediately, else "Locks Fairly Sure once you’ve been away from it for
  more than 5 minutes, and covers it in the app switcher." The cover in the app switcher is
  the same at every choice.
- **Words:** "Locked. Unlock with Face ID or your iPhone passcode to see your predictions."
  A closed prompt says nothing more; a failed check adds "That didn’t unlock it. Try again.",
  spoken as well as shown.

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
- [ ] Every section title is a heading (`accessibilityRole="header"`), so the
      VoiceOver rotor can jump between them; not inside an element that is already
      one grouped `accessible` view, which would swallow it. A chip row is a named
      `radiogroup`. Step 134.
- [ ] A value says so on web too: `adjustableProps` sets `aria-valuenow/min/max/text`
      beside `accessibilityValue`, which react-native-web drops. Step 134.
- [ ] A chosen chip, option, tab or toggle says so on web as well as iOS: spread
      `chosenProps(kind, chosen)` instead of writing `accessibilityState`, which
      react-native-web drops (radio and checkbox → `aria-checked`, tab →
      `aria-selected`, toggle button → `aria-pressed`). Step 96.
- [ ] Phrases that read as one hold together at 320pt: ranges through `holdRanges`,
      counts and labels with no-break spaces ("Goal: 2 of 3", "30 days"), and
      "Next milestone" on a line of its own. Steps 70, 74, 95 and 138.
- [ ] Reduce Motion: `reduced` variant renders; haptics still fire.
- [ ] Reduce Transparency and both ends of the iOS 27 glass slider (ultraclear ↔
      tinted): anything floating on glass stays legible.
- [ ] Tap targets ≥ 44×44 pt.

---

## 9. Libraries

Pinned for **Expo SDK 55 / RN 0.83.10** (verified in
`node_modules/expo/bundledNativeModules.json`). Always `npx expo install <pkg>`.

| Need | Use | SDK 55 pin | Notes |
|---|---|---|---|
| Styling | `StyleSheet` + `src/constants/theme.ts` | — | Zero deps; migrate file by file. |
| Motion | `react-native-reanimated` + `react-native-worklets` | 4.2.1 / 0.7.4 | Jest: `setupFilesAfterEnv` with `require('react-native-reanimated').setUpTests()` and `jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))`. |
| Hero moments (optional) | `lottie-react-native` | 7.3.x | 7.4+ needs RN ≥ 0.84. Needs designer JSON. |
| Charts | existing `react-native-svg` | 15.15.3 | Animate via Reanimated. |
| Share export | existing `react-native-view-shot` | 4.0.3 | Stay pinned until the SDK moves. |
| Icons | `expo-symbols` | ~55.0.9 | Ionicons as fallback. |
| Category pictures (D40) | `expo-image-picker` + `expo-image-manipulator` | ~55.0.24 / ~55.0.21 | Library only (camera and microphone permissions off in `app.json`); square crop, 120 px PNG. Both work on web. |
| Haptics | `expo-haptics` | ~55.0.18 | Web: no-op, harmless. |
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

**SDK upgrade note:** the plan is to go from 55 straight to **58** (roadmap D5),
skipping 56 and early 57 (Hermes V1 + worklets memory regression there). SDK 56 breaks
`@react-navigation/*` imports (codemod exists). SDK 58 stabilises NativeTabs.

---

## 10. The web build

The web export is used for automated screenshots and verification, so every screen and
share card must **render** on web. It is not a faithful preview of iOS: SF Symbols fall
back to Ionicons/Material, there is no glass or haptics, and share-card *export* is
native-only. Judge type and materials on the iPhone (there is no simulator).
