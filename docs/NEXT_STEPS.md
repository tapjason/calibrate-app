# Calibrate — Next Steps an Agent Can Do Alone

**As of:** 2026-09-25 · **Branch:** `master` · **Baseline:** `tsc --noEmit` clean,
60 suites / 662 tests green.

`docs/HUMAN_VERIFICATION.md` lists what needs a person. This is the other half:
work an agent can finish from the repo with no device, no dashboard and no
purchase. It came from re-reading the code against that checklist, and the
re-read found that **the checklist assumes things the code does not do yet.**

Ordered by what each item unblocks, not by how big it is.

---

## P0 — Blocks the free human tests, or launch

### 1. There is no sign-in screen — **built 2026-09-25**

> Settings → Account (sign in / signed in as … / sign out), `app/account`
> (email sign-in and sign-up, Sign in with Apple on iOS), the confirmation-
> pending state for sign-up, and a "Sign in to use Coach" state for a Plus
> guest. Verified on the web build against the live project as far as a
> wrong-password error. The email-confirmation setting below is still your
> call.

`src/supabase/auth.ts` exports `signInWithEmail`, `signUpWithEmail`,
`signInWithApple`, `signInWithGoogle` and `signOut`. **No screen or component
calls any of them.** (`grep` across `app/` and `src/components/` finds only
`app/_layout.tsx` reading `authStore` at startup.) Every install is therefore a
guest forever. That has consequences everywhere:

| What depends on a session | What happens today |
|---|---|
| Sync (`src/supabase/sync.ts`) | Never runs. Data doesn't survive a reinstall. |
| Coach (`/functions/v1/coach` checks the JWT) | A **paying** guest sees the Coach panel, and every request gets a 401 and comes back empty. It's a paid feature that silently does nothing, and that gets refund requests. |
| Webhook to `public.entitlements` | A guest purchase is on an anonymous RevenueCat id, which the webhook ignores (by design). |
| Analytics flush | Never flushes for a guest (by design), so **nothing is ever measured** (see item 2). |
| Batch C in the human checklist | "Sign in with **email**" can't be done. There's nothing to tap. |

**Build:** an Account section in Settings plus a sign-in screen: email sign-in
and create-account, Sign in with Apple on iOS, sign-out. Also a "Sign in to use
Coach" state in `CoachPanel` for a Plus guest. Full spec:
[`docs/ACCOUNT_SPEC.md`](./ACCOUNT_SPEC.md) §1–2.

**Research finding that changes the design:** Supabase's built-in email sender
delivers only to **members of your own Supabase organization**, at **2 messages
an hour**, and is "not meant for production use". With the project's default
"Confirm email" setting on, a stranger who signs up by email never receives the
confirmation, so they can never sign in. Password reset has the same problem.
Either confirmation is turned off in the dashboard, or a custom SMTP provider is
configured. That choice is yours; the spec covers both. Sign in with Apple
avoids email entirely, which is one more reason to make it the primary path on
iOS.

### 2. Analytics can't answer the question it was built for, and it has a queue-poisoning bug — **1 and 2 fixed 2026-09-25**

The validation checkpoint (`BUILD_PLAN.md`) decides whether freemium is the right
model at all: `warmup_completed / warmup_started` and shares per active user.
Three problems stack up:

1. **Warmup always runs as a guest.** It's the first-run screen, before any
   sign-in is possible. Guest events are queued under `local-user-v1` and
   never flushed (`src/analytics/flush.ts`), and
   `migrateGuestDataToUser` (`src/db/migrateGuestData.ts`) moves predictions
   to the new user but **not analytics events**. So `warmup_started` never
   reaches the server, and the aha-rate query returns `NULL` forever.
2. **Queue-head poisoning (a real bug).** `listUnsyncedEvents`
   (`src/db/analytics.ts:126`) selects the oldest 100 unsynced rows **for any
   user**. After sign-in, those are the guest's rows. Their `user_id` is
   `'local-user-v1'`, which is not a UUID, so the insert fails (not with
   `23505`), the rows stay queued, and the next sweep picks the same 100 again.
   Once a guest has made ≥100 events, the signed-in user's events **never
   flush**, until the 2,000-row cap trims the guest rows away. Switching
   accounts on one device causes the same failure through RLS.
3. **Even when fixed, it measures only people who signed in.** Sign-in is
   optional, and the people who sign in are mostly the ones who got value. An
   aha rate computed over them will read close to 100%.

**Build (no decision needed):** filter `listUnsyncedEvents` by `user_id`,
reassign guest events to the new user inside `migrateGuestDataToUser` (same
transaction as the predictions), and add tests for both. That fixes 1 and 2.

