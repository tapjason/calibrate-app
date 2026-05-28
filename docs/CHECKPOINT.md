# Calibrate — Implementation Checkpoint

**As of:** 2026-05-27
**Branch:** `feat/supabase-auth`
**Latest commit:** `df4a9c7 feat: Supabase auth foundation`

This document captures the state of the implementation as a checkpoint. It maps
what exists against the layered plan in `BUILD_PLAN.md` and the product spec in
`CLAUDE.md`. Use it to brief a new contributor (or a future session) without
re-deriving everything from the source.

---

## TL;DR — what works today

The offline core loop is complete and tested. Notifications and Supabase auth
are wired in. Sync, AI refine, badges-as-UI, and App Store packaging are not yet
built.

- **Log → Resolve → Stats** works end-to-end against a local SQLite DB.
- **Auth** is wired up (Apple / Google / email-password) with a guest-mode
  fallback. Guest data migrates to the user on first sign-in.
- **Notifications**: per-prediction resolution reminders + weekly Sunday digest,
  both observing the prediction store.
- **Tests**: 13 test files covering L1–L6. The calibration engine, streak math,
  db helpers, stores, scheduler, and the two critical screens (Log, Resolve)
  all have unit/component coverage.

Not yet built: Supabase Postgres sync, AI refine Edge Function, badge UI
surfaces, Victory Native charts, app icon/splash, EAS build config.

---

## Layer-by-layer status

### Layer 0 — Scaffold & Config ✅

| Item | Status | File |
|------|--------|------|
| Expo SDK 55 + React Native 0.83 | ✅ | `package.json` |
| `strict: true` TS + `@/*` alias | ✅ | `tsconfig.json` |
| Babel preset (alias relies on tsconfig) | ✅ | `babel.config.js` |
| `jest-expo` preset + RNTL | ✅ | `package.json` `jest` block |
| `app.json` (bundle id, scheme, plugins) | ✅ | `app.json` |
| Web target enabled for the offline-loop verifier | ✅ | commit `cde2bf7` |
| `eas.json` | ⚠️ present but empty placeholder |
| Folder skeleton (`src/{types,db,engine,store,supabase,notifications,components,constants}`) | ✅ | — |
| `src/ai/` folder | ❌ not created yet |

### Layer 1 — Types & Contracts ✅

Single source of truth: `src/types/index.ts`.

- Data shapes: `Prediction`, `UserStat`, `CategoryStat`, `BucketStat`,
  `CalibrationResult`.
- Unions: `Category`, `PredictionStatus`, `ResolvedStatus`, `BadgeLevel`.
- Function-signature contracts for every L2 db helper and L3 engine function.
  Implementations declare `const fn: AliasName = (...) => ...` so the compiler
  enforces the shape from one place.

### Layer 2 — Data Access (SQLite) ✅

| File | Purpose |
|------|---------|
| `src/db/client.ts` | `DbAdapter` interface, expo-sqlite adapter, serialized `withTransaction()`, test-only `setDbForTests()` |
| `src/db/migrations/001_initial.ts` | Idempotent `CREATE TABLE IF NOT EXISTS` for `predictions`, `user_stats`, `category_stats` + CHECK constraints mirroring TS unions |
| `src/db/predictions.ts` | CRUD: `insert`, `get`, `listPending`, `listResolved`, `resolve` (with `AND status='pending'` double-resolve guard), `delete` |
| `src/db/stats.ts` | `get/upsert/listCategoryStats`, `deleteCategoryStat` for pruning empty categories |
| `src/db/migrateGuestData.ts` | Guest→authenticated handoff (`LOCAL_GUEST_USER_ID = 'local-user-v1'`) — UPDATE predictions, DELETE both old + new stats rows so caller can recompute cleanly |
| `src/db/testing.ts` | sql.js-backed in-memory `DbAdapter` for Jest; uses asm.js build to dodge jest-expo's globals patching |

Notable invariants:
- All helpers `async/await`, no `.then()` chains.
- `integrity_bonus` is INTEGER 0/1 on disk, converted at the boundary.
- `withTransaction` is queued through a single promise chain because SQLite
  rejects nested BEGINs on a single connection (`commit 372df4e`).
- DB opens via `openDatabaseAsync` (not Sync) — Sync needs SharedArrayBuffer +
  COOP/COEP headers the Expo dev server doesn't send on web (`commit 89b8671`).
- Migration system caveat: 001 is run on every startup. The first schema change
  will need a `_migrations` tracking table.

### Layer 3 — Calibration Engine ✅

| File | Purpose |
|------|---------|
| `src/engine/calibration.ts` | `computeCalibration` (5 buckets of 20%, top bucket is `[80,100]` inclusive), `evaluateBadge` |
| `src/engine/streak.ts` | `computeStreak` — counts consecutive UTC days back from latest `resolved_at`; skips don't count |

