> **Raw research, 2026-09-25.** Kept for its sources and reasoning. The decisions drawn
> from it live in [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) and
> [`../UI_ROADMAP.md`](../UI_ROADMAP.md); where they differ, those files win. References to
> `design-baseline/0N-*.png` mean [`../baseline/`](../baseline/) (web-build captures).

# Calibrate: market design research

Researched 2026-09-25. Every factual claim has a source URL. App Store ratings, ranks and prices are
**snapshots fetched on 2026-09-25** from the US App Store and will drift. Labels used below:
**[verified]** means read in a primary or near-primary source. **[secondary]** means reported by a
third party I could not trace to a primary source. **[unverified]** means I could not confirm it. Anything
marked *Recommendation* is my inference, not a sourced fact.

---

## 0. Baseline: what the current UI is doing

Viewed `design-baseline/01..08`:

- `01-warmup.png` shows **only a loading spinner**, so the Warmup quiz screen was not captured. Re-shoot it.
- **Verdict** (`02`): the copy is strong ("You run overconfident", "77% confident … right 50%"). The chart is a
  generic scatter with light grids, and two overlapping blue dots sit on a dashed diagonal. The "73" in blue-600
  is the only visual hierarchy. There is no motion or reveal.
- **Home / Stats** (`04`, `05`): the hero number on both screens is **"20"**, a countdown, in the same blue and
  size a score would use. A first-time user sees a big number that is not their score. All four category rows show
  the same gray "Guesser" pill with a dice emoji. The empty calibration curve is one line of italic gray text.
- **Log** (`03`): the confidence value is small label text ("Confidence: 50%") above two gray ±5 buttons. The
  single most important input has no visual weight.
- **Share** (`07`): the empty state is "Nothing to share yet." It shows no preview of what the card will look like.
- **Paywall** (`08`): three identical cards with identical blue "Choose" buttons. The **annual plan reads
  "$29.90"**, although the spec says $29.99, and the **monthly plan also shows "1 month free"**, although the spec
  puts the trial on annual only. Both may be sandbox artefacts. Worth checking.
- The brand is split: UI accents are Tailwind blue-600, but the icon and splash are indigo #4F46E5 (per the brief).

---

## 1. Forecasting / prediction apps

### Fatebook (Sage)
- Built for speed: "open a new tab, go to fatebook.io, type your prediction, and hit enter." It auto-detects dates in
  the question text and pre-fills the resolve-by date. Hashtags categorise questions. Questions are private by default.
  [verified, 2023-07-11] https://www.lesswrong.com/posts/yS3d46m23wRKDQobt/introducing-fatebook-the-fastest-way-to-make-and-track
- The track record shows Brier score, relative Brier and a calibration chart as users resolve.
  [verified] same URL. Chart style: blue dots against a green perfect-calibration line. [secondary] https://help.beeminder.com/article/366-fatebook
- Takeaway: a utility aesthetic, and the closest functional twin to Calibrate. **It is not a visual reference.** Its
  lesson is friction: Calibrate's 15-second Log goal matches Fatebook's type-and-enter flow.

### Manifold Markets
- Public calibration page: x = market probability, y = "Resolved Yes", blue dots per bucket, diagonal reference line,
  plus the copy "A dot at 70% on the x-axis should appear at 70% on the y-axis if exactly 70% of those markets resolved
  yes." [verified] https://manifold.markets/calibration
- The iOS app layers game mechanics onto forecasting: leagues, a **daily streak with a "live countdown to the daily
  deadline"**, quests, a mascot ("Mani") that "reacts to how your streak is going", and streak widgets for the home and
  lock screens. 4.6★ from only 143 ratings. [verified snapshot] https://apps.apple.com/us/app/manifold-markets/id6444136749
- Takeaway: the one-sentence explainer next to the chart is worth copying verbatim in spirit. The mascot that reacts
  to state is the Duolingo pattern, applied inside forecasting.

