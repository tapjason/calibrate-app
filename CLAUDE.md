# Calibrate — Agent Document

**Canonical spec.** This file and `BUILD_PLAN.md` are the two always-current build
documents. `GROWTH_AND_MONETIZATION.md` and `COACH_AGENT.md` are rationale/reference —
read them for the *why*, but this file governs *what gets built*. If they ever conflict,
this file wins. Visual and interaction design lives in `docs/design/DESIGN_SYSTEM.md`.

## Project Overview

**Calibrate** is a mobile app that helps users track personal predictions with confidence
levels, then measures how accurately their confidence matches real outcomes over time. The
core insight: most people are systematically overconfident or underconfident in specific
life domains. This app surfaces that pattern so users can learn where to trust their own
judgment.

The two primary goals:
1. **Goal tracking** — Did you do what you said you'd do?
2. **Self-knowledge** — Did your confidence level reflect reality?

The product framing is **identity, not statistics**: "Sharp in health, Tracker in money"
is a personality-test result with receipts. The math is the engine, never the pitch.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Mobile | React Native (Expo) |
| Local storage | SQLite via Expo SQLite |
| Backend / sync | Supabase (Postgres + Auth + Edge Functions) |
| Push notifications | Expo Notifications |
| Charts | react-native-svg (calibration curve drawn directly; no Victory/Skia dependency) |
| State management | Zustand |
| Billing / entitlements | RevenueCat (wraps StoreKit / Play Billing) |
| Share-card export | react-native-view-shot over the SVG card |
| AI (optional) | OpenAI GPT-4o-mini via Supabase Edge Function |

---

## Core Data Models

### Prediction
```ts
{
  id: string
  user_id: string
  title: string                  // The prediction text
  category: 'work' | 'health' | 'finance' | 'social' | 'personal'
  confidence: number             // 0–100 integer (user's stated confidence %)
  created_at: string             // ISO timestamp
  due_date: string               // When to resolve it
  status: 'pending' | 'resolved_yes' | 'resolved_no' | 'skipped'
  resolved_at: string | null
  reflection: string | null      // Optional freetext after resolution
  integrity_bonus: boolean       // legacy: true if confidence was 35–65%. Still stored and
                                 // synced for schema compatibility, never shown or rewarded
                                 // (the integrity bonus was dropped 2026-10-10, D23)
}
```

### UserStat
```ts
{
  user_id: string
  calibration_rating: number     // Rolling 0–100 score
  total_predictions: number
  total_resolved: number
  current_streak: number         // Days with at least 1 prediction logged or answered (D17, 2026-10-07; was 3), in a row except where a saved rest day covers one (2026-10-07)
  rating_is_provisional: boolean // true while total_resolved < MIN_N_OVERALL
}
```

### CategoryStat
```ts
{
  user_id: string
  category: string
  predictions_made: number
  predictions_resolved: number
  calibration_score: number      // Per-domain accuracy score
  score_is_provisional: boolean  // true while predictions_resolved < MIN_N_CATEGORY
  badge_level: 'guesser' | 'tracker' | 'forecaster' | 'sharp' | 'oracle'
}
```

### Entitlement
```ts
{
  is_plus: boolean
  source: 'none' | 'trial' | 'monthly' | 'annual' | 'lifetime'
  expires_at: string | null
}
```
Source of truth is RevenueCat server-side; SQLite holds a local mirror for offline
gating. Absence or any error defaults to **free**, never to Plus.

---

## Calibration Engine (authoritative)

Runs after every resolution. Groups resolved predictions into confidence buckets and
compares stated confidence against actual outcome rate.

### Buckets
Five buckets, **lower bound inclusive, upper bound exclusive**, with the top bucket
closed:

```
[0,20)  [20,40)  [40,60)  [60,80)  [80,100]
```
A confidence of exactly 20 lands in `[20,40)`. A confidence of exactly 100 lands in
`[80,100]`. This convention is fixed — do not re-derive it.