Empty input convention: `computeCalibration([])` returns `rating: 0` and
`buckets: []`, so callers can distinguish "no data" from "perfectly calibrated"
by checking `buckets.length`.

Pure module — only imports from `@/types`. No I/O, no stores.

### Layer 4 — State (Zustand) ✅

| Store | Purpose |
|-------|---------|
| `src/store/predictionStore.ts` | `loadPending`, `loadResolved`, `getById` (user-scoped), `create`, `resolve`, `remove`. All mutations wrap `insertPrediction` + `recomputeForUser` in a single `withTransaction`. |
| `src/store/statsStore.ts` | `loadForUser`, `recomputeForUser` — full recompute (N is small). Iterates all categories so empties get `deleteCategoryStat`'d. Buckets are derived in-memory only. |
| `src/store/authStore.ts` | `initialize` + `reset` (test-only). Subscribes to `onAuthStateChange`. On guest→authenticated transition: runs `migrateGuestDataToUser` then `recomputeForUser`. Falls back to guest mode silently if env vars missing. |

Stores hold no calibration math — they orchestrate L2 (db) + L3 (engine).
Layer rule enforced: stores never call `expo-sqlite` directly.

### Layer 5 — Services 🟡 (partial)

#### Notifications ✅
| File | Purpose |
|------|---------|
| `src/notifications/scheduler.ts` | Resolution reminders. Permission request → `setNotificationHandler` → install tap handler (`router.push('/resolve/[id]')`) → subscribe to `predictionStore.pending` and diff to schedule/cancel per-prediction `DATE` triggers |
| `src/notifications/digest.ts` | Weekly digest. Sunday 18:00 local via `WEEKLY` trigger, stable identifier `calibrate-weekly-digest` so re-scheduling replaces in place. Body refreshes when pending count changes. |

Both modules:
- Are no-ops on web (`Platform.OS === 'web'`).
- Lazy-require `expo-notifications` so Jest doesn't try to load the native bridge.
- Treat the initial pending snapshot as a baseline — they do **not** backfill
  notifications for predictions that existed before `initNotifications()` ran.
- Swallow errors with `console.warn` so a failure can never block the store
  transaction that committed first.

#### Supabase auth ✅
| File | Purpose |
|------|---------|
| `src/supabase/client.ts` | Lazy singleton `SupabaseClient` (PKCE flow, `AsyncStorage` session storage, polyfilled URL). `isSupabaseConfigured()` returns true when env vars present or test client injected. |
| `src/supabase/auth.ts` | `signInWithApple` (iOS only), `signInWithGoogle` (expo-auth-session PKCE + `exchangeCodeForSession`), `signInWithEmail`, `signUpWithEmail`, `signOut`. All return `AuthOutcome = { ok: true } \| { ok: false, error }`. |

#### Supabase sync ❌ not built
`src/supabase/sync.ts` does not exist yet. Predictions live only in local SQLite
even when authenticated. Need: schema mirror in Postgres, local→remote push on
mutation, remote→local pull on app open / auth change.

#### AI refine ❌ not built
- No `src/ai/refine.ts`.
- No `supabase/functions/refine/index.ts`.
- No `supabase/` directory at all.

### Layer 6 — Presentation 🟡 (core complete, polish pending)

Screens (Expo Router under `app/`):

| Screen | File | State |
|--------|------|-------|
| Root layout (auth + DB gate) | `app/_layout.tsx` | ✅ — awaits `initDb` → `auth.initialize` → store warm-up → fire-and-forget notifications init |
| Tabs layout | `app/(tabs)/_layout.tsx` | ✅ |
| Home / Dashboard | `app/(tabs)/index.tsx` | ✅ — rating + pending list |
| Log | `app/(tabs)/log.tsx` + `src/components/prediction/LogPredictionForm.tsx` | ✅ — title, category chips, ±5 confidence buttons, date presets (tomorrow/+1 week/+1 month), integrity-bonus hint |
| Stats | `app/(tabs)/stats.tsx` + `src/components/stats/CalibrationView.tsx` | ✅ functionally — text rows + simple horizontal bars per non-empty bucket. **Victory Native chart not yet integrated.** |
| History | `app/(tabs)/history.tsx` | ✅ — filterable by category |
| Settings | `app/(tabs)/settings.tsx` | ⚠️ placeholder — no real toggles yet |
| Resolve (deep-linked from notifications) | `app/resolve/[id].tsx` + `src/components/resolution/ResolvePrompt.tsx` | ✅ — yes/no/skip + optional reflection; defends against missing or other-user ids |

UI primitives: `src/components/ui/{Button,TextField}.tsx`.