### Metaculus
- Rewrote and open-sourced the whole site in 2024. [verified] https://www.metaculus.com/notebooks/34747/the-state-of-metaculus/
- Earlier redesign goals: "Provide a great mobile experience … forecasting tools that support excellent science
  communication." Specific fonts and colors were not in the accessible text. [verified/partial] https://www.metaculus.com/notebooks/7338/a-new-design-language-for-metaculus/
- Takeaway: credible but web-first. Not a mobile visual reference.

### Good Judgment Open
- Badges are gated on sample size: Forecaster at 50/100/250/500 questions. "Top Forecaster" requires top 10 in
  25–250 questions **plus** a cumulative Relative Brier below 0 (added June 2022). Profiles show Brier, the crowd
  median, and Relative Brier, with the note "lower scores always indicate better accuracy, like in golf."
  [verified] https://www.gjopen.com/faq
- Takeaway: this is external precedent for Calibrate's min-N badge gates. It is a trust signal worth saying in-product
  ("badges need receipts").

### Kalshi / Polymarket (mobile)
- Kalshi: **4.8★ from 550K ratings, #1 in Finance**. [verified snapshot] https://apps.apple.com/us/app/kalshi-trade-events-sports/id1632713844
  Bright green / teal-green on white and light gray; "friendly design that takes zero time to learn."
  [secondary] https://sailgp.com/prediction-markets/kalshi/app
- Polymarket: **4.6★ from 60K, #2 in Finance**. Positions itself on "prices = probability." The US app relaunched in
  November 2025 under the CFTC. [verified snapshot] https://apps.apple.com/us/app/polymarket/id6648798962 · [secondary] https://next.io/prediction-markets/polymarket/app/
- Takeaway: the category leaders by scale are **trading apps**. They teach probability-as-a-big-number, and one semantic
  accent color used only for the action. Their casino adjacency is the wrong identity for Calibrate.
  *Recommendation:* borrow the big-percentage presentation of the confidence input, not the aesthetic.

---

## 2. Identity / personality results

### 16Personalities (NERIS)
- Claims **1.58B+ tests taken**, "Only 10 minutes," "freakishly accurate." [verified, self-reported] https://www.16personalities.com/
- Structure: 16 types → **4 role groups, each with its own color** (Analysts purple, Diplomats green, Sentinels teal/blue,
  Explorers yellow). Naming pattern: evocative noun + code ("Architect INTJ-A"). Every type has a full-body character
  illustration. [verified] https://www.16personalities.com/personality-types
- The character system is by Zeda Labs: "a unique geometric style and color system," later extended to 256+ famous and
  fictional characters. [verified] https://dribbble.com/zedalabs/projects/240402-16-Personalities
- Takeaway for Calibrate: **Guesser → Tracker → Forecaster → Sharp → Oracle is already a 16P-style naming ladder.** It
  needs 16P's other two halves: (a) one owned color per tier, and (b) an illustrated emblem per tier instead of emoji.
  The result should read "Sharp · Health" the way 16P reads "Architect · INTJ".

### Co–Star
- **4.8★ from 206K ratings, Editors' Choice**, subtitle "Horoscopes from the Void". [verified snapshot] https://apps.apple.com/us/app/co-star-personalized-astrology/id1264782561
- A monochrome black-and-white interface with a journal-like feel, abstract line illustrations, and copy-heavy
  reflective screens. Onboarding is one step per screen with a "CONTINUE" button. [verified, 2024-09-17] https://ixd.prattsi.org/2024/09/design-critique-co-star-ios-app/
- It deliberately rejected the category's purple-and-gold mysticism so it would read as a serious product.
  [secondary] https://medium.com/@jpinkos/co-star-astrology-how-astro-nerds-dominated-design-e04f705e96dc
- Its exact typeface: **[unverified]**. I found no primary source naming it.
- Takeaway: **blunt copy on a stark canvas makes a verdict feel like truth.** Calibrate's verdict copy already has this
  voice ("When you feel sure, you are less sure than you think"). The visual design should get out of its way.

### The Pattern
- A muted palette with lots of white space. Seven onboarding steps, all behind account creation. A "summary-then-paywall"
  ("Go Deeper+") model with no trial. [secondary] https://screensdesign.com/showcase/the-pattern
