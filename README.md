# Calibrate

**Track your predictions. Measure how well your confidence matches reality.**

Calibrate is a mobile app for logging personal predictions with a stated confidence level, then — once each prediction comes due — recording what actually happened. Over time it surfaces a pattern most people never see about themselves: *where* their confidence is trustworthy and where it isn't.

---

## Objective

Most people are systematically **overconfident** or **underconfident**, and usually in domain-specific ways — sharp about their health, hopeless about their finances. Calibrate makes that pattern visible. It answers two questions:

1. **Goal tracking** — Did you do what you said you'd do?
2. **Self-knowledge** — Did your confidence level actually reflect reality?

The core principle: **reward calibration, not correctness.** A prediction you made at 60% confidence that didn't pan out is *expected and fine* — the score measures the honesty of your confidence, not whether you were right. A perfectly calibrated person's "stated confidence vs. actual outcome" chart plots as a straight diagonal line.

The product's "aha" moment is per-category insight — discovering you're an **Oracle** in health but a **Guesser** in finance.

---

## Intended Users

- **Forecasting & rationality enthusiasts** who already think in probabilities and want a lightweight, personal alternative to spreadsheets or prediction-market scoring.
- **Goal-oriented self-improvers** who want accountability ("did I do it?") *plus* a feedback loop on their own judgment.
- **Decision-makers** (founders, PMs, investors, clinicians) who make repeated calls under uncertainty and want to know which of their instincts to trust.

The app is designed to be approachable for a general productivity audience — logging a prediction takes under 15 seconds — while the calibration scoring underneath is rigorous enough for the quantitatively-minded.

---

## Architecture

Calibrate is a **local-first** Expo / React Native app. The full core loop — **Log → Resolve → Stats** — works entirely offline against on-device SQLite. Cloud sync, push notifications, and AI are optional services layered on top; none of them sit in the critical path.

### Tech stack

| Layer            | Choice                                            |
|------------------|---------------------------------------------------|
| Mobile           | React Native (Expo SDK 55, Expo Router)           |
| Local storage    | SQLite (`expo-sqlite`)                            |
| State            | Zustand                                            |
| Backend / sync   | Supabase (Postgres + Auth + Edge Functions)       |
| Push             | Expo Notifications                                |
| AI (optional)    | OpenAI `gpt-4o-mini` via a Supabase Edge Function |
| Tests            | Jest (`jest-expo`) + React Native Testing Library |

### Layered design

The codebase is organized by **level of abstraction**, and the dependency arrow only ever points downward. The calibration engine never imports a store; a screen never touches SQLite directly. (Full detail in [`BUILD_PLAN.md`](./BUILD_PLAN.md).)

```
Layer 6  Presentation — components & screens      app/, src/components/
Layer 5  Services — notifications, AI, sync       src/notifications/, src/ai/, src/supabase/
Layer 4  State — Zustand stores                   src/store/
Layer 3  Domain logic — calibration engine        src/engine/
Layer 2  Data access — SQLite                     src/db/
Layer 1  Types & contracts                         src/types/
```

### Data flow (end to end)

```
User types a prediction
  → (optional) taps ✨ Refine → Edge Function → OpenAI → concise rewrite suggested
  → saves prediction → written to local SQLite immediately (offline-safe)
  → synced to Supabase Postgres in the background
  → push notification scheduled for the due date

User taps the notification on the due date
  → Resolve screen: yes / no + optional one-line reflection
  → outcome saved locally + synced
  → Calibration Engine recomputes bucket accuracy, the overall rating,
    per-category scores, and badge thresholds
  → Stats screen reflects the new data
```

### The calibration engine

Resolved predictions are grouped into five confidence buckets (0–20, 20–40, 40–60, 60–80, 80–100). For each bucket:

```
actual_rate       = resolved_yes / total_resolved_in_bucket
bucket_error      = (stated_confidence/100 − actual_rate)²
calibration_score = 100 − (mean bucket_error × 100)
```

The engine (`src/engine/calibration.ts`) is **pure** — plain objects in, plain objects out, no I/O — which makes it the highest-value unit-test target in the project.

### Security model

- **No API keys in the client.** The OpenAI key lives only in the `refine` Supabase Edge Function (server-side).
- **The refine endpoint requires a real signed-in user** — it verifies the caller's JWT and rejects the public anon key, with a per-user rate limit, to prevent token-burning abuse.
- **Row-Level Security** on Postgres scopes every prediction row to its owning user (`auth.uid() = user_id`). The shipped anon key is safe to expose by design — protection comes from RLS, not secret-keeping.

---

## Project Structure

```
app/                      Expo Router screens (Home, Log, Stats, History, Settings, Resolve)
src/
  types/                  Shared domain types — the single source of truth
  db/                     SQLite client, migrations, prediction & stat helpers
  engine/                 Calibration + streak math (pure functions)
  store/                  Zustand stores (prediction, stats, auth)
  supabase/               Client, auth flows, background sync
  notifications/          Resolution reminders + weekly digest scheduling
  ai/                     refine() client wrapper (fails silently)
  components/             UI primitives + prediction/stats/resolution components
supabase/
  migrations/             Postgres schema + RLS policies
  functions/refine/       OpenAI proxy Edge Function (Deno)
```

---

## Getting Started

```bash
npm install

# Configure environment (optional — the app runs fully offline without it)
cp .env.example .env.local
#   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY enable sync + auth
#   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID enables Google sign-in

npm start          # start the Expo dev server
npm run ios        # or run directly on the iOS simulator
npm test           # run the Jest suite
```

To enable the AI refine feature, deploy the Edge Function and set the OpenAI key:

```bash
supabase functions deploy refine
supabase secrets set OPENAI_API_KEY=sk-...
```

---

## Current Status

The offline core is built and tested: SQLite persistence, the calibration engine, Zustand stores, the full Log → Resolve → Stats screen flow, resolution & weekly-digest notifications, Supabase auth + background sync, and the AI refine button. The stats screen currently renders the calibration curve as text rows + simple bars.

---

## Future TODO

**Near-term**
- [ ] **Real calibration chart** — replace the text/bar view with a Victory Native diagonal plot (stated vs. actual per bucket).
- [ ] **Badge system polish** — surface the per-category badge levels (Guesser → Tracker → Forecaster → Sharp → Oracle) prominently in the UI.
- [ ] **History filtering** — filter past predictions by category and outcome.
- [ ] **Resolve native integration** — verify notification deep-links land on `resolve/[id]` on a physical device.

**Backend & platform (Layer 7)**
- [ ] iOS notification entitlements, push credentials, and deep-link config verified on-device.
- [ ] App icon, splash, store screenshots, and privacy declarations.
- [ ] `eas build` → TestFlight → App Store submission.
- [ ] Clear remaining transitive dependency advisories once the Expo SDK upgrade allows it (currently only resolvable via a breaking `--force`).

**AI features (V2+, Pro-gated, never in the critical path)**
- [ ] **Suggested confidence nudge** — compare an input against the user's historical accuracy on similar predictions.
- [ ] **AI weekly digest** — plain-English summary of calibration trends.
- [ ] **Pattern detection** — surface non-obvious patterns ("Your Monday predictions are 30% less accurate").
- [ ] **Pre-mortem mode** — stress-test high-stakes predictions before logging.

**Stretch**
- [ ] Android parity and release.
- [ ] Multi-device conflict handling beyond last-write-wins.

---

## License

ISC.
