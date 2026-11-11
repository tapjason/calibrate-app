# Tooling notes: what every agent must know on this machine

Read before driving the web build through the Playwright MCP (`web-playtester`, the main session
preparing `blind-playtester` runs) and before any build step. Add a line whenever a quirk costs real
time. Started 2026-11-08 from what this repo learned, plus the two lessons from `duolingo-bible`
that apply here.

## The machine

- Windows 11, Git Bash for scripts (the Bash tool), PowerShell 5.1 also available; Node 24, npm 11,
  Python 3.12. No Xcode, no Mac, no simulator, no Android device. The owner has an iPhone 17 on
  iOS 26 (`docs/app-profile.md` §18).
- Scripts are bash: run them with the Bash tool, not PowerShell. The Bash tool's command line is
  capped at about 8 KB; write bigger files with the Write tool.
- For several exact edits to one file, a short Python script (`io.open(..., encoding='utf-8')`,
  assert each old string occurs once, then replace) is safer than `sed`. Never put a backtick in a
  `sed` pattern (in GNU sed `` \` `` is the start-of-buffer anchor).
- The Write and Edit tools turn the text `\u` plus four hex digits into the character itself. When
  an escape must stay text (a regex, a SQL pattern), build it from `chr(92)` in a script and check
  the bytes.
- The repo has no Prettier or ESLint config: don't run either, and don't reformat files you touch.
- Memory is tight with the web server, Jest and Chrome running together: the web server
  (`scripts/web-serve.sh`) was ended by Windows for low memory on 2026-11-08. `status` reports it;
  don't restart it unasked in the middle of someone else's work.

## Expo, EAS and the phone

- Expo SDK 55, React Native 0.83.10, New Architecture. **Expo Go can't open this app** (the App
  Store's Expo Go stops at SDK 54); the phone runs a development build from EAS.
- The phone's JS comes from `npx expo start --dev-client --tunnel` on the PC, on **port 8081**.
  Never start anything else on 8081 or kill what's on it: that cuts the phone off. The web server
  uses 8097.
- After a JS fix the phone needs a reload (shake → Reload, or `r` in the Expo terminal). A screenshot
  that still shows the old behaviour is usually a stale bundle: reload, or restart with `--clear`.
- `npx expo install <pkg>` always, never `npm i <pkg>`, for anything Expo pins (CLAUDE.md asks the
  owner first for any install). `npx expo install --check` lists drift; fix it on its own commit.
  `npx expo install` with no version once resolved SDK 58's `expo-age-range`, which wasn't kept:
  check what it picked.
- `eas-cli` is installed globally and logged in as `tapjason`; the skills call `npx eas` so the
  version matches the project. Give EAS commands non-interactive flags when they run through the
  Bash tool; anything that asks for an Apple sign-in or a device registration is the owner's, in
  their own terminal (`! <command>`).
- EAS never sees `.env.local` (git-ignored). The build's three public values are EAS environment
  variables per profile (`eas.json` `environment`); names in `docs/HUMAN_VERIFICATION.md` "Build day
  runbook". Agents never read or print `.env.local` or the values.
- The `preview` profile builds for the simulator only (`ios.simulator: true`): useless without a
  Mac. Use `development` for the phone and `production` for TestFlight.
- The Supabase free tier pauses after about a week idle and then every live test fails silently;
  the keep-alive workflow (`.github/workflows/supabase-keepalive.yml`) prevents it but can't wake
  a paused project (the owner restores it from the dashboard).

## The web build

- `bash scripts/web-serve.sh start` runs `CI=1 npx expo start --web --port 8097` in the background
  and polls until the page's `<title>` reads "Fairly Sure" (up to three minutes; the first bundle is
  slow). Log `.tooling/expo-web.log`. `CI=1` keeps Expo non-interactive and also stops file
  watching: after an edit, `stop` then `start`, or the browser shows old code.
- **`stop` can miss the server** (seen 2026-11-10): it checks the pid file with `kill -0`, and
  the pid Git Bash records for `nohup npx …` isn't the Windows node process, so `stop` says
  "nothing of ours was running" while the old server keeps serving the old bundle (a reload
  doesn't help: no file watching), and `start` then reports "already running". Check with
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` (the command line names the port);
  ending those processes needs the owner's approval in this harness (an agent's `Stop-Process`
  was refused). Until the script is fixed, `PORT=<free port> bash scripts/web-serve.sh start`
  gets a fresh build without touching the old one.
- The web build keeps its data in SQLite (wasm) in the origin private file system, so a reload keeps
  everything. **A fresh install:** navigate to `/favicon.ico` on the same origin first, then remove
  the OPFS entry `expo-sqlite` and clear localStorage (`docs/app-profile.md` §9 has the snippet).
  Removing it while the app is open fails with "modifications are not allowed".