- It translates the chart into "plain psychological language," with no astrological jargon. [secondary] https://www.bustle.com/life/pattern-app-review-features-price
- Takeaway: the same move as Calibrate's "math is the engine, never the pitch." Lead with the sentence and put the chart
  second.

### Spotify Wrapped 2025
- **200M+ engaged users in the first 24 hours (+19% YoY), and 500M+ shares on day one (+41% YoY).** In 2024 it took 62
  hours to reach 200M. [verified, 2025-12-04] https://techcrunch.com/2025/12/04/spotify-says-wrapped-2025-is-its-biggest-yet-with-200m-users-in-its-first-day · https://musically.com/2025/12/05/spotify-wrapped-2025-attracted-over-200m-users-in-first-day/
- New in 2025: "Listening Age" and **sorting users into one of six "Clubs"** (archetypes). There are playback speed
  controls and the ability to revisit a story without restarting. [verified, 2025-12-03] https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/
- Design: a **monochrome black-and-white base with "selective pops of color used only for key moments,"** DIY
  mixtape/zine texture, and type that is "dancing like sound waves." "It's not polished perfection; it's layered,
  spontaneous, and full of personality." [verified, 2025-12-04] https://spotifyselects.substack.com/p/designing-2025-wrapped-turning-a
- 2025 moved away from 2024's AI-heavy format after criticism that it lacked real statistics. [verified] TechCrunch URL above.
- Takeaway: **archetype + one real number + one comparison** is the formula. The 2024 backlash is a warning that
  Calibrate's Wrapped should lead with the user's own receipts, not with Coach-generated prose.

### Duolingo Year in Review (2025)
- A card-by-card story ending in one shareable summary card. It shows lessons, XP, minutes and streak, **"compared to
  other learners."** The reviewer earned **100 gems for sharing it**, which is an incentivised share. [verified, 2025-12-03] https://www.androidauthority.com/duolingo-year-in-review-2025-3621782/
- Earlier years assigned one of eight learner personas. [secondary, 2023] https://duoplanet.com/duolingo-year-in-review/

### Strava Year in Sport (2025): a counter-example
- For the first time since 2016, **Year in Sport was paywalled** for subscribers only (~$80/yr). Minimum: three
  activities in 2025. Reaction was mixed, with some calling it "pathetic". [verified, 2025-12-23] https://road.cc/content/news/strava-year-sport-now-only-subscribers-317425 · https://support.strava.com/en-us/articles/15401959-your-year-in-sport
- Takeaway: this directly supports Calibrate's "never paywall a shareable" rule. A competitor-adjacent brand just
  tested the opposite and took visible criticism for it.

### Share-card format
- Instagram Stories / Reels: **9:16, 1080×1920** recommended. Keep roughly the top 15% and bottom 20% clear of key
  content (UI overlays). [secondary, 2026] https://buffer.com/resources/instagram-image-size/ · https://admakeai.com/blog/instagram-story-size
- Any Distance (ADA 2023 Visuals winner) built its share cards from photo templates, with an oval photo mask as a brand
  signature, **per-metric "eye" toggles to hide stats before sharing**, custom stat fonts, and medals earned for sharing.
  [verified, 2023-06-05] https://developer.apple.com/news/?id=uiiopcl8 · https://developer.apple.com/design/awards/2023/
- Duolingo streak-milestone share cards are "simple, attractive" cards featuring the flaming mascot, shared without
  leaving the app. [verified, 2022-01-21] https://blog.duolingo.com/streak-milestone-design-animation

---

## 3. Self-tracking / journaling apps with strong design

