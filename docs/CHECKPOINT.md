# Calibrate — Implementation Checkpoint

**As of:** 2026-06-16
**Branch:** `master`
**Latest commit:** `3c76f4b feat: add placeholder app icon + wire icon/adaptive/favicon assets`

This document captures the state of the implementation as a checkpoint. It maps
what exists against the layered plan in `BUILD_PLAN.md` and the product spec in
`CLAUDE.md`. Use it to brief a new contributor (or a future session) without
re-deriving everything from the source.

---

## TL;DR — what works today

The offline core loop is complete and tested. Notifications, Supabase auth,
predictions sync, AI refine, the calibration-curve chart, per-category badge
UI, and the Settings toggles are all wired in. The app icon is in place and the
EAS project is linked; the remaining App Store work (splash polish, APNs, the
`submit.production` block, an actual TestFlight build) is the main piece not yet
done.

- **Log → Resolve → Stats** works end-to-end against a local SQLite DB.
- **Auth** is wired up (Apple / Google / email-password) with a guest-mode
  fallback. Guest data migrates to the user on first sign-in.
- **Sync**: predictions push/pull against Postgres with a per-user cursor and
  last-write-wins on `updated_at`. Stats are derived locally after pull.
- **Notifications**: per-prediction resolution reminders + weekly Sunday digest,
  both observing the prediction store.
- **AI refine**: `src/ai/refine.ts` + `supabase/functions/refine/index.ts`
  (OpenAI GPT-4o-mini). Failure path returns null silently; save flow is
  unaffected by network/server/timeouts.
- **Badges**: per-category badge level is surfaced in Stats as a colored chip
  (emoji + label) with a one-line progress hint toward the next badge.
- **Settings**: working Notifications + AI Refine toggles, persisted locally.
  Notifications drives the runtime kill-switch; AI Refine shows/hides the
  ✨ Refine button on the Log screen.
- **Tests**: 21 test files / 183 tests covering L1–L6. The calibration
  engine, streak math, db helpers (incl. the migration runner and sync
  metadata), stores (incl. settings + the notification kill-switch), scheduler,
  digest, sync, refine, and the critical screens (Log, Resolve, Settings) plus
  the chart and category badges all have unit/component coverage.

Not yet shipped: splash polish, APNs/notification entitlements, the
`submit.production` EAS block, and an actual TestFlight build (all
account/credential-bound — see Layer 7).

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
| `eas.json` | ✅ standard development / preview / production build profiles + a `submit.production` stub. EAS project is linked (`extra.eas.projectId` in `app.json`, owner `tapjason`); the `submit.production` block still holds no account-specific config |
| Folder skeleton (`src/{types,db,engine,store,supabase,notifications,components,constants}`) | ✅ | — |
| `src/ai/` folder | ✅ | `src/ai/refine.ts` |

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
- Migrations run through a version-gated runner (`src/db/migrations/index.ts`):
  a `_migrations(id, applied_at)` table records what has run on the device, and
  each unapplied migration is applied in id order inside its own transaction.
  002 (`ALTER TABLE ... ADD COLUMN`) already exercises the non-idempotent path.
  Legacy devices that pre-date the runner (which ran 001 directly on every boot)
  upgrade cleanly — 001 is `IF NOT EXISTS` so it no-ops and is recorded, then 002
  applies and backfills. Both the legacy-upgrade and the mid-migration-rollback
  paths are covered in `runner.test.ts`. Add a migration by appending to
  `MIGRATIONS` with a new id; never edit or reorder existing entries.

### Layer 3 — Calibration Engine ✅

| File | Purpose |
|------|---------|
| `src/engine/calibration.ts` | `computeCalibration` (5 buckets of 20%, top bucket is `[80,100]` inclusive), `evaluateBadge`, `nextBadge` (the next badge up the ladder + its thresholds, for the UI progress hint) |
| `src/engine/streak.ts` | `computeStreak` — counts consecutive UTC days back from latest `resolved_at`; skips don't count |

Empty input convention: `computeCalibration([])` returns `rating: 0` and
`buckets: []`, so callers can distinguish "no data" from "perfectly calibrated"
by checking `buckets.length`.