### Formula (count-weighted mean absolute error)
```
Per non-empty bucket:
  stated_confidence_mean = mean of stated confidences of predictions in the bucket
  actual_rate            = resolved_yes / total_resolved_in_bucket
  bucket_error           = | stated_confidence_mean/100 − actual_rate |

calibration_score = 100 − ( Σ(n_bucket × bucket_error) / N × 100 )

  n_bucket = resolved yes/no predictions in the bucket; N = Σ n_bucket.
The weighted mean is over NON-EMPTY buckets only. Score is clamped to [0, 100].
```

**Why weighted by count** (decided 2026-10-10, roadmap D24). Each bucket counts in
proportion to the predictions in it, the standard expected calibration error. The
unweighted mean it replaced let a bucket with one prediction move the score as much
as one with fifty, so a single answer in a rarely used range could swing the rating
by twenty points (the "Weighting matters" example below). With one bucket, or buckets of equal
size, the two agree.

**Why absolute and not squared error.** Squared error compresses the usable range into
roughly 84–100 for anyone who isn't at an extreme — a user stating 90% who is right 50%
of the time would score 84, one point below "Sharp." Absolute error makes the score drop
about one point per average percentage point of miscalibration, which is both
discriminating and directly interpretable to the user.

### Worked examples
| Case | stated_mean | actual_rate | bucket_error | Score |
|---|---|---|---|---|
| Perfect | 0.90 | 0.90 | 0.00 | 100 |
| Slightly off | 0.90 | 0.85 | 0.05 | 95 |
| Moderately overconfident | 0.80 | 0.60 | 0.20 | 80 |
| Badly overconfident | 0.90 | 0.50 | 0.40 | 60 |
| Underconfident | 0.60 | 0.85 | 0.25 | 75 |
| Multi-bucket | errors 0.05 (n=20), 0.20 (n=10), 0.35 (n=20) | — | weighted mean 0.20 | 80 |
| Weighting matters | errors 0.05 (n=50), 0.45 (n=1) | — | weighted mean 0.0578 | 94.2 (unweighted it was 75) |

A perfectly calibrated user's chart plots as a straight diagonal line. Deviations above
the line = underconfident. Below = overconfident.

### Brier score (secondary, decided 2026-10-10, roadmap D24)
```
brier = mean over resolved yes/no predictions of (confidence/100 − outcome)²
        outcome = 1 for resolved_yes, 0 for resolved_no.  0 is perfect; always
        saying 50% scores 0.25; lower is better.
```
The calibration score alone ignores sharpness: someone who logs only coin-flips at
50%, or only sure things at 95%, can score well while saying little. The Brier score
rewards being both calibrated and decisive, so it keeps the rating honest. It is
**secondary and quiet**: computed by the engine (`computeBrier`), never stored in
`UserStat`, never on Today or a share card, and shown only as one plain line under
the rating on Insights and one paragraph in How scoring works, and only once the
rating itself is unlocked (`MIN_N_OVERALL`). It is free.

### Minimum-N gating (required)
Small samples make `actual_rate` meaningless — with two resolved predictions a bucket can
only read 0, 0.5, or 1.0. Therefore:

```
MIN_N_OVERALL  = 20   // below this, UserStat.rating_is_provisional = true
MIN_N_CATEGORY = 15   // below this, CategoryStat.score_is_provisional = true
```

- While provisional, the engine still computes the score (for internal trend use) but the
  UI **must not** present it as a headline number. Show progress toward the threshold
  ("12 more resolutions until your finance score unlocks") instead.
- No badge above `tracker` may be awarded while `score_is_provisional` is true.
- The Coach agent must not issue verdicts on provisional data (see `COACH_AGENT.md`).

### Range coverage caveat
Most users cluster in 60–90% confidence and rarely log things they expect *not* to
happen, leaving the low buckets empty and measuring only half the range. The Log
screen periodically nudges users to log a prediction they think is unlikely (the
coverage nudge). Nothing rewards a particular confidence: the integrity bonus did,
for 35–65%, and was dropped 2026-10-10 (D23) because paying for a stated number
pushes reports toward it, the opposite of what a proper score does. Track bucket
coverage as a product metric.