| App | App Store snapshot (2026-09-25) | Awards | Source |
|---|---|---|---|
| Finch | 4.9★, 756K ratings, #14 Health & Fitness, Editors' Choice | — | https://apps.apple.com/us/app/finch-self-care-pet/id1528595748 |
| Structured | 4.8★, 166K, #95 Productivity, Editors' Choice | ADA 2026 finalist (Inclusivity) | https://apps.apple.com/us/app/structured-daily-planner-todo/id1499198946 · https://developer.apple.com/design/awards/ |
| Daylio | 4.8★, 62K; IAP $4.99–$59.99 | — | https://apps.apple.com/us/app/daylio-journal-daily-diary/id1194023242 |
| How We Feel | 4.9★, 30K, #125 H&F, Editors' Choice, free | — | https://apps.apple.com/us/app/how-we-feel/id1562706384 |
| Stoic | 4.8★, 36K, Editors' Choice | — | https://apps.apple.com/us/app/stoic-mental-health-journal/id1312926037 |
| Streaks | 4.8★, 27K, #2 paid H&F, $5.99, Editors' Choice | ADA 2016 | https://apps.apple.com/us/app/streaks/id963034692 · https://crunchybagel.com/apple-design-awards-2016/ |
| (Not Boring) Habits | 4.8★, 6.2K, Editors' Choice | **ADA 2022 winner, Delight & Fun** | https://apps.apple.com/us/app/not-boring-habits/id1593891243 · https://developer.apple.com/design/awards/2022/ |
| Gentler Streak | 4.7★, 8.8K, Editors' Choice | **ADA 2024 winner, Social Impact**; 2023 finalist (Visuals); 2022 Watch App of the Year | https://apps.apple.com/us/app/gentler-streak-workout-tracker/id1576857102 · https://www.apple.com/newsroom/2024/06/apple-announces-winners-of-the-2024-apple-design-awards/ |
| Rise | 4.7★, 70K, #15 H&F, Editors' Choice | ADA 2023 finalist (Innovation) | https://apps.apple.com/us/app/rise-sleep-tracker/id1453884781 · https://developer.apple.com/design/awards/2023/ |
| Bearable | 4.8★, 6.4K | — | https://apps.apple.com/us/app/bearable-symptom-tracker/id1482581097 |

### (Not Boring) Habits: the strongest "feel" reference
- The checkbox needs an **intentional, prolonged press**, then fires **custom haptics + custom sound + particle
  explosion**. 3D was made in Blender and rendered in SceneKit. The app has a 66-level hero's-journey structure. "Thousands
  of iterations." Andy Allen: "you have to put in what's taken away… intentionally layer and layer and push and push," and
  "I don't want to live in a perfectly white-walled museum." [verified, 2022-08-29] https://developer.apple.com/news/?id=9ab1g4r3
- **Pricing is almost identical to Calibrate's plan:** Super !Boring Yearly **$29.99**, !Habits Plus Lifetime **$59.99**,
  monthly $7.99, and **paid cosmetic skins $4.99–$9.99**. The listing says "No streaks or guilt-based messaging" and
  offers weekly/monthly/yearly recaps. [verified snapshot] https://apps.apple.com/us/app/not-boring-habits/id1593891243
- Takeaway: this is proof that **cosmetics (skins/themes) sell at exactly Calibrate's price points**, and that a
  deliberate press → haptic → particle moment is award-winning craft. It is the natural model for the Resolve tap.

### Gentler Streak / The Outsiders (Gentler Stories)
- The design principle is **no guilt**: copy is "supportive but not cheesy, motivating but not fake-hyped." A heart
  mascot (Yorhart) by illustrator Sören Selleslagh. Hard data is translated into daily status "in everyday language."
  [verified, 2024-09-11] https://www.sketch.com/blog/gentler-streak/
- A 2025 redesign went from 4 tabs to 3, with a single central "Activity Path" visual that shows in/above/below range at
  a glance. [verified, 2025-03] https://www.bgr.com/tech/gentler-streak-gets-a-major-redesign-focused-on-your-wellbeing/
- Paywall: yearly / monthly / lifetime. The onboarding has 11 steps, followed immediately by a "50% OFF" offer with a
  47-hour countdown. [secondary] https://screensdesign.com/showcase/workout-tracker-gentler-streak
- The same studio's **The Outsiders**, which has a "Training Readiness Score," was an **ADA 2026 finalist in
  Interaction**. [verified] https://developer.apple.com/design/awards/
- Takeaway: the tone model for "Guesser". The lowest tier must read as a starting point, not a grade.

