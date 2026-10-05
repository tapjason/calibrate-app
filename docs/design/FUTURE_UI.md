# Calibrate — Future UI Features

**As of:** 2026-10-04 (weekly Wrapped `reveal` shipped; removed from §B). A parking lot, not a plan. [`UI_ROADMAP.md`](UI_ROADMAP.md) is
what's being built now. Nothing here is scheduled, and anything that changes product
behaviour needs the owner's call first. `CLAUDE.md` still governs every item:
shareable artifacts are never paywalled, no number built on noise (min-N), AI stays
out of the critical path, and the UI never does calibration math (that lives in
`src/engine/`).

Size: **S** ≈ a day, **M** ≈ a few days, **L** = needs a new table, the backend or
a native build.

---

## A. New features

| # | Feature | Size | Needs first |
|---|---|---|---|
| A1 | Track record on the Log slider | S–M | Free or Plus? |
| A2 | Daily drill | M | A question bank; fits with D2 (streak unit) |
| A3 | Resolve several at once | M | — |
| A4 | Repeating predictions | L | Schema change |
| A5 | Personal correction table | M | Engine output; Plus |
| A6 | Calibration by time horizon | S–M | Engine output; Plus |
| A7 | Changing your confidence before the due date | L | Schema change; scoring rule |
| A8 | Web Warmup as the share-card landing page | M | Hosting (GitHub Pages) |
| A9 | Predict the same event with a friend | L | Backend, invites |
| A10 | Widgets and a Siri Shortcut | L (the Shortcut drops to M on SDK 58) | EAS build; SDK 58 for `expo-app-intents` |

### A1. Track record on the Log slider
As the slider moves: *"Your 80%s in finance have come true 58% of the time."* This
closes the feedback loop at the moment of commitment, which is the app's premise
applied where it matters most.
- Reuse the honesty rules from `chartTakeaway.ts`: say nothing until the bucket has
  ≥ 10 resolved, and use counts, not a verdict.
- Needs a per-category bucket lookup from `statsStore` (core-domain). The UI only
  reads it.
- **Decision:** it feels like part of the core loop (free), but it's arguably
  "insight" (Plus). Recommendation: free. It makes the free tier better at the one
  thing the app promises.
- Watch for anchoring: users might copy their history instead of judging the event.
  That's arguably the point (recalibrating), but it's worth a metric: do stated
  confidences drift toward the hit rates?

### A2. Daily drill
One estimation question a day with the same confidence control, stored separately
like the Warmup and **never** mixed into `UserStat`/`CategoryStat`. Real predictions
resolve when they come due, which the user doesn't control, so this gives a reason to
open the app every day.
- Needs a bank of ~200+ two-choice questions with sourced facts (the Warmup ships
  10 in `warmupQuestions.ts`).
- A rolling "drill calibration" mini-chart could sit on Stats, labelled as practice.
- Interacts with **D2**: if the visible streak becomes weekly, a drill could count
  toward it.

### A3. Resolve several at once
When three or more are ready, Home offers "Resolve 5", which steps through
`ResolvePrompt` one card at a time (Yes / No / Skip, then straight to the next; the
reflection stays optional and can be collapsed). Resolution is what feeds the data,
and a backlog of overdue items is where people quit.
- Same haptic and acknowledgement for Yes and No (rule 0.4). The bucket line
  appears briefly per card.
- A milestone (score unlock, tier-up) interrupts the run. Don't queue it to the end.

### A4. Repeating predictions
"Gym 3× this week", weekly. Each instance is its own prediction with its own
confidence (prefilled from last time, editable), so the engine is unchanged. Volume
per category goes up, so categories reach `MIN_N_CATEGORY` sooner.
- Needs a `recurrences` table plus a scheduler that creates the next instance on
  resolve (L2/L4), and notification scheduling for each instance.

### A5. Personal correction table (Plus)
*"In money, read your 80% as 60%."* One row per category and bucket that clears
min-N: stated mean → actual rate. It's the most actionable thing the numbers say, and
it needs no model.
- Engine output (L3), shown on Stats under the chart. It must disappear for buckets
  below threshold, never show "0%" or "100%" on two predictions.
- Pairs with A1: the slider hint is the free, in-the-moment version.

### A6. Calibration by time horizon (Plus)
Same-day vs. this-week vs. month-out calls. People are often sharp on short horizons
and loose on long ones. Sits next to `patterns.ts` and `trends.ts`. Each horizon
carries its own n and provisional flag.

### A7. Changing your confidence before the due date
"I said 70% on Monday; by Wednesday it's 90%." Show the revision history on Resolve.
**The score stays on the first stated number** so it can't be gamed. A later Plus view
could show whether updating helped.
- Schema change (a `revisions` table). The scoring rule needs to be written into
  `CLAUDE.md` before any code.

### A8. Web Warmup as the share-card landing page
The share card's "get your own" hook links to a web Warmup: 60 seconds in the
browser, no install, ending in an App Store link. The web build already runs the
Warmup. This is the shortest path from a shared card to a new user.
- Hosting: the GitHub Pages switch already planned for the privacy policy.
- No account and no sync on web. Warmup results stay in the browser.
- Needs a store link and a decision on whether web visitors are counted (item 2.3, the
  anonymous-funnel question in `docs/NEXT_STEPS.md`).

### A9. Predict the same event with a friend
Two people put their confidence on one yes/no event via an invite link, and compare
once it resolves. It's a second way for the app to spread beyond the share card.
- Backend (shared prediction rows, RLS by participant), invites, and abuse limits.
  Not before sync has real users.
- Keep it to *calibration* ("you were both 70%; it happened"), not a winner/loser
  leaderboard. That would reward correctness, not calibration.

### A10. Widgets and a Siri Shortcut
A Home or Lock Screen widget ("3 ready to resolve", or the identity line once a
category unlocks), and an App Intent for "Log a prediction".
- Needs a native target and an EAS build. Not testable in Expo Go (iPhone-only
  setup).
- Revisit after **D5** (SDK upgrade). SDK 58 (beta 2026-09-15) adds
  `expo-app-intents`, which exposes Siri, Shortcuts, Spotlight and Apple
  Intelligence intents from JavaScript, so "Log a prediction" no longer needs
  hand-written Swift. Widgets still need a native target.

---

## B. Polish deferred from the roadmap

| Item | Where it came from | Why deferred |
|---|---|---|
| Confetti (≤ 40 particles, ≤ 1.2 s) and an emblem flip on badge tier-up | DESIGN_SYSTEM §6.1 `tierUp` | Needs Lottie or a particle view. The spring-in card plus Success haptic already mark the moment. |
| Progress **ring** instead of the bar on Home/Stats | Roadmap step 4 | Optional. The bar reads fine. |
| 👍 / 👎 on Coach cards | DESIGN_SYSTEM §7.13 | Only once there's an analytics event to receive it. |
| Guard the web build's browser Back against losing a typed reflection | Roadmap step 11 | React Navigation's prevent-remove doesn't see the browser's own Back. Native ships, so web is low priority. |
| A halo behind the chart's "n=" labels | Web run-through 2026-10-04 | The connecting line can pass through a label (the demo's n=8 at 20–40%). A canvas-coloured text stroke would fix it, but `paintOrder` support in react-native-svg needs checking on a device first. |

Decisions **D1–D10** in `UI_ROADMAP.md` §2 (typeface, weekly streak, four tabs, honesty
bands, SDK, milestone cards, dark mode, resolving from a notification, reminder time,
what Skip means) are not repeated here. They're ready to build once decided.