`docs/CALIBRATION.md` may expand on this with additional fixtures, but this section is
authoritative.

---

## Feature Modules

### 1. Warmup Module (onboarding — build early)
A 60-second first-run quiz of ten two-choice questions ("Which happened first?" + a
50–100% confidence slider). Immediately renders the counts, a mini calibration chart
and a read of those ten ("You said 85% on average. 5 of 10 were right." under "On
these ten, you were overconfident"); see the D18 bullets below.

Purpose: a real calibration score takes weeks of resolutions, but the first session is
where users decide whether the app is worth keeping. The Warmup delivers the core insight
on Day 0, teaches the mechanic, and produces the first shareable card. Warmup results are
stored separately and **never** mixed into real `UserStat` / `CategoryStat` data.

Decided 2026-10-05 (`docs/design/UI_ROADMAP.md` D13): the confidence slider
starts **empty** and Next waits for a number, so tapping through can't produce a
verdict about a preset.

**Day 0 is for calibration, not an identity verdict** (decided 2026-10-07, UI_ROADMAP
D18; built 2026-10-08):
- The ten are drawn from the practice tables (`warmupQuestions`, the same ten for
  everyone, right answers five first and five second), not picked to be tricky:
  five inside the practice's closeness band, five from the whole class (refined
  2026-10-09; the band alone tilts toward overconfidence).
- The result leads with counts and reads these questions, not the person: "You said
  78% on average. 6 of 10 were right." under "On these ten, you were overconfident".
  A lean is named only outside the central 80% of what luck gives at ten answers
  (`WARMUP_LEAN_MASS`); otherwise "On these ten, no clear lean". The ±5 rule used
  elsewhere called a lean on 47–73% of perfectly calibrated people
  (`docs/design/research/day0-2026-10.md`). No 0–100 warm-up score (D20, 2026-10-09).
