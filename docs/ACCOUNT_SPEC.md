# Calibrate — Account Spec: sign-in, sign-out, deletion

**As of:** 2026-10-03 · **Status:** built (§1–3); `delete-account` deployed 2026-10-02 (Apple and RevenueCat legs wait on their keys) · Items 1 and 3 of
[`NEXT_STEPS.md`](./NEXT_STEPS.md)

The auth *functions* exist (`src/supabase/auth.ts`) and the guest→account
handoff exists (`authStore.handleSession` → `migrateGuestDataToUser`). What's
missing is every surface a user touches, and the deletion path Apple requires.
This spec follows the layer rules in `BUILD_PLAN.md`: screens call stores,
stores call services, and nothing in the core loop waits on any of it.

---

## Principles

1. **Signing in stays optional.** Log → Resolve → Stats → Share never asks for
   an account. Sign-in is offered where it buys something concrete: backup and
   sync, the Coach, and restoring Plus on a new phone.
2. **Offer it in context, never as a gate.** The places are the Settings Account
   row, the Coach panel for a Plus guest, and (optionally) once after the 5th
   resolution: "Back up your record?".
3. **Delete means delete.** Server, RevenueCat and device, with no soft-delete
   path. A calibration record is personal data about someone's judgment.

---

## 1. Sign-in

### Surfaces

**Settings → Account section** (new, at the top of `SettingsView`):

| State | Shows |
|---|---|
| Guest | "Not signed in. Your predictions live only on this phone." Button **Sign in or create account** (routes to `/account`). Row **Erase all data on this device** (see §3.5). |
| Signed in | Email, or "Signed in with Apple" for a private-relay address. **Sign out** button. **Delete account** row, styled as destructive, at the bottom of the section. |

**`app/account/index.tsx`**, the sign-in screen:

- **iOS:** the native `AppleAuthenticationButton` first, then "or use email".
- **Email:** one form with a Sign in / Create account toggle, email and
  password fields (the existing ≥8-character rule), and inline error text taken
  from `AuthOutcome.error`.
