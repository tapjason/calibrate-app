# Fairly Sure — Growth & Monetization

**As of:** 2026-11-16 (market figures last re-verified 2026-10-08; §2). Companion to
`BUILD_PLAN.md` and `CLAUDE.md`: this file holds the *why* and the go-to-market plan,
and `CLAUDE.md` governs what gets built. Everything the money and sharing layers need
is built (§6). The first TestFlight build is on the owner's iPhone (2026-11-16);
nothing has launched.

---

## 0. The plan on one page

**Model.** The whole core loop and every shareable card are free forever. *Fairly Sure
Plus* sells interpretation, depth and cosmetics: Coach, Trends, and card
themes. Free users sharing their cards is the growth thesis; the paid tier is how the
app pays for itself, not how it grows (§1).

**Prices** (set in App Store Connect, 2026-11-16; P1 is closed): **$4.99/month,
$34.99/year with a one-month free trial, $79.99 lifetime.** $34.99 sits at the 2026
median annual price across subscription apps ($34.80) and 12% under Health & Fitness
($39.94); lifetime is about 2.3× annual. Why: §4.

**Sequence, with what each step needs and what moves it on:**

| # | Step | Needs | Done when |
|---|---|---|---|
| 1 | **Give shares a way back to the store.** Text shares end on the App Store product page (`src/share/link.ts`; `APP_STORE_ID` set, the record named Fairly Sure). The campaign token (`ct=share-card-text` and so on, counted per campaign in App Store Connect with no SDK and nothing identifying anyone) is still off. | The first campaign link in App Store Connect → set `APP_STORE_PROVIDER_TOKEN`. | A shared text opens the product page, and the Campaigns report lists `share-*` rows. |
| 2 | **Create the products.** Done 2026-11-16: annual, monthly and lifetime at the prices above, on `plus` in the `default` offering; the TestFlight paywall loads all three. | The one-month trial moved from the monthly product, where it was set by mistake, to annual (the owner, in App Store Connect). | The paywall shows the store's prices and "1 month free" on annual. |
| 3 | **TestFlight with 20–50 people you can ask.** Build 2 is on the owner's phone; `docs/TESTFLIGHT_PLAN.md` stages it (the owner, then 5–8 people, then 20–50 for two weeks). Watch the Warmup, the first log, the first answer on Day 1, and whether anyone shares unprompted. | The owner's checks on the phone (`HUMAN_VERIFICATION.md` Batches C and D), the beta description and review info. | No crash or confusion that would sink a first review. |
| 4 | **Launch 1.0 in English-language storefronts, no paid installs.** ASO from `docs/APP_STORE_LISTING.md`, the rating prompt (D15), and the share loop. | Steps 1–3 (the privacy and support pages are live). | Live. |
| 5 | **Read the gates (§7) at 6 weeks or 1,000 first-time downloads, whichever is later.** | App Store Connect Analytics (downloads, campaigns), RevenueCat (trials, conversion), the app's own usage counts (guests' included, D43). | Each gate reads pass, watch or fail. |
| 6 | **Branch on the share gate.** Pass: build the share surfaces that are parked (D6 milestone cards, A11 practice card, A8 web Warmup as the card's landing page). Fail: stop adding share surfaces; growth comes from ASO and the rating; Plus depth before more sharing. Either way, **no paid installs** while revenue per install sits far below what one costs (§2). | Step 5. | A written call in this section. |
| 7 | **Then, and only with volume: a price test, and a second look at web checkout.** The annual price against one step up ($34.99 against $39.99) through RevenueCat Experiments, included in its free tier. Web checkout stays off unless the US commission picture or a test of our own changes the math (§2). | Roughly 100+ trials a month, or the test can't read. | A result, recorded here. |

**What would change the plan:** the share gate failing (§8), the link-out case
settling (§2), or Coach turning out to be what converts (then annual-first matters
more, §4).

---

## 1. The model, and the bet it makes

Give the **entire core loop away free, forever**: logging, resolution, calibration
score, the curve, per-category badges, streaks, daily practice, and (critically) the
shareable cards. Charge a small optional subscription only for the insight, depth and
cosmetic layer. The free tier is not a crippled trial; it is the acquisition engine.
This is the Habitica pattern (core free for life, subscription is extras), not the
"hit a wall at three items" pattern.

**What it costs, measured.** Hard paywalls convert about 5× better than freemium
(10.7% vs 2.1% of downloads paying by day 35) and earn about 8× more per install
($3.09 vs $0.38 by day 60) (RevenueCat 2026, §2). We give that up on purpose, because
the growth thesis is that free users' cards bring the next users.

**What it buys, unmeasured.** No dataset in this document measures word-of-mouth: the
RevenueCat report doesn't address sharing at all, and the viral-coefficient figures
vendors publish don't disclose their data (§2). So this is a quantified loss traded for
an unquantified hope. It can still be right (it is how Habitica and Duolingo got their
distribution), but it makes the share gate in §7 the number that says whether this
document's premise is true. That's why step 1 of the plan exists: until a share can
lead to an install, and the install can be counted, the bet can't be read.

**What can't be undone.** `CLAUDE.md` makes the core loop and every shareable free
forever. If the share gate fails, the answer is not to paywall them for people who
already have them; it is to stop investing in sharing and grow through the store.

---

## 2. Market research and benchmarks

*Re-verified against primary sources on 2026-10-08 unless marked. ✅ = checked
directly that day; ◐ = from an earlier check (2026-08-31) that today's public page no
longer shows in full.*

### 2.1 Conversion and trials (RevenueCat, *State of Subscription Apps 2026*: 115K apps, $16B+)

- **Hard paywall vs freemium, download-to-paid by day 35: 10.7% vs 2.1%** (top
  quartiles 20.0% vs 4.5%). Revenue per install **$2.32 vs $0.27** at day 14, **$3.09
  vs $0.38** at day 60. ✅ *(This file used to call the 10.7%/2.1% "trial-to-paid"; it
  is download-to-paid.)*
- Year-1 retention is nearly identical between the models (27% hard paywall, 28%
  freemium): freemium's weakness is the conversion rate, not stickiness. ◐
- **Trial length, median trial-to-paid:** 4 days or less **25.5%**; 5–9 days 37.4%;
  10–16 days 35.4%; **17–32 days 42.5%** (top quartile 59.4%). ✅
- **Share of trial cancellations that happen on Day 0:** 3-day trials 55.4%, 7-day
  39.8%, 14-day 35.7%, **30-day 31.1%**. The longer the trial, the less it's decided in
  the first session, which suits an app whose Plus value shows only once predictions
  resolve. ✅
- **AI features sell but don't stick:** AI apps earn 41% more per payer and churn 30%
  faster ✅; the retention penalty concentrates in monthly plans (36% worse over 12
  months) ◐. An argument for annual-first when Coach is what converts.
- **Concentration:** median year-over-year MRR growth 5.3%; the top 10% grew 306%+,
  the top quartile 80%+, and the bottom quartile shrank by a third. ✅ *(An earlier note
  here said the 306% figure couldn't be found in the 2026 report; it's on the report's
  page.)* Adapty's 2026 report finds 95% of subscription revenue going to the top 10%
  of apps.

**Health & Fitness, the nearest category with public numbers** (the app lists under
Productivity, whose breakout gives little: yearly revenue per payer after year one,
median $24.95): trial-to-paid median **37.7%**, download-to-trial 6.9%,
download-to-paid by day 35 **2.9%**, revenue per install **$0.48** at day 14 and
**$0.66** at day 60, yearly revenue per payer after year one **$35.64**; 54% of its
trials run 5–9 days. ✅

**Adapty, *State of In-App Subscriptions 2026*** (16K apps, $3B, 2025 data): average
trial-to-paid 25.6%, Health & Fitness 35.0%; monthly plans are the most
price-sensitive (conversion falls about 53% from low to mid price tiers), while in
Health & Fitness premium annual plans earn 4.5× more per user than cheap ones. ✅ The
two vendors measure differently; compare within a report, not across them.

### 2.2 Prices

**Medians, 2026 reports:** yearly **$34.80** across all apps (up about 10% from
$31.60), Health & Fitness **$39.94** yearly and **$9.99** monthly (RevenueCat) ✅;
**$38.42** yearly and $12.99 monthly (Adapty) ✅.

**Comparable apps, US App Store, 2026-10-08** (the store lists in-app prices without
their durations; durations are inferred from the usual pattern) ✅:

| App | Rating | Free tier | Paid |
|---|---|---|---|
| Daylio (Lifestyle) | 4.8 · 62K | Yes | $4.99 / $35.99 / $59.99 one-time |
| Habitify (H&F) | 4.6 · 7.1K | Yes | Plus $29.99/yr; Pro $8.99/mo, $49.99/yr, $119.99 lifetime |
| Bearable (H&F) | 4.8 · 6.4K | Yes | $4.49–$49.99, yearly around $34.99 |
| Finch (H&F) | 4.9 · 761K | Yes, generous | up to $69.99/yr |
| Streaks (H&F) | 4.8 · 27K | — | $5.99 once |

**The calibration niche itself is small, cheap and quiet:** Fatebook (web, free,
donation-supported, Slack/Discord/Chrome integrations), Futures Study (iOS, $4.99 once,
one rating), IKEMIND ($2.99), Reckon (one-time, launched 2026-08), Foresee (free with
purchases). None shows traction in ratings. Nobody owns this on the App Store, and the
people who already track predictions expect to pay little or nothing; this app's
audience is the larger self-knowledge and habit crowd, which expects a subscription at
$30–40 a year.

### 2.3 Store commission and web checkout

- **US rates unchanged for 2026:** 15% under the Small Business Program, and 15% on any
  subscription after its first year. (Apple cut China's rates to 25% / 12% on
  2026-03-15; not relevant to a US launch.) ✅
- **Link-out commission: 0% in the US for now.** The Supreme Court granted Apple's
  petition on 2026-06-30; Apple's opening brief was filed 2026-09-14 and **Epic's is
  due 2026-11-13**, so argument is unlikely before early 2027 and a decision before
  June 2027. The district-court proceeding on Apple's proposed 15% / 5% (Small Business)
  link-out fee has stalled. ✅
- **Web checkout earns less than it looks.** On the $34.99 plan, IAP at 15% nets
  about $29.74 and a link-out nets $34.99 today. But RevenueCat's own test (Dipsea, about
  5,600 new US users) converted **27.0%** on an IAP-only paywall, **18.1%** web-only
  and **23.5%** with both; the version with a web button made **93¢ for every dollar**
  of IAP-only, even against a 30% fee. Web revenue is 3.2% of subscription revenue
  globally and 4.9% in North America. ✅ **Stance: IAP through RevenueCat only. Revisit
  web checkout only if the case settles at 0% *and* a test of our own beats IAP.**

