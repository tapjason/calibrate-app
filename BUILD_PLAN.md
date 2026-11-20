# Fairly Sure — Build Plan (by Abstraction Layer)

This document orders the code by **level of abstraction**, lowest first. Each layer
depends only on layers below it and never imports from layers above. (The repo and
older docs still say Calibrate.)

Companion to `CLAUDE.md` (the spec). Together these two files are canonical.
`GROWTH_AND_MONETIZATION.md` and `COACH_AGENT.md` hold rationale and detailed sub-specs;
their build items were merged into the layers below and are built.

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

**Current state (2026-11-16).** Every layer is built. Steps 1–187 are on `master`;
what each step built is in `docs/design/BUILT_LOG.md`. The first TestFlight build
(1.0.0, build 2, steps through 186) is on the owner's iPhone; build 3 carries step 187.
What is left is mostly the owner's: the on-phone checks (`docs/HUMAN_VERIFICATION.md`,
`docs/TESTFLIGHT_PLAN.md`), App Store Connect, and the items in `docs/SHIP_READINESS.md`
"Open work". Open design decisions are in `docs/design/UI_ROADMAP.md` §2. Older build
history is in git (`git log -- BUILD_PLAN.md`).

- **Cut:** ✨ Refine (2026-09-24), dormant behind `REFINE_ENABLED`; see `CLAUDE.md`
  AI § A for why.
- **Live services:** `coach`, `revenuecat-webhook` and `delete-account` are deployed
  (`refine` is not; the latest redeploys of `coach` and `delete-account` are not yet
  confirmed). The Coach was verified end to end on 2026-09-25: every number
  in a real response came from the request, and min-N held against real output.
  Supabase migrations 001–008 are applied to the live project. The Supabase free-tier
  project **pauses when idle**, so restore it from the dashboard before any live test.
- **Billing:** the three products exist in App Store Connect and RevenueCat (entitlement
  `plus`, offering `default`), and the production build carries the App Store (`appl_`)
  key. Prices and the trial: `GROWTH_AND_MONETIZATION.md` §4.
- **Every iPhone run needs a development or TestFlight build:** the App Store's Expo Go
  stops at SDK 54 and this app is SDK 55. There is no simulator and no Mac
  (`docs/app-profile.md` §18).

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
  "we never send your predictions" is structural. A guest's funnel events go up with
  no id of any kind, to their own table (D43); the rest of a guest's events wait on the
  device and move to the account on sign-in.
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
  alert from Today's reminder prompt or You, then starts both services.
- **Days are local.** Streaks, patterns, Wrapped and trends key days by the device's
  local time, and a streak ends at a past day that didn't count and that no saved rest
  day covered.

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

## The layers

Each layer, where it lives, and the rule it keeps. All are built; a change keeps the
rule and passes `bash scripts/check.sh` (types, then every test).

**Layer 0 — Project scaffold & config.** `package.json`, `app.json`, `eas.json`,
`tsconfig.json` (`strict: true`, the `@/` → `src/` alias), `babel.config.js` (the same
alias), Jest (`jest-expo`, Testing Library, `jest/setupWaits.js`), and `src/constants/`
(theme tokens, card themes, badges, app ids and flags). Rule: components use the
theme tokens, never hex literals; native packages go in with `npx expo install`.

**Layer 1 — Types & contracts.** `src/types/index.ts` only: `Prediction`, `UserStat`,
`CategoryStat`, `Entitlement`, `WarmupResult`, `ShareCard`, `CoachContext` and
`CoachOutput` (`COACH_AGENT.md` §4 and §6), the function contracts the engine and the db
helpers implement, and the shared constants (`MIN_N_OVERALL`, `MIN_N_CATEGORY`,
`MIN_N_BAND`, `BRIER_MIN_N`, the streak and rest-day numbers). Rule: no shared type is
defined anywhere else.

