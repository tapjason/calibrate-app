# Calibrate — Growth & Monetization Reroute

Companion to `BUILD_PLAN.md` and `CLAUDE.md`. This document reroutes the build toward
**light (freemium) monetization** and specifies the growth loop that makes a generous
free tier viable. Section 6 amends the existing layer plan directly — nothing here
replaces the core Log → Resolve → Stats loop; it wraps a money layer and a sharing
layer around it.

---

## 1. The Model in One Paragraph

Give the **entire core loop away free, forever** — logging, resolution, calibration
score, the curve, per-category badges, streaks, and (critically) the shareable
result cards. Charge a small optional subscription (**Calibrate Plus**) only for the
*insight, depth, and cosmetic* layer on top. The free tier is not a crippled trial;
it is the **acquisition engine** — free users sharing their calibration reveal is how
new users arrive. This is the Habitica pattern (core free for life, subscription is
essentially cosmetic/extra), not the "hit a wall at 3 items" pattern.

**Why freemium and not a hard paywall:** industry data (below) shows hard paywalls
convert ~5x better and earn ~8x more revenue per install. We are knowingly giving that
up because Calibrate's growth depends on free users producing shareable artifacts.
Freemium is the correct model *only* when free users drive word-of-mouth — which is our
entire growth thesis. If that loop doesn't materialize, revisit this decision.

**Be honest about the asymmetry in that argument.** The 5x and 8x figures are measured.
The compensating virality is not: RevenueCat's 2026 report does not address
word-of-mouth or sharing at all, so nothing in the cited data says a strong share loop
recovers the gap. We are trading a quantified loss for an unquantified hope. That can
still be the right call — it is how Habitica and Duolingo got their distribution — but
it means §7's share-rate metric is not a nice-to-have dashboard tile. It is the single
number that tells us whether this document's central premise is true, and it is the one
thing that should gate building a checkout.

---

## 2. Market Research & Benchmarks

*Re-verified against primary sources 2026-08-31. Figures below were checked directly;
where the original draft's number could not be reproduced it is marked.*

**Subscription conversion** *(RevenueCat, State of Subscription Apps 2026 — 115K apps,
$16B+ revenue)*
- Hard paywall vs freemium: **10.7% vs 2.1%** Day-35 trial-to-paid (~5x); revenue per
  install at day 60 **$3.09 vs $0.38** (~8x). Also $2.32 vs $0.27 at day 14. ✅ verified
- Year-1 retention is nearly identical between models (**27% hard paywall, 28%
  freemium**) — freemium's weakness is conversion *rate*, not long-term stickiness.
  ✅ verified
- **55.4%** of 3-day-trial cancellations happen on **Day 0**, and 84% by Day 1 — up
  ~4 points from 2025. The "aha" must land in the first session. ✅ verified
- Longer trials convert far better: 17–32 day trials **42.5%** vs **25.5%** for trials
  under 4 days (~70% better). Note the industry is moving the *other* way — 46.5% of
  apps shortened to under 4 days in 2026, under pressure to show fast revenue. Being
  contrarian here is cheap for us. ✅ verified
- **AI features sell but don't stick.** Sharper than the original framing: AI apps show
  **41% higher Year-1 realized LTV ($30.16 vs $21.37)**, but AI *monthly* plans retain
  **36% worse over 12 months**. The retention penalty concentrates in monthly plans,
  which is an argument for pushing annual on AI-driven signups specifically.
  ✅ verified, refined
- The market is a sorting machine: **top-quartile apps grew 80%+ YoY MRR while the
  bottom quartile shrank by a third** — a 113-point spread. ⚠️ *The draft's "top-decile
  +306% vs median +5.3%" could not be reproduced in the 2026 report; it may be from the
  2025 edition. Replaced with the figures actually published for 2026.*

**Pricing anchors** *(habit/wellness roundups, spot-checked 2026-08-31)*
- One-time: Streaks **$5.99** ✅, Productive ~$3.99, HabitNow ~$11.99.
- Subscription band holds: mostly **$3.99–9.99/mo** and **~$20–70/yr**. Finch
  **$9.99/mo or $69.99/yr** ✅ (with a genuinely usable free tier); Routinery
  **$4.99/mo or $47.99/yr** ✅; HabitBull ~$4.99/mo or ~$19.99/yr; Me+ ~$9.99/mo or
  ~$59.99/yr. Prices vary by platform and region.
- Routinery is worth noting twice: its subscription buys **cosmetic perks only**, and
  it sits mid-band while doing it. That is direct evidence the Habitica pattern prices
  normally — a cosmetics-and-depth subscription does not have to be discounted.
- **Habitica** remains the model to copy: every core feature free with no time limit;
  the subscription buys cosmetics and extras only. This is "light monetization" done
  right — the paywall never touches the thing that makes the app work.

