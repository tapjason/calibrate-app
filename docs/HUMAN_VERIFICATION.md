# Calibrate — Human Verification Checklist

**As of:** 2026-09-24 · **Branch:** `master`

*(No commit hash here on purpose — it went stale within a day last time. The
content below tracks what is unverified, not what was last written.)*

Everything the build needs that an agent cannot do from the repo: things that
need a funded account, a dashboard login, a simulator, a physical device, or a
judgment call about money. Each item says **what to do**, **what "pass" looks
like**, and **what to report back** so the result can be recorded in
`BUILD_PLAN.md`.

Batches are ordered by what they unblock, not by difficulty. A, B and C can all
be done at a desk; D needs a device; E is the ship.

Nothing here blocks further coding — the offline core loop, the Warmup, the
share loop, the Coach's deterministic half, billing, the Plus tier (Coach,
Trends, card themes) and the range-coverage nudge are all done and tested.
What is blocked is *verification*.

**Changed 2026-09-24:** the OpenAI account is funded and verified working, and
the Supabase project (which had auto-paused) is restored. `refine` is **cut**
rather than pending — the first live run showed its prompt makes predictions
worse, so it is switched off behind a flag until the prompt is fixed; see
`CLAUDE.md` § AI Integration A. What remains unverified: the Coach has still
never produced a real model response, and no purchase has ever been made.

With the paywall's three promises built, **nearly every remaining item in this
file is the whole remaining critical path.** The one exception, found on
2026-09-24 while deriving the App Privacy answers: **there is no account-deletion
path**, and Apple requires one. That is code, and it is listed at the bottom.

---

## What you need in hand

| Thing | Needed for | Notes |
|---|---|---|
| OpenAI account with credit | A1 | **Funded and verified 2026-09-24.** `gpt-4o-mini` at our token caps is fractions of a cent per call. |
| Supabase dashboard access | A1, A3, A4, B3 | Project `calibrate`, ref `otopheizhjstoeyndcvc`, us-east-1. CLI is already linked. **Free-tier projects pause after ~7 days idle** — it had to be restored on 2026-09-24, and there is no CLI command for it. If DNS stops resolving, that's why. |
| RevenueCat account | B1 | Free tier is enough (it bills on revenue). |
| Apple Developer account ($99/yr) | B2, D, E | Also gates APNs, sandbox purchases, and TestFlight. |
| A Mac with Xcode + iOS simulator | C | Simulator alone is fine for C. |
| A physical iPhone | D | Push, deep links, and sandbox purchases can't be fully trusted on a simulator. |

---

## Batch A — Backend (desk, ~30 min, no device)

### A1. Verify live Coach generation

The Coach is deployed and every guard is verified *except* the one thing that
needs a real model response: that generation is grounded and the validator
drops what isn't.

**Step 1 is done (2026-09-24).** The account is funded, `gpt-4o-mini` returns
200, and the SHA-256 of the local key matches the digest Supabase reports for
its stored `OPENAI_API_KEY` — so the deployed functions are on that same
funded key. The auth gate was re-verified live at the same time: 401 with no
header, 401 on a malformed JWT.

**Step 3 is the one that needs you** — `public.entitlements` is
service-role-write-only by design, so an agent with the anon key cannot grant
Plus to a test user. Do that in the dashboard and the rest can be run for you.

1. ~~Add credit to the OpenAI account whose key is in Supabase secrets.~~ Done
   2026-09-24.