- **Google:** hidden unless `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set. It isn't
  configured today, and a button that errors is worse than no button.
- On `{ ok: true }`: `router.back()`. `authStore`'s `onAuthStateChange` already
  migrates guest data, reloads the stores and starts a sync, so the screen does
  nothing else.

**`CoachPanel`:** when `isPlus && authStatus === 'guest'`, render "Sign in to
use Coach. It runs on our server, which needs to know it's you." with a button
to `/account`. Don't request insights in this state. Today it requests, gets a
401, and shows nothing.

### Store

Add actions to `authStore` rather than calling `@/supabase/auth` from a screen
(L6 imports only `@/store` and `@/types`): `signInEmail`, `signUpEmail`,
`signInApple`, `signOut`, plus a `pending` flag and a `lastError` string. Each
one returns the `AuthOutcome` unchanged.

### The email-confirmation decision (yours)

Supabase's built-in sender reaches **only members of your Supabase
organization**, at **2 emails/hour**, and is documented as not for production.
With "Confirm email" on (the default), a real user who signs up by email never
gets the link. Pick one:

| Option | Cost | Trade-off |
|---|---|---|
| **A. Turn off "Confirm email"** (Auth → Providers → Email) | Free, 1 minute | `signUp` returns a session immediately. Unverified addresses are accepted. **Password reset still can't send.** Fine for a beta. |
| **B. Custom SMTP** (e.g. Resend or Postmark free tier) | Free tier, needs a domain you control | Real confirmation and password reset. Needs `emailRedirectTo: 'calibrate://auth-callback'` in `signUpWithEmail` and a route that calls `exchangeCodeForSession`. |

**Recommendation:** A for TestFlight, B before public launch. Make Sign in with
Apple the default on iOS either way, since it never touches email.

**Decided 2026-10-01 (for testing only):** neither yet. "Confirm email" stays on,
and test accounts are created with the address on the Supabase team, which the
built-in mailer does reach. A or B is still needed before anyone else signs up.

The code should handle both: after `signUp`, if `data.session` is null, show
"Check your email to confirm", otherwise proceed. (`signUpWithEmail` currently
discards `data`; return whether a session exists.)

### Tests

- `authStore` actions: success sets no error; failure surfaces
  `AuthOutcome.error`.
- Sign-in screen: iOS shows the Apple button, Android doesn't. The toggle
  switches between modes. A confirmation-pending sign-up shows the check-email
  state.
- `CoachPanel`: a Plus guest sees the sign-in prompt, and **no request is
  made**.

---

## 2. Sign-out

`authStore.signOut()`:

1. `logOutBilling()`, so the next person on the device starts anonymous (this
   already exists).
2. `supabase.auth.signOut()`. `onAuthStateChange` then moves the app to the
   guest id and reloads the stores.
3. **Local data stays on the device, under the account's user id.** The guest
   view starts empty, and signing back in shows everything again. No confirm
   dialog is needed, because nothing is lost.

Say so in the UI: "Your predictions stay backed up to your account."

---

## 3. Account deletion

### 3.1 Requirements (Apple, researched 2026-09-25)

From [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/):

- It must be **initiated in the app** and **easy to find**, typically in account
  settings. Linking out to a website as the main path is not acceptable.
- It deletes "the entire account record, along with associated personal
  data", including user-generated content.
- **Sign in with Apple:** "use the Sign in with Apple REST API to revoke user
  tokens."
- **Auto-renewing subscriptions:** "notify them that their billing will
  continue through Apple and request that they cancel their subscription
  before continuing." Offering to schedule deletion at expiry is allowed only
  alongside an immediate option.
- A confirmation step is allowed. "Unnecessarily difficult" is not.
- If it isn't instant, tell the user how long it takes, and confirm when done.
- **Guest accounts** must be deletable too. Here a guest is local-only, so §3.5
  covers it.

### 3.2 Flow

`app/account/delete.tsx`, reached from Settings → Delete account:

1. **Explain.** "This permanently deletes your predictions, calibration
   history, and account from our servers and this phone. It can't be undone."
2. **If `isPlus` and the source is `trial`, `monthly` or `annual`:** "Your
   subscription is billed by Apple and **won't stop when you delete your
   account.** Cancel it first." Button: **Manage subscription**, which calls
   `Purchases.showManageSubscriptions()` (RevenueCat's wrapper for Apple's
   sheet), with `https://apps.apple.com/account/subscriptions` as a text
   fallback. Lifetime purchases need no warning.
3. **Confirm.** A single destructive button, **Delete my account**. Don't ask
   the user to type a word; one deliberate tap after step 1 is the standard.
4. **If the account signed in with Apple** (`user.app_metadata.provider ===
   'apple'`), call `AppleAuthentication.signInAsync()` again to get a fresh
   `authorizationCode`, which is valid for 10 minutes. If the user cancels the
   sheet, delete anyway without revocation, then tell them how to remove the
   app in Settings → Apple ID → Sign in with Apple. Apple's guidance allows
   this fallback, and blocking deletion on it would be the "unnecessarily
   difficult" case.
5. **Call** `POST /functions/v1/delete-account` with `{ apple_authorization_code? }`.
6. **Only after a 200:** wipe the device (§3.4), then `logOutBilling()`, then
   `auth.signOut()`, then show "Your account has been deleted." and route to
   Home as a fresh guest.
7. **On failure:** delete nothing locally. Show "Couldn't delete right now. Your
   data is unchanged. Try again." A half-deleted state, with the server gone
   and the device intact or the reverse, is the one outcome that must not
   happen.

### 3.3 Edge Function `supabase/functions/delete-account/`

Same shape as `coach`: verify the JWT with `auth.getUser(token)`, rate-limit,
cap the body size, and return a generic `internal` on failure.

Server-side order (**the auth user goes last**, so a failure anywhere earlier
leaves an account the user can retry deleting):

