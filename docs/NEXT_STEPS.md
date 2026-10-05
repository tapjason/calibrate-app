# Calibrate — Next Steps an Agent Can Do Alone

**As of:** 2026-10-04 (second pass) · **Branch:** `master` · **Baseline:** `tsc --noEmit` clean,
99 suites / 1107 tests green (after the UI batches, steps 16–38).

`docs/HUMAN_VERIFICATION.md` lists what needs a person. This is the other half:
work an agent can finish from the repo with no device, no dashboard and no
purchase. Finished items are removed; their history is in git (`git log -- docs/NEXT_STEPS.md`).
UI work has its own list in `docs/design/UI_ROADMAP.md`, and unscheduled ideas
are parked in `docs/design/FUTURE_UI.md`.

---

## What the 2026-10-04 research pass changed

Five findings change the next iterations. Each is recorded in the document it
affects; this is the summary.

1. **Expo Go can't run this app on an iPhone.** The App Store's Expo Go stops at
   SDK 54. Apple never approved the SDK 55, 56 or 57 builds (Expo, May 2026;
   still "waiting on approval" in the SDK 57 notes). This project is SDK 55.
   Expo's workarounds are a simulator (needs a Mac), `eas go` (needs the $99
   Apple account) or a TestFlight beta group that is full. So with an iPhone
   and Windows, **there is no free on-device path**: the $99 account now gates
   *every* iPhone check, not only billing. `HUMAN_VERIFICATION.md` is
   re-ordered around this, and the web build is the only free way left to look
   at the app (item k).
2. **Third-party AI needs explicit, named consent** (Guideline 5.1.2(i), since
   2025-11-13). The Coach toggle is a real opt-in, but its copy doesn't say the
   numbers go to OpenAI. Item h.
3. **Texas age assurance is in force.** SB 2420 has applied to new Texas Apple
   Accounts since 2026-06-04 (the Fifth Circuit lifted the injunction; the
   Supreme Court declined to restore it on 2026-07-06). Apple's Q&A: "In those
   regions, you must check the age of the people using your app."
   `expo-age-range` ships in SDK 55 (alpha). How far this reaches a 4+ app with
   no user-to-user content is a legal call; the code is item i once you decide.
4. **The SDK has moved two majors.** 56 (2026-05-21) and 57 (2026-06-30) are
   stable; 58 has been in beta since 2026-09-15 (RN 0.88, the iOS 27 scene
   lifecycle, stable `expo-router/native-tabs`, `expo-app-intents`). SDK 55
   still builds with Xcode 26, which App Store uploads have required since
   2026-04-28, so the upgrade doesn't block the first build. Item j sequences it.
5. **The link-out commission won't settle before mid-2027.** The Supreme Court
   took Apple's appeal in June 2026 (decision likely no earlier than June 2027),
   the district-court fee proceeding has stalled, and the US link-out rate stays
   at 0% meanwhile. Nothing to build; `GROWTH_AND_MONETIZATION.md` §2 is updated.

---

## Open

| # | Item | Size | Why it matters |
|---|---|---|---|
| g | **Dependency drift within SDK 55.** `npx expo install --check` now lists 15 packages behind (re-run 2026-10-04: `expo` 55.0.26 → 55.0.31, `react-native` 0.83.6 → 0.83.10, `expo-router`, `expo-notifications`, `expo-sqlite`, `jest-expo`, …). Run `npx expo install --fix`, then `npm test`. | S | Do it the day of the first EAS build. Doing it earlier means retesting twice. |
| i | **Age assurance, once you decide it applies** (see "Waiting on you"). Add `expo-age-range` and the `com.apple.developer.declared-age-range` entitlement. Call it once at first run, behind a deps seam that fails open to today's behaviour wherever the API is unavailable (web, older iOS, regions that don't require it), and store only the age bucket. Apple enforces consent revocation by blocking launch, so `RESCIND_CONSENT` needs no server work unless you want the notification. | M | Texas applies to new accounts now; California (2027-01-01) and Utah (2027-05-06) follow. |
| j | **SDK upgrade, 55 → 58**, as its own iteration *after* the first device build passes Batch C on 55. Go straight to 58 once it's stable, following `docs.expo.dev/router/migrate/sdk-57-to-58/`. 58 adopts the UIScene lifecycle through prebuild, makes React Native's strict TypeScript API the default, and has breaking changes in `expo-router`, `expo-sqlite` and `expo-file-system`, all of which this app uses. | L | Unblocks D3 (stable native tabs), FUTURE_UI A10 (`expo-app-intents`) and stable `@expo/ui`. Upgrading *before* the first device run means nobody can tell whether a device bug comes from the app or from the upgrade. |

