> **Raw research, 2026-09-25.** Kept for its sources and reasoning. The decisions drawn
> from it live in [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) and
> [`../UI_ROADMAP.md`](../UI_ROADMAP.md); where they differ, those files win. References to
> `design-baseline/0N-*.png` mean [`../baseline/`](../baseline/) (web-build captures).

# Calibrate: visual language and interaction research

Research date: 2026-09-25. Scope: iOS-first React Native (Expo SDK 55, expo-router 55, RN 0.83). Research only, no repo changes.

Baseline reviewed: `design-baseline/01-warmup.png` … `08-paywall.png`, plus `src/components/**`, `src/constants/badges.ts`, `src/constants/cardThemes.ts`, `app/(tabs)/_layout.tsx`, `app.json`.

> Note on the baseline: the screenshots look like captures of the web build (the tab bar, Windows-style system font and Ionicons render as they would in a browser). Some issues below (font, tab bar material) partly come from that. The token, contrast, layout and copy issues apply on native too.

---

## 0. What the baseline shows (the problems this document solves)

| Screenshot | What's there now | Core problem |
|---|---|---|
| 01-warmup | A blank white screen with a blue spinner | The first thing a new user sees is a loading state, with no brand or promise. HIG: onboarding should be "fast, fun"; splash only "just long enough" ([Onboarding HIG](https://developer.apple.com/design/human-interface-guidelines/onboarding)). |
| 02-verdict | Big blue "73", a square scatter with two overlapping blue dots, axis labels in gray-400, a caveat box | The warm-up number looks like a real rating, which the caveat then contradicts. The chart has no annotation, and the dots don't show which side of the line they're on. Axis text `#9ca3af` on white is **2.54:1 (fails AA)**. |
| 03-log | Text field, lowercase category chips, confidence as **−5 / +5 steppers**, green "Integrity bonus" line, due-date chips, blue CTA | Confidence is the product's central input, but here it's two small buttons. The integrity green `#16a34a` on the `#F2F2F2` canvas is **2.94:1 (fails)**. "Log" is a *tab*, but HIG says tab bars are "to support navigation, not to provide actions" ([Tab bars HIG](https://developer.apple.com/design/human-interface-guidelines/tab-bars)). |
| 04-home | Giant blue "20" and "resolutions until your rating unlocks", then four identical cards showing "65%" and "Pending" | The progress count sits in the hero-score slot in hero-score styling, so "20" reads like a score of 20/100. Every card repeats the same metadata. |
| 05-stats | Another giant "20", italic gray placeholder for the curve, 4 rows of 🎲 Guesser emoji chips, two gray "See Plus" slabs | The screen is almost all empty state. Emoji badges look childish and render differently on each platform. The Plus upsell appears twice and looks like a disabled button. |
| 06-history | Lowercase filter chips, then italic "No resolved predictions yet." | Empty-state text at ~2.3:1 contrast, and no path forward. |
| 07-share | "Your card" with a segmented control, "Nothing to share yet", gray Done button | The growth engine has nothing to show on Day 0–14, even though the Warm-up has already produced a shareable result. |
| 08-paywall | Three equal cards, each with its own blue "Choose" button. Annual reads "1 month free, then $29.90" and Monthly also has "1 month free" | No plan is anchored or preselected. Three CTAs compete. There's no trial timeline. The trial appears on both plans, but the spec says one month on **annual**. $29.90 is shown where the spec says $29.99 (check the store config). |
| All | Tailwind gray + `#2563eb` blue. Icon/splash are `#4F46E5` indigo | The brand color doesn't match the UI. `BADGE_META` uses 5 unrelated hues (gray, slate, blue, violet, amber) that carry no meaning. |

Measured contrast failures in the current code (WCAG 2.x, computed with the dataviz skill's `contrast()`):

| Current pair | Ratio | Verdict |
|---|---|---|
| `#9ca3af` (gray-400, chart labels, captions, hints) on white | 2.54 | FAIL |
| `#9ca3af` on the `#F2F2F2` canvas | 2.27 | FAIL |
| `#16a34a` integrity text on canvas | 2.94 | FAIL |
| `#6b7280` (gray-500 body-secondary) on canvas | 4.32 | fails for body text (passes large only) |
| Share-card hook `#64748b` on `#0f172a` (the "get your own" footer) | 3.75 | fails at its current small size, so **the growth hook is the least legible text on the card** |

---

## 1. Apple platform direction, 2025–2026

### 1.1 Liquid Glass (iOS 26) and its iOS 27 refinement

- **What it is:** a material that "forms a distinct functional layer for controls and navigation elements — like tab bars and sidebars — that floats above the content layer" ([Materials HIG](https://developer.apple.com/design/human-interface-guidelines/materials)).
- **Rule 1:** "Don't use Liquid Glass in the content layer." Content uses standard materials. The exception is transient controls like sliders and toggles, which take on glass *while being manipulated* (same source).
- **Rule 2:** "Use Liquid Glass effects sparingly… Limit these effects to the most important functional elements in your app" (same source).
- **Color on glass:** "Apply color sparingly to the Liquid Glass material… To emphasize primary actions, apply color to the background rather than to symbols or text… Refrain from adding color to the background of multiple controls." And: "in apps with primarily monochromatic content or backgrounds, choosing your brand color as the app accent color can be an effective way to tailor your app experience" ([Color HIG, Liquid Glass color](https://developer.apple.com/design/human-interface-guidelines/color)). Calibrate's UI is mostly monochrome, so this is explicit permission to make indigo the accent. It should be one tinted primary action per screen.
- **Adoption:** apps get the new appearance by recompiling with the SDK ([Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)). With Xcode 27, opting out is no longer allowed ([AppleInsider](https://appleinsider.com/articles/26/03/26/stop-holding-out-hope-liquid-glass-will-be-mandatory-in-ios-27)).
- **iOS 27 (shipped Sept 2026):** Liquid Glass was retuned with "more uniform refraction and improved contrast," and **a Settings slider lets users set glass anywhere from ultraclear to fully tinted** ([Apple newsroom, Sept 2026](https://www.apple.com/gn/newsroom/2026/09/major-updates-for-apples-software-platforms-are-now-available/); [iOS 27](https://www.apple.com/os/ios/)). Implication: never rely on a particular glass translucency for legibility. Test floating controls at both ends of the slider and with Reduce Transparency on.
- **Tab bar on iPhone:** it "floats above content at the bottom of the screen" on Liquid Glass. It can minimize on scroll, and can carry a bottom **accessory** (like Music's MiniPlayer) ([Tab bars HIG](https://developer.apple.com/design/human-interface-guidelines/tab-bars)).

**How to get this in Expo SDK 55:**
- `expo-router/unstable-native-tabs` (the stable import is `expo-router/native-tabs` from SDK 58) renders the real UITabBar. That gives you Liquid Glass on iOS 26+, SF Symbols via `sf={{default:'house', selected:'house.fill'}}`, `minimizeBehavior="onScrollDown"`, and a **bottom accessory (SDK 55+)** ([Expo native tabs](https://docs.expo.dev/router/advanced/native-tabs/)).
- `expo-glass-effect`'s `GlassView` (`glassEffectStyle: 'regular'|'clear'`, `tintColor`, `isInteractive`) falls back to a plain `View` below iOS 26. Use `isLiquidGlassAvailable()` to branch ([GlassEffect docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/)).

### 1.2 Tab bars
- "Use a tab bar to support navigation, not to provide actions… use a toolbar instead." The current **Log** tab is an action.
- "Don't disable or hide tab bar buttons, even when their content is unavailable… If a section is empty, explain why."
- "Include tab labels… Use single words." "Prefer filled symbols or icons for consistency with the platform." "Reserve badges for critical information."
- Source for all of the above: [Tab bars HIG](https://developer.apple.com/design/human-interface-guidelines/tab-bars).

**Recommendation:** four tabs: **Today · Insights · History · You** (Settings, account and subscription move under You). "New prediction" becomes a tinted glass "+" in the Today and History toolbars. Optionally it can also be the tab-bar **bottom accessory** ("＋ New prediction"), which collapses inline when the bar minimizes. It presents a **sheet**.

### 1.3 Sheets
- Sheets are for "a scoped task that's closely related to their current context." On iPhone, "consider supporting the medium detent" and "include a grabber." "Support swiping to dismiss… If people have unsaved changes… use an action sheet to let them confirm." Cancel goes top-leading and Done top-trailing. Don't show Cancel, Done and Back together ([Sheets HIG](https://developer.apple.com/design/human-interface-guidelines/sheets)).
- Apply this to: **Log** (large detent; compose-style content wants full height, like Mail/Messages per HIG), **Resolve** (medium detent: a yes/no plus a one-line reflection fits in half a screen), **Share** (large), **Paywall** (full-screen modal with Close).

### 1.4 Typography and Dynamic Type
- iOS default body is **17 pt, minimum 11 pt**. Avoid Ultralight/Thin/Light weights. "Maintain the relative hierarchy… when people adjust text sizes," and "prioritize important content" when scaling ([Typography HIG](https://developer.apple.com/design/human-interface-guidelines/typography)).
- SF comes in **Rounded** variants "to coordinate text with the appearance of soft or rounded UI elements, or to provide an alternative typographic voice" (same source). React Native on iOS exposes this as `fontFamily: 'ui-rounded'`.
- Dynamic Type default ("Large") text styles: Large Title 34/41, Title 1 28/34, Title 2 22/28, Title 3 20/25, Headline 17/22 semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption 1 12/16, Caption 2 11/13.

### 1.5 SF Symbols
- Four rendering modes (monochrome, hierarchical, palette, multicolor). **Variable color** "represent[s] a characteristic that can change over time — like capacity or strength" ([SF Symbols HIG](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)). That suits progress-to-unlock and confidence glyphs.
- SF Symbols 7 adds gradient rendering. SF Symbols 5+ adds symbol animations (bounce, pulse, replace, wiggle) ([Motion HIG](https://developer.apple.com/design/human-interface-guidelines/motion)).
- In Expo, use `expo-symbols` (`SymbolView`) on iOS and keep Ionicons only as the Android/web fallback.
- Useful symbols:
  - `circle.lefthalf.filled`: honest uncertainty / the integrity bonus
  - `scope`: forecaster
  - `chart.line.uptrend.xyaxis`: insights
  - `checkmark.circle` / `xmark.circle`: outcomes, kept neutral-colored
  - Categories: `briefcase.fill`, `heart.fill`, `dollarsign.circle.fill`, `person.2.fill`, `person.fill`
  - `lock.open.fill`: unlock

### 1.6 Haptics
- "Use system-provided haptic patterns according to their documented meanings." "Use haptics consistently… a clear, causal relationship." "Prefer using haptics to complement other feedback." "Avoid overusing haptics." "Make haptics optional." Categories: notification, impact, selection. "Selection haptics provide feedback while the values of a UI element are changing" ([Playing haptics HIG](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)).
- `expo-haptics` maps these 1:1: `selectionAsync`, `impactAsync(Light|Medium|Rigid…)`, `notificationAsync(Success|Warning|Error)`.

### 1.7 Motion
- "Add motion purposefully." "Make motion optional." "Aim for brevity and precision in feedback animations." "In apps, generally avoid adding motion to UI interactions that occur frequently." "Let people cancel motion." With Reduce Motion on, reduce "automatic and repetitive animations, including zooming, scaling, and peripheral motion" ([Motion HIG](https://developer.apple.com/design/human-interface-guidelines/motion); [Accessibility HIG](https://developer.apple.com/design/human-interface-guidelines/accessibility)).

### 1.8 Charts (HIG)
- "Summarize key information so that people can grasp it quickly." Weather's title and subtitle are the example. "Avoid relying solely on color… supplement color… use different shapes." Every chart must be accessible. If you don't use Audio Graphs, "identify the chart's type… explain what each axis represents" ([Charts HIG](https://developer.apple.com/design/human-interface-guidelines/charts)).

### 1.9 What Apple Design Award winners have in common (2025, 2026)

2026 winners ([ADA 2026](https://developer.apple.com/design/awards/); [Apple newsroom](https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/)):
- **Tide Guide** (Visuals & Graphics): full-screen charts with custom animations, and a sky-matching palette that "anyone can easily understand."
- **Moonlitt** (Interaction): "easy onboarding and best-in-class Liquid Glass integration."
- **grug** (Delight & Fun): one playful daily idea, "no unnecessary features."
- **Guitar Wiz** (Inclusivity): Dynamic Type, Increase Contrast, **Differentiate Without Color**.
- Finalists: The Outsiders visualizes a single **Training Readiness Score**. (Not Boring) Camera is praised for "haptic scroll wheels."

2025 winners and finalists ([ADA 2025](https://developer.apple.com/design/awards/2025/)):
- **CapWords** (Delight): objects become stickers, with sounds and animation.
- Vocabulary (finalist): charming illustrations, modern typography, haptics.
- Opal (finalist): haptic feedback for focus rewards.
- Speechify (Inclusivity): Dynamic Type + VoiceOver.

Earlier: **Gentler Streak** won an ADA in 2024. Rest days don't break the streak, and the team's principle is "Statistics are just numbers… We wanted to… focus on the humanity" ([Behind the Design: Gentler Streak](https://developer.apple.com/news/?id=3m0ht22s)).

**Common threads:**
1. One focused idea, executed with restraint.
2. A single hero metric turned into something humane (Readiness Score, tides).
3. A distinctive, ownable visual voice (a palette tied to meaning, illustration or character) sitting on top of native controls.
4. Haptics as part of the craft, not decoration.
5. Accessibility as a feature (Dynamic Type, Differentiate Without Color).
6. Liquid Glass used on navigation only, content left clean.

---

## 2. Data visualization: the score, the curve, uncertainty, progress

### 2.1 Evidence base
- **Frequency framing beats probability framing for lay users.** People reason better with "7 out of 10" than "70%" (Gigerenzer & Hoffrage's frequency-format hypothesis). In one study, adding visualizations raised correct answers from 26% to 51% with natural frequencies, versus 14% to 28% with probabilities ([Frontiers in Psychology 2015](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.01473/full)).
- **Frequency-framed uncertainty visuals win.** Among distributional visualizations, "those that include frequency framing, specifically quantile dot plots and hypothetical outcome plots, have been found to outperform other distributional visualizations," and the display shouldn't let viewers fixate on a mean ([Padilla, Kay & Hullman 2022, Uncertainty Visualization](http://space.ucmerced.edu/Downloads/publications/Uncertainty_Visualization_Padilla_Kay_Hullman_2022.pdf)).
  - Quantile dotplots were designed for **small mobile screens** and improved estimate precision over density plots ([Kay et al., CHI 2016, "When (ish) is my bus?"](https://dl.acm.org/doi/10.1145/2858036.2858558)).
  - HOPs beat error bars for lay inference ([Hullman, Resnick & Adar 2015](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0142444)).
- **Error bars are misread.** In the deterministic construal error, people read 95% intervals with end caps as high and low values, even with a key explaining them ([Joslyn & LeClerc, summarized in Padilla et al.](http://space.ucmerced.edu/Downloads/publications/Uncertainty_Visualization_Padilla_Kay_Hullman_2022.pdf)). So use soft bands, not capped whiskers.
- **Showing uncertainty barely costs trust.** Numeric ranges produced "only a small decrease in trust," mostly for *verbal* uncertainty statements ([van der Bles et al., PNAS 2020](https://www.pnas.org/doi/abs/10.1073/pnas.1913678117)). Being honest about provisional data is safe.
- **Verbal probability words vary widely between people**, and more than numbers do ([Dutch probability phrases, n=881](https://arxiv.org/pdf/1901.09686)). Keep the number primary and words secondary.
- **Reliability diagrams need noise context.** Bröcker & Smith's *consistency bars* show how far a perfectly calibrated forecaster's hit rate could wander given the bucket's n ([Weather & Forecasting 2007](https://journals.ametsoc.org/view/journals/wefo/22/3/waf993_1.xml)). Metaculus's own analysis reads calibration by whether **50% intervals cross y=x**, not by raw dot position ([EA Forum, Metaculus track record](https://forum.effectivealtruism.org/posts/e9htD7txe8RDdcehm/exploring-metaculus-s-ai-track-record)).
- **What prior art does:**
  - Fatebook shows a calibration chart ("if all the blue dots were on the green line, you'd be perfectly calibrated"), Brier and relative Brier, per-tag track records, and email reminders to resolve ([LessWrong launch post](https://www.lesswrong.com/posts/yS3d46m23wRKDQobt/introducing-fatebook-the-fastest-way-to-make-and-track)). Per-tag calibration is the same insight as Calibrate's per-category badges.
  - Metaculus groups forecasts into quintile buckets against a dotted diagonal.
  - Good Judgment: superforecasters' calibration was ~0.01 mean gap between stated probability and frequency, about 99 on Calibrate's MAE scale. A one-hour training's effect persisted a year, and "keeping score is crucial for getting feedback from reality" ([AI Impacts on GJP](https://aiimpacts.org/evidence-on-good-forecasting-practices-from-the-good-judgment-project/)).
- **Gauges are a poor hero.** Stephen Few built the bullet graph because gauges "display too little information, require too much space, and are cluttered" ([Bullet graph spec](https://www.betterevaluation.org/tools-resources/bullet-graph-design-specification)).

### 2.2 The hero score (0–100)
- **Form:** a stat, not a gauge. Show one numeral in SF Rounded Bold at 64–72 pt, proportional figures, exactly one per screen.
- **Beside or under it:**
  - The **identity word** for the band ("Forecaster"). Identity leads and the number is the receipt.
  - A one-line plain-language verdict built from the engine's direction of error: "You run a little hot above 70%."
  - A thin **linear band bar** (bullet-graph style) with ticks at 70 / 85 / 90 (the Forecaster / Sharp / Oracle thresholds) and a marker for the score. Optionally add a translucent range for uncertainty (below).
  - A delta vs last month, only when both months are non-provisional.
- **Uncertainty (optional engine work):** bootstrap the MAE over resolved predictions and show the 50% range as a soft band on the bar ("likely 71–78"). Per van der Bles, numeric ranges barely dent trust, and they carry the product principle of never presenting noise as signal.
- **Color:** the numeral stays in ink (`text-primary`), never a semantic hue. Color goes to the direction of miscalibration, not to good or bad.

### 2.3 The calibration curve that non-experts get
1. **Title = takeaway** (HIG): "You're overconfident at 80%+", with the subtitle "Of 12 things you called 80–100% likely, 7 happened."
2. **Regions labeled in place:** tint the triangle below the diagonal very lightly warm and label it *Overconfident*. Tint above the diagonal cool and label it *Underconfident*. Label the diagonal itself *Right on* or *Perfectly calibrated*. That's three redundant channels (position, tint, text), which satisfies HIG "not color alone" and gives Differentiate Without Color for free.
3. **Consistency band** around the diagonal: for each non-empty bucket, draw the binomial 50% range of hit rates a perfectly calibrated person would get at that n, as a soft gray capsule with no caps. A dot inside the band reads "within noise." Wide bands at small n visually enforce the min-N principle.
4. **Dots** colored by side (over / under / within band = calibrated), sized by n, and **labeled with n**. Keep the connecting line thin (1.5 px) and neutral, or drop it. Five buckets aren't a continuous function.
5. **"Dots" view toggle (frequency framing):** one row per bucket as an icon array. Show n dots, filled = happened, plus a marker at the count you'd *expect* from your stated confidence: "80–100%: ●●●●●●●○○○○○ 7 of 12, you expected ~11." This is the quantile-dotplot / natural-frequency idea applied to calibration, and probably the most comprehensible view for lay users.
6. **Coverage row:** under the chart, five bucket chips (0–20 … 80–100) with counts, and empty ones hatched: "You've never logged anything under 40%." This makes the spec's range-coverage caveat visible and connects to the coverage nudge.
7. **Accessibility:** keep `describeCalibrationCurve()` and add a "Show as table" disclosure. Label ticks as "0%… 100%", in text-tertiary at ≥4.5:1 (currently 2.54:1).

### 2.4 Provisional and progress-to-unlock states
- **Never put the progress count in the hero-score slot** (the current 04-home and 05-stats do). Use a **progress ring or segmented bar** whose unit is visible: 20 segments for 20 resolutions.
- **Endowed progress, honestly:** show *pending* predictions as hatched "on their way" segments ahead of the filled ones. "4 on their way · 16 to go."
  - Endowed progress raised completion from 19% to 34% for the same effort ([Nunes & Drèze 2006](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=991962)).
  - Effort accelerates near the goal ([Kivetz, Urminsky & Zheng 2006](https://journals.sagepub.com/doi/abs/10.1509/jmkr.43.1.39)).
  - This is honest because pending predictions really will count once resolved.
- Per category: a small ring around the category glyph ("health 9/15"), and the badge emblem shown in **blueprint** style (outline, dashed) until unlocked.
- **Ghost chart:** before unlock, show the full chart frame with the diagonal, labeled regions and empty bucket slots, not an italic placeholder. The user learns to read the chart before they have data.
- **Unlock moment:** the ring completes, morphs into the numeral with a count-up, and plays a success haptic. This is one of only three confetti-eligible moments (§3).

---

## 3. Gamification and identity

### 3.1 Evidence
- Badges do raise activity: Hamari's two-year field experiment on a trading service found users in the gamified condition "significantly more likely" to post, trade and comment ([Hamari 2017](https://research.aalto.fi/en/publications/do-badges-increase-user-activity-a-field-experiment-on-the-effect/)).
- **Streaks cut both ways:**
  - Intact logged streaks increase engagement relative to broken ones. When a streak breaks, people often drop off, especially when they blame themselves. The effect is **attenuated when streaks can be "repaired"** ([Silverman & Barasch, JCR 2023](https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414)).
  - Duolingo: letting learners equip two Streak Freezes gave +0.38% DAU ([Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit)). Separating "extend streak" from "hit daily goal" (a lower bar) gave +3.3% D14 retention and +10.5% learners on a streak ([Improving the streak](https://blog.duolingo.com/improving-the-streak)). Milestone animations gave +1.7% D7 retention for new learners. Learners who reach a 7-day streak are 3.6x likelier to finish the course (same source).
  - Gentler Streak: rest, sick and vacation days don't reset progress, and the copy avoids shame ([Apple Developer](https://developer.apple.com/news/?id=3m0ht22s)).
  - Strava ships **weekly** streak stickers ([Strava](https://stories.strava.com/articles/whats-new-on-strava-new-languages-annual-best-efforts-and-weekly-streak-stickers)).

### 3.2 Streak redesign
- Calibrate's `current_streak` counts **consecutive days with a resolution**. Resolutions only happen when predictions come *due*, and the user doesn't control that, so a daily streak will break for reasons outside the user's control. That's the worst case in Silverman & Barasch (a break that feels like the user's fault while it isn't).
- Recommendations:
  - Make the visible streak **weekly**: "a week with ≥1 log or resolution." Show it as a row of week dots (filled / hollow), not a flame counter.
  - Add an automatic **grace week** (one per month, silent) and a "repair": resolving an overdue prediction back-fills the week.
  - Break copy is neutral: "New week, new calls." Never show a broken-streak number or a red state.
- If the daily number stays in the engine for analytics, don't surface it.

### 3.3 Badges that feel earned, not childish
- **Drop emoji** (🎲📊🔭🎯🔮). They read as toy-like, render differently per platform, and repeat the tier with no meaning.
- **Emblem concept, the "Lens":** a rounded-square emblem (continuous corners, radius 28% of size) containing the **calibration diagonal** as its mark. That's the one image that belongs to this product.
- Tier is encoded by **ring count + fill + label**, never color alone:

| Tier | Emblem | Fill | Rings | Accent |
|---|---|---|---|---|
| Guesser | dashed outline, diagonal dotted | none (surface) | 0 | ink `#8A889E` |
| Tracker | solid outline, diagonal solid | `#EFEFF6` | 1 | ink `#4E4C66` |
| Forecaster | filled | brand `#4F46E5` | 2 | white diagonal |
| Sharp | filled, deep | `#312E81` | 3 + fine tick marks (bezel) | white diagonal |
| Oracle | filled gradient | `#4F46E5`→`#6D28D9` | 4 + bezel | gold hairline `#B7791F` (light) / `#E8B64C` (dark card) |

- The category glyph (SF Symbol) sits small in a corner. The label is always written ("Sharp · Health").
- **Provisional:** blueprint rendering (outline, 40% opacity) with a progress arc: "9/15 to unlock".
- **Earned-ness copy:** each tier shows its *receipt* in one line: "Sharp: 52 resolved, score 87." Informational feedback supports intrinsic motivation, where controlling rewards undermine it (Deci, Koestner & Ryan 1999 meta-analysis, *Psychological Bulletin* 125(6), doi:10.1037/0033-2909.125.6.627).
- **Downgrades:** if a score slips below a threshold, keep the earned emblem and show "holding" state in text. Don't animate a demotion.

### 3.4 Celebration budget
Only **three** moments get the full treatment (animation + haptic + optional sound):
1. Warm-up verdict reveal
2. Rating or category score unlock
3. Badge tier-up

The weekly Wrapped reveal gets a lighter treatment. Everything frequent (log, resolve) gets a small, precise acknowledgment only (HIG: avoid motion on frequent interactions).

**Honesty rule (the product's core principle):** Resolve **Yes and No get identical feedback**, a medium impact haptic and the same neutral check animation. No green/red, no success/error haptic. Calibration rewards honesty, not correctness. Save `notificationAsync(Success)` for unlocks and tier-ups only.

- **Confetti:** at most once per moment, ≤ 40 particles, ≤ 1.2 s, in the brand + semantic palette. Disabled under Reduce Motion (replace with a 200 ms cross-fade and a symbol `bounce`).
- **Sound:** off by default, opt-in in You → Sounds. One short tier-up tone, and respect the silent switch.

---

## 4. Share cards that spread

### 4.1 Evidence
- **Spotify Wrapped 2025:** 200M+ engaged users and **500M+ shares in the first 24 h** (+41% YoY). New features were comparative and social: "listening age," Wrapped group, Wrapped Party ([TechCrunch](https://techcrunch.com/2025/12/04/spotify-says-wrapped-2025-is-its-biggest-yet-with-200m-users-in-its-first-day); [Music Ally](https://musically.com/2025/12/05/spotify-wrapped-2025-attracted-over-200m-users-in-first-day/)). Wrapped works because it shows the *user*, not the brand, and balances belonging with standing out (optimal distinctiveness) ([Irrational Labs](https://irrationallabs.com/blog/spotify-wrapped-behavioral-science/)).
- **Wordle:** went from 90 players (1 Nov 2021) to 2M (9 Jan 2022) after the **spoiler-free emoji-grid share** shipped. That share is text, pastes anywhere, and shows the shape of the result without the answer ([Wordle, Wikipedia](https://en.wikipedia.org/wiki/Wordle); [Josh Wardle's post](https://x.com/powerlanguish/status/1471493886031773707)).
- **16Personalities:** free, good UX, and a **compact identity code** people adopt (INFJ-T) ([16Personalities types](https://www.16personalities.com/personality-types)). "Sharp in health · Guesser in money" is exactly this kind of label.
- **Letterboxd Year in Review:** a personal headline-stats summary plus a community round-up. Membership went past 30M, with +10M in a year ([Letterboxd YIR FAQ](https://letterboxd.com/journal/2025-letterboxd-year-in-review-faq/); [Wikipedia](https://en.wikipedia.org/wiki/Letterboxd)).
- **Strava** is the counter-example: in Dec 2025 it paywalled Year in Sport, and timelines filled with "screenshots of a paywall… instead of proud 'this was my year' stories" ([road.cc](https://road.cc/content/news/strava-year-sport-now-only-subscribers-317425); [Slashdot](https://news.slashdot.org/story/25/12/19/2158235/strava-puts-popular-year-in-sport-recap-behind-an-80-paywall)). This validates the spec's rule that nothing shareable is ever paywalled.

### 4.2 Formats
| Destination | Export | Why |
|---|---|---|
| Instagram / Snap Stories | **1080×1920 (9:16)**, critical content inside y = 250…1580 (keep out of top ~250 px and bottom ~340 px) | Story UI overlays ([safe-zone guide](https://growthscribe.com/instagram-story-size/)) |
| X, iMessage, group chats, feed posts | **1080×1440 (3:4)** | X shows single images uncropped at 16:9, 4:3, 2:1 and **3:4** ([TechCrunch 2021](https://techcrunch.com/2021/05/05/twitter-image-cropping-changes/)). 3:4 is the tallest standard ratio, so the most legible in a phone timeline. iMessage shows attachments at native aspect. |
| Link previews (if a public profile/URL exists later) | 1200×630 OG image | iMessage and others use OG at 1.91:1 ([OG image guide](https://opengraphplus.com/consumers/apple/images)) |
| Text share (Wordle-style) | plain text + emoji | Pastes everywhere, spoiler-free, no image needed |

**Text share proposal** (the five buckets, low→high, one symbol each: 🟦 under, 🟩 on the line, 🟧 over, ⬜ empty):
```
Calibrate · Week 38
Sharp in health · Guesser in money
⬜🟩🟩🟧🟧  score 81
calibrate.app
```
It's spoiler-free: it never includes prediction titles, which are private.

### 4.3 Card hierarchy (at 1080 px width)
1. **Identity line:** 88–96 px SF Rounded Bold. "Sharp in health". Only the **top** category gets hero size.
2. **Contrast line:** 56 px. "Guesser in money". The tension between the two lines is the hook, and humility makes it shareable.
3. **One receipt:** 36–40 px. "Right 84% of the time I said 80%" (natural-frequency phrasing).
4. **Mini-visual:** a 5-bucket dot strip or tiny curve, *no axes*. It should be recognizable at thumbnail size, as the Wordle grid is.
5. **Footer hook:** ≥ 32 px at ≥ 4.5:1. App mark plus a question, not a slogan: "What are you sharp at? · calibrate.app". The current footer is 3.75:1, which is too faint for its size.

- **Day-0 card:** the Warm-up verdict card ("I run hot: 77% sure, 50% right") so the Share screen is never empty (fixes 07-share).
- **Themes:** keep the free "Midnight" dark card on a brand-indigo-black (`#141233`) with the semantic dark palette. Plus themes stay cosmetic.

---

## 5. Onboarding quiz and paywall

### 5.1 Evidence
- **Trials:** ~all trial starts happen on **Day 0**. Trials of 17–32 days convert at a **42.5%** median vs 25.5% for ≤4 days. 55% of trial cancellations happen on Day 0 ([RevenueCat SOSA 2026 summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)). This supports the spec's 1-month trial.
- **Freemium vs hard paywall:** freemium converts at **2.1%** median vs 10.7% for hard paywalls (Day-35) (same source). Calibrate is deliberately freemium, so *where* the upsell appears matters more than for most apps.
- **Onboarding is where conversions happen:** ~50% of trial starts at Mojo came from onboarding. Hiding monthly behind "View all plans," with only yearly shown by default, raised yearly subs with minimal conversion loss. "(equivalent to $X/month)" next to yearly helped ([RevenueCat paywall guide](https://www.revenuecat.com/blog/growth/guide-to-mobile-paywalls-subscription-apps)).
- **Longer onboarding and value before the paywall:** Lose It!'s trial-start rates "went up double digits as onboarding got longer." Examples like Noom's goal projection and Fitbod's progress projection deliver an insight *just before* the paywall ([RevenueCat](https://www.revenuecat.com/blog/growth/why-your-onboarding-experience-might-be-too-short)). Five Minute Journal's personalization and benefit-led onboarding gave ARPU +20% (p=0.04), +10% trials and +14% trial conversion ([RevenueCat](https://www.revenuecat.com/blog/growth/five-minute-journal-onboarding-redesign-arpu)).
- **Trial toggles are dead on iOS:** since mid-January 2026 Apple rejects toggle paywalls under Guideline 3.1.2 as "confusing" ([RevenueCat, R.I.P. toggle paywall](https://www.revenuecat.com/blog/growth/rip-toggle-paywall)). Replacements: the **honest timeline paywall**, multi-package selector, value-first.
- **Honest timeline:** Blinkist's "Today → Day 5 reminder → Day 7 charged" timeline gave **+23% conversion and −55% complaints** ([Growth.Design case study](https://growth.design/case-studies/trial-paywall-challenge)).
- **Trial on one plan:** "Offering a trial on just one plan will drive more users to select that option" ([Superwall best practices](https://superwall.com/blog/superwall-best-practices-winning-paywall-strategies-and-experiments-to)).
- **Design-only changes are weak levers:** visual/copy-only paywall tests have the lowest win rate (34.6%) in Adapty's 2026 data ([Adapty](https://adapty.io/blog/high-performing-paywall-2026/)). Get structure right (plan set, preselection, timeline) before polishing.
- **HIG onboarding:** "Teach through interactivity" and keep it "brief, enjoyable" ([Onboarding HIG](https://developer.apple.com/design/human-interface-guidelines/onboarding)).

### 5.2 Warm-up flow (fixes 01 and 02)
1. **No spinner.** Render a branded first screen immediately: indigo-to-ink gradient, the Lens mark, "How well do you know what you know? 60 seconds." CTA: "Start." If data must load, use skeleton UI.
2. **Question screen:** the prompt is Title 2, with two large answer cards. Confidence uses a **big horizontal dial** (50–100) with a **selection haptic every 5%**. The live readout pairs the number with a frequency phrase: "80% · you'd be right about 8 times in 10." Show a progress bar (segmented, 8–10), not "3 / 10" text.
3. **Verdict reveal (celebration moment 1):**
   - Headline identity: "You run hot."
   - Receipt: "77% sure, 50% right."
   - The mini chart animates in with labeled regions. Points drop in and settle *below* the diagonal into the warm "Overconfident" region.
   - Count-up of the warm-up number labeled **"Warm-up score"** at *Title 1 size, not hero size*, so it doesn't compete with the future rating.
4. **Immediately after:** a "Share your result" card (Day-0 artifact), then **"Start tracking real calls"**, which opens Log with a prefilled suggestion.
5. **Soft Plus moment:** after the first real prediction is saved (not before, and never blocking), show a one-screen value-first Plus intro with the timeline, dismissible with a clear "Not now." The spec forbids touching the core loop, so this is never a hard gate.

### 5.3 Paywall redesign (fixes 08)
- **Structure:** a value header, then 3 benefit rows (SF Symbol + one line each), then the plan selector (radio cards, **Annual preselected and first**), then the **honest timeline**, then **one** CTA.
- **Annual card:** "Annual · $29.99/yr" plus "$2.50/mo, billed yearly" plus a "1 month free" badge. The Monthly card has no trial and reads "$4.99/mo." Lifetime sits under "More options" or as a third small row.
- **Timeline** (store-reported units, per spec):
  - **Today:** full Plus access
  - **In 3 weeks:** we remind you (only if the user grants notifications)
  - **In 1 month:** your year starts at $29.99. Cancel at least 24 hours before.
- **CTA:** "Start free month" when Annual is selected. It changes to "Subscribe for $4.99/mo" when Monthly is selected. The CTA label always reflects the selected plan (3.1.2 clarity).
- **Keep:** "Restore purchases" as a text button, the "Logging, resolving… stay free forever" reassurance (good, keep it), and Terms/Privacy links.
- **Flag:** the screenshot shows $29.90 and a trial on Monthly, and the spec says $29.99 with the trial on annual. Check the store product config.

---

## 6. Proposed visual system

All ratios below were computed (WCAG 2.x relative luminance). CVD checks used the dataviz skill's `validate_palette.js` (Machado 2009 simulation, OKLab ΔE×100).

### 6.1 Color

**Brand (indigo, matches icon and splash):** use Tailwind indigo so the icon, splash (`#4F46E5` / dark `#1E1B4B`) and the existing Wrapped theme line up.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| brand-50 | `#EEF2FF` | tinted chip/selected bg | — |
| brand-100 | `#E0E7FF` | pressed tint | — |
| brand-200 | `#C7D2FE` | dark-card secondary | — |
| brand-400 | `#818CF8` | dark-mode accent | — |
| **brand-600** | **`#4F46E5`** | primary CTA fill, selected states, links, tab tint | white on it **6.29:1 AA**; as text on canvas 5.83:1 AA |
| brand-700 | `#4338CA` | pressed CTA | white on it 7.90:1 |
| brand-800 | `#3730A3` | text on brand-50 (integrity chip) | 8.88:1 |
| brand-900 | `#312E81` | Sharp emblem | — |
| brand-950 | `#1E1B4B` | splash dark, Wrapped card | — |
| ink-card | `#141233` | free share-card background | — |

**Neutrals (indigo-tinted ink, replacing Tailwind gray):**

| Token | Hex | Contrast |
|---|---|---|
| canvas | `#F6F6FA` | — |
| surface | `#FFFFFF` | — |
| surface-sunken | `#EFEFF6` | — |
| hairline | `#E2E2EC` (decorative only) | — |
| control-border | `#8A889E` | 3.44:1 vs white (meets 3:1 UI) |
| text-primary | `#16142E` | 16.6:1 on canvas |
| text-secondary | `#4E4C66` | 7.64:1 canvas / 8.24:1 white |
| text-tertiary | `#6B6982` | 4.91:1 canvas / 5.29:1 white / 4.62:1 sunken, all AA. Replaces gray-400. |
| destructive | `#C4271C` | 5.75:1 on white |

**Semantic calibration colors** (a diverging concept: cool = under, warm = over, green = on the line). Derived from the Okabe-Ito colorblind-safe set.

| Role | Mark (chart fill, ≥3:1) | Text on white | Chip text / chip bg | Dark card mark / text on `#141233` |
|---|---|---|---|---|
| Overconfident ("runs hot") | `#D55E00` (3.87) | `#B84E00` (5.09) | `#9A3F00` / `#FFF1E6` (6.15) | `#E06B20` (5.41) / `#F28A4B` (7.31) |
| Underconfident ("runs cool") | `#0084C7` (4.10) | `#006C9E` (5.77) | `#005A85` / `#E6F4FB` (6.68) | `#2D96D8` (5.55) / `#5CB4EC` (7.90) |
| Calibrated ("on the line") | `#009E73` (3.42) | `#00785A` (5.48) | `#00664C` / `#E3F6EF` (6.22) | `#14A87B` (5.94) / `#3CC79A` (8.44) |
| Integrity (honest uncertainty) | brand `#4F46E5` + `circle.lefthalf.filled` | `#3730A3` on `#EEF2FF` (8.88) | | `#A5B4FC` (9.05) |
| Oracle gold (emblem hairline only) | `#B7791F` (3.64, graphic) | chip `#7A4F0E` / `#FDF6E7` (6.61) | | `#E8B64C` (9.64) |

**CVD validation (all-pairs, since chart dots can sit anywhere):**
- Light `#D55E00,#0084C7,#009E73` on white: lightness band PASS, chroma PASS, **worst CVD ΔE 11.0 (deutan) PASS**, normal-vision floor 18.7 PASS, contrast PASS.
- Adding brand `#4F46E5` as a 4th mark still passes: CVD 10.6, normal-vision 16.1. The tritan separation from under-blue is only 3.7, so **keep brand indigo out of data marks.** Indigo is chrome; the chart uses the three semantic hues plus ink.
- Dark `#E06B20,#2D96D8,#14A87B` on `#141233`: all checks PASS (CVD 11.0, normal-vision 16.6).
- The first dark attempt (`#F2803A…`) failed the dark lightness band and was re-stepped.

**Rules:**
- Outcome (Yes/No) is **never** green/red. Use filled vs hollow ink glyphs. Green means *calibrated*, not *correct*.
- Categories get **no color**, only SF Symbols. This keeps the semantic hues unambiguous.
- Semantic color always comes with a word or shape ("Overconfident" label, region, arrow ↘/↗).
- Keep `userInterfaceStyle: light` for v1 (already pinned). Dark tokens above already exist for share cards, so a later dark mode is a mapping exercise.

### 6.2 Type scale (iOS points, Large default; all scale with Dynamic Type)

| Token | Font | Size/Line | Weight | Maps to | Use |
|---|---|---|---|---|---|
| display | SF Rounded (`ui-rounded`) | 64/68 | Bold | custom (cap scale at 1.6×) | hero score, unlock numeral |
| title-xl | SF Rounded | 34/41 | Bold | Large Title | screen titles, verdict headline |
| title-1 | SF Pro | 28/34 | Bold | Title 1 | section heroes, warm-up score |
| title-2 | SF Pro | 22/28 | Bold | Title 2 | quiz prompt, card headlines |
| title-3 | SF Pro | 20/25 | Semibold | Title 3 | group headers |
| headline | SF Pro | 17/22 | Semibold | Headline | row titles, buttons |
| body | SF Pro | 17/22 | Regular | Body | prediction text, copy |
| callout | SF Pro | 16/21 | Regular | Callout | explanations |
| subhead | SF Pro | 15/20 | Regular | Subhead | metadata |
| footnote | SF Pro | 13/18 | Regular/Semibold | Footnote | captions, chart labels |
| caption | SF Pro | 12/16 | Medium | Caption 1 | tick labels (min for charts) |
| eyebrow | SF Pro | 13/18, +0.4 tracking | Semibold, sentence case | Footnote | section labels (replaces ALL-CAPS gray) |

- Rounded is for **numbers, badges and identity words only**. SF Pro handles everything else. Two voices of one family, per HIG "minimize typefaces."
- Percentages inside lists and tables use `fontVariant: ['tabular-nums']`. Hero numerals stay proportional.
- No text below 11 pt. Chart ticks move from 9 px to 12 pt.

### 6.3 Spacing, radius, elevation

**Spacing (4-pt grid):** `2, 4, 8, 12, 16, 20, 24, 32, 40, 56`.
- Screen gutter 16 (20 on Pro Max widths).
- Card padding 16.
- Gap inside a group 8–12, between groups 24, between sections 32.
- Tap targets ≥ 44×44 pt.

**Radius (concentric: inner = outer − padding):**

| Token | pt | Use |
|---|---|---|
| r-xs | 6 | tick chips, tiny tags |
| r-sm | 10 | inputs, small chips |
| r-md | 16 | cards, list groups |
| r-lg | 24 | hero cards, sheets' inner content |
| r-xl | 32 | share-card preview |
| pill | 999 | buttons (capsule, iOS 26 style), segmented, category chips |

**Elevation.** iOS is mostly flat, and depth comes from glass on the nav layer:

| Level | Spec | Use |
|---|---|---|
| e0 | canvas, no shadow; separation by surface color + 1 px hairline | default |
| e1 | `shadowColor #16142E, opacity 0.06, radius 8, y 2` | cards on canvas |
| e2 | `opacity 0.12, radius 24, y 8` | floating "+" button, toasts, dragged items |
| glass | native tab bar, toolbar "+", sheet chrome via `GlassView` (regular). Never on cards or charts. | |

### 6.4 Motion vocabulary

Use Reanimated springs; all respect `useReducedMotion()`.

| Name | Spec | Haptic | Where |
|---|---|---|---|
| press | scale 0.97, spring (damping 20, stiffness 320), ~120 ms | none (system) | all buttons and cards |
| detent | numeral roll 80 ms per 5% step | `selectionAsync` per 5% | confidence dial, category pick |
| commit | card slides into list + checkmark draw 250 ms | `impactAsync(Light)` | save prediction |
| resolve | same neutral check for Yes and No; card collapses 300 ms | `impactAsync(Medium)` (identical for both) | Resolve |
| reveal | count-up 700 ms ease-out; diagonal draws 400 ms; dots drop in with a 60 ms stagger; regions fade 200 ms | `impactAsync(Rigid)` when the last dot lands | warm-up verdict, weekly Wrapped |
| unlock | ring completes 500 ms, morphs to numeral, symbol `bounce` | `notificationAsync(Success)` | rating/category unlock |
| tier-up | emblem flips on Y axis 600 ms, ring count increments, ≤40-particle confetti ≤1.2 s | `notificationAsync(Success)` + optional tone | badge tier-up |
| reduced | all of the above become a 200 ms cross-fade; no count-up, no confetti, no flips; haptics still fire (they're the non-visual channel) | | Reduce Motion |

**Never animate:** demotions, broken streaks, "No" outcomes.

### 6.5 Badge visual concept
See §3.3 ("Lens" emblem: the calibration diagonal inside a continuous-corner square; tiers differ by ring count, fill and label; provisional = blueprint + progress arc; gold hairline only for Oracle). Build it as a single SVG component (`<LensEmblem tier category progress size />`) so the same emblem renders in lists (28 pt), the Insights header (64 pt), share cards (160 px @1080) and the tier-up moment (120 pt).

---

## 7. Top screen-level changes (prioritized)

1. **Home (04):** replace the giant "20" with a 20-segment progress ring (hatched "on their way" pending segments). Group cards by due date ("Due today / This week / Later"). Each card shows a confidence glyph + % and a relative due date, and drops the repeated "Pending." Due cards get a swipe-to-resolve action.
2. **Tabs (all):** move to native tabs (`expo-router/unstable-native-tabs`) with Liquid Glass and SF Symbols. Four tabs: Today, Insights, History, You. **Remove the Log tab** and make "New prediction" a tinted toolbar "+" / bottom accessory opening a sheet.
3. **Log (03):** in a large-detent sheet, replace ±5 steppers with a dial (0–100, 5% detents, selection haptics) plus a frequency readout ("about 7 in 10"). The integrity bonus becomes a brand chip with `circle.lefthalf.filled`, fixing the 2.94:1 green. Category chips get SF Symbols and sentence case.
4. **Stats → Insights (05):** ghost chart with labeled regions and a consistency band before unlock. Per-category rows with Lens emblems + "9/15" arcs instead of 🎲 chips. One Plus teaser card (blurred sample Coach insight) instead of two gray "See Plus" slabs.
5. **Calibration chart (02, 05):** takeaway title, in-place region labels, dots colored by side and labeled with n, a "Dots" frequency view, a coverage row, and 12 pt ticks at ≥4.5:1.
6. **Warm-up (01):** a branded first screen, no spinner, then a big dial with haptics and a segmented progress bar.
7. **Verdict (02):** identity headline plus an animated reveal. The warm-up number drops to title-1 and is labeled "Warm-up score." Add a share-your-result card and a "Start tracking real calls" CTA.
8. **Share (07):** never empty. Show the Warm-up card on Day 0. Add Story (9:16) and Post (3:4) exports plus a Wordle-style text share. Raise the footer hook to ≥32 px at ≥4.5:1. Present it as a sheet with Close top-leading.
9. **Paywall (08):** Annual preselected with a per-month equivalent, trial only on Annual, an honest timeline, a single plan-aware CTA, and no toggle (Apple 3.1.2). Fix the $29.90 vs $29.99 mismatch.
10. **History (06):** a proper empty state (SF Symbol, one line, "Log a prediction" button). Filter chips with counts. Resolved rows show the outcome with neutral filled/hollow glyphs and a tiny over/under marker, not green/red.

Also: move the streak to weekly (Stats/Home), and replace `BADGE_META` emoji and the Tailwind hexes with the tokens above in one `src/constants/theme.ts`.

---

## 8. Source index
- Apple HIG (JSON-rendered text read from developer.apple.com):
  - [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
  - [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
  - [Color](https://developer.apple.com/design/human-interface-guidelines/color)
  - [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
  - [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
  - [SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)
  - [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)
  - [Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
  - [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)
  - [Charts](https://developer.apple.com/design/human-interface-guidelines/charts)
  - [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- Apple Liquid Glass and awards:
  - [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)
  - [Meet Liquid Glass (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/219/)
  - [iOS 27 release, Apple newsroom](https://www.apple.com/gn/newsroom/2026/09/major-updates-for-apples-software-platforms-are-now-available/)
  - [ADA 2026](https://developer.apple.com/design/awards/)
  - [ADA 2025](https://developer.apple.com/design/awards/2025/)
  - [Gentler Streak, Behind the Design](https://developer.apple.com/news/?id=3m0ht22s)
- Expo:
  - [Native tabs](https://docs.expo.dev/router/advanced/native-tabs/)
  - [GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/)
- Data-viz / uncertainty:
  - [Padilla, Kay & Hullman 2022](http://space.ucmerced.edu/Downloads/publications/Uncertainty_Visualization_Padilla_Kay_Hullman_2022.pdf)
  - [Kay et al. CHI 2016](https://dl.acm.org/doi/10.1145/2858036.2858558)
  - [Hullman et al. 2015 HOPs](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0142444)
  - [van der Bles et al. PNAS 2020](https://www.pnas.org/doi/abs/10.1073/pnas.1913678117)
  - [Bröcker & Smith 2007](https://journals.ametsoc.org/view/journals/wefo/22/3/waf993_1.xml)
  - [Natural frequencies, Frontiers 2015](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.01473/full)
  - [Verbal probability variability](https://arxiv.org/pdf/1901.09686)
  - [Few, bullet graphs](https://www.betterevaluation.org/tools-resources/bullet-graph-design-specification)
  - [Fatebook](https://www.lesswrong.com/posts/yS3d46m23wRKDQobt/introducing-fatebook-the-fastest-way-to-make-and-track)
  - [Metaculus calibration analysis](https://forum.effectivealtruism.org/posts/e9htD7txe8RDdcehm/exploring-metaculus-s-ai-track-record)
  - [GJP evidence](https://aiimpacts.org/evidence-on-good-forecasting-practices-from-the-good-judgment-project/)
- Gamification:
  - [Hamari 2017](https://research.aalto.fi/en/publications/do-badges-increase-user-activity-a-field-experiment-on-the-effect/)
  - [Silverman & Barasch 2023](https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414)
  - [Duolingo, streak habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit)
  - [Duolingo, improving the streak](https://blog.duolingo.com/improving-the-streak)
  - [Nunes & Drèze 2006](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=991962)
  - [Kivetz et al. 2006](https://journals.sagepub.com/doi/abs/10.1509/jmkr.43.1.39)
- Sharing:
  - [Spotify Wrapped 2025, TechCrunch](https://techcrunch.com/2025/12/04/spotify-says-wrapped-2025-is-its-biggest-yet-with-200m-users-in-its-first-day)
  - [Irrational Labs](https://irrationallabs.com/blog/spotify-wrapped-behavioral-science/)
  - [Wordle](https://en.wikipedia.org/wiki/Wordle)
  - [Letterboxd YIR](https://letterboxd.com/journal/2025-letterboxd-year-in-review-faq/)
  - [Strava paywall backlash](https://road.cc/content/news/strava-year-sport-now-only-subscribers-317425)
  - [X uncropped images](https://techcrunch.com/2021/05/05/twitter-image-cropping-changes/)
  - [IG safe zones](https://growthscribe.com/instagram-story-size/)
- Monetization:
  - [RevenueCat SOSA 2026](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
  - [RevenueCat paywall guide](https://www.revenuecat.com/blog/growth/guide-to-mobile-paywalls-subscription-apps)
  - [RevenueCat: toggle paywall rejections](https://www.revenuecat.com/blog/growth/rip-toggle-paywall)
  - [RevenueCat: onboarding length](https://www.revenuecat.com/blog/growth/why-your-onboarding-experience-might-be-too-short)
  - [Five Minute Journal](https://www.revenuecat.com/blog/growth/five-minute-journal-onboarding-redesign-arpu)
  - [Blinkist timeline](https://growth.design/case-studies/trial-paywall-challenge)
  - [Superwall best practices](https://superwall.com/blog/superwall-best-practices-winning-paywall-strategies-and-experiments-to)
  - [Adapty 2026](https://adapty.io/blog/high-performing-paywall-2026/)

Caveats: some secondary summaries (IG safe-zone pixel values, X display behaviour) come from third-party guides, not the platforms' own docs. Re-verify the store-side prices and trial config before shipping the paywall copy.
