# Calibrate — Human Verification Checklist

**As of:** 2026-10-04 (device path re-derived; see the second note) · **Branch:** `master`

> **Before any live test: restore the Supabase project.** It read `INACTIVE`
> on 2026-10-03 (`npx supabase projects list`), and its hostname no longer
> resolves. Supabase dashboard → project `calibrate` → Restore. There is no
> CLI verb for it. The keep-alive workflow (2026-10-03) stops it pausing again
> once its two repository secrets are set (`docs/NEXT_STEPS.md`).

> **Expo Go can't open this app on an iPhone (found 2026-10-04).** The App
> Store's Expo Go only runs SDK 54; Apple has not approved Expo Go for SDK 55
> or later, and this project is SDK 55. Expo's other routes need a Mac
> (simulator) or the $99 account (`eas go`, or a development build). So
> **every iPhone check below waits on the $99 Apple account**, and Tier 1 has
> merged into Tier 2. Until then, the web build is the only free way to see the
> app; `NEXT_STEPS.md` item k has the agent tick every box web can show first.

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
| ~~Test Store prices ($4.99 / $29.99 / $59.99) and the 1-month trial on annual only~~ **Reopened 2026-10-04:** the API now reads annual $29.90 and a P1M trial on monthly too. See Tier 0. | 2026-10-01 |
| `delete-account` deployed (JWT on), and the webhook redeployed to match `e597583` | 2026-10-02 |

### Tier 0: free, at a desk, no phone

- [ ] **Test Store trial and prices — reopened 2026-10-04.** `store_state`
      now reads annual **USD 29.90** (should be 29.99) and **monthly with
      `trial.duration: P1M`** (should have no trial). Redo steps 3–4 below,
      removing the trial from monthly, then step 6.
      **Re-read 2026-10-04, 03:41 UTC: unchanged.** Full state through the API:

      | Product | Type / period | Price | Trial | Should be |
      |---|---|---|---|---|
      | `calibrate_plus_annual` | subscription, P1Y | USD 29.90 | P1M | **USD 29.99**; trial right |
      | `calibrate_plus_monthly` | subscription, P1M | USD 4.99 | P1M | price right; **no trial** |
      | `calibrate_plus_lifetime` | non-consumable | USD 59.99 | none | right |

      The rest is right: the `plus` entitlement holds all three products, and
      the current offering `default` has `$rc_monthly`, `$rc_annual` and
      `$rc_lifetime`. There's also a leftover `calibrate_pro` entitlement with
      no products; the app only checks `plus`, so it's harmless, but you can
      delete it while you're in the dashboard.
- [x] ~~**Test Store trial and prices.**~~ (first pass) The three products already exist
      (`calibrate_plus_monthly`, `_annual`, `_lifetime`); only their price and
      the annual trial are missing, and the API can't set either. Step by step:
      1. Go to app.revenuecat.com and open the project (`projb27eccad`).
      2. Left sidebar → **Product catalog** → **Products** tab.
      3. Click `calibrate_plus_annual` (the **Test Store** one, not the
         archived `yearly`). Edit it: price **$29.99**, and add a free trial of
         **1 month** (the field may be called "Trial duration" or
         "Introductory offer"). Save.
      4. Click `calibrate_plus_monthly`: price **$4.99**, no trial. Save.
      5. Click `calibrate_plus_lifetime`: price **$59.99**. Save.
      6. Tell the agent "check the trial". It reads `trial_duration` back
         through the API; it should say `P1M` on annual only.

      If a field isn't where these steps say, RevenueCat has moved it. Look for
      a Test Store pricing section on the product page, or ask the agent to
      search RevenueCat's docs for "Test Store product price".
      **DONE 2026-10-01, verified via the API.** Read it from
      `GET /v2/projects/projb27eccad/products/{id}/store_state`, not from the
      product object: the product's own `trial_duration` stays `null` for Test
      Store products. Annual reads USD 29.99 with `trial.duration: P1M`, and the
      current offering lists all three packages.
- [x] **Decided 2026-10-01: leave "Confirm email" on; sign up with the address you use for Supabase.** It is
      currently **on** (`mailer_autoconfirm: false`, read 2026-09-30), so an
      email sign-up only gets its confirmation if the address belongs to your
      Supabase team. Either sign up with your own address, or turn it off
      (Supabase → Auth → Providers → Email).
- [x] **Phone: iPhone** (2026-10-01). No Android device, so the free Android
      billing path below is out. ~~Expo Go covers everything except billing.~~
      Not on SDK 55: see the note at the top (2026-10-04).

### Tier 1: free, with a phone you already own

**Test Store purchases cost nothing.** RevenueCat simulates them; no card is
involved and no store account is needed. So the whole billing path, from
paywall to purchase to webhook to `entitlements` row, can be proven without an
Apple account.

What runs where, from a Windows machine:

| Path | Cost | Core loop, Warmup, share, notifications | Real Test Store purchase + webhook |
|---|---|---|---|
| **Web build** (`npm run web`, any browser) | free | Core loop, Warmup, share preview ✅; haptics, SF Symbols, sheets, glass, notifications ❌ | ❌ |
| ~~**Expo Go** on iPhone (`npx expo start`, scan the QR)~~ | free | ❌ **App Store Expo Go is SDK 54; this app is SDK 55** (2026-10-04) | ❌ |
| `eas go` (your own Expo Go build on TestFlight) | $99/yr Apple account | ✅ | ❌ RevenueCat runs in preview mode in Expo Go |
| **Android dev build** via EAS (free tier), installed as an APK | free, needs an Android phone | ✅ | ✅ The `test_` key is not tied to a platform. |
| **iOS dev build** | $99/yr Apple account | ✅ | ✅ |
| iOS simulator | needs a Mac | ✅ | ✅ |

So, with an iPhone and Windows, the only free row is the web build, and once
the $99 is spent the **iOS dev build** is the one to make: `eas go` would add a
second build that can't test billing.

- [ ] **Web run-through: Batch C, minus what web can't show.** An agent can
      drive this one (`NEXT_STEPS.md` item k) and mark boxes *web-verified*.