Pure module — only imports from `@/types`. No I/O, no stores.

### Layer 4 — State (Zustand) ✅

| Store | Purpose |
|-------|---------|
| `src/store/predictionStore.ts` | `loadPending`, `loadResolved`, `getById` (user-scoped), `create`, `resolve`, `remove`. All mutations wrap `insertPrediction` + `recomputeForUser` in a single `withTransaction`. |
| `src/store/statsStore.ts` | `loadForUser`, `recomputeForUser` — full recompute (N is small). Iterates all categories so empties get `deleteCategoryStat`'d. Buckets and the per-category `nextBadges` map are derived in-memory only (the `nextBadge` engine call lives here so L6 never imports the engine). |
| `src/store/authStore.ts` | `initialize` + `reset` (test-only). Subscribes to `onAuthStateChange`. On guest→authenticated transition: runs `migrateGuestDataToUser` then `recomputeForUser`. Falls back to guest mode silently if env vars missing. |
| `src/store/settingsStore.ts` | Device-local prefs `notificationsEnabled` + `aiRefineEnabled`. `hydrate` loads from AsyncStorage (injectable persistence for tests); setters persist + swallow write errors. Not synced to Supabase. The L5 notification services subscribe to it — the store never reaches into L5. |

Stores hold no calibration math — they orchestrate L2 (db) + L3 (engine).
Layer rule enforced: stores never call `expo-sqlite` directly.

### Layer 5 — Services 🟡 (partial)

#### Notifications ✅
| File | Purpose |
|------|---------|
| `src/notifications/scheduler.ts` | Resolution reminders. Permission request → `setNotificationHandler` → install tap handler (`router.push('/resolve/[id]')`, incl. the cold-start tap via `getLastNotificationResponseAsync`, deduped on `request.identifier` so the launching tap routes exactly once) → subscribe to `predictionStore.pending` and diff to schedule/cancel per-prediction `DATE` triggers |
| `src/notifications/digest.ts` | Weekly digest. Sunday 18:00 local via `WEEKLY` trigger, stable identifier `calibrate-weekly-digest` so re-scheduling replaces in place. Body refreshes when pending count changes. |

Both modules also subscribe to `settingsStore.notificationsEnabled` and obey a
single runtime toggle: turning notifications **off** cancels every reminder the
scheduler has queued and the standing weekly digest; turning it back **on**
reschedules from the current pending set (which also covers predictions that
were pending before the toggle). The toggle state is seeded at init and kept in
sync via the store subscription.

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

#### Supabase sync ✅
| File | Purpose |
|------|---------|
| `src/supabase/sync.ts` | `pullRemote` + `pushDirty` + `syncNow` orchestrator. Per-user cursor in AsyncStorage; remote wins iff `remote.updated_at > local.updated_at`. Batch upsert with per-row fallback. Recomputes stats after successful pull. All failures `console.warn` + swallow. |
| `supabase/migrations/001_predictions.sql` | Postgres mirror of the predictions table + per-user RLS policies. |

Stats tables are NOT mirrored — they're derived from predictions and rebuilt
locally via `recomputeForUser` after pull.

#### AI refine ✅
| File | Purpose |
|------|---------|
| `src/ai/refine.ts` | Client wrapper. Calls `supabase.functions.invoke('refine', ...)` with the user's text, returns the rewrite on 2xx or `null` on any failure (missing config, network, non-2xx, missing/empty `refined`, 8s timeout). Logs `console.warn` on failure paths; never throws. |
| `supabase/functions/refine/index.ts` | Edge Function. Validates input (≤500 chars), calls OpenAI `gpt-4o-mini` with the rewrite prompt from `CLAUDE.md`, returns `{ refined }`. Caps output at 200 chars defensively. Logs server-side errors but the client treats every non-2xx as silent. |

Per `CLAUDE.md`, refine is never in the critical path. The `LogPredictionForm`
shows a ✨ Refine button next to the title field; on null the user's text is
untouched. Deploy is documented in `supabase/README.md`.

### Layer 6 — Presentation 🟡 (core complete, polish pending)

Screens (Expo Router under `app/`):