Done 2026-10-04 (second pass): **h** — Settings and the Coach panel now name
OpenAI before the first request; **k** — the web run-through, recorded at the
top of `HUMAN_VERIFICATION.md` Batch C, which also fixed six UI defects and
found the RevenueCat Test Store drift below.

## Suggested order for the next iterations

1. Fix the Test Store prices (below), then your calls.
2. Your calls below: age assurance, the name, Pages for the privacy policy.
   Then **i** if you pick (a).
3. The $99 account → **g** → first EAS development build → Batch C/D on the
   iPhone → TestFlight.
4. **j** (SDK 58), then the design decisions that wait on it (D3, D5) and
   FUTURE_UI A10.

---

## Waiting on you, not code

- **RevenueCat Test Store drifted (found 2026-10-04).** Annual reads $29.90
  instead of $29.99, and monthly has a 1-month trial it shouldn't. The API
  can't set Test Store prices; fix both in the dashboard (Tier 0 steps in
  `HUMAN_VERIFICATION.md`) and ask the agent to re-read `store_state`.
- **The $99 Apple Developer account now gates any iPhone test** (finding 1).
  The only free check left is the web build (item k). When you want to see the
  app on your phone, this is the purchase. It also unlocks billing, TestFlight
  and submission.
- **Age assurance: does it apply, and how far?** Apple says that in regions
  that require it "you must check the age of the people using your app", and
  Texas has required it since 2026-06-04. Options: (a) build the Declared Age
  Range check now (item i), (b) ship without it and add it in the first update,
  (c) ask counsel first. Recommendation: **(a), before submission.** It's
  M-sized, it can only fail open, and California's law (2027-01-01) will need
  it anyway. This isn't legal advice.
- **The new age-rating questionnaire.** Since 2026-01-31, App Store Connect
  blocks submissions until the updated questions are answered (in-app
  controls, capabilities, medical or wellness topics; AI features count toward
  content frequency). Proposed answers are in `APP_STORE_LISTING.md` §1.
- **Privacy policy hosting.** The repo is public, so GitHub Pages can serve
  `docs/` for free. Once it's on, set `PRIVACY_POLICY_URL` in
  `src/constants/app.ts` and the Privacy links on the paywall and in Settings appear. The agent can
  turn Pages on with `gh` if you say so.
- **The app name.** Two US App Store apps already use "Calibrate", one of them
  an established health brand (and this app has a *health* category).
  `APP_STORE_LISTING.md` proposes alternatives; the choice and any trademark
  check are yours.
- **Anonymous funnel numbers.** Analytics only flushes for signed-in users, so
  the validation checkpoint's aha rate (`warmup_completed / warmup_started`)
  measures the signed-in cohort, which reads high. Counting guests would need an
  anonymous per-install id for a small allowlist of events, and that
  contradicts `APP_PRIVACY.md`'s "no data is collected from users who never
  sign in". Until you decide, read the numbers as signed-in only.
- **Email sign-up for strangers.** Supabase's built-in sender only delivers to
  members of your Supabase organization, at 2 messages an hour (re-checked
  2026-10-04). "Confirm email" is on for testing (decided 2026-10-01); before
  strangers sign up, either configure custom SMTP or turn confirmation off
  (`ACCOUNT_SPEC.md` §1).
