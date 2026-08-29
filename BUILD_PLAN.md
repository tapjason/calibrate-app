# Calibrate — Build Plan (by Abstraction Layer)

This document orders the work by **level of abstraction**, lowest first. Each layer
depends only on layers below it and never imports from layers above. Build and
verify a layer fully before starting the next — every layer has a **Gate** that must
pass first.

Companion to `CLAUDE.md` (the spec). Together these two files are canonical.
`GROWTH_AND_MONETIZATION.md` and `COACH_AGENT.md` hold rationale and detailed sub-specs;
their build items have been merged into the layers below, so this is the single sequence
to follow.

```
Layer 7  Native integration & App Store      (highest abstraction)
Layer 6  Presentation — components & screens
Layer 5  Services — notifications, AI, sync, billing
Layer 4  State — Zustand stores
Layer 3  Domain logic — calibration engine
Layer 2  Data access — SQLite
Layer 1  Types & contracts
Layer 0  Project scaffold & config            (lowest abstraction)
```

Dependency rule: an arrow only ever points downward. The calibration engine (L3)
must not import a store (L4); a component (L6) must not call the SQLite client (L2)
directly — it goes through a store.

---

## Where the build is

Layers 0–4 are complete and green. L5 has notifications, Supabase auth + sync, and
the JWT-verified `refine` function; L6 has the offline core loop (Home, Log, Resolve,
Stats, History, Settings) plus the calibration curve and category badges.

**Just landed — Warmup (the Day-0 aha):** `005_warmup` migration, `src/db/warmup.ts`,
`src/store/warmupStore.ts`, the quiz + verdict components, `app/warmup/`, and the
first-run redirect in `app/_layout.tsx`.

**Just landed — the share loop:** `src/share/export.ts` (view-shot → PNG → OS share
sheet, fail-soft), the category identity card, Calibration Wrapped over weekly and
yearly windows (`src/engine/wrapped.ts`), `app/share/` with a Card / This week /
This year selector, and a share entry point on Stats. Free, unconditionally — no
entitlement check anywhere in that path.

**Next:** billing → paywall → Coach. But note the validation checkpoint below: the
Warmup and the share loop are now both shippable, and measuring D0 aha completion and
share rate is what decides whether freemium is the right model at all. That
measurement is meant to happen *before* the checkout exists.

Still needing a human, not code: everything in L7, the simulator and sandbox-purchase
gates, and re-verifying market pricing before the paywall ships.

---

## Layer 0 — Project Scaffold & Config

**Purpose:** A buildable, empty Expo app with tooling in place.

**Build:**
- `package.json`, Expo SDK install, `app.json` (iOS bundle ID, name, icons).
- `tsconfig.json` with `strict: true` and the `@/` → `src/` path alias.
- `babel.config.js` with the matching module-resolver alias.
- `jest-expo` preset + `@testing-library/react-native` configured.
- `eas.json` for App Store builds.
- Folder skeleton:
  `src/{types,db,engine,store,supabase,notifications,ai,billing,share,components}`.

**Depends on:** nothing.

**Gate:** `npx expo start` boots; `npm test` runs (zero tests is fine); a sample
`@/` import resolves.

---

## Layer 1 — Types & Contracts

**Purpose:** The shared vocabulary every other layer speaks. Pure declarations, no
runtime code.

**Build:**
- `src/types/index.ts` — `Prediction`, `UserStat`, `CategoryStat`, plus the union
  types (`category`, `status`, `badge_level`).
- `Entitlement` (`{ is_plus, source, expires_at }`).
- `WarmupResult` — quiz answers, per-question confidence, computed mini-score.
- `ShareCard` payload — what a card needs to render and export.
- `CoachContext` and `CoachOutput` (shapes defined in `COACH_AGENT.md` §4 and §6).
- Constants: `MIN_N_OVERALL = 20`, `MIN_N_CATEGORY = 15`, bucket boundaries.
- Function-signature contracts for the engine and db helpers.

**Depends on:** Layer 0.

**Gate:** `tsc --noEmit` passes. No type is defined anywhere outside this file.

---

## Layer 2 — Data Access (SQLite)

**Purpose:** Persist and retrieve domain objects. The only layer that touches the
SQLite client.

**Build:**
- `src/db/client.ts` — Expo SQLite setup behind a `DbAdapter` seam, so tests run
  against real SQLite (sql.js) without the native module.