**Layer 2 — Data access (SQLite).** `src/db/`: `client.ts` (expo-sqlite behind a
`DbAdapter` seam, sql.js under Jest), numbered migrations in `src/db/migrations/`
(`001_initial` to `017_refiles`, listed in `index.ts`, each applied once and recorded in
`_migrations`), and the helpers (`predictions.ts`, `stats.ts`, `entitlements.ts`,
`warmup.ts`, `practice.ts`, `categories.ts`, `analytics.ts`, `account.ts`,
`ageBucket.ts`, `migrateGuestData.ts`). Rules: never edit or reorder a shipped
migration, append a new one; `async/await`, never `.then()`; an entitlement read with
no row returns free, never Plus; the Warmup and practice tables have no `user_id` and
no join to predictions, so they can't reach real stats.

**Layer 3 — Domain logic (engine).** `src/engine/`, pure functions: plain objects in,
plain objects out, `now` passed in. `calibration.ts` (buckets, the count-weighted mean
absolute error, the give-or-take, the Brier score and its baseline, badges at the low
end), `chance.ts` and `direction.ts` (the one lean rule), `sameDay.ts` (same-day
answers, `scoredFrom`), `corrections.ts` (the correction window and the counted
deletions, postponements, rewordings and refiles), `streak.ts` and `localTime.ts`,
`patterns.ts` (what the Coach consumes; it never computes its own), `trends.ts`,
`wrapped.ts`, `warmup.ts`, `practice.ts`, `coverageNudge.ts`, `milestones.ts` and the
rest. Rule: imports only `@/types` and sibling engine files; the worked examples in
`CLAUDE.md` are required fixtures. Formulas: `CLAUDE.md` "Calibration Engine
(authoritative)", expanded in `docs/CALIBRATION.md`.

**Layer 4 — State (Zustand).** `src/store/*Store.ts`, one slice per file. Stores
orchestrate L2 and L3 and hold no calibration math and no billing logic; every
mutation and its stats recompute run in one `withTransaction`. Plus is read only
through `useEntitlementStore`; with `isPlus` false the Coach makes no request.
`src/dev/` (playtest profiles) is a development-only peer reached from `app/dev/`
alone.

**Layer 5 — Services.** `src/supabase/` (client, auth, sync, account deletion),
`src/notifications/` (due-day reminders, the weekly digest, the practice and
trial-ending reminders, the permission ask), `src/ai/` (the Coach client, its context,
validator; the dormant `refine.ts`), `src/billing/` (RevenueCat
behind a deps seam), `src/analytics/`, `src/share/`, `src/export/`, `src/review/`,
`src/age/`, `src/media/`, `src/lock/`; on the server, `supabase/migrations/` and the
Edge Functions in `supabase/functions/`. Rules: every service fails silently; every
Edge Function verifies the caller's JWT (the webhook a shared secret), rate-limits per
user and caps input and `max_tokens` (`CLAUDE.md` "Backend Proxy Architecture"); the
Coach checks Plus server-side and sends the model numbers only, never words the person
typed (`COACH_AGENT.md` §4, §5; the on-device distress check was removed by D73).

**Layer 6 — Presentation.** `app/` (expo-router: the tabs Today, Insights, History and
You; Log, Resolve, Prediction, Practice, Share, Categories and How scoring works as
sheets; the Warmup, the full-screen paywall, account and `dev/`) and `src/components/` (`ui/`
primitives, then one folder per feature). Design: `docs/design/DESIGN_SYSTEM.md` and
`docs/design/UI_ROADMAP.md`. Rule: reads stores and calls service actions, never the
engine or the SQLite client; component tests cover the Warmup, Log, Resolve and the
paywall.

**Layer 7 — Native integration & App Store.** `app.json` (bundle id `app.fairlysure`,
iPhone only, portrait, the plugins, the declared-age-range entitlement), `eas.json`
(the `development` and `production` profiles, the App Store Connect app id), the
listing (`docs/APP_STORE_LISTING.md`), App Privacy (`docs/APP_PRIVACY.md`) and the
privacy and support pages on GitHub Pages. Rule: a native change (a package, a plugin,
an entitlement) needs a new build; `eas build` runs only with the owner's go-ahead and
`eas submit` is the owner's. Still to confirm on hardware: a notification deep-linking
into Resolve, and a sandbox purchase and restore.

---

## Validation Checkpoints

Now the go-to-market gates in `GROWTH_AND_MONETIZATION.md` §7 (Day-0 aha, the share
loop, trial-to-paid, Plus churn by Coach use), read at §0 step 5.
