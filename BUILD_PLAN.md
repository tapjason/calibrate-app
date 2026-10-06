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

**Current state (2026-10-05).** All code in L0–L6 is built; `tsc --noEmit` is
clean and `npm test` is 101 suites / 1162 tests green. What is left is almost
entirely L7 and human verification, tracked in `docs/HUMAN_VERIFICATION.md`.
The few remaining code items are in `docs/NEXT_STEPS.md`; UI status and open design
decisions are in `docs/design/UI_ROADMAP.md`. The step-by-step build history that
used to live here is in git (`git log -- BUILD_PLAN.md`).

- **Built:** the offline core loop (Log, Resolve, Stats, History, Settings), the
  Warmup, share cards and Wrapped, notifications, Supabase auth and sync, sign-in and
  the Account screens, account deletion and guest erase, analytics, billing and the
  paywall (one-month trial on annual), the Plus tier (Coach, Trends, CSV export, card
  themes), the coverage nudge, and the UI redesign pass against
  `docs/design/DESIGN_SYSTEM.md`. On 2026-10-04 two more UI batches (roadmap steps
  16–26): the tier-up flip and confetti, resolving several at once, "Log it again",
  the track record on the Log slider, and, in Plus Trends, the correction table and
  calibration by horizon. On 2026-10-05, from a screen-by-screen review (steps
  27–36): the identity line on Home, "How scoring works", reflections in History, a
  dated wait while calibrating, the paywall's top close, and legal links in
  Settings.
- **Cut:** ✨ Refine (2026-09-24), dormant behind `REFINE_ENABLED`; see `CLAUDE.md`
  AI § A for why.
- **Live services:** `coach`, `revenuecat-webhook` and `delete-account` are deployed
  (`refine` is not). The Coach was verified end to end on 2026-09-25: every number
  in a real response came from the request, and min-N held against real output. The
  RevenueCat Test Store has its prices and the one-month annual trial (2026-10-01).
  The Supabase free-tier project **pauses when idle** (it read `INACTIVE` on
  2026-10-03), so restore it from the dashboard before any live test.
- **Decisions on 2026-10-01:** testing is on an **iPhone only** (so a real purchase
  waits on the $99 Apple account), and "Confirm email" stays on for now.
- **Found 2026-10-04:** the App Store's Expo Go stops at SDK 54 and this app is
  SDK 55, so *every* iPhone run needs a development build, and with it the $99
  account. The web build is the only free way to look at the app until then.
  Also new since the code was written: Guideline 5.1.2(i) (name the third-party
  AI before sending it data), Texas age assurance (in force 2026-06-04) and the
  2026 age-rating questionnaire. All three are tracked in `docs/NEXT_STEPS.md`.
- **Before a build with a live paywall reaches anyone:** the three products and the
  `plus` entitlement must exist in App Store Connect and RevenueCat, the public SDK
  key must be in the build's env, and the sandbox-purchase gate needs a person and a
  device. Until then the paywall shows its unavailable state, which is correct.
- **Then:** the validation checkpoint below (instrumented, so it needs users, not
  code), then L7.

### Decisions worth remembering

These came out of the build and are easy to undo by accident. The code comments
next to each carry the detail.

- **Billing.** `fetchEntitlement()` returns `null`, not "free", when it can't reach
  RevenueCat. "Free" and "couldn't ask" are different, or an offline launch strips
  Plus from a subscriber. Nothing in the core loop routes to the paywall.
- **Webhook.** `CANCELLATION` does not revoke (turning off auto-renew isn't the end of
  access); an out-of-order delivery can't resurrect a lapsed plan; events for
  anonymous RevenueCat ids are acknowledged and ignored; events for deleted users get
  a 200.
- **Trial copy.** The paywall shows the store's own trial unit ("1 month", not "30
  days") and says cancelling takes 24 hours' notice, which is Apple's actual rule.
- **Analytics.** The event catalogue is a whitelist with no free-text property, so
  "we never send your predictions" is structural. Events never flush for a guest;
  guest events move to the account on sign-in.
- **Plus without paywalling artifacts.** Every share card exports in the free theme;
  a lapsed subscriber's Plus theme falls back to it. Trends shows counts, never a
  score, for a provisional month or category. CSV export escapes leading `= + - @`.