2. Get a real user access token (sign in on the app, or via the Supabase
   dashboard's user impersonation) — the anon key returns 401 by design.
3. **Grant yourself Plus server-side.** The endpoint's Plus gate reads
   `public.entitlements`, nothing writes to it yet, and absence means free — so
   the call returns 403 until a row exists. In the dashboard SQL editor:

   ```sql
   insert into public.entitlements (user_id, is_plus, source, expires_at)
   values ('<your auth.users id>', true, 'annual', now() + interval '1 year')
   on conflict (user_id) do update
     set is_plus = true, source = 'annual',
         expires_at = now() + interval '1 year', updated_at = now();
   ```

   Do this rather than setting `COACH_ALLOW_UNENTITLED` (see A4) — it exercises
   the real gate instead of switching it off, and it leaves nothing open
   afterwards. Delete the row when you're done if you want the free-user path
   back.
4. Run the `coach` verify curl in `supabase/README.md` (§Edge Functions →
   coach → Verify).

**Pass:** `{"insights":[...],"safe":true}` with 0–3 items, and every `evidence`
number in the response appearing in the request you sent. An empty
`insights: []` is also a pass — it means the validator dropped everything,
which is the safe direction.

**Report:** the raw response body, plus whether any insight was dropped
(function logs show validator rejections).

**Then run the two adversarial live checks** — the fixtures pass against the
validator in Jest, but not against real model output:

- Send a context whose `by_category` has `resolved: 3`. Expect no verdict about
  that category (min-N gating, `COACH_AGENT.md` §5).
- Send a category with an obviously wrong stat and confirm no insight cites a
  number you didn't send.

### A2. ~~Deploy and verify `refine`~~ — CUT (2026-09-24)

**Nothing to do here.** Refine is deferred out of v1, not pending. Testing the
prompt against the now-funded account is what cut it: it turns predictions into
*questions* — "I'll finish the report" → "Will I finish the report?", four
inputs out of four — which is no more resolvable than what the user typed.

Two rewrites showed it isn't a wording problem. Ask for specificity and the
model invents it ("at least $100,000 in sales"; a deadline in 2023, in a field
where the app already stores the due date). Forbid invention and it hands back
the input with the hedging stripped. **A vague prediction can't be made
checkable without information only the user has.**

`REFINE_ENABLED` in `src/constants/app.ts` is `false`, so the ✨ button and its
Settings row are hidden and the function stays undeployed (`/functions/v1/refine`
answers 404 — verified). The client, the function and all their tests are kept
intact behind the flag. Reviving it: fix the prompt against fixtures, flip the
flag, deploy. Full reasoning on the constant and in `CLAUDE.md` § AI A.

### A3. ~~Apply the new migrations and confirm state~~ — DONE 2026-09-24

**Passed.** `db push` applied 004 and 005; `migration list` now shows all five
local migrations matching remote. Verified live afterwards: `analytics_events`
and `entitlements` both exist, an anon read of each returns `[]` (RLS scoping
to the owning user), and an anon *write* to `entitlements` is refused with
`42501 new row violates row-level security policy`.

That last one is the design property from `003_entitlements.sql` holding in
production — a client cannot grant itself Plus — and it is also precisely why
the A1 Plus grant below needs a human with dashboard access.

```sh
npx supabase db push          # 004_entitlement_event_cursor, 005_analytics_events
npx supabase migration list
```

**Pass:** `001_predictions`, `002_coach_usage`, `003_entitlements`,
`004_entitlement_event_cursor` and `005_analytics_events` all show as applied
remotely.

With 005 applied, `analytics_events` is live, so the validation checkpoint's
two queries at the bottom of this file now have a table to read. They will
return nothing until real users arrive — that is the point of the checkpoint.

### A4. Keep `COACH_ALLOW_UNENTITLED` unset

That secret bypasses the server-side Plus check entirely — with it set, any
signed-in user can spend your OpenAI budget up to the daily ceiling.

**Currently unset on the deployed project (checked 2026-09-07), which is
correct.** No action needed; this entry exists so it doesn't get switched on for
a test and left on. If you ever set it, unset it and redeploy in the same
sitting:

```sh
npx supabase secrets list                      # it should not appear
npx supabase secrets unset COACH_ALLOW_UNENTITLED
npx supabase functions deploy coach            # secrets take effect on deploy
```

**Pass:** a signed-in user with no `entitlements` row gets `403` from
`/functions/v1/coach`.

**Note:** the server-side Plus check reads `public.entitlements`. The webhook
that populates it is now written — deploying and wiring it is B3.

---

## Batch B — Store and billing setup (desk, ~1 hr)

The billing code is done and fails safe: with no products configured, the
paywall renders its "not available on this build yet" state, which is correct
behavior rather than a bug.

### B1. RevenueCat dashboard

1. Create the project; add the iOS app with bundle id `com.calibrate.app`.
2. Create entitlement **`plus`** — the identifier is hardcoded in
   `src/billing/revenuecat.ts` and must match exactly.
3. Create products and attach all three to `plus`:

   | Product identifier | Type | Price |
   |---|---|---|
   | `calibrate_plus_monthly` | auto-renewing, 1 month | $4.99 |
   | `calibrate_plus_annual` | auto-renewing, 1 year | $29.99 |
   | `calibrate_plus_lifetime` | non-consumable | $59.99 |

   These identifiers are also hardcoded (`PRODUCT_IDS`). A mismatch means the
   plan is silently dropped from the paywall rather than shown wrong — check
   the paywall lists all three before assuming it worked.
4. Put all three in the **current** offering. The app reads
   `offerings.current` and nothing else.
5. Copy the **public app key** into `.env.local`:
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...`

### B2. App Store Connect

1. Create the same three IAP products with the same identifiers and prices.
2. **Free trial on annual: 17–21 days, not 14.** The measured conversion cliff
   sits between "under 4 days" (25.5%) and "17–32 days" (42.5%), and 14 falls
   in the unmeasured gap — plus Calibrate's own value is only legible once
   predictions *resolve*, and 14 days is roughly one resolution cycle
   (`GROWTH_AND_MONETIZATION.md` §4). **21 is the recommendation.** The app
   renders whatever trial the store reports, so this is a dashboard decision
   with no code change.
3. Create a sandbox tester account (Users and Access → Sandbox Testers) for
   Batch D.

**Report:** the trial length you chose, and confirmation that all three
products are "Ready to Submit".

### B3. Deploy and wire the RevenueCat webhook

This is what makes a purchase visible to the *server*. Without it billing works
on the device and the Coach endpoint still answers 403 to a paying subscriber.

```sh
npx supabase db push        # applies 004_entitlement_event_cursor.sql
npx supabase secrets set REVENUECAT_WEBHOOK_SECRET="$(openssl rand -hex 32)"
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
```

`--no-verify-jwt` is required: RevenueCat has no Supabase session. The shared
secret is the gate, and the function refuses every request when it isn't set.

Then RevenueCat → Project settings → Integrations → Webhooks:
- URL: `https://otopheizhjstoeyndcvc.functions.supabase.co/revenuecat-webhook`
- Authorization header: the same secret.

**Pass:** RevenueCat's "Send test event" returns 200 with
`{"ok":true,"action":"ignored"}` (a TEST event writes nothing, by design), and
after the sandbox purchase in D2 a row appears in `public.entitlements` with
`is_plus = true`.

**Report:** the test-event response, and the row after D2.

---

## Batch C — Simulator run-through (Mac, ~30 min)

This is the Layer 6 gate. Run `npx expo start --ios` on a build with
`.env.local` filled in, on a **fresh install** (delete the app first so the
first-run path is real).

Tick each:

- [ ] First launch lands in the **Warmup**, not the tabs.
- [ ] The quiz completes and renders a verdict with a mini chart.
- [ ] The verdict's share card exports and the OS share sheet opens.
- [ ] Warmup results do **not** appear in Stats (they are structurally
      separate — this is worth confirming visually once).
- [ ] Log a prediction: under 15 seconds, all four fields work.
- [ ] **The range-coverage nudge.** Log 8 predictions, all above 40%
      confidence, then open the Log tab again: a panel offers to start one at
      25%. Tapping it pre-sets the slider; "Not now" dismisses it. Log one
      below 40% and it stops appearing entirely (a low log is the thing it was
      asking for), as does dismissing it — for a week. This is the
      free-tier answer to `CLAUDE.md`'s range-coverage caveat: without it a
      user who only logs at 80%+ gets a calibration score computed from a
      single bucket.
- [ ] The ✨ Refine button appears once the title has text (needs A2 deployed).
- [ ] Resolve it: yes/no + reflection saves.
- [ ] Stats updates immediately after resolving.
- [ ] With fewer than 20 resolutions, Stats shows **progress toward the
      threshold**, not a headline score. This one matters —
      "never present a number built on noise" is a core principle.
- [ ] The calibration curve renders, with the dashed perfect-calibration
      diagonal.
- [ ] History filters by category.
- [ ] Share → identity card, This week, This year all render and export.
- [ ] The theme picker shows locks on the Plus themes for a free user, tapping
      one opens the paywall, and the free theme still exports a full-quality
      card.
- [ ] Settings toggles work; Coach is **off** by default, usage stats **on**.
- [ ] Stats shows the Trends section locked for a free user, and tapping
      "See Plus" opens the paywall.
- [ ] As Plus (after D2): Trends renders months and categories, and "Export CSV"
      produces a file the share sheet accepts. Open it in a spreadsheet and
      confirm a title starting with `=` shows as text, not a formula.
- [ ] Stats shows the Coach upsell (free user), and tapping "See Plus" opens
      the paywall.
- [ ] Settings → "See Plus" opens the paywall.
- [ ] The paywall lists annual first with its trial, then monthly, then
      lifetime (after Batch B; before it, it shows the unavailable state).
- [ ] Nothing in Log → Resolve → Stats → Share ever hits a paywall.

**Report:** which boxes failed, with a screenshot for anything visual.

---

## Batch D — Physical device (~45 min)

Requires a dev build (`eas build --profile development --platform ios`), not
Expo Go — notifications and RevenueCat are both native modules.

### D1. Notifications
- [ ] Permission prompt appears on first launch.
- [ ] A resolution reminder fires on a prediction's due date (set one a few
      minutes out).
