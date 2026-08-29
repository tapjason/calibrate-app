# Calibrate — Agent Document

**Canonical spec.** This file and `BUILD_PLAN.md` are the two always-current build
documents. `GROWTH_AND_MONETIZATION.md` and `COACH_AGENT.md` are rationale/reference —
read them for the *why*, but this file governs *what gets built*. If they ever conflict,
this file wins.

## Project Overview

**Calibrate** is a mobile app that helps users track personal predictions with confidence
levels, then measures how accurately their confidence matches real outcomes over time. The
core insight: most people are systematically overconfident or underconfident in specific
life domains. This app surfaces that pattern so users can learn where to trust their own
judgment.

The two primary goals:
1. **Goal tracking** — Did you do what you said you'd do?
2. **Self-knowledge** — Did your confidence level reflect reality?

The product framing is **identity, not statistics**: "Sharp in health, Guesser in money"
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
  integrity_bonus: boolean       // true if confidence was 35–65% (honest uncertainty)
}
```

### UserStat
```ts
{
  user_id: string
  calibration_rating: number     // Rolling 0–100 score
  total_predictions: number
  total_resolved: number
  current_streak: number         // Consecutive days with at least one resolution
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

### Formula (mean absolute error)
```
Per non-empty bucket:
  stated_confidence_mean = mean of stated confidences of predictions in the bucket
  actual_rate            = resolved_yes / total_resolved_in_bucket
  bucket_error           = | stated_confidence_mean/100 − actual_rate |

calibration_score = 100 − (mean of bucket_errors × 100)

The mean is over NON-EMPTY buckets only. Score is clamped to [0, 100].
```

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
| Multi-bucket | errors 0.05, 0.20, 0.35 | — | mean 0.20 | 80 |

A perfectly calibrated user's chart plots as a straight diagonal line. Deviations above
the line = underconfident. Below = overconfident.

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
happen, leaving the low buckets empty and measuring only half the range. The integrity
bonus pulls toward the middle; additionally, the Log screen should periodically nudge
users to log a prediction they think is unlikely. Track bucket coverage as a product
metric.

`docs/CALIBRATION.md` may expand on this with additional fixtures, but this section is
authoritative.

---

## Feature Modules

### 1. Warmup Module (onboarding — build early)
A 60-second first-run quiz of 8–10 estimation questions ("What year was X?" + a 50–100%
confidence slider). Immediately renders a mini calibration chart and a verdict
("You were 85% confident but right 55% of the time — you run overconfident").

Purpose: a real calibration score takes weeks of resolutions, but the first session is
where users decide whether the app is worth keeping. The Warmup delivers the core insight
on Day 0, teaches the mechanic, and produces the first shareable card. Warmup results are
stored separately and **never** mixed into real `UserStat` / `CategoryStat` data.

### 2. Log Module
Entry point for creating a prediction. Fields: title, confidence slider (0–100), due date,
category. Minimal friction — completable in under 15 seconds.

Optional AI refine button (see AI section). Never blocks the save flow.

### 3. Resolution Module
Triggered by push notification on due_date. User taps yes/no + optional one-line
reflection. Calibration data is worthless without resolution.

Note: resolution alone is a weak retention hook. The identity layer (badges climbing,
weekly reveal) carries retention — build it deliberately.

### 4. Calibration Engine
See the authoritative section above.

### 5. Stats & Insight Module
- Overall calibration rating (0–100), or provisional-progress state
- Calibration curve chart (stated vs. actual per bucket)
- Per-category breakdown with badge levels
- Streak tracker
- Coach insight cards (Plus — see `COACH_AGENT.md`)

### 6. Share & Wrapped Module (free — this is the growth engine)
- **Category identity card** — "Sharp in health · Guesser in money," screenshot-native,
  one-tap share, with a subtle "get your own" hook.
- **Calibration Wrapped** — weekly and yearly recap of the user's forecasting story.
- Exports a PNG the OS share sheet accepts.

Nothing that produces a shareable artifact is ever paywalled.

### 7. Notification Service
- **Resolution reminder** — fires on due_date
- **Weekly digest** — fires Sunday evening, summarizes open and upcoming predictions

---

## Monetization (summary — full rationale in `GROWTH_AND_MONETIZATION.md`)

Light freemium. The entire core loop and every shareable artifact are **free forever**;
Plus sells insight, depth, and cosmetics only.

| Capability | Free | Plus |
|---|---|---|
| Log / Resolve / Stats, score, curve, badges, streaks | ✅ | ✅ |
| Share cards + Calibration Wrapped | ✅ | ✅ (extra themes) |
| Full history | ✅ | ✅ |
| Coach agent + AI insights | — | ✅ |
| Advanced analytics, trends, export | — | ✅ |
| Card/badge cosmetics | — | ✅ |

Pricing intent: ~$4.99/mo, ~$29.99/yr (annual anchored, shown first), optional lifetime;
14-day trial on annual. **Re-verify current market pricing before implementing.**

Rule: the paywall never touches the core loop or anything shareable.

---

## AI Integration

AI is a non-essential utility layer. The app works fully without it. Two distinct
features, both optional and both fail-silent:

### A. Refine (free, user-initiated)
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

**Edge Function (`refine`), with auth, limits, and error handling:**
```ts
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    // 1. Auth — reject anonymous callers.
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'unauthorized' }, 401)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)

    // 2. Rate limit per user (see rate_limits table); cheap guard before spending tokens.
    if (await isRateLimited(user.id)) return json({ error: 'rate_limited' }, 429)

    // 3. Validate input.
    const body = await req.json().catch(() => null)
    const prediction = body?.prediction
    if (typeof prediction !== 'string' || prediction.length === 0 || prediction.length > 300) {
      return json({ error: 'bad_request' }, 400)
    }

    // 4. Call model.
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `Rewrite this prediction to be concise and resolvable with a clear yes/no. Keep it under 15 words. Return only the rewritten prediction, nothing else.\n\nPrediction: ${prediction}`
      }]
    })

    const refined = response.choices[0]?.message?.content?.trim()
    if (!refined) return json({ error: 'no_output' }, 502)

    return json({ refined }, 200)
  } catch (_e) {
    return json({ error: 'internal' }, 500)   // client fails silently on any non-200
  }
})

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' }
  })
```

---

## Point / Badge System

### Integrity Points
Bonus awarded for logging predictions with confidence in the 35–65% range. These represent
honest uncertainty and are the most valuable data points.

### Badge Levels (per category)
| Level | Name | Criteria |
|---|---|---|
| 1 | Guesser | Default starting badge (no threshold) |
| 2 | Tracker | 20 predictions resolved |
| 3 | Forecaster | Calibration score above 70 **and ≥ 20 resolved** |
| 4 | Sharp | Calibration score above 85 **and ≥ 50 resolved** |
| 5 | Oracle | Calibration score above 90 **and ≥ 100 resolved** |

The resolution minimums are required, not decorative — a badge earned on three lucky
predictions actively misleads the user about themselves, which is the opposite of the
app's purpose.

Badges are per-category. A user can be Sharp in health and Guesser in finance
simultaneously — this specificity is the key insight and the core shareable artifact.

---

## Data Flow (End to End)

```
First run
  → Warmup quiz → instant mini-calibration verdict → first share card

User types prediction
  → (Optional) taps ✨ Refine → Edge Function (JWT) → OpenAI → suggestion returned
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
  → Stats screen reflects new data
  → (Plus) Coach may surface grounded insight cards
```

---

## Screen List

| Screen | Purpose | Tier |
|---|---|---|
| Warmup (onboarding) | Estimation quiz → instant calibration verdict → first share card | Free |
| Home / Dashboard | Pending predictions + calibration rating summary | Free |
| Log Prediction | Title, confidence slider, due date, category, optional refine | Free |
| Resolve | Yes / No prompt + optional reflection | Free |
| Stats | Calibration curve + category breakdown + badges + Coach cards | Free (Coach = Plus) |
| Share / Wrapped | Identity card + weekly/yearly recap, export & share | Free |
| History | Full list of past predictions, filterable | Free |
| Paywall | Plus plans, trial, restore purchases | — |
| Settings | Notification prefs, AI refine toggle, Coach toggle, subscription mgmt | Free |

---

## MVP Scope

Build in this order (mirrors `BUILD_PLAN.md`):
1. Log + resolve flow (SQLite, no backend yet)
2. Calibration engine + stats screen
3. Warmup onboarding (Day-0 aha)
4. Share cards + Wrapped (the growth loop)
5. Push notifications for due dates
6. Supabase sync + auth
7. AI refine button (Edge Function + OpenAI)
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
- **Integrity bonus matters.** Encourage users to log uncertain predictions, not just
  safe ones.
- **Resolution is the data hook; identity is the retention hook.** Users return to watch
  their badges climb and get their weekly reveal.
- **Per-category insight is the core value.** "Sharp in health, Guesser in finance" is
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
