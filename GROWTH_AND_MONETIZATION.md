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

---

## 2. Market Research & Benchmarks (2026)

**Subscription conversion** *(RevenueCat, State of Subscription Apps 2026 — 115K apps,
$16B+ revenue)*
- Hard paywall vs freemium: ~10.7% vs ~2.1% Day-35 trial-to-paid (~5x); revenue per
  install at day 60 ~$3.09 vs ~$0.38 (~8x).
- Year-1 retention is nearly identical between models (~27–28%) — freemium's weakness
  is conversion *speed/rate*, not long-term stickiness.
- ~55% of 3-day-trial cancellations happen on **Day 0** — the "aha" must land in the
  first session.
- Longer trials convert far better: 17–32 day trials ~42.5% vs ~25.5% for trials under
  4 days.
- **AI features sell but don't stick:** AI-powered apps earn ~41% more revenue per
  payer but churn ~30% faster. Use AI to drive conversion, not as the retention spine.
- The market is a sorting machine: top-decile apps grew ~306% while the median grew
  ~5.3%. Positioning and shareability are what separate them.

**Pricing anchors** *(2026 habit/wellness app roundups)*
- One-time: Streaks ~$5.99, Productive ~$3.99, HabitNow ~$11.99.
- Subscription band: mostly **$3.99–9.99/mo** and **~$20–60/yr**. Examples: Routinery
  ~$4.99/mo or ~$47.99/yr; HabitBull ~$4.99/mo or ~$19.99/yr; Me+ ~$9.99/mo or
  ~$59.99/yr; Finch ~$9.99/mo or ~$69.99/yr (with a complete free tier).
- **Habitica** is the model to copy: every core feature free with no time limit;
  the subscription buys cosmetics and extras only. This is "light monetization" done
  right — the paywall never touches the thing that makes the app work.

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
- **14-day trial on the annual plan.** The data strongly favors trials in the ~2-week+
  range over short ones; 14 days also gives enough resolutions to make the AI insight
  value legible before the charge.
- Keep the price in the middle of the band. Don't undercut to $1.99 — higher price
  points convert at least as well and set a "serious tool" frame consistent with the
  calibration positioning.

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
RevenueCat *State of Subscription Apps 2026*; 2026 habit/wellness app pricing roundups
(2sync, RoutineBase, HabitBox, loggd.life); Spotify Wrapped growth-loop case studies
(NoGood, Growth Academy, and others). Figures are directional and paraphrased; re-verify
pricing at implementation time.
