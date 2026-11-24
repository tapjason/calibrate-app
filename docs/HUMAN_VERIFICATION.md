# Fairly Sure — Human Verification Checklist

**As of:** 2026-11-16 · `master` at `2636ff2` · TestFlight 1.0.0 (build 2, steps through 186)
is on the owner's iPhone; build 3 adds step 187. D4 and D5 revised 2026-11-19 for D70 and D71
(`builder/owner-decisions`).

Everything the app needs that an agent can't do from the repo: dashboards, the store and the
iPhone. Each item says what to do, what "pass" looks like and what to report. Everything
still open, with who does it, is in [`SHIP_READINESS.md`](./SHIP_READINESS.md) "Open work";
the plan for real testers is [`TESTFLIGHT_PLAN.md`](./TESTFLIGHT_PLAN.md).

> **Before any live test: check the Supabase project is up.** The free tier pauses after
> about 7 days idle (it read `INACTIVE` on 2026-10-03, and its hostname stopped resolving).
> `npx supabase projects list` shows it; restore it from the dashboard (project `calibrate`
> → Restore; there is no CLI verb). The keep-alive workflow
> (`.github/workflows/supabase-keepalive.yml`, its secrets set 2026-11-03) keeps it awake.

---

## Where things stand

### Done, verified

| Item | When |
|---|---|
| OpenAI funded and the Coach generating grounded output (A1); migrations 001–005 applied with RLS holding (A3); the Coach refusing users without Plus with a 403 (A4) | 2026-09-24/25 |
| The RevenueCat webhook deployed, its secret set, registered, test event 200 (B3); `delete-account` deployed with JWT on | 2026-09-25, 2026-10-02 |
| Supabase restored, keep-alive secrets set and a run green; migration 006 applied; the leaked test account gone (`auth.users` empty); the Test Store products fixed (`PRODUCT_ALIASES` accepts them) | 2026-11-03 |
| The Apple Developer account; identifier `app.fairlysure` with Sign in with Apple and Declared Age Range; the App Store Connect record (`6831917395`); the Apple provider in Supabase; EAS login and the `development` variables; the SDK 55 patch updates | 2026-11-07 |
| GitHub Pages on: `/privacy/` and `/support/` load | 2026-11-15 |
| The Paid Applications Agreement active; the three products at $4.99 a month, $34.99 a year and $79.99 lifetime; RevenueCat's App Store app on `plus` and `default` with its `appl_` key; the three EAS `production` variables; migrations 007 and 008 applied; the account-deletion secrets set (one misspelled, Batch E) | 2026-11-16 |
| TestFlight 1.0.0 (build 2) installed; confirmed on it: the three plans at the store's prices, the 24-hour clock (step 185) | 2026-11-16 |

- [x] **Web run-through: Batch C, minus what web can't show.** Done 2026-10-04 (Playwright at
      440 × 956, a fresh profile) and in every web playtest since; Batch C's note says what it
      covered. Boxes marked *web-verified* need only a glance on the phone.
- [x] ~~**Expo Go run-through.**~~ Not applicable: App Store Expo Go stops at SDK 54 and this
      app is SDK 55. Batch C runs on the TestFlight build instead.
- [x] ~~**An Android build for a free Test Store purchase.**~~ Not applicable: iPhone only.
      Batch D2 is the sandbox purchase on the iPhone.

**Project ids:** Supabase project `calibrate`, ref `otopheizhjstoeyndcvc`, us-east-1 (the CLI
is linked). RevenueCat project `projb27eccad`. Expo owner `tapjason`. Secrets live in
`.env.local` and on Supabase; agents never read them.

### Build day runbook (added 2026-11-06, step 155)

How a build gets from Windows to the iPhone. Steps 1–4 were done on 2026-11-07, and the
first production build reached TestFlight on 2026-11-16.

1. **The identifier `app.fairlysure`** (developer.apple.com → Identifiers) has **Sign in
   with Apple** and **Declared Age Range** ticked; `app.json` asks for both. If a build fails
   on a provisioning profile, check this first. Supabase → Authentication → Sign In /
   Providers → **Apple** is on with `app.fairlysure` in Client IDs; native sign-in is refused
   without it. A development build also needs the iPhone's Settings → Privacy & Security →
   **Developer Mode** on. *Done 2026-11-07.*
2. **Log in to EAS:** `npx eas login`; `npx eas whoami` prints `tapjason`. *Done 2026-11-07.*
3. **Set the build's public values.** `.env.local` is git-ignored, so EAS never sees it. The
   app reads exactly these three on iOS; run each with your own value (the agent never reads
   or prints them). `eas.json` names the environment for each profile.
   ```
   npx eas env:create --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value <from .env.local>
   npx eas env:create --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <from .env.local>
   npx eas env:create --environment development --visibility plaintext --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value <the test_ key>
   npx eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value <from .env.local>
   npx eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <from .env.local>
   npx eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value <the appl_ key>
   ```
   Never the `sk_`, `OPENAI_` or webhook secrets: those stay on Supabase. A `test_` key never
   works in a release build: the app treats it as no key, and the paywall says "Plus isn't
   available on this build yet". *Done: `development` 2026-11-07, `production` 2026-11-16.*
4. **Dependency drift:** `npx expo install --check`; if anything is behind,
   `npx expo install --fix` on its own commit, then `bash scripts/check.sh` until it prints
   `CHECK PASSED`, so a device bug can be traced to it or not. *Done 2026-11-07 (`expo`
   55.0.32, `react-native` 0.83.10); `check.sh --release` re-checks it.*
5. **Build.** Development: `npx eas build --profile development --platform ios` (EAS
   registers the iPhone the first time). Production:
   `npx eas build --profile production --platform ios`, then
   `npx eas submit --profile production --platform ios`; the build number moves itself
   (`autoIncrement`). About 15–30 minutes in the free queue.
6. **Install.** A development build from the link EAS prints, then
   `npx expo start --dev-client --tunnel` on the PC (port 8081). A production build from
   TestFlight, after **deleting the development build** (or Erase first): they share a bundle
   id, so the SQLite data carries over, a Plus mirror from a Test Store purchase included.
   Then Batch C and D below.

Also: export compliance was declared at the first build (`ITSAppUsesNonExemptEncryption:
false` in `app.json`); check each upload's App Store Connect email for a missing
privacy-manifest reason (`APP_PRIVACY.md` §6); the `preview` profile builds for the
simulator only, so it needs a Mac; EU trader status is `SHIP_READINESS.md` decision 5.

---

## Batch A — Backend

A1 (live Coach generation, 2026-09-25), A2 (`refine`, cut from v1 on 2026-09-24; `CLAUDE.md`
§ AI A) and A3 (the migrations and RLS, 2026-09-24) are done; the details are in git history.

### A4. Keep `COACH_ALLOW_UNENTITLED` unset

That secret bypasses the server-side Plus check entirely: with it set, any signed-in user can
spend the OpenAI budget up to the daily ceiling. It was unset on the live project when last
read (2026-09-24). If it is ever set for a test, unset it and redeploy in the same sitting:

```sh
npx supabase secrets list                      # it should not appear
npx supabase secrets unset COACH_ALLOW_UNENTITLED
npx supabase functions deploy coach            # secrets take effect on deploy
```

**Pass:** a signed-in user with no `entitlements` row gets `403` from `/functions/v1/coach`
(verified live 2026-09-25; the gate reads the table on every call, no caching, no grace).

### A5. Password requirements on the server (step 190, 2026-11-18)

Create account asks for 8 or more characters with an uppercase letter, a lowercase letter
and a number. Until the server has the same rule, only the app enforces it. (From round 5's
build Create account is hidden until a custom mail sender works, D69 (c),
`EMAIL_SIGN_UP_ENABLED`; the setting still matters for when it returns, and for any
sign-up made outside the app.)

- [ ] **Supabase → Authentication → Sign In / Providers → Email:** minimum password length
      **8**, password requirements **Lowercase, uppercase letters and digits**. Save. Not
      the option with symbols: the app doesn't ask for one, so the server would refuse
      passwords the app accepts. Existing accounts keep signing in with the password they
      have.
- [ ] **Leave leaked-password protection off** (a paid-plan setting, if the page shows it) unless the wording changes first: a
      refusal for a leaked password would show the four-rules line to someone whose password
      already meets all four.

### A6. Google sign-in (step 192, 2026-11-18)

The app has a "Continue with Google" button, hidden behind `GOOGLE_SIGN_IN_ENABLED` until
these are done. It opens Google in the system sign-in sheet; there is no Google SDK in the
app. Why this way, and what it costs: `docs/design/research/sign-in-providers-2026-11.md`.
Menu names are Google's and Supabase's as documented in November 2026 and may have moved.
The client secret goes from Google straight into Supabase: don't paste it into a chat, a
file in this repo or a terminal an agent reads.

- [x] **Google Cloud project.** Done 2026-11-18 (owner). console.cloud.google.com → new project, "Fairly Sure".
- [x] **Branding** (done 2026-11-18; Google Auth Platform → Branding): app name **Fairly Sure**; your support
      email; home page `https://tapjason.github.io/calibrate-app/support/`; privacy policy
      `https://tapjason.github.io/calibrate-app/privacy/`; authorised domains
      `tapjason.github.io` and `otopheizhjstoeyndcvc.supabase.co`; your contact email.