### Finch
- A virtual pet (a bird) that grows egg → adult as you do self-care. It has an adventure loop, a soft currency and a
  kawaii aesthetic. The listing says it uses "positive reinforcement without penalties." [verified snapshot] App Store URL above.
  Core free; Finch Plus is premium. [verified] https://finchcare.com/about-finch
- Revenue ($30M+ ARR, no VC): **[unverified]**. The only source is a newsletter that cites nothing. https://blog.sparrowapps.io/p/finch-how-a-self-care-app-hit-30m-arr-without-vc-money

### How We Feel
- A color-coded emotion matrix: four quadrants (energy × pleasantness), 100+ emotion words, built with the Yale Center
  for Emotional Intelligence. The product team is led by Pinterest co-founder Ben Silbermann. [verified] https://medicine.yale.edu/news-article/the-how-we-feel-app-helping-emotions-work-for-us-not-against-us/ · App Store URL above.
- Takeaway: a **2-D color field as the input**. Color carries meaning (quadrant), not decoration. This is relevant if the
  confidence input becomes a colored band instead of ±5 buttons.

### Daylio
- "Year in Pixels": a mosaic of one colored cell per day, **exportable as a shareable image**. Logging is tap-an-icon
  with no typing. [secondary] https://en.wikipedia.org/wiki/Daylio · [verified snapshot] App Store URL above.
- Takeaway: a Wrapped-lite artifact that accumulates daily. *Recommendation:* a "Year in Predictions" grid (one cell per
  resolved prediction, colored hit/miss by confidence band) would be a cheap second share artifact.

### Streaks
- ADA 2016. **78 color themes**, 600+ task icons. [verified snapshot] https://apps.apple.com/us/app/streaks/id963034692
- Takeaway: themes as a long-standing, low-cost Plus lever (Calibrate already plans them).

### Structured, Stoic, Rise, Bearable
- Structured: ADA 2026 finalist (Inclusivity), a visual timeline, and on-device task suggestions from Foundation Models.
  [verified] https://developer.apple.com/design/awards/
- Stoic: Editors' Choice, "elegantly designed journaling app"; lifetime $299. [verified snapshot] App Store URL above.
- Rise: a 0–100 "Energy Potential" score tied to sleep debt; $69.99/yr with a 7-day trial. [secondary] https://www.risescience.com/blog/is-the-rise-sleep-app-worth-it
- Bearable: a dense correlations tool whose reviewers note "a ton of ways to customize that can seem overwhelming." [verified snapshot] App Store URL above. **Not a visual reference.**

---

## 4. Score-centric health apps (hero number, provisional states, trends)

### WHOOP
- One 0–100 Recovery % with a **strict three-color semantic system: green 67–100, yellow 34–66, red 0–33.**
  [verified] https://www.whoop.com/us/en/thelocker/how-does-whoop-recovery-work-101/ (search snippet, page 403 on fetch) · https://liveworksleep.com/whoop-app-features/
- Almost entirely black background. Hero score at **~72pt**, supporting text deliberately small. Three-tier progressive
  disclosure (three numbers → weekly trends → 30-day raw data). [secondary, 2026-03-24] https://www.925studios.co/blog/whoop-design-breakdown
- A 2025 home redesign: one scrolling view with new dials, and long-term metrics moved to a Health tab. [verified] https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/ (search snippet)
- **Provisional state:** during the first ~4 days the Recovery score is **grayed out** while WHOOP "calibrates." It is
  personalised from Day 4 and fully baselined at 30 days. [secondary: WHOOP support page text via search snippet; the page
  returned 401 on fetch] https://support.whoop.com/hc/en-us/articles/360019622573-What-is-the-Recovery-calibration-period-
  The API exposes a `user_calibrating` flag and `score_state` (SCORED / PENDING_SCORE / UNSCORABLE). [verified] https://developer.whoop.com/docs/developing/user-data/recovery/