**Store commission and link-out economics** *(new since this document was drafted —
unsettled, watch it)*
- Following the April 2025 injunction in *Epic v. Apple*, Apple **cannot currently
  charge any commission** on US purchases made through an external link out of the app,
  and cannot impede developers from telling users about them.
- In **August 2026** Apple proposed link-out commissions of **15% standard / 5% for
  Small Business Program** developers. Epic opposes it, arguing the correct figure is
  0%. **Not settled** — do not plan on a specific number.
- **Re-checked 2026-10-04:** the Supreme Court granted Apple's petition in June 2026
  (the question is whether contempt can rest on an injunction's "spirit"); Apple's
  merits brief was filed 2026-09-14, argument is unlikely before January 2027 and a
  decision before June 2027. The district-court proceeding on Apple's 15%/5% proposal
  has stalled over document production. Until either court rules, the US link-out
  rate stays at **0%**. Practical reading: nothing here changes before mid-2027.
- Why this matters here more than it would for most apps: our whole model concedes a
  low revenue-per-install, so take rate is proportionally larger. On a $29.99 annual
  plan, App Store IAP at the Small Business 15% nets **$25.49**; a web link-out nets
  **$29.99** today, or **$28.49** if Apple's proposed 5% survives. That is a 12–18%
  swing on every renewal, for a plan whose stated expectation is "modest and slow".
- Practical stance for now: ship IAP through RevenueCat as planned (it is what the
  sandbox and restore flows need, and it is the path of least friction on Day 0), but
  treat a web-checkout link as a live option worth revisiting once there is revenue to
  optimize. Do not build it before the share-rate gate in §8 clears.

**The growth loop** *(Spotify Wrapped case analyses)*
- Shareability is baked into the product, turning users into the marketing channel and
  producing acquisition with near-zero ad spend; FOMO pulls non-users in to
  participate.
- Scale of the effect (Wrapped): millions of shares within 48 hours, hundreds of
  millions of short-video views within days, and a large launch-week engagement spike;
  early Wrapped years drove double-digit % download bumps in launch week.
- The transferable recipe for a small app: take data you already have → turn it into a
  personal *story about the user* → make it effortless to share. A dry stats report
  does **not** travel; a personalized, emotionally resonant, visually distinct card
  does.

---

## 3. Free vs. Plus

| Capability | Free (forever) | Calibrate Plus |
|---|---|---|
| Log / Resolve / Stats core loop | ✅ | ✅ |
| Calibration score + curve | ✅ | ✅ |
| Per-category badges + streaks | ✅ | ✅ |
| **Shareable identity cards + Calibration Wrapped** | ✅ (this is the growth engine) | ✅ (extra themes) |
| Full prediction history | ✅ | ✅ |
| AI insights (pattern detection, pre-mortem, confidence nudge, AI digest) | — | ✅ |
| Advanced analytics (long-range trends, cross-category drill-down, export) | — | ✅ |
| Cosmetics (card/badge themes, custom Wrapped designs) | — | ✅ |

**Rule:** nothing that generates a shareable artifact is ever paywalled, and the core
loop is never capped. Plus sells *understanding and self-expression*, not *access*.

This formalizes the "Optional AI Features (V2+), gated behind Pro" note already in
`CLAUDE.md` — the AI insight tier becomes the spine of Plus.

---

## 4. Pricing Recommendation

- **Calibrate Plus: $4.99/mo or $29.99/yr** (annual anchored and shown first),
  optional **$59.99 lifetime** for the indie/one-time-payment crowd this app attracts.
- **DECIDED 2026-09-25: a one-month free trial on the annual plan**, auto-renewing
  into $29.99/yr unless cancelled. This supersedes the 14-day figure below and the
  17–21 day refinement under it. One calendar month sits inside the measured
  42.5% band ("17–32 days") rather than in the unmeasured gap, and it fits this
  app's specific shape: Plus value is legible only once predictions *resolve*, and
  a month is comfortably more than one resolution cycle. It is a store-side
  setting — the app renders whatever trial the store reports.

  What it costs: revenue is deferred a month per signup, and a trialist has Coach
  for that month. The latter is bounded by the per-user daily cost ceiling the
  Coach endpoint already enforces, so the exposure is capped rather than open.

  The original reasoning, kept because the trial length is worth re-testing once
  there is conversion data: 14-day trial on the annual plan; the data strongly
  favors trials in the ~2-week+ range over short ones.
- Keep the price in the middle of the band. Don't undercut to $1.99 — higher price
  points convert at least as well and set a "serious tool" frame consistent with the
  calibration positioning.

**Still current as of 2026-08-31.** The band was re-checked against live pricing and
$4.99/$29.99 remains mid-market; Finch at $9.99/$69.99 and Routinery at $4.99/$47.99
bracket it. Two refinements from the re-verification:

- **Consider 17+ days rather than exactly 14.** The measured cliff is between "under 4
  days" (25.5%) and "17–32 days" (42.5%); 14 sits in the unmeasured gap between them.
  Nothing says 14 is wrong, but if we are picking a number off this data, 17–21 is the
  band it actually supports. It also fits our specific problem better than most apps':
  Plus value is legible only once predictions *resolve*, and a 14-day trial gives a
  new user roughly one resolution cycle.
- **Push annual harder for AI-driven signups.** The AI retention penalty concentrates
  in monthly plans (36% worse over 12 months). If Coach is what converts someone, a
  monthly plan is the worst container for that subscription.

Net revenue depends on an unsettled legal question — see the link-out note in §2 before
treating $29.99/yr as $29.99/yr.

---

## 5. The Three Mechanics That Make This Work

### 5.1 Day-0 Aha — "Calibration Warmup" (onboarding)
A calibration score is meaningless until predictions resolve weeks later, but the trial
is won or lost on Day 0. Fix: a 60-second onboarding quiz of ~8–10 estimation/trivia
questions ("What year was X? How confident, 50–100%?"). Instantly render a mini
calibration chart — "You were 85% confident but right 55% of the time. You're
**overconfident**." This delivers the core insight in the first session, teaches the
mechanic, and is itself the first shareable card. This is the single highest-leverage
addition in this document.

### 5.2 Acquisition Loop — Identity Cards + Calibration Wrapped (free)
- **Category identity card:** "Sharp in health · Guesser in money" — a personality-test
  result *with receipts*. Screenshot-native, visually distinct, one-tap share.
- **Calibration Wrapped:** a weekly and a yearly recap of the user's forecasting story
  (best/worst domains, biggest overconfidence miss, streak, trajectory).
- Design share-first: vibrant, animated, self-contained, with a subtle "get your own"
  hook. Every share is a free ad. This is *why* the free tier is generous.

### 5.3 Conversion Hook — the Plus insight tier (paid aha)
AI insights are the most compelling upsell (and per the data, AI drives conversion).
Surface them contextually and softly: when a free user views their stats, tease one
locked insight ("We found a pattern in your Monday predictions — unlock with Plus").
Because AI payers churn faster, pair AI with the sticky non-AI Plus value (deep
analytics, cosmetics) so the subscription survives past the novelty.

---

## 6. Build Reroute — Amendments to `BUILD_PLAN.md`

Same abstraction-layer discipline and Gates. New/changed items only.

> **Status, 2026-10-03: all of this section is built**, including the two items the
> note below calls unbuilt — Plus cosmetics (`src/constants/cardThemes.ts`,
> `ThemePicker`) and the advanced-analytics tier (`src/engine/trends.ts`, CSV export,
> `TrendsPanel`). The paywall names only features that exist.
>
> **Status, 2026-08-31.** Most of this section is now built — see `BUILD_PLAN.md`'s
> "Where the build is" for the current state, which is the one to trust. Everything
> below is done except **Plus cosmetics and the advanced-analytics tier** — as of
> 2026-09-07 RevenueCat billing, the paywall screen, and the paywall store (shipped as
> `usePaywallStore` in `src/store/paywallStore.ts`) are built. The paywall currently
> names those two unbuilt features; they get built or the copy gets cut before it goes
> live. Two things drifted from what this section predicted:
> the AI endpoint shipped as **`/functions/v1/coach`**, specified in detail by
> `COACH_AGENT.md` (there is no `/functions/v1/insights`), and the weekly digest is a
> local Expo notification (`src/notifications/digest.ts`), not an Edge Function.

**L1 — Types & Contracts**
- Add `Entitlement` (`{ isPlus: boolean; source; expiresAt }`), `ShareCard` payload,
  and `WarmupResult`. Extend nothing else.
- *Gate:* `tsc --noEmit` passes; types still defined only here.

**L2 — Data Access**
- Add a small `entitlements` cache table (source of truth is the billing SDK
  server-side; this is just a local mirror for offline gating).
- *Gate:* entitlement read/write round-trips; absence defaults to free.

**L3 — Domain Logic**
- Reuse the calibration engine for the Warmup scorer (pure function over the quiz set).
- Add **deterministic** insight functions here (e.g., day-of-week accuracy,
  category drift). Keep only the LLM-phrased insights in L5.
- *Gate:* warmup fixtures produce expected mini-scores; deterministic insight functions
  unit-tested.

**L4 — State**
- `useEntitlementStore` (exposes `isPlus`, gates). Optional `usePaywallStore` for
  presentation state.
- *Gate:* toggling entitlement flips gated selectors; no billing logic in stores.

**L5 — Services**
- Billing: integrate **RevenueCat** (wraps StoreKit/Play Billing, handles receipts and
  the involuntary-churn problem the data flags on Android). Expose purchase/restore.
- Extend the existing Supabase Edge Function pattern: add `/functions/v1/insights` and
  `/functions/v1/digest` alongside `refine`. Same server-side-key, fail-silent rule.
- Share-card image export (via `react-native-view-shot` over the SVG card, or render to
  `react-native-svg` and rasterize).
- *Gate:* a sandbox purchase unlocks `isPlus`; restore works; a forced insight-endpoint
  failure leaves the free experience untouched; a share card exports to a PNG the OS
  share sheet accepts.

**L6 — Presentation**
- Onboarding **Warmup** flow (new first-run screen, before Home).
- Share-card generator + Wrapped screens (free).
- Paywall screen + soft contextual upsell surfaces on Stats.
- Cosmetic theming for cards/badges (Plus).
- *Gate:* component tests for Warmup and the paywall; manual run: warmup → share card →
  stats upsell → sandbox subscribe → cosmetics unlock.

**L7 — Native & Store**
- Configure IAP products (monthly/annual/lifetime) in App Store Connect + RevenueCat
  dashboard; add subscription privacy declarations; verify restore on device.
- *Gate:* signed build completes a real sandbox subscription and restore on hardware.

### Revised Sequence
```
L0 → L1 → L2 → L3 → L4 → L6(core UI)
  → 5.1 Warmup (Day-0 aha)          ← build EARLY; it's onboarding + first share card
  → 5.2 Share cards + Wrapped (free) ← the growth loop; build BEFORE billing
  → L5 services (notifications → sync → AI insights)
  → Billing + Paywall + Plus gating  ← LAST. Don't build a checkout before there's
                                        something worth paying for.
```
This preserves the existing principle: the app is fully usable — and now fully
*shareable* — before any paid or backend service exists.

---

## 7. Metrics to Instrument (from day one)

- **D0 aha completion:** % of new users who finish the Warmup and see their first chart.
- **Share rate:** shares per active user; installs attributed to shared cards (the
  viral coefficient — this number justifies the whole free tier).
- **Free → Plus conversion** and **trial-to-paid**; run a trial-length experiment
  (7 vs 14 vs 30 days) since the data shows large swings here.
- **Plus churn**, split AI-heavy vs analytics/cosmetic users, to confirm the sticky
  layer is doing its job.

---

## 8. Honest Risks / Validate Before Over-Investing

- **The viral loop is a hypothesis, not a guarantee.** Freemium only pays off if share
  rate is real. Validate cheaply first: ship the Warmup + share card, measure whether
  people actually share, *before* building billing. If nobody shares, the whole
  light-monetization premise (and arguably the consumer version) is wrong — and that's
  the moment to reconsider the paid vertical instead.
- **Revenue will be modest and slow** relative to a hard paywall. Accept that this is a
  reach/brand play, not a fast-cash play.
- **AI insight quality is load-bearing** for conversion. A generic "you're doing great"
  won't convert; a specific, surprising, *true* pattern will. This is worth real prompt
  and eval effort.
- **Don't let cosmetics arrive before substance.** They monetize attachment that only
  exists once the core insight has landed.

---

## Sources

Re-verified 2026-08-31. Figures marked ✅ in §2 were checked against these directly;
everything else remains directional and paraphrased.

- RevenueCat, *State of Subscription Apps 2026* (115K apps, $16B+ revenue) —
  [report](https://www.revenuecat.com/state-of-subscription-apps) ·
  [10-minute summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- AI revenue/retention split —
  [PPC Land summary](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/) ·
  [TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)
- Trial length —
  [RevenueCat on choosing trial duration](https://www.revenuecat.com/blog/growth/7-day-trial-subscription-app)
- Apple link-out commissions, status at 2026-09-15 —
  [Tech Times](https://www.techtimes.com/articles/327527/20260915/app-store-commission-limbo-enters-new-phase-apples-epic-merits-brief-opens-scotus-fight.htm)
- Apple link-out commissions, Aug 2026 proposal —
  [TechCrunch](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/) ·
  [9to5Mac](https://9to5mac.com/2026/08/13/apple-proposes-commissions-of-up-to-15-for-off-app-store-purchases-in-the-us/) ·
  [RevenueCat on what the ruling means for developers](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy)
- Pricing roundups — [2sync](https://2sync.com/blog/best-habit-tracker-apps) ·
  [RoutineBase](https://routinebase.com/best-habit-tracker-apps/) ·
  [HabitBox](https://habitbox.app/blog/best-habit-tracker-app)
- Spotify Wrapped growth-loop case studies (NoGood, Growth Academy, and others) —
  not re-verified this pass.

**Two caveats worth carrying.** The RevenueCat report says nothing about word-of-mouth
or virality, so it cannot be cited in support of the share loop — only against the
conversion cost of freemium. And the link-out commission position is actively
litigated; re-check it before it enters a pricing calculation.