- [ ] Tapping the notification deep-links into the Resolve screen for the
      right prediction — including from a **cold start** (force-quit first).
- [ ] The Sunday digest is scheduled (check
      `getAllScheduledNotificationsAsync` in the dev console, or wait).
- [ ] Turning notifications off in Settings cancels everything; turning it
      back on reschedules.

### D2. Sandbox purchase — the Layer 5 billing gate
- [ ] Sign in with the sandbox tester account (Settings → App Store on device).
- [ ] Buy the annual plan. The trial terms shown match what you configured.
- [ ] `isPlus` flips: the Coach upsell on Stats is replaced by the Coach panel,
      and Settings shows "Active".
- [ ] Force-quit and relaunch **in airplane mode**: still Plus. (This is the
      local mirror doing its job.)
- [ ] Delete and reinstall the app → reads as **free**.
- [ ] "Restore purchases" on the paywall restores Plus.
- [ ] Buy monthly with a second sandbox account; confirm `source` reads
      `monthly` and not `annual` (Settings copy or the dev console).
- [ ] Cancel the sandbox subscription and let it lapse (sandbox subscriptions
      renew every few minutes); confirm the app drops back to free within one
      foreground.

### D3. Coach end-to-end as a real subscriber
Only possible after D2 and B3 (the webhook is what tells the server you paid).
- [ ] Turn Coach on in Settings; tap "Get feedback"; insights render with the
      AI label.
