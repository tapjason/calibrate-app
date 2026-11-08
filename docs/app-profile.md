# App profile

The one file that tunes the agent harness (`docs/agent-harness.md`) to this app. Every agent and
skill in `.claude/` reads the sections it needs from here, by number ("profile §5"). It collects
facts that already live in the canonical documents and points to them; it doesn't replace them.
Where this file and `CLAUDE.md`, `BUILD_PLAN.md`, `docs/design/DESIGN_SYSTEM.md` or
`docs/design/UI_ROADMAP.md` differ, they win: fix this file to match.

Keep the section numbers and headings: the agents refer to them. A section that doesn't apply
says `none` on its first line, and the agents skip the checks that depend on it.

Status: filled in 2026-11-08

## §1 Identity

- **Name:** Fairly Sure (working name since 2026-11-03, `docs/APP_STORE_LISTING.md` §0). The App
  Store Connect record is `Fairly Sure: Calibration Log`. The repo, the Expo slug (`calibrate`), the
  database file (`calibrate.db`) and older docs still say Calibrate; that is expected (§8).
- **Pitch:** log a prediction, say how sure you are, and find out whether you were right to be.
  Most people are systematically over- or underconfident in specific areas of life; the app shows
  where. Framed as identity ("Sharp in health, Tracker in money"), never as statistics.
- **Platform: iOS, iPhone only.** `ios.supportsTablet: false`; no Android build is planned (the
  owner has no Android device; `app.json` keeps an adaptive icon only because Expo expects one).
  The web build exists for automated screenshots and playtests, never as a product (§9).
- **Stack:** Expo SDK 55 (`expo` ~55.0.32), React Native 0.83.10 on the New Architecture (Fabric),
  expo-router, expo-sqlite, Zustand, Supabase, RevenueCat, local notifications, react-native-svg,
  react-native-view-shot. EAS cloud builds from Windows; there is no Mac.
- **Identity values:** bundle id `app.fairlysure`, scheme `fairlysure`, slug `calibrate`, EAS owner
  `tapjason`, `extra.eas.projectId` `02491cb4-6c7c-464e-8193-81c813ed87cd`, App Store Connect app id
  `6831917395` (`APP_STORE_ID`, `eas.json` `submit.production.ios.ascAppId`).
- **Audience:** adults who want to know when to trust their own judgement. Target age rating 4+
  (`docs/APP_STORE_LISTING.md` §1). Not for children; no Kids Category.
- **Where it stands (2026-11-08):** every UI step through 156 is built. The Apple Developer account
  has been active since 2026-11-07 and the first development build runs on the owner's iPhone.
  Next: the device fixes, steps 157–159, then Batch C and D on the phone, B1/B2, TestFlight
  (`docs/NEXT_STEPS.md` "Suggested order"). No submission date is set; the owner decides it.

## §2 Main flow

- **First run:** the Warmup (ten two-choice questions, an empty 50–100% confidence control each,
  then the counts and a read of *these ten*, D18) → "Make a real prediction" → Log, with the due
  date on Tomorrow and starter ideas that resolve by then. No account and no permission prompt
  first; the iOS age-range sheet asks once after the first screen is up and fails open (D4 in
  `docs/HUMAN_VERIFICATION.md`).
- **Log** (a page sheet from the "+" in the title bar of Today, Insights and History, D21): title,
  confidence (starts empty, D13), category (starts empty, D29), due date. Save waits for a title, a
  number and a category. Target: under 15 seconds.