| Screen | File | State |
|--------|------|-------|
| Root layout (auth + DB gate) | `app/_layout.tsx` | ✅ — awaits `initDb` → `auth.initialize` → store warm-up → fire-and-forget notifications init |
| Tabs layout | `app/(tabs)/_layout.tsx` | ✅ |
| Home / Dashboard | `app/(tabs)/index.tsx` | ✅ — rating + pending list; overdue predictions (past `due_date`) are flagged |
| Log | `app/(tabs)/log.tsx` + `src/components/prediction/LogPredictionForm.tsx` | ✅ — title, category chips, ±5 confidence buttons, date presets (tomorrow/+1 week/+1 month), integrity-bonus hint. ✨ Refine button is hidden until the title has text |
| Stats | `app/(tabs)/stats.tsx` + `src/components/stats/CalibrationView.tsx` + `CalibrationChart.tsx` + `CategoryBadge.tsx` | ✅ — calibration-curve chart (stated vs. actual, dashed perfect-calibration diagonal, marker radius scales with bucket n) via `react-native-svg`, per-bucket numeric detail rows, and a per-category badge chip (emoji + label, colored per level from `src/constants/badges.ts`) with a one-line next-badge progress hint. |
| History | `app/(tabs)/history.tsx` | ✅ — filterable by category |
| Settings | `app/(tabs)/settings.tsx` + `src/components/settings/SettingsView.tsx` | ✅ — Notifications + AI Refine toggles (RN `Switch`) bound to `settingsStore`. Notifications drives the kill-switch; AI Refine gates the ✨ Refine button in `LogPredictionForm`. |
| Resolve (deep-linked from notifications) | `app/resolve/[id].tsx` + `src/components/resolution/ResolvePrompt.tsx` | ✅ — yes/no/skip + optional reflection; defends against missing or other-user ids |

UI primitives: `src/components/ui/{Button,TextField}.tsx`.

Layer rule enforced: components import only from `@/store` and `@/types`. They
never reach into `@/db`, `@/engine`, `@/supabase`, or `@/notifications`
directly.

### Layer 7 — Native Integration & App Store 🟡 (scaffolded, not shipped)

- `app.json` declares `bundleIdentifier: com.calibrate.app`, `scheme: calibrate`,
  `usesAppleSignIn: true`, and now registers all five plugins incl.
  `expo-notifications`. ✅
- `eas.json` has standard development / preview / production build profiles, and
  the EAS project is linked (`extra.eas.projectId`, owner `tapjason`). ✅
- App icon, Android adaptive icon, and web favicon are wired
  (`assets/icons/*.png` via `app.json`). ✅ Placeholder art — a real icon pass is
  still worthwhile. `assets/images/splash-icon.png` exists but no splash screen
  is configured in `app.json` yet.
- No notification entitlements / APNs cert work. ← needs Apple Developer account.
- The `submit.production` block in `eas.json` holds no account-specific config. ←
  needs Apple credentials.
- Not built or shipped to TestFlight. ← needs `eas login` + credentials.

The remaining work is account/credential-bound and can't be done in the repo
alone: provide an Apple Developer account + EAS login, configure the splash
screen, fill `submit.production`, then `eas build` → `eas submit`.

---

## Test coverage

21 test files / 183 tests, all co-located next to source (Jest preset:
`jest-expo`).

| Area | Test file |
|------|-----------|
| Constants smoke | `src/constants/app.test.ts` |
| DB predictions | `src/db/predictions.test.ts` |
| DB predictions sync metadata | `src/db/predictions.sync.test.ts` |
| DB stats | `src/db/stats.test.ts` |
| Guest data migration | `src/db/migrateGuestData.test.ts` |
| Migration runner (legacy upgrade + rollback) | `src/db/migrations/runner.test.ts` |
| Calibration engine | `src/engine/calibration.test.ts` |
| Streak engine | `src/engine/streak.test.ts` |
| Prediction store | `src/store/predictionStore.test.ts` |
| Stats store | `src/store/statsStore.test.ts` |
| Auth store | `src/store/authStore.test.ts` |
| Notification scheduler | `src/notifications/scheduler.test.ts` |
| Weekly digest scheduler | `src/notifications/digest.test.ts` |
| Supabase sync | `src/supabase/sync.test.ts` |
| AI refine client | `src/ai/refine.test.ts` |
| Settings store | `src/store/settingsStore.test.ts` |
| LogPredictionForm component | `src/components/prediction/LogPredictionForm.test.tsx` |
| ResolvePrompt component | `src/components/resolution/ResolvePrompt.test.tsx` |
| CalibrationChart component | `src/components/stats/CalibrationChart.test.tsx` |
| CategoryBadge component | `src/components/stats/CategoryBadge.test.tsx` |
| SettingsView component | `src/components/settings/SettingsView.test.tsx` |

