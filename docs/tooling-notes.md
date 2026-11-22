# Tooling notes: what every agent must know on this machine

Read before driving the web build through the Playwright MCP (`web-playtester`, the main session
preparing `blind-playtester` runs), before an Expo Simulators session (`sim-playtester`) and before
any build step. Add a line whenever a quirk costs real
time. Started 2026-11-08 from what this repo learned, plus the two lessons from `duolingo-bible`
that apply here.

## The machine

- Windows 11, Git Bash for scripts (the Bash tool), PowerShell 5.1 also available; Node 24, npm 11,
  Python 3.12. No Xcode, no Mac, no local simulator, no Android device; agents get a cloud iOS
  Simulator through Expo Simulators (below). The owner has an iPhone 17 on iOS 26
  (`docs/app-profile.md` §18).
- Scripts are bash: run them with the Bash tool, not PowerShell. The Bash tool's command line is
  capped at about 8 KB; write bigger files with the Write tool.
- For several exact edits to one file, a short Python script (`io.open(..., encoding='utf-8')`,
  assert each old string occurs once, then replace) is safer than `sed`. Never put a backtick in a
  `sed` pattern (in GNU sed `` \` `` is the start-of-buffer anchor).
- The Write and Edit tools turn the text `\u` plus four hex digits into the character itself. When
  an escape must stay text (a regex, a SQL pattern), build it from `chr(92)` in a script and check
  the bytes.
- **A builder agent doesn't `git stash`** (2026-11-18): the main session's uncommitted doc
  edits share the working tree, and a stash takes them out until the pop. To see whether a
  warning predates a change, read the test or run it at `git worktree add` of `HEAD`.
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
- **The tunnel needs `@expo/ngrok` in the project** (a devDependency since 2026-11-15). Expo's CLI
  can't find a global copy on this machine: it looks in `%LOCALAPPDATA%\npm`, npm on Windows
  installs to `%APPDATA%\npm`, and its fallback (`npm.cmd config get prefix` through `spawnSync`)
  fails with `EINVAL` on Node 24. So "install it globally? yes" succeeds and the next line is
  still "Install @expo/ngrok@^4.1.0 and try again". Don't remove the devDependency as unused: no
  code imports it. Without it, `$env:NODE_PATH = "$env:APPDATA\npm\node_modules"` before the
  command also works.
- **Without the tunnel the phone doesn't find the server on this PC** (seen 2026-11-15): Windows
  Firewall has two inbound Block rules for "Node.js JavaScript Runtime", and NordVPN adds
  addresses beside the LAN one. The owner's settings; the tunnel avoids both.
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
- The `preview` profile builds for the simulator only (`ios.simulator: true`): since 2026-11-21 it
  is the build `sim-playtester` installs on Expo Simulators (below). Use `development` for the
  phone and `production` for TestFlight.
- The Supabase free tier pauses after about a week idle and then every live test fails silently;
  the keep-alive workflow (`.github/workflows/supabase-keepalive.yml`) prevents it but can't wake
  a paused project (the owner restores it from the dashboard).

## Expo Simulators (cloud iOS Simulator, 2026-11-21)

- **What it is.** Expo's cloud iOS Simulator, driven by agents through the Expo MCP server
  (`sim-playtester`). On the owner's account since 2026-11-21 (`eas simulator:availability --json`
  read `"available": true`). Starter plan, $19 a month plus usage: $0.10 a simulator minute, billed
  per second, 60 minutes a month included until 2027; a session caps at 115 minutes; an iOS
  simulator build costs about $2 on a medium worker after the plan's build credit. The image is
  macOS Tahoe 26.5 with Xcode 26.6; the default device is an iPhone 17; the iOS version can't be
  chosen. "9:41" in the status bar is the simulator's default, not a stale build.
- **eas-cli 27.11 or later** (global, upgraded 2026-11-21; the version before had no
  `simulator:*`). The commands are experimental and hidden: `eas simulator:<cmd> --help` and the
  plugin skill `expo:eas-simulator` have the current syntax. 27.11.0 has `availability`, `start`
  (also `eas simulator`, `eas sim`), `control`, `exec`, `events`, `logs`, `get`, `list`, `stop` and
  `egress`, and no delete: a finished session is deleted from its page on expo.dev, which also
  deletes its screenshots and recordings. Agents call the global `eas simulator:…`, the form the
  permission entries name; the plugin skill's `npx --yes eas-cli@latest` downloads the newest CLI
  on every call. Its command blocks assume a POSIX shell: run them with the Bash tool.
- **The plugin.** `expo@claude-plugins-official`, enabled at project scope (`enabledPlugins` in
  `.claude/settings.json`), registers the MCP server `plugin:expo:expo`
  (https://mcp.expo.dev/mcp, HTTP, OAuth). It wasn't in `/mcp` until Claude Code was restarted;
  then the owner authenticated it in the browser from `/mcp`. Its tools are
  `mcp__plugin_expo_expo__<tool>`; it also brings skills, among them `expo:eas-simulator` and
  `expo:expo-upgrade`.
- **Two ways to drive a session, one per session.** The MCP way: `simulator_start` with `buildId`
  (installs and launches the build before the session is ready; the idle stop defaults to 10
  minutes), `simulator_get` until `IN_PROGRESS`, then `automation_tap`, `_type`, `_scroll`,
  `_take_screenshot` and `_find_view` by testID or accessibility label. In the first run
  (2026-11-22) testIDs and coordinates (points) worked, but a long composite label (a card's) did
  not match: tap cards by coordinates. It has no full tree, but `automation_scroll` returns an
  accessibility-tree diff with roles, labels and states. The CLI way: `eas simulator:start --platform ios --type
  agent-device …` writes `.env.eas-simulator`, then `eas simulator:exec npx agent-device@latest
  snapshot -i` (the tree), `press`, `fill`, `screenshot`. The CLI sets **no idle stop and a
  115-minute cap unless told**: always pass `--max-duration-minutes` and
  `--max-idle-time-minutes`. `simulator_get` never returns device credentials, so agent-device
  can't drive an MCP-started session (confirmed 2026-11-22: `simulator:exec` found no
  `.env.eas-simulator`, takes no `--id`, and agent-device answered `DEVICE_NOT_FOUND`), so start
  with the CLI when the tree is wanted; whether the MCP automation tools drive a
  CLI-started one isn't documented. `npx agent-device@latest` downloads and runs a package on this
  PC at each call, so the sim-playtester takes that way only when the owner allows it in the brief.
- **Direct controls** on any iOS session: `eas simulator:control --json --id <id>` lists the
  session's actions (they depend on its serve-sim version); `appearance.set dark` or `light`,
  `screenshot.capture --output <path>`, `app.launch <bundle id> 'launchArgs=[…]'`, `gesture '[…]'`
  (a swipe), `button home`, `app.file.upload`. All of these work on an MCP-started session too
  (2026-11-22: `appearance.set` re-themes live in about 3 s; `screenshot.capture` gives a
  1206 × 2622 PNG; `app.stop` and `app.launch app.fairlysure` cold-start the app).
  **Text size:** the catalog has `textSize.set` (`extra-small` to
  `accessibility-extra-extra-extra-large`, plus increment and decrement). A live change leaves a
  half-relaid screen with clipped text: always `app.stop` then `app.launch` before judging.
  `eas simulator:logs --id <id> --limit 30` reads the device log.
- **The simulator itself** (2026-11-22): 402 × 874 pt with the Dynamic Island, a US time zone and
  12-hour clock. It has a passcode set: the app lock's switch opens the system's "Enter iPhone
  Passcode" sheet with no cancel; `button home` and a relaunch leave the lock off. A screenshot
  call once failed with an ngrok 503 (`ERR_NGROK_3004`); an immediate retry worked.
- **A run's size:** the first dry run covered Warm-up, Log, Today, Practice, You, Categories and
  Share in light and dark, plus the largest text, in about 7 minutes (about $0.70).
- **Secrets and data.** `.env.eas-simulator` holds controller tokens: git-ignored (its own line
  since 2026-11-21; `.env.*` already covered it), never printed or committed. The `remoteConfig` in
  `--json` output holds the same tokens: never print it, read single fields with `node -e`.
  Screenshots and recordings stay until the session is deleted, visible to anyone with view access
  to the project; an artifact's `downloadUrl` needs no login (each request redirects to a signed
  URL valid for an hour). Job logs stay 30 days. A View Only member can read a running session's
  tokens. Never `--public-link`, `--frame-ancestor`, `--cors-origin` or `--egress local`. Demo data
  only.
- **The build.** `npx eas build --profile preview --platform ios` (the owner confirms it like any
  build): an unsigned, release-style `.app` for the simulator, holding the JS of the commit it was
  built from, with no Metro, so a new commit needs a new build. `__DEV__` is false in it: no dev
  routes (profile §9). Open: whether the EAS `preview` environment holds the three public
  variables (`eas env:list --environment preview`, the owner). Empty, sign-in, sync, usage counts
  and the Plus plans fail silently, by design; with the live values, a guest run's usage counts
  would reach the live project unless the Warm-up's switch is turned off, which the
  sim-playtester does first.
- **Demo data in a release-style build: no way in today.** Options, none built, the owner's call:
  (a) a dev-client simulator profile (`developmentClient: true` with `ios.simulator: true`) loading
  JS from Metro over a tunnel, which has `/dev/seed`, but runs development JS and exposes a public
  Metro URL while it runs; (b) `eas simulator:control app.file.upload` of a prepared
  `Documents/SQLite/calibrate.db` (10 MiB at most, the app stopped first), untried, and the settings
  in AsyncStorage wouldn't come with it; (c) a seed in the release binary behind a launch argument:
  app code and a seed path in what ships, so a design decision first.
- **Live JS** (possible, not the default): a dev-client simulator build loads JS from Metro over a
  public tunnel. Git Bash: `EXPO_UNSTABLE_TUNNEL_V2=1 npx expo start --dev-client --tunnel --port
  8098`; PowerShell: `$env:EXPO_UNSTABLE_TUNNEL_V2 = "1"; npx expo start --dev-client --tunnel
  --port 8098`. Never 8081 (the iPhone's dev server) or 8097 (the web build); another port with
  the tunnel is untried here. `simulator_start`'s `openUrl` then takes
  `exp+calibrate://expo-development-client/?url=<the https tunnel URL, URL-encoded>`. The tunnel
  URL needs no login while it runs: stop Metro afterwards.
- **Permission entries, in `.claude/settings.json`** (the owner approved them as drafted,
  2026-11-21, the agent-device `exec` entry allowed without asking included). `build_run`,
  `build_cancel`, `workflow_*`, `sandbox_*` and the other `simulator:control` actions stay on ask.

  ```json
  {
    "allow": [
      "mcp__plugin_expo_expo__simulator_start",
      "mcp__plugin_expo_expo__simulator_get",
      "mcp__plugin_expo_expo__simulator_list",
      "mcp__plugin_expo_expo__simulator_stop",
      "mcp__plugin_expo_expo__automation_tap",
      "mcp__plugin_expo_expo__automation_type",
      "mcp__plugin_expo_expo__automation_scroll",
      "mcp__plugin_expo_expo__automation_take_screenshot",
      "mcp__plugin_expo_expo__automation_find_view",
      "mcp__plugin_expo_expo__search_documentation",
      "mcp__plugin_expo_expo__read_documentation",
      "mcp__plugin_expo_expo__build_list",
      "mcp__plugin_expo_expo__build_info",
      "mcp__plugin_expo_expo__build_logs",
      "Bash(eas simulator:availability *)",
      "Bash(eas simulator:get *)",
      "Bash(eas simulator:list *)",
      "Bash(eas simulator:events *)",
      "Bash(eas simulator:logs *)",
      "Bash(eas simulator:stop *)",
      "Bash(eas simulator:start *)",
      "Bash(eas simulator:control appearance.set *)",
      "Bash(eas simulator:control screenshot.capture *)",
      "Bash(eas simulator:exec npx agent-device@latest *)"
    ],
    "deny": [
      "mcp__plugin_expo_expo__build_submit",
      "mcp__plugin_expo_expo__appstore_reply_review",
      "mcp__plugin_expo_expo__appstore_delete_review_response",
      "mcp__plugin_expo_expo__playstore_reply_review",
      "mcp__plugin_expo_expo__usage_budget_create",
      "Bash(eas simulator:start *--public-link*)",
      "Bash(eas simulator:start *--egress*)",
      "Bash(eas simulator:start *--frame-ancestor*)",
      "Bash(eas simulator:start *--cors-origin*)"
    ]
  }
  ```

  The `exec` entry lets any agent-device verb run, through a package fetched from npm at each call;
  pinning a version (and naming it in the entry) or leaving `exec` on ask is the owner's call. Other
  `simulator:control` actions (`app.install`, `media.add`, `app.file.upload` send a file from this PC)
  stay on ask; the agent puts the action before `--id`, so the two allowed prefixes can't carry one.

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
  Removing it while the app is open fails with "modifications are not allowed". After a server
  restart it has sometimes come back empty (twice in five restarts on 2026-11-10, cause not
  traced): when `/` lands on `/warmup`, finish or skip it and reseed.
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
- **Three require-cycle warnings in the console are known** (2026-11-09b web check; paths as of
  2026-11-18, step 195). `authStore` imports `notifications/scheduler` (for
  `dismissDeliveredNotifications`) before its sibling stores, so two of them run through it:
  `authStore` → `notifications/scheduler` → `predictionStore` → `analytics/track` → `authStore`;
  `authStore` → `notifications/scheduler` → `predictionStore` → `authStore`; and `categoryStore` ↔
  `authStore`. (`practiceStore` → `analytics/track` adds none: `track` has loaded by then.) Every
  use sits inside a function, not at module load, so nothing reads an unfinished module. Not a playtest finding; a new cycle is worth a look. Also known: "props.pointerEvents is
  deprecated. Use style.pointerEvents", from the react-native-web bundle, not app code (2026-11-10).
- **Device-only behaviour the web build hides** (found on the phone, 2026-11-07 and 08): see
  `docs/app-profile.md` §18 "Known iOS-vs-web traps". The web never showed any of them because CSS
  won't shrink content below its size and has no native sheets or switch.
- **Delete account and Erase ask with the browser's `confirm` on the web build** (2026-11-17;
  the phone shows a system alert). Playwright dismisses dialogs unless told otherwise, so a
  playtest that deletes or erases must accept it (`browser_handle_dialog` with accept), or the
  tap looks like it did nothing.

## Jest and TypeScript

- **No-break spaces stay escaped** (seen 2026-11-10). The code writes them as `'\u00A0'`
  (`expectedPhrase`, `dueWords`). An agent's edit that carries the escape, through the
  Edit tool or a shell heredoc alike, can end up writing the literal character instead: tests still pass, but the
  source then holds an invisible character. After such an edit, scan the changed files
  for U+00A0 and write the escape from code (`chr(92) + 'u00A0'` in Python), not as typed
  text.
- **`jest.spyOn` on React Native's mocked `View.measureInWindow`** hands back a shared
  `jest.fn`, and `restoreAllMocks` doesn't undo its implementation: reset it by hand in
  the test that set it (step 194).
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
