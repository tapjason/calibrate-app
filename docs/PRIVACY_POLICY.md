---
layout: default
title: Fairly Sure Privacy Policy
permalink: /privacy/
---

<!--
Published at https://tapjason.github.io/calibrate-app/privacy/
If the app's name changes, update it here. Not legal advice.

DO NOT PUSH THIS VERSION UNTIL THE OWNER HAS DONE STEPS 1-9 AND THE SANDBOX CHECK IN
STEP 10. The rest of step 10 (counsel) and 11 are not preconditions for pushing: each
changes the text below when it happens. Step 12 names one more thing the build in step 7
must carry. (Revised 2026-11-18
after the security and policy review, and 2026-11-19 after its rounds 5, 6 and 7, the
policy re-audit's W1-W4, the under-13 rule and Erase, D70 and D71, and the D70/D71
review of the same day, its third round included; and 2026-11-20 for D72 (b) and D73.) The text
below is written for the state AFTER them; before them, §2.1, §2 (guest counts) and §6
are not true, and §2 (the warm-up notice), §7 (signing out) and §10 (the Keychain) are true
only of the build in step 7.

The owner's database steps are one checklist: supabase/README.md, section "2026-11-19:
migrations 011 and 012, three redeploys, and the sandbox Plus rows", "Every owner step, in
order" (it includes the 2026-11-18 section's steps). Steps 1-3b below are its items 1-10
(steps 1 and 2 are its item 1); its weekly check, step 7f, is not numbered there and is
in step 3b below.

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
   words rather than going: a build with the flag on fills in, once per account on each
   phone, the offsets the server lacks for every prediction that phone still holds with them
   (backfillOffsets in src/supabase/sync.ts: update-only requests that write an offset only
   where the server's is still empty), but a prediction no phone holds with its offsets
   (one pulled from the server, or signed out of before that build's backfill reached it:
   sign-out's last push, pushNow, doesn't run it) has none on the server to bring back.
3b. Enable pg_cron, then apply migration 012 and check it (the checklist's items 7-10,
   with step 7e the day after). §6's "13 months" for usage counts is true only while 012's
   daily job (purge-old-usage-counts) runs: nothing else deletes them. The job deletes
   them once they're more than 13 months old by the server's time of receipt, in batches
   (at most 200 batches of 5,000 or 25 seconds per table a night, so a large backlog takes
   more than one night). Then, every week for as long as the project runs, the README's
   step 7f (not numbered in the checklist): its read-only queries show the purge's and the
   storage ceiling's last 7 runs succeeded, and the ceiling not reached. Keep pg_cron
   enabled (Supabase: "Disabling the pg_cron extension will permanently delete all Jobs").
   No sentence below depends on the storage ceiling, the second job 012 schedules: while
   it holds (400 MB, checked every 5 minutes), new predictions, changes that add text and
   usage counts wait on the phone, which changes nothing the policy says.
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
   c7bf083 on; TestFlight builds 2 to 4 predate them. Round 5's (commit 7b5b0ea) and
   round 6's (2026-11-19, uncommitted when this was written) are true only of a build that
   carries both: sign-out removing the account's data from the phone, asking first about
   categories kept only on the phone, and keeping the counts (§7); the session in the
   Keychain (§10); and guest counts waiting for the warm-up's notice (§2). The Keychain
   needs expo-secure-store and the Apple nonce expo-crypto, both native, so that is a new
   development and TestFlight build. Round 7's (2026-11-19, uncommitted when this was
   written; JavaScript only) adds §7's "the app says so" when the session can't end after
   the data was removed, and §2's account of what the warm-up's line says; the same build
   carries it if it is built from the final commit. Publish with, or after, that build. Redeploying
   delete-account (the checklist's item 11) is not needed for any sentence here, but makes
   the Apple revocation check live. D70 and D71 (commits e77431e and b2557b0, plus
   round three's fixes; JavaScript only, no new native package)
   are true only of a build that carries them: §1's and §2's lines on the age range,
   RevenueCat and usage counts, §2.3's switch on the sign-in screen, §6's and §7's Erase,
   and §9. Publish with, or after, that build too. The D70/D71
   review's fixes (2026-11-19, in the same commits; JavaScript only) are part of what
   those sections say: the age range asked at every
   launch, RevenueCat and sign-in waiting for Apple's answer with no "then goes on", and
   the wider meaning of "under 13" in §9. A build made before them doesn't match §2 or §9.
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
   and out again there, Erase is used there on a build that carries D71 (a) (§7; earlier
   builds' Erase didn't touch them), or the app is deleted. Before the App
   Store this concerns TestFlight testers only; decide whether that needs a word to them.
10. The under-13 rule (§9, D70) is the main session's call on the owner's delegation and
   rests on legal readings the agent can't settle. Before the public US release: run the
   sandbox "Under 13" check on the iPhone (docs/HUMAN_VERIFICATION.md D4: Settings →
   Developer → Sandbox Apple Account → Manage → Age Assurance → "Under 13", then Erase in
   the app and relaunch; You should show "Kept on this phone"), and take the nine points
   under "For counsel" in docs/design/research/under-13-2026-11.md to a lawyer, among them
   whether what a frozen account already has on our server must be deleted (§9 says it
   stays until the account is deleted) and the sign-in renewals §9 discloses. If counsel
   changes the rule, §2's age-range paragraph and §9 change with it.
11. §8 is written for the launch storefronts the owner chose on 2026-11-19: the United
   States, Canada, Australia and New Zealand. The 27 EU storefronts and the UK are left
   out, so §8 has no GDPR wording. Before the UK or any EU storefront is added: appoint
   the representative the law asks for (UK GDPR Art 27; the EU GDPR's Art 27 for the EU),
   and add a section with the legal basis for each purpose, the legitimate interests
   behind usage counts, the transfer of data to the United States, and the right to
   complain to the ICO or an EU supervisory authority (UK GDPR Art 13 and its EU twin).
12. Canada: the owner's decision of 2026-11-19 is that Usage stats start off until
   chosen on phones set to Canada (Quebec's s. 9.1), unless counsel says otherwise. Built
   2026-11-20 (D72 (b), src/engine/usageStats.ts; JavaScript only), and §1, §2 and §2.3
   say so. Those sentences are true only of a build that carries it, so publish with, or
   after, that build (step 7), and after the device check in docs/HUMAN_VERIFICATION.md
   D6: the app reads the region from the JavaScript engine's locale, which should follow
   Settings → General → Language & Region → Region, and no iPhone has shown that yet.
13. D73 (2026-11-20, step 206; JavaScript only): the app no longer checks predictions and
   notes on the phone before a Coach request, shows no support message and keeps no list
   of messages set aside. §3 says nothing of that check, and §7 no longer lists that list
   among what sign-out, Erase and account deletion clear. The published page's
   paragraph about the check is removed in the same change (the owner, 2026-11-20): the
   check sent and collected nothing, so a page that doesn't mention it is true of every
   build, while a page that describes it is false of every build from step 206 on. It
   goes live when that change is pushed to `master`, with nothing to time against a
   build; set the page's effective date to the day of the push if it isn't 2026-11-20.
Once 1-9, step 10's sandbox check and step 12's device check are done, push. Delete the
rest of 10, and 11, one by one as each is done; the evidence notes below can stay.

Evidence for each claim (2026-11-18): src/analytics/events.ts (catalogue, props),
src/analytics/flush.ts (guest rows carry no user id), supabase/migrations/007 and 010
(guest table; hashed id, day-only times), src/store/warmupStore.ts:186 and
src/store/practiceStore.ts:121 (the warm-up score and practice tally sent),
src/store/predictionStore.ts:443 (confidence and whether it happened),
src/components/account/SignInView.tsx USAGE_NOTE (the sign-in notice), src/ai/coachContext.ts
and supabase/functions/coach/contract.ts parseContext (the Coach summary; built-ins
only), supabase/functions/coach/index.ts:282-294 (no account id sent to OpenAI),
src/store/authStore.ts signOut/deleteAccount/eraseDeviceData, src/supabase/auth.ts
endSession, src/supabase/account.ts, supabase/functions/delete-account/index.ts,
src/db/account.ts and src/db/client.ts:40-64 (secure_delete), src/age/ageRange.ts
(asked each launch until a band was stored; since the D70/D71 review, at every launch
whatever is stored, below), supabase/migrations/009 (name and picture stripped from
auth.users and auth.identities).
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
Round 7 and the policy re-audit (2026-11-19): src/store/authStore.ts signOut
(discardUnsynced agrees to nothing unless the question was asked for the account in this
run; SIGN_OUT_FAILED_AFTER_WIPE, "Couldn't finish signing you out, so you're still signed
in. Your backed-up predictions will come back to this phone; anything you agreed to lose
is gone.", shown and announced by src/components/settings/SettingsView.tsx),
src/components/warmup/UsageStatsNotice.tsx WARMUP_USAGE_NOTE ("Fairly Sure sends a few usage
counts, with no account or device id, to see how the app is used. You can turn this off
here or in You.": §2's "and what they're for"; policy re-audit L1), supabase/
migrations/012 section 3 (the storage ceiling: no sentence here depends on it),
src/supabase/sync.ts backfillOffsets (header step 3a), "What we never collect" opening on
"Precise location" (W1: once sent, the offsets are Coarse Location, docs/APP_PRIVACY.md
§1, and the request logs can record a country), node_modules/react-native-purchases
10.9.0 and node_modules/@revenuecat (no time zone named anywhere in them; the native iOS
SDK, PurchasesHybridCommon 18.33.1, comes through CocoaPods and isn't in node_modules).
2026-11-19, D70 and D71 (builder/owner-decisions, uncommitted when this was written), as
amended by the D70/D71 review the same day:
src/engine/ageBand.ts isUnder13Band (any band that can include someone under 13: an upper
bound is set, and the lower bound is open or below 13. So (none, 12), (none, 13), (9, 12),
(12, 13), (none, 15), (none, 17) and (12, 15) count; (13, 15), (16, 17), (18, none) and no
band don't: §9's "includes ages under 13". Until the review an upper bound above 13 didn't
count); src/store/ageStore.ts (localOnly, the one field every gate reads; uploadsMayStart;
whenAgeSettled; LOCAL_ONLY_SIGN_IN; loadUnknown); src/age/ageRange.ts hydrateAgeGate,
ensureAgeBucket and recheckAgeBucketIfDue (asked once per launch wherever the API can run,
whatever band is stored, and again on a return to the app 24 hours after the last ask while
the rule applies or a band of 13 or over is known; uploads wait for the answer only with no
stored band, an under-13 one or one that can't be read, readStoredBand and
closeGateForUnknownBand, and with a stored band of 13 or over the ask runs in the
background; an under-13 answer closes the gate at once, a different 13-or-over answer is
saved, and a decline, "not available" or an error keeps the stored band: §2. Round two: a
stored-band read that fails is tried once more, and where Apple's API can never have run
(web, Android, iOS before 26) a failed read is "no band"; after Erase or account deletion
has cleared the band, src/store/ageStore.ts saves no answer for the rest of that run and
lifts nothing, though an under-13 answer still closes the gate in memory; src/ai/coach.ts,
src/ai/refine.ts and src/notifications/trialReminder.ts also wait for Apple's answer,
uploadsMayStart);
src/age/localOnly.ts (on entering the rule: queued usage events cleared, the warm-up
notice's stamp forgotten, the session's background refresh stopped, the Coach cleared; once
uploads may start: the refresh resumed, resumeSessionRefresh); src/age/egress.test.ts (every
file that can send over the network is listed with a pinned count of each kind of network
call, no other file may import the Supabase client, and every entry point checks the rule
before its first request, account deletion and sign-out excepted);
src/supabase/auth.ts refuseWhenLocalOnly (every sign-in and sign-up refused under the rule,
and refused with AGE_PENDING_SIGN_IN, "Sign-in isn't ready yet. Try again in a moment.",
while Apple's answer is still pending after a wait of at most 5 s; asked again after
Apple's and Google's sheets close, before anything goes to Supabase; signInWithGoogle's
comment: by then Supabase has already made or found the user at its own callback inside
the sheet, §9's sentence on Google) and pauseSessionRefresh; src/supabase/client.ts
(autoRefreshToken is on only when uploads may start; its comment and
src/supabase/auth.localOnly.test.ts, run against the installed auth-js 2.106.2: a stored
session already expired, or within 90 s of it, is still renewed as the client is made and
at getSession, whatever that setting, so a frozen account's sign-in is renewed each time the
app starts with it expired, and a signed-in account's can be renewed before Apple answers:
§9); src/supabase/sync.ts (syncNow, pushNow, backfillOffsets and the check before each
request send nothing under the rule; on a launch that waits, a sweep waits at most 60 s
for the answer and then goes on); src/analytics/track.ts and flush.ts (nothing queued under
the rule; maySend re-checks uploadsMayStart, the Usage stats switch and a guest's notice
stamp before the queue is read and before every request);
src/components/warmup/usageNotice.ts usageCountsMayGoUp; src/ai/coach.ts
(no request); src/billing/revenuecat.ts apiKeyForPlatform and src/billing/init.ts
(RevenueCat never configured on a local-only phone, and on a launch that waits for Apple
never before the answer, with no time limit: startBilling. The paywall waits at most 5 s,
ensureBillingStarted, then shows that the plans couldn't load, and loads them once the
answer is in. A sign-out before RevenueCat has started only sets the Plus mirror to free.
With a stored band of 13 or over RevenueCat starts at launch as before, so an under-13
answer that arrives later finds it configured for that run: §2. Round two,
src/billing/revenuecat.ts dropCachedAccount and identity: when RevenueCat starts with
nobody signed in and its SDK still holds an account from a sign-out it never saw, that
account is logged out of RevenueCat before any entitlement is read; if the SDK can't say
whether its user is anonymous, reads report "couldn't find out" and purchases
"unavailable" until a sign-in or the next launch: §2);
src/store/ratingStore.ts (no rating prompt, and none while the answer is pending);
src/supabase/account.ts (deletion left open: it removes data);
src/components/age/localOnlyCopy.ts (You's words; none names an age).
D71: src/db/account.ts wipeEverythingOnDevice and src/store/authStore.ts eraseDeviceData
(the Log draft cleared first; then every PER_USER_TABLES table emptied for every account
id, with the age band, warm-up and practice, in one transaction; then every later step in
its own try, so one failing doesn't stop the rest; every account's sync cursor cleared; the
settings, the entitlement mirror and the "signed out here" list of account ids stay, and
nothing in eraseDeviceData or src/billing/ logs RevenueCat out or resets it, so its
anonymous install id stays: §7's Erase); src/components/account/DeleteAccountView.tsx
(Erase's words: "everything Fairly Sure keeps on this phone, including anything left by an
account that was signed in here before", ending "Settings, like reminder times, and whether
this phone has Fairly Sure Plus stay."; eraseConfirmMessage and
authStore.countUnsyncedAccountChanges: the alert counts, at the tap, changes earlier
accounts never pushed, "N changes an account made on this phone never reached our server
and will be lost."; round two: the read gives up after 3 s, ERASE_COUNT_WAIT_MS, and a
count that can't be read says "Changes an account made on this phone may not have reached
our server; if so, they will be lost."; eraseStep in authStore: a cleanup write that
doesn't land, the Log draft's, the answer run's, the settings' or the age band's, makes
Erase report that it couldn't finish, so it can be run again);
src/components/account/SignInView.tsx USAGE_NOTE and USAGE_OFF_NOTE with
src/components/settings/UsageStatsSwitch.tsx (the sign-in screen's switch: §2.3).
2026-11-20, D73 (step 206, builder/owner-list-19-30): src/ai/crisisFilter.ts,
src/engine/supportAside.ts and src/components/stats/SupportSurface.tsx removed, so nothing
checks titles or notes before a Coach request and no set-aside list is kept;
supportAsideKeys gone from src/store/settingsStore.ts, and a stored settings record that
still holds it is rewritten without it when settings load (§3, §7).
Public pages read 2026-11-19:
- RevenueCat, Apple App Privacy (https://www.revenuecat.com/docs/platform-resources/
  apple-platform-resources/apple-app-privacy): "RevenueCat does not collect precise or
  coarse location data, only locale and currency code". Hence §2 and §4 no longer say
  "time zone" (policy re-audit W4).
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
  the law requires or to protect against harm. §3 now gives the exception in the words
  the policy audit of 2026-11-19 took from that page, "unless longer retention is required
  by law, or is reasonably necessary to protect its services"; the docs sweep that put
  them in made no network request, so re-read the page before publishing.
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
  the warm-up has told you so; you can turn them off there or in You (§2). On an
  iPhone whose region is set to Canada they start off, and none are sent unless
  you turn them on. None are sent if Apple says this iPhone's age range is under
  13 (§9).
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
you a line saying so and what they're for (to see how the app is used), with a
switch to turn them off (the same switch as You → Usage stats). Until then they
wait on the phone. On an iPhone whose region is set to Canada that switch starts
off: no usage events are kept for sending and none are sent until you turn it
on, there, in You or on the sign-in screen, and the warm-up's line says so. On an iPhone running iOS 26 or later, on a launch where the
app doesn't yet hold an age range of 13 or over from Apple (below), they also
wait for Apple's answer, and if the
range is under 13 none are kept for sending and none are sent (§9). They carry the event's details (§2.3) and no account, device or install identifier. Our server replaces each
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
service that manages subscriptions, each time it starts. On an iPhone running iOS 26
or later, on a launch where it
doesn't yet hold an age range of 13 or over from Apple (below), it waits for
Apple's answer first, however long that takes: if you open the Plus screen
sooner, the plans don't load until the answer is in. If that answer is under
13, RevenueCat isn't started, on that launch or any later one while the range
stays under 13 (§9). On an iPhone that had already shared a range of 13 or
over, the app starts RevenueCat at launch as usual; if Apple's answer then
turns out to be under 13, the app asks RevenueCat for nothing more (a request
already on its way completes), but RevenueCat's code stays running until the
app is next closed, and can refresh its purchase information on its own
meanwhile; it isn't started again from the next launch. If you signed out
while RevenueCat wasn't running, the app signs that account out of RevenueCat
the next time it starts RevenueCat, before reading whether you have Plus, so
an earlier account's Plus can't show for someone who isn't signed in. Without an account
that request carries a random identifier RevenueCat makes for this install,
not your name, email or anything you typed, along with the technical details
any app request carries (such as your IP address, the app version and
language). None of your predictions are sent.

On an iPhone running iOS 26 or later, the app asks Apple for an age range
once its first screen is up, at each launch, and, while it holds a range or
the under-13 rule applies (§9), again when you come back to the app a day or
more after it last asked. Apple, not the app, decides whether you see its
question again or it answers from what you chose before. The app asks each
time because the range it stores belongs to this copy of the app, not to an
Apple Account: an iPhone handed to someone else, or set up from a backup,
would otherwise keep the earlier range. If you share one, only the age band — a
lower and an upper bound, not your birthday — is stored on the device. It is
not sent to us. A band that includes ages under 13 turns off signing in,
backup, usage counts, the Coach and Fairly Sure Plus (§9) as soon as it
arrives, stopping a backup or a send of usage counts that is under way before
its next request; any other band, or none, changes nothing. If you decline, or
Apple can't answer, a band you shared before stays. If the stored band can't
be read, the app treats the iPhone as under 13 until Apple answers with a band
of 13 or over. While the app is waiting for Apple's answer and doesn't yet
hold a band of 13 or over, signing in waits up to 5 seconds and is then
refused for the moment ("Sign-in isn't ready yet. Try again in a moment."),
and the Coach sends nothing until the answer is in.
Erase and account deletion remove the band with the rest of the on-device
data. For the rest of that session the app stores no band, even if Apple
answers a question that was already under way (an under-13 answer still
turns everything off for that session), and it asks again at the next launch.

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

These are linked to your account. The sign-in screen says so before you sign
in, including that events recorded before you signed in and still on the phone
go with your account, and it has a switch to turn them off (the same switch as
You → Usage stats); while they're off, it says none are sent. On an iPhone
whose region is set to Canada the switch starts off, so none are sent, before
or after you sign in, until you turn it on. **You can turn
them off** there or in You → Usage stats. (The few sent before you sign in
carry no account, device or install identifier, as described above, so they
can't be found or deleted as yours.)

**2.4 Purchase status.** Whether you have Fairly Sure Plus, which plan, and when it
renews or ends. We receive this from our subscription provider (§4). We never
see your payment details.

**2.5 Coach usage count.** If you use the Coach, a daily count of requests, to
enforce usage limits.

### What we never collect
Precise location, contacts, health or fitness data, financial accounts, photos, or your
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
use for up to 30 days, unless longer retention is required by law, or is
reasonably necessary to protect its services.

## 4. Who else handles your data

| Service | What it receives | Why |
|---|---|---|
| **Supabase** (database, sign-in and our server functions; servers in the United States) | Everything in §2.1–2.5, the guest usage counts in §2, and the IP address each request arrives with | Stores your account and backed-up predictions, and runs our server |
| **OpenAI** | The statistics summary in §3, only when you request Coach feedback, without your account id or email | Generates Coach feedback |
| **RevenueCat** | An account identifier (a random one for this install if you haven't signed in), your App Store purchase records, and the technical details of each request (such as IP address, app version and language) | Manages subscriptions |
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
  your account on this phone, use Erase on it after signing out, or delete the
  app), or delete the app. If you
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
  nothing you wrote, stay (unless they can't be read at that moment; then they
  are replaced, as described under Erase below).

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
you use Erase there or delete the app there. A phone you signed out on keeps the account's counts
of deleted, late-changed and moved predictions (see "Signing out"), which hold
no words, until you use Erase there or delete the app there.

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
this phone hasn't backed up yet (except on an iPhone whose age range is under
13, where no changes are sent, §9). If some can't be sent, for example without a
connection, or if you have categories that are kept only on this phone (ones
you added, renamed, gave an icon or hid), the app says how many and asks before
going on. If you go on, those categories are removed, and those changes don't
reach our server: a prediction, answer, edit or note that wasn't sent is lost, and a
deletion that wasn't sent waits on this phone until you sign in to the account
here again. If anything more of that kind appears before your data is removed,
the app stops and asks again.

Then your account's data is removed from this phone: its predictions and
reflections, the categories you added and any names, icons or hiding you set
for categories, and usage events not yet sent, along with the exported files, card
images and pictures the app left in the phone's cache. If that can't
finish at once, the app tries again the next time it opens. The counts of
deleted, late-changed and moved predictions that only this phone keeps (they
hold no words) stay on the phone, so signing out and back in doesn't clear them.

It then ends your session on this phone. With a connection, it also ends your
sessions on every other device. Without one, our server isn't told, but this
phone no longer holds anything that could use the session; it ends the next
time you sign out with a connection, or when you delete your account. If even
this phone can't end the session, you stay signed in, and the app says so. If
your data had already been removed from the phone, what was backed up comes
back from our server; what you agreed to lose, above, doesn't. (On an iPhone
whose age range is under 13, what was backed up stays on our server and
doesn't come back to the phone while that lasts, and the app says so, §9.)

Signing back in brings back your predictions and reflections from our server.
Category names, icons and hiding are kept only on the phone, so they don't come
back, and neither do the time-zone offsets in §2.2 unless your version of the
app backs them up. Your warm-up, daily practice and age band belong to the
phone rather than the account, and stay, as do your settings (unless they
can't be read when you sign out; then they are replaced, as described under
Erase below). Reminders for the
account's predictions stop, and any on the lock screen showing a prediction's
words are cleared.

When a phone's session ends some other way, for example because you signed
out on a different phone, that phone keeps its copy of your data, out of view,
until you sign in and out again there, use Erase there, or delete the app there.

Without an account, **You → Erase your data on this phone** removes everything
Fairly Sure keeps on the phone, whoever's account it was under, except four
things that hold nothing you wrote: your settings (switches and reminder times),
whether this phone has Fairly Sure Plus, what RevenueCat's code keeps on the
phone (§2: its identifier for this install, or for an account that signed out
while RevenueCat wasn't running, until RevenueCat next starts, and the purchase
status it last read), and the ids of accounts that signed
out here, which stop an old sign-in from coming back. (If the saved settings
can't be read when you erase, they are replaced with the ones the app is using
then, with each privacy choice on its more private setting.) Before it starts,
the app counts any changes that accounts signed in here before never sent to
our server, and says how many would be lost, or, if it can't count them, that
there may be some. If any part of the erase doesn't complete, the app says it
couldn't finish, and you can run it again. So it removes predictions and
reflections, categories and their icons, warm-up and practice answers, the age
band, a prediction you were still typing, usage events not yet sent, the counts of
deleted, late-changed and
moved predictions that signing out leaves, and anything else an account signed
in here before left behind, along with the exported files, card images and
pictures the app left in the phone's cache. What an account backed up stays on
our server until that account is deleted.

You can also email tapjason-dev@gmail.com to request deletion or a copy of your data.

## 8. Your rights

Depending on where you live, you may have the right to see the personal data
we hold about you, to have it corrected, to get a copy of it and to have it
deleted. Examples are the CCPA in California, PIPEDA in Canada, and the
Privacy Acts of Australia and New Zealand. You can export your predictions
yourself as CSV (You → Export predictions), delete your account in the app
(§7), or ask us for any of these at tapjason-dev@gmail.com. We'll respond
within 20 working days. We don't sell personal information as the CCPA
defines it.

Your data is stored in the United States (§4), which may be outside the
country you live in.

If you have a complaint about how we handle your data, please write to us
first, at the same address. If you aren't satisfied with our answer, you can
complain to the Office of the Privacy Commissioner of Canada, the Office of
the Australian Information Commissioner, or New Zealand's Office of the
Privacy Commissioner.

## 9. Children

Fairly Sure is not directed to children under 13, and we don't knowingly collect
their personal information.

If the age range an iPhone shares with Fairly Sure (§2) includes ages under 13
(this policy calls that "under 13"), the app keeps what you log on the phone.
There is no signing in, no backup, no usage counts and no Coach, and Fairly Sure
Plus isn't offered, so RevenueCat isn't started (§2 says what happens if it was
already running when the range arrived). It doesn't ask for an App Store rating
either. Everything else works as usual, and You → Export predictions keeps a
copy. The app explains this in You without saying an age. If the range shared
later is 13 or over, the app goes back to working as the rest of this policy
describes.

"Includes ages under 13" is read widely, so that the rule errs on the side of
sending nothing. Apple's ranges can differ by region. Where they have no
boundary at 13, a range such as "15 or under" or "17 or under" counts as under
13 too, so in those regions people aged 13 to 15, or to 17, get the same
on-phone-only app.

The app checks the range before a sign-in starts and again when Apple's or
Google's sign-in sheet closes, before anything is sent to our server. Two gaps
remain, both only when an under-13 range arrives during a sign-in on an iPhone
that had shared a range of 13 or over before: a sign-in with an email address
and password that was already sent goes through, and with Google, our sign-in
service has already created or found the account by the time Google's sheet
closes, so the account exists on our server even though the app refuses to use
it.

If an account was already signed in on that iPhone, it stays signed in but is
frozen: nothing new is backed up, nothing is deleted from our server, and its
predictions stay on the phone. What was backed up before stays on our server
until the account is deleted, and Sign out and Delete account still work; since
nothing can be backed up, signing out says how many changes haven't reached our
server and asks before removing them (§7). Apart from those two, one thing
still reaches our server: each time the app starts and that account's sign-in
has expired or is about to, the app renews it. That sends the sign-in's refresh token and,
like any request, the phone's IP address (which our sign-in service records,
as in §2.1), and none of your predictions. The same renewal can happen for any
signed-in account at a launch where the app is still waiting for Apple's
answer. On such a launch, if Apple hasn't answered within a minute, a signed-in
account's backup goes ahead as usual, and signing out sends unsent changes
after waiting up to 5 seconds; if the answer then says under 13, backup stops
before its next request.

If you believe a child has created an account, contact us and we'll delete it.

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
usage counts and what an offset can say about where you are; after the policy re-audit,
"Precise location" in "What we never collect", and no "time zone" for RevenueCat; for D70 and
D71, the under-13 rule in §2 and §9 and the sign-in screen's switch; after the D70/D71
review, the sign-in renewals and the two sign-in gaps in §9, and §8 rewritten for the four
launch storefronts), removes one (for D73, 2026-11-20: the on-device check of predictions
before a Coach request and the list of support messages set aside, which the published
page still describes in §3) and changes what signing out
does (it now removes the account's data from the phone, all but the counts only the phone
keeps, and asks first about categories kept only there) and what Erase does (it now removes
everything the app keeps on the phone, those counts included). The app isn't on the App Store yet, so
no in-app notice seems needed for it; confirm, and remember that §11 promises one for
later changes. -->

## 12. Contact

Jason Zou · tapjason-dev@gmail.com
