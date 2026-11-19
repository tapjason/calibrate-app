# Fairly Sure — Account Spec: sign-in, sign-out, deletion

**As of:** 2026-11-18 · **Status:** built (§1–3). `delete-account` is deployed (redeployed
2026-11-15) with its secrets set; the security review's changes to it of 2026-11-18 (§3.3)
are in the code and live only after the redeploy in `supabase/README.md` ("2026-11-18:
migration 010 and two redeploys"). §2 and §3.2's client changes ship with the next build. Google sign-in (step 192) is on since 2026-11-18, after the owner's setup
(`HUMAN_VERIFICATION.md` A6); `GOOGLE_SIGN_IN_ENABLED` turns it off again. Not yet run on
a device.

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
`AppleAuthenticationButton` first, then "Continue with Google" while
`GOOGLE_SIGN_IN_ENABLED` is on (below), then email: one form with a Sign in / Create account
switch, the password rules for Create account only (8 or more characters, an uppercase
letter, a lowercase letter and a number, ASCII, as a four-row checklist that ticks as you
type; step 190; the server's matching setting is `HUMAN_VERIFICATION.md` A5; Sign in never
applies them), and inline error text from `AuthOutcome.error`. On `{ ok: true }` it goes back;
`authStore`'s `onAuthStateChange` migrates guest data, reloads the stores and starts a sync.

**Google (step 192, iOS only; the flag is on).** No Google SDK: `signInWithGoogle`
(`src/supabase/auth.ts`) asks Supabase for the provider URL (`signInWithOAuth`,
`skipBrowserRedirect`, `prompt=select_account`), opens it in the system sign-in sheet
(`WebBrowser.openAuthSessionAsync`, not ephemeral), and trades the returned `code` for a
session (`exchangeCodeForSession`; the client is PKCE). The redirect is
`GOOGLE_REDIRECT_URL`, `fairlysure://google-auth`; `app/google-auth.tsx` is a blank route
that leaves at once, in case iOS also delivers that URL as a link. Cancel, in the sheet or
on Google's page, reads "Sign-in cancelled."; anything that isn't the person's doing reads
"Google sign-in isn't available right now." Nothing logs the URL or the code, and no code
reads the provider's token. The button follows Google's branding rules (its Light and Dark
themes, the four-colour G from Google's own sample file, `DESIGN_SYSTEM.md` §2.4); its
label is in the system font, like Apple's button above it. Google sends a name and a
picture with the email; migration 009 removes them from `auth.users` and `auth.identities`
as they arrive (`design/research/sign-in-providers-2026-11.md` §3). Not from the auth
audit log: each sign-in's entry carries `actor_name` from `full_name`, so the name is kept
in `auth.audit_log_entries` until the owner turns off "Write audit logs to the database"
and purges the table, and in Supabase's log storage for 24 hours (Free) or 7 days (Pro)
even then (security review, 2026-11-18).

**`CoachPanel`:** a Plus guest sees "Sign in to use Coach. It runs on our server, which needs
to know it's you…" with a button to `/account`, and no request is made.

### Store

`authStore` holds the actions (L6 imports only `@/store` and `@/types`): `signInWithEmail`,
`signUpWithEmail`, `signInWithApple`, `signInWithGoogle`, `signOut`, `deleteAccount`, a
`pending` flag, and `hasAppleIdentity` and `hasGoogleIdentity` from the session. Each
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

**Never option A once another sign-in provider ships** (2026-11-18,
`design/research/sign-in-providers-2026-11.md` §5): with confirmation off, an address
someone else registered first is linked to its real owner's Google or Apple sign-in.

**Decided 2026-10-01 (for testing only):** "Confirm email" stays on, and test accounts use
the address on the Supabase team, which the built-in mailer does reach. **Decided
2026-11-15:** B, a custom mail sender (`SHIP_READINESS.md` decision 6), not set up yet; the
password reset waits on it (decision 12). Until it exists, someone outside the Supabase
team who signs up by email never gets the link, and nobody can reset a password: the
support page says so and points to Sign in with Apple or Google, and the App Review notes
point the reviewer at the demo account (`APP_STORE_LISTING.md` §4).

The code handles both: `signUpWithEmail` returns `needsConfirmation: !data?.session`, and the
sign-in screen then says "Check … for a confirmation link, then sign in here."

---

## 2. Sign-out

`authStore.signOut()` → `auth.signOut()` (`src/supabase/auth.ts`, `endSession('global')`;
security review, 2026-11-18):

1. **Online:** `supabase.auth.signOut()` with Supabase's default scope, `global`, which
   invalidates every session of the account on the server, on every device
   ([signOut](https://supabase.com/docs/reference/javascript/auth-signout)). It gets 10 s
   (`SIGN_OUT_TIMEOUT_MS`).
2. **Offline, or the server refuses or times out:** supabase-js keeps the session when the
   server can't be reached, so `clearStoredSession` removes it from this phone itself: the
   same AsyncStorage keys auth-js's own sign-out removes (the storage key, `-code-verifier`,
   `-user`), read back once in case a refresh in flight wrote it again. The outcome is
   `{ ok: true, localOnly: true }`. The server never hears: that session stays valid there,
   but nothing on the phone holds its tokens any more. **It does not expire on its own**:
   Supabase refresh tokens "never expire but can only be used once", and a session "lasts
   indefinitely" by default; time-boxed and inactivity limits need the Pro plan
   ([Sessions](https://supabase.com/docs/guides/auth/sessions), read 2026-11-18). It ends
   at the account's next sign-out with a connection (scope `global`), or with the account.
3. `{ ok: false, error: SIGN_OUT_FAILED }` ("Couldn't sign you out on this phone. Try
   again.") only when even this phone's copy couldn't be removed; the app then stays
   signed in.
4. On `ok`, `handleSession(null)` moves the app to the guest at once (supabase-js sends no
   `SIGNED_OUT` for a local-only end): the Coach's cards are cleared, billing logs out and
   drops to free (`src/billing/init.ts` follows the user id), reminders still to come are
   cancelled with the reload, and Log's kept draft and the answer run are cleared.
5. Either way, delivered reminders that show a prediction's words are dismissed from the
   lock screen (`dismissDeliveredReminderWords`), and again whenever a session ends by
   itself (an expired or revoked one).
6. **Local data stays on the device, under the account's user id.** The guest view starts
   empty, and signing back in shows everything again. No confirmation, because nothing is
   lost. (Whether sign-out should wipe the account's rows instead is an open owner
   decision.)

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
4. **If the account has a Google identity** (`hasGoogleIdentity`), a note before the
   button says deletion removes what Google shared and where to remove the app in the
   Google Account. No re-authentication and no revocation call: the app holds no Google
   token.
5. **If the account has an Apple identity** (`hasAppleIdentity`, `src/supabase/auth.ts`,
   step 191: `app_metadata.provider` is `'apple'`, or `app_metadata.providers` or
   `user.identities` names it. `provider` alone is the first provider used, so an email
   account Supabase later linked to Apple read as `'email'` and skipped revocation. The
   answer comes from this phone's session: a link made on another phone arrives with the
   next token refresh), call `AppleAuthentication.signInAsync()` again to get a fresh
   `authorizationCode`, which is valid for 10 minutes. If the user cancels the
   sheet, delete anyway without revocation, then tell them how to remove the
   app in Settings. Apple's guidance allows this fallback, and blocking deletion on it
   would be the "unnecessarily difficult" case. As built, the finished screen says "Your
   predictions and account are deleted from our servers and this phone." and, whenever
   the account had an Apple identity and the revoke isn't confirmed (the sheet was
   cancelled, the server skipped or failed the revoke, or the deletion was confirmed by
   the "already deleted" check), adds "Sign in with Apple may still list Fairly Sure. To
   remove it, open Settings, tap your name, then Sign in with Apple." (Apple's path, from
   support.apple.com/102571, read 2026-11-19). The server revokes nothing when the code is
   for a different Apple ID than the account's (§3.3), and the line shows then too.
6. **Call** `POST /functions/v1/delete-account` with `{ apple_authorization_code? }`
   (`deleteAccountOnServer`, `src/supabase/account.ts`). The session's token and user id
   are read first (10 s), while the user certainly exists. The call waits up to **45 s**
   (`DEFAULT_TIMEOUT_MS`).
7. **Done means the account is gone,** shown one of two ways: the function's `200 { ok:
   true }`, or, after any call that doesn't confirm (an error, a timeout, a lost
   connection), **the "already deleted" check**: `auth.getUser(token)` with the token read
   before the call (one `GET /user`, no refresh, 10 s). Only GoTrue's definite answer for a
   deleted user, an `AuthApiError` with status 403 and code `user_not_found`, counts as
   gone; the function may have finished while its 200 was lost, and every retry would then
   get a 401. Then: the Coach's cards, the card's left-off categories and the streak
   moment day are cleared, the device is wiped (§3.4), the Warmup, practice, Log's draft
   and the answer run are reset, the sync cursor is cleared and the caches swept (both
   outside the wipe's `try`, so they run even if the wipe fails), `auth.signOutLocal()`
   ends the session here (scope `local`; the server answers 401 or 403 for a deleted user,
   which supabase-js takes as signed out, and offline the phone removes it alone, §2),
   `handleSession(null)` moves to a fresh guest (billing logs out and drops to free), and
   delivered notifications are dismissed. Nothing after the server's confirmation reports
   failure: a local step that fails is logged and passed over. The screen shows "Your
   account has been deleted".
8. **Not done:** delete nothing locally, and show one of the two messages exported from
   `src/supabase/account.ts`:
   - `DELETE_FAILED_MESSAGE`, when the server answered and the account still exists (or no
     request could be made at all): "Couldn't delete your account right now. Nothing has
     been deleted. Try again in a moment."
   - `DELETE_UNCONFIRMED_MESSAGE`, in every other case, when the app can't tell (the call
     timed out, got a 504 or never got through and the user still exists, or the check
     afterwards couldn't say): "Couldn't confirm whether your account was deleted. Check
     your connection and try again."

   A half-deleted state, with the server gone and the device intact or the reverse, is the
   one outcome that must not happen.

### 3.3 Edge Function `supabase/functions/delete-account/`

Same shape as `coach`: verify the JWT with `auth.getUser(token)`, rate-limit,
cap the body size, and return a generic `internal` on failure.

Server-side order (**the auth user goes last**, so a failure anywhere earlier
leaves an account the user can retry deleting). Legs 1 and 2 run at the same time, each
cut off at 20 s (`LEG_DEADLINE_MS`, `deletionPlan.ts`; each upstream call has its own 8 s
limit), and the user is deleted only after both have settled (security review,
2026-11-18):

1. **Apple revoke** (only if a code was sent): build the client secret (an ES256
   JWT signed with the Sign in with Apple key, `iss` = team id, `sub` = bundle
   id, `aud` = `https://appleid.apple.com`), `POST /auth/token` to exchange the
   code, then `POST /auth/revoke` with the refresh token. **Only the account's own
   grant:** the function reads the account's Apple identity with the service role and
   compares it with the `sub` in the id_token Apple returns; for a different Apple ID it
   revokes nothing (`skipped`: "apple: the code is for a different Apple ID than the
   account's; not revoked"), and an account with no Apple identity never sends the code
   to Apple. **Best effort:** log a failure, don't abort.
2. **RevenueCat:** `DELETE https://api.revenuecat.com/v2/projects/{project_id}/customers/{user_id}`.
   Best effort, and a 404 counts as success; a failure is listed in `skipped` and the
   account is deleted anyway. This does **not** cancel an App
   Store subscription (RevenueCat says so); step 2 of the client flow handles
   that.
3. **`auth.admin.deleteUser(user.id)`**, a hard delete. It removes
   `auth.users`, invalidates sessions, and **cascades** to `predictions`,
   `coach_usage`, `entitlements` and `analytics_events` (all four declare `on
   delete cascade`, verified in `supabase/migrations/`).
4. Return `200 { ok: true, skipped }`.

**What outlasts it** (the privacy policy §6–7 says so): Supabase's request, function and
auth logs (the function logs the deleted user id; GoTrue logs the deletion with the email;
1 day on Free, auth logs 24 hours, 7 days on Pro), any backups (none automatic on Free, 7
days on Pro), OpenAI's abuse-monitoring logs of earlier Coach summaries (up to 30 days, no
account id), the guest usage counts (no id), and the copy on any other phone the account
was signed in on, which stays there under the account's id after that phone's session dies.
While "Write audit logs to the database" is on, `auth.audit_log_entries` also keeps every
sign-in and the deletion, with the email, indefinitely; turning it off and purging it is an
owner step before the policy is published.

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
  `category_stats`, `analytics_events`, the deletion tombstones
  (`prediction_deletions`), the counted due-date moves (`prediction_postponements`), the
  counted category moves (`prediction_refiles`) and the person's categories with their
  icons (`categories`).
- **Clear** the Warmup rows (`warmup_results`, `warmup_progress`) and the age
  band, device-wide: they have no `user_id` but are the person's own (owner,
  2026-11-09; this said "keep" until then). After the wipe, account deletion
  also resets the Warmup store and clears daily practice, as guest Erase does.
- The entitlement mirror isn't touched here: billing resets it to free when the identity
  changes (the comment on `wipeLocalUserData`).
- **Deleted text doesn't stay in the file** (security review, 2026-11-18): every
  connection turns on SQLite's `secure_delete`, which overwrites deleted content with
  zeros (`enableSecureDelete`, `src/db/client.ts`; a failure to turn it on is logged and
  the database opens anyway), and once the deletes have committed, `checkpointAfterWipe`
  truncates any write-ahead log. Without it the words stayed in
  `Documents/SQLite/calibrate.db`, which goes into the phone's backups.

Then, outside the wipe's `try` so they run even if it fails (`authStore.deleteAccount`):

- **The sync cursor is cleared**: `clearSyncCursor(userId)` removes
  `calibrate:sync_cursor:<user id>` from AsyncStorage (`src/supabase/sync.ts`).
- **The caches are swept**, not awaited, each sweep swallowing its own errors: CSV exports
  (`sweepExportFiles`, every title and reflection), share-card images
  (`sweepShareCaptures`) and the icon picker's pictures (`sweepIconImageFiles`). Guest
  Erase sweeps the same three.

### 3.5 Guests: "Erase your data on this phone"

Guest data never left the phone, so this is `authStore.eraseDeviceData`:
`wipeLocalUserData(LOCAL_GUEST_USER_ID)`, then the Warmup, practice, Log's kept draft, the
answer run, the card's left-off categories and the streak moment day; then delivered
notifications are dismissed, the three caches swept (§3.4) and the Coach's cards cleared,
behind the same one-tap confirm. Settings stay. Only rows
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
