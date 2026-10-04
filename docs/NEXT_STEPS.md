# Calibrate — Next Steps an Agent Can Do Alone

**As of:** 2026-10-03 · **Branch:** `master` · **Baseline:** `tsc --noEmit` clean,
87 suites / 987 tests green.

`docs/HUMAN_VERIFICATION.md` lists what needs a person. This is the other half:
work an agent can finish from the repo with no device, no dashboard and no
purchase. Finished items are removed; their history is in git (`git log -- docs/NEXT_STEPS.md`).
UI work has its own list in `docs/design/UI_ROADMAP.md`, and unscheduled ideas
are parked in `docs/design/FUTURE_UI.md`.

---

## Open

| # | Item | Why it matters |
|---|---|---|
| a | **Supabase keep-alive.** A weekly GitHub Actions cron that makes one cheap query. Needs the anon key as a repo secret. | The free-tier project pauses when idle: `supabase projects list` read `INACTIVE` on 2026-10-03, a day after the 2026-10-02 deploy. Every live test silently fails until it's restored by hand from the dashboard (there is no CLI verb). |
| c | **Seed data** for screenshots and the App Review demo account: ≥ 60 resolved predictions across all five categories with real miscalibration (`APP_STORE_LISTING.md` §4–5). Credentials stay out of the repo. | A reviewer on a fresh install sees only provisional states, which read as broken features. |
| d | **Draft screenshots** from the web build with Playwright at 440 × 956 CSS px, 3× (after c). Re-shoot design baseline 01 in the same pass. | Layout drafts now; finals need a device build (web has no status bar, and fonts differ). |
| g | **Dependency drift.** `expo-doctor` reported 14 packages behind within SDK 55. Run `npx expo install --check`, then `npm test`. | Do it the day of the first EAS build; doing it earlier just means retesting twice. |

## Waiting on you, not code

- **Privacy policy hosting.** The repo is public, so GitHub Pages can serve
  `docs/` for free. Once it's on, set `PRIVACY_POLICY_URL` in
  `src/constants/app.ts` and the paywall's Privacy link appears. The agent can
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
  members of your Supabase organization, at 2 messages an hour. "Confirm email"
  is on for testing (decided 2026-10-01); before strangers sign up, either
  configure custom SMTP or turn confirmation off (`ACCOUNT_SPEC.md` §1).
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

- Apple, [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- Supabase, [Custom SMTP / default email limits](https://supabase.com/docs/guides/auth/auth-smtp)
- supabase/auth issue [#1308, Revoke Sign in with Apple tokens](https://github.com/supabase/auth/issues/1308)
- RevenueCat, [Account deletion rules on the App Store](https://www.revenuecat.com/blog/engineering/app-store-account-deletion) · [API v2](https://www.revenuecat.com/docs/api-v2)
- App Store: [Calibrate – Metabolic Health](https://apps.apple.com/us/app/calibrate-metabolic-health/id1514232557) · [Calibrate: Recovery & Fitness](https://apps.apple.com/us/app/calibrate-health-recovery/id6757204030)
- Screenshot specs: [AppLaunchFlow 2026 guide](https://www.applaunchflow.com/blog/app-store-screenshot-specifications-2026)