### 2.4 Acquisition costs

- Apple Ads, US search results, 2025 (AppTweak, about 2,800 advertisers): Productivity
  **$1.74 per tap, 56.5% conversion, $3.58 per install**; Health & Fitness $1.68 and
  $3.77. Adapty's 2026 data (updated July 2026) puts the US across categories at $1.58
  a tap and **$2.51 a download**, with the Notes niche at $6.53 and Health & Fitness
  at $3.02. ✅
- Against revenue per install of $0.38 (freemium, day 60) to $0.66 (Health & Fitness),
  each paid install loses roughly $2–3 before any renewal. **No paid installs** until revenue
  per install is measured and the gap closes. Organic is the only channel that pays at
  this model's economics: ASO, the rating prompt, and the share loop.

### 2.5 The share loop: evidence and its limits

- **Spotify Wrapped 2025** (Spotify's figures via the press): 200M+ engaged users in
  the first 24 hours, up 19%; shared 500M+ times, up 41%, counting screenshots and
  downloads (several outlets say on the first day; TechCrunch gives no window). ✅
  Scale we won't have, but the recipe transfers: a personal story about
  the user, made effortless to share. A dry stats report doesn't travel.
- **Benchmarks for small apps are weak.** Published viral coefficients (for example
  0.2–0.8 for productivity apps) come from vendor blogs without data; referral
  click-to-install figures (Branch: about 15% average, 8% typical) measure a different
  step. ✅ So §7 sets our own thresholds and measures them ourselves.
- **Measuring it without tracking anyone:** App Store campaign links
  (`apps.apple.com/app/apple-store/id…?pt=…&ct=…&mt=8`) credit a first-time download
  made within 24 hours of the link, and App Store Connect shows a campaign once it has
  five downloads and a day of age. ✅ That counts installs per share surface for every
  user, signed in or not, without an SDK or an identifier, which the app's own
  analytics can't do: they don't know where an install came from, and a guest's counts
  carry no account, device or install id (D43, `APP_PRIVACY.md`).
- **What a share can carry today:** the text share carries the link (step 1). An
  image share can't: the share sheet gets a bare PNG. Its way back is the name on the
  card, Fairly Sure, which is why the name mattered here as much as in the listing.

### 2.6 Context: prediction markets went mainstream in 2026

Kalshi and Polymarket drew record volume and installs around the 2026 World Cup, and
"prediction" is now, for many App Store searchers, a betting word (Semafor, Apptopia,
Ark, 2026). Two consequences: the listing should say plainly that there's **no money
and no odds** (the keyword "prediction" will bring some betting traffic), and there is
a positioning opening for the version of "how good are my predictions?" that costs
nothing and can't be lost. Treat the second as a hypothesis for listing copy, not a
pivot. The app stays 4+, with no wagering, odds or leaderboard of correctness
(`CLAUDE.md`: reward calibration, not correctness).

### 2.7 Coach's unit cost

Coach calls `gpt-4o-mini` (not on OpenAI's deprecation list as of 2026-10-08; $0.15
per million input tokens, $0.60 per million output). With `max_tokens: 400` and a
context of about 2,000 tokens, a call costs at most about **$0.0006**. The per-user
ceiling of 25 calls a day caps the worst case near $0.015 a day; a realistic user asks
a few times a week, which is cents a year. Coach is cheap enough that neither the
one-month trial nor a lifetime plan is a cost risk.

---

## 3. Free vs. Plus (as built)

| Capability | Free (forever) | Plus |
|---|---|---|
| Log, resolve, score, curve, badges, streaks, rest days | ✅ | ✅ |
| Daily practice and its reminder | ✅ | ✅ |
| Identity card, Wrapped (weekly and yearly), the Warmup card | ✅ (the growth engine) | ✅ |
| Full history | ✅ | ✅ |
| **Coach**: up to three grounded reads of your own numbers (`COACH_AGENT.md`) | — | ✅ |
| **Trends**: calibration month by month, per-category drill-down, "what your 80% really means" (the personal correction table), calibration by time horizon | — | ✅ |
| CSV export of your own predictions (free since 2026-10-10, roadmap D31: your own data shouldn't be paid for) | ✅ | ✅ |
| **Card themes** beyond Midnight | — | ✅ |

**Rule:** nothing that generates a shareable artifact is ever paywalled, and the core
loop is never capped. Plus sells understanding and self-expression, not access.
*Not built, though earlier drafts listed them:* a pre-mortem, a confidence nudge from
the model, and an AI digest. Don't add them to the paywall until they exist.

---

## 4. Pricing

- **Set (App Store Connect, 2026-11-16; P1 closed):** $4.99/month, **$34.99/year
  (shown first) with a one-month free trial**, and $79.99 lifetime. Why: annual demand
  is the least price-sensitive (§2.1), and the 2026 median annual price rose about 10%
  to $34.80 (§2.2); $34.99 sits there, 12% under Health & Fitness ($39.94), and still
  reads "works out to $2.92 a month", 42% under monthly. Monthly at about half the
  median is the low-commitment door, not the target: it is the most price-sensitive plan
  and the worst container for an AI-driven subscription (AI apps' churn penalty
  concentrates in monthly plans, §2.1), so the paywall leads with annual. Lifetime at
  about 2.3× annual (vendor guidance, unmeasured, says 2.5–4×) stops it undercutting two
  years of the plan we want people on. Not higher, because Plus is narrow next to Finch
  or Habitify, the app has no reviews yet, and the free tier is the point; no $1.99 and
  no weekly plans, because this app's value arrives over weeks, not in a session. Apple
  lets a later price rise apply to new subscribers only, and step 7's test can still
  move the annual price.
- **Trial:** one month on annual, decided 2026-09-25: a calendar month sits inside the
  measured 17–32-day band (42.5% median trial-to-paid, §2.1) and is more than one
  resolution cycle, which Plus needs to be legible. It is a store setting; the app
  renders whatever trial the store reports, in the store's units. The paywall states
  that the trial converts and that cancelling takes 24 hours' notice, and the D16
  reminder arrives two days before it renews. On 2026-11-16 the offer sat on the
  monthly product by mistake; the owner moved it to `calibrate_plus_annual` the same day.
- **Net revenue** depends on the link-out case (§2.3); treat $34.99 as about $29.74 in
  hand under the Small Business Program until it settles.

---

## 5. The three mechanics

### 5.1 Day 0: the Warmup (onboarding)

A calibration score means nothing until predictions resolve, but an app is kept or
deleted on Day 0. The Warmup is a 60-second quiz of ten two-choice questions with a
confidence for each, ending on a mini calibration chart, a verdict and the first
shareable card. Built.

**D18 (decided 2026-10-07, built 2026-10-08): Day 0 is for calibration.** The ten were
once picked to be tricky, which manufactured the overconfidence the verdict reported
(`docs/design/UI_ROADMAP.md` D14); now they come from the practice tables, the result
leads with counts about *these ten*, and the first real prediction is due tomorrow
(`CLAUDE.md` "Warmup Module"). Read the Day-0 gates (§7) with one more number: Warmup
finishers with a first real answer within 48 hours of the first launch, which D18
exists to move.

### 5.2 Acquisition: identity cards and Wrapped (free)

- **Identity card:** "Sharp in health · Tracker in money", a personality-test result
  with receipts. Screenshot-native, one tap to share, Post and Story shapes.
- **Calibration Wrapped:** weekly and yearly recaps of the user's forecasting story.
- **Daily practice** (built 2026-10-07): the same three questions for everyone each
  day, which is what made Wordle's grid travel; its share card is parked (FUTURE_UI A11).
- Every share is a free ad. A text share links to the product page, counted per surface
  once step 1's token is set; an image carries the name. Parked surfaces wait
  on the share gate: milestone cards (D6), the practice card (A11) and a web Warmup as
  the card's landing page (A8).

### 5.3 Conversion: the Plus insight tier

Coach and Trends are the paid aha. Plus is offered softly where it's relevant (the
Insights teaser, Trends' locked panel) and never interrupts the core loop. Because AI
payers churn faster, Coach comes with the sticky non-AI value (Trends, themes)
so the subscription survives the novelty. Coach quality is load-bearing: a specific,
true, surprising read converts; "you're doing great" doesn't (`COACH_AGENT.md` §9 has
the evals).

---

## 6. What's built

Everything this document asked for is built (`docs/design/BUILT_LOG.md`): billing,
restore and the paywall, Plus gating, the Warmup and its card, the identity card and
Wrapped, card themes, Trends, CSV export (free since D31), Coach, the D16 trial reminder,
the D15 rating prompt, daily practice and the share link. Billing came last, as argued.

---

## 7. Gates and metrics

Each gate is read at step 5 (6 weeks or 1,000 first-time downloads, whichever is
later). Thresholds marked *ours* are judgment calls set before the data, so the data
can't move them; the rest are 2026 medians (§2).

| Gate | Metric and where it comes from | Pass | Watch | Fail |
|---|---|---|---|---|
| **Share loop** (the premise) | First-time downloads from `share-*` campaigns ÷ all first-time downloads (App Store Connect) | ≥ 10% *(ours)* | 3–10% | < 3% *(ours)* |
| Day-0 aha | `warmup_completed / warmup_started` (signed-in and guest counts; read either side of D18) | ≥ 70% *(ours)* | 50–70% | < 50% |
| First real prediction | First-time users with a `prediction_logged` on Day 0 | ≥ 50% of Warmup finishers *(ours)* | 30–50% | < 30% |
| Trial-to-paid | RevenueCat, annual trials | ≥ 42.5% (17–32-day median) | 25.5–42.5% | < 25.5% (the short-trial median) |
| Download-to-paid by day 35 | RevenueCat | ≥ 2.9% (H&F median) | 2.1–2.9% | < 2.1% (freemium median) |
| Plus churn | RevenueCat renewals, split by Coach use (`coach_requested`; Coach needs an account, so every Coach user is in the events) | Coach users retain like the rest | — | Coach users churn faster: lead with Trends |

**What each failure means.** Share loop: stop adding share surfaces; grow through the
store; the free tier stays (§1). Day-0 or first prediction: the onboarding is the
problem, before anything else is. Trial-to-paid: Plus isn't legible within the trial;
fix what Plus shows, not the price. Download-to-paid with a good trial-to-paid: too few
people reach the paywall; look at where Plus is offered.

**Later, once trials convert:** re-test the trial length (one month on the annual plan)
against real trial-to-paid data; it was chosen from medians (§2.1, §4).

**Known blind spot.** A guest's funnel events go up with no id of any kind (D43,
`APP_PRIVACY.md`), so the Day-0 aha rate counts everyone, signed in or not. But two guest
rows can't be tied to one person, so a row that follows a person from one event to the
next (the first real prediction on Day 0) still describes the signed-in cohort, which
skews engaged. A per-install id would close that and contradicts the privacy label. The
share gate doesn't have this problem: App Store Connect counts every download.

