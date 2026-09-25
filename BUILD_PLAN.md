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

**Just landed — the Coach's deterministic core:** `src/ai/coachContext.ts` (aggregated,
freetext-free payload), `src/ai/coachValidate.ts` (schema + grounding + min-N +
out-of-domain), and `src/ai/crisisFilter.ts` (the §5.5 pre-filter and its support
resources). The `COACH_AGENT.md` §9 fixtures are green. No key, network, or account is
involved — this is the half that has to be right before any model call exists.

**Just landed — the Coach endpoint and client:** `supabase/functions/coach/` (JWT gate,
burst limit, durable daily cost ceiling backed by `002_coach_usage.sql`, strict payload
parser, server-side validation) and `src/ai/coach.ts` (Plus gate → crisis pre-filter →
call → re-validate, empty result on every failure). **Deployed 2026-09-07** — see
the deploy note below.

**Just landed — the Coach surface:** `src/store/coachStore.ts` (pull-model request
state + last-good cache), `CoachPanel` and `SupportSurface` on Stats, and the Coach
toggle in Settings, off by default per §5.6. Layer 5 and 6 of the Coach are now
complete.

**Just landed — Coach deployed to Supabase (2026-09-07):** project `calibrate`
(ref `otopheizhjstoeyndcvc`, us-east-1). All three SQL migrations applied;
`functions deploy coach` live with `verify_jwt: true`. Verified against the L5 gate:
401 unauthenticated, 401 malformed JWT, 403 for a signed-in user with no Plus row,
400 for an oversized body / malformed JSON / non-numeric stat, and 400 for an
injection string in `category` — rejected by the enum parser before reaching the
model. The durable daily ledger increments as specified. Both Edge Functions were
also patched to stop echoing upstream error text to callers (it leaked the AI
provider and its billing state); they now return a generic `internal`.

Still unverified: **live generation and grounding on real model output.** The
OpenAI blocker is gone (see the 2026-09-24 note below), but the endpoint's Plus
gate reads `public.entitlements`, and granting a test user Plus there needs the
service role — so the last step is a human one. `refine` is now cut, not
pending.

**Just landed — billing and the paywall:** `react-native-purchases` installed,
`src/billing/revenuecat.ts` (SDK behind a deps seam, so Expo Go / web / Jest run
without it), `src/billing/init.ts` (mirror hydrate → configure → refresh, plus the
sign-in handoff and a foreground refresh), `src/store/paywallStore.ts`, the paywall
screen at `app/paywall.tsx`, and the two soft entry points — the Coach upsell on
Stats and a Plus row in Settings. `entitlementStore` now expires a stale mirror, so
a lapsed plan can't grant Plus to a device that never comes back online.

Two things this deliberately does *not* do. `fetchEntitlement()` returns **null**
when it can't reach RevenueCat rather than collapsing to free — "free" and "couldn't
ask" have to be different values or an offline launch strips Plus from a subscriber.
And nothing in the core loop routes to the paywall: every path into it is a user
tapping something optional.

**Just landed — the RevenueCat webhook:** `supabase/functions/revenuecat-webhook/`
plus migration `004_entitlement_event_cursor.sql`. This is what makes a purchase
visible to the *server*: until it existed, billing worked on-device while the
Coach endpoint still answered 403 to a paying subscriber, because its Plus gate
reads `public.entitlements` and nothing wrote there. The decision logic sits in
its own Deno-import-free module so Jest can test it (28 cases) — `CANCELLATION`
deliberately does not revoke (auto-renew off is not end-of-access), an
out-of-order delivery can't resurrect a lapsed subscription, and an event for an
anonymous RevenueCat id is acknowledged and ignored. Still needs deploying with
`--no-verify-jwt` and wiring in the RevenueCat dashboard (see
`docs/HUMAN_VERIFICATION.md`).