- **Supabase keep-alive, one step left.** `.github/workflows/supabase-keepalive.yml`
  (2026-10-03) needs the `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository
  secrets. It can't wake a paused project, so restore the project from the
  dashboard first. Free projects still pause after 7 days without requests;
  the data is kept and can be restored for a year.
- **Demo account for App Review.** Create the user in the dashboard, run
  `node scripts/seed-demo-sql.mjs <user-uuid>` and paste the SQL into the SQL
  editor. Dates are relative to the run, so re-seed shortly before review. The
  credentials go in App Store Connect, never in the repo.
- **Sandbox purchases on the server.** `REVENUECAT_IGNORE_SANDBOX` exists and
  defaults to off. Keep it off through review: App Review purchases are sandbox
  too, and ignoring them would hand the reviewer a Coach that answers 403.
- **The old test account.** A test user's password was once committed to this
  public repo (removed from the file, still in history). Delete that user, or
  ask the agent to do it with the service key.
- **Account deletion, last two legs.** Apple token revocation needs a Sign in
  with Apple `.p8` key, and deleting the RevenueCat customer needs a
  write-scoped server key. The function already handles both once the secrets
  exist (`ACCOUNT_SPEC.md` §3).
- **Design decisions D1–D10** in `docs/design/UI_ROADMAP.md` §2.

---

## Sources

- Expo: [Expo Go and the App Store, May 2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026) · [SDK 56](https://expo.dev/changelog/sdk-56) · [SDK 57](https://expo.dev/changelog/sdk-57) · [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta) · [Native tabs](https://docs.expo.dev/router/advanced/native-tabs/) · [AgeRange (SDK 55)](https://docs.expo.dev/versions/v55.0.0/sdk/age-range/)
- Apple: [SDK minimum requirements](https://developer.apple.com/news/upcoming-requirements/) · [Updated App Review Guidelines, 5.1.2(i)](https://developer.apple.com/news/?id=ey6d8onl) · [Update for apps distributed in Texas (2026-06-03)](https://developer.apple.com/news/?id=sg176nne) · [Age assurance Q&A](https://developer.apple.com/support/age-assurance) · [Updated age ratings](https://developer.apple.com/news/?id=ks775ehf) · [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- Texas SB 2420: [Ashurst Perkins Coie on the Supreme Court denial](https://www.ashurstperkinscoie.com/en/insights/supreme-court-green-lights-the-texas-age-verification-law-for-app-stores/) · [Future of Privacy Forum, enacted acts compared](https://fpf.org/blog/comparing-enacted-app-store-accountability-acts/)
- Link-out commission: [Tech Times, 2026-09-15](https://www.techtimes.com/articles/327527/20260915/app-store-commission-limbo-enters-new-phase-apples-epic-merits-brief-opens-scotus-fight.htm) · [TechCrunch, Aug 2026 proposal](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/)
- Supabase: [Custom SMTP / default email limits](https://supabase.com/docs/guides/auth/auth-smtp) · [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- supabase/auth issue [#1308, Revoke Sign in with Apple tokens](https://github.com/supabase/auth/issues/1308)
- RevenueCat: [Account deletion rules on the App Store](https://www.revenuecat.com/blog/engineering/app-store-account-deletion) · [API v2](https://www.revenuecat.com/docs/api-v2)
- App Store: [Calibrate – Metabolic Health](https://apps.apple.com/us/app/calibrate-metabolic-health/id1514232557) · [Calibrate: Recovery & Fitness](https://apps.apple.com/us/app/calibrate-health-recovery/id6757204030)
- Screenshot specs (1320 × 2868 is still the 6.9-inch size, iPhone 17 Pro Max): [AppLaunchFlow 2026 guide](https://www.applaunchflow.com/blog/app-store-screenshot-specifications-2026)