**Decide (yours):** whether to fix 3 with an anonymous per-install id for a
small allowlist of events (`warmup_*`, `share_*`) sent without an account. That
gives true funnel numbers, but it contradicts `APP_PRIVACY.md`'s current
promise, "no data is collected from users who never sign in", so the privacy
answers and the policy would change with it. **Recommendation:** ship the fix
now, and read the checkpoint numbers as *signed-in cohort* until you decide.

### 3. Account deletion (App Store Guideline 5.1.1(v)) — **built 2026-09-25, not deployed**

> Settings → Delete account (or Erase all data on this device, for a guest).
> `supabase/functions/delete-account` handles the server side; the app wipes
> the device only after the server confirms. The guest erase was checked end to
> end on the web build. **Deploying the function is yours**
> (`supabase/README.md` § delete-account). The Apple and RevenueCat legs switch
> on when their keys exist.

Already known. The research adds four requirements the current one-line
description misses:

- **Sign in with Apple tokens must be revoked** through Apple's REST API. That
  needs a client secret signed with a Sign in with Apple `.p8` key, so it
  can't run on the phone. The usual pattern is to re-prompt Apple sign-in at
  deletion time, send the fresh authorization code to the Edge Function, and
  exchange and revoke it there.
- **Subscribers must be told billing continues through Apple**, and pointed at
  subscription management before deleting.
- **The RevenueCat customer should be deleted too.** The current `sk_` key is
  *customers read*; deleting needs a write-scoped server key (a dashboard step).
- ~~**The webhook must survive deleted users.**~~ Already handled:
  `apply_entitlement_event` (migration 004) catches `foreign_key_violation`
  and returns normally, so an event for a deleted account gets a 200. (The
  first draft of this list missed that.)

The good news: all four server tables already declare `on delete cascade`, so
`auth.admin.deleteUser` removes the server data in one call. Full spec:
[`docs/ACCOUNT_SPEC.md`](./ACCOUNT_SPEC.md) §3.

### 4. Install `expo-dev-client` — **done 2026-09-25**

Tier 1's free Android billing test needs it. `eas.json`'s `development` profile
sets `developmentClient: true`, but the package isn't installed. One
`npx expo install expo-dev-client` plus a green test run.

### 5. The paywall has no Terms or Privacy links — **built 2026-09-25**