- 4.8★, 81K, #51 H&F. [verified snapshot] https://apps.apple.com/us/app/whoop/id933944389
- Takeaway: **show the score's shape, grayed, with a "calibrating" label.** Don't replace it with a different big number.
  WHOOP even uses the same word as Calibrate.

### Oura
- Readiness bands: **85–100 Optimal, 70–84 Good, 60–69 Fair, 0–59 Pay Attention**, with a **crown icon at ≥85**.
  [verified] https://support.ouraring.com/hc/en-us/articles/360025589793-Readiness-Score
- The Oct/Nov 2025 redesign went from 5 tabs to 3 (Today / Vitals / My Health). Today is built around **"One Big Thing"**,
  "like the 'Top Stories' page of a news app." **Parts of the app change color depending on biometrics.** My Health holds
  weekly, quarterly and yearly reports. [verified] https://ouraring.com/blog/new-oura-app-experience/ · https://9to5google.com/2025/10/20/oura-app-redesign/
- Baseline: Oura recommends about two weeks of wear before metrics are personalised. [secondary] https://www.sleepfoundation.org/best-sleep-trackers/oura-ring-review
- 4.9★, 303K, #13 H&F. [verified snapshot] https://apps.apple.com/us/app/oura/id1043837948
- Takeaway: **named bands plus one icon at the top band** (crown ≈ "Sharp") make a raw number legible. Calibrate's badge
  thresholds (70/85/90) line up almost exactly with Oura's 70/85 cut points.

### Bevel
- Uses Apple Watch data to produce Recovery / Sleep / Strain / Stress scores plus "Energy Bank". **Core made free in late
  2025; the paid Pro tier = AI coaching ("Bevel Intelligence"), health records, biological age.** [secondary, 2026] https://kiledjian.com/2026/07/07/bevel-turns-apple-watch-data.html · https://www.healthappinsider.com/en/reviews/bevel-review
- Pro is $14.99/mo, $99.99/yr. 4.8★, 16K, #155 H&F. [verified snapshot] https://apps.apple.com/us/app/bevel-all-in-one-health-app/id6456176249
- Takeaway: **the closest business-model analogue** (free scores, paid AI interpretation). This validates Calibrate's
  Coach-as-Plus split.

---

## 5. Gamified learning (Duolingo, Brilliant)

### Duolingo
- **ADA 2023 winner, Delight and Fun.** [verified] https://developer.apple.com/design/awards/2023/ · 4.7★ from 5.5M, #1 Education. [verified snapshot] https://apps.apple.com/us/app/duolingo-language-lessons/id570060128
- Typography: custom **Feather Bold** (by Fontsmith/Monotype for the 2019 Johnson Banks identity) for headlines, with
  **DIN Next Rounded** for UI. [verified] https://www.monotype.com/studio/portfolio/duolingo · [secondary] https://fontsinuse.com/uses/59497/duolingo-app
- Milestones: 7 days, 1 month, 100 days, 1 year. The mascot transforms into a phoenix. There is a share card.
  [verified, 2022-01-21] https://blog.duolingo.com/streak-milestone-design-animation
- **Primary-source effect sizes (use these, not blog numbers):** milestone animations raised the chance a new learner was
  still active at Day 7 by **+1.7%**. Doubling Streak Freeze capacity raised daily actives by **+0.38%**. Learners who reach a
  7-day streak are **3.6× more likely to finish their course**. [verified, 2022-01-31] https://blog.duolingo.com/how-duolingo-streak-builds-habit
- Character animation runs on **Rive state machines** (lip-sync visemes). [verified] https://blog.duolingo.com/world-character-visemes
- **Inflated third-party numbers to avoid citing:** "next-day retention 12% → 55%," "widget increased commitment 60%," and
  "Streak Freeze reduced churn 21%" all appear only on secondary blogs with no primary source. **[unverified]** https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/

### Brilliant
- Rebuilt its "game feel" in early 2023 on **Rive**. The streak animation is event-triggered and **synced to the number
  counting up**. Learning paths are color-coded by topic. The team saved about a day per design iteration compared with
  Lottie. [verified, 2024-05-02] https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations
- ustwo engagement: a "Game Feel North Star," "whimsical in-lesson flourishes that celebrate success," and a Level
  Gameboard. Success was measured by week-one retention. [verified, undated] https://ustwo.com/work/brilliant/
- Takeaway: **animate the number, not just the confetti.** A score or badge that counts up in sync with a celebration
  reads as earned.

---

## 6. Paywall and onboarding evidence

- **RevenueCat State of Subscription Apps 2026** (115K+ apps, $16B; published 2026-03-19):
  - trials of **17–32 days convert at 42.5% median, versus 25.5% for trials under 4 days**;
  - hard-paywall Day-35 conversion **10.7% versus freemium 2.1%**; D60 revenue per install $3.09 versus $0.38;
  - **55% of trial cancellations happen on Day 0**;
  - 35% of annual cancellations happen in month 1.

  [verified] https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 · https://www.revenuecat.com/state-of-subscription-apps

  Implication: Calibrate is freemium by design, so it should expect paywall conversion near the low benchmark. The
  1-month trial choice is well supported.
- **Apple began rejecting "toggle" (trial on/off) paywalls in mid-January 2026** under Guideline 3.1.2 ("confusing and
  may prevent users from understanding that they are committing to an auto-renewing subscription"). The recommended
  replacements are the **timeline/"honest" paywall**, a multi-package selector, a value-first paywall and exit offers.
  [verified, 2026-02-09] https://www.revenuecat.com/blog/growth/rip-toggle-paywall
- **Blinkist honest-trial paywall:** a timeline of Today → reminder before trial end → charge, plus "cancel at least 24h
  before." Results: **+23% trial starts, −55% complaints, and push opt-in rose from 6% to 74%.** [verified, the case study
  cites 2021 publications] https://growth.design/case-studies/trial-paywall-challenge · https://uxplanet.org/how-solving-our-biggest-customer-complaint-at-blinkist-led-to-a-23-increase-in-conversion-b60ad514134b
- Top-app patterns: **lead with annual as "only one choice to make"**, highlight "Most Popular", and add pre-paywall
  context slides (a three-slide carousel took one app from 2% to 15% trial opt-in). Include post-purchase "aftercare" that
  celebrates and lists what's unlocked. [verified, 2025-06-12, updated 2025-12-14] https://www.revenuecat.com/blog/growth/how-top-apps-approach-paywalls
- Onboarding-quiz length ("3–5 questions," "90–180 s to paywall," "2–3× trial starts") is from vendor blogs with no
  underlying dataset. **[unverified]** https://www.airbridge.io/en/blog/5-steps-app-onboarding-before-the-paywall

---

## 7. Platform craft (iOS 2025–2026)

- **ADA 2026 winners emphasise Liquid Glass:** Tide Guide won Visuals & Graphics for "full-screen charts … filled with
  custom animations," Liquid Glass integration and a "sky-matching palette." Moonlitt won Interaction for "easy onboarding
  and best-in-class Liquid Glass integration." [verified, 2026-06] https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/
- Expo SDK 54 ships `expo-glass-effect` (`GlassView`, iOS 26+, falls back to a plain View elsewhere). [verified] https://docs.expo.dev/versions/latest/sdk/glass-effect/ · https://expo.dev/changelog/sdk-54
- Apple HIG: "use the system-defined haptics consistently," and system apps use haptics to signal success or failure.
  Pair haptics with visual feedback so it survives a muted phone or VoiceOver. [verified via search snippet; the HIG page is
  JS-rendered] https://developer.apple.com/design/human-interface-guidelines/playing-haptics · https://developers.apple.com/design/human-interface-guidelines/patterns/feedback/
- ADA 2025 and 2026 app winners are mostly indie/utility apps, and AI-centric apps were absent in 2025.
  [verified] https://techcrunch.com/2025/06/04/apple-names-2025-design-awards-winners · https://developer.apple.com/design/awards/2025/

---

## 8. Highest-leverage design moves for Calibrate

Each move ties to an app and a source above.

1. **Give every badge tier an owned color and an illustrated emblem; drop the emoji.** Five tiers, five colors, one geometric
   illustration style. *Ref: 16Personalities role colors + Zeda Labs characters (§2).*
