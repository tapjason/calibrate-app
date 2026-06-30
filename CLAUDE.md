# Calibrate — Agent Document

## Project Overview

**Calibrate** is a mobile app that helps users track personal predictions with confidence levels, then measures how accurately their confidence matches real outcomes over time. The core insight: most people are systematically overconfident or underconfident in specific life domains. This app surfaces that pattern so users can learn where to trust their own judgment.

The two primary goals:
1. **Goal tracking** — Did you do what you said you'd do?
2. **Self-knowledge** — Did your confidence level reflect reality?

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
  badge_level: 'guesser' | 'tracker' | 'forecaster' | 'sharp' | 'oracle'
}
```

---

## Feature Modules

### 1. Log Module
Entry point for creating a prediction. Fields: title, confidence slider (0–100), due date, category. Minimal friction — should be completable in under 15 seconds.

Optional AI refine button (see AI section below). Never blocks the save flow.

### 2. Resolution Module
Triggered by push notification on due_date. User taps yes/no + optional one-line reflection. This is the most critical retention touchpoint — calibration data is worthless without resolution.

### 3. Calibration Engine
Runs after every resolution. Groups predictions into confidence buckets and computes actual accuracy per bucket.

```
Calibration Score = 100 - (mean of all bucket_errors × 100)

Where (per bucket):
  stated_confidence_mean = mean of stated confidences of predictions in the bucket
  actual_rate            = resolved_yes / total_resolved_in_bucket
  bucket_error           = (stated_confidence_mean/100 - actual_rate)²

The mean is over non-empty buckets only. See docs/CALIBRATION.md for the full
reference (boundaries, ranges, worked examples).
```

Buckets: 0–20%, 20–40%, 40–60%, 60–80%, 80–100%

A perfectly calibrated user's chart plots as a straight diagonal line. Deviations above the line = underconfident. Below = overconfident.

### 4. Stats & Insight Module
- Overall calibration rating (0–100)
- Calibration curve chart (stated vs. actual per bucket)
- Per-category breakdown with badge levels
- Streak tracker

### 5. Notification Service
Two notification types:
- **Resolution reminder** — fires on due_date
- **Weekly digest** — fires Sunday evening, summarizes open and upcoming predictions

---

## Point / Badge System

### Integrity Points
Bonus awarded for logging predictions with confidence in the 35–65% range. These represent honest uncertainty and are the most valuable data points.

### Badge Levels (per category)
| Level | Name | Criteria |
|---|---|---|
| 1 | Guesser | Default starting badge (no threshold) |
| 2 | Tracker | 20 predictions resolved |
| 3 | Forecaster | Calibration score above 70 |
| 4 | Sharp | Calibration score above 85 |
| 5 | Oracle | Calibration score above 90 over 100+ predictions |

Badges are per-category. A user can be Sharp in health and Guesser in finance simultaneously — this specificity is the key insight.

---

## AI Integration (Optional Feature)

AI is a non-essential utility layer. The app works fully without it. The only essential AI use is prediction rewriting for conciseness — and even this is user-initiated, never automatic.

### Rewrite Feature (Core AI Use)
A single ✨ Refine button appears after the user types a prediction. On tap, it sends the text to a backend endpoint and returns a rewritten version. The user can accept or ignore it.

**Prompt:**
```
Rewrite this prediction to be concise and resolvable with a clear yes/no.
Keep it under 15 words. Return only the rewritten prediction, nothing else.

Prediction: {user_input}
```

**Example:**
- Input: "I'll do better at work this week"
- Output: "I'll complete 3 priority tasks before Friday"

### Optional AI Features (V2+)
These are gated behind Pro and are never in the critical path:
- **Suggested confidence nudge** — compares user's input to historical accuracy on similar predictions
- **Weekly digest** — AI-generated plain-English summary of calibration trends
- **Pattern detection** — surfaces non-obvious patterns ("Your Monday predictions are 30% less accurate")
- **Pre-mortem mode** — stress-tests high-stakes predictions before logging

### Backend Proxy Architecture
API keys never live in the client. All AI calls go through a Supabase Edge Function.

```
Mobile App
  → POST /functions/v1/refine  { prediction: string }
  → Supabase Edge Function
  → OpenAI GPT-4o-mini API (key server-side only)
  → { refined: string }
  → Mobile App displays suggestion inline