- **Coverage nudge.** Measured over the last 20 logs including pending ones; a
  single low log switches it off; at most once a week.
- **Notifications are local only.** No push token is requested, so no APNs key is
  needed. The reminder scheduler reconciles with the OS's scheduled requests at
  launch (2026-10-05): its id map is in memory, and without that a relaunched app
  couldn't cancel what it had scheduled earlier. Permission is asked in context, not
  at launch: launch only checks, and `src/notifications/permission.ts` shows the iOS
  alert from Home's reminder prompt or Settings, then starts both services.
- **Days are local.** Streaks, patterns, Wrapped and trends key days by the device's
  local time, and a streak ends once its latest day is before yesterday.

### Invariants (do not break)

- **The dependency arrow only points downward.** L3 never imports a store; L6 never
  calls the SQLite client or the engine directly — it goes through L4. Enforced for
  L6 by `src/components/layering.test.ts` since 2026-10-04 (type-only imports are
  allowed; the root layout may open the database).
- **Every SQLite mutation and its stats recompute run in one `withTransaction`**, so
  stats never reflect a half-applied change.
- **Resolution is guarded at the SQL level** (`AND status='pending'`) against a
  notification being tapped twice.
- **L5 services fail silently.** Every notification, sync, analytics, billing and AI
  error is logged and swallowed; Log → Resolve → Stats works with all of them broken.
- **Shared types live only in `src/types/index.ts`.**

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
  - `006_analytics` — the local product-analytics queue, capped and
    push-then-delete
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
- `src/engine/trends.ts` — the Plus analytics math: month-by-month calibration,
  per-category standing sorted worst-first (provisional categories last), range
  coverage, and the recent-vs-earlier delta.
- `src/engine/coverageNudge.ts` — when to ask for a prediction the user thinks
  is *unlikely*: the recent-window coverage gap, the minimum history, and the
  weekly cooldown. Pure; the Log screen reads the decision through `statsStore`.
- `src/engine/warmup.ts` — scores the onboarding quiz by reusing the same bucketing
  and error functions.
- `src/engine/patterns.ts` — **deterministic** pattern derivations (day-of-week
  accuracy, category drift, over/under direction per category). The Coach consumes
  these; it never computes its own.
- `src/engine/streak.ts`, `src/engine/localTime.ts` — streaks and day/month keys
  in the device's local time (the offset is passed in, so they stay pure).
- `src/engine/wrapped.ts` — weekly and yearly Wrapped summaries, with their own
  min-N gating.
- `src/engine/milestones.ts` — upward crossings only (score unlock, badge tier-up,
  category unlock) for the celebration moments.

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
- `src/analytics/{events,track,flush}.ts` — the closed event catalogue, the
  fire-and-forget recorder, and the batched push. Backed by the local queue in
  `src/db/analytics.ts` (L2) and `analytics_events` in Postgres.
- `src/notifications/scheduler.ts` — schedule resolution reminders on `due_date`.
- `src/notifications/digest.ts` — Sunday weekly digest.
- `src/supabase/{client,auth,sync}.ts` — auth + background local→remote sync.
- `src/share/export.ts` — rasterize a share card to PNG for the OS share sheet.
- `src/ai/refine.ts` — call `/functions/v1/refine`; fail silently. **Dormant:
  refine is cut from v1 (`REFINE_ENABLED = false`), the function is not
  deployed, and no build calls this.**
- `src/ai/coach.ts` — call `/functions/v1/coach`; fail silently; Plus-gated.
- `src/supabase/account.ts` — call `/functions/v1/delete-account`, wiping the
  device only after the server confirms.
- `src/billing/revenuecat.ts` — configure SDK, purchase, restore, entitlement sync,
  all behind a deps seam and all failing to FREE.
- `src/billing/init.ts` — startup wiring: hydrate the mirror, configure RevenueCat for
  the current user, refresh on sign-in and on foreground.
- `supabase/functions/refine/index.ts` — OpenAI proxy. **JWT-verified**, rate-limited,
  input-capped, full error handling (see `CLAUDE.md` for the reference implementation).
  Written and tested; **deliberately not deployed** — see the cut note above.