2. **Replace the "20" countdown hero with a grayed-out score silhouette labelled "Calibrating · 3 of 20".** Keep the
   countdown as the sub-line. *Ref: WHOOP grayed-out Recovery while calibrating (§4); Oura baseline period.*
3. **Put named bands and a top-band icon on the 0–100 score** (e.g. <70 / 70–85 / 85–90 / 90+). The band carries the color;
   the number stays neutral. *Ref: Oura bands + crown at ≥85 (§4); WHOOP three-color semantics.*
4. **Warmup verdict as a story reveal:** one statement per screen, then the chart, then the share card. Use blunt copy on a
   near-monochrome canvas with one accent color at the reveal. *Ref: Spotify Wrapped 2025 "selective pops of color" + Clubs
   (§2); Co–Star voice (§2).*
5. **Make Resolve a press-and-hold with a success haptic + particle burst**, and animate the score and badge progress
   counting up in sync. *Ref: (Not Boring) Habits ADA 2022 (§3); Brilliant's Rive streak synced to the counter (§5); Apple
   HIG haptics (§7).*
6. **Make confidence the Log hero:** a large percentage (≥48pt) on a draggable colored band, with the integrity-bonus zone
   (35–65) visibly tinted, and a selection haptic at each 5% step. *Ref: Polymarket "prices = probability" big-number
   convention (§1); How We Feel color-field input (§3).*
7. **Share card at 9:16, 1080×1920, with safe zones, per-category show/hide toggles and titles hidden by default.** *Ref: Any
   Distance eye-toggles + ADA 2023 (§2); Instagram Stories spec (§2).*
8. **Build the paywall as an honest timeline:** Today → Day 28 reminder → Day 30 charge; annual pre-selected and shown first;
   one CTA; an "aftercare" screen after purchase. *Ref: Blinkist +23%/−55% (§6); RevenueCat top-app patterns; Apple's 2026
   toggle rejections.*
9. **No-guilt copy and art for the low tiers and missed predictions.** "Guesser" should read as "starting point," following
   Gentler Streak's "supportive but not cheesy." *Ref: Gentler Streak ADA 2024 (§3); Finch "no penalties."*
10. **Celebrate milestones with a share card** at the Tracker unlock, first non-provisional score, and 50 and 100
    resolutions. *Ref: Duolingo milestones, measured +1.7% D7 (§5).*
11. **A second, accumulating share artifact:** a "Year in Predictions" pixel grid. *Ref: Daylio Year in Pixels (§3).*
12. **Pick one brand hue (the indigo #4F46E5), and use a rounded or display face for numbers only.** *Ref: Duolingo Feather +
    DIN Rounded split (§5).* (The exact font choice is a *Recommendation*.)

## 9. Best overall visual references

1. **(Not Boring) Habits.** It is the closest match on feel, category and even price ($29.99/yr, $59.99 lifetime, paid skins),
   and it won ADA 2022 for turning a checkbox into a physical event. Model Resolve and the badge cosmetics on it.
2. **WHOOP / Oura** (treat them as one reference). They show how a single 0–100 score, named bands and a *calibrating* state
   are presented to millions. Model the Stats hero and provisional states on them.
3. **Spotify Wrapped 2025** (with Co–Star for voice). It is the best evidence that archetype + receipts + selective color
   drives sharing (500M shares on day one). Model the Warmup verdict, identity card and Wrapped on it.

## 10. Could not verify

- Co–Star's typeface; WHOOP and Oura typefaces.
- Finch revenue ($30M+ ARR).
- Duolingo third-party retention claims (12%→55%, widget +60%, freeze −21%).
- Onboarding-quiz length and lift benchmarks (vendor blogs only).
- The WHOOP "grayed out" wording: seen in a search snippet of WHOOP's support page, which returned 401 when fetched.
- Spotify Wrapped share-card aspect ratio: the 9:16 Stories format is inferred from the platform spec, not stated by Spotify.
- 16Personalities' "1.58B tests" is self-reported.
