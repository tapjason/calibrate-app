# Fairly Sure — Account Spec: sign-in, sign-out, deletion

**As of:** 2026-11-19 · **Status:** built (§1–3). `delete-account` is deployed (redeployed
2026-11-15) with its secrets set; the security review's changes to it of 2026-11-18 (§3.3)
are in the code and live only after the redeploy in `supabase/README.md`'s owner checklist
("2026-11-19: migrations 011 and 012, three redeploys, and the sandbox Plus rows" → "Every
owner step, in order", item 11, which also covers the 2026-11-18 section's redeploy). §2
and §3.2's client changes ship with the next build. Round 5 of the review (2026-11-19,
roadmap D69; commit `7b5b0ea`) rewrote sign-out (§2: it now removes the account's rows),
moved the session to the iPhone Keychain (§2.1), gave Sign in with Apple a nonce (§1) and
hid Create account (§1). Round 6 (the same day, uncommitted on `builder/review-2026-11-18`
when this was written) wipes before the session ends, keeps this phone's integrity counts,
asks about categories only this phone has and checks again just before the wipe (§2),
keeps the later-expiring session when both stores hold one and reads Keychain deletes back
(§2.1), and lets a later "the account still exists" settle an unconfirmed deletion (§3.2).
Round 7 (the same day, also uncommitted then) makes a deletion remove from the server only
what this phone saw (§2 step 1, SQLite migration 021), lets `discardUnsynced` agree to
nothing without a question asked first (step 2) and says so when the session can't end
after the wipe (`SIGN_OUT_FAILED_AFTER_WIPE`, step 6); JavaScript only. The Keychain needs `expo-secure-store` and the nonce `expo-crypto`, both native: a new
development and TestFlight build. Google sign-in (step 192) is on since 2026-11-18, after the owner's setup
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
| Signed in | "Signed in as …", or "Signed in with Apple." for a private-relay address, then "Your predictions are backed up. Signing out removes them from this phone, and signing back in brings them back. Categories you added or changed live only on this phone, so signing out removes them." and **Sign out** (§2). (Since round 6 the counts only this phone keeps stay through a sign-out, so the footer no longer names them.) At the bottom, **Delete account**, in red. |

**`app/account/index.tsx`**, the sign-in screen: on iOS the native
`AppleAuthenticationButton` first, then "Continue with Google" while
`GOOGLE_SIGN_IN_ENABLED` is on (below), then email. **Create account is hidden** (owner
decision 2026-11-19, D69 (c); `EMAIL_SIGN_UP_ENABLED = false` in
`src/components/account/emailSignUp.ts`) until a custom mail sender works: the email form
only signs in to an account that already exists, and a line under it sends someone new to
the buttons above ("New here? Use Apple or Google for now.", naming only the buttons the
phone shows; `newHereLine`). With the flag on, the form has a Sign in / Create account
switch and the password rules for Create account only (8 or more characters, an uppercase
letter, a lowercase letter and a number, ASCII, as a four-row checklist that ticks as you
type; step 190; the server's matching setting is `HUMAN_VERIFICATION.md` A5; Sign in never
applies them); all of it is kept in `SignInView` for when it returns. Errors show inline
from `AuthOutcome.error`. On `{ ok: true }` it goes back; `authStore`'s
`onAuthStateChange` migrates guest data (only on a sign-in the person started, §2),
reloads the stores and starts a sync.

**Apple (round 5: a nonce).** `signInWithApple` (`src/supabase/auth.ts`) makes a fresh
nonce for each sign-in (`makeAppleNonce`: 32 random bytes from `expo-crypto`'s
`getRandomBytesAsync`, as lowercase hex, and their SHA-256 as lowercase hex). The hash goes
to Apple (`signInAsync({ nonce })`), which copies it into the identity token; the raw value
goes to Supabase (`signInWithIdToken({ nonce })`), which hashes it and refuses a token
whose nonce doesn't match, so a token from another sign-in can't be replayed. No nonce, no
sign-in: if one can't be made (a build without `expo-crypto`, or no random bytes) the
screen reads "Sign in with Apple isn't available right now." (`APPLE_UNAVAILABLE`). The
email scope only, as before. Deletion's re-authentication (§3.2 step 5) sends a nonce too
when it can, and opens the sheet without one when it can't: there it guards nothing yet
(only the code leaves the phone, and the server checks the identity Apple returns for it).

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
sign-in returns the service's outcome unchanged so the screen can show the error;
`signOut(opts?)` returns the session's end or, before anything changes, `{ ok: false,
unsynced, localCategories }` (§2). `pending` also stays up while a sign-out the client is still running
settles (§2, the races).

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
password reset waits on it (decision 12). **Decided 2026-11-19 (D69 (c)):** until it exists,
Create account is hidden (above), so nobody starts an email sign-up in the app that never
gets its link; accounts that already exist still sign in by email, and nobody can reset a
password.
The support page says so and points to Sign in with Apple or Google, and the App Review
notes point the reviewer at the demo account (`APP_STORE_LISTING.md` §4).

The code handles both: `signUpWithEmail` returns `needsConfirmation: !data?.session`, and the
sign-in screen then says "Check … for a confirmation link, then sign in here."

---

## 2. Sign-out

**Sign-out takes the account's rows off this phone** (owner decision 2026-11-19, D69 (a);
rounds 5 and 6 of the security review), all but this phone's integrity counts. One more
push first; if anything would be lost for good (changes not on the server, categories only
this phone has), the app asks before going on. The rows go before the session ends.
Signing back in brings back what the server has. Until round 5 the rows stayed on the
phone under the account's id, out of view, and this section called wiping them an open
decision.

`authStore.signOut(opts?)` (`src/store/authStore.ts`), with `pending` held throughout:

1. **One more push.** `pushNow(account)` (`src/supabase/sync.ts`): deletions not yet sent,
   then every dirty row, after any sweep already running for the account. No pull and no
   recompute, since the rows are about to go. Each request checks that the session is still
   the account's, as a sweep's do. At most 10 s in all; a push still running then carries
   on alone (step 3 waits for it), and step 2 counts what is left. Each deletion is a
   conditional delete (rounds 6 and 7): its tombstone remembers the status and
   `resolved_at` of the prediction as this phone held it when deleted (`deleted_status`,
   `deleted_resolved_at`, SQLite migration 021), and the delete removes the server's row
   only while it is open, or while it holds that same answer with the same `resolved_at`
   (`deletionMatch`, `src/supabase/sync.ts`; the rule is `tombstoneCovers`,
   `src/db/predictions.ts`). A tombstone from before 021 reads as "deleted open". So a
   phone that hadn't heard of an answer given elsewhere, before its delete or after, can't
   remove it; when the server holds the row answered differently, this phone restores the
   row and drops its tombstone (`reconcileTombstoneWithRemote`). Round 6 allowed any row
   answered no later than the deletion, which still let a stale phone remove an answer
   given before its delete. A row refused alone at an account cap (`PT429`) isn't sent
   again for an hour unless it changes (`AT_CAP_RETRY_MS`, in memory, per account), so this
   push skips it, but it stays dirty and step 2 counts it.
2. **What signing out would lose for good.** `readAtStake(account)`
   (`src/supabase/signOutCheck.ts`; the dirty rows read once queued transactions have
   settled, then the counts): changes not on the server, `countUnsynced(account)` (`src/db/predictions.ts`: predictions still marked
   dirty, a log, answer, edit or note not pushed or an answer the pull kept and must push
   back, plus deletions not yet pushed), never fewer than the dirty rows it lists with their
   `updated_at`; and categories only this phone has, `countLocalOnlyCategories(account)`
   (`src/db/categories.ts`: one the person added, renamed, gave an emoji or picture, or hid;
   a built-in's row with none of those isn't counted). Queued analytics aren't counted: they
   are no one's record. A deletion not yet pushed isn't lost either way: its tombstone is
   one of the integrity counts the wipe keeps (step 5), and it goes up when the account next
   syncs on this phone.
   - Anything the person hasn't agreed to lose: `{ ok: false, unsynced, localCategories }`,
     and **nothing changes**: still signed in, every row still here. What was asked is
     remembered for the account in this run (`askedAbout`). You (`SettingsView`) asks in a
     system alert (`askToConfirm`), "Sign out anyway?", naming only the counts above zero
     (`unsyncedSignOutLine`): "1 change hasn't reached the server yet and may not if you sign
     out now." / "N changes haven't reached the server yet and may not if you sign out now."
     (an unsent edit is wiped; an unsent deletion waits and goes when the account signs in
     here again),
     then "1 category you added or changed lives only on this phone and will be removed." /
     "N categories you added or changed live only on this phone and will be removed.", with
     **Sign out** (destructive) and Cancel. **Sign out** calls `signOut({ discardUnsynced:
     true })`; it does nothing while the app is locked (`appLocked()`: the alert sits above
     the lock screen). `discardUnsynced` agrees to what the person was told and nothing
     more (`agreedCovers`: neither count higher, and no dirty row new or changed since);
     with no question asked for the account in this run, to nothing (round 7, client
     re-review L1; it used to agree to whatever was there when it counted): anything at
     stake is asked about first. With nothing at stake, nothing needs agreeing to.
   - The read fails: `{ ok: false, error: SIGN_OUT_CHECK_FAILED }` ("Couldn't check
     whether everything on this phone is backed up, so you're still signed in. Try
     again."), nothing changed.
3. **Mark, then stop syncing.** The account is marked as owed a wipe
   (`markers.addOwedWipe(account, 'signOut')`, `src/supabase/authMarkers.ts`, kept in
   AsyncStorage and mirrored in memory), its sync is stopped and the running sweep and any
   `pushNow` still running waited for (`stopSyncFor`, at most 10 s in all; one still
   waiting on the network after that writes nothing more to the phone, but for marking
   what it sent as sent), and the account goes into `wipesInHand`, so a `SIGNED_OUT` the
   client sends meanwhile doesn't start a second wipe.
4. **Read it again, immediately before the wipe** (round 6, client re-review N2):
   `readAtStake` once more. A change made since the question or since step 2 (a reminder's
   Happened, a log while "Signing out…" showed) isn't covered: the account is kept as it
   was (`keepAccount`: its sync resumes and this sign-out's owed mark is dropped) and the
   person is asked again with the new counts. A read that fails keeps the account the same
   way and returns `SIGN_OUT_CHECK_FAILED`.
5. **Wipe, before the session ends.** `eraseAccountHere(account, 'signOut')`:
   `wipeLocalUserData(account, { deviceData: false, keepIntegrityCounts: true })` (§3.4: the
   account's rows in every `PER_USER_TABLES` table, including its categories and icons and
   its queued analytics, but not `INTEGRITY_COUNT_TABLES`: the counted deletions, which are
   also sync's tombstones, the late changes, the moved answers and the categories
   remembered for them stay, so signing out and back in can't empty Insights' "Only this
   phone keeps this count" lines), then the sync cursor cleared and the caches swept,
   whether or not the wipe went. A wipe that went settles the mark this sign-out made (an
   earlier deletion's waits for the session to end); one that failed stays owed, and
   `initialize()` retries it at the next launch. Then the account is remembered as signed
   out here (`rememberSignedOutHere`, every sign-out since round 6, before the session
   ends), so a token refresh under way that writes the session back as the sign-out lands
   is ignored, online or not (races, below).
6. **End the session**, `auth.signOut()` → `endSession('global')` (`src/supabase/auth.ts`):
   - **Online:** `supabase.auth.signOut()` with Supabase's default scope, `global`, which
     invalidates every session of the account on the server, on every device
     ([signOut](https://supabase.com/docs/reference/javascript/auth-signout)). It gets 10 s
     (`SIGN_OUT_TIMEOUT_MS`).
   - **Offline, or the server refuses or times out:** supabase-js keeps the session when the
     server can't be reached, so `clearStoredSession` removes it from this phone itself: the
     keys auth-js's own sign-out removes (the storage key, `-code-verifier`, `-user`), from
     the session storage (§2.1, the Keychain on iOS), read back once in case a refresh in
     flight wrote it again. The outcome is `{ ok: true, localOnly: true }`. The server never
     hears: that session stays valid there, but nothing on the phone holds its tokens any
     more. **It does not expire on its own**: Supabase refresh tokens "never expire but can
     only be used once", and a session "lasts indefinitely" by default; time-boxed and
     inactivity limits need the Pro plan
     ([Sessions](https://supabase.com/docs/guides/auth/sessions), read 2026-11-18). It ends
     at the account's next sign-out with a connection (scope `global`), or with the account.
   - **Even this phone's copy couldn't be removed:** the account stays signed in: the
     "signed out here" mark step 5 added is taken back, its sync resumes, and the owed wipe
     this sign-out marked is dropped (`keepAccount`; one a deletion marked earlier stays).
     When the wipe in step 5 went (the usual case), the outcome is `{ ok: false, error:
     SIGN_OUT_FAILED_AFTER_WIPE }` (round 7, client re-review L3; `src/store/authStore.ts`):
     "Couldn't finish signing you out, so you're still signed in. Your backed-up
     predictions will come back to this phone; anything you agreed to lose is gone." The
     lists are reloaded and a sync starts at once (the wipe cleared the cursor, so it pulls
     everything): what reached the server comes back. What the person agreed to lose in
     step 2 (unsynced changes, categories only this phone had) doesn't; nothing else was
     wiped. When the wipe hadn't gone, nothing was removed and the session's own error is
     returned, `SIGN_OUT_FAILED` ("Couldn't sign you out on this phone. Try again.",
     `src/supabase/auth.ts`). Until round 7 that line was shown after a wipe too, as if
     nothing had changed. You shows the error under Sign out and announces it. Delivered
     reminders showing a prediction's words still leave the lock screen: the person asked
     to leave.
   - The session ended and the rows went: nothing is owed for the account any more, an
     unconfirmed deletion's mark included (settled now).
7. **Then everything a sign-out did before.** `handleSession('APP_SIGN_OUT', null)` moves
   the app to the guest at once (supabase-js sends no `SIGNED_OUT` for a local-only end):
   the Coach's cards are cleared, billing logs out and drops to free (`src/billing/init.ts`
   follows the user id), reminders still to come are cancelled with the reload, and Log's
   kept draft and the answer run are cleared. Delivered reminders that show a prediction's
   words are dismissed from the lock screen (`dismissDeliveredReminderWords`), and again
   whenever a session ends by itself (an expired or revoked one).

**What stays on the phone:** the Warm-up (`warmup_results`, `warmup_progress`), the age
band and daily practice belong to the phone, not the account (main session, 2026-11-19), and
stay; so do settings and any guest rows, and, since round 6, the account's integrity counts
(`INTEGRITY_COUNT_TABLES` in `src/db/account.ts`: `prediction_deletions`,
`prediction_postponements`, `prediction_refiles`, `prediction_category_origins`; ids, dates
and category ids, no words), under the account's id, so they count again when it signs in
here (main session decision 2026-11-19; D45: a miss can't disappear without a trace). Erase
leaves them (it takes the guest's rows only, §3.5); confirmed account deletion on this
phone removes them. **What doesn't come back** on signing in again: what was only ever on
the phone, which is the account's categories (names, icons, hiding; predictions under an
added category show "Other" until it is named again, as on another phone, D39), queued
analytics not yet sent, and, while `UTC_OFFSET_SYNC` is off, each prediction's UTC
offsets (the pulled rows have none, so their days are read in the phone's zone, as for a
row from before SQLite migration 018; even with it on, a row last pushed before it was
turned on has none on the server). Predictions, answers and reflections that reached the
server come back.

**Signing back in.** A sign-in the person starts to the account (`asPersonSignIn`) clears
its "signed out here" mark and any owed wipe, and clears its sync cursor, so the first sync
pulls every row the server has, even if clearing the cursor at sign-out failed. The kept
integrity counts are the account's again; a kept tombstone not yet pushed goes up with
that sync.

**A session that ends by itself** (a global sign-out on another phone, a revoked or
expired session) wipes nothing, except after a deletion that was asked for and not
confirmed (§3.2 step 8): `handleSession`, leaving an account on any event but the app's own
sign-out, wipes its rows (`'accountRows'`: the integrity counts too, since the person asked
for the account to be deleted and it likely was; not the Warm-up, the age band or practice)
when it carries a `'deletion'` owed mark, and settles the mark if the wipe went. Otherwise
the rows stay under the account's id, out of view, until it signs in and out again on that
phone or the app is deleted; the privacy policy §7 says so.

**At launch** (`initialize()`): the markers are loaded (`loadAuthMarkers`; markers that
can't be read count as none, so nothing is wiped on a guess). A stored session for an
account marked signed out here is discarded (`auth.discardStoredSession`) and doesn't
count: a sign-out that was cut short after step 5 ends signed out. Every owed wipe for an
account not signed in now is carried out and settled if it went: a sign-out's as in step 5,
keeping the integrity counts; a deletion's as `'accountRows'`, taking them too
(`eraseKindFor`). An owed `'signOut'` wipe for the account still signed in (the app was
closed before step 5) is dropped: the account and its rows, new ones included, are the
person's again. An owed `'deletion'` mark stays until the session ends.

**The races** (security review rounds 5 and 6; client reviewer LOW-A, LOW-B; client
re-review N2, N3):

- **A late token refresh** under way as this phone signs out can land afterwards and write
  the session back, online or not. Every sign-out remembers the account as signed out here
  before the session ends (step 5; round 5 did it only after a local-only end), and
  `handleSession` ignores any session, for an account marked signed out here, that doesn't
  come from a sign-in the person started (a
  `SIGNED_IN` while `asPersonSignIn` runs), and takes it off the phone again
  (`discardStoredSession`: the same keys, no server, no wait on the client's lock). If that
  write replaced the session of the account the app shows, the app follows it out too. Ten
  accounts at most are remembered, the oldest dropped first.
- **auth-js's own sign-out still running** after the 10 s (it waits behind the client's
  lock, often for a token refresh with no connection) would, when it runs, sign out
  whatever session is stored then: a sign-in started meanwhile. `auth.signOutStillSettling()`
  reports it for at most 60 s (`LATE_SIGN_OUT_WAIT_MS`); `pending` stays up meanwhile, so
  screens disable their account buttons, and `asPersonSignIn` waits for it.
- **Only a sign-in the person started moves the guest's rows** into an account
  (`migrateGuestDataToUser`); a session that arrives any other way never takes them.
- **No sync writes after the wipe:** the sync is stopped and waited for before it
  (`stopSyncFor`, a running `pushNow` included), and `wipesInHand` keeps a `SIGNED_OUT`
  from the client during the app's own sign-out or deletion from starting a second wipe.
- **Nothing added unasked:** a change made between the question and the wipe (a
  reminder's Happened, a log while "Signing out…" shows) stops the sign-out at step 4 and
  the person is asked again; the wipe runs only on what they agreed to lose.

### 2.1 Where the session is kept (round 5, D69 (d))

auth-js keeps the access and refresh tokens, with the user, in the storage the client is
made with (`src/supabase/client.ts`; the storage key is passed explicitly, the one
supabase-js would pick, `sb-<project ref>-auth-token`). On iOS that is now the **Keychain**
(`createSessionStorage`, `src/supabase/sessionStorage.ts`, over `expo-secure-store`), every
item written `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: readable once the phone has been unlocked
after a restart (a reminder's action can run while it's locked), and, in Apple's words for
`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, items that "do not migrate to a new
device … after restoring from a backup of a different device, these items will not be
present". Until round 5 it was AsyncStorage, a plain file in the app's folder that goes
into the phone's backups. Web keeps AsyncStorage.

- **Size:** values are split into chunks of at most 2,000 UTF-8 bytes (some iOS releases
  refused values over about 2 KB, Expo's SecureStore page) under numbered keys, two slots
  with a header written last, so a write cut short leaves the old value whole; a missing
  chunk reads as no value.
- **Deleting the app:** Keychain items can outlast it (Expo: "will persist across app
  uninstallations … not guaranteed"). A marker in AsyncStorage, which a deleted app takes
  with it, says the Keychain's copy belongs to this install
  (`calibrate:session-in-keychain`). Without it, the launch check clears the session's
  Keychain keys before the client reads anything, so a reinstall never signs back in.
- **The move:** a session already in AsyncStorage (an upgrade from an earlier build) is
  copied into the Keychain and then removed from AsyncStorage, so nobody is signed out by
  the update.
- **Both hold one** (round 6, client re-review N3): with the marker set, a session in
  AsyncStorage means an older build ran in between and signed in (a TestFlight downgrade),
  or removing the copy after a move failed. `decideMode` then keeps the session that
  expires later, by each one's `expires_at` (`storedSessionExpiry`: it must also have an
  access and a refresh token, as auth-js asks; one that can't be read loses, and a tie
  keeps the Keychain's). The Keychain's wins: the AsyncStorage copy is removed. The
  AsyncStorage one wins: it is moved in as above. If the Keychain's can't be read that run,
  nothing is changed and the run uses the Keychain (no session, as any failed Keychain read
  is), so a possibly stale AsyncStorage copy is never used on a guess. Until round 6 the
  AsyncStorage copy won blindly, and a stale one left by a failed cleanup could sign the
  phone back into an older session, or another account.
- **Deletes are read back** (round 6, N5): `expo-secure-store` drops the Keychain's answer
  to a delete (`SecItemDelete`'s status, in `SecureStoreModule.swift`), so a refused delete
  looks like success. Every removal reads the value's header and first chunks back
  afterwards, and one still there, or a read-back that fails, counts as refused: the removal
  throws, and a launch-time clear that didn't take keeps that run on AsyncStorage with the
  marker unwritten.
- **Falling back:** if the module is missing (a build before it was added), its
  accessibility constant is missing, or the marker or the old session can't be read, or the
  Keychain can't be cleared (read back), or the copy or the marker can't be written, that
  run keeps using AsyncStorage as earlier builds did, and the next launch decides again.
  Reads never throw (a failed Keychain read is no session); a write the Keychain refuses
  throws, so a sign-in whose session can't be kept fails rather than holding tokens
  nowhere.

The account markers (`calibrate:auth-markers`) and the sync cursor stay in AsyncStorage:
neither holds a token.

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
   remove it, open Settings, tap your name, then Sign in with Apple, and remove Fairly
   Sure." (`DeleteAccountView`; Apple's path, from support.apple.com/102571, read
   2026-11-19). The server revokes nothing when the code is
   for a different Apple ID than the account's (§3.3), and the line shows then too.
6. **Call** `POST /functions/v1/delete-account` with `{ apple_authorization_code? }`
   (`deleteAccountOnServer`, `src/supabase/account.ts`). The session's token and user id
   are read first (10 s), while the user certainly exists, and the call is sent only if the
   session is this account's (`expectedUserId`). The call waits up to **45 s**
   (`DEFAULT_TIMEOUT_MS`). **Before it** (round 5, client reviewer HIGH 2), the account is
   marked as owed a wipe (`markers.addOwedWipe(userId, 'deletion')`), so that if the
   server deletes it without this phone hearing, its rows still leave the phone when its
   session ends by itself (§2). Since round 6 (client re-review N4) the mark is stamped
   with the time of each request it covers (`deletionAskedAt`, ms by the phone's clock,
   kept in AsyncStorage with the markers): the request may run on the server well after
   the phone stops waiting.
7. **Done means the account is gone,** shown one of two ways: the function's `200 { ok:
   true }`, or, after any call that doesn't confirm (an error, a timeout, a lost
   connection), **the "already deleted" check**: `auth.getUser(token)` with the token read
   before the call (one `GET /user`, no refresh, 10 s). Only GoTrue's definite answer for a
   deleted user, an `AuthApiError` with status 403 and code `user_not_found`, counts as
   gone; the function may have finished while its 200 was lost, and every retry would then
   get a 401. Then (`eraseAccountHere(userId, 'confirmedDeletion')`, with the account in
   `wipesInHand`): the Coach's cards, the card's left-off categories and the streak moment
   day are cleared, the account's sync is stopped and waited for, the device is wiped (§3.4,
   with the device data), the Warmup and practice are reset, the sync cursor is cleared and
   the caches swept (both whether or not the wipe went), Log's draft and the answer run are
   cleared, and the owed mark is settled if the wipe went (a wipe that failed stays owed and
   is retried at the next launch, account rows only). `auth.signOutLocal()` ends the
   session here (scope `local`; the server answers 401 or 403 for a deleted user, which
   supabase-js takes as signed out, and offline the phone removes it alone, §2),
   `handleSession('APP_SIGN_OUT', null)` moves to a fresh guest (billing logs out and drops
   to free), and delivered notifications are dismissed. Nothing after the server's
   confirmation reports failure: a local step that fails is logged and passed over. The
   screen shows "Your account has been deleted".
8. **Not done:** delete nothing locally, and show one of the two messages exported from
   `src/supabase/account.ts`. On `DELETE_FAILED_MESSAGE` (nothing was deleted by this
   request, for certain) the owed mark this attempt set is dropped; on
   `DELETE_UNCONFIRMED_MESSAGE` it stays, so if the account turns out to be gone, its rows
   (not the Warm-up, the age band or practice) leave the phone once its session ends by
   itself (§2). When an earlier request couldn't be confirmed and this one gets
   `DELETE_FAILED_MESSAGE` from the auth server's own "the account still exists"
   (`stillExistsAt`, when that question was sent), the mark is settled only if that answer
   was asked more than 10 minutes after the earlier request (`deletionCanNoLongerLand`,
   `DELETION_CAN_LAND_WITHIN_MS`): the function's last step, deleting the user, has no
   deadline of its own, and a worker can run past the gateway's 150 s until the platform's
   wall-clock limit ([Edge Functions limits](https://supabase.com/docs/guides/functions/limits),
   read 2026-11-19: "Request idle timeout: 150s"; "Paid plans: 400s", "Free plan: 150s").
   Otherwise the mark keeps
   the earlier request's time; one marked by a build before round 6 has none, and keeps the
   new stamp as a later bound:
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
account id), the guest usage counts (no id; deleted 13 months after they arrived once
migration 012's job runs), the copy on any other phone the account was signed in on, which
stays there under the account's id after that phone's session dies, and the integrity
counts (ids, dates and category ids) on any other phone the account signed out of since
round 6 (§2), until the app is deleted there.
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

The `src/db/account.ts` helper `wipeLocalUserData(userId, { deviceData = true,
keepIntegrityCounts = false })`, in one `withTransaction`:

- `DELETE FROM <table> WHERE user_id = ?` for every table in `PER_USER_TABLES`:
  `predictions`, `user_stats`, `category_stats`, `analytics_events`, the deletion
  tombstones (`prediction_deletions`), the counted late changes (`prediction_postponements`:
  date moves, rewordings and, since D69 (e), category changes), the counted category moves
  of answers (`prediction_refiles`: moved after the answer, D65, or, since round 6, answered
  in another category than the one remembered at its first move after the day it was
  logged; round 7: a rewording doesn't move that day),
  the categories remembered for that (`prediction_category_origins`, SQLite migration 019,
  round 6; never synced) and the person's categories with their icons (`categories`). A
  table added with a `user_id` belongs on the list; the wipe's test checks it against the
  schema.
- **With `keepIntegrityCounts`** (round 6; sign-out only, §2 step 5, and a sign-out's owed
  wipe at launch), the four tables in `INTEGRITY_COUNT_TABLES` (`prediction_deletions`,
  `prediction_postponements`, `prediction_refiles`, `prediction_category_origins`) are left
  as they are, the tombstones' `counted` and `pushed_at` included, and what each deleted
  (`deleted_status`, `deleted_resolved_at`, round 7). A kept tombstone not yet
  pushed stays waiting under its own account: sync reads and deletes per `user_id`, so
  another account signed in here never pushes it, and when this account pushes it, it
  removes only what it saw (§2 step 1). Erase and confirmed or owed deletion
  wipes leave the option off and remove them.
- **With `deviceData` (the default), clear** the Warmup rows (`warmup_results`,
  `warmup_progress`) and the age band, device-wide: they have no `user_id` but are the
  person's own (owner, 2026-11-09; this said "keep" until then). After the wipe, account
  deletion also resets the Warmup store and clears daily practice, as guest Erase does.
  **Sign-out passes `deviceData: false`** (§2; main session, 2026-11-19), as does every
  owed wipe (a sign-out's that didn't finish, with `keepIntegrityCounts`; an unconfirmed
  deletion's once its session has ended, without it): the Warm-up, the age band and
  practice belong to the phone and stay.
- The entitlement mirror isn't touched here: billing resets it to free when the identity
  changes (the comment on `wipeLocalUserData`). Daily practice and settings aren't either.
- **Deleted text doesn't stay in the file** (security review, 2026-11-18, and round 5):
  every connection turns on SQLite's `secure_delete`, which overwrites deleted content with
  zeros (`enableSecureDelete`, `src/db/client.ts`; a failure to turn it on is logged and
  the database opens anyway). Once the deletes have committed, `vacuumAfterWipe` rebuilds
  the file once with `VACUUM` (round 5: pages freed before `secure_delete` was on, in
  builds before 2026-11-18, still held deleted words, and only a rebuild overwrites them),
  then `checkpointAfterWipe` truncates any write-ahead log. Both run outside the
  transaction, in the transaction queue, as SQLite requires, and never throw: a wipe that
  committed is done. Without them the words stayed in `Documents/SQLite/calibrate.db`,
  which goes into the phone's backups.

Then, whether or not the wipe went (`eraseAccountHere` in `authStore`, for sign-out, owed
wipes and a confirmed deletion):

- **The sync cursor is cleared**: `clearSyncCursor(userId)` removes
  `calibrate:sync_cursor:<user id>` from AsyncStorage (`src/supabase/sync.ts`).
- **The caches are swept**, not awaited, each sweep swallowing its own errors: CSV exports
  (`sweepExportFiles`, every title and reflection), share-card images
  (`sweepShareCaptures`) and the icon picker's pictures (`sweepIconImageFiles`). Guest
  Erase sweeps the same three, and since round 5 the CSV exports are also swept at every
  launch and before each new export (`app/_layout.tsx`, `src/export/file.ts`).

### 3.5 Guests: "Erase your data on this phone"

Guest data never left the phone, so this is `authStore.eraseDeviceData`:
`wipeLocalUserData(LOCAL_GUEST_USER_ID)`, then the Warmup, practice, Log's kept draft, the
answer run, the card's left-off categories and the streak moment day; then delivered
notifications are dismissed, the three caches swept (§3.4) and the Coach's cards cleared,
behind the same one-tap confirm. Settings stay. Only rows
made without an account go. An account's own rows leave the phone when it signs out here
(§2, since round 5), all but its integrity counts (since round 6); rows that stay under an
account's id are those counts, and the rows of an account whose session ended some other
way (a sign-out on another phone, an expired session), or one that signed out on a build
before round 5, and Erase leaves them, as the confirmation's "made on this phone without an
account" says. It satisfies Apple's guest-account clause,
and it's a useful reset in its own right.

### 3.6 Webhook and deleted users: already handled

A `RENEWAL` or `EXPIRATION` can still arrive for a deleted id. That's already
safe: `apply_entitlement_event` (migration 004) catches
`foreign_key_violation` and returns normally, so the webhook answers 200 and
RevenueCat doesn't retry.

### 3.7 Tests

- The deletion-plan module covers: no code means no Apple leg, missing secrets
  mean legs are skipped, a RevenueCat 404 is OK, an auth-delete failure
  returns 500.
- `wipeLocalUserData` removes only that user's rows, against the sql.js adapter, and
  leaves the Warm-up and the age band with `deviceData: false`.
- Sign-out (rounds 5 to 7): `src/store/authStore.signOut.test.ts` (the push, the
  question that changes nothing, the discard covering only what was asked and, with no
  question asked, nothing, the check just before the wipe, the wipe keeping the integrity
  counts, a session that couldn't end, before or after the wipe, the owed wipe retried at
  launch), `src/supabase/signOutCheck.test.ts` (`agreedCovers`), and
  `src/store/authStore.races.test.ts` (a late refresh, a sign-out still settling, a
  session that wasn't the person's sign-in); `src/db/account.test.ts` (what
  `keepIntegrityCounts` keeps); the session storage, both copies and the delete read-back,
  in `src/supabase/sessionStorage.test.ts`; the deletion mark's time in
  `src/supabase/authMarkers.test.ts` and `src/supabase/account.test.ts`; the nonce in
  `src/supabase/auth.nonce.test.ts`; a deletion removing only what this phone saw, two
  phones included, in `src/supabase/sync.tombstones.test.ts` (`deletionMatch`) and
  `src/db/predictions.sync.test.ts`.
- The delete screen: a subscriber sees the billing warning and a lifetime
  holder doesn't; a failed call leaves the stores untouched; success routes to
  a fresh guest.