- A bridge to the person's own plans (the planning-fallacy line) sits above the
  button, "Make a real prediction" (the bridge ends "Make your first one about
  tomorrow.").
- The first prediction defaults to Tomorrow, with starter ideas that resolve by then,
  so the first real result lands on Day 1. That first yes/no answer says what the
  number means, the same for Yes and No ("A 70% call should come true about 7 times
  in 10, so one answer can't say much; 20 can.").
- The Day-0 card shares the counts as an invitation: "5 of 10 right. I was 77% sure.
  How sure are you?"

### 2. Log Module
Entry point for creating a prediction. Fields: title, confidence slider (0–100), due date,
category. Minimal friction — completable in under 15 seconds.

The confidence starts **empty** and Save waits for a title and a number (decided
2026-10-05, UI_ROADMAP D13). The category starts **empty** too, and Save waits for one
(decided 2026-10-10, D29): a preset Work filed untouched predictions under Work. A
starter idea or "Log it again" fills it.

An optional AI refine button is specced but **deferred** (see AI § A). Nothing
about the save flow depends on it — which is why cutting it cost nothing.

### 3. Resolution Module
Triggered by push notification on due_date. User taps yes/no + optional one-line
reflection. Calibration data is worthless without resolution.

**An open prediction** (decided 2026-10-10, D25): tapping one that isn't due yet
opens its details — what you said and when, the due date, **Edit** (title, category
and due date; never the confidence, which is the record) and **Delete** — with
**Answer it now** below, which first says it's early (`docs/design/DESIGN_SYSTEM.md`
§7.23) and then opens Resolve; an early answer counts like any other. A prediction that is due opens Resolve directly, as before.
A delete is synced as a deletion (a local tombstone pushed to Supabase), so it
doesn't come back on the next pull; another signed-in device keeps its copy until
it is deleted there.

Note: resolution alone is a weak retention hook. The identity layer (badges climbing,
weekly reveal) carries retention — build it deliberately.

### 4. Calibration Engine
See the authoritative section above.

### 5. Stats & Insight Module
- Overall calibration rating (0–100), or provisional-progress state. Until the first
  answer, the progress state leads with when it comes ("Your first answer: tomorrow
  evening", D30, 2026-10-10)
- Calibration curve chart (stated vs. actual per bucket)
- The Brier score, one quiet line under the rating once it's unlocked (D24, above)
- Per-category breakdown with badge levels, and each category's own score once it is
  past `MIN_N_CATEGORY` (D28, 2026-10-10); before that, the count to go
- **The identity line** (D27, 2026-10-10): on Today and the share card, a tier is
  named only for a category past the count gate (20 resolved, so Tracker or above).
  "Guesser" means "fewer than 20 resolved here", which read as a verdict ("Guesser in
  finance" after five months); it stays on Insights' badge rows, where the count to
  go sits beside it. Tapping the identity line on Today explains the tiers (How
  scoring works, at Badges) rather than opening Share.
- Streak tracker. Checkpoints at **7, 30, 100 and 365 days, then every further year**
  (decided 2026-10-06): the day a streak reaches one is named ("A full week") on Today
  and on the answer that earned it. Every other day only the number climbs. The
  checkpoint *celebration* (motion, haptic) is planned but not built — see
  `docs/design/FUTURE_UI.md` §B.
- **What a day takes** (decided 2026-10-07, roadmap D17): one prediction logged
  or answered keeps the streak. Three a day is the **daily goal**, shown as the
  streak row's dots and named when met ("Today's goal met"), and asked of nobody.
  It was three to count (D2, 2026-10-05); Duolingo's A/B test of exactly this
  change raised day-14 retention 3.3% and new users on a streak 19%
  (`docs/design/research/retention-2026-10.md` §2.1). Practice doesn't count
  toward either.
- **Rest days** (decided 2026-10-07, at the owner's request for retention
  features): every 7 counted days save a rest day, up to 2. A past day that
  didn't count spends one automatically, and the streak carries on *without*
  adding that day; with none saved, the streak ends and the reserve goes with
  it. Derived from the predictions on every read, never stored, so every device
  agrees. Today says what's saved, the day one covered ("Yesterday was a rest
  day"), or when the next one comes. Evidence: `docs/design/research/retention-2026-10.md` §2.2.
- Coach insight cards (Plus — see `COACH_AGENT.md`)

### 6. Share & Wrapped Module (free — this is the growth engine)
- **Category identity card** — "Sharp in health · Tracker in money," screenshot-native,
  one-tap share, with a subtle "get your own" hook. Its lines follow D27 (above): only
  categories past the count gate are named; with none yet, it reads "Calibrating" and
  the count to go.
- **Calibration Wrapped** — weekly and yearly recap of the user's forecasting story.
- Exports a PNG the OS share sheet accepts.
- A text share ends on the App Store link with a campaign token (`ct=share-card-text`)
  once `APP_STORE_ID` is set (decided 2026-10-08, `GROWTH_AND_MONETIZATION.md` §0
  step 1), so App Store Connect counts installs per share surface with no SDK and no
  identifier. That count is the share-loop gate (GROWTH §7).

Nothing that produces a shareable artifact is ever paywalled.

### 7. Notification Service
- **Resolution reminder** — fires at 19:00 local on the due day (decided 2026-10-05;
  due dates are stored at noon, which was before most outcomes were known)
- **Weekly digest** — fires Sunday evening, summarizes open and upcoming predictions
- **Trial ending** — 10:00 local two days before a free trial renews, with the
  renewal date and the store's price, and no offer (decided 2026-10-07, roadmap
  D16). Cancelled when the trial is cancelled or over, or notifications are off.
- **Practice reminder** — off until the user picks a moment ("With coffee ·
  8:00 AM", "At lunch · 12:30 PM", "After dinner · 8:30 PM"; in You also **Pick a
  time**, any time of day, added 2026-10-10, D31), offered under a finished practice
  and in You (decided 2026-10-07, roadmap step 89). One a day,
  only on days the practice isn't done, with a different title daily and that
  day's first question as the body. Scheduled at most three days ahead of the
  last time the app was open, so someone who stops opening it gets three, then
  silence. Never the streak, never a loss.

All four follow the Notifications switch. Under it (decided 2026-10-10, D31),
**Due-day reminders** and **Sunday digest** each have their own switch, on by
default, and the practice reminder its own choice of time; the trial-ending reminder
follows the main switch alone.

### 8. Rating prompt
Apple's system rating prompt (`expo-store-review`), requested on Today after a
Resolve sheet closes on a finished run or on the answer that unlocked the score,
only after 7 days and 10 yes/no answers, never in the Warmup, at most once per 90
days (decided 2026-10-07, roadmap D15). Never tied to a Yes: reward calibration,
not correctness.

### 9. Daily practice (decided 2026-10-07, at the owner's request for retention features)
Three two-choice questions a day, with the Warmup's 50–100% confidence control,
the **same three for everyone on the same local day**. Real predictions resolve
when they come due, which the user doesn't choose, so this is the reason to open
the app on a day nothing is due (`docs/design/research/retention-2026-10.md` §2.5).

- Questions are drawn at random from reference tables (`src/constants/practiceFacts.ts`:
  city coordinates, country areas, heights, diameters, years, atomic numbers), never
  picked to be tricky. Each kind deals from a shuffled deck of every fair pair: close
  enough not to be a giveaway, far enough apart that no answer rests on which source
  a number came from. This is the representative bank D14 (c) waits on.
- **Practice is practice.** Stored on the device only (`practice_answers`), never
  synced, and never mixed into `UserStat`, `CategoryStat`, the streak, badges or
  Wrapped, exactly like the Warmup. The app never claims practice improves the real
  score (the evidence for transfer is mixed).
- The day's answers land together, with the Warmup's answer key, and "2 of 3 right.
  You expected about 2." The practice record says which way it leans only from 20
  answers (the same floor as the rating), and draws its chart from there.
- On Today as one row under the streak, from the first logged prediction on (not on
  Day 0, where the next thing is the first real prediction). Erase clears it.

---

## Monetization (summary — full rationale in `GROWTH_AND_MONETIZATION.md`)

Light freemium. The entire core loop and every shareable artifact are **free forever**;
Plus sells insight, depth, and cosmetics only.

| Capability | Free | Plus |
|---|---|---|
| Log / Resolve / Stats, score, curve, badges, streaks | ✅ | ✅ |
| Share cards + Calibration Wrapped | ✅ | ✅ (extra themes) |
| Full history | ✅ | ✅ |
| Export your predictions as CSV (D31, 2026-10-10) | ✅ | ✅ |
| Coach agent + AI insights | — | ✅ |
| Advanced analytics, trends | — | ✅ |
| Card/badge cosmetics | — | ✅ |

Pricing intent: ~$4.99/mo, ~$29.99/yr (annual anchored, shown first), optional lifetime.
Re-checked against the 2026 market on 2026-10-08: $29.99 sits below the median annual
price ($34.80 across apps, $39.94 in Health & Fitness), and GROWTH §4 recommends
**$34.99/yr and $79.99 lifetime, monthly unchanged** (P1, the owner's call, not
applied). No paid installs while revenue per install is far below what one costs
(GROWTH §2.4).

**Trial: one free month on the annual plan** (decided 2026-09-25), auto-renewing
into the paid year unless cancelled. A calendar month sits inside the measured
42.5%-conversion band ("17–32 days") instead of the unmeasured gap 14 days falls
in, and Plus only becomes legible once predictions *resolve* — a month is more
than one resolution cycle. This is a store-side setting: the app renders whatever
trial the store reports, per plan, in the store's own units ("1 month", not "30
days" — a calendar month is 28–31 days and this is a billing screen). The paywall
must also state that the trial converts and that cancelling takes **24 hours'**
notice, which is Apple's actual rule.

Two open points remain in `GROWTH_AND_MONETIZATION.md`: the price itself (P1, §4),
and **net revenue, which depends on the unsettled Apple link-out commission
question** (§2.3) — $29.99/yr is $25.49 in hand at the Small Business rate. The
stance until a court rules: IAP only, no web checkout. Re-verify before relying on a
revenue number. The go-to-market sequence and its gates are GROWTH §0 and §7.

Rule: the paywall never touches the core loop or anything shareable.

---

## AI Integration

AI is a non-essential utility layer. The app works fully without it. Two distinct
features, both optional and both fail-silent:

### A. Refine (free, user-initiated) — **CUT from v1, deferred**

> **Status (2026-09-24): built, not shipped, not deployed.**
> `REFINE_ENABLED` in `src/constants/app.ts` is `false`; the ✨ button and its
> Settings row are hidden, and `supabase/functions/refine/` is not deployed.
> The first live run against a funded OpenAI account found the prompt below
> turns predictions into **questions** — "I'll finish the report" came back as
> "Will I finish the report?", four inputs out of four — which is no more
> resolvable than what the user typed.
>
> Two rewrites showed this is not a wording bug. Ask for specificity and the
> model invents it ("at least $100,000 in sales"; a deadline in 2023, in a
> field where the app already stores the due date). Forbid invention and it
> returns the input with the hedging stripped. **A vague prediction cannot be
> made checkable without information only the user has** — and the worked
> example below quietly assumes invention is fine ("3", "priority tasks" and
> "Friday" appear nowhere in its input).
>
> That is a product decision, not a prompt fix, and the feature is explicitly
> optional — so it waits. A user who accepts an invented number has logged a
> prediction they never made, and their calibration data now measures the
> model. The client, the function and their tests are kept intact and dormant.
> Reviving it means: fix the prompt against fixtures, flip the flag, deploy.

The spec as designed, for when it returns:
A single ✨ Refine button after the user types a prediction. Sends the text to the backend
and returns a rewritten version. User accepts or ignores.

**Prompt:**
```
Rewrite this prediction to be concise and resolvable with a clear yes/no.
Keep it under 15 words. Return only the rewritten prediction, nothing else.

Prediction: {user_input}
```
- Input: "I'll do better at work this week"
- Output: "I'll complete 3 priority tasks before Friday"

### B. Coach agent (Plus)
A bounded, read-only agent that interprets the user's computed calibration numbers and
returns 0–3 short grounded insights. **`COACH_AGENT.md` is the authoritative spec** —
grounding rules, injection defense, crisis pre-filter, min-N gating, tone constraints,
and eval fixtures all live there. Do not implement the Coach from this summary alone.

Hard constraints carried here for visibility:
- The app computes every statistic; the model only interprets. Every insight cites an
  `evidence` number that a validator checks against the input, or it is dropped.
- No diagnosis, no personality inference, no medical/financial/legal advice, no numeric
  diet or exercise targets.
- Freetext (titles, reflections) is **not** sent by default.
- Distress-signalling freetext is caught by a pre-filter *before* any coaching call and
  routed to a support surface, never to the model.

### Backend Proxy Architecture
API keys never live in the client. All AI calls go through Supabase Edge Functions, and
**every function verifies the caller's Supabase JWT** — an unauthenticated function is an
open proxy against your OpenAI billing.

```
Mobile App
  → POST /functions/v1/refine   { prediction: string }   (JWT required)
  → POST /functions/v1/coach    { context: CoachContext } (JWT required)
  → Supabase Edge Function (verifies JWT, rate-limits, caps tokens)
  → OpenAI GPT-4o-mini (key server-side only)
  → validated JSON response
  → Mobile App renders, or silently no-ops on any failure
```

**Edge Function pattern (every function follows it):** read the bearer token and
verify it with `supabase.auth.getUser` (401 otherwise), rate-limit per user (429),
validate and cap the input (400), call the model with `max_tokens` capped, return 502
on empty output, and let the client treat any non-200 as a silent no-op. The
reference implementation is `supabase/functions/refine/`; `coach` extends it with the
grounding validator (`COACH_AGENT.md`).

---

## Point / Badge System

### Integrity Points — dropped (2026-10-10, D23)
There used to be a bonus for confidences of 35–65%. It paid for a stated number, which
nudges reports toward it, and its rationale was wrong: calls near 50% carry the least
information, not the most. Coverage of the whole range is encouraged by the coverage
nudge instead. The `integrity_bonus` field stays in the data model for compatibility
and is never shown.

### Badge Levels (per category)
| Level | Name | Criteria |
|---|---|---|
| 1 | Guesser | Default starting badge: fewer than 20 resolved in the category |
| 2 | Tracker | 20 predictions resolved |
| 3 | Forecaster | Calibration score above 70 **and ≥ 20 resolved** |
| 4 | Sharp | Calibration score above 85 **and ≥ 50 resolved** |
| 5 | Oracle | Calibration score above 90 **and ≥ 100 resolved** |

The resolution minimums are required, not decorative — a badge earned on three lucky
predictions actively misleads the user about themselves, which is the opposite of the
app's purpose.

Badges are per-category. A user can be Sharp in health and Guesser in finance
simultaneously — this specificity is the key insight and the core shareable artifact.
Today and the share card name only tiers past the count gate (D27, above).

---

## Data Flow (End to End)

```
First run
  → Warmup quiz → instant mini-calibration verdict → first share card

User types prediction
  → (Deferred, not in v1) ✨ Refine → Edge Function (JWT) → OpenAI → suggestion
  → User saves prediction
  → Stored in local SQLite immediately (offline-safe)
  → Synced to Supabase Postgres in background
  → Push notification scheduled for due_date

User taps notification on due_date
  → Resolution screen: yes / no + optional reflection
  → Outcome saved locally + synced
  → Calibration Engine runs:
      → Recalculate bucket accuracy (MAE)
      → Update UserStat.calibration_rating + provisional flags
      → Update CategoryStat + check badge thresholds (score AND min-N)
  → Insights (and Today's summary) reflect the new data
  → (Plus) Coach may surface grounded insight cards
```

---

## Screen List

Four tabs, **Today · Insights · History · You** (decided 2026-10-07, roadmap D3);
Log is a sheet opened by a "+" in the title bar of Today, Insights and History
(D21, 2026-10-09; it floated over the tab bar until then), not a tab, because tabs
navigate and logging is an action. On Today, what's ready to resolve comes before
the streak and practice rows (D22).

| Screen | Purpose | Tier |
|---|---|---|
| Warmup (onboarding) | Estimation quiz → instant calibration verdict → first share card | Free |
| Today (tab) | Pending predictions + calibration rating summary + today's practice row; a sign-in nudge after 30 days on one phone without an account (D31) | Free |
| Practice (sheet, from Today) | Three daily questions, the answer key, the practice record | Free |
| Log Prediction (sheet, from "+") | Title, confidence slider, due date, category (refine deferred) | Free |
| Prediction (sheet, from an open card not yet due) | What you said, due date, Edit, Delete, Answer it now (D25) | Free |
| Resolve (sheet) | Yes / No prompt + optional reflection | Free |
| Insights (tab) | Calibration curve + category breakdown + badges + Coach cards | Free (Coach = Plus) |
| Share / Wrapped (sheet) | Identity card + weekly/yearly recap, export & share | Free |
| History (tab) | Open predictions first, then the full list of past ones, filterable (D26) | Free |
| Paywall | Plus plans, trial, restore purchases | — |
| You (tab) | Your card, Plus, notification prefs, Coach toggle, usage stats, export CSV, how scoring works, account (sign in, delete account / erase device) | Free |

---

## MVP Scope

Build in this order (mirrors `BUILD_PLAN.md`):
1. Log + resolve flow (SQLite, no backend yet)
2. Calibration engine + stats screen
3. Warmup onboarding (Day-0 aha)
4. Share cards + Wrapped (the growth loop)
5. Push notifications for due dates
6. Supabase sync + auth
7. ~~AI refine button (Edge Function + OpenAI)~~ — **deferred, see AI § A**
8. Badge system
9. Weekly digest notification
10. Billing + paywall + Plus gating
11. Coach agent (Plus)

Billing is built **last** — don't ship a checkout before there's something worth paying
for, and validate that people actually share before betting on the free tier.

---

## Key Design Principles

- **AI is never in the critical path.** Log → Resolve → Stats works entirely without it.
- **Reward calibration, not correctness.** A missed prediction at 60% confidence is
  expected and fine. The score reflects honesty, not outcomes.
- **Never present a number built on noise.** Provisional scores and min-N badge gates are
  non-negotiable.
- **Coverage matters, not a number.** Encourage users to log predictions across the
  whole range, including ones they think won't happen, without rewarding any
  particular confidence (D23).
- **Resolution is the data hook; identity is the retention hook.** Users return to watch
  their badges climb and get their weekly reveal.
- **Per-category insight is the core value.** "Sharp in health, Tracker in finance" is
  the aha moment and the thing that travels socially.
- **The free tier is the marketing budget.** Never paywall a shareable artifact.

---

## Coding Conventions

### Language & types
- TypeScript everywhere; `strict: true` in `tsconfig.json`.
- Shared types live in `src/types/index.ts`. Never redefine `Prediction`, `UserStat`,
  `CategoryStat`, `Entitlement`, `CoachContext`, or `CoachOutput` locally — import them.

### Imports
- Path alias `@/` → `src/`, configured in both `tsconfig.json` and `babel.config.js`.
- Import order: external packages, then `@/` imports, then relative imports.

### Async & data access
- All SQLite calls use `async/await` — never `.then()` chains.
- All DB access goes through `src/db/` helpers; screens and components never call the
  SQLite client directly.
- Write to local SQLite first, then sync to Supabase in the background (offline-safe).

### State (Zustand)
- One store slice per file in `src/store/`, named `useXStore` (e.g. `usePredictionStore`).
- Stores hold state and actions only. No business math in stores — calibration logic stays
  in `src/engine/calibration.ts`.
- Entitlement gating reads from `useEntitlementStore`; no component checks billing SDKs
  directly.

### Components & screens
- Components are `PascalCase.tsx`, one component per file.
- Expo Router screens stay thin — delegate data and logic to stores and `src/` modules.

### Visual design
- `docs/design/DESIGN_SYSTEM.md` governs how the app looks, moves and reads (tokens,
  type, motion, haptics, chart, badge, share-card and paywall patterns, approved
  libraries). `docs/design/UI_ROADMAP.md` holds the build order and the open design
  decisions. Read both before UI work. This file wins on product behaviour.
- No hex literals in components — use the tokens in `src/constants/theme.ts`. The
  tokens follow the phone's light or dark appearance (decided 2026-10-07), so every
  text style sets a colour token; share cards keep their own fixed palettes.
- Type is Inter (decided 2026-10-07): use the `type` tokens, which carry the family.
- Yes and No resolutions get identical feedback; colour never carries meaning alone.
- Install native packages with `npx expo install`, never `npm i`.

### AI calls
- AI requests go through `src/ai/refine.ts` and `src/ai/coach.ts` only. They must fail
  silently and never block the save flow or the stats render.
- Every Edge Function verifies JWT, rate-limits per user, and caps tokens and input size.

### Testing — Jest + React Native Testing Library
- Preset: `jest-expo`. Component tests use `@testing-library/react-native`.
- Test files are `*.test.ts` / `*.test.tsx`, co-located next to the source file.
- Unit-test pure logic first — `src/engine/calibration.ts` and `src/db/` helpers are the
  highest-value targets. The engine's worked examples above are required fixtures.
- Component-test the critical Warmup, Log, and Resolve flows.
- Coach requires the adversarial fixtures in `COACH_AGENT.md` §9 before shipping.
- Run with `npm test`.
