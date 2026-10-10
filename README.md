# Calibrate

**Track your predictions. Measure how well your confidence matches reality.**

Calibrate is a mobile app for logging personal predictions with a stated confidence level, then — once each prediction comes due — recording what actually happened. Over time it surfaces a pattern most people never see about themselves: *where* their confidence is trustworthy and where it isn't.

---

## Objective

Most people are systematically **overconfident** or **underconfident**, and usually in domain-specific ways — sharp about their health, hopeless about their finances. Calibrate makes that pattern visible. It answers two questions:

1. **Goal tracking** — Did you do what you said you'd do?
2. **Self-knowledge** — Did your confidence level actually reflect reality?

The core principle: **reward calibration, not correctness.** A prediction you made at 60% confidence that didn't pan out is *expected and fine* — the score measures the honesty of your confidence, not whether you were right. A perfectly calibrated person's "stated confidence vs. actual outcome" chart plots as a straight diagonal line.

The product's "aha" moment is per-category insight — discovering you're an **Oracle** in health but only a **Tracker** in finance.

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
| Notifications    | Expo Notifications (local, scheduled; no push server) |
| Charts & cards   | `react-native-svg`, `react-native-view-shot` for PNG export |
| Motion           | `react-native-reanimated`                          |
| Billing          | RevenueCat (`react-native-purchases`)              |
| AI (optional)    | OpenAI `gpt-4o-mini` via a Supabase Edge Function (the Coach, Plus) |
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
First run
  → Warmup quiz → instant mini-calibration verdict → first share card

User logs a prediction
  → written to local SQLite immediately (offline-safe)
  → synced to Supabase Postgres in the background (signed-in users only)
  → local reminder scheduled for the due date

User taps the reminder on the due date
  → Resolve sheet: yes / no, then an optional one-line reflection
  → outcome saved locally + synced
  → Calibration Engine recomputes bucket accuracy, the overall rating,
    per-category scores, provisional flags and badge thresholds
  → Stats reflects the new data; a score unlock or badge tier-up is celebrated
  → (Plus) the Coach can turn those numbers into grounded insight cards
```

### The calibration engine

Resolved predictions are grouped into five confidence buckets, lower bound inclusive: `[0,20) [20,40) [40,60) [60,80) [80,100]`. For each non-empty bucket:

```
actual_rate       = resolved_yes / total_resolved_in_bucket
bucket_error      = | stated_confidence_mean/100 − actual_rate |    (absolute, not squared)
calibration_score = 100 − (count-weighted mean bucket_error × 100)  (clamped to 0–100)
```

Scores built on too little data are never shown as a headline number: the overall rating is provisional below 20 resolutions and a category below 15, and badges above Tracker need both a score and a resolution minimum. `CLAUDE.md` is the authoritative spec; [`docs/CALIBRATION.md`](./docs/CALIBRATION.md) adds fixtures.

The engine (`src/engine/`) is **pure** — plain objects in, plain objects out, no I/O — which makes it the highest-value unit-test target in the project.

### Security model

- **No API keys in the client.** The OpenAI key lives only in Supabase Edge Function secrets.
- **Every user-facing Edge Function verifies the caller's JWT.** The Coach also checks Plus server-side (`public.entitlements`), rate-limits per user, and keeps a daily cost ceiling. The RevenueCat webhook has no user, so it is gated by a shared secret instead.
- **Freetext never reaches the model.** The Coach is sent aggregated numbers only, and distress-signalling text is caught by an on-device pre-filter first.
- **Row-Level Security** on Postgres scopes every row to its owning user (`auth.uid() = user_id`). The shipped anon key is safe to expose by design — protection comes from RLS, not secret-keeping.

---

## Project Structure

```
app/                      Expo Router routes: (tabs) Home/Log/Stats/History/Settings,
                          warmup/, resolve/[id], share/, account/, paywall
