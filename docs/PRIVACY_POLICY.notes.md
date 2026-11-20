# Privacy policy: working notes

Not published (`docs/_config.yml` keeps every `.md` but the three pages off the site).
These notes were the header comment of `docs/PRIVACY_POLICY.md` while that rewrite was
held. They moved here when it was published, because an HTML comment is in a published
page's source. Not legal advice.

## Where this stands

**Published 2026-11-20**, effective that day, at
https://tapjason.github.io/calibrate-app/privacy/, with `docs/SUPPORT.md` at `/support/`.
The owner, that day: "D4 and D6 pass. Please continue with the policy and commit, merge,
push anything remaining." The two pages they replace (`docs/PRIVACY_POLICY.live.md` and
`docs/SUPPORT.live.md`, what `master` published on 2026-11-18 less the on-device-check
paragraph) are deleted in the same commit; git has them.

What publishing waited on, and how each was met:

- The server steps 1 to 3b below: done and checked on the live database (HANDOFF.md).
  The day-after check 7e and the weekly 7f go on.
- A build from `master` on the owner's phone (step 7): production 1.0.0 (7) from
  `590ab75`, and a development build from `defdeb0`, both 2026-11-20.
- The sandbox "Under 13" check (step 10, `docs/HUMAN_VERIFICATION.md` D4) and the Canada
  check (step 12, D6): the owner reported both pass, 2026-11-20.
- Step 5's date: November 20, 2026.
- Step 6: both OWNER comments were resolved and removed on 2026-11-20 (notes (a) and (b)
  below).
- OpenAI's data-controls page was re-read that day; §3's exception was widened to match
  it (the last note in this file).

The owner decided on 2026-11-20 that there is no beta stage, so the timing notes in steps
7, 8 and 9 about TestFlight testers concern his phone alone.

Still open, each of which changes the text when it happens:

- Counsel: the nine points and Quebec by region (step 10; SHIP_READINESS items 2 and 34).
- OpenAI's Data Processing Addendum (note (a)): then OpenAI joins §4's "on our behalf"
  sentence.
- The UK or any EU storefront (step 11).
- A build with `UTC_OFFSET_SYNC` on (step 3a).
- A Supabase plan above Pro, or Point-in-Time Recovery (step 4): the "7 days" change first.
- The next change that matters after release needs the in-app notice §11 promises, which
  isn't built (note (b)).

No reviewer has read the text since the refinements of 2026-11-20 (reflowed sentences, the
two OWNER comments, §3's exception); `/release-gate`'s policy audit is the next read.

## The steps and the evidence, as written while the page was held

Kept as the record of what each sentence rests on. "Below" and "the text below" mean
`docs/PRIVACY_POLICY.md`.

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
   D6: the app counts a phone as Canada when either the Region setting (expo-localization's
   regionCode) or the region of the language (the JavaScript engine's locale) is CA, since
   the review of 2026-11-20, and no iPhone has shown how it reports either yet.
13. D73 (2026-11-20, step 206; JavaScript only): the app no longer checks predictions and
   notes on the phone before a Coach request, shows no support message and keeps no list
   of messages set aside. §3 says nothing of that check, and §7 no longer lists that list
   among what sign-out, Erase and account deletion clear. The published page's
   paragraph about the check is removed in the same change (the owner, 2026-11-20): the
   check sent and collected nothing, so a page that doesn't mention it is true of every
   build, while a page that describes it is false of every build from step 206 on. It
   goes live when that change is pushed to `master`, with nothing to time against a
   build; set the page's effective date to the day of the push if it isn't 2026-11-20.
Steps 1-9, step 10's sandbox check and step 12's device check were done by 2026-11-20, and
the page was published that day (the top of this file). The rest of 10, and 11, stay open;
delete each as it is done.

The two OWNER comments that stood in the text, resolved 2026-11-20 (main session, on the
owner's "Refine the held privacy policy"; each is his to overturn):
(a) OpenAI's Data Processing Addendum (§4). The text says only what OpenAI's public
   data-controls page says, and names Supabase and RevenueCat alone as handling data on our
   behalf; that is accurate with or without the addendum, so nothing in the text waits on
   it. When the owner has executed the addendum from the platform account that holds the
   Coach's key (SHIP_READINESS "The owner's list" item 9; it could not be read on
   2026-11-18, HTTP 403), add OpenAI to §4's "on our behalf" sentence. Apple Guideline
   5.1.1(i) asks the policy to confirm that every third party gives the same or equal
   protection, which is why it is worth doing before submission.
(b) §11's promise of an in-app notice. This version adds disclosures (sign-in logs,
   session IP addresses, retention, the warm-up and practice tallies, the warm-up notice,
   the time-zone offsets, Apple's crash reports, the country in request logs, the 13
   months for usage counts, the under-13 rule, the sign-in screen's switch, the sign-in
   renewals and the two sign-in gaps in §9, §8 for the four launch storefronts), removes
   one (D73: the on-device check before a Coach request) and changes what signing out and
   Erase do. No in-app notice is needed for it: the app isn't on the App Store and, since
   the owner's decision of 2026-11-20, has no testers, so nobody is under the earlier
   version. §11 promises a notice for later changes that matter; the first one after
   release needs that built.

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
  the policy audit of 2026-11-19 took from that page. Re-read 2026-11-20, before
  publishing (HTTP 200, no redirect, no date on the page): the sentence on training is
  unchanged, and the exception now reads in full "unless longer retention is required by
  law, or is reasonably necessary to protect our services or any third party from harm".
  §3 had stopped at "its services"; it now carries the whole exception, and its "read"
  date is November 20, 2026.
