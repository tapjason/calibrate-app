# Calibrate — Build Plan (by Abstraction Layer)

This document orders the work by **level of abstraction**, lowest first. Each layer
depends only on layers below it and never imports from layers above. Build and
verify a layer fully before starting the next — every layer has a **Gate** that must
pass first.

```
Layer 7  Native integration & App Store      (highest abstraction)
Layer 6  Presentation — components & screens
Layer 5  Services — notifications, AI, sync
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

## Layer 0 — Project Scaffold & Config

**Purpose:** A buildable, empty Expo app with tooling in place.

**Build:**
- `package.json`, Expo SDK install, `app.json` (iOS bundle ID, name, icons).
- `tsconfig.json` with `strict: true` and the `@/` → `src/` path alias.
- `babel.config.js` with the matching module-resolver alias.
- `jest-expo` preset + `@testing-library/react-native` configured.
- `eas.json` for App Store builds.
- Folder skeleton: `src/{types,db,engine,store,supabase,notifications,ai,components}`.

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
- Function-signature contracts for the engine and db helpers (the shapes other
  layers will implement against).

**Depends on:** Layer 0.

**Gate:** `tsc --noEmit` passes. No type is defined anywhere outside this file.

---

## Layer 2 — Data Access (SQLite)

**Purpose:** Persist and retrieve domain objects. The only layer that touches the
SQLite client.

**Build:**
- `src/db/client.ts` — Expo SQLite setup.
- `src/db/migrations/001_initial.sql` — tables for predictions and stats.
- `src/db/predictions.ts` — CRUD helpers, all `async/await`.
- `src/db/stats.ts` — read/write `UserStat` and `CategoryStat`.

**Depends on:** Layers 0–1.

**Gate:** Unit tests for each helper (insert → read back → update → delete) pass
against a real SQLite instance. No `.then()` chains.

---

## Layer 3 — Domain Logic (Calibration Engine)

**Purpose:** The core math. Pure functions — no I/O, no storage, no state.

**Build:**
- `src/engine/calibration.ts`:
  - Bucket a set of resolved predictions (0–20 … 80–100).
  - `bucket_error = (stated_confidence/100 − actual_rate)²`.
  - `calibration_score = 100 − (mean bucket_error × 100)`.
  - Badge-threshold evaluation per category.

**Depends on:** Layer 1 only (takes plain objects in, returns plain objects out).

**Gate:** Exhaustive unit tests — perfect calibration → straight diagonal / score
100; known over/underconfident fixtures → expected scores; empty-bucket edge cases.
This is the highest-value test target in the project.

---

## Layer 4 — State (Zustand Stores)

**Purpose:** Connect data (L2) and domain logic (L3) into observable app state.

**Build:**
- `src/store/predictionStore.ts` — load/create/resolve predictions via `src/db/`.
- `src/store/statsStore.ts` — on resolution, run the engine (L3), persist results
  via `src/db/`.
- `src/store/authStore.ts` — session state (wired to Supabase in L5).

**Depends on:** Layers 1–3. Stores orchestrate; they contain no calibration math.

**Gate:** Tests simulate a resolve action and assert the store recomputes and
persists stats correctly.

---

## Layer 5 — Services (Notifications, AI, Sync)

**Purpose:** External-system integrations. Each is optional to the core loop and
fails gracefully.

**Build:**
- `src/notifications/scheduler.ts` — schedule resolution reminders on `due_date`.
- `src/notifications/digest.ts` — Sunday weekly digest.
- `src/supabase/{client,auth,sync}.ts` — auth + background local→remote sync.
- `src/ai/refine.ts` — call the `/functions/v1/refine` Edge Function; fail silently.
- `supabase/functions/refine/index.ts` — OpenAI proxy Edge Function.

**Depends on:** Layers 1–4.

**Gate:** A scheduled notification fires; sync round-trips a record; `refine` returns
a suggestion AND a forced failure leaves the save flow unaffected.

---

## Layer 6 — Presentation (Components & Screens)

**Purpose:** The UI. Reads from stores (L4), calls service actions (L5). Never
touches the SQLite client or the engine directly.

**Build:**
- `src/components/` — `ui/` primitives, then `prediction/`, `stats/`, `resolution/`.
- Screens in `app/`: Home → Log → Resolve → Stats → History → Settings.
- `app/_layout.tsx` — root layout + auth gate; `resolve/[id].tsx` deep-linked from
  notifications.

**Depends on:** Layers 1–5.

**Gate:** Component tests for the Log and Resolve flows. Manual run of the full
loop in the iOS simulator: log a prediction → resolve it → see stats update.

---

## Layer 7 — Native Integration & App Store

**Purpose:** Ship it.

**Build:**
- iOS permissions/entitlements in `app.json` (notifications).
- Push notification credentials, deep-link config verified on a device.
- App icon, splash, screenshots, privacy declarations.
- `eas build --platform ios` → TestFlight → App Store submission.

**Depends on:** all layers.

**Gate:** A signed build runs on a physical device; a notification deep-links into
the Resolve screen; TestFlight build accepted.

---

## Recommended Sequence

L0 → L1 → L2 → L3 → L4 → L6 (core UI on the offline loop) → L5 (notifications, then
sync, then AI) → L7.

Note Layer 6 can begin once Layer 4 exists — the app is fully usable offline before
any Layer 5 service is built, matching the principle that **Log → Resolve → Stats
works entirely without AI or backend.**