**Just landed — product instrumentation:** `src/analytics/` (a closed event
catalogue, `track()`, and a flush that mirrors sync's shape), the local queue in
migration `006_analytics`, `supabase/migrations/005_analytics_events.sql`, and an
"Anonymous usage stats" toggle in Settings. The validation checkpoint below was
not merely unanswered before this — it was unanswerable, because nothing counted
a Warmup completion or a share.

The design constraint is that the catalogue is a whitelist, not a convenience:
every event and property is declared in `src/analytics/events.ts`, property
values are numbers, booleans and declared enums, and there is no open string
type — so "we never send your predictions" is structural rather than a promise.
Events queue locally, flush on foreground alongside sync, never flush for a
guest, and the queue is capped so a permanently-offline install can't grow it
without bound.

**Just landed — the Plus analytics tier:** `src/engine/trends.ts` (monthly
calibration, per-category drill-down, confidence-range coverage, recent-vs-earlier
delta — all pure, all carrying their own min-N flags), the CSV export
(`src/export/`), and `TrendsPanel` on Stats. This is the sticky non-AI half of
Plus that GROWTH §5.3 asks for: AI converts but churns faster, and a long
calibration record is worth more the longer someone keeps logging. A free user
sees the section with its numbers withheld rather than nothing at all.

Two details that carry the project's rules into the new surface: a provisional
month or category shows a resolution count, never a score, and the CSV escapes
leading `=`, `+`, `-` and `@` so an exported prediction title can't execute as a
formula in Excel or Sheets.

**Just landed — the cosmetic tier:** `src/constants/cardThemes.ts` and the
`ThemePicker` on the Share screen. Five themes; the default is free and every
card exports at full quality in it, so the artifact is never paywalled — Plus
sells the palette, not the card. `resolveTheme()` falls back to the free theme
for an unknown id *and* for a Plus theme held by someone who has lapsed, so a
former subscriber keeps every card they can make, in the free look. Tapping a
locked swatch opens the paywall rather than doing nothing.

That closes the paywall's three promises: Coach, Trends, themes.

**Just landed — the range-coverage nudge:** `src/engine/coverageNudge.ts`, the
`coverageGap` derivation in `statsStore`, a cooldown timestamp in
`settingsStore`, and `CoverageNudge` on the Log screen. This is the last open
item in `CLAUDE.md`'s engine section — "the Log screen should periodically
nudge users to log a prediction they think is unlikely" — and it was the one
piece of the spec that no layer implemented.

It is not cosmetic. The calibration score is the mean of per-bucket errors over
*non-empty* buckets, so a user who only ever logs at 80%+ gets a score computed
from one bucket and presented as a score about them. `confidenceCoverage` in
`trends.ts` already measured that gap, but only inside the Plus analytics
surface — measuring it for the people who had paid, and doing nothing for
everyone else.

Three decisions worth carrying: the gap is computed over the most recent 20
logs including **pending** ones (the habit being measured is what the user
logs, so a 20% prediction counts the day it is made, not weeks later when it
resolves); a single low log switches the nudge off, which means accepting it
silences it immediately rather than nagging the one user who did what was
asked; and it is capped at once a week, because this fires in the core loop and
the core loop must not become a place that lectures you.

**Batch A, first live run (2026-09-24):**

- **The OpenAI account is funded and working.** `gpt-4o-mini` returns 200 on the
  refine prompt. The SHA-256 of the local key matches the digest Supabase
  reports for its stored `OPENAI_API_KEY` exactly, so the deployed functions
  are on the same funded key — no secret needed re-setting.
- **The Supabase project had paused** (free tier, idle since 2026-09-07 — DNS
  stopped resolving entirely). Restored from the dashboard; there is no CLI
  verb for it. Worth knowing it will pause again if left alone for a week.
- **The Coach's auth gate re-verified live:** 401 with no header, 401 on a
  malformed JWT. Live *generation* is still unverified — the Plus gate reads
  `public.entitlements`, whose writes are service-role-only by design, so
  granting a test user Plus is a dashboard step.
- **Migrations 004 and 005 are still unapplied remotely** (001–003 are on).
  `supabase db push` is the remaining step.

**Cut — refine (2026-09-24).** The first live output was the reason. The prompt
turns predictions into *questions* ("I'll finish the report" → "Will I finish
the report?", four inputs out of four), which is no more resolvable than what
the user typed. Asking for specificity makes the model invent it (`$100,000`,
a 2023 deadline); forbidding invention makes it a no-op. A vague prediction
can't be made checkable without information only the user has — a product
question, not a prompt bug.

So `REFINE_ENABLED` in `src/constants/app.ts` is false: the ✨ button and its
Settings row are hidden, the Edge Function stays undeployed, and the client,
function and every test for both are kept intact and dormant behind the flag.
Reviving it is fix the prompt against fixtures → flip the flag → deploy.
Cutting it cost nothing precisely because `CLAUDE.md` required it never be in
the critical path.

**Ship blockers before a build with a live paywall reaches anyone:**
- Products (`calibrate_plus_monthly` / `_annual` / `_lifetime`) and the `plus`
  entitlement have to exist in App Store Connect and the RevenueCat dashboard, and
  the public SDK key has to be in the build's env. Until then the paywall renders
  its unavailable state, which is the correct behavior, not a bug.
- The sandbox-purchase gate below needs a human and a device.

**Next:** finish Batch A (grant a test user Plus, verify live Coach
generation, `db push`), then the validation checkpoint — now instrumented, so
it needs users rather than code. D0 aha completion is `warmup_completed / warmup_started`;
share rate is `share_completed` per active user. That measurement is meant to
happen *before* the checkout goes live. Then L7.

With the nudge landed, **`docs/HUMAN_VERIFICATION.md` is very nearly the entire
remaining critical path** — batches A–E, from funding the OpenAI account to a
TestFlight build.

**One piece of code work remains, and it blocks submission.** Deriving the App
Store privacy answers from the source (`docs/APP_PRIVACY.md`, 2026-09-24) turned
up the gap: the app supports account creation and has **no account-deletion
path**, which Review Guideline 5.1.1(v) requires. The smallest honest version is
a Settings row calling an authenticated Edge Function that deletes the user's
rows and the auth user, then clears local SQLite. Nothing else in the repo
tracked this.

The same pass closed four Batch E items without a build: the splash screen is
already configured (the checklist line was stale), the app icon is not a
placeholder, **no APNs key is needed** — every notification is a *local*
scheduled one, with no push token requested anywhere — and the privacy
declarations are now written down row by row with the file that proves each.

Still needing a human, not code: everything in L7, the simulator and sandbox-purchase
gates, the App Store Connect / RevenueCat product setup, and the trial-length call
(17–21 days, not 14 — see `GROWTH_AND_MONETIZATION.md` §4).

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
- `src/billing/revenuecat.ts` — configure SDK, purchase, restore, entitlement sync,
  all behind a deps seam and all failing to FREE.
- `src/billing/init.ts` — startup wiring: hydrate the mirror, configure RevenueCat for
  the current user, refresh on sign-in and on foreground.
- `supabase/functions/refine/index.ts` — OpenAI proxy. **JWT-verified**, rate-limited,
  input-capped, full error handling (see `CLAUDE.md` for the reference implementation).
  Written and tested; **deliberately not deployed** — see the cut note above.
- `supabase/functions/revenuecat-webhook/index.ts` — RevenueCat → Postgres
  entitlement mirror, so the server can gate Plus without trusting the client.
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
- Soft contextual upsell on Stats; AI + Coach toggles in Settings.
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
  free trial on annual. **17–21 days, not 14** — the measured conversion cliff sits
  between "under 4 days" and "17–32 days", and 14 falls in the unmeasured gap
  (`GROWTH_AND_MONETIZATION.md` §4). The app renders whatever trial the store
  reports, so this is a dashboard decision, not a code change.
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
  decides whether freemium is the right model at all. Instrumented as of
  2026-09-07 — `warmup_started` / `warmup_completed` for the first,
  `share_opened` / `share_completed` for the second.
- **After billing ships:** measure trial-to-paid; run a trial-length experiment.
- **After Coach ships:** measure Plus churn split by AI-heavy vs analytics/cosmetic use —
  AI drives conversion but churns faster, so confirm the sticky layer is working.