- `src/db/migrations/` — numbered TypeScript modules registered in `index.ts` and
  applied once each by the runner, tracked in a `_migrations` table. Never edit or
  reorder a shipped migration; append a new one.
  - `001_initial` predictions + stats · `002_sync_metadata` · `003_provisional_flags`
  - `004_entitlements` — local entitlement mirror (singleton row)
  - `005_warmup` — warmup results (singleton row, no `user_id` and no join to
    predictions, so Warmup data is *structurally* unable to reach real stats)
- `src/db/predictions.ts` — CRUD helpers, all `async/await`.
- `src/db/stats.ts` — read/write `UserStat` and `CategoryStat` (including the
  provisional flags).
- `src/db/entitlements.ts` — read/write the local entitlement mirror.
- `src/db/warmup.ts` — read/write the stored Warmup. Persists raw answers only;
  scoring stays in the engine so no stale verdict can be cached on disk.

**Depends on:** Layers 0–1.

**Gate:** Unit tests for each helper (insert → read back → update → delete) pass
against a real SQLite instance. No `.then()` chains. Entitlement read with no row
returns **free**, never Plus. Warmup data cannot leak into `UserStat`/`CategoryStat`
queries.

---

## Layer 3 — Domain Logic (Calibration Engine)

**Purpose:** The core math. Pure functions — no I/O, no storage, no state.

**Build:**
- `src/engine/calibration.ts`:
  - Bucket resolved predictions using the fixed boundaries
    `[0,20) [20,40) [40,60) [60,80) [80,100]`.
  - `bucket_error = | stated_confidence_mean/100 − actual_rate |`  ← **absolute**, not squared.
  - `calibration_score = 100 − (mean bucket_error × 100)`, mean over non-empty
    buckets only, clamped to `[0,100]`.
  - Provisional-flag derivation against `MIN_N_OVERALL` / `MIN_N_CATEGORY`.
  - Badge evaluation — requires **both** the score threshold and the resolution
    minimum (see `CLAUDE.md` badge table).
  - Bucket-coverage metric (how much of the 0–100 range the user has actually used).
- `src/engine/warmup.ts` — scores the onboarding quiz by reusing the same bucketing
  and error functions.
- `src/engine/patterns.ts` — **deterministic** pattern derivations (day-of-week
  accuracy, category drift, over/under direction per category). The Coach consumes
  these; it never computes its own.

**Depends on:** Layer 1 only (plain objects in, plain objects out).

**Gate:** Exhaustive unit tests. The worked-example table in `CLAUDE.md` is a required
fixture set — perfect calibration → 100; 0.90 stated vs 0.50 actual → 60; multi-bucket
mean case → 80; empty-bucket and single-bucket edge cases. Below-threshold inputs
produce `provisional = true` and no badge above `tracker`. **This is the highest-value
test target in the project — do not proceed to L4 until it is green.**

---

## Layer 4 — State (Zustand Stores)

**Purpose:** Connect data (L2) and domain logic (L3) into observable app state.

**Build:**
- `src/store/predictionStore.ts` — load/create/resolve predictions via `src/db/`.
- `src/store/statsStore.ts` — on resolution, run the engine (L3), persist results
  via `src/db/`.
- `src/store/authStore.ts` — session state (wired to Supabase in L5).
- `src/store/entitlementStore.ts` — exposes `isPlus` and gated selectors; hydrates
  from the local mirror, refreshes from RevenueCat in L5.
- `src/store/warmupStore.ts` — onboarding quiz progress and result.
- `src/store/coachStore.ts` — request state + cached last-good insight (Plus only).

**Depends on:** Layers 1–3. Stores orchestrate; they contain no calibration math and no
billing logic.

**Gate:** Tests simulate a resolve action and assert the store recomputes and
persists stats correctly. Toggling entitlement flips gated selectors. With
`isPlus = false`, coach selectors return nothing and no network call is attempted.

---

## Layer 5 — Services (Notifications, Sync, AI, Billing)

**Purpose:** External-system integrations. Each is optional to the core loop and
fails gracefully.

**Build:**
- `src/notifications/scheduler.ts` — schedule resolution reminders on `due_date`.
- `src/notifications/digest.ts` — Sunday weekly digest.
- `src/supabase/{client,auth,sync}.ts` — auth + background local→remote sync.
- `src/share/export.ts` — rasterize a share card to PNG for the OS share sheet.
- `src/ai/refine.ts` — call `/functions/v1/refine`; fail silently.
- `src/ai/coach.ts` — call `/functions/v1/coach`; fail silently; Plus-gated.
- `src/billing/revenuecat.ts` — configure SDK, purchase, restore, entitlement sync.
- `supabase/functions/refine/index.ts` — OpenAI proxy. **JWT-verified**, rate-limited,
  input-capped, full error handling (see `CLAUDE.md` for the reference implementation).