1. **Apple revoke** (only if a code was sent): build the client secret (an ES256
   JWT signed with the Sign in with Apple key, `iss` = team id, `sub` = bundle
   id, `aud` = `https://appleid.apple.com`), `POST /auth/token` to exchange the
   code, then `POST /auth/revoke` with the refresh token. **Best effort:** log a
   failure, don't abort.
2. **RevenueCat:** `DELETE https://api.revenuecat.com/v2/projects/{project_id}/customers/{user_id}`.
   Best effort, and a 404 counts as success. This does **not** cancel an App
   Store subscription (RevenueCat says so); step 2 of the client flow handles
   that.
3. **`auth.admin.deleteUser(user.id)`**, a hard delete. It removes
   `auth.users`, invalidates sessions, and **cascades** to `predictions`,
   `coach_usage`, `entitlements` and `analytics_events` (all four declare `on
   delete cascade`, verified in `supabase/migrations/`).
4. Return `200 { ok: true }`.

Secrets it needs (**human steps**, none of them exist yet):

| Secret | Where from |
|---|---|
| `APPLE_TEAM_ID`, `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_PRIVATE_KEY` | developer.apple.com → Keys → a key with **Sign in with Apple** enabled (not the In-App Purchase key from B0.3). Needs the $99 account. |
| `APPLE_CLIENT_ID` | the bundle id, `com.calibrate.app` |
| `REVENUECAT_DELETE_KEY` + `REVENUECAT_PROJECT_ID` | a v2 secret key with **customers write**. The existing `sk_` key is read-only for customers. Project `projb27eccad`. |

The function must work **without** the Apple and RevenueCat secrets, skipping
those legs and logging it, so the core deletion ships before the $99 account
exists.

Put the decision logic (which legs run, and how each result is classified) in a
Deno-import-free module, as `revenuecat-webhook/entitlementFromEvent.ts` does,
so Jest can cover it.

### 3.4 Device wipe

A new `src/db/account.ts` helper, `wipeLocalData(userId)`, in one
`withTransaction`:

- `DELETE FROM predictions WHERE user_id = ?`, and the same for `user_stats`,
  `category_stats` and `analytics_events`.
- Reset the entitlement mirror to free.
- **Keep** the Warmup row. It has no `user_id`, was never uploaded, and is the
  device's onboarding state rather than account data. (Clear it too if you'd
  rather make deletion feel like a factory reset; either is defensible.)

Then clear the per-user sync cursor in AsyncStorage.

### 3.5 Guests: "Erase all data on this device"

Guest data never left the phone, so this is `wipeLocalData(LOCAL_GUEST_USER_ID)`
plus the Warmup row, behind the same one-tap confirm. It satisfies Apple's
guest-account clause, and it's a useful reset in its own right.

### 3.6 Webhook and deleted users: already handled

A `RENEWAL` or `EXPIRATION` can still arrive for a deleted id. That's already
safe: `apply_entitlement_event` (migration 004) catches
`foreign_key_violation` and returns normally, so the webhook answers 200 and
RevenueCat doesn't retry. Nothing to build. (The first draft of this spec
missed that.)

### 3.7 Tests

- The deletion-plan module covers: no code means no Apple leg, missing secrets
  mean legs are skipped, a RevenueCat 404 is OK, an auth-delete failure
  returns 500.
- `wipeLocalData` removes only that user's rows, against the sql.js adapter.
- The delete screen: a subscriber sees the billing warning and a lifetime
  holder doesn't; a failed call leaves the stores untouched; success routes to
  a fresh guest.

---

## 4. What changes elsewhere once this ships

- `APP_PRIVACY.md` §5 item 5 closes. `PRIVACY_POLICY.md` §7 becomes true and
  the policy can be published.
- `HUMAN_VERIFICATION.md` Batch C gains three boxes: sign in by email; sign
  out and back in with data intact; delete the account and confirm the
  `auth.users` row is gone.
- Remove the "Not built" account-deletion row from the checklist.
