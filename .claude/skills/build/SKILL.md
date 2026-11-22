---
name: build
description: Pre-flight and run one EAS cloud build for iOS (development, production, or preview for the cloud simulator) with the owner's confirmation - clean tree, check, doctor, dependency drift, EAS login and environment, version - then record it. Never submits.
argument-hint: "<development|production|preview>"
disable-model-invocation: true
---

Build: $ARGUMENTS for iOS (the only platform). `preview` is an unsigned, release-style build for the iOS Simulator (`ios.simulator: true`), made for `sim-playtester` on Expo Simulators: nothing to install on the phone, no credentials. Before a production build, a sim pass on a preview build of the same commit is recommended; the owner confirms that extra build like any other (about $2 on a medium worker after the plan's build credit).

## Pre-flight (all read-only until the build itself)

1. `git status` must be clean, or the owner confirms building uncommitted work (say what's uncommitted). Say which branch and commit will build.
2. `bash scripts/check.sh` must end in `CHECK PASSED`; for `production`, `bash scripts/check.sh --release`.
3. `npx expo install --check` lists nothing behind and `npx expo-doctor` is clean. If not, say so and offer `npx expo install --fix` on its own commit first (then the check again), so a device bug can be traced to it or not.
4. `npx eas whoami` prints `tapjason`. If not, stop: the owner runs `npx eas login` (profile §16).
5. **Environment.** `npx eas env:list --environment <development|production|preview>` shows the three names `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (names only; never print or read values; never read `.env.local`). Missing ones: stop and give the owner the `eas env:create` lines from `docs/HUMAN_VERIFICATION.md` "Build day runbook" step 3. For `production`, the RevenueCat key must be the `appl_` key (the owner confirms; B1). For `preview`, missing names don't stop it: the app runs offline without them, with sign-in, sync, usage counts and the Plus plans failing silently; say which are missing.
6. **Does it need a build at all?** For `preview`: only when no finished preview build of this exact commit exists (`npx eas build:list --platform ios --build-profile preview --git-commit-hash <sha> --status finished --json`). Otherwise: list the native changes since the build on the phone (`git log` for `package.json` native packages, `app.json` plugins, entitlements, Info.plist keys). With none, a JS reload of the existing development build is enough: say so and stop unless the owner still wants one.
7. For `production`: `appVersionSource` is remote and `autoIncrement` is on, so the build number moves itself; bump `version` in `app.json` for a new App Store version (commit it first). `/release-gate` has said GO for this commit, or the owner waives it for an internal TestFlight build (record it).
8. A migration added since the last build will run on the owner's phone and then can never be edited (profile §8): list any.

## The build

9. Show the exact command and ask the owner to confirm with AskUserQuestion (it uses EAS build quota and Apple signing):
   - development: `npx eas build --profile development --platform ios`
   - production: `npx eas build --profile production --platform ios`
   - preview: `npx eas build --profile preview --platform ios`
   On "yes", run it in the background (it takes 15–30 minutes in the free queue; the permission is `ask`, so Claude Code confirms once more). If EAS asks for Apple sign-in or a device registration, stop: that is the owner's to type, in their own terminal (`! <command>`). Never pass `--auto-submit`; never run `eas submit`.
10. When it finishes, read the build page URL and id from the output (`npx eas build:view` if needed).

## Record and reply

11. Record in `HANDOFF.md` (and `docs/HUMAN_VERIFICATION.md` if it completes a runbook step): profile, commit, build id and URL, what the pre-flight found.
12. Reply with the build URL and the owner's next steps:
    - development: install from the EAS link on the iPhone, then `npx expo start --dev-client --tunnel` on the PC and open it from the dev client; then `/device-check`.
    - preview: hand the build id and commit to `sim-playtester` (through `/playtest`, or the gate); nothing goes to the phone.
    - production: it goes to App Store Connect for TestFlight processing (minutes to an hour); the owner adds it to the internal group and installs it from TestFlight; submission stays theirs.

Never build without the owner's confirmation, never submit, never change credentials, and never put a secret in a committed file.