- `supabase/functions/coach/index.ts` — Coach endpoint. JWT-verified, rate-limited,
  per-user daily cost ceiling, JSON-schema output validation, grounding validation
  (every `evidence` value must match the input), and the **crisis pre-filter that runs
  before any model call**. Full spec in `COACH_AGENT.md` §5.

**Depends on:** Layers 1–4.

**Gate:**
- A scheduled notification fires; sync round-trips a record.
- `refine` returns a suggestion AND a forced failure leaves the save flow unaffected.
- An unauthenticated call to either function is rejected with 401.
- A sandbox purchase unlocks `isPlus`; restore works; a fresh install with no purchase
  reads as free.
- A share card exports to a PNG the OS share sheet accepts.
- Coach adversarial fixtures from `COACH_AGENT.md` §9 pass: hallucinated-number
  insights are dropped by the validator; an injection fixture cannot alter role or
  output schema; a distress fixture routes to the support surface and never reaches the
  model; an n=3 category yields "keep logging," not a verdict.

---

## Layer 6 — Presentation (Components & Screens)

**Purpose:** The UI. Reads from stores (L4), calls service actions (L5). Never
touches the SQLite client or the engine directly.

**Build:**
- `src/components/` — `ui/` primitives, then `prediction/`, `stats/`, `resolution/`,
  `share/`, `paywall/`.
- Screens in `app/`: Warmup → Home → Log → Resolve → Stats → Share/Wrapped → History →
  Paywall → Settings.
- `app/_layout.tsx` — root layout + auth gate; `resolve/[id].tsx` deep-linked from
  notifications; first-run routing into Warmup.
- Provisional-state UI: progress toward threshold instead of a headline number.
- Coach insight cards on Stats (Plus), plus the support surface for the
  `safe: false` path.
- Soft contextual upsell on Stats; AI + Coach toggles in Settings.
- Cosmetic theming for cards and badges (Plus).

**Depends on:** Layers 1–5.

**Gate:** Component tests for the Warmup, Log, and Resolve flows, plus the paywall.
Manual run of the full loop in the iOS simulator: warmup → verdict → share card →
log a prediction → resolve it → stats update → provisional state renders correctly →
sandbox subscribe → Coach cards and cosmetics unlock.

---

## Layer 7 — Native Integration & App Store

**Purpose:** Ship it.

**Build:**
- iOS permissions/entitlements in `app.json` (notifications).
- Push notification credentials, deep-link config verified on a device.
- IAP products (monthly / annual / lifetime) configured in App Store Connect and the
  RevenueCat dashboard; 14-day trial on annual.
- Subscription + AI privacy declarations; app icon, splash, screenshots.
- `eas build --platform ios` → TestFlight → App Store submission.

**Depends on:** all layers.

**Gate:** A signed build runs on a physical device; a notification deep-links into
the Resolve screen; a real sandbox subscription completes and restores on hardware;
TestFlight build accepted.

---

## Recommended Sequence

```
L0 → L1 → L2 → L3 → L4
  → L6 core UI (Home / Log / Resolve / Stats on the offline loop)
  → Warmup (Day-0 aha)                    ← build EARLY: onboarding + first share card
  → Share cards + Wrapped (free)          ← the growth loop; build BEFORE billing
  → L5 services: notifications → sync → refine
  → Badges + weekly digest
  → Billing + paywall + Plus gating       ← LAST of the money work
  → Coach agent (Plus)                    ← after billing; needs L3 patterns + L5 guards
  → L7 ship
```

Layer 6 can begin once Layer 4 exists — the app is fully usable **and fully shareable**
offline before any Layer 5 service is built, matching the principle that **Log → Resolve
→ Stats works entirely without AI or backend.**

**Why billing is late:** the free tier is the marketing budget, and the whole
light-monetization bet rests on people actually sharing their results. Ship the Warmup
and share cards first and measure share rate. If nobody shares, the premise is wrong and
that is the moment to revisit the model — before you've built a checkout.

---

## Validation Checkpoints (non-code gates)

- **After Warmup + share cards ship:** measure D0 aha completion and share rate. This
  decides whether freemium is the right model at all.
- **After billing ships:** measure trial-to-paid; run a trial-length experiment.
- **After Coach ships:** measure Plus churn split by AI-heavy vs analytics/cosmetic use —
  AI drives conversion but churns faster, so confirm the sticky layer is working.