- [ ] ~~**Expo Go run-through: Batch C, minus billing.**~~ **Not possible on
      SDK 55 (2026-10-04).** Do Batch C on the iOS dev build instead (Tier 2),
      signing in with **email** (Apple sign-in needs the paid account too;
      Google isn't configured).
- [ ] ~~**If you have (or can borrow) an Android phone:**~~ **Not applicable: iPhone only.**
      A real Test Store purchase therefore waits on the $99 Apple account
      (Tier 2) and an iOS dev build. Kept for reference: an EAS Android dev
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

### Tier 2: costs money, so only after Tier 0 and the web run-through pass

- **Apple Developer Program, $99/yr.** Unlocks **any run on your iPhone**
  (since 2026-10-04: Expo Go can't open SDK 55), plus B0, B2, the `appl_` key,
  C and D on a development build, and E (TestFlight, submission). Sandbox
  purchases are free; the $99 is the only spend. First build after buying:
  `npx expo install --fix` (NEXT_STEPS g), set the EAS env vars (Tier 1 step 2
  above, iOS keys instead of Android), then
  `eas build --profile development --platform ios`. EAS registers your iPhone
  for the internal-distribution build when it asks.
- **Supabase free tier pauses after ~7 days idle.** Not a cost, but it breaks
  testing silently. Restore it from the dashboard if DNS stops resolving.

### Not yet produced (assets and text)

| Thing | Status | Needed for |
|---|---|---|
| App Store screenshots | **Drafts made 2026-10-03** from the web build with the demo data (git-ignored `screenshots/draft/`). Finals need a device build. | E |
| Privacy policy page + public URL | **Drafted:** [`docs/PRIVACY_POLICY.md`](./PRIVACY_POLICY.md). Name and contact filled in; the effective date is set on publishing. Hosting needs a URL (GitHub Pages works, since the repo is public). | E |
| App Store listing text (name, subtitle, description, keywords) | **Drafted:** [`docs/APP_STORE_LISTING.md`](./APP_STORE_LISTING.md). **The name "Calibrate" is already taken twice on the App Store.** See §0 there; the choice is yours. | E |
| Account deletion (Guideline 5.1.1(v)) | **Built 2026-09-25, deployed 2026-10-02.** The optional Apple-revoke and RevenueCat-delete legs wait on their keys (Batch E). | E |

---

## What you need in hand

| Thing | Needed for | Notes |
|---|---|---|
| OpenAI account with credit | A1 | **Funded and verified 2026-09-24.** |
| Supabase dashboard access | A, B3 | Project `calibrate`, ref `otopheizhjstoeyndcvc`, us-east-1. CLI is linked. Pauses after ~7 days idle. |
| RevenueCat account | B1 | Free tier. Project `projb27eccad`. `test_` public key and `sk_` v2 secret key (project config R/W, customers read) are in `.env.local`. |
| Expo account | EAS builds (iOS dev build, TestFlight) | Owner `tapjason`; the CLI is not logged in (re-checked 2026-09-30). The EAS free tier covers dev builds. |
| A phone | Tier 2 | **iPhone** (2026-10-01). Any run on it needs an iOS development build, so the $99 account: App Store Expo Go stops at SDK 54 (2026-10-04). |
| Apple Developer account ($99/yr) | Any iPhone run, B0, B2, C, D, E | **Deferred until Tier 0 and the web run-through pass.** Not needed for APNs; this app only sends local notifications. |
| A Mac with Xcode | only the iOS simulator | Not required: EAS cloud builds cover everything from Windows. |

---

## Batch A — Backend (desk, ~30 min, no device)

### A1–A3: done (kept in git history)

- **A1, live Coach generation:** passed 2026-09-25. Real model output, every
  guard held (grounding, validator, crisis pre-filter).
- **A2, deploy `refine`:** cut 2026-09-24. Refine is deferred out of v1; the
  reasoning is in `CLAUDE.md` § AI A.
- **A3, apply the migrations:** done 2026-09-24. All five match remote, RLS holds
  (an anon read returns `[]`, an anon write to `entitlements` is refused).
  `analytics_events` is live; the validation checkpoint's two queries at the
  bottom of this file return nothing until real users arrive.

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

**Prices and trial DONE 2026-10-01** in the dashboard (the API's
create-product call takes neither): $4.99 / $29.99 / $59.99, and a **1-month
free trial** on `calibrate_plus_annual` only, confirmed through
`store_state`. This also fixes what the UI pass saw on 2026-09-28 (annual at
$29.90, a trial on monthly). The App Store app half (steps below) waits on B0.

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

1. Create the same three IAP products with the same identifiers and prices
   (decide P1 first, `GROWTH_AND_MONETIZATION.md` §4: the recommendation is
   $34.99/yr and $79.99 lifetime; the store and RevenueCat must match).
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
4. **Share links** (`GROWTH_AND_MONETIZATION.md` §0, step 1). Copy the app's
   numeric Apple ID from App Information into `APP_STORE_ID` in
   `src/constants/app.ts`. Then, once the app has analytics data, create one
   campaign link (Analytics → Acquisition → Campaigns → +, any name): the
   `pt=` number in it is the provider token, the same for every campaign.
   Put it in `APP_STORE_PROVIDER_TOKEN`. The app builds the `share-*`
   campaigns itself; nothing else to create.

**Report:** confirmation that the annual product shows a 1-month free trial
introductory offer, and that all three products are "Ready to Submit"; the
App Store id and provider token, once each exists.

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

**Sandbox purchases (decided in code 2026-09-25, switchable).** By default a
SANDBOX or Test Store purchase grants server-side Plus exactly like a real
one. `REVENUECAT_IGNORE_SANDBOX=true` on the function turns that off. **Leave it
off through App Review.** Reviewers buy with sandbox accounts, and a reviewer
who subscribes and then gets a Coach answering 403 is a rejection. The cost of
leaving it off is that TestFlight testers get the Coach free, bounded by its
daily ceiling. If you ever turn it on, redeploy the webhook for it to take
effect.

~~**The deployed webhook predates that commit.**~~ Redeployed 2026-10-02
alongside `delete-account` (version 2, `verify_jwt: false`), so the live code
matches the repo. `REVENUECAT_IGNORE_SANDBOX` is unset.

**Pass:** RevenueCat's "Send test event" returns 200 with
`{"ok":true,"action":"ignored"}` (a TEST event writes nothing, by design), and
after the sandbox purchase in D2 a row appears in `public.entitlements` with
`is_plus = true`.

**Report:** the test-event response, and the row after D2.

---

## Batch C — App run-through (~30 min; an iOS development build)

This is the Layer 6 gate. **Changed 2026-10-04:** App Store Expo Go can't open
an SDK 55 project, so on an iPhone this runs on the iOS development build
(Tier 2, the $99 account). Install the build, run `npx expo start --dev-client`
on Windows, and open the project from the build's launcher; `.env.local` is
read by the dev server. Start from a **fresh state** (delete and reinstall the
build) so the first-run path is real. Boxes already marked *web-verified*
(`NEXT_STEPS.md` item k) only need a glance on the phone. Sign in with
**email**. The paywall/plan boxes work here too, against the Test Store.

> **Sign-in exists as of 2026-09-25:** Settings → Account → Sign in. It has
> been checked against the live project on the web build: a wrong password
> round-trips "Invalid login credentials". A *successful* sign-in hasn't been
> seen yet, because the A1 test user's password no longer works. **"Confirm
> email" stays on (decided 2026-10-01)**: the built-in mailer delivers only to
> members of your Supabase team, so create the account with that address. See
> `docs/ACCOUNT_SPEC.md` §1.

> **Web run-through, 2026-10-04** (`NEXT_STEPS.md` item k, Playwright at
> 440 × 956 on a fresh browser profile). These passed on web, so on the phone
> they only need a glance: first launch lands in the Warmup; the quiz renders a
> verdict and chart; *Share my result* opens the warm-up card; Warmup results
> stay out of Stats; Log saves in a few seconds with all four fields and no ✨
> Refine; the coverage nudge appears after 8 logs above 40% and *Start at 25%*
> pre-sets the slider and hides it; Resolve (Yes → Recorded → Change answer →
> No → reflection → Done); Stats provisional (Calibrating bar, ghost-free
> curve with counts) and unlocked (rating, bullet bar, takeaway title); History
> filters by category; Share → Card / This week / This year render; a Plus
> theme opens the paywall; Settings defaults (Coach off, usage stats on);
> Erase as a guest returns to the Warmup on the next cold launch.
>
> **Fixed during the run:** overlapping "n=" labels on close chart dots; the
> web tab bar clipping its labels; the yearly Wrapped calling a user "well
> calibrated" from averages while Stats said "overconfident at 80–100%";
> sign-in showing the raw "Failed to fetch" when the server is unreachable;
> the analytics switch saying "Anonymous" for events that are linked to the
> account; weekday names in demo titles that contradicted their due dates.
>
> **Found, needs you:** the RevenueCat **Test Store prices drifted** (read
> back through the API 2026-10-04): annual is **$29.90**, not $29.99, and
> **monthly carries a 1-month trial too**; it should have none. The paywall
> shows exactly that, correctly. Fix both in RevenueCat → Product catalog
> (steps in Tier 0 above), then ask the agent to re-read `store_state`.
>
> **Still device-only:** haptics, SF Symbols / SF Rounded, sheets and the
> swipe-down guard, glass, notifications, share-sheet export, Apple sign-in,
> real purchases, Dynamic Type, VoiceOver. A successful email sign-in also
> waits on the Supabase project being restored.

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
- [ ] **Delete as a signed-in user** (`delete-account` is live as of 2026-10-02):
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
- [ ] Stats shows **one** Plus teaser card for a free user (Coach + Trends in one
      card, "Your score, curve, badges and cards stay free"), and tapping "See Plus"
      opens the paywall. (Changed 2026-09-29: it used to be two grey slabs.)
- [ ] As Plus (after D2): Trends renders months and categories, and "Export CSV"
      produces a file the share sheet accepts. Open it in a spreadsheet and
      confirm a title starting with `=` shows as text, not a formula.
- [ ] Settings → "See Plus" opens the paywall.
- [ ] The paywall lists annual first with its trial, then monthly, then
      lifetime (after Batch B; before it, it shows the unavailable state).
      Annual is **preselected** (filled radio), there is **one** purchase button
      whose label follows the selected plan, and a Today / In 1 month timeline
      shows only while a plan with a trial is selected.
- [ ] **Annual reads "1 month free, then $29.99"** — one *month*, not "30
      days". If it says days, the store reported an unstructured period and
      the fallback fired; check the offer's configured unit.
- [ ] **The trial terms line is present** under the plans: the trial turns
      into a paid subscription, cancel at least **24 hours** before it ends.
      That 24-hour figure is Apple's actual rule, not ours — without it the
      screen promises something the platform doesn't do.
- [ ] Nothing in Log → Resolve → Stats → Share ever hits a paywall.

**Report:** which boxes failed, with a screenshot for anything visual.

### C2. UI redesign pass (added 2026-09-28)

What changed is summarised in `docs/design/BUILT_LOG.md`. Check on an
iOS simulator or phone as well as web — web can't show SF Rounded, haptics or the
notification placeholder.

- [ ] **Buttons** are capsules. The one filled button on a screen is indigo, not
      Tailwind blue; others are white with a grey outline. The tab bar tint is indigo.
- [ ] **Resolve:** the screen opens with "On {date} you said **N%**", then the
      prediction, then "Did it happen?". **Yes and No look identical** (same white
      capsule, same width). Nothing is red.
- [ ] **Home, fewer than 20 resolved:** no big number at the top. A "Calibrating" bar
      with 20 segments: solid = resolved, dashed/tinted = open predictions, hollow =
      to go. The text under it adds up.
- [ ] **Home list** is grouped "Ready to resolve · N", "Next 7 days · N", "Later · N".
      A prediction past its due date sits under Ready to resolve with **no amber
      and no word "Overdue"**.
- [ ] **History** cards say "Happened" / "Didn't happen" / "Not scored" — no ✓ or ✗.
      With nothing resolved, the empty state is a plain sentence, not grey italics.
- [ ] **Log:** chips read "Tomorrow", "In a week", "In a month"; the line below
      reads "Due Monday, 5 Oct" (your locale's format). No chip or tinted band
      appears at any confidence (the integrity bonus was dropped, D23). The
      Prediction box has a visible border.
- [ ] **Stats, fewer than 20 resolved:** the same Calibrating bar; section titles in
      sentence case, not ALL CAPS.
- [ ] **Share → This week:** a line like "You said 40–60% once. It happened.", a
      progress line toward your first score, and a dashed rounded-square badge icon
      with "Tracker in {category}: N to go". Tap **Share my recap** on a phone and
      confirm the icon appears in the exported image.
- [ ] **Coach (Plus + signed in):** each insight has an × that hides it; one line
      under the cards says the Coach "can be wrong". Most cards lead with a big
      number and what it counts ("55% · came true in finance"); check it against the
      Stats chart above.
- [ ] **Resolution reminder (device):** title "Did it happen", body "{title} · You
      said N%". Then turn on Settings → Notifications → Show Previews → *Never* (or
      *When Unlocked* with the phone locked): the reminder must read "A prediction
      is ready to resolve", not the prediction text.
- [ ] **Weekly digest (device):** title "Your week ahead"; no mention of a streak.
- [ ] **Dynamic Type at the largest size:** Resolve, Home and Log still lay out with
      nothing clipped.

Added 2026-09-29 (second pass):

- [ ] **Confidence control (Log and Warmup):** a big "70%" with "about 7 times in
      10" beside it, a slider that clicks every 5% (**feel the haptic tick on a
      phone**), and on Log a tinted "honest uncertainty" band under 35–65%. ±5 still
      work. VoiceOver: the whole control is one element; swipe up/down changes it.
- [ ] **Resolve is a sheet** on iOS (grabber, ~¾ height) and closes back to Home.
      After Yes/No you see "Recorded", a line like "In your 60–80% range, 6 of 9
      have happened", and only then the reflection box and **Done**. Skip exits
      straight away. Yes, No and Skip all give the same medium haptic.
- [ ] **Unsaved reflection (added 2026-10-03):** answer, type a reflection, then
      swipe the sheet down. It stays open and an action sheet offers *Save
      reflection* / *Discard reflection* / *Keep editing*. Save closes it; Done
      after typing closes without asking; an empty box never asks.
- [ ] **The 20th resolution** shows a "Your calibration score is unlocked" card
      that springs in with a success haptic; reaching Tracker (20 in a category)
      shows "Tracker in {category}" with its emblem. Neither ever appears for a drop.
      **Tier-up (added 2026-10-04):** the emblem flips from the old tier to the
      new one, the success tap lands as the new face turns in, and a short
      confetti burst leaves the emblem (none with Reduce Motion). To replay any
      celebration without earning it, open `/dev/celebrations` on the dev build.
- [ ] **Stats chart:** a sentence title above it ("Your curve so far", or once
      unlocked with ≥ 10 in a band "You're overconfident at 80–100%"), warm/cool
      tinted regions labelled Overconfident/Underconfident, coloured dots with
      "n=…", a five-box coverage row, and "Show as table".
- [ ] **Warmup verdict:** the chart line draws in and the dot(s) appear after it,
      and a single firm tap lands with the last dot (no score, no count-up since
      D20). With Reduce Motion on, no drawing, but the tap still fires. "Share my
      result" opens Share showing the **warm-up card** ("5 of 10 right", "I was 77%
      sure. How sure are you?") — test on a fresh install or after erasing the
      device's data, before any prediction resolves.
- [ ] **Badges** are drawn emblems (dashed square for Guesser, filled indigo for
      Forecaster, …), not emoji, in Stats and on the identity card.
- [ ] **Icons:** SF Symbols in the tab bar and on category chips/cards on iOS;
      Ionicons on Android/web.
- [ ] **Buttons** shrink slightly when pressed (Reduce Motion: they dim instead).
- [ ] **Hero rating** (once unlocked) rolls to its new value after a resolution
      changes it, and does *not* re-roll when you just switch tabs.
- [ ] **Share → Share as text:** pastes as "My calibration · Calibrate", your
      headline, and (once unlocked) a row of five coloured squares with the score.
      No prediction titles.
- [ ] **Paywall** (after Batch B): Annual preselected, one purchase button whose
      label changes with the plan, Today / In 1 month timeline for the trial.
- [ ] **Stats, free user:** one "Calibrate Plus" card instead of two "See Plus"
      blocks.
- [ ] **Native packages added this pass** (expo-haptics, slider, expo-symbols,
      reanimated + worklets, datetimepicker): all are in the SDK 55 module set;
      they're native, so they need a development build made after they were
      added (datetimepicker also adds a config plugin to `app.json`).

Added 2026-09-29 (polish pass):

- [ ] **Log → Pick a date:** a fourth chip opens the iOS compact date picker
      (Android: the system dialog). Past days can't be picked; the line below
      updates to "Due {weekday}, {date}".
- [ ] **Resolve → Change answer:** after Yes/No the screen says "Recorded: it
      happened / it didn't happen" with a neutral glyph; "Change answer" puts the
      prediction back to pending and shows the question again. Check History and
      Stats don't count the withdrawn answer.
- [ ] **Added 2026-10-05 (all web-verified; a glance on the phone):** Home shows
      "Sharp in health" with its emblem under the rating once a category passes
      Guesser, and tapping it opens Share. "How is this scored?" under the Stats
      rating (and Settings → How scoring works) opens a full-height sheet that
      scrolls and closes. The paywall has a × at the top right, clear of the
      notch. History shows saved reflections on their cards and hides its
      filters until something is resolved. While calibrating, Home and Stats say
      when the next one comes due. Settings ends with "Terms of use".
- [ ] **Added 2026-10-05, steps 46–51 (all web-verified; a glance on the
      phone):** Log's Save is dimmed until the prediction has a title. A badge
      row short on both counts names both ("20 more resolved and a score above
      85 → Sharp"). The weekly and yearly cards say "6 happened. You expected
      about 4." where they used to say "86% came in". Tapping through the
      Warmup without moving the slider gives "You said 75% on all 10". On the
      paywall, each price names its period and Annual shows "Works out to …
      a month." in smaller type (check it against the real App Store price).
      On Stats, tapping a filled range under the chart opens History with
      "You said 80–100% ×", and the count matches the chart's subtitle.
- [ ] **Evening reminder (added 2026-10-05, step 60):** log a prediction due
      tomorrow; the reminder should arrive at 19:00 tomorrow, not at noon. If
      the phone had reminders queued before this build, relaunch once and
      check they now say 19:00 (Settings → Notifications shows nothing, so
      wait for one).
- [ ] **Streak (added 2026-10-05, step 61; web-verified):** after three logs or
      answers today, Home's streak row says "Today counts" with three filled
      pips; VoiceOver reads it as one sentence.
- [ ] **Streak checkpoint (added 2026-10-06, step 64; web-verified on Home):**
      on day 7 (or 30, 100…) the third log or answer turns Home's streak row
      indigo-tinted with "A full week. Next milestone: 30 days". If it was an
      answer, the Resolve sheet shows the still flame card ("7", "A full
      week", "Next milestone: 30 days") above the range line, with no confetti and no extra
      haptic; Done and the reflection box stay reachable in the medium sheet.
- [ ] **The 2026-10-06 batch (steps 65–71; web-verified):** a run of three
      ends on "3 answered. 2 happened. You expected about 2." with the streak
      row; Sign in's round × sits clear of the notch; on an SE or mini (320pt)
      "80–100%" never splits in the Stats title (word joiners on iOS) and
      "then $29.90 a year" stays whole; the Warmup answer key reads one stop
      per question in VoiceOver ("Which is deeper? Pacific. You picked
      “Atlantic”, 90% sure…").
- [ ] **The second 2026-10-06 pass (steps 72–78; web-verified at 375 × 667):**
      on an iPhone SE, the Warmup's last answer opens the verdict at its top,
      with the score counting up in view; after a save, Log opens on an empty
      title field, not at Save; How scoring works keeps "0–20%" and the other
      bands whole; the paywall's "Restore purchases" is a text link between the
      CTA and "Not now", and still restores.
- [ ] **The 2026-10-07 batch (steps 79–84; unit-tested, not yet seen on web):**
      the tab bar reads Today · Insights · History · You; the indigo "+" sits
      at the right of the title bar on Today, Insights and History (D21; it
      floated above the tab bar before 2026-10-09), and opens "New prediction"
      as a full-height sheet; with a title
      typed, swiping down asks Discard prediction / Keep editing. Every sheet
      (Resolve, a run, Share, How scoring works, Log) has the round × at the
      top. You is a grouped list: whole rows highlight on press, VoiceOver reads
      each row's name. Erase everything is an outlined red capsule. In a
      development build, finishing a run of answers after a week of use shows
      Apple's rating prompt on Today (TestFlight never shows it). Start the
      annual trial with a StoreKit configuration whose trial is long enough
      that "two days before" is still ahead, and the reminder is scheduled for
      10:00 that day.
- [ ] **Inter and dark mode (steps 85–86; web-verified):** in a new build, every
      screen is set in Inter at the right weights (Semibold buttons and headers,
      Bold titles, no faux-bold). Switch the phone to Dark: every tab, sheet, the
      chart, the badge chips and the switches read clearly, the status bar text
      turns light, and the tab bar and headers go dark with the rest. Export a
      card in Dark and in Light: the PNGs match.
- [ ] **Cold start (added 2026-10-05, step 59):** force-quit and open the
      app. The indigo splash should fade straight into Home, with no white
      screen and spinner between. On a fresh install it should fade into the
      Warmup without Home showing first.
- [ ] **Empty confidence (added 2026-10-05, step 54; web-verified):** on the
      Warmup and on Log the readout says "—% not set yet" and the thumb rests
      grey in the middle. On the phone: tapping the track jumps the thumb
      there (tap-to-seek), touching the resting thumb without moving it sets
      the middle value, a drag gives one detent per 5% (not two at the end),
      and VoiceOver reads the control as "not set" until a swipe sets it.
- [ ] **Share card export (added 2026-10-05, step 53):** export a Post and a
      Story card and open the PNGs: 1080 × 1440 and 1080 × 1920, the same
      composition as the preview, nothing cut off. The preview is scaled from
      a wrapper, and the capture should ignore that scale; if the PNG comes
      out at the preview's size instead, that assumption failed. Worth one
      try with Larger Text on: the content should shrink to fit, not spill
      into the footer.
- [ ] **VoiceOver pass (added 2026-10-05, steps 41–44):** Settings reads
      "Notifications, switch, on" (and a double-tap toggles it); the Stats
      rating reads "Calibration rating, 92 out of 100"; a badge row reads
      "Health: Sharp. 45 more resolved to reach Oracle"; in the Warmup, each
      new question is spoken after Next.
- [ ] **Log it again (added 2026-10-04; web-verified):** after Yes or No on a
      single Resolve, **Log it again** closes the sheet and opens Log with the same
      title, category and lead time, and the confidence empty. On the phone: the
      sheet closes cleanly and the Log tab is the one showing.
- [ ] **Resolve all (added 2026-10-04; web-verified):** with three or more ready,
      Home shows **Resolve all N**. It opens a sheet that steps through them ("1 of
      3"), with **Next** after each answer, **Finish** on the last, and "All caught
      up" at the end. On the phone: the sheet's grabber and detents, the resolve
      haptic per card, and swiping down with a typed reflection still asks first.
- [ ] **History:** filters sit in one horizontally scrolling row; a line under them
      counts "N answered · N happened"; resolved cards say "resolved {date}".
- [ ] **Identity card:** your best category large, the contrast line smaller under
      it (hidden when both are the same tier), a five-dot strip once your score is
      unlocked, and "What are you sharp at?" in the footer. Export it and check the
      emblems and dots appear in the PNG.
- [ ] **This week card:** a big "N resolved" with "N% came in" under it; prediction
      titles appear only after turning on "Show prediction titles on the card".
- [ ] **Warmup (fresh install):** branded first screen, radio-style answers,
      ten-segment progress; on the verdict, "Make a real prediction" and "Share my
      result" sit above the answer key.
- [ ] **Warmup, Day 0 (D18):** the ten read as ordinary comparisons (no trick
      questions), some close and some easy; the verdict title reads "On these ten,
      you were …" (or "…no clear lean" when the counts are within luck; no 0–100
      score) with
      "You said N% on average. K of 10 were right." under it; the thesis line sits
      above the button at 320pt without splitting; a first Log opens on Tomorrow;
      the Day-0 card reads "K of 10 right" and "How sure are you?".
- [ ] **The first answer ever (step 107):** resolving your very first prediction,
      Yes or No, shows "That's your first. A 70% call should come true about 7
      times in 10…" in place of the range line; the second answer shows the range
      line as before, in a single Resolve and in a run.
- [ ] **Settings switches** are indigo when on (not green).
- [ ] **Share → Shape:** "Post · 3:4" and "Story · 9:16" reshape the card, with a
      large emblem and the text centred. Export each and post the Story to an
      Instagram/Snapchat story draft: nothing important under the top bar or the
      reply field.
- [ ] **Share → On the card** (with 2+ categories): tapping a category takes it off
      the card; the last one can't be removed.

Added 2026-09-30 (the last three commits, `7fd1aba`..`d69ba54`):

- [ ] **Rating bar** (once unlocked, Home and Stats): a thin bar under the number
      with ticks at 70 / 85 / 90. Home adds a one-line read ("You're overconfident
      at 80–100%") only when a band has enough resolutions.
- [ ] **Coverage nudge looks quiet:** a grey inline card, "Start at 25%" as an
      outlined button and "Not now" as text. Save stays the only filled button on Log.
- [ ] **Keyboard on a small phone:** on Resolve, type a reflection after Yes/No;
      the reflection box, any milestone card and **Done** stay reachable (the screen
      scrolls). On Log, dragging the form down dismisses the keyboard.
- [ ] **Tap targets:** theme swatches and the Post/Story control are easy to hit
      (44pt); the lock on Plus swatches is legible.
- [ ] **Dynamic Type, largest size:** the hero rating, the big confidence "70%" and
      the milestone number stop growing at some point while body text keeps
      growing; exported share cards don't reflow.

Added 2026-10-07 (retention batch, roadmap steps 87–89; all web-verified):

- [ ] **Rest days:** the streak row's third line reads as one sentence with the
      rest under VoiceOver ("15-day streak. One prediction today makes it 16. 2 rest days
      saved."), and stays legible in dark mode.
- [ ] **Practice row on Today:** sits under the streak row, reads "Today's
      practice, 3 questions, about 30 seconds" with the hint "Start", and opens
      the practice sheet at full height with the grabber and the ×.
- [ ] **Practice sheet:** the answer radios and the confidence control feel like
      the Warmup's (detent haptic on the slider); after the third, the answers
      open at their top; VoiceOver hears each new question.

Added 2026-10-07 (evening pass, roadmap steps 91–96; all web-verified):

- [ ] **Appearance switched with the app open** (Control Centre's Dark Mode, or
      Automatic at sunset): the header and the tab bar change with the content,
      the first time as well as after.
- [ ] **Log → Pick a date in dark mode:** the compact date picker and its calendar
      popover are dark too (it was pinned to light). Only "Pick a date" reads as
      chosen while it's open.
- [ ] **VoiceOver on Log, the Warmup and the paywall:** the chosen category, due
      date, answer and plan are read as selected, and only those.

---

## Batch D — Physical device (~45 min)

Requires a dev build (`eas build --profile development --platform ios`), not
Expo Go — notifications and RevenueCat are both native modules.

### D1. Notifications
- [ ] **No permission prompt at first launch** (changed 2026-10-05, roadmap
      step 38): the Warmup opens with no iOS alert over it. After logging a
      first prediction, Home shows "Want a reminder when it's due?"; **Turn on
      reminders** brings up the iOS alert. Allow it: the prediction's reminder
      is scheduled. On a second install, refuse it: Settings → Notifications
      shows "Open Settings", which opens the app's page in iOS Settings.
- [ ] **The two new switches (D31, step 131):** under Notifications, turn off
      Due-day reminders: an open prediction's reminder is cancelled (check the
      schedule in a log) and the Sunday digest stays; turn it back on and it
      returns. The same the other way for Sunday digest.
- [ ] **An edited due date (D25, step 125):** open a prediction not yet due,
      Edit, choose In a week: its reminder moves to that evening.
- [ ] **A delete while signed in (D25):** delete an open prediction, then pull to
      sync (or relaunch): it doesn't come back; in the Supabase dashboard the
      row is gone.
- [ ] **"Not now" (D19, step 108):** tap it on the reminder card in the evening;
      it's gone for the rest of the day and back on Today from 06:00 the next
      morning. Tap it again: gone for a week.
- [ ] A resolution reminder fires on a prediction's due date (set one a few
      minutes out).
- [ ] Tapping the notification deep-links into the Resolve screen for the
      right prediction — including from a **cold start** (force-quit first).
- [ ] The Sunday digest is scheduled (check
      `getAllScheduledNotificationsAsync` in the dev console, or wait).
- [ ] Turning notifications off in Settings cancels everything; turning it
      back on reschedules.
- [ ] **Across a relaunch (added 2026-10-05, roadmap step 37):** log a
      prediction due in a few minutes, force-quit, reopen, resolve it before it
      fires: no reminder arrives. Repeat with Settings → Notifications off
      after the relaunch instead of resolving: still nothing.
- [ ] **Practice reminder (added 2026-10-07, roadmap step 89):** finish
      today's practice; under the answers, "Want tomorrow's three at a set
      time?" offers three moments. On a fresh install, picking one brings up the
      iOS alert (and only then). `getAllScheduledNotificationsAsync` lists three
      `calibrate-practice-<day>` requests at that time, none for today, each with
      a different title and its day's first question as the body. Tapping one
      (also from a cold start) opens today's practice. In You, pick Off: all
      three go. Turn Notifications off: all three go, and the row says nothing is
      sent.

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

- [ ] **Account deletion: deployed 2026-10-02, optional legs not yet on.**
      The function is live, which alone is compliant. When you have them,
      set the Sign in with Apple key secrets (needs the $99 account) and a
      customers-*write* RevenueCat key. See `supabase/README.md`
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
      `PRIVACY_POLICY_URL` (`src/constants/app.ts`)**. The paywall and
      Settings (since 2026-10-05) show their Privacy Policy links only when
      that's set, and 3.1.2 requires the
      link in the app, not only in the listing.
- [ ] `npx expo install --check` before the build. `expo-doctor` is 19/20
      green; the one failure is patch drift inside SDK 55 (15 packages on
      2026-10-04, e.g.
      `expo` 55.0.26 → 55.0.31). Not urgent, but a build is the moment to take
      it — and re-run `npm test` after, since it moves `react-native` and
      `jest-expo`.
- [ ] Screenshots (the identity card and the calibration curve are the two
      that sell it). Drafts exist; finals come from the device build.
- [ ] **Age-rating questionnaire** in App Store Connect: the updated question
      set (in-app controls, capabilities, medical or wellness topics, AI
      features) has been mandatory since 2026-01-31. Proposed answers:
      `APP_STORE_LISTING.md` §1.
- [ ] **Age assurance decision** (Texas SB 2420, in force since 2026-06-04):
      build the Declared Age Range check before submission or not. See
      `NEXT_STEPS.md`, "Waiting on you", and item i.
- [ ] **Coach discloses OpenAI by name** before it is switched on (Guideline
      5.1.2(i)). Code item h in `NEXT_STEPS.md`; confirm the wording on the
      device build.
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
   proposed 15%/5% and Epic is contesting it. Re-checked 2026-10-04: the
   Supreme Court took Apple's appeal in June 2026 (a decision is unlikely
   before June 2027), the district-court fee proceeding has stalled, and the
   rate stays at 0% meanwhile. Worth 12–18% of every renewal. It doesn't block
   shipping in-app IAP — it decides whether a link-out flow is worth building
   later, and that question can wait until mid-2027.
3. **Whether to ship billing at all yet.** `BUILD_PLAN.md`'s validation
   checkpoint says measure D0 aha completion and share rate *before* the
   checkout goes live. If nobody shares, the freemium premise is wrong and the
   paywall is the wrong thing to be tuning.

---

## Open work that is code, not you

Listed here only so the human checklist isn't mistaken for the whole list.
**The full, current list is [`docs/NEXT_STEPS.md`](./NEXT_STEPS.md)**; UI status is in
[`docs/design/UI_ROADMAP.md`](./design/UI_ROADMAP.md).

Once people are using the app, the two questions that decide the business model
(the validation checkpoint in `BUILD_PLAN.md`) are:

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