Run with `npm test`. DB tests use the sql.js adapter from
`src/db/testing.ts` (real SQLite WASM in Node, not a mock).

---

## Data model snapshot

Schema (from `src/db/migrations/001_initial.ts` + `002_sync_metadata.ts`):

```sql
predictions (
  id, user_id, title,
  category        CHECK IN ('work','health','finance','social','personal'),
  confidence      INTEGER 0..100,
  created_at, due_date,
  status          CHECK IN ('pending','resolved_yes','resolved_no','skipped'),
  resolved_at, reflection,
  integrity_bonus INTEGER 0|1,
  updated_at      TEXT     -- 002: ISO of last local write (last-write-wins + cursor)
  dirty           INTEGER 0|1  -- 002: 1 = unsynced local changes, 0 after push
)
  + idx (user_id, status), (user_id, due_date), (dirty) WHERE dirty = 1

user_stats (
  user_id PK, calibration_rating, total_predictions,
  total_resolved, current_streak, rating_is_provisional
)

category_stats (
  PK (user_id, category),
  predictions_made, predictions_resolved,
  calibration_score, score_is_provisional, badge_level
)
```
(provisional flags added in migration `003_provisional_flags`)

Calibration math (per `src/engine/calibration.ts`; full reference in
`docs/CALIBRATION.md`):

```
For each non-empty bucket:
  stated_mean   = mean(confidence in bucket)
  actual_rate   = resolved_yes / total_resolved_in_bucket
  bucket_error  = | stated_mean/100 − actual_rate |      // absolute (MAE)

rating = 100 − mean(bucket_error) × 100      // clamped [0,100]; 0 if no buckets
```

Badge thresholds (per `evaluateBadge`):

| Badge | Criteria |
|-------|----------|
| oracle | score > 90 AND ≥100 resolved |
| sharp | score > 85 AND ≥50 resolved |
| forecaster | score > 70 AND ≥20 resolved |
| tracker | ≥20 resolved |
| guesser | default |

Integrity bonus: `confidence ∈ [35, 65]` (inclusive both ends).

---

## Known gaps / next steps

In rough priority order:

1. ~~**Stats chart**~~ ✅ Done — `CalibrationChart.tsx` renders the stated-vs-actual
   curve with a dashed perfect-calibration diagonal via `react-native-svg`.
   (Built with `react-native-svg` rather than Victory Native to avoid a
   Skia/dev-client dependency and keep the web verifier working.)
2. ~~**Badges UI**~~ ✅ Done — `CategoryBadge.tsx` renders each category's badge
   as a colored chip (emoji + label from `src/constants/badges.ts`) with a
   one-line next-badge progress hint. The `nextBadge` engine helper feeds the
   hint through the stats store, so L6 never imports the engine.
3. ~~**Settings screen**~~ ✅ Done — `SettingsView.tsx` renders Notifications +
   AI Refine toggles bound to `settingsStore`; the notification services obey
   the kill-switch and the ✨ Refine button is gated on `aiRefineEnabled`.
   (Logic + UI are tested; a visual pass on the screen is still worthwhile.)
4. ~~**Migration versioning**~~ ✅ Done — version-gated runner with a
   `_migrations` table; legacy-upgrade and mid-migration-rollback paths tested.
5. **EAS / App Store** — app icon is in; ship splash, configure APNs, fill the
   `submit.production` block in `eas.json`, run a TestFlight build. ← needs your
   Expo account + Apple credentials.

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
