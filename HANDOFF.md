# Handoff

**Branch:** `builder/agent-harness`, from `builder/device-fixes` (21bb262, the seventh playtest round). Nothing pushed; `builder/device-fixes`, `builder/expo-fix`, `builder/score-holes`, `builder/build-prep` and `master` are still local only.

## What this PR did

The agent harness from the owner's other projects (`duolingo-bible`'s Expo version of the Roblox harness kit), adapted to this iPhone app (owner's request, 2026-11-08). No app code changed.

- **The profile:** `docs/app-profile.md`, §1–§18. It points to the canonical docs rather than copying them. §5 sets out the record rules (R1–R12) from `CLAUDE.md` as a checklist. §18 covers the iPhone: what only the phone shows, and the iOS-vs-web traps found on the device on 2026-11-07 and 08.
- **Nine read-only agents:**
  - `code-reviewer`
  - `record-auditor`: the record's integrity. It replaces the other project's Scripture checker.
  - `design-analyst`
  - `platform-api-checker`: checks against SDK 55, RN 0.83 and Apple.
  - `policy-auditor`: App Review, subscriptions, 5.1.2(i), age assurance.
  - `web-playtester`
  - `blind-playtester`: browser tools only, the blind method every round has used.
  - `release-auditor`: iOS only.
  - `live-ops-analyst`
- **The three builder agents** keep writing code. Their stale facts are fixed: test count, D40 emoji exception, `check.sh`, the iOS traps.
- **Skills:**
  - `/step`: replaces the other projects' `/milestone`. It works on builder branches, BUILT_LOG and HANDOFF.
  - `/design`: records D numbers in UI_ROADMAP §2.
  - `/playtest`
  - `/device-check`: new. It writes the owner's iPhone checklist and records the results.
  - `/build`: iOS development or production. It runs only after the owner confirms, and never submits.
  - `/release-gate`
  - `/live-review`
  - `/check`
  - `/new-content`
- **Hook:** `.claude/hooks/check-ts-edit.sh` type-checks incrementally after every edit of a `.ts`/`.tsx` file under `app/`, `src/` or `supabase/`. It runs `bash scripts/check.sh --quick` (about 5–10 s).
- **Shared settings:** `.claude/settings.json`.
  - Allows: the check scripts, read-only git and EAS listing, the docs domains, and the Playwright tools.
  - Asks before: `eas build`, `credentials`, `env:create` and `update`; `git push`; `npm install`; Supabase deploys.
  - Denies: `eas submit`, force pushes, `supabase db reset` and `npm publish`.
- **Scripts:**
  - `scripts/check.sh` gained `--quick` and `--release`. The default is unchanged. `--release` sets `EXPO_NO_DOTENV=1`.
  - `scripts/web-serve.sh` runs the web build on 8097. It refuses 8081, the iPhone dev server's port.
  - `scripts/check-harness.sh` checks the harness. It fails if a read-only agent gets a writing tool, or if the blind playtester can see more than the browser.
- **Docs:**
  - `docs/agent-harness.md`: the map, formats, skills and settings.
  - `docs/tooling-notes.md`: machine, EAS and phone, web build, Jest.
  - `CLAUDE.md` has a new "Agent harness" section: commands, the agent table, the iPhone, owner-only actions.
  - `.tooling/` is ignored.

## In progress / broken

- **Not run:** `check.sh --release`'s `expo-doctor` and iOS export steps. The export is heavy, and the web server was running. Its `expo config` and `expo install --check` steps were run by hand and pass ("Dependencies are up to date").
- **New agents load in the next session.** Their first real triggers are the "First use" checks in `docs/agent-harness.md`.
- **Carried over from `builder/device-fixes`, still open on the phone:**
  - Your card → This week / This year (the absolute-canvas fix): not re-checked.
  - You's switch rows (switch on the label's line): not re-checked.
  - The Practice sheet (same header-beside-scroll shape as the old Log): not reported.
  - Confirmed earlier: Log's header, Apple sign-in, Categories' switches.

## Next step

- **Owner:**
  - Reload the app and check the items above (`/device-check` writes the list).
  - The reminder test: two predictions are due tomorrow.
  - Say which branches to push.
- **Agent:**
  - The playtest fix groups 1–3, 5 and 7 (`docs/design/research/playtest-2026-11-08.md`), as `/step`.
  - Then steps 157–159.
  - Groups 4 and 6 wait on the owner (`/design`).

## Read first

`HANDOFF.md`, `CLAUDE.md`, `docs/app-profile.md`, `docs/agent-harness.md`, `docs/NEXT_STEPS.md`, `docs/HUMAN_VERIFICATION.md`.

## Open decisions

- **Owner:**
  - pricing (P1);
  - EU trader status;
  - Pages;
  - the domain;
  - email confirmation for strangers;
  - the 2026-11-08 playtest's groups 4 (Insights hierarchy, the recap's lead) and 6 (sheet headers, vocabulary, formats).

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. It does: 148 suites, 1736 tests.
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED`. It does.