Layer rule enforced: components import only from `@/store` and `@/types`. They
never reach into `@/db`, `@/engine`, `@/supabase`, or `@/notifications`
directly.

### Layer 7 — Native Integration & App Store ❌

- `app.json` declares `bundleIdentifier: com.calibrate.app`, `scheme: calibrate`,
  `usesAppleSignIn: true`, and the four required plugins. ✅
- No app icon / splash assets configured.
- `eas.json` is an empty placeholder — no build profiles defined.
- No notification entitlements / APNs cert work.
- Not built or shipped to TestFlight.

---

## Test coverage

13 test files, all co-located next to source (Jest preset: `jest-expo`).

| Area | Test file |
|------|-----------|
| Constants smoke | `src/constants/app.test.ts` |
| DB predictions | `src/db/predictions.test.ts` |
| DB stats | `src/db/stats.test.ts` |
| Guest data migration | `src/db/migrateGuestData.test.ts` |
| Calibration engine | `src/engine/calibration.test.ts` |
| Streak engine | `src/engine/streak.test.ts` |
| Prediction store | `src/store/predictionStore.test.ts` |
| Stats store | `src/store/statsStore.test.ts` |
| Auth store | `src/store/authStore.test.ts` |
| Notification scheduler | `src/notifications/scheduler.test.ts` |
| Weekly digest scheduler | `src/notifications/digest.test.ts` |
| LogPredictionForm component | `src/components/prediction/LogPredictionForm.test.tsx` |
| ResolvePrompt component | `src/components/resolution/ResolvePrompt.test.tsx` |

Run with `npm test`. DB tests use the sql.js adapter from
`src/db/testing.ts` (real SQLite WASM in Node, not a mock).

---

## Data model snapshot

Schema (from `src/db/migrations/001_initial.ts`):

```sql
predictions (
  id, user_id, title,
  category        CHECK IN ('work','health','finance','social','personal'),
  confidence      INTEGER 0..100,
  created_at, due_date,
  status          CHECK IN ('pending','resolved_yes','resolved_no','skipped'),
  resolved_at, reflection,
  integrity_bonus INTEGER 0|1
)
  + idx (user_id, status), (user_id, due_date)

user_stats (
  user_id PK, calibration_rating, total_predictions,
  total_resolved, current_streak
)

category_stats (
  PK (user_id, category),
  predictions_made, predictions_resolved,
  calibration_score, badge_level
)
```

Calibration math (per `src/engine/calibration.ts`):

```
For each non-empty bucket:
  stated_mean   = mean(confidence in bucket)
  actual_rate   = resolved_yes / total_resolved_in_bucket
  bucket_error  = (stated_mean/100 − actual_rate)²

rating = 100 − mean(bucket_error) × 100      // 0 if no buckets
```

Badge thresholds (per `evaluateBadge`):

| Badge | Criteria |
|-------|----------|
| oracle | score > 90 AND ≥100 resolved |
| sharp | score > 85 |
| forecaster | score > 70 |
| tracker | ≥20 resolved |
| guesser | default |

Integrity bonus: `confidence ∈ [35, 65]` (inclusive both ends).

---

## Known gaps / next steps

In rough priority order:

1. **Supabase sync** — schema mirror in Postgres + local→remote push on
   mutations + remote→local pull on auth change. Without this, signed-in users
   still lose data when they reinstall.
2. **AI refine** — `src/ai/refine.ts` + Edge Function. Must fail silently per
   `CLAUDE.md` — never block the save flow.
3. **Stats chart** — replace the text-bar `CalibrationView` with a Victory
   Native diagonal plot (the "perfectly calibrated = straight line" intuition).
4. **Badges UI** — `badge_level` is computed and persisted but not surfaced in
   any screen beyond the per-category row in stats.
5. **Settings screen** — notifications toggle + AI refine toggle.
6. **EAS / App Store** — flesh out `eas.json`, ship app icon/splash, configure
   APNs, run a TestFlight build.

---

## Architectural invariants (do not break)

These are load-bearing and are enforced (or should be) by code review of any
change:

- **Dependency arrow only points downward.** L3 never imports a store. L6 never
  calls the SQLite client or the engine directly — it goes through L4.
- **All SQLite mutations + their stats recompute go through `withTransaction`**,
  so the stats can never reflect a half-applied change (`commit aeeba66`).
- **Resolution is double-resolve-guarded** at the SQL level
  (`AND status='pending'`), defense-in-depth for notification re-taps
  (`commit 870079d`).
- **Layer 5 services fail silently** — every notification/sync/AI error is
  logged and swallowed. The offline core loop must keep working when the
  service is broken or absent.
- **Shared types live only in `src/types/index.ts`.** Never redefine
  `Prediction`, `UserStat`, or `CategoryStat` locally.