---

## 8. Risks

- **The share loop is a hypothesis.** §7 measures it; §0 step 6 says what happens
  either way.
- **Discoverability.** "Calibrate" alone was taken twice on the App Store, so the app
  ships as Fairly Sure (the working name since 2026-11-03, on the App Store Connect
  record; `docs/APP_STORE_LISTING.md` §0), the name every card carries. An image
  share's only way back is a search for it.
- **"Prediction" now means betting** to many searchers (§2.6). Say "no money, no odds"
  in the listing, and keep every surface clear of wagering language.
- **The niche is cheap.** Calibration trackers sell for $3–5 once or are free (§2.2).
  Fairly Sure competes on the identity layer, the cards and Day 0, not on the tracker.
- **Revenue will be modest and slow** next to a hard paywall: a reach and brand play.
- **Coach quality is load-bearing** for conversion, and its model can be retired:
  re-check OpenAI's deprecation list when the app ships and every quarter after.
- **Don't let cosmetics arrive before substance.** They monetize attachment that only
  exists once the core insight has landed.

---

## Sources

Checked 2026-10-08 unless noted.

- RevenueCat, *State of Subscription Apps 2026* (115K apps, $16B+) —
  [report](https://www.revenuecat.com/state-of-subscription-apps) ·
  [Health & Fitness and Productivity breakouts](https://www.revenuecat.com/state-of-subscription-apps-2026-productivity) ·
  [10-minute summary (2026-08-31 check)](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- AI revenue and retention split (2026-08-31 check) —
  [PPC Land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/) ·
  [TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)
- Adapty, *State of In-App Subscriptions 2026* —
  [report](https://adapty.io/state-of-in-app-subscriptions/) ·
  [PPC Land on revenue concentration](https://ppc.land/95-of-app-subscription-revenue-goes-to-top-10-adaptys-2026-benchmark-report/)
- IAP vs web checkout — [RevenueCat's test](https://www.revenuecat.com/blog/growth/iap-vs-web-purchases-conversion-test) ·
  [RevenueCat pricing (Experiments in the free tier)](https://www.revenuecat.com/pricing/)
- Apple link-out case —
  [IPWatchdog, cert granted 2026-06-30](https://ipwatchdog.com/2026/06/30/high-court-grants-cert-in-apples-challenge-to-ninth-circuit-contempt-ruling-in-app-store-dispute/) ·
  [MacRumors, Apple's brief 2026-09-14](https://macrumors.com/2026/09/14/apple-supreme-court-contempt-ruling) ·
  [Mac Observer on the brief](https://www.macobserver.com/news/apple-supreme-court-brief-epic-injunction-never-covered-commissions/) ·
  [Tech Times, 2026-09-15](https://www.techtimes.com/articles/327527/20260915/app-store-commission-limbo-enters-new-phase-apples-epic-merits-brief-opens-scotus-fight.htm) ·
  [TechCrunch on the Aug 2026 proposal](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/)
- Apple commission — [China rate change, 2026-03](https://www.mactech.com/2026/03/13/apple-making-changes-to-the-app-store-in-china/amp/) ·
  [Small Business Program terms](https://www.subscriptioninsider.com/type-of-subscription-business/subscription-apps/apple-reduces-app-store-commission-to-15-percent-for-small-businesses)
- App Store campaign links — [App Store Connect Help](https://developer.apple.com/help/app-store-connect/view-app-analytics/manage-campaigns)
- Comparable apps (US App Store listings) — [Daylio](https://apps.apple.com/us/app/daylio-journal-daily-diary/id1194023242) ·
  [Habitify](https://apps.apple.com/us/app/habitify-habit-tracker/id1111447047) ·
  [Finch](https://apps.apple.com/us/app/finch-self-care-pet/id1528595748) ·
  [Bearable](https://apps.apple.com/us/app/bearable-symptom-tracker/id1482581097) ·
  [Streaks](https://apps.apple.com/us/app/streaks/id963034692) ·
  [Futures Study](https://apps.apple.com/us/app/futures-study/id6788912818) ·
  [Fatebook](https://fatebook.io) · [Reckon](https://www.producthunt.com/products/reckon)
- Lifetime pricing guidance (vendor, unmeasured) — [AppsOps](https://appsops.store/blog/ios-annual-vs-lifetime-purchase-pricing) ·
  [Airbridge](https://www.airbridge.io/en/blog/should-you-offer-a-lifetime-subscription)
- Apple Ads costs — [AppTweak, US 2025](https://www.apptweak.com/en/aso-blog/apple-ads-benchmarks) ·
  [Adapty, 2026](https://adapty.io/blog/apple-ads-benchmarks-2026/)
- Share loop — [TechCrunch on Wrapped 2025](https://techcrunch.com/2025/12/04/spotify-says-wrapped-2025-is-its-biggest-yet-with-200m-users-in-its-first-day) ·
  [Branch sharing benchmarks](https://www.branch.io/resources/blog/mobile-sharing-and-referral-feature-benchmarks-from-branch/)
- Prediction markets — [Semafor, 2026-09-01](https://semafor.com/article/09/01/2026/hedges-and-bets-the-future-of-prediction-markets) ·
  [Apptopia, World Cup DAUs](https://apptopia.com/en/insights/sportbooks-world-cup-daus-peaked-on-june-15/) ·
  [Ark Invest #515](https://www.ark-invest.com/newsletters/issue-515)
- OpenAI — [deprecations](https://developers.openai.com/api/docs/deprecations) ·
  [gpt-4o-mini pricing (aggregator)](https://pricepertoken.com/pricing-page/model/openai-gpt-4o-mini)

**Caveats worth carrying.** Neither subscription report measures word-of-mouth, so
neither can be cited for the share loop, only against freemium's conversion cost. The
two vendors measure trial conversion differently. App Store prices were read from
public listings that omit durations. And the link-out position is being litigated:
re-check it before it enters a pricing calculation.