- [x] **Audience** (done 2026-11-18)**:** External, then **Publish app** (in Testing only listed test users can
      sign in, so an App Review tester couldn't).
- [x] **Data access** (done 2026-11-18)**:** only `openid`, `.../auth/userinfo.email` and
      `.../auth/userinfo.profile`. Nothing else: these three need no Google review.
- [x] **Client** (done 2026-11-18)**:** Clients → Create client → **Web application**; authorised redirect URI
      `https://otopheizhjstoeyndcvc.supabase.co/auth/v1/callback`. Keep the page open for
      the client ID and secret.
- [x] **Supabase → Authentication → Sign In / Providers → Google** (done 2026-11-18)**:** enable, paste the client
      ID and the client secret, leave "Skip nonce check" **off**, save.
- [x] **Supabase → Authentication → URL Configuration → Redirect URLs** (done 2026-11-18)**:** add exactly
      `fairlysure://google-auth`.
- [x] **Supabase → Authentication → Sign In / Providers → Email** (checked 2026-11-18)**:** "Confirm email" is **on**
      and stays on (with it off, an address someone else registered first would be linked
      to its real owner's Google sign-in).
- [x] **Applied 2026-11-18** (owner; `migration list --remote` shows 009, and `pg_trigger` shows both
      triggers enabled, on `auth.users` and `auth.identities`). **Apply migration 009** (`npx supabase db push --remote`, with this branch checked out): it
      drops the name and picture Google sends as they arrive. Read the notices it prints:
      one names any trigger the project refused.
- [x] **Told 2026-11-18.** **Tell the agent**, which turns the flag on for the next build and, in the same
      change, updates the privacy policy (§2.1, the processor table, deletion) and
      `APP_PRIVACY.md` (the Email row's evidence; the User ID row gains Google's account
      id). The policy goes live when that change is pushed, so it and the build go together.
- [ ] **After the build:** sign in with Google once, then run the query at the end of
      migration 009 in the SQL editor. **Pass:** no `name`, `full_name`, `picture` or
      `avatar_url` among the keys. If they are there, say so: App Privacy then gains Name.
- [ ] **Later, optional:** Google's screen says "continue to
      otopheizhjstoeyndcvc.supabase.co". Showing "Fairly Sure" needs a Supabase custom
      domain (a paid plan plus $10 a month) and Google's brand verification.

---

## Batch B — Store and billing setup

The billing code fails safe. A build with no RevenueCat key (or a `test_` key in a release
build) says "Plus isn't available on this build yet."; a build whose offering comes back
empty says "Plus plans couldn't load. Check your connection, then open this again." During
setup that second line usually means the dashboards, not the network. A reviewer who sees it
online rejects the build under 2.1(b), so see the plans load in sandbox before submitting.

### B0. Apple prerequisites

Done: the Paid Applications Agreement is active (StoreKit returns no products until it is,
sandbox included); the bundle id `app.fairlysure` is registered (it can never change, and
`APPLE_CLIENT_ID` on Supabase must match it); the App Store Connect record exists.

- [ ] The **In-App Purchase key** (App Store Connect → Users and Access → Integrations →
  In-App Purchase; the `.p8`, its Key ID and the Issuer ID) is uploaded to RevenueCat's App
  Store app. RevenueCat needs it to validate StoreKit 2 purchases. Not confirmed; a sandbox
  purchase that turns Plus on (D2) proves it.

### B1. RevenueCat

Done (the Test Store 2026-09-25 and 2026-11-03, the App Store app 2026-11-16): entitlement
**`plus`** (hardcoded in `src/billing/revenuecat.ts`) with the three products, all three in
the **current** offering `default` (the app reads `offerings.current` only), and the `appl_`
key in the EAS `production` environment.

Optional: copy RevenueCat's App Store Server Notifications URL into App Store Connect → App
Information, which gives faster renewal and cancel events.

| Product identifier | Type | Price |
|---|---|---|
| `calibrate_plus_monthly` | auto-renewing, 1 month | $4.99 |
| `calibrate_plus_annual` | auto-renewing, 1 year, one free month first | $34.99 |
| `calibrate_plus_lifetime` | non-consumable | $79.99 |

The ids are hardcoded too (`PRODUCT_IDS`): a mismatch drops the plan from the paywall
silently. The trial is read from the store, not set in RevenueCat.

### B2. App Store Connect

Done: the three products with those ids and prices (P1 closed 2026-11-16); `APP_STORE_ID`
(`6831917395`) in `src/constants/app.ts`. Open:

- [x] **Move the free trial to annual.** Done in App Store Connect (owner, 2026-11-16);
      Session 1 items 9–10 confirm it on the phone. Build 2's paywall showed "1 month free" on Monthly
      and none on Annual: the introductory offer is on `calibrate_plus_monthly`. Remove it
      there and set a "free trial" of **1 month** on `calibrate_plus_annual` only (decided
      2026-09-25). Annual only on purpose: a person is eligible for one introductory offer
      per subscription group, so a trial on monthly spends it on the weaker plan; and one
      month sits inside the measured 42.5%-conversion band ("17–32 days"). The app renders
      what the store reports, so Annual will read "1 month free, then $34.99" with no code
      change. **Report:** the annual product shows the offer and monthly shows none.
- [ ] **A sandbox tester** (Users and Access → Sandbox Testers) for Batch D, if there isn't
      one yet.
- [ ] **The provider token** (`GROWTH_AND_MONETIZATION.md` §0, step 1). Once the app has
      analytics data, create one campaign link (Analytics → Acquisition → Campaigns → +, any
      name): the `pt=` number in it is the provider token, the same for every campaign. Put
      it in `APP_STORE_PROVIDER_TOKEN`; the app builds the `share-*` campaigns itself. Until
      then a text share links to the App Store with no campaign token.

### B3. The RevenueCat webhook

Done 2026-09-25 (redeployed 2026-10-02 and 2026-11-03): deployed with `--no-verify-jwt`
(RevenueCat has no Supabase session; the shared secret is the gate), registered in
RevenueCat, test event 200 `{"ok":true,"action":"ignored"}`. Left for D2: after a sandbox
purchase, a row in `public.entitlements` with `is_plus = true`.

**Sandbox purchases.** By default a sandbox or Test Store purchase grants server-side Plus
like a real one; `REVENUECAT_IGNORE_SANDBOX=true` on the function turns that off. **Leave it
off through App Review.** Reviewers buy with sandbox accounts, and a reviewer who subscribes
and then gets a Coach answering 403 is a rejection. The cost is that TestFlight testers get
the Coach free, bounded by its daily ceiling. If you ever turn it on, redeploy the webhook.
It was unset when last read (2026-10-02).

### B4. The RevenueCat read key (step 189, 2026-11-17)

Session 1 item 13 failed on build 2: signed in with Plus, Get feedback said "Coach is
unavailable right now", and the live `entitlements` table was empty, so the Coach's Plus
check answered 403. Step 189 makes `coach` ask RevenueCat itself when that table has no
Plus row (and the webhook do the same for a `TRANSFER`). It needs one new key and two
deploys; no new build. Details: `supabase/README.md`, "The RevenueCat read key".

- [x] **Create the key.** Done 2026-11-18. RevenueCat → Project settings → API keys → + New secret API key,
      API version 2, any name ("supabase read"). Read access to **customers**
      (`customer_information:customers:read`) and to **entitlements**
      (`project_configuration:entitlements:read`); no write access to anything. If the
      dashboard sets access per section only, Customer information and Project configuration
      read-only. Not the `REVENUECAT_DELETE_KEY` key, which can write.
- [x] **Set it and deploy both functions**, in your own terminal (done 2026-11-18: `coach`
      version 16, `revenuecat-webhook` version 13):

      ```sh
      npx supabase secrets set REVENUECAT_READ_KEY=sk_...
      npx supabase functions deploy coach
      npx supabase functions deploy revenuecat-webhook --no-verify-jwt
      npx supabase secrets list          # REVENUECAT_READ_KEY and REVENUECAT_PROJECT_ID listed
      ```

- [x] **Passed 2026-11-18 on build 3** (owner: "Coach also seems to be working… it works for
      a few logged answers"; not tested at length). The steps were: **re-test on build 2,**
      once at least one answer is scored (a prediction answered on a
      later day than it was logged, like Session 2 item 20): with none, the app never calls
      the Coach and says "unavailable" whatever the server does. Signed in with Plus,
      Insights → Get feedback. **Pass:** insights, or "Nothing worth flagging yet", and a
      row for your account in `public.entitlements` with `is_plus = true` (Table Editor). **Fail:** "Coach is unavailable right now" again;
      send the `coach` function's logs from that minute (Edge Functions → coach → Logs): a
      line starting `[revenuecat-lookup]` names what went wrong (`not_configured`,
      `http_403` for a missing permission, and so on). Build 2 still says "unavailable" for
      any refusal; from build 3 a refusal reads "Coach couldn't confirm your Plus
      subscription yet…" instead, and no scored answer reads "Coach reads your scored
      answers, and you don't have one yet…" (expected, not a fail).

---

## Stage 1 on-phone checklist (items 1–28)

The 28 checks given to the owner on 2026-11-16 for TestFlight Stage 1 (`docs/TESTFLIGHT_PLAN.md`):
the ones that would hurt if wrong. "Item N" in HANDOFF, SHIP_READINESS and TESTFLIGHT_PLAN means
this list. Most repeat a box in Batches C and D; tick that box too when an item passes. The rest
of Batches C and D stays listed as unverified.

### Session 1: today, on build 2 (about 45 minutes)

Start from a fresh install: delete the app, reinstall from TestFlight.

**First run**
1. No notification alert appears over the Warm-up. Apple's age-range sheet may appear once;
   share or decline, and the app carries on either way.
2. The Warm-up: ten questions, the result with its counts, the card. Share it and save the
   image: a real PNG lands in Photos.

**The core loop**
3. "Make a real prediction": title, a number, a category, Save in under 15 seconds. It
   defaults to tomorrow.
4. Today shows "Want a reminder when it's due?". Turn on reminders: the iOS alert appears
   now, not earlier. Allow.
5. Log a second one, open it, **Answer it now**: it says an answer today isn't scored;
   answer anyway; History marks it "not scored".
6. Insights, History and You open with no layout faults at the top or bottom of the
   screen. You's defaults: Hide the words off, the lock off, Show the words in reminders
   off.

**Account**
7. You → Sign in → Sign in with Apple. The sign-in screen says a record of which features
   are used goes with the account.
8. You → Delete account, on that Apple sign-in. The account
   goes and the app returns to a signed-out state. (Sign in again afterwards for the
   purchase test.)

**Purchase** (purchases in TestFlight are free)
9. You → Fairly Sure Plus: three plans, Annual first, "1 month free, then $34.99 a year"
   on Annual and no trial on Monthly.
10. Buy Annual: Apple's sheet shows the same trial and price. You then shows Plus as
    active.
11. Force-quit, turn on airplane mode, reopen: still Plus.
12. On the paywall, Restore purchases works.
13. Signed in with Plus: You → Coach on, Insights → Get feedback. With almost no answered
    predictions it may say there isn't enough yet; that is a pass. An error is a fail.
    (Failed 2026-11-17: "Coach is unavailable right now". Re-test after B4. With no scored
    answer yet, build 2 never calls the Coach and says "unavailable"; build 3 says "Coach
    reads your scored answers, and you don't have one yet…" instead, which is expected,
    not a fail. Passed 2026-11-18 on build 3, after B4.)

**The app lock**
14. You → Lock with Face ID: Face ID is asked before the switch moves.
15. Go to the Home Screen and come back: the lock screen with Unlock; tap it: Face ID, then
    the app. Once, with no second prompt. (Since D74, 2026-11-21; before it Face ID ran by
    itself.)
16. The app switcher shows the app's name, not a prediction.
17. Cover the camera so Face ID fails: the passcode gets you in.

**Before you stop**
18. Leave one prediction due tomorrow so a real reminder arrives.

### Session 2: tomorrow evening (about 30 minutes)

19. The reminder arrives at the time shown in You. It shows no prediction words, only the
    day and the number. Tapping it opens the question.
20. Answer it: this one is scored, and the screen says what a number like yours means.
21. Inside 24 hours, open that answer in History and move it to another category: the
    line under the chips says it's counted; Insights → More about your record shows
    "1 scored answer was moved…". Move it back: the line goes.
22. Largest text (Settings → Accessibility → Display & Text Size → Larger Text, all the
    way up): Today, Log, Resolve and the paywall still work, and every button can be
    reached by scrolling.
23. VoiceOver: the Warm-up's first question, one log and one answer can be done by ear.
24. In TestFlight the subscription renews daily: You still shows Plus.

### Session 3: on build 3 (about 15 minutes)

25. Swipe the app away and open it: the dark splash stays, "Fairly Sure" fades in under
    the mark without the mark moving, and after about a second it fades to Today. Coming
    back from the Home Screen shows no launch page.
26. With the lock on: the same dark page with "Locked…" and a light Unlock button,
    readable in light and dark appearance.
27. The paywall's title and × sit below the clock.
28. Anything fixed from session 1. Also: You → Delete account → Delete my account now asks
    again in an alert; Cancel keeps the account (2026-11-17).
29. Step 188's other changes: the paywall's Annual plan carries a "1 month free" pill and
    reads "$34.99 a year after 1 month free", Monthly says "No free trial", and a heading
    "How the free trial works" sits over the timeline; the Coach's disclosure says "a
    third-party AI service"; Sign in / Create account is a two-part switch above Email, and
    Create account shows "At least 8 characters." (build 3; from build 4 a four-row
    checklist, item 31); signed out, Erase asks in an alert too.
30. Step 189: Insights → Get feedback with no scored answer says "Coach reads your scored
    answers, and you don't have one yet…"; with one, insights or "Nothing worth flagging
    yet" (the server side is live since 2026-11-18, so this also works on build 2).
31. Step 190, on build 4: Create account shows four rows under Password (8 or more
    characters, an uppercase letter, a lowercase letter, a number), each ticking as you
    type; Create account with a rule unmet says what's missing ("Your password needs a
    number."); a password that meets all four makes the account; Sign in shows no rows and
    an old password still signs in; the iPhone's suggested strong password is accepted.
32. Step 192, on build 4: the sign-in screen shows "Continue with Google" under the Apple
    button, the same width and height, readable in light and dark. Tapping it: iOS asks
    to let Fairly Sure use a website to sign in; Google's page opens; after choosing an
    account the sheet closes and you are signed in, with no blank or "unmatched route"
    screen on the way. Cancelling says "Sign-in cancelled." You shows "Signed in as"
    your Google address. Then run query 2 at the end of
    `supabase/migrations/009_strip_provider_profile.sql` (A6).
33. Step 193, on build 4: Today's streak row has an outline flame before today counts and
    a filled one after; the count is the largest thing in the row; "Today's goal" sits
    under the dots.

**Results, build 3, 2026-11-18 (owner):** 25–28 pass (the launch page and the paywall's top
are in his screenshots). 29 passes except the free-month pill, which his Apple ID can't show:
it has already used the trial, and the paywall leaves the offer off when the store says the
customer isn't eligible (`introEligibleProducts`), so his paywall shows three plans with no
trial. The pill, "No free trial" and the timeline heading are still unseen on a device. He
asked for stronger password rules than 8 characters (step 190). 30 passes.

### How to report

One line per number: pass, or fail with a screenshot. "Not sure" is a useful answer too.
Skip anything you judge too small to bother with and say so; I'll list it as unverified
rather than ask again.

## Batch C — App run-through (~30 min; the TestFlight build)

The core loop on a real iPhone. Since build 2 it runs on the **TestFlight build**, from a
fresh install (delete the development build first, runbook step 6); a development build
still serves for a quick look. Sign in with Apple, or by email with an address on the
Supabase team ("Confirm email" stays on until the custom mail sender, `ACCOUNT_SPEC.md` §1).
The paywall boxes run against the sandbox.

> **Web run-through, 2026-10-04** (and every web playtest since): first launch, the Warm-up
> and its card, Log, the coverage nudge, Resolve, Insights provisional and unlocked,
> History's filters, the three Share cards, the paywall from a Plus theme, You's defaults and
> Erase as a guest all passed on web, so on the phone they need only a glance. **Device
> only:** haptics, SF Symbols, sheets and the swipe-down guard, glass, notifications,
> share-sheet export, Sign in with Apple, real purchases, Dynamic Type, VoiceOver.

Tick each:

- [ ] First launch lands in the **Warmup**, not the tabs.
- [ ] The quiz completes and renders a verdict with a mini chart.
- [ ] The verdict's share card exports and the OS share sheet opens.
- [ ] Warmup results do **not** appear in Insights (they are structurally
      separate — this is worth confirming visually once).
- [ ] Log a prediction: under 15 seconds, all four fields work.
- [ ] **The range-coverage nudge.** Log 8 predictions, all above 40%
      confidence, then open Log again: a panel offers to start one at
      25%. Tapping it pre-sets the slider; "Not now" dismisses it. Log one
      below 40% and it stops appearing entirely (a low log is the thing it was
      asking for), as does dismissing it — for a week. This is the
      free-tier answer to `CLAUDE.md`'s range-coverage caveat: without it a
      user who only logs at 80%+ gets a calibration score computed from a
      single bucket.
- [ ] **The ✨ Refine button does NOT appear**, with any title text. Refine is
      cut from this release (`REFINE_ENABLED = false`), and the AI Refine row
      is gone from You too. If either shows up, the flag regressed.
- [ ] **Account.** You shows "Not signed in". Sign in with Apple, Google or
      an existing email account (from round 5's build there is no Create
      account, D69 (c): the email form shows "New here? Use Apple or Google
      for now."). Back in You it reads "Signed in as …", and the predictions
      you logged as a guest are still there. Sign out: the lists go empty
      (from round 5's build the account's predictions leave the phone; with
      Airplane Mode on after a change, You first asks "Sign out anyway?" with
      the count). Sign back in: they return from the server.
- [ ] **Erase as a guest.** Signed out: You → "Erase your data on this
      phone" → Erase everything → the alert's Erase (from build 3). Today is empty afterwards, and the next
      cold launch opens the Warmup. (Verified on the web build 2026-09-25.)
- [ ] **Delete as a signed-in user** (`delete-account` is live as of 2026-10-02):
      You → Delete account → Delete my account → the alert's Delete account (from build
      3; Cancel there keeps the account). It reads "Your account
      has been deleted", the app is an empty guest, and signing in with the
      same email fails. Force-quit and relaunch: the Warmup opens, as on a
      fresh install, and Share has no Warmup card (2026-11-09: deletion now
      clears the Warmup and practice).
- [ ] **Coach as a Plus guest** (needs Plus on the device, so it waits on a
      dev build): signed out, the Coach panel says "Sign in to use Coach"
      rather than offering a request that would fail.
- [ ] Resolve it: yes/no + reflection saves.
- [ ] Insights updates immediately after resolving.
- [ ] With fewer than 20 resolutions, Insights shows **progress toward the
      threshold**, not a headline score. This one matters —
      "never present a number built on noise" is a core principle.
- [ ] The calibration curve renders, with the dashed perfect-calibration
      diagonal.
- [ ] History filters by category.
- [ ] Share → identity card, This week, This year all render and export.
- [ ] The theme picker shows locks on the Plus themes for a free user, tapping
      one opens the paywall, and the free theme still exports a full-quality
      card.
- [ ] You's switches work; Coach is **off** by default, usage stats **on**.
- [ ] Insights shows **one** Plus teaser card for a free user (Coach + Trends in one
      card, "Your score, curve, badges and cards stay free"), and tapping "See Plus"
      opens the paywall. (Changed 2026-09-29: it used to be two grey slabs.)
- [ ] As Plus (after D2): Trends renders months and categories, and "Export CSV"
      produces a file the share sheet accepts. Open it in a spreadsheet and
      confirm a title starting with `=` shows as text, not a formula.
- [ ] You → Fairly Sure Plus opens the paywall.
- [ ] The paywall lists annual first with its trial, then monthly, then
      lifetime (after Batch B; before it, it shows the unavailable state).
      Annual is **preselected** (filled radio), there is **one** purchase button
      whose label follows the selected plan, and a Today / In 1 month timeline
      shows only while a plan with a trial is selected.
- [ ] **Annual reads "$34.99 a year after 1 month free"** (from build 3; build 2 read "1
      month free, then $34.99 a year"), with a "1 month free" pill beside its name and
      "No free trial" under Monthly — one *month*, not "30
      days". If it says days, the store reported an unstructured period and
      the fallback fired; check the offer's configured unit.
- [ ] **The trial terms line is present** under the plans: the trial turns
      into a paid subscription, cancel at least **24 hours** before it ends.
      That 24-hour figure is Apple's actual rule, not ours — without it the
      screen promises something the platform doesn't do.
- [ ] Nothing in Log → Resolve → Insights → Share ever hits a paywall.

**Report:** which boxes failed, with a screenshot for anything visual.

### C2. UI redesign pass (added 2026-09-28)

What changed is summarised in `docs/design/BUILT_LOG.md`. Check on an
iOS simulator or phone as well as web — web can't show SF Rounded, haptics or the
notification placeholder.

- [ ] **Buttons** are capsules. The one filled button on a screen is ink (light
      with ink on it in Dark, D33); others are white with a grey outline. The tab
      bar tint is ink.
- [ ] **Resolve:** the screen opens with "On {date} you said **N%**", then the
      prediction, then "Did it happen?". **Yes and No look identical** (same white
      capsule, same width). Nothing is red.
- [ ] **Today, fewer than 20 resolved:** no big number at the top. A "Calibrating" bar
      with 20 segments: solid = resolved, dashed/tinted = open predictions, hollow =
      to go. The text under it adds up.
- [ ] **Today's list** is grouped "Ready to resolve · N", "Next 7 days · N", "Later · N".
      A prediction past its due date sits under Ready to resolve with **no amber
      and no word "Overdue"**.
- [ ] **History** cards say "Happened" / "Didn't happen" / "Not scored" — no ✓ or ✗.
      With nothing resolved, the empty state is a plain sentence, not grey italics.
- [ ] **Log:** chips read "Tomorrow", "In a week", "In a month"; the line below
      reads "Due Monday, 5 Oct" (your locale's format). No chip or tinted band
      appears at any confidence (the integrity bonus was dropped, D23). The
      Prediction box has a visible border.
- [ ] **Insights, fewer than 20 resolved:** the same Calibrating bar; section titles in
      sentence case, not ALL CAPS.
- [ ] **Share → This week:** a line like "You said 40–60% once. It happened.", a
      progress line toward your first score, and a dashed rounded-square badge icon
      with "Tracker in {category}: N to go". Tap **Share my recap** on a phone and
      confirm the icon appears in the exported image.
- [ ] **Coach (Plus + signed in):** each insight has an × that hides it; one line
      under the cards says the Coach "can be wrong". Most cards lead with a big
      number and what it counts ("55% · came true in finance"); check it against the
      Insights chart above.
- [ ] **Resolution reminder (device):** title "Did it happen", body "{title} · You
      said N%". Then turn on the iPhone's Settings → Notifications → Show Previews → *Never* (or
      *When Unlocked* with the phone locked): the reminder must read "A prediction
      is ready to resolve", not the prediction text.
- [ ] **Weekly digest (device):** title "Your week ahead"; no mention of a streak.
- [ ] **Dynamic Type at the largest size:** Resolve, Today and Log still lay out with
      nothing clipped.

Added 2026-09-29 (second pass):

- [ ] **Confidence control (Log and Warmup):** a big "70%" with "about 7 times in
      10" beside it, a slider that clicks every 5% (**feel the haptic tick on a
      phone**); no tinted band on Log (the integrity bonus was dropped, D23). ±5 still
      work. VoiceOver: the whole control is one element; swipe up/down changes it.
- [ ] **Resolve is a sheet** on iOS (grabber, ~¾ height) and closes back to Today.
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
- [ ] **Insights chart:** a sentence title above it ("Your curve so far", or once
      unlocked with ≥ 10 in a band "You're overconfident at 80–100%"), warm/cool
      tinted regions labelled Overconfident/Underconfident, coloured dots with
      "n=…", a five-box coverage row, and "Show as table".
- [ ] **Warmup verdict:** the chart line draws in and the dot(s) appear after it,
      and a single firm tap lands with the last dot (no score, no count-up since
      D20). With Reduce Motion on, no drawing, but the tap still fires. "Share my
      result" opens Share showing the **warm-up card** ("5 of 10 right", "I was 77%
      sure. How sure are you?") — test on a fresh install or after erasing the
      device's data, before any prediction resolves.
- [ ] **Badges** are drawn emblems (dashed square for Getting started, filled graphite for
      Forecaster, ink for Sharp, …), not emoji, in Insights and on the identity card.
- [ ] **Icons:** SF Symbols in the tab bar and on category chips/cards on iOS;
      Ionicons on Android/web.
- [ ] **Buttons** shrink slightly when pressed (Reduce Motion: they dim instead).
- [ ] **Hero rating** (once unlocked) rolls to its new value after a resolution
      changes it, and does *not* re-roll when you just switch tabs.
- [ ] **Share → Share as text:** pastes as "My calibration · Fairly Sure", your
      headline, and (once unlocked) a row of five coloured squares with the score.
      No prediction titles.
- [ ] **Paywall** (after Batch B): Annual preselected, one purchase button whose
      label changes with the plan, Today / In 1 month timeline for the trial.
- [ ] **Insights, free user:** one "Fairly Sure Plus" card instead of two "See Plus"
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
      happened / it didn't happen" with a neutral glyph; "Change answer" switches it
      to the other answer in place (D34), and History and Insights count only the
      new one.
- [ ] **Added 2026-10-05 (all web-verified; a glance on the phone):** Today shows
      "Sharp in health" with its emblem under the rating once a category is past
      Getting started, and tapping it opens How scoring works at Badges (D27). "How is
      this scored?" under the Insights rating (and You → How scoring works) opens a full-height sheet that
      scrolls and closes. The paywall has a × at the top right, clear of the
      notch. History shows saved reflections on their cards and hides its
      filters until something is resolved. While calibrating, Today and Insights say
      when the next one comes due. You's links include "Terms of use".
- [ ] **Added 2026-10-05, steps 46–51 (all web-verified; a glance on the
      phone):** Log's Save is dimmed until the prediction has a title. A badge
      row short on both counts names both ("20 more resolved and a score above
      85 → Sharp"). The weekly and yearly cards say "6 happened. You expected
      about 4." where they used to say "86% came in". Tapping through the
      Warmup without moving the slider gives "You said 75% on all 10". On the
      paywall, each price names its period and Annual shows "Works out to …
      a month." in smaller type (check it against the real App Store price).
      On Insights, tapping a filled range under the chart opens History with
      "You said 80–100% ×", and the count matches the chart's subtitle.
- [ ] **Evening reminder (added 2026-10-05, step 60):** log a prediction due
      tomorrow; the reminder should arrive at 19:00 tomorrow, not at noon. If
      the phone had reminders queued before this build, relaunch once and
      check they now say 19:00 (You lists no queued reminders, so
      wait for one).
- [ ] **Streak (added 2026-10-05, step 61; web-verified):** after one log or
      answer today, Today's streak row says "Today counts."; after three, "Today's
      goal met." with three filled dots (D17). VoiceOver reads it as one sentence.
- [ ] **Streak checkpoint (added 2026-10-06, step 64; web-verified on Today):**
      on day 7 (or 30, 100…) the first log or answer turns Today's streak row
      grey-tinted with "A full week. Next milestone: 30 days". If it was an
      answer, the Resolve sheet shows the flame card ("7", "A full
      week", "Next milestone: 30 days") above the range line; Done and the reflection box
      stay reachable in the medium sheet. **From build 4 (step 194) it moves:** the card
      springs in, the number rolls from 6 to 7, the flame pulses once, and the phone taps
      once (a firm tap at 7 and 30; the success pattern and a short burst of confetti at
      100 and 365). After a log instead of an answer, Today scrolls to the streak row and
      the row does the same. It plays once that day: reopening the app doesn't replay it.
      With Reduce Motion on, a short fade and the tap only. With "Streak and daily goal"
      off, nothing. Easiest to see without waiting a week: there is no shortcut in a
      TestFlight build, so this waits for a real day 7.
- [ ] **The streak row (step 193, build 4):** before anything is logged or answered
      today, the flame is an outline; after the first one it is filled. The day count is
      larger than the words after it. The three dots have "Today's goal" under them. At
      the largest text size the row still reads and nothing is cut off.
- [ ] **The 2026-10-06 batch (steps 65–71; web-verified):** a run of three
      ends on "3 answered. 2 happened. You expected about 2." with the streak
      row; Sign in's round × sits clear of the notch; on an SE or mini (320pt)
      "80–100%" never splits in the Insights title (word joiners on iOS) and
      "then $34.99 a year" stays whole; the Warmup answer key reads one stop
      per question in VoiceOver ("Which is deeper? Pacific. You picked
      “Atlantic”, 90% sure…").
- [ ] **The second 2026-10-06 pass (steps 72–78; web-verified at 375 × 667):**
      on an iPhone SE, the Warmup's last answer opens the verdict at its top,
      with the score counting up in view; after a save, Log opens on an empty
      title field, not at Save; How scoring works keeps "0–20%" and the other
      bands whole; the paywall's "Restore purchases" is a text link between the
      CTA and "Not now", and still restores.
- [ ] **The 2026-10-07 batch (steps 79–84; unit-tested, not yet seen on web):**
      the tab bar reads Today · Insights · History · You; the ink "+" sits
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
- [ ] **Dark mode (steps 85–86; web-verified):** the typeface is Instrument Sans
      since D33 (the next box). Switch the phone to Dark: every tab, sheet, the
      chart, the badge chips and the switches read clearly, the status bar text
      turns light, and the tab bar and headers go dark with the rest. Export a
      card in Dark and in Light: the PNGs match.
- [ ] **The Instrument direction (D33, step 136; web-verified):** in a new build,
      every screen is set in Instrument Sans with real Medium, Semibold and Bold
      faces (not one weight faux-bolded), which shows iOS picks each weight from
      the family. Today opens with "Sharp in health" left-aligned over the needle
      gauge; open predictions are one grouped list with a confidence scale on each
      row. No indigo or violet anywhere: actions and selected chips are ink (light
      in Dark), badge chips a grey ladder with Oracle gold, the Sharp emblem's
      ink face visible on its chip. On Share, the card preview has a thin edge
      in both appearances (the light recap on This week, Midnight in Dark) that
      the exported PNG doesn't carry. The new icon and splash are ink.
- [ ] **Playtest fixes (step 138; web-verified):** on Log, a long prediction
      wraps and the field grows a line at a time, with no extra space above the
      first line (iOS pads a multiline field on its own); Return reads Done and
      closes the keyboard without a line break. With Reduce Motion on, a disabled
      Save is dimmed. At the largest Dynamic Type sizes the coverage chips on
      Insights break after the dash with nothing cut to "…", and the streak row
      wraps between words.
- [ ] **Custom categories (D39, step 144; web-verified, re-checked by the owner on web 2026-11-03):** in You → Categories,
      rename Finance to "Money", add "Grad school", hide Social. Log offers Money
      and Grad school and no Social; Insights, History, the card and This week say
      "Money". Force-quit and reopen: all three kept.
- [ ] **Category icons (D40, step 146; web-verified):** in You → Categories, tap
      Health's icon and pick 🏃; tap Finance's icon → Choose a picture. iOS should ask
      for photo access once with "Fairly Sure uses a picture you pick as a category
      icon. It stays on this phone.", show its square crop, and the row should show
      the picture with rounded corners. Check Today's cards, Log's chips and Insights'
      badge rows show both, in light and dark, and that the share card is unchanged
      (it draws no category icons). Type "ok" in "Or any emoji": Use stays off. Force-quit and
      reopen: both kept. Use the default: the symbol is back.
- [ ] **Guest funnel counts (D43, steps 150 and 186):** migration 007 is applied
      and guest counts are sent (2026-11-16). On a
      fresh install, signed out, finish the Warm-up and foreground the app
      again: `select name, count(*) from guest_analytics_events group by 1`
      shows `warmup_started` and `warmup_completed`, and the rows have no
      user column. Turn Usage stats off, do it again: nothing new arrives.
- [ ] **Custom categories sync (D39):** 006 applied (2026-11-03), so a prediction
      in an added category syncs, its id only. Left: sign in on two
      phones and check a prediction filed under an added category reaches the
      other. The names stay on each phone (not synced yet): the second shows
      "Other" until it's named there.
- [ ] **Cold start (added 2026-10-05, step 59):** force-quit and open the
      app. The ink splash should fade straight into Today, with no white
      screen and spinner between. On a fresh install it should fade into the
      Warmup without Today showing first.
- [ ] **Empty confidence (added 2026-10-05, step 54; web-verified):** on the
      Warmup and on Log the readout says "—% not set yet" and the thumb rests
      grey at 50% (the middle on Log, the left end in the Warmup; D49). On the phone: tapping the track jumps the thumb
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
- [ ] **VoiceOver pass (added 2026-10-05, steps 41–44):** You reads
      "Notifications, switch, on" (and a double-tap toggles it); the Insights
      rating reads "Calibration rating, 92 out of 100"; a badge row reads
      "Health: Sharp. 45 more resolved to reach Oracle"; in the Warmup, each
      new question is spoken after Next.
- [ ] **Log it again (added 2026-10-04; web-verified):** after Yes or No on a
      single Resolve, **Log it again** closes the sheet and opens Log with the same
      title, category and lead time, and the confidence empty. On the phone: the
      sheet closes cleanly and Log is the sheet showing.
- [ ] **Answer all (added 2026-10-04; web-verified):** with three or more ready,
      Today shows **Answer all N**. It opens a sheet that steps through them ("1 of
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
- [ ] **You's switches** are ink when on (not green); in Dark the track is
      light and the thumb dark.
- [ ] **Share → Shape:** "Post (3:4)" and "Story (9:16)" reshape the card, with a
      large emblem and the text centred. Export each and post the Story to an
      Instagram/Snapchat story draft: nothing important under the top bar or the
      reply field.
- [ ] **Share → On the card** (with 2+ categories): tapping a category takes it off
      the card; the last one can't be removed.

Added 2026-09-30 (the last three commits, `7fd1aba`..`d69ba54`):

- [ ] **Rating bar** (once unlocked, Insights): a thin bar under the number
      with ticks at 70 / 85 / 90 (Today's bar has none since D59). Today adds a one-line read ("You're overconfident
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
- [ ] **VoiceOver headings (step 134):** on Insights, the rotor set to Headings
      steps through the chart's takeaway, Category badges, Coach or the Plus card,
      and Trends; the paywall, sign-in and delete screens each start on a heading.
      On Log a due-date chip reads "Due in a week, selected, 2 of 4".
- [ ] **Dynamic Type at the largest Accessibility size:** Today, Insights, Log and
      the details sheet still read top to bottom with nothing clipped (the web
      build can't scale text, so this was never checked; research/debiasing-2026-10.md §2).
- [ ] **A prediction's own record (D32, step 135):** on Log, type a title already
      answered, with the iPhone keyboard (Smart Punctuation turns ' into ’, as in
      "I’ll"): the line under the field gives its counts. After an answer, "Log it
      again" shows it at once, and VoiceOver reads it right after the Prediction field.

Added 2026-11-19 (security review round 7; JavaScript only, so a reload of a development
build that carries it, or a TestFlight build from the final commit):

- [ ] **A delete counted from the day after it was logged:** log a prediction due in a week.
      The next day open it → Delete: "Delete this prediction? You logged it before today,
      so Insights will count it as deleted. This can’t be undone." Delete it; Insights →
      More about your record: "1 prediction was deleted after it was answered, after the day
      it was logged, or once it was due. Only this phone keeps this count." One logged and
      deleted the same day, not yet due: "Delete this prediction? It won't count anywhere,
      and it can't be undone.", and the count doesn't move.
- [ ] **New words don't reset that day:** log one in one category, due in a week. The next
      day, Edit: change its words and its category, Save. The day after, Answer it now, Yes:
      Insights → More about your record: "1 scored answer was moved to another category,
      before or after it was answered. Only this phone keeps this count." (Until round 7 the
      rewording made that day count as the day it was made, and nothing was counted.)
- [ ] **Moved back home, counted once:** on the eve of the due day of a prediction logged on
      an earlier day, move it to another category (Edit says it's counted), Answer it now,
      then within the day move the
      answer back to the first category: Insights shows the late change once and no moved
      answer. Under an answer's category chips the hint reads "Insights counts a scored
      answer that ends up in a different category from the one it had at the end of the day
      it was logged. A category change made while it was open, from the day before its due
      day but not on the day it was logged, is counted once, as a late change."
- [ ] **Two phones, a delete that saw no answer (optional):** two phones signed in to the
      same account, one prediction open on both. On phone B, answer it and let it sync. On
      phone A, in Airplane Mode, delete its open copy; then reconnect A and pull to sync: the
      prediction comes back on A with B's answer, and the row is still in the Supabase
      dashboard. (Round 6 would have removed it from the server.)
- [ ] **The Warm-up's line says what the counts are for:** on a fresh install, the Warm-up's
      first screen reads "Fairly Sure sends a few usage counts, with no account or device id,
      to see how the app is used. You can turn this off here or in You." above its switch.

Added 2026-11-16 (step 187, the launch page; in build 3):

- [ ] **The launch page (step 187):** swipe the app away and open it: the dark splash with
      the mark stays, "Fairly Sure" fades in under the mark without the mark moving, and
      after about a second it fades to Today (or the Warm-up on a fresh install). Coming back
      from the Home Screen without swiping it away shows no launch page.
- [ ] **The lock is the launch page (step 187):** with the app lock on, open the app: the same
      dark page with the mark and the name, "Locked. Unlock with Face ID…" and a light Unlock
      button under them, readable in the light and the dark appearance; the app switcher shows
      the mark and the name only.
- [ ] **The paywall's top (step 187):** You → Fairly Sure Plus: the title and the × sit below
      the clock and the Dynamic Island, not under them.

Added 2026-11-16 (step 185, the phone's 24-Hour Time switch; in build 2):

- [x] **The 24-hour clock (step 185):** with 24-Hour Time on (Settings → General → Date & Time),
      You reads "at 19:00" under Due-day reminders and "Sunday at 18:00" under Weekly digest,
      and the practice moments read "8:00", "12:30", "20:30". With it off: "7:00 PM". (The app
      reads the switch at launch: close and reopen it after changing the setting.)
      **Confirmed 2026-11-16 on TestFlight build 2** (the owner's screenshots): times follow
      the 24-Hour Time switch.

Added 2026-11-15 (step 184, moved answers counted; in build 2):

- [ ] **A moved answer is counted (step 184):** answer a prediction logged on an earlier day,
      open it in History and look under Category: "Insights counts a scored answer left in a
      different category from the one it was answered in." Move it to another category, then
      Insights → More about your record: "1 scored answer was moved to another category after
      it was answered. Only this phone keeps this count." Move it back: the line is gone.
      (From round 6's build the line reads "1 scored answer was moved to another category,
      before or after it was answered. Only this phone keeps this count.", `refiledLine`,
      and from round 7's the hint under Category is the two sentences quoted in the
      2026-11-19 block above, `REFILE_COUNTED_HINT`.)

Added 2026-11-15 (step 182, TestFlight hardening, and the TestFlight prep; in build 2):

- [x] **The TestFlight build's paywall (step 182):** You → Fairly Sure Plus lists the three
      plans with the store's prices. If it reads "Plus isn't available on this build yet",
      the build has no RevenueCat key or has the Test Store one (`test_…`): set the `appl_`
      key in the EAS production environment and build again. It never crashes on it.
      **Confirmed 2026-11-16 on TestFlight build 2** (the owner's screenshots): the three
      plans load at $34.99 a year, $4.99 a month and $79.99 lifetime.
- [ ] **Sign-in says what it sends (step 182):** You → Sign in shows "Once you're signed in,
      a record of which features you use, including what's already on this phone, is sent
      with your account…" and a Privacy policy link that opens the policy. Turn Usage stats
      off in You: the link stays, and since D71 (d) the sentence doesn't go but changes to
      "Usage stats are off, so no record of which features you use is sent. …" (D5 has the
      full check; before D71 (d) the sentence went).
- [ ] **Erase clears the lock screen (step 182):** with "Show the words in reminders" on, let a
      due-day reminder arrive and leave it in Notification Center; then You → Erase your data
      on this phone. The reminder is gone from Notification Center. Once more, locking the
      phone the moment Erase finishes: the clear is no longer waited on (review of
      2026-11-15), so check it still goes.
- [ ] **Account deletion clears the lock screen too (step 182):** the same as the Erase check,
      signed in, with You → Delete account. A "your free month ends…" notice, if one is
      there, stays: the subscription isn't cancelled by deleting the account.
- [ ] **The phone's clock in another language (step 182):** with the iPhone in Español (EE. UU.)
      and Settings → General → Date & Time → 24-Hour Time on, the reminder times in You and
      "Until … today" on an answered prediction read as 24-hour ("19:00"); with it off,
      "7:00 PM". If you can, once with the iPhone in فارسی (Persian), which writes its own
      digits: the times are in Latin digits and follow the 24-Hour Time switch (tested
      under Node only).
- [ ] **A move says what follows (step 182):** inside 24 hours of an answer, with the rating
      unlocked, move it to another category in its details: "Each category's score and badge
      now follow where this is filed…" shows, and VoiceOver says "Moved to …" with it.
- [ ] **A correction on the unlocking answer (step 182):** on `threshold`, answer the one due
      today (the unlock card shows), then tap "Change to: …": the card goes and the line
      under the answer ends "Your rating and badges now follow this answer, so they may
      have moved." VoiceOver says the same after "Changed to: …".
- [ ] **Help and version (TestFlight prep):** You → Help and support opens the support page,
      and "Fairly Sure 1.0.0" sits under those links.

Added 2026-11-15 (step 180, the app lock and units by Region; native, in build 2):

- [ ] **Before these checks:** if you have turned on iOS's own Require Face ID for Fairly Sure
      (touch and hold the icon), turn it off, or every return asks twice.
- [ ] **The app lock, turning it on (step 180):** You → "Lock with Face
      ID" is off. Tap it: iOS asks once whether Fairly Sure may use Face ID, then checks your
      face; the switch turns on. Tap it again and cancel the prompt: it stays on, with no
      message. Tap it and pass: it turns off. Turn it back on for the checks below.
- [ ] **The app lock, at launch and on return (step 180):** close the app from the switcher and
      open it: "Fairly Sure" and "Locked…" show with **Unlock**, and nothing asks until it is
      tapped (D74, 2026-11-21; as first built, Face ID ran by itself); tap it, pass, and the
      app opens on Today. Go to the Home Screen and back: the same. Cancel the prompt: the
      lock screen stays with **Unlock**, no prompt reopens by itself, and tapping Unlock asks
      again (this is the
      check that the button takes a tap inside the overlay). Pull Notification Center down and
      let it go: the app's name covers the screen and it does **not** ask for Face ID.
- [ ] **The app lock, in the app switcher (step 180):** with a prediction's words on Today,
      swipe up to the app switcher: Fairly Sure's picture shows its name, not Today. Open Log
      (or a prediction's details), type a few words, and swipe up again: the picture still
      shows the name, not the sheet. Note which of the two fails, if either.
- [ ] **The app lock, with a sheet open (step 180):** open Log, go to the Home Screen and come
      back: the lock screen is over the sheet, and after Face ID the sheet is as you left it,
      words included, with no keyboard over the lock.
- [ ] **The app lock, the passcode as the way in (step 180):** cover the camera so Face ID
      fails: iOS offers "Enter Passcode", and the passcode opens the app **once, with no
      second prompt** (this is the one check that shows whether the passcode screen sends the
      app to the background; report it either way). Then Settings →
      Fairly Sure → Face ID off: Unlock still asks (for the passcode), and the app does
      **not** open without one. Turn Face ID back on.
- [ ] **The app lock, VoiceOver (step 180):** with VoiceOver on and the app locked, swiping
      reads "Fairly Sure", the locked line and Unlock, and nothing from the screen behind.
- [ ] **The app lock and a reminder (step 180):** with the lock on, tap a due-day reminder: the
      lock screen first, then the question; do it once with the app killed first. With "Show
      the words in reminders" on and the lock on, a new reminder has no Happened / Didn't. Turn
      the lock off, let a reminder with the buttons arrive, turn the lock on, then tap Happened:
      the lock screen shows; after Unlock and Face ID the app shows the question, with
      nothing recorded.
- [ ] **The app lock at the largest text (step 180):** Settings → Accessibility → Display &
      Text Size → Larger Text, all the way up. Lock the app and cancel the prompt: the screen
      scrolls, and Unlock can be reached and tapped. In dark appearance too.
- [ ] **The app lock, "Don't Allow" (step 180):** on a fresh install, turn the lock on and
      answer Don't Allow to iOS's Face ID question: iOS asks for the passcode instead and the
      switch turns on, or stays off with "That didn't go through". Note which. Then the row
      should read "Lock with iPhone passcode".
- [ ] **The app lock and iOS's own sheets (step 180):** with the lock on, open Sign in with
      Apple, start a purchase, and restore: while each sheet is up the app's name may show
      behind it, the sheet works, and nothing asks for Face ID in the middle.
- [ ] **The app lock over the paywall and an alert (step 180):** open Fairly Sure Plus, go to
      the Home Screen and come back: the lock is over the paywall. Then open Log, type a word,
      swipe it down so iOS asks about discarding, and go Home and back with that question up:
      note whether the question shows over the lock.
- [ ] **The app lock and the side button (step 180):** with the app in front, press the side
      button, then unlock the iPhone: the app asks again.
- [ ] **The app lock, no passcode (step 180; optional, it means removing your passcode):** not
      run unless you choose to. With the lock on, remove the iPhone's passcode and open the app:
      "This iPhone has no passcode now…" and Continue, the app opens, and the switch is off.
      Untested if skipped.
- [ ] **The app lock off (step 180):** with the switch off, nothing covers the app in the
      switcher and nothing asks for Face ID.
- [ ] **Feet and miles by Region (step 180):** Settings → General → Language & Region → Region
      United States: the Warm-up's answer key shows feet and miles beside the metric figures.
      Region Germany with the language still English (US): metric only.

Added 2026-11-14 (step 181, the release candidate; a reload is enough):

- [ ] **Dates in English (step 181):** set the iPhone's language to Dutch or Spanish (Settings →
      General → Language & Region) and open the app: every date reads in English in the
      order that language uses ("Sun 15 Nov"), and times on the phone's own clock (24-hour
      if the phone shows 24-hour), on Today, Log's Save button, Resolve, History, You's
      reminder times and a due-day reminder. Back in English (US): "Sun, Nov 15" and
      "7:00 PM", as before. Whether the iPhone already gave an English-only app English
      dates is unknown (the finding came from the web build): either way the result should
      be English, so note any screen where it isn't.
- [ ] **A badge gained or lost is spoken (step 181):** with VoiceOver on, answer the prediction
      that unlocks a badge (the `threshold` profile): after "Recorded: it happened" it says
      the badge. On the `return` profile a badge can fall on the next answer: it says "Back to
      Tracker in health…".
- [ ] **Share in the first week (step 181):** on `first-week`, Share opens on the Warm-up card
      with "Show my category card" under it; "Got a friend's card?" explains a friend's
      warm-up card first. On `long-time`, Share opens on the category card as before.
- [ ] **The chart with one or two answers (step 181):** on `first-week`, Insights' chart shows
      no "Overconfident" or "Underconfident" words; on `long-time` it does.

Added 2026-11-14 (step 179, round 22's ten fixes; a reload is enough):

- [ ] **Hide the words, everywhere read-only:** with a category you named (or renamed) and the
      switch on, Insights' badge row and "Furthest off" read "Your own category"; Share leaves it
      off the card with "Categories you named stay off the card…"; the week recap has no "Show
      prediction titles" switch. Switch off: it's all back, nothing unticked. Rename every
      category you've answered in: the card still shows, with your rating and "N categories not
      shown". A built-in given only an emoji stays on the card, and on Insights and Today it
      keeps its name with its usual symbol, not the emoji. Untick every category on Share: the
      card keeps your rating and "N categories not shown"; tick one back.
- [ ] **Another number keeps your edit:** Edit a prediction made today, change its words, tap
      "Use another number": Log opens with the new words, no "Discard changes?" sheet.
- [ ] **The unlock names its badge:** at 19 scored answers all in one category, answer the 20th:
      the unlock card ends "New badge, too: … in …".
- [ ] **An answer run across a kill:** with 5 ready, Answer all, answer 2, force-quit the app,
      reopen, Answer all 3: "3 of 5", and the end summary counts all 5. Closing a run with × or a
      swipe and opening it again starts fresh.
- [ ] **Words:** the friend fold explains the score and the ranges; Edit says one thing on the
      day it was made; Insights' fold reads "Show less" once open; a badge card's two sentences
      end with a full stop; on a phone set to Spanish, Insights' "comes due …" line has one
      full stop (dates are in English since step 181); How scoring works opened from Today has
      a "Your rating" heading for VoiceOver.

Added 2026-11-13 (step 178, D62, the calls after round 21; a reload is enough):

- [ ] **What perfect calibration scores:** with the demo data, Insights under the rating reads
      "Even perfectly calibrated, N answers like yours would typically score about …" and where
      the rating sits; Today's rating opens How scoring works with the same line on top.
- [ ] **Another number:** log one, open it, Edit: "You made it today, so you can still use another
      number." and "Use another number"; it opens "Another number" with the words, category and date,
      and the number empty. Save: Today shows one card, with the new number; Insights counts no
      delete. With unsaved changes in Edit, the sheet asks first. A day later the button is gone
      (from round 7's build, a delete that day is counted: the 2026-11-19 block).
- [ ] **Before 20:** at 10–19 scored answers, Today and Insights show "First look: you said
      about …%, and … of … happened. Too early to rate." (D76's words) Before
      the first answer, the practice row reads "While you wait: today's practice".
- [ ] **Hide the words:** You → "Hide the words" sits on one line with its switch at 375. On, a card
      in an added or renamed category reads "Your own category" with a plain folder symbol,
      Today's identity line and History's filter chips name no such category; VoiceOver says
      "Your own category".
- [ ] **Trial only when eligible (Batch D, sandbox):** with a sandbox tester who has had the free
      month (buy, cancel, let it lapse), reopen Plus: the button reads "Subscribe for … a year", no
      "1 month free" anywhere, and Apple's sheet agrees. A fresh tester still sees the trial.
- [ ] **Late changes:** move a date the day it was logged: no warning, nothing counted. On the eve,
      change a prediction's words: Edit says it's counted; Insights → More about your record says
      "…moved later, its words changed, or its category changed, within a day of its due day".
      From round 5's build (D69 (e)): on the eve, change an open prediction's category: a note
      under the chips says "It's due tomorrow, so changing its category is counted on Insights…"
      before Save, and the count goes up once.
- [ ] **Insights fine print:** "More about your record" opens the Can't tell line and any counts;
      the Brier line appears there only from 50 scored answers.
- [ ] **Recaps:** answer the 20th in a category: the week's recap leads "New this week: … in …"
      with its emblem; the year card shows "Calibration …/100, give or take …".
- [ ] **Small things:** a badge earned says "New badge:" and "Badges follow how well your numbers
      match what happens…", after Yes and No alike; ±5 with
      VoiceOver speaks "75%, about 3 times in 4"; in an answer run the "Can't tell" notice goes once
      the next card is answered; a fresh install interrupted on the Warm-up result finds "Your
      warm-up: … right. See your result" on Today; the paywall button reads "Start 1 month free,
      then … a year"; an answered prediction's details offer "Add a note"; Share's three tabs stay
      on one row at AX5; the chart caption says what orange, blue and green mean.

Added 2026-11-13 (step 177, D61 and round 20's fixes; a reload is enough):

- [ ] **Hide the words:** You → "Hide the words on Today and History" (off by default). On:
      every card on Today and History reads "Words hidden. Open it to see them." with its
      category, number and date, and no note; tapping one shows the words in its details or Resolve.
      VoiceOver reads the hidden line, never the title. Off again: the words are back.
- [ ] **A new category from Log:** Log → "+ New category" → type "⚽ Football" → "Add and
      choose it": the chip appears chosen with ⚽ as its icon and "Football" as its name; the keyboard doesn't cover the
      field or the buttons; Save still says the date. A name already taken says so and chooses
      nothing. The same from an open prediction's Edit.
- [ ] **Warm-up, fresh install:** the first screen reads "How sure are you, really?" and what the
      app is for; the first questions are places and years, the atomic-number one later. A no-lean
      result reads "Your numbers expected about … right, and you got …".
- [ ] **Share keeps the Warm-up card:** with the demo data after a Warm-up, Share → "Show my
      warm-up card" shows it and shares it as an image; "Show my category card" goes back; under
      the Warm-up card, a friend's squares are explained.
- [ ] **Small fixes:** an answer run's "Can't tell" says "Last one recorded: can't tell." on the
      next card; You's wordless-reminder example is in the phone's date order; Edit says to delete
      and log again for another number; the chart's "Overconfident" sits over a grey bar, not under
      it; one answer from unlocking, Today shows no "At your recent pace" line.

Added 2026-11-13 (step 176, D60, the owner's picks after round 19; a reload is enough):

- [ ] **Reminders without the words:** You → Due-day reminders → "Show the words in reminders"
      is off by default. Log one due tomorrow (or move the reminder time a few minutes ahead and set a due-today
      one from yesterday's demo data). On the lock screen it reads "Your prediction from … · You
      said N%", no title, and no Happened / Didn't (a tap opens the question). Back on, the next
      one shows the title and the buttons. Flip the switch quickly a few times: one reminder each.
      With iPhone's Settings → Notifications → Show Previews at "When Unlocked", the locked screen
      shows "A prediction is ready to answer".
- [ ] **A badge that falls:** in the demo data, answer a high-confidence No in a category just
      over a badge bar (Insights shows its low end): under the range's box, "Back to … in …: after
      this answer its score's low end is under …". Change answer: the line goes.
- [ ] **An ended streak:** on a spare install, let a short streak lapse (or move the phone's
      date): Today's streak row says "Your N-day streak ended …", no dots; VoiceOver reads both
      lines. Log one: the row is a 1-day streak again.
- [ ] **Can't tell:** its note names a date ("You can still answer it until …"), and VoiceOver
      reads it in the button's label.
- [ ] **Warm-up, first question:** the hint ends "Tap anywhere on the bar to jump to a number.",
      and a tap on the slider's track does jump there; gone from question 4.
- [ ] **Categories:** add "🍸 Nights out": the row shows 🍸 as its icon and "Nights out".

Added 2026-11-13 (step 175, round 19's fixes; a reload is enough):

- [ ] **Log, Pick a date** on an iPhone SE-sized screen if you can borrow one, else the 17 at
      AX3: opening it brings "Due …" and the picker above the Save bar.
- [ ] **Warm-up ±5 with a finger or stylus:** step from 70% to 80%. The −5 / +5 stay put when
      the line under the number wraps.
- [ ] **Answer all** with three due once the rating is unlocked: "One answer nudges it either
      way…" appears under the first card's rating line only.
- [ ] **Erase all data** (guest, on a spare install): the confirmation lists predictions and
      reflections, categories and icons, Warm-up and practice answers, unsent usage stats, and
      says settings stay. After erasing, the reminder time you set is still there.
- [ ] **Round 19 questions for the phone:** what a due-day reminder and the digest show on the
      lock screen (four testers asked); how long a cold start takes on the oldest iPhone you can
      find (the web dev bundle took 10–17 s at 4× CPU).

Added 2026-11-13 (step 174, round 18's fixes; a reload is enough):

- [ ] **Log, first prediction ever** (fresh install): type a title, tap a category with the
      keyboard up: the category takes on the first tap, and the starter ideas go only then.
- [ ] **Answer all** with three or more due: after a long reflection on one card, the next card
      and "All caught up" start at the top.
- [ ] **Today's streak row:** tap it: How scoring works opens at "Your streak", × pinned.
      VoiceOver: "button", hint "Explains the streak, and how to hide it".
- [ ] **Lock screen** (round 18 question): what a due-day reminder shows there, and whether it
      still fires at 7 pm local after changing the phone's time zone.
- [ ] **Arabic phone** (round 18 question): with the iPhone's language set to Arabic, do Today's
      due dates read in Arabic inside the English text?

Added 2026-11-12 (step 173, the owner's picks after round 17; a reload is enough,
SQLite migration 015 runs on launch):

- [ ] **Today's rating:** no 70 / 85 / 90 under the bar. Tap the number, then the
      bar: How scoring works opens with "Your rating is 88. Band by band…" in a
      panel at the top, × pinned. VoiceOver: the bar and number are one stop,
      "Calibration rating, 88 out of 100", hint "Explains what it means".
- [ ] **No badge yet** (the `stress` profile): Today shows "To reach Tracker in …:
      N more scored answers." above the bar; tapping it opens How scoring works at
      Badges.
- [ ] **Share card key** (`long-time`): the line under the strip fits in Post and
      Story, light and dark themes, and is legible in a Messages thumbnail. Share as
      text: the key line follows the squares.
- [ ] **Log, Save and log another:** it appears under Save once the form is
      complete; tapping it keeps the sheet open, "Saved, due tomorrow." at the top,
      the form empty, and VoiceOver says the saved line. At 320 and AX3, Save stays
      put as it appears.
- [ ] **Log draft:** type a title, pick a category and a number, swipe the app away
      (kill it), reopen and tap "+": everything is back under "Kept from before you
      left." Close Log with the × and choose "Discard prediction": the next open is
      empty.
- [ ] **Streak switch:** You → "Streak and daily goal" off: Today's streak row, the
      checkpoint card on an answer, the streak on Insights' count line and the
      recap all go. On again, they're back.
- [ ] **A late due-date move:** open a prediction due tomorrow, Edit, In a week: the
      note "It's due tomorrow, so moving it later is counted on Insights…"; Save;
      Insights shows "1 prediction had its due date moved later…".
- [ ] **US units:** with the phone's region set to United States, the Warm-up's and
      practice's answer key shows feet and miles in brackets; set back to your
      region, metric only.

Added 2026-11-12 (step 172, round 16's fixes; a reload is enough):

- [ ] **How scoring works from Today's badge line** (a record with a badge,
      e.g. `/dev/seed` → Load demo data): it opens at Badges with the × pinned
      at the top, at the default size and at AX3. VoiceOver: the first swipe
      after the × doesn't jump back to the top.
- [ ] **Log, keyboard up:** type a title, then tap a category with the keyboard
      still showing. The keyboard goes down, and the slider and ±5 come into
      view at 320 (an SE in Display Zoom, or the smallest size you have).
- [ ] **Warm-up restored pick:** pick an answer and a number, swipe the app
      away, reopen: the slider is in view, not under Next / Skip. Again with
      Reduce Motion on (no slide).
- [ ] **Answer keys at large text:** at AX2 and AX5, the Warm-up's and
      practice's answer rows put the ✓/✗ and the percent on a line above the
      text, with the text at full width. At the default size, unchanged.
- [ ] **The unlocking miss:** on the 20th answer (the `threshold` profile), answer
      No: under the unlock card, "A 70% call should come true about 7 times
      in 10…". Change answer: the line stays.

Added 2026-11-12 (step 171, the playtest rounds 12–15 fixes; web-verified, a reload is enough):

- [ ] **Saved sign:** save from the "+" on Insights, then on History: "Saved, due
      tomorrow." sits just above the tab bar and goes after about 3 seconds. With
      VoiceOver on, it's heard once, after the sheet has closed. Also after a
      reminder's Resolve over You, then "Log it again" and Save.
- [ ] **Pinned bars at large text:** at AX5, the Warm-up (fresh install) and Log
      at 375 or smaller: Next / Skip and Save move to the end of the scroll instead
      of covering a third of the screen. On Log, fill the form: Save doesn't jump
      in and out of the scroll as "Still needed…" comes and goes. At the default
      size both stay pinned.
- [ ] **Warm-up pick kept:** pick an answer and a number on question 1, swipe the
      app away, reopen: both are still chosen.
- [ ] **The × bar:** on Resolve and an open prediction's details, at both sheet
      heights, light and dark: nothing at the top is hidden under the × at rest;
      scrolled, text passes under a canvas strip with a hairline.
- [ ] **Voice Control:** "Tap plus 5" on Log and the Warm-up; "Tap Sun" on You's
      digest days.
- [ ] **Categories at 320, 390 and 440** with the native switch: the switch stays
      inside the card with a gap from Rename; a long name wraps.
- [ ] **Digest days at 320 and with large text:** four and three on two rows, 8 pt
      apart.
- [ ] **Chart at a few answers:** a first-week record: no "n=" over
      "Overconfident" or on a dot.

Added 2026-11-12 (owner's report from the iPhone 17; a reload is enough):

- [x] **Log's title row clear of the Dynamic Island** (owner, iPhone 17, 2026-11-12: "The island is properly avoided now"): open Log every way in: the
      "+" on Today, Insights and History, the Warm-up's "Make a real prediction"
      (fresh install), "Log it again" from Resolve and from an answered prediction
      in History. Each time "New prediction" and its × sit fully below the island
      and the × closes. Inside the usual sheet nothing moves (the inset is zero
      there). If one way still hides it, say which: that names the cause.

Added 2026-11-10 (steps 167–168; web-verified at 320 and 375, a reload is enough):

- [ ] **Log's Save names the date (D55, step 168):** a new prediction starts on
      Tomorrow, the second one too, and Save reads "Save, due tomorrow"; In a week
      reads "Save, due Tue, Nov 17" in the phone's own date format. Check the pinned
      Save at the default text size, the largest non-accessibility size, AX3 and
      AX5: a long label wraps after "due" or after the weekday's comma, centred,
      never inside the date, and the footer doesn't push the fields off screen.
      VoiceOver reads "Save prediction, due Tuesday, November 17".
- [ ] **Plus with no connection (step 167):** airplane mode, cold start, open Plus:
      the spinner, then "Plus plans couldn't load. Check your connection, then open
      this again." with no flash of it first; online, the sandbox plans load.
- [ ] **Insights' chart to VoiceOver (step 167):** each range ends with where its dot
      sits ("75% is below that range.").
- [ ] **Plain counts (D57, step 170):** at AX5, Insights' two-sided subtitle ("…; about
      40% would have matched. Of 55 at 60–80%, …") and a lean's ("You said about 88%;
      about 60% would have matched.") wrap whole, with "about" kept with its number;
      look where Today's dot sits beside a read that wraps (the row centres it, the
      profile §18 trap, older than this step), and that a read both ways has no dot. On Log at 55% with 5 to 9 answers in 40–60%, the line under the slider ends
      "Too few to read yet." and VoiceOver reads it after the confidence.
- [ ] **A daily habit (D56, step 169):** log "I walk 30 minutes today" in the morning,
      open it and tap Answer it now: one warning with the evening-before advice; Answer
      now opens Resolve with no second note; after Yes (and again after No) the advice
      line has "Log it again, due tomorrow" right under it, and it opens Log in the
      sheet's place with the title and "Save, due tomorrow". In History an answered
      one offers "Log it again, due …", or "Logged again, due …" while the same words
      are open. At AX5 the button labels wrap centred; VoiceOver reads the advice, then
      the button.
- [ ] **Today on a small phone (D48, step 159):** from Today, log a prediction "In a
      month" with several open ones: as the sheet closes, Today scrolls just far enough
      that the new card sits a little above the tab bar. Again with Reduce Motion on (a
      jump, no slide), and from Resolve's "Log it again" (Log replaces Resolve, so
      Today scrolls as Log closes). Log one from History, then open Today: no scroll;
      the same from a reminder's Resolve opened over You. A fresh install's first
      prediction (delete and reinstall, so notifications are unasked): "Want a reminder
      when it's due?" sits under "Your first answer: tomorrow evening", above the card,
      and both stay in view; again at a larger text size (Settings → Accessibility →
      Display & Text Size → Larger Text, a few steps up). With nothing ready to answer,
      the open predictions come before the streak and practice rows.
- [ ] **Marks you can tell apart (D47, D58, step 158):** in dark mode the chart's grey
      luck bars are easy to see, with a visible outline; the share card's strip reads
      "0%" … "100%" with a ring, ▲ or ▼ per range, legible at thumbnail size in
      Messages; with Settings → Accessibility → Display → Color Filters set to
      Blue/Yellow, the card's marks are still told apart by shape. On the demo data
      the two low ranges (5 and 8 answers) are a grey dot on the chart and a small
      grey dot on the card, and VoiceOver on the card says "too few to read yet" for
      both; the exported PNG and "Share as text" (⬜⬜🟩🟩🟧) match. The chart's
      caption ends "A grey dot has fewer than 10 answers, too few to read yet.", and
      in dark mode a small grey dot can be told apart from the grey bar it sits in.
      A fresh install's Warm-up result shows grey dots with that line.
- [ ] **A category's score at 20 (D46, step 157):** a category at 19 scored answers
      shows its plain counts and "1 more scored answer to reach Tracker"; the 20th
      answer brings its score and Tracker together (the step-up card on Resolve).
- [ ] **A reminder after a rewording (step 169):** let a due-day reminder arrive, then
      change that prediction's words in the app, then tap Didn't on the reminder: the
      app opens on the question with the new words and the same-day note, and records
      nothing until you answer.

---

## Batch D — Physical device (~45 min)

Runs on the TestFlight build (or a development build): notifications and RevenueCat are
native modules.

### D1. Notifications
- [ ] **No notification permission prompt at first launch** (changed 2026-10-05,
      roadmap step 38): the Warmup opens with no notification alert over it.
      Apple's age-range sheet, if it appears, is D4 and is not this alert.
      After logging a
      first prediction, Today shows "Want a reminder when it's due?"; **Turn on
      reminders** brings up the iOS alert. Allow it: the prediction's reminder
      is scheduled. On a second install, refuse it: You → Notifications
      shows "Open Settings", which opens the app's page in iOS Settings.
- [ ] **The two new switches (D31, step 131):** under Notifications, turn off
      Due-day reminders: an open prediction's reminder is cancelled (check the
      schedule in a log) and the Weekly digest stays; turn it back on and it
      returns. The same the other way for Weekly digest.
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
- [ ] **Happened / Didn't (D8, step 145):** the same reminder shows Happened
      and Didn't, and no Can't tell. Happened records it and opens straight to
      "Recorded: it happened" (the range line, and a milestone if this answer
      earned one), including from a cold start. Didn't does the same for no.
      Tapping the notification body still opens the question. Answer one that
      was already answered: it does not change. A reminder scheduled by the
      previous build still opens Resolve from its body; after one launch of
      this build the buttons are there too (the category is registered at
      launch; the request is not rescheduled).
- [ ] The weekly digest is scheduled (check
      `getAllScheduledNotificationsAsync` in the dev console, or wait).
- [ ] Turning notifications off in You cancels everything; turning it
      back on reschedules.
- [ ] **Across a relaunch (added 2026-10-05, roadmap step 37):** log a
      prediction due in a few minutes, force-quit, reopen, resolve it before it
      fires: no reminder arrives. Repeat with You → Notifications off
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
- [ ] Sign in with the sandbox tester account (the iPhone's Settings → App Store).
- [ ] Buy the annual plan. The screen says **"1 month free, then $34.99"** and
      Apple's own confirmation sheet agrees. If the two disagree, Apple is
      right and the offer is misconfigured.
- [ ] `isPlus` flips: the Coach upsell on Insights is replaced by the Coach panel,
      and You's Plus row shows "Active".
- [ ] **While the trial is running, `source` reads `trial`** — not `annual`.
      The client maps RevenueCat's `periodType` (TRIAL/INTRO) ahead of the
      product, and the webhook does the same with `period_type`, so a mismatch
      means one of the two paths is wrong. Check You's Plus row or the dev
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
      `monthly` and not `annual` (You's Plus row or the dev console).
- [ ] Cancel the sandbox subscription and let it lapse (sandbox subscriptions
      renew every few minutes); confirm the app drops back to free within one
      foreground.

### D3. Coach end-to-end as a real subscriber
Only possible after D2 and B3 (the webhook is what tells the server you paid).
- [ ] Turn Coach (AI) on in You; tap "Get feedback"; insights render with the
      AI label.
- [ ] Every number in an insight matches a number on Insights.

### D4. Age assurance (iOS 26, a dev build that includes the entitlement)
Needs a signed-in Apple Account. The entitlement is
`com.apple.developer.declared-age-range` in `app.json`. If the build fails to
sign, enable Declared Age Range on the App ID and rebuild. Simulator runtimes
often don't present this API; prefer a device. Since D70 (2026-11-19, the
under-13 rule; JS only, so a reload of the development build carries it) a band
under 13 makes the phone local-only; any other band, or none, locks nothing
(`docs/design/research/under-13-2026-11.md`). Since the D70/D71 review (the same
day, JS only) the app asks Apple at every launch, whatever band is stored, and
on a launch with no band of 13 or over stored yet, sign-in and the Plus plans
wait for Apple's answer. The checks marked "(review)" are for that.
**2026-11-20, the owner: "D4 and D6 pass"**, on that day's builds from `master`
(production 1.0.0 (7) from `590ab75`; development from `defdeb0`). He was asked for
the sandbox "Under 13" check, which the privacy policy's publishing waited on, and
gave no item-by-item results, so only that box is ticked; the others in this
section have no reported result.
- [ ] **iOS 26, first launch:** after the splash, Apple's age-range sheet may
      appear (the app has no sheet of its own). Share a range of 13 or over:
      the Warmup or Today is usable, and nothing is locked. Force-quit and
      reopen: the sheet does not appear again.
- [ ] **Decline:** the app continues as it does today. Nothing is locked, and
      you are not stuck on the sheet. Force-quit and reopen: still not stuck
      (a second sheet, if Apple shows one, still lets you through when you
      decline).
- [ ] **Not signed into an Apple Account, or an older iOS:** no sheet, and the
      app behaves as it did before this check. Web and Android are the same
      (no Play Age Signals call).
- [ ] **Erase your data on this phone:** the next launch can ask again. Until
      then, predictions and the rest of the app are unchanged.
- [ ] **A second launch with an adult band stored (review):** after sharing a
      range of 13 or over, force-quit and reopen. Pass: no Apple sheet, and
      nothing waits: Today is usable at once, You → Sign in opens the form and
      a sign-in starts at the tap, and You → Fairly Sure Plus shows the plans
      without the 5-second pause. Report it if a sheet does appear: the app now
      asks at every launch, and whether Apple answers silently for a band
      already shared is not confirmed by Apple's pages.
- [ ] **After a decline, sign-in and plans still work (review):** on a fresh
      install (or after Erase), decline Apple's sheet, then force-quit and
      reopen, declining again if the sheet comes back. Pass: once the sheet is
      gone, You → Sign in signs you in (it is not left at "Sign-in isn't ready
      yet. Try again in a moment."), and You → Fairly Sure Plus loads the plans.
      Report whether the sheet came back at the second launch.
- [ ] **The paywall during Apple's sheet (review):** on a fresh install (or
      after Erase), force-quit, then open the app by typing
      `fairlysure://paywall` into Safari's address bar, so the paywall opens
      while Apple's sheet is still unanswered. Leave the sheet up for more than
      5 seconds, then look behind it or answer it: the paywall shows "Plus
      plans couldn't load. Check your connection, then open this again." and no
      plan to buy. Share a range of 13 or over, close the paywall and open it
      again: the plans load. (If the deep link doesn't beat the sheet, open You
      → Fairly Sure Plus as soon as the sheet is answered instead and report
      what showed.)
- [ ] **A request that doesn't resolve (review; report only):** if Apple's
      sheet ever stays up, or never comes and sign-in keeps saying "Sign-in
      isn't ready yet. Try again in a moment." for a whole session, note what
      you did before it. Sign-in and the plans are off for that run by design;
      a force-quit and relaunch should clear it.
- [x] **Under 13, in the sandbox (D70; needs Developer Mode, a Sandbox Apple
      Account and iOS 26.2 or later):** iPhone Settings → Developer → Sandbox
      Apple Account → Manage → Age Assurance → "Under 13". In the app, signed
      out, You → Erase your data on this phone (so no band is stored), then
      force-quit and relaunch, and share if Apple asks. Pass: You shows a row
      "Kept on this phone" with its two lines underneath ("Because of the age
      range this iPhone shares with Fairly Sure, everything you log stays on
      this phone…" and where to see the age range in Settings); there is no
      Fairly Sure Plus row, no Coach (AI) or Usage stats switch and no way to
      sign in; Insights has no Plus card; Share shows no locked themes (without
      Plus, no theme picker at all). Type `fairlysure://paywall` into Safari's
      address bar and let it open the app: "Plus isn't offered on this phone"
      with a Close button; `fairlysure://account` shows "No account on this
      phone". Logging, answering, Insights, Share and Export work as usual.
      Force-quit and reopen: still the same (the app asks again each launch;
      Apple should answer from its cache without a sheet). Report whether the
      sheet appeared again, and send a screenshot of You. Then set Age
      Assurance back, Erase, relaunch and share an adult range: the Plus row
      and Sign in come back.
- [ ] **Under 13 while signed in (optional):** on a fresh install, decline
      Apple's sheet (no band is stored, so it asks again next launch) and sign
      in; then set "Under 13", force-quit and relaunch, and share if asked.
      Pass: You keeps Sign out under "Signed in as …" and the line "Backup is
      off on this phone because of the age range it shares with Fairly Sure, so
      new changes stay here…"; Delete account is still at the bottom; Sign out
      asks "Sign out anyway?" if anything changed since, and then works.
- [ ] **The frozen account route by deep link (review):** in that same state
      (signed in, under 13), before signing out, type `fairlysure://account`
      into Safari's address bar and let it open the app. Pass: the title is
      "Backup is off on this phone" (not "No account on this phone"), the body
      is the same "Backup is off on this phone because of the age range it
      shares with Fairly Sure, so new changes stay here…" paragraph You shows,
      and one Close button; no sign-in form. Send a screenshot.

### D5. D71's four calls (2026-11-19; JS only, a reload of the development build)
**2026-11-20, the owner: "D5 through D7 check out"**, on that day's builds from `master`,
with no item-by-item results, so the boxes below aren't ticked one by one.
The support card's checks for D71 (b) and (c) were removed with the card (D73,
2026-11-20); D7 has the one check that replaces them.
- [ ] **Erase removes everything (D71 (a)):** on an account whose Insights →
      More about your record shows a count only this phone keeps (for example
      "1 scored answer was moved to another category…", item 21), sign out,
      then You → Erase your data on this phone. The page's paragraph ends
      "Settings, like reminder times, and whether this phone has Fairly Sure
      Plus stay. You aren't signed in, so nothing here has another copy unless
      an account backed it up. It can't be undone." The alert reads "Erase
      everything on this phone?" and "Nothing here has another copy unless an
      account backed it up. This can't be undone."; afterwards "Your data on
      this phone is gone, including anything left by an account that was signed
      in here before." Sign back in: the predictions come back from the server
      and the count doesn't (it lived only on this phone).
- [ ] **The Erase alert with a count (review):** signed in, with an open
      prediction logged on an earlier day that has already been backed up, turn
      on Airplane Mode and delete that prediction. You → Sign out: it says a
      change hasn't reached the server; choose to sign out anyway. Still in
      Airplane Mode or not, You → Erase your data on this phone → Erase
      everything. Pass: the alert reads "Nothing here has another copy unless
      an account backed it up. 1 change an account made on this phone never
      reached our server and will be lost. This can't be undone." (1 if that
      deletion was the only unsent change; "N changes…" otherwise.) Cancel, tap
      Erase everything again: the same count (it is counted at each tap). If
      you go on, the deleted prediction comes back at that account's next
      sign-in, since its deletion was never sent. Send a screenshot of the
      alert.
- [ ] **The Erase alert's three messages (round two):** the alert's middle
      sentence has three forms. (1) Nothing unsent, the usual case: none, just
      "Nothing here has another copy unless an account backed it up. This
      can't be undone." (2) A count, the check above. (3) The count couldn't
      be read, or took more than 3 seconds: "Nothing here has another copy
      unless an account backed it up. Changes an account made on this phone
      may not have reached our server; if so, they will be lost. This can't be
      undone." Form 3 can't be made to happen by hand; report it if you ever
      see it, with what the phone was doing. In every case: while the count is
      read the **Erase everything** button is greyed out (usually too briefly
      to see) and keeps its label, and the alert comes within about 3 seconds
      of the tap. If Erase ever ends with "Couldn't finish erasing your data.
      Try again.", tap it again and report it.
- [ ] **A guest can buy and restore on a fresh install (round two):** on a
      fresh install (or after Erase), not signed in, answer Apple's age sheet
      with a range of 13 or over (or decline), then You → Fairly Sure Plus:
      the plans load, a sandbox purchase goes through, and Restore purchases
      answers (restored, or nothing to restore) rather than "unavailable".
      Since round two the app holds purchases and restore when RevenueCat
      can't say whether its user is anonymous, so this checks a normal phone
      isn't caught by that. Then the case the change is for: sign in with an
      account that has Plus, set the sandbox Age Assurance to "Under 13" and
      relaunch (the account is frozen), sign out, set Age Assurance back,
      Erase, relaunch and share an adult range, staying signed out. Pass: You
      doesn't show Plus (the earlier account's Plus doesn't appear on the
      guest), and the plans load.
- [ ] **The sign-in screen's switch (D71 (d)):** You → Sign in: the line about
      what goes up with the account has a switch beside it, on. It reads "Once
      you’re signed in, a record of which features you use, including what’s
      already on this phone, is sent with your account, to see how the app is
      used: numbers, yes/no values and fixed labels such as which screen, never
      the words of your predictions or notes. You can turn this off here or in
      You, under Usage stats." Turn it off: the
      line reads "Usage stats are off, so no record of which features you use is
      sent. You can turn them on here or in You, under Usage stats." and nothing
      under it moves. Back in You, Usage stats is off too. Turn it back on.
      VoiceOver hears one element, "Usage stats, switch".
- [ ] **The sign-in usage line, narrow and large (review):** the line is longer
      than it was. Open You → Sign in with iPhone Settings → Display &
      Brightness → Display Zoom → Larger Text (the narrowest layout this iPhone
      has, about 320 pt wide), then again with Settings → Accessibility →
      Display & Text Size → Larger Text at its largest. Pass both times: the
      whole line shows with nothing cut off or overlapping the switch, the
      switch stays reachable, and the sign-in buttons are still reachable by
      scrolling. Send a screenshot of each.

### D6. D72's three items (2026-11-20; JS only, a reload of the development build)
**2026-11-20, the owner: "D4 and D6 pass"**, on that day's builds. He was asked for the
two Canada checks (the Region alone, then English (UK) with the Region on Canada),
which the privacy policy's publishing waited on, and gave no item-by-item results, so
those two boxes are ticked. Later that day: "D5 through D7 check out", again with no
item-by-item results, so the rest of this section isn't ticked one by one. Taken as reported,
it shows the app reads the Region setting on iOS 26.
- [x] **Usage stats start off in Canada (D72 (b)):** Erase in the app (or a fresh
      install), then Settings → General → Language & Region → Region → Canada, and
      open the app. The Warm-up's first screen reads "Fairly Sure can send a few usage
      counts, with no account or device id, to see how the app is used. They’re off
      until you turn them on, here or in You." with the switch **off**. You → Usage
      stats is off too, and so is the switch on the sign-in screen ("Usage stats are
      off, so no record of which features you use is sent. …"). Turn it on in You:
      all three now show on, and the Warm-up's usual line would show. Set the Region
      back to the United States and relaunch: the switch is still on (a choice
      holds). **This is the check that the app reads the Region setting at all:** if
      the switch is on at the first step, tell the agent.
- [x] **Canada by Region with another language (the review of 2026-11-20):** Erase,
      then set iPhone Language to English (UK) and Region to Canada, and open the app.
      Pass: the Warm-up's first screen shows the "They’re off until you turn them on"
      line with the switch **off**. Then the other way round: Language Français (Canada)
      or English (Canada) with the Region on the United States, after another Erase:
      also off (either reading is enough). If either starts on, tell the agent: it means
      the phone reports its region some other way.
- [ ] **And off stays off elsewhere:** with the Region on the United States, turn
      Usage stats off in You, set the Region to Canada and back, relaunching each
      time: it stays off throughout.
- [ ] **The local-only Plus page (D72 (c)):** with the sandbox account set to Under
      13 (D4), open the Plus page (Insights' Plus card): under "Plus isn't offered on
      this phone" and its paragraph, "If you already subscribe to Fairly Sure Plus,
      you manage it in the Settings app: tap your name, then Subscriptions.", then
      Close. With VoiceOver: title, paragraph, that line, Close, in that order. At the
      largest text size nothing is cut off.
- [ ] **A stale sheet's delete is counted (D72 (a)), two phones only:** skip unless a
      second signed-in device is to hand. Open an open prediction's details on phone
      A (logged on an earlier day) and leave the sheet up; on phone B answer it
      "Can't tell"; let A sync; on A tap Delete and confirm ("Insights will count it
      as deleted"). Insights → More about your record on A counts one deletion.

### D7. D73: no distress check (2026-11-20; JS only, a reload of the development build)
**2026-11-20, the owner: "D5 through D7 check out"**, on that day's builds from `master`,
with no item-by-item results, so the boxes below aren't ticked one by one.
- [ ] **The Coach answers whatever the notes say (D73):** signed in with Plus and Coach
      on, open an answered prediction in History and Add a note: "The car keeps
      breaking down." Insights → Get feedback. Pass: ordinary feedback, or one of the
      Coach's usual lines, and no support card, helpline or "Back to Coach". Remove the
      note afterwards.
- [ ] **The paywall's messages are spoken (step 207):** with VoiceOver on, open the
      paywall as a guest and tap Restore purchases with nothing to restore. Pass:
      VoiceOver reads the message that appears without you having to find it. Close and
      reopen the paywall: the message is gone.
- [ ] **A sandbox purchase still lands (step 207):** signed in, buy a plan in sandbox.
      Pass: "You're on Plus" as before, and Plus stays after closing and reopening the
      app. Then sign out: Plus is gone at once and stays gone after bringing the app
      back from the background.

### D8. Step 209: the offline launch and the Warm-up result's headings (2026-11-20; JS only)
Needs the build that carries step 209 (the production build after 1.0.0 (7), or a reload of
the development build). **Build 1.0.0 (8) from TestFlight, 2026-11-21:** the owner reported
the gate's other checks on it ("Save image works. Paywall works. Reminder and text size also
work", with screenshots; D9 below has what they showed) and nothing in this section: the
offline launch and VoiceOver are still to run, on build 9.
- [ ] **Offline launch, signed in (step 209):** sign in, force-quit, wait more than an hour,
      turn on Airplane Mode, launch. Pass: within about 2 seconds Today shows the
      account's predictions and You shows its email; not an empty Today. Before step 209
      this took 25 to 50 seconds and opened as the guest.
- [ ] **Still offline:** log one prediction. Turn Airplane Mode off, reopen after a minute:
      still signed in, and the new prediction is on the server (it appears on a second
      device, or survives sign-out and sign-in).
- [ ] **Reminders survive it:** with a prediction due later that day, do the offline launch
      above before the reminder time; the reminder still arrives.
- [ ] **Signed out elsewhere (optional, needs a second device):** sign out on the other
      device with a connection, then launch this one offline and reconnect. Pass: the
      account shows briefly, then the app moves to the guest.
- [ ] **Headings on the Warm-up result (step 209):** with VoiceOver on, after a Warm-up
      (Erase first), the rotor's Headings list holds the verdict ("On these ten, …") and
      "The answers".

### D9. Build 8's device report and step 210's fixes (2026-11-21; JS only)
**What the owner reported on build 1.0.0 (8), TestFlight, 2026-11-21** (his words, with seven
screenshots; no item-by-item results):
- [x] **Share → Save Image** works (the saved Warm-up card came back as an image; no crash
      without `NSPhotoLibraryAddUsageDescription`).
- [x] **A due-day reminder arrived**, and **the largest text size** holds up.
- [x] **The paywall shows the App Store's prices:** $34.99 a year, $4.99 a month, $79.99.
- [ ] **The free month on Annual was not on his screen** ("Best value", "Subscribe for
      $34.99 a year"). The app shows a trial only when Apple says this Apple Account can
      still take it; he saw it on TestFlight on 2026-11-17 and has bought in the sandbox
      since, so the account has most likely used it. Not confirmed. His to check: in App
      Store Connect the annual subscription still lists the introductory offer (free, one
      month) for the four storefronts.
- **Found:** on the practice sheet the question was drawn over "Today's practice" and the ×
  couldn't be tapped (the formSheet trap, `docs/app-profile.md` §18). Fixed in step 210.
- **His calls that day:** the Warm-up stays as it is; "Works out to $2.91 a month." becomes
  "$2.91 / month"; the app lock opens on a tap (D74).

**On the build that carries step 210 (production 1.0.0 (9)).** Nothing here has run on the
iPhone. **Covered on Expo Simulators instead, 2026-11-22** (the owner: "I don't really want to do
any more phone checks, please see if you can do them on the EAS simulator. And if not, they are
minor enough to document and pass on for the time being"). Simulator build `6b0fd5af` from
`1b8d8ab`, whose app code is build 9's; session `01a201f7` (13 min); evidence labelled
**simulator**, captures in `.tooling/sim/2026-11-22/run2/` (git-ignored). What the simulator
couldn't reach is **passed on by the owner**, not run.
- [x] **Every sheet's title and ×** (simulator): Log (+), an open prediction's details, Resolve,
      Practice (a question, and the answers), Share, How scoring works, Categories, the
      paywall, Sign in. The title is clear of the grabber and the content and the × closes
      each, at the default text size; light and dark for Log, details, Resolve, Practice and
      the paywall, light only for the rest.
- [x] **Practice** (simulator): after an answer is picked, Next is in view; the answers open at
      their top.
- [ ] **The lock opens on a tap (D74):** passed on. The simulator has no biometric controls and
      a passcode sheet with no cancel. Unit-tested; the owner confirmed Face ID on the
      development build (2026-11-15), before D74.
- [ ] **The paywall's line** ("$2.91 / month"): passed on. The simulator build has no
      RevenueCat key ("Plus isn't available on this build yet."); a copy change, unit-tested.
- [ ] **D8's offline launch** and **VoiceOver through one log and one answer:** passed on. The
      simulator run doesn't sign in, and VoiceOver can't be driven there. Step 209 is
      unit-tested and its code review was clean. The Warm-up result's headings couldn't be
      read either: the automation tree shows no heading roles at all.
- **Found on the simulator; the text-size items are deferred, not scheduled** (the owner,
  2026-11-22: "documented and ignored for now, since they are a very extreme accessbility edge
  case"). At the largest accessibility text size (AX5, set with
  `textSize.set` and a relaunch), every tab's large title is clipped along its bottom, and long
  words break mid-word ("Calibratin / g" on Today, "New / predicti / on" on Log, a card's "80%"
  as a column in History); Today's streak row is cramped and Log's Save footer takes about a
  quarter of the screen. The owner's "text size also work" on build 8 was most likely a smaller
  size. Also cosmetic: a large gap on the Sign in sheet between the intro and "Privacy policy".
- **Run 3 (simulator, 2026-11-22, session `01a2043c`, 8 min; app code = production build 14's):**
  the main flow end to end passes on the simulator: Warm-up (slider tap, drag, ±5), the first
  log with the keyboard up, "+ New category", Edit, "Answer it now" with the early and same-day
  notes, Resolve, Change answer, the draft kept after a relaunch, History, Insights' fold, You's
  switches and time wheel, Share's card and the native share sheet, dark mode on the four tabs
  and Log; safe areas clear. Deferred with the text-size items above: from AX2
  (`accessibility-large`) the tab titles lose their descenders, History's "30%" splits into "30"
  over "%", the category chips are cut at the right and Log's Save footer wraps. Minor: on
  Warm-up question 1 the slider sits partly under the footer until scrolled; "Answer it now"'s
  early note sits about 10 pt above its button. Captures in `.tooling/sim/2026-11-22/run3/`.

---

## Batch E — Ship (needs everything above)

Done: the splash and the icon are real artwork wired in `app.json` (the icon is flattened at
build time); no APNs key is needed, since every notification is local (no push token
anywhere in `src/`, `app/` or `supabase/`); the App Privacy answers are drafted from the code
in [`APP_PRIVACY.md`](./APP_PRIVACY.md); export compliance was declared at the first build.

- [x] **`submit.production` in `eas.json`:** `ascAppId` `6831917395` since 2026-11-07;
      `eas submit` asks for the Apple ID itself. Build 2 reached TestFlight on 2026-11-16.
- [x] **Privacy policy and support URLs:** GitHub Pages serves `master` / `/docs` since
      2026-11-15, and `/privacy/` and `/support/` return 200 (`check.sh --release` checks
      both). If they ever stop loading: GitHub → `tapjason/calibrate-app` → Settings → Pages →
      Deploy from a branch → `master` → `/docs`, then confirm
      `https://tapjason.github.io/calibrate-app/privacy/` shows "Fairly Sure Privacy Policy"
      and `/support/` shows "Fairly Sure Support". App Store Connect needs the same privacy
      URL, and it has to load (Guideline 3.1.2).
- [x] **`npx expo install --check` before the build:** clean since 2026-11-07 (15 SDK 55
      patch updates, runbook step 4); `check.sh --release` and `/build` re-check it.
- [x] **Age assurance decision** (Texas SB 2420): built 2026-11-02, option (a): Apple's
      Declared Age Range asked once, failing open, only the band stored, nothing gated.
      Since 2026-11-19 (D70, `SHIP_READINESS.md` decision 2, on `builder/owner-decisions`)
      a band under 13 makes the phone local-only (D4 above, the sandbox check); any other
      band, or none, still gates nothing. Counsel is still the owner's.
- [x] **`eas build` → TestFlight:** 1.0.0 (build 2) processed and installed on the owner's
      iPhone, 2026-11-16.
- [ ] **Account deletion, the optional legs.** The function is live (redeployed 2026-11-15),
      which alone is compliant, and its secrets are set (the RevenueCat key renamed to
      `REVENUECAT_DELETE_KEY`, confirmed 2026-11-16). Test
      it by deleting a throwaway account from You → Delete account (one signed in with Apple,
      for the revoke leg), then confirming its `auth.users` row is gone and the function's
      logs show no skipped leg. See `supabase/README.md` § delete-account.
- [ ] **The Coach discloses its third-party AI before it is switched on** (Guideline
      5.1.2(i)): You → Coach (AI) says "…go through our server to a third-party AI service,
      which writes it", and the Coach panel says so above Get feedback until the first
      answer. Neither names OpenAI (owner, 2026-11-17; from build 3). Confirm both on the
      device build.
- [ ] Screenshots (the identity card and the calibration curve are the two that sell it).
      The upload set was made 2026-11-20 from web captures in a drawn frame, 1206 × 2622
      (`APP_STORE_LISTING.md` §5); captures from the device would replace it.
- [ ] **Age-rating questionnaire** in App Store Connect: the updated question
      set (in-app controls, capabilities, medical or wellness topics, AI
      features) has been mandatory since 2026-01-31. Proposed answers:
      `APP_STORE_LISTING.md` §1.
- [ ] **The rest of the App Store Connect record** (added 2026-11-16): the listing text, the
      App Privacy answers (`APP_PRIVACY.md`), the review notes and a demo account that has
      Plus (`APP_STORE_LISTING.md` §4).
- [ ] Not needed since 2026-11-20: the owner dropped the beta stage. **Before outside testers** (added 2026-11-16): the beta app description and beta review
      information (`TESTFLIGHT_PLAN.md`, "Ready-to-use text").
- [ ] Install from TestFlight and re-run Batch C on the real build.

---

## Decisions only you can make

The open product and policy calls are in `SHIP_READINESS.md`, "Open decisions for the owner"
(2, 5, 8, 9, 12 and 13). One more, for later: **the Apple link-out commission** (0% on US
link-out purchases since the April 2025 injunction; Apple proposed 15%/5% in August 2026; the
Supreme Court took its appeal in June 2026, a decision unlikely before June 2027). It doesn't
block in-app purchase; it decides whether a link-out flow is worth building, and can wait.

---

## Open work that is code, not you

Listed here only so the human checklist isn't mistaken for the whole list. **The current
list is [`SHIP_READINESS.md`](./SHIP_READINESS.md), "Open work"**; what's built is in
[`docs/design/BUILT_LOG.md`](./design/BUILT_LOG.md).

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

A guest's funnel events land in `public.guest_analytics_events` instead (the same event
names, no user id), so for the aha rate add its `warmup_completed` and `warmup_started`
counts to these. Guests' rows are counts, not people: a reinstall counts twice.
