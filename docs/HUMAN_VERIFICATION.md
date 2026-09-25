# Calibrate — Human Verification Checklist

**As of:** 2026-09-25 (re-evaluated) · **Branch:** `master`

Everything the build needs that an agent can't do from the repo. Each item says
**what to do**, **what "pass" looks like**, and **what to report back**.

---

## Where things stand: ordered by what it costs you

Re-evaluated 2026-09-25 under one constraint: **spend nothing until everything
that can be verified for free has been.** The batches below (A–E) are the
detailed procedures; this section is the order to do them in.

### Done, verified live

| Item | Verified |
|---|---|
| OpenAI funded; Coach generates grounded output (A1) | 2026-09-25 |
| All five migrations applied, RLS holds (A3) | 2026-09-24 |
| Coach refuses users without Plus with a 403 (A4) | 2026-09-25 |
| RevenueCat Test Store configured: `plus` entitlement, three `calibrate_plus_*` products, current offering; the app's `test_` key confirmed to belong to it (B1, Test Store half) | 2026-09-25 |
| Webhook deployed, secret set, registered in RevenueCat, test event 200 (B3) | 2026-09-25 |
| App icon, splash, Android adaptive icon: real artwork, 1024², wired in `app.json` | 2026-09-25 |

### Tier 0: free, at a desk, no phone

- [ ] **Test Store trial and prices.** In the RevenueCat dashboard, open the Test
      Store app and set `calibrate_plus_annual` to a 1-month free trial, with prices
      $4.99 / $29.99 / $59.99. The API can't set either one. Ask the agent to
      confirm the trial afterwards, since `trial_duration` is readable.
- [ ] **Say which phone you have.** It decides which Tier 1 path applies.

### Tier 1: free, with a phone you already own

**Test Store purchases cost nothing.** RevenueCat simulates them; no card is
involved and no store account is needed. So the whole billing path, from
paywall to purchase to webhook to `entitlements` row, can be proven without an
Apple account.

What runs where, from a Windows machine:

| Path | Cost | Core loop, Warmup, share, notifications | Real Test Store purchase + webhook |
|---|---|---|---|
| **Expo Go** on iPhone or Android (`npx expo start`, scan the QR) | free | ✅ | ❌ In Expo Go, RevenueCat does not reach the real store, so a paywall result there proves nothing about the configuration. |
| **Android dev build** via EAS (free tier), installed as an APK | free | ✅ | ✅ The `test_` key is not tied to a platform. |
| **iOS dev build** | $99/yr Apple account | ✅ | ✅ |
| iOS simulator | needs a Mac | ✅ | ✅ |

So:

- [ ] **Expo Go run-through: Batch C, minus billing.** Every Batch C box except
      the paywall/plan-listing ones can be ticked in Expo Go, on whatever phone
      you have. Sign in with **email** (Apple sign-in needs the paid account;
      Google isn't configured). Email sign-in, sync and the Coach 403 for a free
      user all work here.
- [ ] **If you have (or can borrow) an Android phone:** an EAS Android dev
      build gives the full billing test for free. It needs these first:
      1. ~~`npx expo install expo-dev-client`.~~ Done 2026-09-25
         (`~55.0.40`), so the `development` profile's
         `developmentClient: true` now has the package it needs.
      2. **EAS environment variables.** EAS uploads the repo minus
         `.gitignore`, and `.env.*` is ignored, so **a cloud build currently
         gets no Supabase URL and no RevenueCat key.** Set the `EXPO_PUBLIC_*`
         values with `eas env:create` (development environment), and set
         `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` to the same `test_` key. Never
         the `sk_`, `OPENAI_` or webhook secrets; those stay server-side.
      3. `npx eas login` (the project is owned by `tapjason`), then
         `eas build --profile development --platform android`.

      Then the purchase check: sign in by email → the paywall shows annual first
      with "1 month free, then $29.99" → buy → Plus turns on in the app → the agent
      confirms a `public.entitlements` row with `is_plus = true, source = 'trial'`.
      That proves D2/D3's logic end to end, on the Test Store.

### Tier 2: costs money, so only after Tiers 0–1 pass

- **Apple Developer Program, $99/yr.** Unlocks B0, B2, the `appl_` key, D
  (StoreKit sandbox) and E (TestFlight, submission). Sandbox purchases are free;
  the $99 is the only spend.
- **Supabase free tier pauses after ~7 days idle.** Not a cost, but it breaks
  testing silently. Restore it from the dashboard if DNS stops resolving.

### Not yet produced (assets and text)

| Thing | Status | Needed for |
|---|---|---|
| App Store screenshots | **Not made.** The identity card and calibration curve are the two that sell it. Needs the app running with real-looking data. | E |
| Privacy policy page + public URL | **Drafted:** [`docs/PRIVACY_POLICY.md`](./PRIVACY_POLICY.md). Fill in the placeholders; hosting needs a URL (GitHub Pages works, since the repo is public). | E |
| App Store listing text (name, subtitle, description, keywords) | **Drafted:** [`docs/APP_STORE_LISTING.md`](./APP_STORE_LISTING.md). **The name "Calibrate" is already taken twice on the App Store.** See §0 there; the choice is yours. | E |
| Account deletion (Guideline 5.1.1(v)) | **Built 2026-09-25.** Deploying `delete-account` is yours (Batch E). | E |

---

## What you need in hand

| Thing | Needed for | Notes |
|---|---|---|
| OpenAI account with credit | A1 | **Funded and verified 2026-09-24.** |
| Supabase dashboard access | A, B3 | Project `calibrate`, ref `otopheizhjstoeyndcvc`, us-east-1. CLI is linked. Pauses after ~7 days idle. |
| RevenueCat account | B1 | Free tier. Project `projb27eccad`. `test_` public key and `sk_` v2 secret key (project config R/W, customers read) are in `.env.local`. |
| Expo account | Tier 1 Android build | Owner `tapjason`; the CLI is not currently logged in. The EAS free tier covers dev builds. |
| A phone | Tier 1 | Any iPhone or Android for Expo Go; an **Android** phone for the free billing test. |
| Apple Developer account ($99/yr) | B0, B2, D, E | **Deferred until Tiers 0–1 pass.** Not needed for APNs; this app only sends local notifications. |
| A Mac with Xcode | only the iOS simulator | Not required: Expo Go and EAS cloud builds cover everything from Windows. |

---

## Batch A — Backend (desk, ~30 min, no device)

### A1. ~~Verify live Coach generation~~ — PASSED 2026-09-25

**All three checks green.** The Coach produced its first real model output,
and every guard held.

Setup used: a throwaway user `test-plus-user-1377@gmail.com`
(`acde4a5f-…`), granted Plus with the SQL in step 3 below, token minted via
`/auth/v1/token?grant_type=password` with the anon key.

**1. Live generation.** `HTTP 200`, `safe: true`, one insight:

```json
{"insights":[{"type":"overconfidence","category":"finance",
 "message":"The calibration score of 61 indicates overconfidence in finance
 predictions, with a mean stated confidence of 80 and an actual rate of 0.55.",
 "evidence":25,"suggestion":"Consider adjusting confidence levels based on past
 outcomes."}],"safe":true}
```

Every number it cites — 61, 80, 0.55, and `evidence: 25` — was in the request.

**2. Min-N gating.** A context whose only category had `resolved: 3` returned
`{"insights":[],"safe":true}`. No verdict on three data points, which is the
rule in `COACH_AGENT.md` §5 holding against real model output rather than
against a fixture.

**3. Grounding.** A three-category context came back with the full cap of
three insights, and an audit of every numeral in every message found **zero**
not present in the request. Each `evidence` value matched too (37, 88, 0.42).

What this does *not* prove: that the validator drops a hallucinated number —
the model never produced one to drop. That path stays covered by the Jest
fixtures in `COACH_AGENT.md` §9.

**Clean-up, when you want the free-user path back** (A4's pass condition, and
Batch C's free-tier checks):

```sql
delete from public.entitlements
 where user_id = 'acde4a5f-cac2-4da5-83e5-34df8d30040e';
```

Done 2026-09-25 — and the 403 that followed is what verified A4.

Note this removes the **Plus grant**, not the account: the grant lives in
`public.entitlements`, the account in `auth.users`. To remove the account
itself, use Authentication → Users → Delete user, or:

```sql
delete from auth.users where email = 'test-plus-user-1377@gmail.com';
```

That cascades — `entitlements`, `analytics_events` and `predictions` all
declare `on delete cascade` — so deleting the account takes its data with it.
Do that before real users exist. Its password was printed here until
2026-09-25, and this repository is public, so treat the account as compromised
and delete it rather than reusing it.

<details>
<summary>The original procedure, kept for re-running it</summary>

**Step 3 is the one that needs a human** — `public.entitlements` is
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

</details>

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

**Currently unset on the deployed project (re-checked 2026-09-24 —
`secrets list` returns only `OPENAI_API_KEY` and the `SUPABASE_*` set), which
is correct.** No action needed; this entry exists so it doesn't get switched on for
a test and left on. If you ever set it, unset it and redeploy in the same
sitting:

```sh
npx supabase secrets list                      # it should not appear
npx supabase secrets unset COACH_ALLOW_UNENTITLED
npx supabase functions deploy coach            # secrets take effect on deploy
```

**Pass:** a signed-in user with no `entitlements` row gets `403` from
`/functions/v1/coach`. **Verified live 2026-09-25**: after deleting the A1
test user's entitlement row, the same token that had just produced insights
got `403`. The gate reads the table on every call — no caching, no grace.

**Note:** the server-side Plus check reads `public.entitlements`. The webhook
that populates it is now written — deploying and wiring it is B3.

---

## Batch B — Store and billing setup (desk, ~1 hr)

The billing code is done and fails safe: with no products configured, the
paywall renders its "not available on this build yet" state, which is correct
behavior rather than a bug.

### B0. Apple prerequisites (do these first, since everything else waits on them)

Added 2026-09-25. These were missing from this list, and each one blocks
the store setup below:

1. **Paid Applications Agreement.** App Store Connect → Business (formerly
   Agreements, Tax, and Banking): accept it and fill in bank + tax info.
   Until it is *Active*, StoreKit returns no products, **even in sandbox**.
   The paywall then shows its unavailable state and nothing explains why.
   Approval can take a day or more, so start it first.
2. **Register the bundle id** `com.calibrate.app` (developer.apple.com →
   Identifiers) and create the App Store Connect app record for it. Bundle ids
   are unique across all of Apple, so if it is already taken, pick another
   one (e.g. `com.<you>.calibrate`) and say so. It is set in `app.json`
   and must be changed there too.
3. **In-App Purchase Key** (App Store Connect → Users and Access →
   Integrations → In-App Purchase → generate). Download the `.p8` once and note
   its Key ID and your Issuer ID. RevenueCat needs it to validate StoreKit 2
   purchases.

### B1. RevenueCat dashboard

**Test Store half DONE 2026-09-25, via the v2 API** (`REVENUECAT_SECRET_KEY`
in `.env.local`, project `projb27eccad`, Test Store app `app61065d48e2`).
Onboarding had created an entitlement `calibrate_pro` and products `monthly` /
`yearly` / `lifetime`, and none of those ids match the code. The paywall
would have dropped every plan, and the webhook would have ignored every
purchase. Now:

- entitlement **`plus`** exists, with `calibrate_plus_monthly` / `_annual` /
  `_lifetime` attached (Test Store products, P1M / P1Y / non-consumable);
- the **current** offering (`default`) has `$rc_monthly` / `$rc_annual` /
  `$rc_lifetime` pointing at those three;
- the onboarding defaults are **archived**, not deleted, so they can be restored.

**Still dashboard-only** (the API's create-product call takes neither a price
nor a trial): set Test Store prices of $4.99 / $29.99 / $59.99, and a **1-month
free trial** on `calibrate_plus_annual`. Without the trial the paywall
correctly shows none. The App Store app half (steps below) waits on B0.

1. Create the project (one already exists, since the `test_` key came from
   it); add the iOS App Store app with bundle id `com.calibrate.app` and upload
   the In-App Purchase Key from B0.3. Optionally copy RevenueCat's App Store
   Server Notifications URL into App Store Connect → App Information, which
   gives faster renewal/cancel events.
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
5. Copy the **public app key** into `.env.local` as
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. A `test_…` Test Store key is already set
   there; replace it with the `appl_…` key once the App Store app entry
   exists, or D2 cannot test a real purchase.
6. **The one-month free trial is read from the store, not set here.** Configure
   it as an introductory offer on `calibrate_plus_annual` in App Store Connect
   (B2); RevenueCat surfaces it and the app renders it. If you are testing
   against the Test Store first, set the trial on the Test Store product too,
   or the paywall will correctly show no trial.

### B2. App Store Connect

1. Create the same three IAP products with the same identifiers and prices.
2. **Free trial on annual: one month.** Decided 2026-09-25 — no longer a
   judgment call. Set it as an *introductory offer* of type "free trial",
   duration **1 month**, on `calibrate_plus_annual` only.

   Annual only is deliberate: a user is eligible for an introductory offer
   **once per subscription group**, so offering it on monthly as well just
   means some people burn it on the weaker container (the AI retention penalty
   concentrates in monthly plans — `GROWTH_AND_MONETIZATION.md` §4).

   One month sits inside the measured 42.5%-conversion band ("17–32 days")
   rather than the unmeasured gap 14 days falls into, and Plus is only legible
   once predictions *resolve* — a month is more than one resolution cycle.

   The app renders whatever the store reports, in the store's own unit, so it
   will read "1 month free, then $29.99" with no code change.
3. Create a sandbox tester account (Users and Access → Sandbox Testers) for
   Batch D.

**Report:** confirmation that the annual product shows a 1-month free trial
introductory offer, and that all three products are "Ready to Submit".

### B3. Deploy and wire the RevenueCat webhook

This is what makes a purchase visible to the *server*. Without it billing works
on the device and the Coach endpoint still answers 403 to a paying subscriber.

**Server half DONE 2026-09-25.** The secret is set in Supabase and also saved
as `REVENUECAT_WEBHOOK_SECRET` in `.env.local` (gitignored, no `EXPO_PUBLIC_`
prefix, so it is never bundled). The function is deployed and verified live:
no header → 401, wrong secret → 401, a TEST event with the right secret → 200
`{"ok":true,"action":"ignored"}`. **What remains is the dashboard half**: paste
the URL and `Bearer <secret>` into RevenueCat (below), send its test event, and
look for the row after D2.

```sh
# db push is already done (A3) — 004 and 005 are applied remotely.
npx supabase secrets set REVENUECAT_WEBHOOK_SECRET="$(openssl rand -hex 32)"
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
```

`--no-verify-jwt` is required: RevenueCat has no Supabase session. The shared
secret is the gate, and the function refuses every request when it isn't set.

Then RevenueCat → Project settings → Integrations → Webhooks:
- URL: `https://otopheizhjstoeyndcvc.functions.supabase.co/revenuecat-webhook`
- Authorization header: the same secret.

**Dashboard half DONE 2026-09-25.** Webhook `Supabase entitlements`
(`whintgr5c5e59b2a4`) is registered on project `projb27eccad`, covering all apps,
all environments and all event types, and RevenueCat's "Send test event" came back 200.
What remains of the Pass line below is the `entitlements` row after the first
purchase.

**Open question for launch:** the webhook does not look at `environment`, so a
SANDBOX or Test Store purchase grants server-side Plus exactly like a real one.
That is what testing needs right now. After launch, though, TestFlight
purchases are sandbox, so any tester would get the Coach for free. Decide
before the public build whether production should ignore `environment:
SANDBOX`.

**Pass:** RevenueCat's "Send test event" returns 200 with
`{"ok":true,"action":"ignored"}` (a TEST event writes nothing, by design), and
after the sandbox purchase in D2 a row appears in `public.entitlements` with
`is_plus = true`.

**Report:** the test-event response, and the row after D2.

---

## Batch C — App run-through (~30 min; Expo Go on a phone, or a simulator)

This is the Layer 6 gate. From Windows: run `npx expo start` and scan the QR
code with **Expo Go** on your phone. `.env.local` is read by the dev server, so
no env setup is needed for this path. Start from a **fresh state** (in Expo Go,
clear the app's data or reinstall Expo Go) so the first-run path is real.

In Expo Go, skip the paywall/plan boxes: RevenueCat doesn't reach the real
store there. Those need an Android dev build (free, see Tier 1) or an iOS
build. Sign in with **email**.

> **Sign-in exists as of 2026-09-25:** Settings → Account → Sign in. It has
> been checked against the live project on the web build: a wrong password
> round-trips "Invalid login credentials". A *successful* sign-in hasn't been
> seen yet, because the A1 test user's password no longer works. **Before
> creating an account by email**, decide on "Confirm email" (Supabase → Auth
> → Providers → Email). With it on, the built-in mailer delivers only to
> members of your Supabase team, so use your own address or turn it off. See
> `docs/ACCOUNT_SPEC.md` §1.

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
- [ ] **The ✨ Refine button does NOT appear**, with any title text. Refine is
      cut from this release (`REFINE_ENABLED = false`), and the AI Refine row
      is gone from Settings too. If either shows up, the flag regressed.
- [ ] **Account.** Settings shows "Not signed in". Sign in → create an
      account by email (see the note above about confirmation). Back in
      Settings it reads "Signed in as …", and the predictions you logged as
      a guest are still there. Sign out: the lists go empty. Sign back in:
      they return.
- [ ] **Erase as a guest.** Signed out: Settings → "Erase all data on this
      device" → Erase everything. Home is empty afterwards, and the next
      cold launch opens the Warmup. (Verified on the web build 2026-09-25.)
- [ ] **Delete as a signed-in user** (after `delete-account` is deployed):
      Settings → Delete account → Delete my account. It reads "Your account
      has been deleted", the app is an empty guest, and signing in with the
      same email fails.
- [ ] **Coach as a Plus guest** (needs Plus on the device, so it waits on a
      dev build): signed out, the Coach panel says "Sign in to use Coach"
      rather than offering a request that would fail.
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
- [ ] **Annual reads "1 month free, then $29.99"** — one *month*, not "30
      days". If it says days, the store reported an unstructured period and
      the fallback fired; check the offer's configured unit.
- [ ] **The trial terms line is present** under the plans: the trial turns
      into a paid subscription, cancel at least **24 hours** before it ends.
      That 24-hour figure is Apple's actual rule, not ours — without it the
      screen promises something the platform doesn't do.
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
- [ ] Buy the annual plan. The screen says **"1 month free, then $29.99"** and
      Apple's own confirmation sheet agrees. If the two disagree, Apple is
      right and the offer is misconfigured.
- [ ] `isPlus` flips: the Coach upsell on Stats is replaced by the Coach panel,
      and Settings shows "Active".
- [ ] **While the trial is running, `source` reads `trial`** — not `annual`.
      The client maps RevenueCat's `periodType` (TRIAL/INTRO) ahead of the
      product, and the webhook does the same with `period_type`, so a mismatch
      means one of the two paths is wrong. Check Settings copy or the dev
      console.
- [ ] **The trial converts.** Sandbox compresses subscription durations — a
      one-month trial runs in minutes, not a month (check Apple's current
      compression table for the exact figure). Let it run out and confirm the
      app is still Plus afterwards, with `source` now reading `annual`.
- [ ] **Cancelling during the trial stops the charge.** Cancel from the device's
      App Store subscription settings before the compressed trial ends, let it
      expire, and confirm the app drops to free rather than converting. This is
      the promise the paywall makes — it should be tested once, not assumed.
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

- [ ] **Account deletion: built, needs deploying.** `npx supabase functions
      deploy delete-account`. That alone is compliant. Then, when you have
      them, set the Sign in with Apple key secrets (needs the $99 account)
      and a customers-*write* RevenueCat key. See `supabase/README.md`
      § delete-account. Test it by deleting a throwaway account from
      Settings, then confirming its `auth.users` row is gone.
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
      `docs/APP_PRIVACY.md` §5 lists the five things it has to say. A draft
      is in `docs/PRIVACY_POLICY.md`. **Once it's hosted, put the URL in
      `PRIVACY_POLICY_URL` (`src/constants/app.ts`)**. The paywall shows
      its Privacy Policy link only when that's set, and 3.1.2 requires the
      link in the app, not only in the listing.
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

1. ~~**Trial length.**~~ **Decided 2026-09-25: one free month on annual**,
   auto-renewing into $29.99/yr, cancellable up to 24 hours before it ends.
   Recorded in `GROWTH_AND_MONETIZATION.md` §4 and `CLAUDE.md`; B2 is now a
   setting to enter, not a call to make. Worth re-testing against real
   conversion data later — that is the trial-length experiment the validation
   checkpoints already list.
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
**The full, current list is [`docs/NEXT_STEPS.md`](./NEXT_STEPS.md)**. As of
2026-09-25 it includes a missing sign-in screen, an analytics bug and missing
paywall links, found after the entries below were written.

- ~~**Account deletion (Guideline 5.1.1(v)).**~~ Built 2026-09-25: Settings →
  Delete account, the `delete-account` Edge Function, and a device wipe that
  runs only after the server confirms. Deploying it is in Batch E.

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
