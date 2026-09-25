# Calibrate — App Privacy declarations

**As of:** 2026-09-24 · Derived from the code, not from intent.

This is the answer sheet for App Store Connect → App Privacy, and the source
for the privacy policy text. Every row cites the file that proves it. If a
claim here ever stops matching the code, the code is right and this file is a
bug — re-derive it rather than patching the prose.

The short version:

- **Nothing is used for tracking.** No ad networks, no IDFA, no analytics SDK,
  no crash reporter, no cross-app or cross-site linkage. `package.json` has no
  third-party analytics or attribution dependency at all. **No ATT prompt is
  required.**
- **No data is collected from users who never sign in.** The whole core loop —
  log, resolve, stats, share — runs offline against local SQLite. Analytics
  never flushes for a guest (`src/analytics/flush.ts`), and sync has nothing to
  sync.
- **Freetext never reaches the AI features except one, by explicit tap.**

---

## 1. What Apple asks, and the answer

| Apple data type | Collected | Linked to identity | Tracking | Purpose | Evidence |
|---|---|---|---|---|---|
| Contact Info → **Email address** | Yes | Yes | No | App Functionality (account + sync) | `src/supabase/auth.ts` — email/password, Apple, Google |
| User Content → **Other User Content** (prediction titles, reflections) | Yes | Yes | No | App Functionality | `PredictionWireRow`, `src/types/index.ts:167`; `src/supabase/sync.ts` |
| Identifiers → **User ID** | Yes | Yes | No | App Functionality, Analytics | Supabase auth user id; passed to RevenueCat as `appUserID`, `src/billing/revenuecat.ts:174` |
| Usage Data → **Product Interaction** | Yes | Yes | No | Analytics | `src/analytics/events.ts` — closed catalogue, numeric properties only |
| Purchases → **Purchase History** | Yes | Yes | No | App Functionality | Apple IAP via RevenueCat; `supabase/functions/revenuecat-webhook/` |
| Identifiers → Device ID / Advertising | **No** | — | — | — | no ad or attribution SDK in `package.json` |
| Diagnostics (crash, performance) | **No** | — | — | — | no crash reporter in `package.json` |
| Health, Financial Info, Location, Contacts, Browsing History, Sensitive Info | **No** | — | — | — | never requested, never collected |

"Finance" and "health" are *prediction categories the user picks* — a label on
their own sentence, not financial or health data in Apple's sense. The app
reads no accounts, no HealthKit, no transactions.

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
| ✨ **Refine** | The prediction title the user just typed, and nothing else. Never reflections, never history. | An explicit tap, per prediction. Free. Toggleable in Settings. |
| **Coach** (Plus) | **Aggregated numbers only** — `CoachContext` is a calibration rating, per-category resolved counts / scores / rates, and deterministic pattern values. There is no string field in it but the fixed category enum. | An explicit "Get feedback" tap. **Off by default** (`coachEnabled: false`, `src/store/settingsStore.ts`). |

Both calls go through Supabase Edge Functions that verify the caller's JWT;
the API key is server-side only and never ships in the binary
(`supabase/functions/refine/`, `supabase/functions/coach/`).

One consequence worth stating plainly in the privacy policy: **the Coach cannot
send a prediction's text, because the payload it is built from has nowhere to
put one** (`src/ai/coachContext.ts`, `CoachContext` at `src/types/index.ts:119`).
That is a structural property, not a policy.

Related: freetext *is* scanned on-device by the crisis pre-filter before any
Coach call, and a match routes the user to a support surface instead of the
model — the text still never leaves the device (`src/ai/crisisFilter.ts`).

### RevenueCat — subscriptions
Receives the Supabase user id as `appUserID` plus the purchase Apple reports.
No prediction data, no email. Its webhook writes the entitlement back to
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
  flushes only on foreground alongside sync — never for a guest.
- Users can turn it off: Settings → "Anonymous usage stats" (default on).

The full list of events is 13 items and fits on a screen; the privacy policy can
reproduce it verbatim if that reads better than a summary.

---

## 4. Notifications — local only

The app requests notification permission and schedules **local** notifications
(resolution reminders, the Sunday digest). It never requests a push token: no
`getExpoPushTokenAsync`, no device push token, nothing server-side that sends a
push (verified across `src/`, `app/`, `supabase/`).

Two consequences:
- **No push token is collected or transmitted** — declare nothing for it.
- **An APNs key is not needed to ship this build.** It becomes needed only if
  remote push is added later. (`docs/HUMAN_VERIFICATION.md` Batch E used to list
  it as a blocker; it isn't one.)

---

## 5. Policy text this implies

The privacy policy URL App Store Connect requires must at minimum say:

1. What is stored and where — predictions, including their text, in Supabase
   (US region), tied to the account.
2. That AI features are optional, and exactly what each sends: refine sends the
   prediction text the user typed; the Coach sends aggregated statistics only
   and never prediction text or reflections.
3. That usage analytics are numeric-only, tied to the account, and switchable
   off in Settings.
4. That subscriptions are processed by Apple and managed via RevenueCat.
5. How to delete an account and its data.

**Item 5 is the open one.** There is no in-app account deletion path today, and
App Store Review Guideline 5.1.1(v) requires one for any app with account
creation. This is a code item, not a checklist item — see the note added to
`docs/HUMAN_VERIFICATION.md` Batch E.

---

## 6. iOS privacy manifests

Expo SDK 55 modules and `react-native-purchases` ship their own
`PrivacyInfo.xcprivacy` declarations for the required-reason APIs they use
(AsyncStorage → UserDefaults, file timestamps). Calibrate adds no native code of
its own, so it declares none directly. Confirm the generated build carries them
when the first `eas build` runs — a missing manifest surfaces as an App Store
Connect email after upload, not as a build failure.
