---
name: release-gate
description: Pre-submission go/no-go review for the App Store. Runs every automated check and audit in release mode, then lists the owner's steps from the production build through TestFlight to App Review. Never builds, never submits, never changes App Store Connect.
argument-hint: "[optional: the version, or 'testflight']"
disable-model-invocation: true
---

Decide whether the current commit is ready to build for the App Store (or for external TestFlight, if $ARGUMENTS says so) and submit. You do not build, upload or change App Store Connect, RevenueCat or Supabase; the owner does.

1. `git status` must be clean. If not, stop and report what's uncommitted.
2. Run `bash scripts/check.sh --release`. Any failure is NO-GO. Then find the last submitted tag (`git tag --list 'submitted-*'`; if none, say this is the first submission) and run the NO-GO checks in `docs/app-profile.md` §8 against it. Any hit is NO-GO.
3. Delegate these as separate subagent tasks and wait for all of them. The first three don't use the browser and may run side by side; start the web server (`bash scripts/web-serve.sh start`) for the playtester, and run the release-auditor alongside it.
   - `code-reviewer` in release mode (say which tag was last submitted).
   - `policy-auditor` in release mode: the full audit, the age-rating draft, the privacy-labels draft, the review-notes draft, the store text.
   - `record-auditor` over the whole app: every R id, the fixtures, reconciliation across every surface.
   - `web-playtester`: the full profile §2 flow from a fresh install and from the demo data, at 320 × 568 and 402 × 874, both appearances.
   - `release-auditor`: the §13 budgets and the §17 store checklist.
4. **The iPhone.** Read `docs/HUMAN_VERIFICATION.md` Batch C and D and `HANDOFF.md`: every native check not yet confirmed on the owner's iPhone for this build is NO-GO for the App Store (a TestFlight build to the owner alone may go ahead; say so).
5. Collect every unticked owner item in `docs/HUMAN_VERIFICATION.md` and every agent's "Needs you" list, without duplicates, and put them in order: version and build number → `/build production` → TestFlight internal (the owner installs and runs Batch C/D on it) → the App Store Connect listing (name, subtitle, description, keywords, screenshots, privacy labels, age rating, URLs, subscriptions and their metadata, review notes, export compliance) → submit → `git tag submitted-<version>` once submitted (the owner says when; you tag).

Reply in this format:

```
GO | NO-GO

Blocking
- <item> — from <check / reviewer / auditor / playtester / release-auditor / iPhone> — fix

Owner steps before submitting
- [ ] exact step, where to click or which command

Watch after release
- what to check in the first hour and first day (App Store Connect crashes and reviews, RevenueCat, Supabase errors, the keep-alive workflow)
```

Any blocker, any FAIL, any broken R id, a release-auditor flag marked blocking, a playtest that couldn't run, or a native check never run on the iPhone means NO-GO. Merge every "Not verified" list and say plainly what was not verified. Record the result in `HANDOFF.md` and `docs/design/BUILT_LOG.md`.