```

**Edge Function (TypeScript):**
```ts
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

Deno.serve(async (req) => {
  const { prediction } = await req.json()

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 60,
    messages: [
      {
        role: 'user',
        content: `Rewrite this prediction to be concise and resolvable with a clear yes/no. Keep it under 15 words. Return only the rewritten prediction, nothing else.\n\nPrediction: ${prediction}`
      }
    ]
  })

  const refined = response.choices[0].message.content?.trim()
  return new Response(JSON.stringify({ refined }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

---

## Data Flow (End to End)

```
User types prediction
  → (Optional) taps ✨ Refine → Edge Function → OpenAI → suggestion returned
  → User saves prediction
  → Stored in local SQLite immediately (offline-safe)
  → Synced to Supabase Postgres in background
  → Push notification scheduled for due_date

User taps notification on due_date
  → Resolution screen: yes / no + optional reflection
  → Outcome saved locally + synced
  → Calibration Engine runs:
      → Recalculate bucket accuracy
      → Update UserStat.calibration_rating
      → Update CategoryStat + check badge thresholds
  → Stats screen reflects new data
```

---

## Screen List (MVP)

| Screen | Purpose |
|---|---|
| Home / Dashboard | Pending predictions + calibration rating summary |
| Log Prediction | Title, confidence slider, due date, category, optional refine |
| Resolve | Yes / No prompt + optional reflection |
| Stats | Calibration curve chart + category breakdown + badges |
| History | Full list of past predictions, filterable by category and outcome |
| Settings | Notification preferences, AI refine toggle |

---

## MVP Scope

Build in this order:
1. Log + resolve flow (SQLite, no backend yet)
2. Calibration engine + stats screen
3. Push notifications for due dates
4. Supabase sync + auth
5. AI refine button (Edge Function + OpenAI)
6. Badge system
7. Weekly digest notification

---

## Key Design Principles

- **AI is never in the critical path.** Log → Resolve → Stats works entirely without it.
- **Reward calibration, not correctness.** A missed prediction at 60% confidence is expected and fine. The score reflects honesty, not outcomes.
- **Integrity bonus matters.** Encourage users to log uncertain predictions, not just safe ones.
- **Resolution is the retention hook.** Notifications for due dates are the most important engagement mechanism in the app.
- **Per-category insight is the core value.** Users discovering they're Sharp in health but a Guesser in finance is the aha moment the app is built around.

---

## Coding Conventions

### Language & types
- TypeScript everywhere; `strict: true` in `tsconfig.json`.
- Shared types live in `src/types/index.ts`. Never redefine `Prediction`, `UserStat`, or `CategoryStat` locally — import them.

### Imports
- Path alias `@/` → `src/`, configured in both `tsconfig.json` and `babel.config.js`.
- Import order: external packages, then `@/` imports, then relative imports.

### Async & data access
- All SQLite calls use `async/await` — never `.then()` chains.
- All DB access goes through `src/db/` helpers; screens and components never call the SQLite client directly.
- Write to local SQLite first, then sync to Supabase in the background (offline-safe).

### State (Zustand)
- One store slice per file in `src/store/`, named `useXStore` (e.g. `usePredictionStore`).
- Stores hold state and actions only. No business math in stores — calibration logic stays in `src/engine/calibration.ts`.

### Components & screens
- Components are `PascalCase.tsx`, one component per file.
- Expo Router screens stay thin — delegate data and logic to stores and `src/` modules.

### AI calls
- AI requests go through `src/ai/refine.ts` only. They must fail silently and never block the save flow.

### Testing — Jest + React Native Testing Library
- Preset: `jest-expo`. Component tests use `@testing-library/react-native`.
- Test files are `*.test.ts` / `*.test.tsx`, co-located next to the source file.
- Unit-test pure logic first — `src/engine/calibration.ts` and `src/db/` helpers are the highest-value targets.
- Component-test the critical Log and Resolve flows.
- Run with `npm test`.
