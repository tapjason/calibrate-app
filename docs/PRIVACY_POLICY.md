---
layout: default
title: Fairly Sure Privacy Policy
permalink: /privacy/
---

<!--
Published at https://tapjason.github.io/calibrate-app/privacy/
If the app's name changes, update it here. Not legal advice.

DO NOT PUSH THIS VERSION UNTIL THE OWNER HAS DONE ALL OF THESE (revised 2026-11-18
after the security and policy review, and 2026-11-19 after its rounds 5 and 6). The text
below is written for the state AFTER them; before them, §2.1, §2 (guest counts) and §6
are not true, and §2 (the warm-up notice), §7 (signing out) and §10 (the Keychain) are true
only of the build in step 7.

The owner's database steps are one checklist: supabase/README.md, section "2026-11-19:
migrations 011 and 012, three redeploys, and the sandbox Plus rows", "Every owner step, in
order" (it includes the 2026-11-18 section's steps). Steps 1-3b below are its items 1-10
(steps 1 and 2 are its item 1).

1. Supabase dashboard → Authentication → Configuration → Audit Logs: turn OFF "Write
   audit logs to the database". While it is on, every sign-in writes the person's email,
   IP address and (Google sign-in) their Google name into auth.audit_log_entries, and
   nothing ever deletes those rows.
2. Purge what is already stored: SQL Editor, `delete from auth.audit_log_entries;`, then
   `select count(*) from auth.audit_log_entries;` must return 0.
