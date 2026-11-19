# Fairly Sure — App Privacy declarations

**As of:** 2026-11-19 (revised after round 6 of the security review, whose code was uncommitted on `builder/review-2026-11-18` that day, and after round 5, commit `7b5b0ea`; revised after the security and policy review of 2026-11-18; checked against the code after step 187; policy audit of step 180 on 2026-11-15; first written 2026-09-24) · Derived from the code, not from intent.

**Answers that depend on owner steps or a build** (2026-11-19): the guest counts carry a
hashed id and day-only times only once migration 010 is applied, and wait for the
Warm-up's notice only in the build that carries round 5; the two UTC offsets (the
logging's and the rewording's) are sent only once migration 011 is applied and
`UTC_OFFSET_SYNC` is turned on in a shipped build, and from that build the form gains
their row (§1, the offsets row: Coarse Location is the recommended answer); usage counts
are deleted after 13 months only once migration 012 is applied and its pg_cron job runs.
The Name row is now proposed as **Yes** either way (below; the audit-log steps still
matter for the privacy policy). The privacy policy's header lists the same steps.

This is the answer sheet for App Store Connect → App Privacy, and the source
for the privacy policy text. Every row cites the file that proves it. If a
claim here ever stops matching the code, the code is right and this file is a
bug — re-derive it rather than patching the prose.

The short version:

- **Nothing is used for tracking.** No ad networks, no IDFA, no analytics SDK,
  no crash reporter of the app's own, no cross-app or cross-site linkage.
  `package.json` has no third-party analytics or attribution dependency at all.
  **No ATT prompt is required.** (Apple shares crash reports through App Store
  Connect from TestFlight testers and from people who share analytics with app
  developers; Apple's page: "You are not responsible for disclosing data collected
  by Apple.")
- **From someone who never signs in, only a few usage counts, with no id.**
  The whole core loop — log, resolve, stats, share — runs offline against local
  SQLite, and sync has nothing to sync. Eight funnel events go up to
  `guest_analytics_events` with no user, install or device id (D43;
  `src/analytics/flush.ts`, `GUEST_EVENT_NAMES`), since step 186 applied
  migration 007 on 2026-11-16; before that nothing left a guest's phone. From
  round 5's build, only after the Warm-up's first screen has shown the line about
  them and the Usage stats switch (D69 (b); `UsageStatsNotice` saves
  `usageNoticeShownAt` when it is drawn, and `usageCountsMayGoUp` in
  `src/components/warmup/usageNotice.ts`, checked before every flush in
  `app/_layout.tsx`, waits for it). Once migration 010 is applied, the server
  replaces each event id with a hash and keeps only the UTC day; once migration 012
  is, a daily job deletes them 13 months after the server received them. Not
  "unlinkable": the request arrives with an IP address (the hosting provider's
  logs), and Postgres internals can still group one batch's rows (§3).
- **Freetext never reaches the AI.** The one feature that would have sent it,
  Refine, is cut from v1 (2026-09-24). The Coach sends numbers only.

---

## 1. What Apple asks, and the answer

| Apple data type | Collected | Linked to identity | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Contact Info → **Email address** | Yes | Yes | No | App Functionality (account + sync) | `src/supabase/auth.ts` — email/password, Sign in with Apple (the email scope only) and Continue with Google (step 192, the system sign-in sheet, no Google SDK) |
| Contact Info → **Name** | **Proposed: Yes** (the owner's answer to enter) | Yes | No | App Functionality | Google sends a name and a picture URL with the email and Supabase can't be told not to ask. Two triggers remove those keys from `auth.users` and `auth.identities` as the row is written (`supabase/migrations/009_strip_provider_profile.sql`; both confirmed on the live project 2026-11-18). **Why Yes anyway (2026-11-19):** Supabase Auth's audit log stores each sign-in's `actor_name` from `full_name` (the security review, 2026-11-18). Written to the database by default, where nothing deletes it; and **even with "Write audit logs to the database" off** (Authentication → Configuration → Audit Logs) and `auth.audit_log_entries` purged, the audit events still go to Supabase's own log storage, kept 24 hours on Free and 7 days on Pro. Apple counts data as collected when it stays accessible "longer than what is necessary to service the transmitted request in real time" ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/), read 2026-11-19), and a day or a week is longer than that. Linked: the entry carries the account's email and id. Purpose: only signing in; nothing reads the name. Turning the database writes off and purging the table still matters for the privacy policy's "until those are deleted" (§6 there). A test Google sign-in after build 4 confirms the keys are gone from the tables (`HUMAN_VERIFICATION.md` A6) |
| User Content → **Other User Content** (prediction titles, reflections) | Yes | Yes | No | App Functionality | `PredictionWireRow` (`src/types/index.ts`); `src/supabase/sync.ts` |
| Location → **Coarse Location**: the two **UTC offsets** stored with each prediction (minutes from UTC when it was logged and when it was reworded; D69 (f), as refined in round 6) | **No until they're sent; then Yes: the recommended answer** (the owner's to enter, from the build that turns `UTC_OFFSET_SYNC` on) | Yes | No | App Functionality | Stored on the phone (SQLite migration `018_utc_offsets`: `created_utc_offset_min` and `title_edited_utc_offset_min` are written; the column `resolved_utc_offset_min` stays, unused since round 6, and is never sent). Sent only once Supabase migration 011 adds the two columns and `UTC_OFFSET_SYNC` (`src/constants/app.ts`, **false** on 2026-11-19) is turned on in a shipped build, and then in the same `PredictionWireRow` as the prediction, under the account (`src/db/predictions.ts`). Used only by the same-day rule (`src/engine/sameDay.ts`, judged in the zone the prediction was made in) and the late-change exemptions (`src/engine/corrections.ts`); nothing derives a place from them. **Why Coarse Location (the policy auditor's strict reading, 2026-11-19):** some offsets are used by only one country (UTC+05:45, Nepal: the privacy policy's header cites the page), and Apple defines Coarse Location as "Information that describes the location of a user or device with lower resolution than a latitude and longitude with three or more decimal places, such as Approximate Location Services" ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/), read 2026-11-19). Linked: stored with the account's predictions. Purpose: App Functionality ("enable features", Apple's definition), nothing else. The lighter reading, folding them into Other User Content like the prediction's timestamps, is set aside: an offset says more about where the person is than a timestamp does. The privacy policy says so under "What we never collect" while the offsets aren't sent and once they are. Until that build ships, nothing to declare: they stay on the phone |
| Identifiers → **User ID** | Yes | Yes | No | App Functionality, Analytics | Supabase auth user id; Apple's user identifier for a Sign in with Apple account (the identity token's `sub`, stored as `auth.identities.provider_id`; the privacy policy's "an identifier for your Apple ID"; delete-account compares it with the `sub` Apple returns, `supabase/functions/delete-account/`); Google's account id for a Google sign-in (`auth.identities.provider_id`); passed to RevenueCat as `appUserID`, `src/billing/revenuecat.ts` (`configureBilling`) |
| Usage Data → **Product Interaction** | Yes | Yes | No | Analytics, App Functionality (the Coach's per-account request count, `supabase/migrations/002_coach_usage.sql`) | `src/analytics/events.ts` — closed catalogue: numbers, yes/no values and fixed labels (`PAYWALL_SOURCES`, `SHARE_SURFACES`); `warmup_completed` carries the Warm-up's 0–100 score and `practice_completed` the number right, guests included. A guest's funnel events carry no account, device or install id (D43), and from round 5's build are sent only after the Warm-up's first screen has shown the notice and switch (D69 (b), `usageCountsMayGoUp`); queued ones move to the account at sign-in (`migrateGuestDataToUser`). Apple asks per data type, and a signed-in person's are linked, so answer **linked**. Kept 13 months (D69, owner 2026-11-19): once migration 012 is applied, a daily `pg_cron` job deletes rows of `analytics_events` and `guest_analytics_events` received more than 13 months earlier, by the server's `received_at`, and an account holds at most 100,000 rows of `analytics_events` (a refused insert, `PT429`, leaves the phone's queue in place; `supabase/migrations/012_usage_counts_retention.sql`) |
| **IP address** (not a data type of its own) | **Owner's call; see the note** | Yes (where stored with an account) | No | App Functionality (security, keeping the service running) | Stored in three places (2026-11-18): Supabase's request and sign-in logs (1 day on Free, 7 on Pro; auth audit logs 24 hours on Free); and, linked to the account and kept while each session lasts, `auth.sessions.ip` with `user_agent`, written on every token refresh (supabase/auth migration `20231027141322_add_session_refresh_columns`; `RefreshTokenGrant` in `internal/tokens/service.go`); sessions last until a sign-out with a connection or the account's deletion ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions): "By default, it lasts indefinitely"). Supabase's request logs can also record the country a request came from: the API gateway's `edge_logs` carry `metadata.request.headers.cf_ipcountry`, "not necessarily populated on every event" ([Log sources and fields](https://supabase.com/docs/guides/observability/log-field-reference), read 2026-11-19; policy re-audit N4; the privacy policy says so); nothing in the app or its functions reads it. Apple: "You collect and store IP address from your users. Declare the relevant data types based on how you use IP address, such as precise location, coarse location, device ID, or diagnostics." Nothing in the app or its functions derives a location from it or uses it for ads or tracking. Candidate answer, kept as proposed, for the owner (or `policy-auditor`) to settle: **Diagnostics → Other Diagnostic Data**, or **Other Data Types**, Collected, Linked, App Functionality; whether the logs' country makes it Coarse Location is part of the same call (once the offsets are sent, Coarse Location is declared anyway, Linked, App Functionality, the offsets row above, and the logs' country fits under it). RevenueCat's SDK requests also arrive with an IP address (RevenueCat's own records) |
| Purchases → **Purchase History** | Yes | Yes | No | App Functionality, Analytics (`purchase_completed` carries the plan and trial flags, `src/analytics/events.ts`; RevenueCat's guidance says both) | Apple IAP via RevenueCat; `supabase/functions/revenuecat-webhook/` |
| Identifiers → Device ID / Advertising | **No** | — | — | — | no ad or attribution SDK in `package.json` |
| Diagnostics (crash, performance) | **No** | — | — | — | no crash reporter in `package.json`. Apple's own crash reports reach App Store Connect from TestFlight testers ("automatically … regardless of the device settings") and from customers who share analytics with app developers ([Acquiring crash reports](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs), read 2026-11-19); that is data Apple collects, and Apple: "You are not responsible for disclosing data collected by Apple." The privacy policy says Apple may share them (§2 there) |
| Health, Financial Info, Location, Contacts, Browsing History, Sensitive Info | **No** (Location: until the UTC offsets are sent; then Coarse Location, the offsets row above. Precise Location stays No) | — | — | — | never requested, never collected; the app asks for no location permission |
| Other Data → age range | **No** | — | — | — | Asked of Apple on iOS 26+; only the band is stored on the device and never transmitted (`src/age/ageRange.ts`) |

"Finance" and "health" are *prediction categories the user picks* — a label on
their own sentence, not financial or health data in Apple's sense. The app
reads no accounts, no HealthKit, no transactions.

The age band is not a collected data type. Apple's nutrition label counts data
that leaves the device. The band does not: see §4a.

**The Coach's summary, for the owner to weigh (2026-11-18).** Our server stores none of
it (only the daily count, `coach_usage`), and OpenAI receives no account id
(`supabase/functions/coach/index.ts`, the `messages` it sends). But OpenAI keeps
abuse-monitoring logs of API use "for up to 30 days" ([Data controls in the OpenAI
platform](https://developers.openai.com/api/docs/guides/your-data), read 2026-11-18),
which is longer than serving the request. If that counts as collection by a third-party
partner, the summary (scores, counts and rates derived from the person's predictions) would
be a row of its own, for example Other Data Types or Other User Content, Collected, **Not
Linked**, App Functionality. Not settled here.

---

## 2. Data sent off the device, and when

### Supabase (Postgres + Auth) — the backend of record
Only after sign-in. Predictions sync as `PredictionWireRow` — **including the
title and the reflection**, because they are the user's own record and have to
survive a reinstall — and, once migration 011 is applied and `UTC_OFFSET_SYNC` is
on in a shipped build, the two UTC offsets (§1). Local SQLite stays the source
of truth; sync is last-write-wins, except that an answered prediction never goes
back to open (the pull merge in `src/db/predictions.ts`, and a trigger in
migration 011), and a phone that deleted a prediction without having heard of an
answer given to it elsewhere doesn't remove that answer: the server delete is
conditional (only an open row, or one answered no later than the deletion), and the
deleting phone restores the answered row and drops its tombstone (round 6;
`pushDeletions` in `src/supabase/sync.ts`, `reconcileTombstoneWithRemote` in
`src/db/predictions.ts`). Every failure is swallowed (`src/supabase/sync.ts`).

Signing out (rounds 5 and 6, D69 (a)) pushes once more, asks if anything would be
lost for good (changes not yet on the server, categories only this phone has),
checks again just before the wipe, deletes the account's rows from the phone except
this phone's integrity counts (counted deletions, late changes, moved answers and the
categories remembered for them: ids, dates and category ids, never synced), and then
ends the session (`authStore.signOut`, `docs/ACCOUNT_SPEC.md` §2); signing back in
pulls the rows again. The session itself is in the iPhone Keychain
(`src/supabase/sessionStorage.ts`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), AsyncStorage
on web or when the Keychain can't be used. None of that changes what is sent.

Analytics events land in `public.analytics_events`, scoped to the user id, kept 13
months once migration 012 is applied (§1, Product Interaction).

### OpenAI — two features, both optional, both off the critical path

| Feature | What is sent | Trigger |
|---|---|---|
| ✨ **Refine**: not shipped (`REFINE_ENABLED = false`, the function not deployed). Declare nothing for it. | If it ever returns: the title just typed, nothing else. | An explicit tap. |
| **Coach** (Plus) | **Aggregated numbers only** — `CoachContext` is a calibration rating, per-category resolved counts / scores / rates, and deterministic pattern values. Its only strings are a built-in category id and an engine pattern key (such as `weakest_day_of_week`): a category the person added (`c-…`, named in their own words) is left out before the call (`src/ai/coachContext.ts`), and the server rejects any other category and any pattern key but the five the app sends (`weakest_day_of_week`, `weakest_day_score`, `weakest_day_answers`, `drift_<built-in>`, `drift_half_answers_<built-in>`, the last added 2026-11-19; `parseContext` in `supabase/functions/coach/contract.ts`; until 2026-11-18 any short lowercase key got through). Answers in an added category still count in `overall` and the weekday pattern, which name no category (the privacy policy §3 says so). No account id or email goes to OpenAI (`supabase/functions/coach/index.ts`, the `messages` it sends). | An explicit "Get feedback" tap. **Off by default** (`coachEnabled: false`, `src/store/settingsStore.ts`). |

Both calls go through Supabase Edge Functions that verify the caller's JWT;
the API key is server-side only and never ships in the binary
(`supabase/functions/refine/`, `supabase/functions/coach/`).

One consequence worth stating plainly in the privacy policy: **the Coach cannot
send a prediction's text, because the payload it is built from has nowhere to
put one** (`src/ai/coachContext.ts`; `CoachContext` in `src/types/index.ts`).
That is a structural property, not a policy.

Related: freetext *is* scanned on-device by the crisis pre-filter before any
Coach call, and a match routes the user to a support surface instead of the
model — the text still never leaves the device (`src/ai/crisisFilter.ts`).

### RevenueCat — subscriptions
Receives the Supabase user id as `appUserID` plus the purchase Apple reports.
No prediction data, no email. **Signed out**, the app still configures it at
launch to read the entitlement (`src/billing/init.ts`, `appUserIdFor`): the
SDK mints a random per-install `$RCAnonymousID` and sends it with the usual
request details (app version, locale, time zone). A blind playtest
(2026-11-04, run 4) saw this on launch with nothing on screen saying so; the
policy's "If you don't sign in" now does. It is not a device identifier and
isn't used for tracking, so it adds no row to the table above. Its webhook writes the entitlement back to
`public.entitlements` so the server can gate Plus without trusting the client.

### Apple
Standard IAP and, if chosen, Sign in with Apple (which may issue a private
relay address — the app treats it as any other email).

---

## 3. Why the analytics claim is defensible

`src/analytics/events.ts` is a whitelist, not a convention:

- Every event name is in `EVENT_NAMES`; an undeclared name will not compile.
- Every property is declared per event in `EVENT_PROPS`, and `sanitizeProps()`
  drops anything not declared — this is the last point before data leaves the
  device.
- `EventPropValue` is `number | boolean | PaywallSource | ShareSurface`. **There
  is no open string property type.** A prediction title cannot be put into an
  event, correctly or by accident, because there is no field shaped like one.
- The queue is local (migration `006_analytics`), capped, push-then-delete, and
  flushes on foreground alongside sync. A guest's eight funnel events go to
  `guest_analytics_events` with an event id (`track.ts`: the millisecond in
  base 36, then random), the name, its props and the time, and no user,
  install or device id (D43). Once migration 010 is applied, a trigger
  replaces the id with `h_` and 32 hex characters of its SHA-256 and cuts
  `created_at` and `received_at` to the UTC day, and rows already stored are
  rewritten the same way. Once migration 012 is applied, the daily job deletes
  them, with signed-in rows, 13 months after `received_at`. **Don't claim the rows can't be linked to each
  other:** Postgres internals can still group one insert's rows, and each
  request reaches the hosting provider with an IP address (its logs: 1 day on
  Free, 7 on Pro). What is true: no account, device or install id, and nothing
  finer than the day. Their other events, and funnel events still queued
  because the notice hadn't shown yet, move to the account on sign-in
  (`migrateGuestDataToUser`), so they are sent then; the policy and the
  sign-in screen's `USAGE_NOTE` say so. Turning usage stats off clears the
  queue first (`clearEvents`) and sends nothing more.
- **Nothing a guest records is sent before the notice** (round 5, D69 (b);
  guideline 5.1.1(ii) asks for consent "even if … anonymous"). The Warm-up's
  first screen carries "Fairly Sure sends a few usage counts with no account or
  device id. You can turn this off here or in You." with the Usage stats switch
  (`UsageStatsNotice`), and the root layout flushes only when
  `usageCountsMayGoUp()` says so: signed in, or the notice seen. "Seen" is a saved
  stamp, `usageNoticeShownAt` in the settings store, written when the notice is
  drawn (commit `7b5b0ea`). A phone that finished the Warm-up on an older build
  (TestFlight build 2) has no stamp, and the notice is on the Warm-up's first
  screen only, so it sends nothing until it signs in (policy re-audit L4). Erase
  and account deletion clear the stamp.
- Users can turn it off: You → "Usage stats" (default on), and on that Warm-up
  screen. Renamed from "Anonymous usage stats" on 2026-10-04: the events are
  linked to the account, so "anonymous" contradicted this sheet.
- **Share links change nothing here** (2026-10-08, `src/share/link.ts`). A text
  share can end on an App Store campaign link, whose only parameters are the
  developer's provider token and a campaign name such as `share-card-text`:
  the same for everyone, with no user or install identifier. Apple counts the
  resulting downloads in App Store Connect, in aggregate, from five up. The app
  sends nothing and receives nothing.

The full list of events is 16 items and fits on a screen; the privacy policy can
reproduce it verbatim if that reads better than a summary.

---

## 4. Notifications — local only

The app requests notification permission and schedules **local** notifications
(due-day reminders, the weekly digest on the day and time the person picks, the
practice reminder, the trial-ending notice). It never requests a push token: no
`getExpoPushTokenAsync`, no device push token, nothing server-side that sends a
push (verified across `src/`, `app/`, `supabase/`).

Two consequences:
- **No push token is collected or transmitted** — declare nothing for it.
- **No APNs key is needed.** One would be only if remote push were added.

---

## 4a. Age range — on the device only

On iOS 26 and later, once the first screen is up, the app may call Apple's
Declared Age Range API (`expo-age-range` 0.2.21, entitlement
`com.apple.developer.declared-age-range`). The gates are 13, 16 and 18. If
Apple returns a band, SQLite stores only `lower_bound` and `upper_bound`
(migration `010_age_bucket`). It does not store who declared the age, parental
controls, or any install id. Web, Android, older iOS, a decline, and any error
store nothing — the SDK's fake adult answer on those platforms is not kept.

The band is not synced, not sent to analytics, and not sent to the Coach. No
feature reads it. Erase and account deletion delete the row. Apple enforces a
revoked consent by refusing to launch the app, so there is no server-side
rescind path.

## 4b. The app lock and the Region setting — on the device only

The optional lock (roadmap D64, `expo-local-authentication`) asks iOS to check
Face ID, Touch ID or the device passcode (`LAPolicy.deviceOwnerAuthentication`).
The app receives a pass or a failure with its reason (cancelled, no passcode
set), and reads which of these the phone has set up, to name the switch. No
face or fingerprint data, no passcode. Whether the lock is on is one device-local setting, not
synced and not sent to analytics. Info.plist carries
`NSFaceIDUsageDescription` ("Fairly Sure uses Face ID to unlock the app when
you turn on its lock."), set by the package's config plugin in `app.json`.
Nothing to declare on the App Privacy form for it.

`expo-localization` reads the phone's measurement system and Region setting to
choose feet and miles in the Warm-up's answer key. Read on the phone, sent
nowhere, stored nowhere.

## 5. Policy text this implies

The privacy policy URL App Store Connect requires must at minimum say:

1. What is stored and where — predictions, including their text, in Supabase
   (US region), tied to the account.
2. That AI features are optional, and exactly what each sends: refine sends the
   prediction text the user typed; the Coach sends aggregated statistics only
   and never prediction text or reflections.
3. That usage analytics are numbers, yes/no values and fixed labels, tied to
   the account, and switchable off in You; that a guest's few funnel counts go
   up with no account, device or install id, only after the Warm-up's first
   screen has said so with a switch; that the Warm-up's score and
   practice's tally are sent, though the answers aren't; and that usage counts
   are kept 13 months (once migration 012 runs).
4. That subscriptions are processed by Apple and managed via RevenueCat.
5. How to delete an account and its data.
6. That on iOS 26 or later the app may keep an age band from Apple on the
   device, and that the band is not sent off the device or used to lock a
   feature. The draft in `docs/PRIVACY_POLICY.md` says so.
7. That the time-zone offsets stored with each prediction go to the server once
   the app backs them up, and that an offset can say roughly where the person
   is, though nothing works out a place from it (the Coarse Location row, §1).
   The draft says so under "What we never collect", conditionally.

**Item 5 is built (2026-09-25).** You → Delete account calls the
`delete-account` Edge Function, which revokes Sign in with Apple (when its key
is configured), deletes the RevenueCat customer (when a write key is), and
deletes the auth user, whose rows cascade from every public table. The device
is wiped only after the server confirms. Guests get "Erase your data on this
phone". Deployed 2026-10-02; the keys were set on 2026-11-16, the RevenueCat one
under its right name, `REVENUECAT_DELETE_KEY` (renamed that day;
`docs/ACCOUNT_SPEC.md` §3.3). The RevenueCat leg is best effort: the account is
deleted even when it fails, and the policy says so. Since 2026-11-18 Apple is
revoked only when the code's Apple ID is the account's own (`supabase/README.md`,
delete-account; live once the function is redeployed), and a call that doesn't confirm is followed by a check of whether
the user still exists (`src/supabase/account.ts`).

**In-app disclosure for the Coach (Guideline 5.1.2(i), added 2025-11-13).**
Apple now requires apps to "clearly disclose where personal data will be shared
with third parties, including with third-party AI, and obtain explicit
permission before doing so". The Coach toggle is the explicit permission (off
by default, an affirmative switch, nothing sent before it). The disclosure
says a third-party AI writes the feedback in both places a user meets it: the
switch in You ("…go through our server to a third-party AI service, which
writes it") and the Coach panel above *Get feedback* until the first answer.
The app's words don't name the company (owner, 2026-11-17; they did from
2026-10-04); the privacy policy's §3 names OpenAI.

---

## 6. iOS privacy manifests

Expo SDK 55 modules and `react-native-purchases` ship their own
`PrivacyInfo.xcprivacy` declarations for the required-reason APIs they use
(AsyncStorage → UserDefaults, file timestamps; `expo-localization` declares
UserDefaults, reason CA92.1; `expo-local-authentication` ships no manifest and
needs none: LocalAuthentication is not among Apple's required-reason API types,
which are file timestamps, system boot time, disk space, active keyboards and
UserDefaults; policy audit, 2026-11-15. Round 5 adds `expo-secure-store` 55.0.18
(the Keychain, for the session) and `expo-crypto` 55.0.19 (the Sign in with Apple
nonce); neither ships a `PrivacyInfo.xcprivacy` in `node_modules` (checked
2026-11-19), and neither the Keychain nor random bytes and SHA-256 are among those
types). Fairly Sure adds no native code of
its own, so it declares none directly. The first production build went up on
2026-11-16 (TestFlight build 2). A missing manifest surfaces as an App Store
Connect email after upload, not as a build failure, so check that email on each
upload.