> A Terms of Use link (Apple's standard EULA) is live. The Privacy Policy
> link appears once `PRIVACY_POLICY_URL` in `src/constants/app.ts` is set,
> which waits on hosting the policy.

`PaywallView` shows the renewal terms and the 24-hour trial line, but it has no
link to a privacy policy or terms of use. Guideline 3.1.2 requires both **in the
app** for auto-renewing subscriptions, as well as in the store metadata. Missing
links are among the most common subscription rejections. **Build:** two text
links under the terms line: the privacy policy URL (from a constant, filled once
it's hosted) and Apple's standard EULA
(`https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`), opened
with `expo-web-browser`, which is already installed. Add a test that both
render.

---

## P1 — Correctness and quality

### 6. Day boundaries are UTC; users live in local time

`streak.ts`, `patterns.ts` (`getUTCDay`), `wrapped.ts` and `trends.ts` all key
days and months by UTC, by deliberate choice ("untrusted clock"). But the time
zone isn't a clock-trust question. The device's UTC offset is available
offline and is deterministic if passed in. The effects on a US user:

- **Streaks break when they shouldn't.** In Pacific time, a resolution on Monday
  at 10:00 is Monday 17:00 UTC, and one on Tuesday at 18:00 is Wednesday
  01:00 UTC. Consecutive local days register as a gap.
- **Streaks never expire.** The streak is anchored at the latest resolution,
  not today, so a 12-day streak still reads 12 a month later.
- **The Coach can name the wrong weekday.** `weakest_day_of_week` is sent to
  the model, and an evening resolution lands on the next day.

**Build:** give the pure functions a `dayKey(iso)` / `tzOffsetMinutes`
parameter (keeping them pure and testable), anchor streak expiry to "today"
with a one-day grace, and add fixtures for the Pacific-evening case. This
reverses a documented decision, so it's flagged rather than done silently.

### 7. Dark mode is declared but not designed — **set to light 2026-09-25**

`app.json` sets `"userInterfaceStyle": "automatic"`, but nothing in `src/` or
`app/` reads `useColorScheme`, and the navigators use the default light theme.
On a phone in dark mode the likely result is a mix of dark system chrome and a
light app. **Build:** set it to `"light"` now (one line), and add a dark palette
later as its own piece of work.

### 8. Tab bar has no icons — **built 2026-09-25** (Ionicons, filled when selected)

`app/(tabs)/_layout.tsx` sets titles only, so every tab gets the default
placeholder glyph. It's the first thing a reviewer and a screenshot show.

### 9. Accessibility pass

Only 4 files under `src/components/` and `app/` set `accessibilityLabel` or
`accessibilityRole`. Priorities:

- **The calibration chart needs a text alternative.** It's SVG, so VoiceOver
  gets nothing. A summary label ("Stated 80%, actual 60%, in 3 of 5 ranges") is
  enough.
- Label the confidence ±5 buttons, the category chips and the yes/no resolve
  buttons.
- Check tap targets are at least 44 pt.

Add RNTL assertions on labels, so this doesn't regress.

### 10. Webhook: decide what production does with SANDBOX purchases

The open question in `HUMAN_VERIFICATION.md` B3: after launch, TestFlight
purchases are sandbox, so testers would get server-side Plus. **Build** (the
decision stays yours): an `ENTITLEMENT_ACCEPT_SANDBOX` secret, defaulting to
today's behavior, checked in `entitlementFromEvent.ts` with tests. Then launch is
one `secrets set` instead of a code change.

### 11. Stale documents

- `APP_PRIVACY.md` still describes ✨ Refine as a shipping feature. It's cut.
  **Fixed in this pass.**
- `CHECKPOINT.md` is dated 2026-06-16 and says refine and a Settings toggle
  ship. **Marked superseded in this pass.**
- `HUMAN_VERIFICATION.md` printed a live test account's password in a
  **public** repository. **Removed from the file in this pass**, but it
  remains in git history. The real fix is deleting that user, which is yours
  (or ask the agent to do it with the service key).

### 12. Dependency drift

`expo-doctor` reported 14 packages behind within SDK 55. Take it the day of the
first EAS build (`npx expo install --check`, then `npm test`). Doing it earlier
just risks retesting twice.

---

## P2 — Launch material (drafted in this pass)

| Item | Status |
|---|---|
| Privacy policy | **Drafted:** [`docs/PRIVACY_POLICY.md`](./PRIVACY_POLICY.md). Derived from `APP_PRIVACY.md` and the code. Has placeholders for your name and contact email. Don't publish it until account deletion ships, because §7 describes that flow. |
| Hosting it | The repo is **public**, so GitHub Pages can serve `docs/` for free. Turning Pages on is a repository setting; the agent can do it with `gh` if you say so. |
| App Store listing | **Drafted:** [`docs/APP_STORE_LISTING.md`](./APP_STORE_LISTING.md). Subtitle, keywords, promotional text, description, IAP display names, review notes and a screenshot plan, all within Apple's character limits. |
| **Name conflict** | **Found in research.** Two US App Store apps already use the name: "Calibrate – Metabolic Health" (Calibrate Inc., a GLP-1 weight-loss company) and "Calibrate: Recovery & Fitness". The first is an established health brand, and this app has a *health* category. The listing doc proposes names; the choice, and any trademark check, is yours. |
| Screenshots | Agent-possible as drafts: the web target plus Playwright at 1320×2868 with seeded data. Final ones should come from a device build, because web rendering differs slightly (fonts, no status bar). |
| Supabase auto-pause | A weekly GitHub Actions cron doing one cheap query keeps the free tier from pausing mid-test. Agent-writable; it needs the anon key stored as a repo secret. |

---

## Suggested order

1. Item 2's bug fix (small, self-contained, and it protects the data you're
   about to collect).
2. Item 1, sign-in UI. It unblocks Batch C, sync, Coach and analytics.
3. Items 4, 5, 7, 8 (each under an hour).
4. Item 3, account deletion. The client and function can be built and tested
   now; the Apple revoke leg waits on the `.p8` key.
5. Items 6, 9, 10.

After 1–4, `HUMAN_VERIFICATION.md` Batch C can be run end to end in Expo Go.

---

## Sources

- Apple, [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- Supabase, [Custom SMTP / default email limits](https://supabase.com/docs/guides/auth/auth-smtp)
- Supabase, [User management](https://supabase.com/docs/guides/auth/managing-user-data)
- supabase/auth issue [#1308, Revoke Sign in with Apple tokens](https://github.com/supabase/auth/issues/1308)
- RevenueCat, [Account deletion rules on the App Store](https://www.revenuecat.com/blog/engineering/app-store-account-deletion) · [API v2](https://www.revenuecat.com/docs/api-v2)
- App Store: [Calibrate – Metabolic Health](https://apps.apple.com/us/app/calibrate-metabolic-health/id1514232557) · [Calibrate: Recovery & Fitness](https://apps.apple.com/us/app/calibrate-health-recovery/id6757204030)
- Screenshot specs: [AppLaunchFlow 2026 guide](https://www.applaunchflow.com/blog/app-store-screenshot-specifications-2026)