3. Apply migration 010 and check it (the checklist's items 2-3, which point at the
   README's 2026-11-18 section). It hashes each guest event id and cuts guest times to the
   UTC day, which §2 describes.
3a. Then apply migration 011 and check it (the checklist's items 4-6; 011 refuses to run
   without 010). It adds the two UTC-offset columns §2.2 mentions (when a prediction was
   made, and when it was last reworded). §2.2, "What we never collect" and §7 are worded
   to be true whether or not they are backed up yet (the app sends them only once
   UTC_OFFSET_SYNC in src/constants/app.ts is turned on, after 011 is live). When a build
   with it on ships, the "if your version of the app backs ... up" clauses in §2.2 and
   "What we never collect" can become plain statements, and the App Privacy form gains the
   offsets' row (docs/APP_PRIVACY.md, §1). §7's clause about the offsets then needs new
   words rather than going: turning the flag on re-sends nothing, so a prediction backed up
   before it, and not changed since, has none on the server to bring back.
3b. Enable pg_cron, then apply migration 012 and check it (the checklist's items 7-10,
   with step 7e the day after). §6's "13 months" for usage counts is true only while 012's
   daily job (purge-old-usage-counts) runs: nothing else deletes them. Keep pg_cron enabled
   (Supabase: "Disabling the pg_cron extension will permanently delete all Jobs").
4. Confirm the Supabase plan. "Within 7 days" for logs and backups (§6, §7) is true on
   Free (API logs 1 day, auth logs 24 h, no automatic backups) and on Pro (7 days each)
   without the Point-in-Time Recovery add-on. On Team (14-day backups, 28-day logs) or
   with PITR, change those numbers first.
5. Replace "EFFECTIVE DATE: set on publish" below with the day you push.
6. Resolve every OWNER comment below, then delete it. HTML comments are not shown on
   the page but ARE in the published page's source.
7. Timing: the on-phone claims (sign-out without a connection still ending the session
   on the phone, Erase and deletion clearing the cached exports, card images and
   pictures, the database overwriting deleted text) are true of builds from commit
   c7bf083 on; TestFlight 1.0.0 build 2 predates them. Round 5's (commit 7b5b0ea) and
   round 6's (2026-11-19, uncommitted when this was written) are true only of a build that
   carries both: sign-out removing the account's data from the phone, asking first about
   categories kept only on the phone, and keeping the counts (§7); the session in the
   Keychain (§10); and guest counts waiting for the warm-up's notice (§2). The Keychain
   needs expo-secure-store and the Apple nonce expo-crypto, both native, so that is a new
   development and TestFlight build. Publish with, or after, that build. Redeploying
   delete-account (the checklist's item 11) is not needed for any sentence here, but makes
   the Apple revocation check live.
8. Settled 2026-11-19 (policy re-audit L4; kept so the numbering holds). The warm-up
   notice (§2, "only after the warm-up's first screen has shown you a line saying so") is
   a saved stamp: UsageStatsNotice writes usageNoticeShownAt in the settings store when it
   is drawn, and src/components/warmup/usageNotice.ts usageCountsMayGoUp lets a guest's
   counts go up only once it is set (commit 7b5b0ea). A phone that finished the Warm-up on
   an older build (TestFlight build 2) has no stamp, since the notice is on the Warm-up's
   first screen only, so it sends nothing until it signs in; its queued events then go
   with the account, as §2.3 says. Erase and account deletion clear the stamp. Nothing to
   do beyond step 7's build.
9. Sign-out (§7) removes an account's data only on builds that carry round 5. Rows an
   account left on a phone by signing out on an earlier build (TestFlight build 2 and
   later builds before round 5) stay under that account, out of view, until it signs in
   and out again there or the app is deleted; Erase doesn't touch them. Before the App
   Store this concerns TestFlight testers only; decide whether that needs a word to them.
Once 1-9 are done, delete this list; the evidence notes below can stay.

Evidence for each claim (2026-11-18): src/analytics/events.ts (catalogue, props),
src/analytics/flush.ts (guest rows carry no user id), supabase/migrations/007 and 010
(guest table; hashed id, day-only times), src/store/warmupStore.ts:186 and
src/store/practiceStore.ts:121 (the warm-up score and practice tally sent),
src/store/predictionStore.ts:443 (confidence and whether it happened),
src/components/account/SignInView.tsx:32 (the sign-in notice), src/ai/coachContext.ts
and supabase/functions/coach/contract.ts parseContext (the Coach summary; built-ins
only), supabase/functions/coach/index.ts:282-294 (no account id sent to OpenAI),
src/store/authStore.ts signOut/deleteAccount/eraseDeviceData, src/supabase/auth.ts
endSession, src/supabase/account.ts, supabase/functions/delete-account/index.ts,
src/db/account.ts and src/db/client.ts:40-64 (secure_delete), src/age/ageRange.ts
(asks each launch until a band is stored), supabase/migrations/009 (name and picture
stripped from auth.users and auth.identities).
Round 5 (2026-11-19): src/store/authStore.ts signOut and eraseAccountHere (push, count
what's unsynced, ask, end the session, wipe with deviceData: false; round 6 wipes first,
below), src/db/predictions.ts
countUnsynced (dirty predictions and unpushed deletions), src/db/account.ts
PER_USER_TABLES (what the wipe removes) and src/db/client.ts vacuumAfterWipe,
src/supabase/authMarkers.ts (a wipe that didn't finish is retried at the next launch),
src/components/settings/SettingsView.tsx unsyncedSignOutLine ("Signing out removes
them from this phone"; round 6: "…haven't reached the server yet and won't if you sign
out now." and "…live only on this phone and will be removed."), src/supabase/sessionStorage.ts and client.ts loadKeychain
(Keychain, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, AsyncStorage when the Keychain can't be
used; a Keychain copy from an earlier install is cleared before the client reads it),
src/db/migrations/018_utc_offsets.ts and src/constants/app.ts UTC_OFFSET_SYNC (false:
offsets stored on the phone, not sent), src/components/warmup/UsageStatsNotice.tsx and
usageNotice.ts with app/_layout.tsx (no flush before the notice), src/db/migrateGuestData.ts
(queued guest events move to the account at sign-in), src/ai/coachContext.ts (added
categories left out of by_category; their answers in overall and the weekday pattern).
Round 6 (2026-11-19): src/engine/sameDay.ts and src/types/index.ts Prediction (two
offsets, the logging's and the rewording's; no answer offset), src/db/predictions.ts
(neither offset is pushed while UTC_OFFSET_SYNC is off; a pulled row's are ignored),
supabase/migrations/011 (two offset columns), src/store/authStore.ts signOut (push, read
what would be lost, ask, read it again just before the wipe, wipe with
keepIntegrityCounts, then end the session; keepAccount reloads and syncs when the session
couldn't end), src/supabase/signOutCheck.ts readAtStake (unsynced changes and
countLocalOnlyCategories in src/db/categories.ts: added, renamed, given an icon or
hidden), src/db/account.ts INTEGRITY_COUNT_TABLES (prediction_deletions,
prediction_postponements, prediction_refiles, prediction_category_origins: ids, dates and
category ids; kept by sign-out, removed by account deletion, and the guest's by Erase),
src/db/migrations/019_category_origins.ts, supabase/migrations/012 (a daily pg_cron job
deletes analytics_events and guest_analytics_events rows received more than 13 months
before, by the server's received_at; at most 100,000 analytics_events rows per account).
Public pages read 2026-11-19:
- Apple, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
  (developer.apple.com/documentation/security/ksecattraccessibleafterfirstunlockthisdeviceonly):
  "After the first unlock, the data remains accessible until the next restart … Items
  with this attribute do not migrate to a new device. Thus, after restoring from a backup
  of a different device, these items will not be present." (Hence §10 says "never moved
  to another phone, even through a backup", not "not in backups".)
- Expo SecureStore (docs.expo.dev/versions/latest/sdk/securestore/): on iOS, data "will
  persist across app uninstallations" if reinstalled with the same bundle ID, "not
  guaranteed".
- Apple, "Acquiring crash reports and diagnostic logs" (developer.apple.com/documentation/
  xcode/acquiring-crash-reports-and-diagnostic-logs): crash reports "from customers who
  share diagnostic and usage information"; "TestFlight users of your app automatically
  share crash reports with you, regardless of the device settings".
- Apple, App privacy details: "You are not responsible for disclosing data collected by
  Apple."
- Supabase, "Log sources and fields"
  (https://supabase.com/docs/guides/observability/log-field-reference): the API gateway's
  edge_logs carry metadata.request.headers.cf_ipcountry (the cf-ipcountry request header),
  and "a field is not necessarily populated on every event". That is "the country a
  request came from" in §2 and §6 (policy re-audit N4), worded "can record".
- Supabase Cron (https://supabase.com/docs/guides/cron/install): "Disabling the pg_cron
  extension will permanently delete all Jobs" (step 3b; migration 012 cites the rest).
- Wikipedia, "UTC+05:45" (https://en.wikipedia.org/wiki/UTC%2B05:45): "The Nepal Standard
  Time, used in Nepal is based on it", and it lists no other place using that offset
  ("What we never collect": "some, such as Nepal's, are used by only one country").
Public pages read 2026-11-18:
- Supabase sessions (https://supabase.com/docs/guides/auth/sessions): refresh tokens
  "never expire but can only be used once"; sessions last indefinitely by default.
- Supabase signOut (https://supabase.com/docs/reference/javascript/auth-signout):
  the default scope "global" invalidates all of the user's sessions.
- supabase/auth migration 20231027141322_add_session_refresh_columns (auth.sessions gains
  user_agent and ip) and internal/tokens/service.go RefreshTokenGrant (both written on
  every token refresh); internal/crypto/password.go (bcrypt password hash).
- Supabase logs (https://supabase.com/docs/guides/telemetry/logs): API and database log
  retention Free 1 day, Pro 7, Team 28. Auth audit logs in log storage: 24 h Free,
  7 days Pro (review finding, 2026-11-18).
- Supabase backups (https://supabase.com/docs/guides/platform/backups): Pro 7 days of
  daily backups, Team 14; Free projects aren't backed up automatically.
- Supabase DPA, Version 1, August 1, 2026 (https://supabase.com/legal/dpa): §3.2
  instructions only; §5 personnel confidentiality; §8 and Schedule 1 security, "All hard
  disks are encrypted-at-rest using the industry-standard AES-256 algorithm"; §6.2
  subprocessors "no less protective". It "forms part of" the Terms of Service.
- RevenueCat DPA, effective August 2026 (https://www.revenuecat.com/dpa/): processes
  "only in accordance with the documented instructions from Customer"; "appropriate
  technical and organizational measures"; sub-processors on "terms no less protective";
  "forms part of" the Terms of Use.
- OpenAI, "Data controls in the OpenAI platform"
  (https://developers.openai.com/api/docs/guides/your-data): API data "is not used to
  train or improve OpenAI models" unless the customer opts in; "abuse monitoring logs
  are generated for all API feature usage and retained for up to 30 days", longer where
  the law requires or to protect against harm.
-->

# Fairly Sure Privacy Policy

**Effective:** EFFECTIVE DATE: set on publish · **Contact:** tapjason-dev@gmail.com

Fairly Sure ("the app") is made by Jason Zou. This policy says what
the app collects, why, who else handles it, and how to delete it. It's written
to be read, not skimmed past.

## 1. The short version

- **Without an account, your predictions stay on your phone.** We never receive
  them. You can log, resolve, score, and share predictions entirely offline. A
  few usage counts are sent, with no account, device or install identifier, once
  the warm-up has told you so; you can turn them off there or in You (§2).
- **With an account, your predictions are backed up to our server** so they
  survive a new phone. That includes their text. Signing out removes them from
  the phone; signing back in brings back what was backed up (§7).
- **We don't sell your data, show ads, or track you across other apps or
  websites.** The app contains no advertising or third-party analytics SDK.
- **The AI Coach sees numbers, never your words.** It receives calibration
  statistics only. It is technically unable to send the text of a prediction or
  reflection, because the data it's built from has no field for text.
- **You can delete your account and its data from inside the app.** Our hosting
  provider's short-lived logs and backups expire on their own (§6, §7).

## 2. What we collect

### If you don't sign in
Your predictions, results, and settings stay in a database on your device.
(Your iPhone's own backup to iCloud or a computer, if you use one, includes
them, as it does any app's data.)

Usage events (§2.3) are recorded on the device. A few of them, those that
count how many people start and finish the warm-up, log, answer, share and
practise, are sent to us, but only after the warm-up's first screen has shown
you a line saying so, with a switch to turn them off (the same switch as You →
Usage stats). Until then they wait on the phone. They carry the event's details
(§2.3) and no account, device or install identifier. Our server replaces each
event's own id with a one-way scrambled version of it and keeps only the day the
event happened, not the time. Like any request over the internet, they reach our
hosting provider with your IP address, which its logs may keep for up to 7 days
(§6); the counts themselves don't store it. Because they carry no account,
device or install identifier, we have no way to find yours, so we can't delete
them on request. The other events, and any of the few still waiting on the
phone, are sent only if you later sign in or create an account, with it (§2.3).
You can turn usage stats off at any time, on that warm-up screen or in You →
Usage stats: that deletes the ones still on the device and stops all of them.

To know whether you have Fairly Sure Plus, the app asks RevenueCat, the
service that manages subscriptions, each time it starts. Without an account
that request carries a random identifier RevenueCat makes for this install,
not your name, email or anything you typed, along with the technical details
any app request carries (such as your IP address, the app version, language
and time zone). None of your predictions are sent.

On an iPhone running iOS 26 or later, the app may ask Apple for an age range
once its first screen is up, at each launch until you share one. If you share
one, only the age band — a lower and an upper bound, not your birthday — is
stored on the device. It is not sent to us and it is not used to lock any
feature. Erase and account deletion remove it with the rest of the on-device
data.

### If you create an account

**2.1 Account information.** Your email address, or, if you use Sign in with
Apple, the address Apple gives us, which may be a private relay address, and an
identifier for your Apple ID. If your account signs in with an email address
and password, also your password, which our sign-in service stores only as a
one-way hash. If you use Continue with Google, Google gives us your email
address and an identifier for your Google account. Google also sends your name
and profile picture. We don't use them, and our database removes them as they
arrive; your name can still appear in our hosting provider's sign-in logs until
those are deleted (§6). The sign-in service also records when your account was
created and when you last signed in, and, for each device you're signed in on,
the IP address and a short technical description of the app and system (its
"user agent") from the last time that device renewed its sign-in. We use
account information only to sign you in and keep your account working.

**2.2 Your predictions.** The text of each prediction, its category (a built-in
one such as "finance", or for a category you added, a random id, never the
name you gave it), the confidence you gave it, its due date, how it resolved,
any reflection you wrote, and when it was made, answered and last changed. We
store these so you can restore them on another device. We don't read, analyze,
or share them. On your phone, the app also keeps with each prediction how far
your phone's time zone was from UTC (in minutes) when you made it and when you
last reworded it. An answer given on the day you made the prediction doesn't
count toward your score, and that day is judged where you made it, so moving to
another time zone doesn't change which answers count. If your version of the
app backs these offsets up, they're stored with the prediction on our server
too. Your warm-up and daily practice answers are not predictions:
the answers themselves stay on your device, signed in or not. What is sent is a
tally: when you finish the warm-up, its 0–100 score and how many questions it
had; when you finish a day's practice, how many you got right out of how many
(§2.3).

**2.3 Usage events.** A small, fixed list of in-app events, such as "warmup
started", "prediction logged", "share completed" and "paywall viewed". Each
carries only numbers, yes/no values and fixed labels from the app: for
example, the confidence you chose and whether the prediction came true, not
what you predicted; or which screen opened the paywall and which kind of card
was shared. They tell us whether the app works for people. The full list:

`warmup_started`, `warmup_completed`, `share_opened`, `share_completed`,
`prediction_logged`, `prediction_resolved`, `paywall_viewed`,
`purchase_completed`, `purchase_abandoned`, `coverage_nudge_shown`,
`coverage_nudge_accepted`, `practice_started`, `practice_completed`,
`practice_reminder_set`, `coach_requested`, `data_exported`.

These are linked to your account, and the sign-in screen says so while usage
stats are on, including that events recorded before you signed in and still
on the phone go with your account. **You can turn them off** in You → Usage
stats. (The few sent before you sign in carry no account, device or install
identifier, as described above, so they can't be found or deleted as yours.)

**2.4 Purchase status.** Whether you have Fairly Sure Plus, which plan, and when it
renews or ends. We receive this from our subscription provider (§4). We never
see your payment details.

**2.5 Coach usage count.** If you use the Coach, a daily count of requests, to
enforce usage limits.

### What we never collect
Location, contacts, health or fitness data, financial accounts, photos, or your
device's advertising identifier. The app never asks for your location, and we
don't work out where you are from your IP address; our hosting provider's
request logs can record the country a request came from (§6). If your version
of the app backs up the time-zone offsets in §2.2, our server stores them with
your predictions. An offset from UTC says roughly where in the world your
phone's clock was set, and some, such as Nepal's, are used by only one
country. We use them only to tell which day a prediction was made on, for the
app's scoring rules, and nothing works out a place from them. The app has no
crash reporter of its own. Apple may share a report with us when the app
crashes: for TestFlight testers, and otherwise only if you've chosen in your
iPhone's settings to share analytics with app developers. A picture you pick as
a category icon is shrunk and kept on your phone; it is never uploaded. The
names you give categories stay on your phone too. "Health" and "finance" in
Fairly Sure are labels you choose for your own predictions. The app doesn't
connect to any health or financial service.

## 3. The AI Coach (Fairly Sure Plus, off by default)

The Coach is optional and is turned off until you switch it on. When you tap
**Get feedback**, the app sends our server a summary of your statistics: your
overall calibration score and how many scored answers you have; for each
built-in category you've answered in, the number of scored answers, the
category's score, the average confidence, the share that came true, and whether
it leans overconfident, underconfident or neither; and a few patterns computed
from those numbers (such as which weekday you're least accurate on, and how a
category's score has moved), each with how many answers it rests on. A category
you added isn't named or listed in the summary, but its answers count in the
overall figures (your overall score, your number of scored answers and the
weekday pattern). **No prediction text, no reflections, no names you typed, no
email address.**

Our server checks that the request comes from a signed-in account with Plus,
then forwards the summary, without your account id or email, to OpenAI to
generate the feedback. OpenAI's published API data controls (read
November 18, 2026) say that data sent to its API isn't used to train its models
unless the customer opts in, and that OpenAI keeps abuse-monitoring logs of API
use for up to 30 days, longer where the law requires it or to protect against
harm.

Before any Coach request, the app checks your predictions and reflections **on
your device** for signs of distress. If it finds any, it shows you support resources instead of
contacting the Coach. That check never sends your text anywhere.

## 4. Who else handles your data

| Service | What it receives | Why |
|---|---|---|
| **Supabase** (database, sign-in and our server functions; servers in the United States) | Everything in §2.1–2.5, the guest usage counts in §2, and the IP address each request arrives with | Stores your account and backed-up predictions, and runs our server |
| **OpenAI** | The statistics summary in §3, only when you request Coach feedback, without your account id or email | Generates Coach feedback |
| **RevenueCat** | An account identifier (a random one for this install if you haven't signed in), your App Store purchase records, and the technical details of each request (such as IP address, app version, language and time zone) | Manages subscriptions |
| **Apple** | Payments, and sign-in if you use Sign in with Apple. When you delete an account that uses Sign in with Apple, our server asks Apple to revoke the app's access | App Store billing and authentication |
| **Google** | Nothing from the app. If you use Continue with Google, Google knows you signed in to Fairly Sure | Authentication |

We share data with these providers only to run the app. We don't sell or rent
personal data, and we don't share it for advertising.

Supabase and RevenueCat handle data on our behalf. Under their data processing
terms, they may process it only on our instructions to provide their service,
must protect it with technical and organizational security measures, and must
hold any company they rely on to terms no less protective. OpenAI handles the
Coach summary under its API terms, as described in §3. Apple and Google handle
payments and sign-in as independent companies, under their own privacy
policies.

<!-- OWNER: confirm whether OpenAI's Data Processing Addendum covers this account
(https://openai.com/policies/data-processing-addendum/; it could not be read on
2026-11-18, HTTP 403, and older versions had to be signed through OpenAI's form). Once it
does, add OpenAI to the "on our behalf" sentence above; until then the policy states only
what OpenAI's public data-controls page says. Apple Guideline 5.1.1(i) asks the policy to
confirm that every third party gives the same or equal protection. -->

## 5. Notifications

Reminders are scheduled **on your device**. We don't collect a push token and
we don't send notifications from a server. A due-day reminder shows only
the day you made the prediction and the confidence you gave it. Its words appear
only if you turn on **You → Show the words in reminders**. The weekly digest shows only how many predictions are open.

## 6. How long we keep it

- **Your account, backed-up predictions, purchase status and Coach usage
  count:** as long as your account exists. Deleting your account deletes them
  (§7).
- **Usage events sent with your account (§2.3):** 13 months from when our
  server receives them; a daily job then deletes them. Deleting your account
  deletes them sooner (§7).
- **Sign-in sessions** (with the IP address and user agent in §2.1): until you
  sign out with a connection, which ends every session of your account, or
  delete your account.
- **Usage counts sent without an account (§2):** 13 months from when our server
  receives them; the same daily job then deletes them. They carry no account,
  device or install identifier.
- **Our hosting provider's logs:** Supabase keeps logs of requests to our
  server and of sign-ins, which can include your email address, your IP address,
  the country a request came from and the time (and, for a Google sign-in, your
  name), for security and to keep the service running. They're deleted
  automatically within 7 days.
- **Backups:** if our hosting provider keeps backups of our database, they're
  deleted automatically within 7 days, so data you delete can remain in one
  for up to that long.
- **OpenAI:** the abuse-monitoring logs described in §3, up to 30 days.
- **RevenueCat:** its record of your account identifier and its purchases,
  until account deletion asks RevenueCat to delete it (§7). A record made
  without an account, under a random install identifier, stays at RevenueCat.
  Neither holds your email or anything you wrote.
- **On your phone:** until you delete it (§7), sign out of the account it
  belongs to (§7; the counts that only this phone keeps stay until you delete
  your account on this phone or delete the app), or delete the app. If you
  delete the app while signed in, iOS may keep your sign-in session in the
  Keychain (§10); if you install the app again, it doesn't use that session and
  deletes it.

## 7. Deleting your account, and signing out

In the app: **You → Delete account** (at the bottom). This permanently deletes, at once:

- your account, email address and sign-in sessions,
- all backed-up predictions and reflections,
- your usage events, purchase status and Coach usage count on our server,
- and this phone's copy of your data: predictions, categories and their icons,
  the counts of deleted, late-changed and moved predictions, warm-up and
  practice answers, the age band, a prediction you were still typing, and the
  exported files, card images and pictures the app left in the phone's cache. Your settings (switches and reminder times), which hold
  nothing you wrote, stay.

We also ask RevenueCat to delete its record for your account. That step is
best effort: if RevenueCat can't be reached, your account is still deleted.
RevenueCat's record holds no email and nothing you wrote; if you want to be
sure it's gone, email us.

A few copies outlast the deletion for a short time. Our hosting provider's logs
(including a record of the deletion with your email address) and any backups
are deleted automatically within 7 days (§6). If you used the Coach, OpenAI may
keep its copies of your statistics summaries, which carry no account id, for up
to 30 days (§3). Usage counts sent before you signed in stay until they're 13
months old (§6), since they carry no account, device or install identifier to
find them by. Apple keeps its own records of your App Store purchases. If your
account is also signed in on another phone, or its session there ended without
signing out there (see "Signing out", below), that phone keeps its copy until
you delete the app there. A phone you signed out on keeps the account's counts
of deleted, late-changed and moved predictions (see "Signing out"), which hold
no words, until you delete the app there.

If your account uses Sign in with Apple, you're asked to confirm with Apple,
and our server then revokes Fairly Sure's access to that Apple ID. If you
cancel that step, or confirm with a different Apple ID, your account is still
deleted but that access isn't revoked: remove it in your iPhone's Settings, by
tapping your name and looking for Sign in with Apple.
If you signed in with Google, deleting your account removes what Google shared
with us; to disconnect Fairly Sure on Google's side as well, remove it in your
Google Account's security settings, under third-party connections.

**Deleting your account doesn't cancel an App Store subscription.** Apple bills
it, so cancel it first in Settings → [your name] → Subscriptions, or the app
will point you there.

**Signing out** (You → Sign out) first tries to send our server any changes
this phone hasn't backed up yet. If some can't be sent, for example without a
connection, or if you have categories that are kept only on this phone (ones
you added, renamed, gave an icon or hid), the app says how many and asks before
going on. If you go on, those categories are removed, and those changes don't
reach our server: a prediction, answer, edit or note that wasn't sent is lost, and a
deletion that wasn't sent waits on this phone until you sign in to the account
here again. If anything more of that kind appears before your data is removed,
the app stops and asks again.

Then your account's data is removed from this phone: its predictions and
reflections, the categories you added and any names, icons or hiding you set
for categories, and usage events not yet sent, along with the exported files,
card images and pictures the app left in the phone's cache. If that can't
finish at once, the app tries again the next time it opens. The counts of
deleted, late-changed and moved predictions that only this phone keeps (they
hold no words) stay on the phone, so signing out and back in doesn't clear them.

It then ends your session on this phone. With a connection, it also ends your
sessions on every other device. Without one, our server isn't told, but this
phone no longer holds anything that could use the session; it ends the next
time you sign out with a connection, or when you delete your account. If even
this phone can't end the session, you stay signed in, and what was backed up
comes back from our server.

Signing back in brings back your predictions and reflections from our server.
Category names, icons and hiding are kept only on the phone, so they don't come
back, and neither do the time-zone offsets in §2.2 unless your version of the
app backs them up. Your warm-up, daily practice and age band belong to the
phone rather than the account, and stay, as do your settings. Reminders for the
account's predictions stop, and any on the lock screen showing a prediction's
words are cleared.

When a phone's session ends some other way, for example because you signed
out on a different phone, that phone keeps its copy of your data, out of view,
until you sign in and out again there, or delete the app there.

Without an account, **You → Erase your data on this phone** removes
everything made on this device without an account, along with the exported
files, card images and pictures the app left in the phone's cache. Your
settings (switches and reminder times) stay, and hold nothing you wrote. Erase
doesn't touch an account's data, which is removed from the phone when the
account signs out, as above, all but the counts that stay.

You can also email tapjason-dev@gmail.com to request deletion or a copy of your data.

## 8. Your rights

Depending on where you live (for example, under the GDPR in the EU/UK or the
CCPA in California), you may have the right to access, correct, export, or
delete your personal data, and to object to or restrict its processing. You can
export your predictions yourself as CSV or ask us for a copy at
tapjason-dev@gmail.com. We'll respond within 30 days. We don't sell personal
information as the CCPA defines it.

## 9. Children

Fairly Sure is not directed to children under 13, and we don't knowingly collect
their personal information. If you believe a child has created an account,
contact us and we'll delete it.

## 10. Security

Data is encrypted in transit (HTTPS), and our hosting provider encrypts its
disks. Server-side, each account can read only its own rows. The database
enforces that, not just the app. On your phone, the app sets its database to
overwrite deleted text rather than only mark it deleted. No system is
perfectly secure, but we collect as little as we can, partly so there's less
to protect.

On your iPhone, the app keeps your sign-in session (the tokens that keep you
signed in, stored with your account's basic details such as its email address)
in the iOS Keychain. It can be read only after the iPhone has been
unlocked once since it was turned on, and it is never moved to another phone,
even through a backup. If the Keychain can't be used, the app keeps the
session in its own storage on the phone instead, as earlier versions did.

If you turn on the app's lock (**You → Lock with Face ID**, named for how your
iPhone unlocks), your iPhone does the checking, with Face ID, Touch ID or your
passcode. Fairly Sure learns only whether the check passed and which of these
your iPhone has set up. It never sees your face, your fingerprint or your
passcode, and nothing about the check is sent to us.

## 11. Changes

If this policy changes in a way that matters, we'll say so in the app before it
takes effect. The effective date at the top always reflects the current
version.

<!-- OWNER: this version adds disclosures (sign-in logs, session IP addresses, retention,
the warm-up and practice tallies; on 2026-11-19 the warm-up notice, the time-zone offsets,
Apple's crash reports, the country in request logs, and after round 6 the 13 months for
usage counts and what an offset can say about where you are) and changes what signing out
does (it now removes the account's data from the phone, all but the counts only the phone
keeps, and asks first about categories kept only there). The app isn't on the App Store yet, so
no in-app notice seems needed for it; confirm, and remember that §11 promises one for
later changes. -->

## 12. Contact

Jason Zou · tapjason-dev@gmail.com
