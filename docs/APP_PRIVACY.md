# Fairly Sure — App Privacy declarations

**As of:** 2026-11-16 (checked against the code after step 187; policy audit of step 180 on 2026-11-15; first written 2026-09-24) · Derived from the code, not from intent.

This is the answer sheet for App Store Connect → App Privacy, and the source
for the privacy policy text. Every row cites the file that proves it. If a
claim here ever stops matching the code, the code is right and this file is a
bug — re-derive it rather than patching the prose.

The short version:

- **Nothing is used for tracking.** No ad networks, no IDFA, no analytics SDK,
  no crash reporter, no cross-app or cross-site linkage. `package.json` has no
  third-party analytics or attribution dependency at all. **No ATT prompt is
  required.**
- **From someone who never signs in, only a few usage counts, with no id.**
  The whole core loop — log, resolve, stats, share — runs offline against local
  SQLite, and sync has nothing to sync. Eight funnel events go up to
  `guest_analytics_events` with no user, install or device id (D43;
  `src/analytics/flush.ts`, `GUEST_EVENT_NAMES`), since step 186 applied
  migration 007 on 2026-11-16; before that nothing left a guest's phone.
- **Freetext never reaches the AI.** The one feature that would have sent it,
  Refine, is cut from v1 (2026-09-24). The Coach sends numbers only.

---

## 1. What Apple asks, and the answer

| Apple data type | Collected | Linked to identity | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Contact Info → **Email address** | Yes | Yes | No | App Functionality (account + sync) | `src/supabase/auth.ts` — email/password and Sign in with Apple (the email scope only; no Google button ships) |
| User Content → **Other User Content** (prediction titles, reflections) | Yes | Yes | No | App Functionality | `PredictionWireRow` (`src/types/index.ts`); `src/supabase/sync.ts` |
| Identifiers → **User ID** | Yes | Yes | No | App Functionality, Analytics | Supabase auth user id; passed to RevenueCat as `appUserID`, `src/billing/revenuecat.ts` (`configureBilling`) |
| Usage Data → **Product Interaction** | Yes | Yes | No | Analytics, App Functionality (the Coach's per-account request count, `supabase/migrations/002_coach_usage.sql`) | `src/analytics/events.ts` — closed catalogue, numeric properties only. A guest's funnel events carry no id (D43), but Apple asks per data type, and a signed-in person's are linked, so answer **linked** |
| Purchases → **Purchase History** | Yes | Yes | No | App Functionality, Analytics (`purchase_completed` carries the plan and trial flags, `src/analytics/events.ts`; RevenueCat's guidance says both) | Apple IAP via RevenueCat; `supabase/functions/revenuecat-webhook/` |
| Identifiers → Device ID / Advertising | **No** | — | — | — | no ad or attribution SDK in `package.json` |
| Diagnostics (crash, performance) | **No** | — | — | — | no crash reporter in `package.json` |
| Health, Financial Info, Location, Contacts, Browsing History, Sensitive Info | **No** | — | — | — | never requested, never collected |
| Other Data → age range | **No** | — | — | — | Asked of Apple on iOS 26+; only the band is stored on the device and never transmitted (`src/age/ageRange.ts`) |

"Finance" and "health" are *prediction categories the user picks* — a label on
their own sentence, not financial or health data in Apple's sense. The app
reads no accounts, no HealthKit, no transactions.

The age band is not a collected data type. Apple's nutrition label counts data
that leaves the device. The band does not: see §4a.

---

## 2. Data sent off the device, and when

### Supabase (Postgres + Auth) — the backend of record
Only after sign-in. Predictions sync as `PredictionWireRow` — **including the
title and the reflection**, because they are the user's own record and have to
survive a reinstall. Local SQLite stays the source of truth; sync is
last-write-wins and every failure is swallowed (`src/supabase/sync.ts`).

Analytics events land in `public.analytics_events`, scoped to the user id.

### OpenAI — two features, both optional, both off the critical path

| Feature | What is sent | Trigger |
|---|---|---|
| ✨ **Refine**: not shipped (`REFINE_ENABLED = false`, the function not deployed). Declare nothing for it. | If it ever returns: the title just typed, nothing else. | An explicit tap. |
| **Coach** (Plus) | **Aggregated numbers only** — `CoachContext` is a calibration rating, per-category resolved counts / scores / rates, and deterministic pattern values. Its only strings are a built-in category id and an engine pattern key (such as `weakest_day_of_week`): a category the person added (`c-…`, named in their own words) is left out before the call (`src/ai/coachContext.ts`), and the server rejects any other category and any key that isn't a short lowercase machine key (`supabase/functions/coach/index.ts`). | An explicit "Get feedback" tap. **Off by default** (`coachEnabled: false`, `src/store/settingsStore.ts`). |

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
  `guest_analytics_events` with an event id (random, `track.ts`), the name,
  its numbers and the time, and nothing else: no user, install or device id,
  so two rows can't be tied to one person (D43). Their other events move to the account on sign-in
  (`migrateGuestDataToUser`), so they are sent then; the policy says so.
  Turning usage stats off clears the queue first and sends nothing more.
- Users can turn it off: You → "Usage stats" (default on). Renamed from
  "Anonymous usage stats" on 2026-10-04: the events are linked to the account,
  so "anonymous" contradicted this sheet.
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
3. That usage analytics are numeric-only, tied to the account, and switchable
   off in You.
4. That subscriptions are processed by Apple and managed via RevenueCat.
5. How to delete an account and its data.
6. That on iOS 26 or later the app may keep an age band from Apple on the
   device, and that the band is not sent off the device or used to lock a
   feature. The draft in `docs/PRIVACY_POLICY.md` says so.

**Item 5 is built (2026-09-25).** You → Delete account calls the
`delete-account` Edge Function, which revokes Sign in with Apple (when its key
is configured), deletes the RevenueCat customer (when a write key is), and
deletes the auth user, whose rows cascade from every public table. The device
is wiped only after the server confirms. Guests get "Erase your data on this
phone". Deployed 2026-10-02; the keys were set on 2026-11-16, and the RevenueCat
leg waits on one misspelled secret's rename (`docs/HUMAN_VERIFICATION.md` Batch E).

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
UserDefaults; policy audit, 2026-11-15). Fairly Sure adds no native code of
its own, so it declares none directly. The first production build went up on
2026-11-16 (TestFlight build 2). A missing manifest surfaces as an App Store
Connect email after upload, not as a build failure, so check that email on each
upload.