- **Resolve:** on the due day the 19:00 reminder (or the person's time, D38) offers Happened /
  Didn't (D8); tapping it opens Resolve: Yes, No or "Can't tell / doesn't apply", and an optional
  reflection. Yes and No get identical feedback. An open prediction not yet due opens its details
  (Edit, Delete, Answer it now, D25).
- **Today** (tab): ready-to-resolve first (D22), the identity line and rating (or the calibrating
  state), the streak with today's goal, the practice row, open predictions.
- **Insights** (tab): the rating with its give-or-take, the Brier line, the calibration chart with
  the grey luck bars, the named pattern (D37), categories with badges, the Plus card.
- **History** (tab): open predictions first, then everything answered, filterable (D26).
- **You** (tab): Your card and the recaps (Share), Plus, Categories (D39, D40), notifications and
  their times, Coach, usage stats, CSV export, How scoring works, account.
- **Return paths:** due-day reminders, the weekly digest, daily practice and its reminder, the
  weekly reveal on Wrapped.
- **Practice** (sheet from Today): three questions a day, the same for everyone, never mixed into
  the real record.

## §3 Who decides what

- **The device owns:** predictions, resolutions and reflections, the stats derived from them
  (recomputed in the same transaction as every change), the streak and rest days (derived on every
  read, never stored), practice and Warmup answers (never synced), categories, names and icons (not
  synced, D39, D40), settings, the age band, the entitlement mirror, deletion tombstones. All in
  SQLite (`calibrate.db`); the app is complete offline with no account.
- **Supabase owns (after sign-in):** Auth (email; Sign in with Apple through `signInWithIdToken`),
  the synced copy of predictions (last-write-wins, deletions as tombstones), entitlements written by
  the `revenuecat-webhook` Edge Function, Coach usage and rate limits, analytics events from
  signed-in users (and the guest funnel table once `GUEST_ANALYTICS` is on, D43), account deletion
  (`delete-account`).
- **RevenueCat owns:** whether someone has Plus. Absence or any error reads as free, never Plus;
  `fetchEntitlement()` returns `null` for "couldn't ask" so an offline launch doesn't strip Plus.
- **OpenAI** (through the `coach` Edge Function only): reads computed numbers, never titles or
  reflections by default (`COACH_AGENT.md`).
- **Never on the client:** service-role keys, the OpenAI key, the RevenueCat `sk_` key, the webhook
  secret. The client holds only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (a `test_` key until B1 issues an `appl_` key).
- **Server checks:** every Edge Function verifies the caller's JWT (the webhook its shared secret),
  rate-limits per user, caps input size and `max_tokens`; RLS scopes every table to its owner.

## §4 Where things live

Layers, lowest first (`BUILD_PLAN.md`; an import arrow only points downward; L6 is enforced by
`src/components/layering.test.ts`):

- **L0 config:** `src/constants/` (`theme.ts` tokens, no hex literals elsewhere; `app.ts` identity
  strings and feature flags `REFINE_ENABLED`, `CUSTOM_CATEGORY_SYNC`, `GUEST_ANALYTICS`,
  `TITLE_EDIT_SYNC`, `APP_STORE_ID`; `badges.ts`, `cardThemes.ts`, `categoryIcons.ts`,
  `practiceFacts.ts`, `contrast.ts`, `fonts.ts`).
- **L1 types:** `src/types/index.ts` only (`Prediction`, `UserStat`, `CategoryStat`, `Entitlement`,
  `MIN_N_OVERALL`, `MIN_N_CATEGORY`, the Coach types).
- **L2 data:** `src/db/` (expo-sqlite; sql.js under Jest via `src/db/testing.ts`); migrations
  append-only in `src/db/migrations/NNN_name.ts`, listed in `index.ts`, applied by name and recorded
  in `_migrations` (`runner.test.ts`).
- **L3 engine:** `src/engine/` pure functions (`calibration.ts`, `chance.ts`, `direction.ts`,
  `sameDay.ts`, `corrections.ts`, `streak.ts`, `localTime.ts`, `patterns.ts`, `trends.ts`,
  `wrapped.ts`, `warmup.ts`, `practice.ts`, `coverageNudge.ts`, `milestones.ts`, `pastOutcomes.ts`,
  `categories.ts`). The engine takes `now` as an argument and never reads the clock.
- **L4 state:** `src/store/*Store.ts` (Zustand; state and actions, no business math; every
  mutation and its stats recompute in one `withTransaction`).
- **L5 services:** `src/supabase/`, `src/notifications/`, `src/ai/`, `src/billing/`,
  `src/analytics/`, `src/share/`, `src/export/`, `src/review/`, `src/age/`, `src/media/`. Every one
  fails silently; Log → Resolve → Stats works with all of them broken.
- **L6 presentation:** `app/` (expo-router: `(tabs)/` index = Today, insights, history, you;
  `log`, `resolve/[id]`, `resolve/run`, `prediction/[id]`, `share/`, `warmup/`, `practice`,
  `categories`, `scoring`, `paywall`, `account/`, `dev/seed`, `dev/celebrations`) and
  `src/components/` (`ui/` primitives, then one folder per feature).
- **Server:** `supabase/migrations/*.sql` (001–008; 007 and 008 not yet applied live),
  `supabase/functions/` (`coach`, `revenuecat-webhook`, `delete-account` deployed; `refine` not).
- **Builder agents** (they write code when delegated): `core-domain` (L1–L4), `services` (L5),
  `mobile-ui` (L6). The reviewing agents are read-only (`docs/agent-harness.md`).

## §5 The record

The record is the product: a number on screen is only worth what it is built on. These ids are the
shared checklist for the code-reviewer, the record-auditor, the design-analyst and the playtests.
Each one restates a rule in `CLAUDE.md`, which is authoritative.

| Id | Rule | Source |
| --- | --- | --- |
| R1 | Buckets `[0,20) [20,40) [40,60) [60,80) [80,100]`, lower bound inclusive, top closed; count-weighted mean absolute error; clamped to 0–100. The worked examples are required fixtures. | `CLAUDE.md` Calibration Engine |
| R2 | Never a number built on noise: below `MIN_N_OVERALL` (20) no headline rating, below `MIN_N_CATEGORY` (15 now, 20 after step 157, D46) no category score; progress toward the gate instead. No badge above Tracker while provisional. | Minimum-N gating |
| R3 | A tier is earned at its low end (score minus its give-or-take clears the bar) and with its resolution minimum (20 / 50 / 100). Today and the share card name only tiers past the count gate (D27). | Badge Levels, D35 |
| R4 | One lean rule everywhere: over or under only outside the central 80% of luck (`chanceRange`, `LEAN_MASS`) and by at least 5 points. The chart's grey bars show that 80%. | D35 |
| R5 | Same-day answers aren't scored (`isSameDayAnswer`, `scoredFrom`); the earliest picked due date is the next day. | D41 |
| R6 | The score holes stay closed: new words are a new prediction (`title_edited_at`); deleted calls are counted (`deletionCounts`); a "Can't tell" can be answered for 7 days only (`SKIP_ANSWER_DAYS`). | D45 |
| R7 | Corrections: Yes ↔ No within 24 hours of the first answer (`CORRECTION_WINDOW_HOURS`); a Yes or No never becomes "Can't tell"; the confidence is never editable. | D34, D25 |
| R8 | Reward calibration, not correctness: Yes and No look, move and buzz the same; green means calibrated, never correct; red never marks an outcome; nothing rewards a particular confidence (D23). | DESIGN_SYSTEM §0.4 |
| R9 | Warmup and practice never touch `UserStat`, `CategoryStat`, the streak, badges or Wrapped. | Warmup Module, Daily practice |
| R10 | The Brier line is quiet: Insights and How scoring works only, only once the rating unlocks, against the person's own base rate. | D24, D35 |
| R11 | Every figure reconciles across Today, Insights, History, Resolve, Wrapped and the card (same counts, same exclusions); a card or recap says what it leaves off and carries the give-or-take. | D42 |
| R12 | The Coach states only what the input proves: every insight cites an `evidence` number the validator checks, no verdicts on provisional data. | `COACH_AGENT.md` |

## §6 Monetization

- **Plus** (`PLUS_NAME`): ~$4.99/month, $29.99/year with one free month (annual only), lifetime
  $59.99 on the RevenueCat Test Store. P1, the price itself, is open: GROWTH §4 recommends
  $34.99/year and $79.99 lifetime. Store-side settings; the app renders what the store reports.
- **Plus sells** the Coach, Trends, card themes and other cosmetics. **Free forever:** the whole core
  loop, the score, the chart, badges, streaks, History, CSV export, every share card and Wrapped.
- **Rules:** the paywall never touches the core loop or anything shareable; no checkout outside IAP
  (link-out commission unsettled, `docs/HUMAN_VERIFICATION.md` "Decisions only you can make"); the
  paywall states that the trial converts and that cancelling takes 24 hours' notice; the trial
  reminder (D16) carries no offer; a purchase prompt opens only from a deliberate tap.
- **No ads, no tracking, no ATT prompt.**

## §7 Content, tone and the Coach

- **Copy** follows `docs/design/DESIGN_SYSTEM.md` §7.9: plain words, counts before verdicts, the
  person's own numbers, no " · " joins or "→" in text, no exclamation marks for outcomes. Decided
  copy stays as decided (the identity line's middle dot is one such exception).
- **No user-to-user content.** Titles and reflections are the person's own text, on their phone
  and their account only. Cards leave through the OS share sheet.
- **The Coach** (Plus, sign-in, opt-in that names OpenAI before the first send, Guideline
  5.1.2(i)): `COACH_AGENT.md` is authoritative. No diagnosis, no personality inference, no
  medical, financial or legal advice, no numeric diet or exercise targets. Freetext isn't sent by
  default.
- **Crisis-adjacent text:** `src/ai/crisisFilter.ts` catches distress signals before any coaching
  call and routes to `src/components/stats/SupportSurface.tsx`, never to the model.
- **Social:** cooperative only, after v1 (D44): nothing ranks, scores one person against another
  or names a winner.

## §8 Data safety

- **Migrations:** SQLite migrations only append (`src/db/migrations/`); a migration that has run on
  a phone (the owner's development build since 2026-11-07, anyone's from TestFlight on) is never
  edited, only followed by a new one. Supabase migrations likewise; a dropped column needs a
  migration that moves the data first.
- **Ids that saved data references, never changed:** the database file `calibrate.db`, the
  built-in category ids (`work`, `health`, `finance`, `social`, `personal`) and the `c-` prefix of
  added ones, badge ids (`guesser` … `oracle`; "Getting started" is only the label), card theme
  ids, settings keys, the notification identifiers and category (the Happened / Didn't actions),
  the analytics event names.
- **App identity, never changed after the first build:** everything in §1 "Identity values".
- **Sync flags:** a column the live schema lacks stays out of the wire row behind its flag
  (`TITLE_EDIT_SYNC` until migration 008 is applied, `GUEST_ANALYTICS` until 007); the owner
  applies the migration, then the flag flips.
- **NO-GO checks against the last submitted tag (`/release-gate`):** an edited SQLite or Supabase
  migration; a changed id above; a changed identity value; a dropped column without a moving
  migration; an analytics property that can carry free text (`EVENT_PROPS` is closed: enum and
  numeric values only); a sync flag on before its migration is live.
- **Portability and deletion:** CSV export (free); account deletion in the app
  (`app/account/delete.tsx` → `delete-account`); guest Erase clears the device.

## §9 Test bridge

- **Web server:** `bash scripts/web-serve.sh start|status|stop`, `expo start --web` on
  **http://localhost:8097** (`PORT=<n>` to override). Port 8081 belongs to the owner's iPhone dev
  server (`npx expo start --dev-client --tunnel`); never take it. "Up" means the page's `<title>`
  is "Fairly Sure". Log `.tooling/expo-web.log`, PID `.tooling/expo-web.pid`. On this PC the
  server can be killed when memory runs low; `status` says so.
- **Browser:** the Playwright MCP server `playwright` (configured in the owner's Claude Code
  settings, `npx @playwright/mcp@latest --isolated`; tools `mcp__playwright__*`). Phone sizes:
  375 × 812 default; also 320 × 568 (smallest), 390 × 844 and 402 × 874 (iPhone 17); landscape
  568 × 320 once per run.
- **Dev routes (only when `__DEV__`):** `/dev/seed` with **Load demo data** (`dev-seed-load`: about
  145 resolved and 7 open predictions over five months; status in `dev-seed-status`), **Preview
  Plus until reload** (`dev-seed-plus`, in memory only), **Go to Today** (`dev-seed-home`);
  `/dev/celebrations` replays the celebration moments.
- **A fresh install:** navigate to `http://localhost:8097/favicon.ico` (same origin, the app not
  running), then `browser_evaluate`:
  `async () => { const r = await navigator.storage.getDirectory(); await r.removeEntry('expo-sqlite', { recursive: true }).catch(() => {}); localStorage.clear(); return 'cleared'; }`.
  Removing it while the app is open fails ("modifications are not allowed"). A fresh Playwright
  context also starts empty.
- **Stand-ins:** dark mode through `browser_emulate_media` (`colorScheme: 'dark'`); large text
  through CSS `zoom` 2 and 1.5 (harsher than Dynamic Type: it also halves the layout width);
  Reduce Motion through `reducedMotion: 'reduce'`; VoiceOver through the accessibility snapshot.
- **What web can't show (always under Not verified):** everything in §18.

## §10 Personas

The standing cast for `/playtest`; a brief may add one. Each is played blind: the agent sees only
the browser.

| Persona | Who | What they need | What would lose them |
| --- | --- | --- | --- |
| Maya, 34 | Marketing, never heard of calibration, five minutes to decide, fresh install | The first result in a minute, a reason to come back tomorrow | Homework, jargon, "come back in a week" |
| Priya, 45 | Product director, five months of predictions (demo data), Sunday check-in | Where she is off, in plain words, with the counts | A number she can't explain, a verdict without receipts |
| Walt, 67 | Retired, macular degeneration, largest text, dark mode | Every word readable, big targets, nothing timed | Text broken letter by letter, overlapping labels |
| Kai, 26 | Competitive, wants a better badge tonight by any means | (He's the test: every way to pad the record) | Nothing: what he finds is a hole (§5) |
| Rosa, 24 | Social-media manager, shares everything, jokey emoji categories | A card she would post, her own categories | A card that advertises her worst area, a long name breaking a screen |
| Elena, 52 | Data-protection lawyer, reads every privacy line and the network log | Exactly what leaves the phone, said plainly | Anything sent that the copy didn't say |
| Kofi, 45 | Blind, accessibility consultant, keyboard and screen reader | Every control named, announcements, order | Unnamed buttons, silent state changes |
| Dana, 31 | QA engineer, breaks inputs for a living, 320 wide and landscape | Limits that are stated and hold | Silent truncation, dates in the year 9999 |

Default set: Maya (fresh), Priya, Walt, Kai, Rosa. Elena after any change to what leaves the
phone; Kofi after accessibility work; Dana after input or layout work.

## §11 Models

none. The engine's own fixtures (`src/engine/*.test.ts`, the `CLAUDE.md` worked examples) and the
demo data stand in. Numbers an agent reasons to without them are labelled **estimate**.

## §12 Experience rubric

| Item | Bar | Source |
| --- | --- | --- |
| Day 0 | The Warmup's result within about 60 s of first launch; no account or permission before it | Warmup Module |
| The first real result | The first prediction defaults to Tomorrow; Today says when the first answer comes (D30) | D18, D30 |
| Logging | Under 15 s; Save names what it still needs | Log Module |
| Resolving | One tap from the reminder; Yes and No identical | D8, R8 |
| Honest numbers | Nothing provisional shown as a headline; every lean has its counts beside it | R2, R4 |
| Largest text | Every screen readable and operable at the stand-in large text on 375 wide; nothing clipped or overlapping | DESIGN_SYSTEM §8 |
| Small phone | Every screen works at 320 × 568 in both appearances | UI_ROADMAP §1 |
| Share card | One the persona would post; says what it leaves off; legible at story size | D42, DESIGN_SYSTEM §7.5 |
| Padding | No way found to raise a score or badge without calibrated answers | §5 |
| Screens | Pass the DESIGN_SYSTEM §8 checklist and §0 non-negotiables | DESIGN_SYSTEM |

## §13 Performance and accessibility budgets

| Measure | Budget |
| --- | --- |
| Contrast | Text ≥ 4.5:1, UI and graphics ≥ 3:1 (`src/constants/theme.test.ts`) |
| Type and targets | Nothing under 11 pt; targets ≥ 44 × 44 pt (`hitSlop` where the glyph is smaller); Dynamic Type to the largest size; `display` capped at 1.6× (`DISPLAY_MAX_SCALE`) |
| Motion | Every animation has a Reduce Motion variant; every haptic a visual twin |
| VoiceOver | Every control named; a number and its label one element; state changes announced (`announceForAccessibility`) |
| Fonts | One family (Instrument Sans), four files, loaded through the `expo-font` plugin |
| Icon | 1024 × 1024 (`assets/icons/icon.png`) |
| iOS JS bundle | Baseline at the first `bash scripts/check.sh --release` (`.tooling/export`); flag a rise over 10% between releases |
| Cold start | Not measured yet; the owner's first TestFlight build sets the baseline (device only) |
| Network | Complete offline; sync, billing, Coach and analytics degrade silently |

## §14 Live ops

none until launch. Then: D0 aha rate (`warmup_completed / warmup_started`) and share rate (shares
per active user), the two validation questions with their SQL in `docs/HUMAN_VERIFICATION.md`
"Open work that is code"; D1 / D7 / D30 retention and crashes (App Store Connect); installs per
share surface (the `ct=share-card-text` campaign token); trial conversion (RevenueCat); range
coverage (the share of predictions under 40%). The event catalogue is `src/analytics/events.ts`.
Saved exports go under `docs/live/` for `/live-review`.

## §15 Content types

### practice-facts

- **File:** `src/constants/practiceFacts.ts` (`PRACTICE_FACTS`: reference tables of city
  coordinates, country areas, heights, diameters, years, atomic numbers).
- **Used by:** `src/engine/practice.ts` (the daily deck of fair pairs) and `src/engine/warmup.ts`
  (the ten, `warmupQuestions`).
- **Test:** `src/engine/practice.test.ts`, `src/engine/warmup.test.ts`.
- **Design checks:** a fact from a citable reference; never picked to be tricky (D14); pairs close
  enough not to be a giveaway and far enough apart that the source doesn't decide them; changing
  the tables changes the Warmup's ten for everyone, so say so.

### card-theme

- **File:** `src/constants/cardThemes.ts` (`CARD_THEMES`, `DEFAULT_THEME`, `WRAPPED_DEFAULT_THEME`).
- **Built by:** `src/components/share/IdentityCard.tsx`, `WrappedCard.tsx`; exported by
  `src/share/export.ts`.
- **Test:** `src/constants/cardThemes.test.ts` (contrast on the card).
- **Design checks:** the free theme always exports; a Plus theme falls back to it when Plus lapses;
  over / under / on-the-line colours keep their meaning; no person's icon or photo on a card (D40).

### starter-idea

- **File:** `src/components/prediction/StarterIdeas.tsx` (`STARTER_IDEAS`).
- **Design checks:** resolvable by the due date its own words imply (step 94; D18 wants the first
  ones resolved by tomorrow); it fills the category (D29); plain words (DESIGN_SYSTEM §7.9).

### category-emoji

- **File:** `src/constants/categoryIcons.ts` (`SUGGESTED_CATEGORY_EMOJI`, 24).
- **Design checks:** a starting point, not the whole set (the field beside it takes any emoji);
  roughly the built-ins first; app only, never on a card or Wrapped (D40).

## §16 Human-only actions

- Apple: App Store Connect (the record, listing, screenshots, privacy labels and age rating as
  entered, review notes, TestFlight groups, export compliance), identifiers and capabilities,
  agreements, the In-App Purchase `.p8` key (never read, copied or committed; Key ID, Issuer ID and
  Team ID stay out of the repo).
- EAS: `eas login`, `eas credentials`, `eas env:create` (values from `.env.local`, which agents never
  read), `eas build` (an agent may run it only after the owner confirms the exact command),
  `eas submit` (never an agent).
- Supabase: dashboard settings, Auth providers, applying migrations to the live project, Edge
  Function deploys and secrets, restoring a paused project.
- RevenueCat: the dashboard, products, offerings, keys.
- GitHub: `git push`, pull requests on the remote, Pages, repository secrets.
- **The iPhone:** installing builds, running the app, every check in §18, Developer Mode, the
  notification permission dialog, real purchases in sandbox.
- Decisions: pricing (P1), EU trader status, the domain, the submission date, anything in
  UI_ROADMAP §2 not yet decided, anything that spends money or deletes someone's data.

## §17 Store presence

`docs/APP_STORE_LISTING.md` is the draft and wins. Name `Fairly Sure: Calibration Log`; subtitle
"Know when to trust your gut" [30]; keywords [100 bytes] in §1 there; Productivity, then
Lifestyle; age rating 4+ with "Yes" for age assurance; screenshots: at least one 6.9-inch set
(1320 × 2868), seven planned (§5 there), finals from a device build; privacy policy
`https://tapjason.github.io/calibrate-app/privacy/` and support `/support/` (404 until GitHub
Pages is on); App Privacy answers in `docs/APP_PRIVACY.md`; review notes in §4 there; export
compliance declared (`ITSAppUsesNonExemptEncryption: false`).

## §18 The iPhone

The owner's phone is an **iPhone 17 on iOS 26**. There is no simulator and no Mac, so every native
behaviour is checked by the owner on that phone, and an agent says so in every report.

- **Running it:** a development build from EAS (`eas build --profile development --platform ios`,
  installed from the EAS link), then `npx expo start --dev-client --tunnel` on the PC (port 8081)
  and open it from the dev client. Expo Go can't open SDK 55. A JS change needs a reload (shake →
  Reload, or `r` in the terminal); a stale screen after a fix usually means the bundle didn't
  reload (`--clear` rebuilds the cache). A native change (a new native package, an `app.json`
  plugin, an entitlement) needs a new build.
- **Native only, never verified on web:** haptics; SF Symbols (web falls back to Ionicons);
  `ui-rounded` numerals; Liquid Glass; native sheets (`formSheet`, page sheets) and their gestures;
  the iOS switch (63 × 28 pt on iOS 26, drawn exactly in its measured frame); the date and time
  pickers; local notifications, their permission dialog and the Happened / Didn't actions; Sign in
  with Apple; the Declared Age Range sheet; the OS share sheet and PNG export (view-shot); the
  rating prompt; RevenueCat purchases and restore; real Dynamic Type; VoiceOver; cold start;
  keyboard avoidance.
- **Known iOS-vs-web traps** (from the first device run, 2026-11-07 and 08):
  - react-native-screens on the New Architecture can resize a `formSheet`'s scroll view over its
    header; Log is a page sheet with its header inside the scroll view (`app/_layout.tsx`).
  - Yoga squashes an in-flow child inside a 0-height wrapper down to its padding where CSS
    wouldn't; a measured canvas lays out out of flow (`ScaledCanvas`, `position: 'absolute'`).
  - Centring a switch on a label plus a two-line description lines it up with neither; switch rows
    put the switch on the label's line (`ToggleRow`, `ToggleSwitch`).
  - iOS asks before a Log draft is discarded (`useLogDraftGuard`); web has no action sheet.
  - Web shows times as "07:00 PM", the device as the system's locale ("19:00").
- **Where device results go:** the owner reports; the main session records them in `HANDOFF.md`
  and ticks `docs/HUMAN_VERIFICATION.md` (Batch C, D). `/device-check` writes the list to check.