- [ ] Every number in an insight matches a number on the Stats screen.

---

## Batch E — Ship (needs everything above)

Four items in this batch turned out not to be yours. Re-derived from the
code on 2026-09-24:

- [x] ~~Splash screen configured in `app.json`.~~ It already is —
      `expo-splash-screen` with light and dark variants, verified resolving
      through `npx expo config --type public`. The old note ("asset exists,
      config doesn't") was stale.
- [x] ~~Real app icon.~~ Not a placeholder: `assets/icons/icon.png` is the
      calibration diagonal with four points on it, 1024×1024, in the brand
      indigo. Worth a look if you want a different mark, but nothing is
      blocked on it. (It carries an alpha channel; Expo flattens iOS icons at
      build time, so confirm it looks right in the TestFlight build rather
      than editing the PNG now.)
- [x] ~~APNs key / push credentials.~~ **Not needed.** Every notification this
      app sends is a *local* scheduled one. There is no `getExpoPushTokenAsync`
      call, no device token, and nothing server-side that sends a push
      (verified across `src/`, `app/`, `supabase/`). This becomes a real item
      only if remote push is ever added.
- [x] ~~App Privacy declarations.~~ Drafted from the code in
      [`docs/APP_PRIVACY.md`](./APP_PRIVACY.md) — the App Store Connect answer
      sheet row by row, each citing the file that proves it. Read it once and
      transcribe; the one thing it asks you to decide is the privacy-policy URL.

What is still yours:

- [ ] **Account deletion.** There is none today, and Review Guideline 5.1.1(v)
      requires an in-app path for any app with account creation. This is
      **code, not you** — flagged here because it blocks submission and nothing
      else in the repo tracks it. See `docs/APP_PRIVACY.md` §5.
- [ ] `submit.production` block filled in `eas.json` (currently `{}`). No
      placeholder was committed on purpose — an empty string fails more
      confusingly than a missing key, and `eas submit` prompts interactively
      when the block is absent. When you have the values, paste:

      ```json
      "submit": {
        "production": {
          "ios": {
            "appleId": "you@example.com",
            "ascAppId": "1234567890",
            "appleTeamId": "ABCDE12345"
          }
        }
      }
      ```

      - `appleId` — the Apple ID email of your developer account.
      - `ascAppId` — App Store Connect → your app → App Information → Apple ID
        (a 10-digit number, not the bundle id).
      - `appleTeamId` — developer.apple.com → Membership details → Team ID.

- [ ] Privacy policy URL — App Store Connect requires one, and
      `docs/APP_PRIVACY.md` §5 lists the five things it has to say.
- [ ] `npx expo install --check` before the build. `expo-doctor` is 19/20
      green; the one failure is patch drift inside SDK 55 (14 packages, e.g.
      `expo` 55.0.26 → 55.0.31). Not urgent, but a build is the moment to take
      it — and re-run `npm test` after, since it moves `react-native` and
      `jest-expo`.
- [ ] Screenshots (the identity card and the calibration curve are the two
      that sell it).
- [ ] `eas build --platform ios` → TestFlight → accepted.
- [ ] Install from TestFlight and re-run Batch C on the real build.

---

## Decisions only you can make

1. **Trial length** — 17, 21, or something else. See B2. Recommendation: 21.
2. **Apple link-out commission.** Since the April 2025 Epic injunction Apple
   cannot charge commission on US link-out purchases; in August 2026 it
   proposed 15%/5% and Epic is contesting it. Unsettled, and worth 12–18% of
   every renewal. It doesn't block shipping in-app IAP — it decides whether a
   link-out flow is worth building later.
3. **Whether to ship billing at all yet.** `BUILD_PLAN.md`'s validation
   checkpoint says measure D0 aha completion and share rate *before* the
   checkout goes live. If nobody shares, the freemium premise is wrong and the
   paywall is the wrong thing to be tuning.

---

## Open work that is code, not you

Listed here only so the human checklist isn't mistaken for the whole list.

- **Account deletion (Guideline 5.1.1(v)).** Sign-in exists; a way to delete
  the account and its data does not. Apple rejects for this. The smallest
  honest version is a Settings row that calls an authenticated Edge Function
  which deletes the user's rows and the auth user, then clears local SQLite.
  Surfaced while deriving `docs/APP_PRIVACY.md`; it is the one genuine piece
  of code work left before submission.

- ~~The unbuilt Plus features.~~ All three the paywall names now exist: Coach,
  Trends, and the card themes. Keep it that way — a bullet on that screen the
  app doesn't do is a refund request with extra steps.
- ~~Product instrumentation.~~ Built. Once A3 is applied and people are using
  the app, the two questions that decide the business model are:

  ```sql
  -- D0 aha completion
  select count(*) filter (where name = 'warmup_completed')::float
       / nullif(count(*) filter (where name = 'warmup_started'), 0) as aha_rate
    from public.analytics_events;

  -- Share rate: shares per user who did anything at all
  select count(*) filter (where name = 'share_completed')::float
       / nullif(count(distinct user_id), 0) as shares_per_active_user
    from public.analytics_events;
  ```
