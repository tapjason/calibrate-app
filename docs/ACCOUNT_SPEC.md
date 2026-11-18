# Fairly Sure — Account Spec: sign-in, sign-out, deletion

**As of:** 2026-11-16 · **Status:** built (§1–3). `delete-account` is deployed (2026-10-02);
its secrets were set on 2026-11-16 with one misspelled, so the RevenueCat leg is skipped until
it is renamed, and the redeploy isn't confirmed (`docs/SHIP_READINESS.md`, "Open work").

The spec as built. It follows the layer rules in `BUILD_PLAN.md`: screens call stores, stores
call services (`src/supabase/auth.ts`, `src/supabase/account.ts`), and nothing in the core
loop waits on any of it. The guest→account handoff is `authStore.handleSession` →
`migrateGuestDataToUser`.

---

## Principles

1. **Signing in stays optional.** Log → Resolve → Insights → Share never asks for an
   account. Sign-in is offered where it buys something concrete: backup and sync, the
   Coach, and restoring Plus on a new phone.
2. **Offer it in context, never as a gate.** The places are You's account group, the Coach
   panel for a Plus guest, and the backup nudge.
3. **Delete means delete.** Server, RevenueCat and device, with no soft-delete path. A
   calibration record is personal data about someone's judgment.

---

## 1. Sign-in

### Surfaces

**You, the account group** (`AccountGroup` in `SettingsView`):

| State | Shows |
|---|---|
| Guest | "Not signed in. Your predictions live only on this phone." and **Sign in** (routes to `/account`). At the bottom of You, **Erase your data on this phone** (§3.5). |
| Signed in | "Signed in as …", or "Signed in with Apple." for a private-relay address, then "Your predictions are backed up." and **Sign out**. At the bottom, **Delete account**, in red. |

**`app/account/index.tsx`**, the sign-in screen: on iOS the native
`AppleAuthenticationButton` first, then email: one form with a Sign in / Create account
switch, the password rules for Create account only (8 or more characters, an uppercase
letter, a lowercase letter and a number, ASCII, as a four-row checklist that ticks as you
type; step 190; the server's matching setting is `HUMAN_VERIFICATION.md` A5; Sign in never
applies them), and inline error text from `AuthOutcome.error`. No
Google (the unreachable path was removed in step 182). On `{ ok: true }` it goes back;
`authStore`'s `onAuthStateChange` migrates guest data, reloads the stores and starts a sync.

**`CoachPanel`:** a Plus guest sees "Sign in to use Coach. It runs on our server, which needs
to know it's you…" with a button to `/account`, and no request is made.

### Store

`authStore` holds the actions (L6 imports only `@/store` and `@/types`): `signInWithEmail`,
`signUpWithEmail`, `signInWithApple`, `signOut`, `deleteAccount`, and a `pending` flag. Each
returns the service's outcome unchanged so the screen can show the error.

### The email-confirmation decision (yours)

Supabase's built-in sender reaches **only members of your Supabase organization**, at
**2 emails/hour**, and is documented as not for production. With "Confirm email" on (the
default), a real user who signs up by email never gets the link. Pick one:

| Option | Cost | Trade-off |
|---|---|---|
| **A. Turn off "Confirm email"** (Auth → Providers → Email) | Free, 1 minute | `signUp` returns a session immediately. Unverified addresses are accepted. **Password reset still can't send.** Fine for a beta. |
| **B. Custom SMTP** (e.g. Resend or Postmark free tier) | Free tier, needs a domain you control | Real confirmation and password reset. Needs `emailRedirectTo: 'fairlysure://auth-callback'` in `signUpWithEmail` and a route that calls `exchangeCodeForSession`. |

**Recommendation:** A for TestFlight, B before public launch. Make Sign in with Apple the
default on iOS either way, since it never touches email.

**Decided 2026-10-01 (for testing only):** "Confirm email" stays on, and test accounts use
the address on the Supabase team, which the built-in mailer does reach. **Decided
2026-11-15:** B, a custom mail sender (`SHIP_READINESS.md` decision 6), not set up yet; the
password reset waits on it (decision 12).

The code handles both: `signUpWithEmail` returns `needsConfirmation: !data?.session`, and the
sign-in screen then says "Check … for a confirmation link, then sign in here."

---

## 2. Sign-out

`authStore.signOut()`:

1. `logOutBilling()`, so the next person on the device starts anonymous.
2. `supabase.auth.signOut()`. `onAuthStateChange` then moves the app to the guest id and
   reloads the stores.
3. **Local data stays on the device, under the account's user id.** The guest view starts
   empty, and signing back in shows everything again. No confirmation, because nothing is
   lost.

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

`app/account/delete.tsx`, reached from You → Delete account:

1. **Explain.** "This permanently deletes your account, every prediction and
   reflection, your calibration history and your Warmup and practice answers, from
   our servers and from this phone. It happens immediately and can't be undone."
2. **If `isPlus` and the source is `trial`, `monthly` or `annual`:** "Your
   subscription is billed by Apple and **won't stop when you delete your
   account.** Cancel it first." Button: **Manage subscription**, which calls
   `Purchases.showManageSubscriptions()` (RevenueCat's wrapper for Apple's
   sheet), with `https://apps.apple.com/account/subscriptions` as a text
   fallback. Lifetime purchases need no warning.
3. **Confirm.** A destructive button, **Delete my account**, then a system alert,
   "Delete your account for good?", with **Cancel** and **Delete account** (owner,
   2026-11-17). A renewing subscription adds that it keeps billing until cancelled.
   The guest's Erase asks the same way ("Erase everything on this phone?", **Erase**).
   Don't ask the user to type a word: a tap and a confirmation is the standard.
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
   Today as a fresh guest.
7. **On failure:** delete nothing locally. Show "Couldn't delete your account right
   now. Nothing has been deleted — try again in a moment." A half-deleted state, with the server gone
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

Secrets (**human steps**; all set, the RevenueCat key renamed to `REVENUECAT_DELETE_KEY`
2026-11-16):

| Secret | Where from |
|---|---|
| `APPLE_TEAM_ID`, `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_PRIVATE_KEY` | developer.apple.com → Keys → a key with **Sign in with Apple** enabled (not the In-App Purchase key). |
| `APPLE_CLIENT_ID` | the bundle id, `app.fairlysure` |
| `REVENUECAT_DELETE_KEY` + `REVENUECAT_PROJECT_ID` | a v2 secret key with **customers write**. The existing `sk_` key is read-only for customers. Project `projb27eccad`. |

The function works **without** the Apple and RevenueCat secrets, skipping those legs and
logging it. The decision logic (which legs run, and how each result is classified) lives in
`deletionPlan.ts`, a Deno-import-free module like `revenuecat-webhook/entitlementFromEvent.ts`,
so Jest covers it.

### 3.4 Device wipe

The `src/db/account.ts` helper `wipeLocalUserData(userId)`, in one
`withTransaction`:

- `DELETE FROM predictions WHERE user_id = ?`, and the same for `user_stats`,
  `category_stats` and `analytics_events`.
- Reset the entitlement mirror to free.
- **Clear** the Warmup rows (`warmup_results`, `warmup_progress`) and the age
  band, device-wide: they have no `user_id` but are the person's own (owner,
  2026-11-09; this said "keep" until then). After the wipe, account deletion
  also resets the Warmup store and clears daily practice, as guest Erase does.

Then clear the per-user sync cursor in AsyncStorage.

### 3.5 Guests: "Erase your data on this phone"

Guest data never left the phone, so this is `authStore.eraseDeviceData`:
`wipeLocalUserData(LOCAL_GUEST_USER_ID)`, then the Warmup, practice, Log's kept draft and
the card's left-off categories, behind the same one-tap confirm. Settings stay. Only rows
made without an account go: an account that signed out on this phone keeps its own. It
satisfies Apple's guest-account clause, and it's a useful reset in its own right.

### 3.6 Webhook and deleted users: already handled

A `RENEWAL` or `EXPIRATION` can still arrive for a deleted id. That's already
safe: `apply_entitlement_event` (migration 004) catches
`foreign_key_violation` and returns normally, so the webhook answers 200 and
RevenueCat doesn't retry.

### 3.7 Tests

- The deletion-plan module covers: no code means no Apple leg, missing secrets
  mean legs are skipped, a RevenueCat 404 is OK, an auth-delete failure
  returns 500.
- `wipeLocalUserData` removes only that user's rows, against the sql.js adapter.
- The delete screen: a subscriber sees the billing warning and a lifetime
  holder doesn't; a failed call leaves the stores untouched; success routes to
  a fresh guest.