src/
  types/                  Shared domain types — the single source of truth
  db/                     SQLite client, migrations, prediction / stat / warmup / analytics helpers
  engine/                 Calibration, streak, trends, wrapped, warmup, milestones (pure)
  store/                  Zustand stores, one per file
  supabase/               Client, auth, background sync, account deletion
  notifications/          Resolution reminders + weekly digest
  ai/                     Coach client, context builder, validator, crisis pre-filter
                          (and the dormant refine client)
  billing/                RevenueCat wrapper and startup wiring
  analytics/              Closed event catalogue, recorder, flush
  share/ export/          PNG export for share cards; CSV export (Plus)
  constants/              Theme tokens, card themes, badges, app flags
  components/             ui/ primitives + feature folders (prediction, resolution,
                          stats, share, warmup, paywall, account, settings)
supabase/
  migrations/             Postgres schema + RLS policies
  functions/              coach, revenuecat-webhook, delete-account (live);
                          refine (written, not deployed)
docs/                     Verification checklist, next steps, launch drafts, design system
```

---

## Getting Started

```bash
npm install

# Configure environment (optional — the app runs fully offline without it)
cp .env.example .env.local
#   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY enable sync + auth
#   EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY enable billing
#   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID enables Google sign-in

npm start          # start the Expo dev server (open it from a development build;
                   # App Store Expo Go stops at SDK 54 and this app is SDK 55)
npm test           # run the Jest suite
```

Edge Function deploys, secrets and verification steps are in [`supabase/README.md`](./supabase/README.md). ✨ Refine is cut from v1 (`REFINE_ENABLED = false`); its function is kept but deliberately not deployed.

---

## Current Status

The app is feature-complete against the spec: SQLite persistence, the calibration engine, Zustand stores, the full Log → Resolve → Stats flow, the Warmup onboarding quiz, share cards + Calibration Wrapped, resolution & weekly-digest notifications, Supabase auth + background sync, sign-in and account deletion, the Coach agent, billing + paywall, the Plus tier (trends, CSV export, card themes), and product instrumentation. A full UI pass against [`docs/design/DESIGN_SYSTEM.md`](./docs/design/DESIGN_SYSTEM.md) landed 2026-09-26 → 10-03 (tokens, icons and haptics, the confidence control, the chart redesign, Lens badges, share-card shapes, sheets, motion, receipt-first Coach cards); status and open design decisions are in [`docs/design/UI_ROADMAP.md`](./docs/design/UI_ROADMAP.md).

**What remains is mostly verification.** Everything that needs a dashboard, a device, the $99 Apple account or a judgment call is written up batch by batch in [`docs/HUMAN_VERIFICATION.md`](./docs/HUMAN_VERIFICATION.md) — start there. The small amount of code work left is in [`docs/NEXT_STEPS.md`](./docs/NEXT_STEPS.md).

---

## Future TODO

UI feature ideas beyond the roadmap are parked in [`docs/design/FUTURE_UI.md`](./docs/design/FUTURE_UI.md).

**Near-term**
- [ ] **Resolve native integration** — verify notification deep-links land on `resolve/[id]` on a physical device (`docs/HUMAN_VERIFICATION.md`, batch D1).

**Backend & platform (Layer 7)**
- [ ] Notification deep-links verified on a device. (No push credentials are needed: every notification is a local, scheduled one.)
- [x] App icon, splash, and the App Privacy answers (`docs/APP_PRIVACY.md`).
- [ ] Store screenshots, a hosted privacy policy, and a final app name (`docs/APP_STORE_LISTING.md` §0).
- [ ] `eas build` → TestFlight → App Store submission.
- [ ] Clear remaining transitive dependency advisories once the Expo SDK upgrade allows it (currently only resolvable via a breaking `--force`).

**AI features (V2+, Pro-gated, never in the critical path)**
- [ ] **Suggested confidence nudge** — compare an input against the user's historical accuracy on similar predictions. (Distinct from the shipped *range-coverage* nudge, which is deterministic and free.)
- [ ] **AI weekly digest** — plain-English summary of calibration trends.
- [ ] **Pattern detection** — surface non-obvious patterns ("Your Monday predictions are 30% less accurate").
- [ ] **Pre-mortem mode** — stress-test high-stakes predictions before logging.

**Stretch**
- [ ] Android parity and release.
- [ ] Multi-device conflict handling beyond last-write-wins.

---

## License

ISC.