- `supabase/functions/revenuecat-webhook/index.ts` — RevenueCat → Postgres
  entitlement mirror, so the server can gate Plus without trusting the client.
- `supabase/functions/delete-account/index.ts` — App Store 5.1.1(v) deletion:
  optional Sign in with Apple revoke and RevenueCat customer delete, then
  `auth.admin.deleteUser`, whose rows cascade. Spec: `docs/ACCOUNT_SPEC.md` §3.
- `supabase/functions/coach/index.ts` — Coach endpoint. JWT-verified, rate-limited,
  per-user daily cost ceiling, JSON-schema output validation, grounding validation
  (every `evidence` value must match the input), and the **crisis pre-filter that runs
  before any model call**. Full spec in `COACH_AGENT.md` §5.

**Depends on:** Layers 1–4.

**Gate:**
- A scheduled notification fires; sync round-trips a record.
- ~~`refine` returns a suggestion AND a forced failure leaves the save flow
  unaffected.~~ Deferred with the feature; the save flow never depended on it,
  which is what made the cut free.
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

**Design:** `docs/design/DESIGN_SYSTEM.md` (rules and tokens) and
`docs/design/UI_ROADMAP.md` (redesign order and open decisions).

**Build:**
- `src/components/` — `ui/` primitives, then `prediction/`, `stats/`, `resolution/`,
  `share/`, `paywall/`.
- Screens in `app/`: Warmup → Home → Log → Resolve → Stats → Share/Wrapped → History →
  Paywall → Settings.
- `app/_layout.tsx` — root layout + auth gate; `resolve/[id].tsx` deep-linked from
  notifications; first-run routing into Warmup.
- Provisional-state UI: progress toward threshold instead of a headline number.
- `CoverageNudge` on the Log screen — the range-coverage caveat's answer, free
  and throttled to once a week.
- Coach insight cards on Stats (Plus), plus the support surface for the
  `safe: false` path.
- Soft contextual upsell on Stats (one Plus teaser card); Coach and usage-stats
  toggles in Settings (the Refine row is hidden while `REFINE_ENABLED` is false).
- Account: `app/account` sign-in / sign-up, the Settings Account row, Delete
  account for a signed-in user and Erase all data for a guest.
- Cosmetic theming for cards (Plus) — `src/constants/cardThemes.ts`, applied by
  `IdentityCard` / `WrappedCard` and chosen in `ThemePicker`. The free theme is
  never gated.

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
- IAP products (`calibrate_plus_monthly` / `_annual` / `_lifetime`) configured in App
  Store Connect and mapped to the `plus` entitlement in the RevenueCat dashboard;
  free trial on annual: **one month, decided 2026-09-25** (inside the measured
  "17–32 days" band, and more than one resolution cycle — `GROWTH_AND_MONETIZATION.md`
  §4). The app renders whatever trial the store reports, so the length is a
  dashboard setting; what *is* code is that it renders in the store's own unit
  ("1 month", not "30 days") and states the 24-hour cancellation rule.
- Subscription + AI privacy declarations; app icon, splash, screenshots.
- The 2026 age-rating questionnaire (answers drafted in
  `docs/APP_STORE_LISTING.md` §1), and the in-app OpenAI disclosure that
  Guideline 5.1.2(i) requires before the Coach sends anything.
- Age assurance where the law requires it (Texas since 2026-06-04): the
  Declared Age Range API through `expo-age-range`, failing open. Owner decision
  first (`docs/NEXT_STEPS.md` item i).
- Build toolchain: App Store uploads need Xcode 26 / the iOS 26 SDK since
  2026-04-28. EAS's SDK 55 image meets that; the SDK upgrade (55 → 58) is a
  separate iteration after the first device build.
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
  → L5 services: notifications → sync     (refine: built, then cut 2026-09-24)
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
  decides whether freemium is the right model at all. Instrumented as of
  2026-09-07 — `warmup_started` / `warmup_completed` for the first,
  `share_opened` / `share_completed` for the second.
- **After billing ships:** measure trial-to-paid; run a trial-length experiment.
- **After Coach ships:** measure Plus churn split by AI-heavy vs analytics/cosmetic use —
  AI drives conversion but churns faster, so confirm the sticky layer is working.