- **One tab at a time:** the browser hands the database to one tab; a second tab runs without it.
- Demo data: `/dev/seed` → "Load demo data" (testID `dev-seed-load`; the status line is
  `dev-seed-status`). Loading twice says it was already loaded.
- On a fresh install every route, `/dev/seed` included, redirects to `/warmup` until the Warm-up
  is finished ("Skip for now" isn't remembered with no predictions). For a seeded start state,
  finish it through the store: `useWarmupStore.getState().hydrate()`, then `answer(choice,
  confidence)` ten times (2026-11-09b kept this as `.playwright-mcp/warmup-done.js`).
- Playwright's click scrolls its target into view first, so a button near the fold "jumps" the
  page under a blind tester. Before ranking a jump, repeat it with `el.click()` in
  `browser_evaluate` (2026-11-09b: the Log +5 jump at 320 was this).
- Relative screenshot names resolve against the repo root: brief agents with the full
  `.playwright-mcp/playtest-<date>/` path.
- Dark mode: `browser_emulate_media` with `colorScheme: 'dark'`. Reduce Motion: `reducedMotion:
  'reduce'`. Large text: CSS zoom (2 and 1.5) through `browser_evaluate`, which also halves the
  layout width, so it is harsher than Dynamic Type.
- The Playwright MCP writes screenshots and logs under `.playwright-mcp/` (git-ignored); playtest
  rounds use `.playwright-mcp/playtest-<date>/`.
- Bring the automation browser to the front, or force a repaint, before a capture: hidden behind
  other windows it kept presenting its first frame (the launch spinner), which read as a stuck
  spinner until 2026-11-01 (UI_ROADMAP §1).
- **Web-only behaviour that isn't a bug on the iPhone** (checked against the code, 2026-11-08):
  Log's × drops a draft without asking (iOS asks, `useLogDraftGuard`); the "+" is 32 px (44 pt
  with `hitSlop`); the confidence slider can't take keyboard focus (one VoiceOver adjustable on
  iOS); switch descriptions aren't read (iOS reads them as the hint); the web switch is 40 × 20;
  visited tabs stay in the Tab order, sheets drop focus to `body`, Escape closes nothing, every route
  is titled "Fairly Sure", every heading is `h1`; the lightning-bolt button is Expo's dev overlay.
  Times show as "07:00 PM" where the phone shows its locale ("19:00").
- **Three require-cycle warnings in the console are known** (2026-11-09b web check), all in
  `src/store`: `categoryStore` ↔ `authStore`; `authStore` → `practiceStore` → `analytics` →
  `authStore`; `authStore` ↔ `predictionStore`. Every use sits inside a function, not at module
  load, so nothing reads an unfinished module. Not a playtest finding; a new cycle is worth a look. Also known: "props.pointerEvents is
  deprecated. Use style.pointerEvents", from the react-native-web bundle, not app code (2026-11-10).
- **Device-only behaviour the web build hides** (found on the phone, 2026-11-07 and 08): see
  `docs/app-profile.md` §18 "Known iOS-vs-web traps". The web never showed any of them because CSS
  won't shrink content below its size and has no native sheets or switch.

## Jest and TypeScript

- Jest runs with `jest-expo`; `jest.globalSetup.js` pins the time zone to UTC;
  `__setTimeZoneForTests` in `src/engine/localTime.ts` swaps zones in a test.
- SQLite under Jest is sql.js (`src/db/testing.ts`).
- Reanimated's Jest setup is `jest/setupReanimated.js`; `@expo/vector-icons` is mocked
  (`jest/vectorIconMock.js`).
- `npx expo ...` loads `.env.local` into its own process and prints the variable names ("env: load
  .env.local", then "env: export …") on stdout, which breaks JSON output. `check.sh --release` sets
  `EXPO_NO_DOTENV=1` so the config file and the export carry no values; do the same for any expo
  command whose output is saved.
- `bash scripts/check.sh` takes about two minutes (148 suites, 1736 tests, 98 s of Jest on
  2026-11-08). The
  edit hook runs only `--quick` (incremental `tsc`, `.tooling/tsbuildinfo`; delete it if types
  look stale).
- **Typed routes stub** (2026-11-08 and 09): `.expo/types/router.d.ts` is sometimes an 816-byte
  stub with no app routes. Seen right after `web-serve.sh start`, before the first page request,
  and **whenever a file under `app/` changes while the web server runs** (an edit, a `touch`, a
  `git stash`; reproduced 2026-11-09, rewritten within two seconds). Jest doesn't do it. `tsc`
  then fails with three typed-route errors (`app/dev/celebrations.tsx`, `app/dev/seed.tsx`,
  `app/log.tsx`). Fix: `web-serve.sh stop`, `start`, load http://localhost:8097/ once, wait until
  the file is about 6 KB, then check again. Finish the edits under `app/` before that restart.
