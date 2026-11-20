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
- **Where it stands (2026-11-16):** steps 1–187 are built and on `master`
  (`docs/design/BUILT_LOG.md`). The Apple Developer account has been active since 2026-11-07. The
  first TestFlight build (1.0.0, build 2, steps through 186) is on the owner's iPhone; build 3
  carries step 187. Open items: `docs/SHIP_READINESS.md` "Open work". No submission date is set;
  the owner decides it.

## §2 Main flow

- **First run:** the Warmup (ten two-choice questions, an empty 50–100% confidence control each,
  then the counts and a read of *these ten*, D18) → "Make a real prediction" → Log, with the due
  date on Tomorrow and starter ideas that resolve by then. No account and no permission prompt
  first; Apple's age-range sheet may appear after the first screen is up (D4 in
  `docs/HUMAN_VERIFICATION.md`). No band, or a decline, changes nothing; a band that can
  include someone under 13 makes the phone local-only (D70: no sign-in, sync, usage counts,
  Coach or RevenueCat, no Plus offered, no rating prompt; everything else as usual). Apple
  is asked at every launch; until it has answered on a launch with no band of 13 or over
  stored, sign-in and the Plus plans wait (§3, the under-13 bullet).
- **Log** (a page sheet from the "+" in the title bar of Today, Insights and History, D21): title,
  confidence (starts empty, D13), category (starts empty, D29), due date (starts on Tomorrow, D55).
  Save waits for a title, a number and a category, and names the date ("Save, due Sunday", D55).
  Target: under 15 seconds.
- **Resolve:** on the due day the 19:00 reminder (or the person's time, D38) offers Happened /
  Didn't (D8); tapping it opens Resolve: Yes, No or "Can't tell / doesn't apply", and an optional
  reflection. Yes and No get identical feedback. An open prediction not yet due opens its details
  (Edit, Delete, Answer it now, D25).
- **Today** (tab): the identity line and rating (or the calibrating state) and the reminder ask, then
  ready-to-resolve (D22) with the streak, today's goal and the practice row right after it, then the
  other open predictions; with nothing ready, the open predictions come before the daily rows (D48).
  After a save it scrolls to the new card when it isn't all on screen (D48).
- **Insights** (tab): the rating with its give-or-take, the Brier line, the calibration chart with
  the grey luck bars, the named pattern (D37), categories with badges, the Plus card.
- **History** (tab): open predictions first, then everything answered, filterable (D26).
- **You** (tab): Your card and the recaps (Share), Plus, Categories (D39, D40), the streak,
  hide-the-words and app-lock switches (D59, D61, D64), notifications and their times, Coach, usage
  stats, CSV export, How scoring works, account.
- **Return paths:** due-day reminders, the weekly digest, daily practice and its reminder, the
  weekly reveal on Wrapped.
- **Practice** (sheet from Today): three questions a day, the same for everyone, never mixed into
  the real record.

## §3 Who decides what

- **The device owns:** predictions, resolutions and reflections, the stats derived from them
  (recomputed in the same transaction as every change), the streak and rest days (derived on every
  read, never stored), practice and Warmup answers (never synced), categories, names and icons (not
  synced, D39, D40), settings, the age band, the entitlement mirror, deletion tombstones, the counts of late moves
  and of answers moved between categories, with the category each prediction had at its first
  move after the day it was logged (never synced; round 6; round 7: a rewording doesn't move
  that day), and each prediction's two UTC
  offsets, the logging's and the rewording's (synced only once `UTC_OFFSET_SYNC` is on,
  D69 (f)). All in
  SQLite (`calibrate.db`); the app is complete offline with no account. The sign-in session is
  in the iPhone Keychain (`src/supabase/sessionStorage.ts`, D69 (d)). Sign-out takes the
  account's rows off the phone, all but those integrity counts (D69 (a), round 6,
  `docs/ACCOUNT_SPEC.md` §2); a guest's Erase takes every account id's rows, those counts
  included, with the age band, the Warm-up and practice; settings and the entitlement mirror
  stay (D71 (a), `wipeEverythingOnDevice`), and so does the install id RevenueCat's SDK
  keeps. The support card's set-asides
  (an id and a hash of the words per prediction, D71 (b)) live in the settings record,
  never synced; a key goes when its prediction's words change or it is deleted.
- **The under-13 rule (D70) decides whether anything leaves the phone:** one predicate
  (`isUnder13Band`, `src/engine/ageBand.ts`: any band that can include someone under 13,
  so (none, 15) and (none, 17) count too), one field (`useAgeStore.localOnly`,
  `src/store/ageStore.ts`), read by every upload path; `src/age/egress.test.ts` fails when a
  file that can send over the network isn't listed and gated, when a listed file gains a
  network call, or when a gate comes after the first request. Account deletion and sign-out
  stay open (they remove data). An account signed in before the rule came on is frozen
  (`docs/ACCOUNT_SPEC.md` §2). Apple is asked at every launch, whatever band is stored; a
  stored band that can't be read keeps the gate shut. On a launch that waits for the
  answer (no stored band, an under-13 one, or one that can't be read), RevenueCat is never
  set up before it, with no time limit (the paywall shows that the plans couldn't load);
  a sign-in waits 5 s and is then refused for now ("Sign-in isn't ready yet. Try again in
  a moment."); the guest flush, the rating prompt, the Coach and the trial reminder's
  RevenueCat read wait; a sync waits at most 60 s and then goes on. With a stored band of 13 or over the ask is in the background and nothing
  waits. `docs/design/research/under-13-2026-11.md` is the spec, and lists the residuals
  (a frozen account's sign-in renewed each time the app starts with it expired, among
  them).
- **Supabase owns (after sign-in):** Auth (email sign-in, with Create account hidden, D69 (c); Sign in with Apple through `signInWithIdToken`, with a nonce; Google through the system sheet and `exchangeCodeForSession`, behind `GOOGLE_SIGN_IN_ENABLED`),
  the synced copy of predictions (last-write-wins, except that an answered prediction never goes back to open, D69; deletions as tombstones, each removing on the server only the open row or the same answer the deleting phone saw, round 7), entitlements written by
  the `revenuecat-webhook` Edge Function, Coach usage and rate limits, analytics events from
  signed-in users and guests' funnel counts with no account, device or install id, sent only after the Warm-up's notice (`guest_analytics_events`, D43, D69 (b)),
  account deletion (`delete-account`).
- **RevenueCat owns:** whether someone has Plus. Absence or any error reads as free, never Plus;
  `fetchEntitlement()` returns `null` for "couldn't ask" so an offline launch doesn't strip Plus.
  Never configured on a local-only phone (D70), where a Plus mirror already there is left
  as it is, nor before Apple's age answer on a launch that waits for it. A sign-out before
  it has started sets the mirror to free, and the next signed-out start logs that account
  out of RevenueCat before reading any entitlement (`dropCachedAccount`); if the SDK can't
  say whether its user is anonymous, reads report "couldn't find out" and purchases
  "unavailable" until a sign-in or the next launch.
- **OpenAI** (through the `coach` Edge Function only): reads computed numbers, never titles or
  reflections by default (`COACH_AGENT.md`).
- **Never on the client:** service-role keys, the OpenAI key, the RevenueCat `sk_` key, the webhook
  secret. The client holds only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (the App Store `appl_` key in the EAS `production` environment;
  the `development` one holds a Test Store `test_` key, which a release build ignores, step 182).
- **Server checks:** every Edge Function verifies the caller's JWT (the webhook its shared secret),
  rate-limits per user, caps input size and `max_tokens`; RLS scopes every table to its owner.

## §4 Where things live

Layers, lowest first (`BUILD_PLAN.md`; an import arrow only points downward; L6 is enforced by
`src/components/layering.test.ts`):

- **L0 config:** `src/constants/` (`theme.ts` tokens, no hex literals elsewhere; `app.ts` identity
  strings, URLs and ids, `REFINE_ENABLED`, `APP_STORE_ID`, `APP_STORE_PROVIDER_TOKEN`; `badges.ts`,
  `cardThemes.ts`, `categoryIcons.ts`, `practiceFacts.ts`, `contrast.ts`, `fonts.ts`).
- **Development only:** `src/dev/` (playtest profiles and their loader, §9): an L4 peer that
  stitches stores and `src/db/` helpers together for `/dev/seed`, the way Erase all data does.
  Nothing outside `app/dev/` imports it.
- **L1 types:** `src/types/index.ts` only (`Prediction`, `UserStat`, `CategoryStat`, `Entitlement`,
  `MIN_N_OVERALL`, `MIN_N_CATEGORY`, the Coach types).
- **L2 data:** `src/db/` (expo-sqlite; sql.js under Jest via `src/db/testing.ts`); migrations
  append-only in `src/db/migrations/NNN_name.ts`, listed in `index.ts`, applied by name and recorded
  in `_migrations` (`runner.test.ts`).
- **L3 engine:** `src/engine/` pure functions (`calibration.ts`, `chance.ts`, `direction.ts`,
  `sameDay.ts`, `corrections.ts`, `streak.ts`, `localTime.ts`, `patterns.ts`, `trends.ts`,
  `wrapped.ts`, `warmup.ts`, `practice.ts`, `coverageNudge.ts`, `milestones.ts`, `pastOutcomes.ts`,
  `categories.ts`, `ageBand.ts`, `supportAside.ts`). The engine takes `now` as an argument and
  never reads the clock.
- **L4 state:** `src/store/*Store.ts` (Zustand; state and actions, no business math; every
  mutation and its stats recompute in one `withTransaction`).
- **L5 services:** `src/supabase/`, `src/notifications/`, `src/ai/`, `src/billing/`,
  `src/analytics/`, `src/share/`, `src/export/`, `src/review/`, `src/age/`, `src/media/`,
  `src/lock/` (the app lock, D64). Every one
  fails silently; Log → Resolve → Stats works with all of them broken.
- **L6 presentation:** `app/` (expo-router: `(tabs)/` index = Today, insights, history, you;
  `log`, `resolve/[id]`, `resolve/run`, `prediction/[id]`, `share/`, `warmup/`, `practice`,
  `categories`, `scoring`, `paywall`, `account/`, `dev/seed`, `dev/celebrations`) and
  `src/components/` (`ui/` primitives, then one folder per feature).
- **Server:** `supabase/migrations/*.sql` (001–008, all applied to the live project),
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
| R2 | Never a number built on noise: below `MIN_N_OVERALL` (20) no headline rating, below `MIN_N_CATEGORY` (20, D46, step 157) no category score; progress toward the gate instead. No badge above Tracker while provisional. | Minimum-N gating |
| R3 | A tier is earned at its low end (score minus its give-or-take clears the bar) and with its resolution minimum (20 / 50 / 100). Today and the share card name only tiers past the count gate (D27). | Badge Levels, D35 |
| R4 | One lean rule everywhere: over or under only outside the central 80% of luck (`chanceRange`, `LEAN_MASS`) and by at least 5 points; no lean word or mark for a range under 10 (`MIN_N_BAND`, D58). The chart's grey bars show that 80%. | D35, D58 |
| R5 | Same-day answers aren't scored (`isSameDayAnswer`, `scoredFrom`), both days read in the UTC offset stored when the prediction was logged or reworded, never in the zone of the answer (`isOnMadeDay`; with no stored offset, the phone's zone); the earliest picked due date is the next day. | D41, D69 (f) |
| R6 | The score holes stay closed: new words are a new prediction (`title_edited_at`); deleted calls are counted (`deletionCounts`: a scored Yes or No, or an open one deleted on any day after the day it was logged, or already due; `isOnLoggedDay`, which a rewording doesn't move, round 7); a scored answer that ends up in a different category from the one it had at the end of the day it was logged is counted (`refileCounts`, `answerCountedAsMoved`, D65, round 6), and a category change made while it was open, from the eve of its due day but not on the day it was logged, is counted once, as a late change (`categoryChangeCounts`, round 7); a "Can't tell" can be answered until 7 days after its due day (`SKIP_ANSWER_DAYS`), or to the end of the day after the skip if that's later (`skipLastDay`). | D45 |
| R7 | Corrections: Yes ↔ No within 24 hours of the first answer (`CORRECTION_WINDOW_HOURS`); a Yes or No never becomes "Can't tell"; the confidence is never editable. | D34, D25 |
| R8 | Reward calibration, not correctness: Yes and No look, move and buzz the same; green means calibrated, never correct; red never marks an outcome; nothing rewards a particular confidence (D23). | DESIGN_SYSTEM §0.4 |
| R9 | Warmup and practice never touch `UserStat`, `CategoryStat`, the streak, badges or Wrapped. | Warmup Module, Daily practice |
| R10 | The Brier line is quiet: Insights' fine print and How scoring works only, only from 50 scored answers (`BRIER_MIN_N`), against the person's own base rate. | D24, D35, D62 |
| R11 | Every figure reconciles across Today, Insights, History, Resolve, Wrapped and the card (same counts, same exclusions); a card or recap says what it leaves off and carries the give-or-take. | D42 |
| R12 | The Coach states only what the input proves: every insight cites an `evidence` number the validator checks, no verdicts on provisional data. | `COACH_AGENT.md` |

## §6 Monetization

- **Plus** (`PLUS_NAME`): $4.99/month, $34.99/year with one free month (annual only), $79.99
  lifetime, set in App Store Connect (2026-11-16; P1 closed, GROWTH §4). Store-side settings; the
  app renders what the store reports.
- **Plus sells** the Coach, Trends, card themes and other cosmetics. **Free forever:** the whole core
  loop, the score, the chart, badges, streaks, History, CSV export, every share card and Wrapped.
- **Rules:** the paywall never touches the core loop or anything shareable; no checkout outside IAP
  (link-out commission unsettled, `docs/HUMAN_VERIFICATION.md` "Decisions only you can make"); the
  paywall states that the trial converts and that cancelling takes 24 hours' notice; the trial
  reminder (D16) carries no offer; a purchase prompt opens only from a deliberate tap. On a
  local-only phone (D70) Plus isn't offered at all: no Plus row in You, no Plus card or Coach
  upsell, no locked themes, and the paywall route shows "Plus isn't offered on this phone".
- **No ads, no tracking, no ATT prompt.**

## §7 Content, tone and the Coach

- **Copy** follows `docs/design/DESIGN_SYSTEM.md` §7.9: plain words, counts before verdicts, the
  person's own numbers, no " · " joins or "→" in text, no exclamation marks for outcomes. Decided
  copy stays as decided (the identity line's middle dot is one such exception).
- **No user-to-user content.** Titles and reflections are the person's own text, on their phone
  and their account only. Cards leave through the OS share sheet.
- **The Coach** (Plus, sign-in, opt-in that discloses a third-party AI service before the
  first send, Guideline 5.1.2(i); the privacy policy names OpenAI): `COACH_AGENT.md` is
  authoritative. No diagnosis, no personality inference, no
  medical, financial or legal advice, no numeric diet or exercise targets. Freetext isn't sent by
  default.
- **Crisis-adjacent text:** `src/ai/crisisFilter.ts` catches distress signals before any coaching
  call and routes to `src/components/stats/SupportSurface.tsx`, never to the model. The card
  says why it came up and offers "Back to Coach", which sets aside the predictions that
  matched, on this phone only, until new matching words appear (D71 (b),
  `src/engine/supportAside.ts`). The tap checks again first: nothing matching any more
  takes the card away with nothing stored, and a topic whose card hasn't been shown gets
  its card first ("Other words matched too, so this message changed."), nothing set aside
  (`useCoachStore.backToCoach`); that holds per topic even inside one note, and "Back to
  Coach" rests for about a second after the card changes. A US-territory phone gets 988 on every topic (D71 (c)), and so does a US phone (D72 (d)): 988 is the only helpline the app names.
  The Coach is off on a local-only phone (D70).
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
- **Sync flags:** a column the live schema lacks stays out of the wire row behind its flag; the
  owner applies the migration, then the flag flips. None is pending: 006 to 008 are live and their
  flags are gone (2026-11-16), so an added category's id, `title_edited_at` and guests' funnel
  counts all go up.
- **NO-GO checks against the last submitted tag (`/release-gate`):** an edited SQLite or Supabase
  migration; a changed id above; a changed identity value; a dropped column without a moving
  migration; an analytics property that can carry free text (`EVENT_PROPS` is closed: enum and
  numeric values only); a sync flag on before its migration is live.
- **Portability and deletion:** CSV export (free); account deletion in the app
  (`app/account/delete.tsx` → `delete-account`); guest Erase clears the device, whoever's
  account the rows were under, all but settings and the entitlement mirror (D71 (a)); its
  confirmation counts the changes earlier accounts never pushed, which go for good.

## §9 Test bridge

- **Web server:** `bash scripts/web-serve.sh start|status|stop`, `expo start --web` on
  **http://localhost:8097** (`PORT=<n>` to override). Port 8081 belongs to the owner's iPhone dev
  server (`npx expo start --dev-client --tunnel`); never take it. "Up" means the page's `<title>`
  is "Fairly Sure". Log `.tooling/expo-web.log`, PID `.tooling/expo-web.pid`. On this PC the
  server can be killed when memory runs low; `status` says so.
- **Browser:** the Playwright MCP server `playwright` (configured in the owner's Claude Code
  settings, `npx @playwright/mcp@latest --isolated`; tools `mcp__playwright__*`). Phone sizes:
  375 × 812 default; also 320 × 568 (smallest), 390 × 844, 402 × 874 (iPhone 17) and 440 × 956
  (Pro Max). **No landscape:** the app is portrait only on iOS (`app.json` `orientation`), so a
  landscape viewport shows what no iPhone can (found 2026-11-12).
- **Dev routes (only when `__DEV__`):** `/dev/seed` with **Load demo data** (`dev-seed-load`: about
  153 resolved and 7 open predictions over five months; status in `dev-seed-status`), **Preview
  Plus until reload** (`dev-seed-plus`, in memory only), **Set an under-13 age range
  (local-only)** (`dev-seed-under13`, D70: saves an under-13 band, `(null, 12)`, through the
  age store's `accept`, as Apple's answer would, so it holds across reloads and the rule's
  screens can be seen on web; status in `dev-seed-status`; pressed again it reads **Clear the
  under-13 age range (saves 18+)** and saves `(18, null)`, which lifts the rule at once; on
  an iPhone Apple is asked again at the next launch all the same, since the D70/D71
  review, and its answer replaces the seeded band if it differs), **Go to Today**
  (`dev-seed-home`); `/dev/celebrations` replays the celebration moments. A development build opened on `/dev/…`
  skips the first-run redirect to the Warm-up, and You has a "Test data and playtest profiles"
  row (`you-dev-seed`, development builds only), the way in on the iPhone.
- **Playtest profiles** (`src/dev/playtestProfiles.ts`, on `/dev/seed`, added 2026-11-12): named
  start states, each replacing everything on the device (as Erase all data does, guest only),
  finishing the Warm-up, then writing its record. Two taps (`dev-seed-profile-<id>`, the first
  arms it); `dev-seed-profile-status`, under it, then reads `Profile "<id>" loaded: <n> predictions.` The same
  profile on the web build and the iPhone gives the same record, relative to today; ids are new on
  each load. Open ones get reminders as usual. **Erase all data before signing in with a real
  account:** signing in moves a guest's predictions into the account and uploads them. Prefer these over one-off scripts in `.playwright-mcp/`; a state
  a round needs and no profile gives becomes a new profile, with its test, in the round's commit.

  | Profile | The record | Suits |
  | --- | --- | --- |
  | `day1` | Warm-up done; the first prediction due tonight, one more next week | Maya, Grace, Destiny, Olu |
  | `first-week` | Six days in: three answered (a Can't tell, a same-day one not scored), two open, one due today; Social renamed "Running club" | Mateus, Hiroshi, Rahel, Lucía, Yusuf |
  | `first-week-school` | The same week as a secondary-school pupil's: the bus, a bio quiz, volleyball, an essay; Work renamed "School" (round 23) | Lucía, Nusrat, Kalani |
  | `first-week-retired` | The same week as a retiree's: the market bus, fasting sugar, the pension office, a walking group, the electricity bill; Social renamed "Walking group" (round 23) | Hiroshi, Piotr, Prakash |
  | `habit` | Three weeks of the same walk, logged each evening for the next day; a streak through yesterday; 16 of 21 at 90%; Personal renamed "Recovery" | Marcus, Piotr, Kiri, Hannah, Sofia |
  | `return` | Six weeks in bursts, then nothing for 22 days; six came due while away | Jun, Carol, Conceição, Bea |
  | `threshold` | 19 scored, all in health: the next scored answer (due today) unlocks the rating and health together; two thin ranges | Tomás, Ravi, Kai, Noor |
  | `long-time` | The demo data (about 153 answered, 7 open, every category unlocked) | Priya, Bex, Keisha, Seun, Mei, Gloria |
  | `stress` | 36 open (12 overdue, 6 due today); 200-character titles, Arabic, Japanese, Ge'ez and Hindi titles, an unbroken word, a pasted link, emoji only; 8 added categories with emoji at the 24-character limit, Finance hidden; 500-character notes; 0% and 100% | Dana, Rosa, Amira, Farah, Viktor, Inès, Lin, Tunde |
  | `years` | A 1,000-day streak, one a day answered the next evening: four-digit counts | Piotr, Keisha, Tomás, Tunde |
- **A fresh install:** navigate to `http://localhost:8097/favicon.ico` (same origin, the app not
  running), then `browser_evaluate`:
  `async () => { const r = await navigator.storage.getDirectory(); await r.removeEntry('expo-sqlite', { recursive: true }).catch(() => {}); localStorage.clear(); return 'cleared'; }`.
  Removing it while the app is open fails ("modifications are not allowed"). A fresh Playwright
  context also starts empty.
- **Stand-ins:** dark mode through `browser_emulate_media` (`colorScheme: 'dark'`); large text
  through CSS `zoom` 2 and 1.5 (harsher than Dynamic Type: it also halves the layout width);
  Reduce Motion through `reducedMotion: 'reduce'`; VoiceOver through the accessibility snapshot.
  Through `browser_run_code_unsafe` (the main session sets these before a run; a blind agent
  can't): Increase Contrast `page.emulateMedia({ contrast: 'more' })`, and `forcedColors:
  'active'` as the nearest thing to Smart Invert; colour vision
  `(await page.context().newCDPSession(page)).send('Emulation.setEmulatedVisionDeficiency', { type: 'deuteranopia' })`
  (or `protanopia`, `tritanopia`, `achromatopsia`); an old slow phone, the same session's
  `Emulation.setCPUThrottlingRate` `{ rate: 4 }`; another time zone, `Emulation.setTimezoneOverride`
  `{ timezoneId: 'Asia/Tokyo' }` before the page loads; a clock near midnight,
  `page.clock.install({ time: new Date('<date>T23:55:00') })` before the page loads; offline,
  `page.context().setOffline(true)`. Voice Control's stand-in is the accessibility snapshot: every
  control's name must contain its visible words, so "tap Save" works.
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
| Dana, 31 | QA engineer, breaks inputs for a living, 320 wide | Limits that are stated and hold | Silent truncation, dates in the year 9999 |
| Grace, 58 | Runs a small bakery, phone mostly for WhatsApp, low tech confidence, reads every word slowly | To know it saved and what to do next, without fear of breaking something | Icons without words, anything that vanishes, "did it save?" |
| Mateus, 29 | Brazilian in Lisbon, English is his third language, 24-hour clock, day-month dates | Plain words and familiar formats | Idioms, US-only formats, sentences he has to read twice |
| Jun, 19 | Student, ADHD, logs ten things in a burst, forgets to answer, back after three weeks away | A way back in that doesn't scold, a pile he can clear fast | A wall of overdue items, a lost streak said as a loss |
| Leah, 36 | Teacher with essential tremor, mis-taps, avoids precise drags | Big targets, undo, no slider-only input | A wrong tap that can't be taken back, controls 2 pt apart |
| Sam, 27 | Night-shift paramedic, red-green colour blind, dark mode in a dark room | Charts and states readable without colour | Meaning carried by red and green alone, glare |
| Noor, 44 | Anxious perfectionist, accountant, hates being "wrong" | Feedback that reads as information, not a grade | A verdict that sounds like a judgement of her |
| Tomás, 41 | Forecasting hobbyist (Brier, Metaculus), sceptical of apps that do maths | Claims that are statistically right and say their limits | A wrong or overstated claim, a number without its method |
| Amira, 38 | Nurse on rotating shifts, Arabic first, titles in Arabic, one hand, two-minute breaks | Things she can do one-handed in short bursts, RTL text that reads right | Reminders at the wrong hour, RTL text garbled, long flows |
| Hiroshi, 71 | Retired civil engineer in Osaka, Japanese first, careful English, an old small iPhone (320 wide) with Reduce Motion, titles in Japanese | Calm screens, exact words, his script shown whole | Motion that makes him dizzy, Japanese clipped mid-character, idioms |
| Destiny, 22 | Retail worker, her phone is her only computer, prepaid data, uneasy with percentages | "How sure" in words she uses, numbers she can picture ("7 in 10") | A score she can't place, maths homework, anything that eats her data |
| Seun, 33 | Accountant in Lagos who bets on football every weekend, fluent Nigerian English, wants to test his "sure things" | To know whether his locks really are | (He's the test: does the app ever read as a betting aid or reward a punt) |
| Ben, 40 | Electrician with dyslexia, dictates titles by voice, skims and guesses from the first word | Short lines, forgiveness for dictation slips | Long paragraphs, look-alike words, a slip that blocks Save |
| Ravi, 35 | Autistic software tester, literal reader, notices every change of word for the same thing | One word per idea, rules stated before they apply | "Answered", "resolved" and "scored" for one thing, a rule met only by breaking it |
| Hannah, 30 | Long COVID, predicts her good and bad days, brain fog, about ten minutes of energy a day | Few steps, nothing to hold in her head between screens, health titles kept private | A long flow, a streak that punishes a bad week, health words on the lock screen |
| Lucía, 16 | Secondary-school student in Mexico City, Spanish first, predicts her exam marks, her brother's old phone | Words a teenager reads easily, nothing pushing her to pay | A paywall in her way, being talked down to |
| Bea, 44 | Single parent of three, logs the kids' week in 30-second bursts, interrupted constantly | To pick up exactly where she left off | Lost typing, a flow that must be finished in one go |
| Marcus, 38 | Eight months sober, predicts "I'll make my meeting"; a miss hurts | Misses said as information, a streak that doesn't shame | "You failed", a red mark on a hard day, cheer after a miss |
| Rahel, 28 | Eritrean in Germany, Tigrinya first, German second, English third; shares a phone with her sister | Titles nobody else reads by accident, plain words | Her predictions on the lock screen or open to whoever picks the phone up |
| Conceição, 64 | Retired biostatistician in Porto, Portuguese first, dyslexic, ADHD, follows football and cycling, back after two months away | Statistics that are right and say their limits, a way back in that names what changed | A silent drop in her number, long paragraphs, losing her place after an interruption |
| Keisha, 37 | Operations manager in Atlanta, nine goals in Strides (Plus), plans her year on Sundays | Her yearly targets somewhere useful, and something back this week | Nothing for months, a goal whose progress she can't show |
| Piotr, 66 | Retired tram driver in Kraków, Polish first, careful English, six years of Way of Life ticks, right arm in a sling, an old small iPhone | To tick today's walk tonight, targets big enough for one thumb | "Not scored" for a reason he can't follow, retyping the same habit every day |
| Kiri, 22 | Café worker and part-time student in Wellington, they/them, a 500-day Finch streak, low-energy weeks, te reo Māori words in titles | Warmth after a miss, a few steps on a bad night | A miss said coldly, a streak that guilts them, a long flow |
| Jonas, 27 | Bike courier in Vienna, German first, lives in Fitness rings, Reminders and Strava, no signal in tunnels | Worth it in one red light, working with no bars | A manual app that gives nothing back, an error when offline |
| Valentina, 28 | Call-centre agent in Bogotá, Spanish first, dyslexic, dictates titles, needs IELTS band 7 for a visa, prepaid data | Short lines, dictation slips forgiven, something to show her study group | "7 in 10" mixed up with band 7, long paragraphs, a miss said as failure |
| Carol, 57 | Payroll clerk in Birmingham, Alabama, weekly weigh-ins on a weight-loss programme, low tech confidence, back after five weeks away after a bad weigh-in | To come back without shame, her weight kept private at work | A word about her weight or diet, her weigh-in on the lock screen, a pile that scolds |
| Farah, 44 | Real-estate agent in Montréal, Arabic and French first, client names in Arabic, an AI coach plans her week, Reduce Motion | To be told what to do differently, and to update a deal as it moves | A number she can't update, Arabic names garbled, a coach behind a wall |
| Bex, 48 | Engineering manager in Leeds, seven years of Beeminder with money on the line, tritanopia | To know whether being sure has worked for her, an honest place for a miss with a good excuse | A chart she can't read in her colours, a hedge that hides a miss |
| Olu, 39 | Dispatcher in Houston, an iPhone Pro Max (440 × 956) in one hand on a crowded bus, thumbs only, taps fast | Everything he needs within his thumb's reach, a way out of any sheet without stretching to the top corner | A close button only at the very top, a sheet that can't be swiped away, two targets side by side |
| Inès, 33 | ER triage nurse in Marseille, French first, impatient: double-taps, swipes sheets away mid-save, leaves the app mid-flow | A save that happens once and says so, a half-typed prediction still there when she's back | A double entry, a lost draft, a sheet that closes without asking when she typed something |
| Lin, 52 | Bookkeeper in Vancouver, rheumatoid arthritis, phone upright on a stand on her desk (the app is portrait only), taps with a stylus | Every control reachable with a tap, no drag she must hold | A control only a drag or swipe can set, tiny targets, a sheet that closes only by swiping |
| Viktor, 45 | Project manager in Rotterdam, Dutch first, 30-odd open predictions across eight categories of his own, triages on Monday mornings | To sort and clear a crowded list fast, his categories told apart at a glance | A list he can't scan, long names cut so two look the same, one-at-a-time flows for thirty items |
| Mei, 50 | Architect in Singapore, spinal cord injury, uses Voice Control ("tap Save", "scroll down") and Switch Control | Every control named by the words on it, nothing that needs a gesture alone | A button whose spoken name differs from its label, swipe-only actions, an unnamed icon |
| Gloria, 69 | Retired seamstress in San Antonio, Spanish first, cataracts, Bold Text, Increase Contrast and Smart Invert at night | Text and lines that stay visible at high contrast and inverted | Grey-on-grey text, meaning carried by a faint tint, a chart that vanishes inverted |
| Tunde, 24 | Delivery rider in Lagos, an old iPhone SE (320 wide) with a worn battery, Low Power Mode, almost no storage, prepaid data | It opens fast and keeps up on an old phone, nothing heavy to download | A long freeze on launch, lag while typing, a list that stutters |
| Sofia, 36 | Flight attendant based in Madrid, crosses time zones every week, logs before flights | Due days and reminders that make sense wherever she lands | A prediction due "yesterday" after a flight, a reminder at 4 am, "not scored" she can't explain |
| Yusuf, 30 | Night-shift baker in Birmingham, UK, logs at 23:50 and answers just after midnight | To know which day a prediction belongs to, and why an answer counts or doesn't | A same-day rule that flips at midnight without saying so, a streak day lost to the clock |
| Aisling, 20 | Care assistant in Dublin, dyslexic, a tremor while her broken wrist heals, walks daily for rehab, shares the phone with her younger sister, a step challenge where friends each put in €5 | To keep her daily walk going without reading much, nothing her sister can stumble on | Long paragraphs, a mis-tap she can't undo, "failed" in front of her sister |

**Added for appeal rounds (2026-11-12; Nadia to Katrin 2026-11-13, round 20; Leila to Efua, round 21; Shigeru to Wanjiru, round 22; Vusi to Prakash 2026-11-14, round 23).** Twelve people chosen to differ in tech literacy (L1–L5,
below), age, life stage, region, money, taste and how they found the app, so an appeal round
(`docs/playtest-appeal.md`) can say where they part ways. Each names their level and arrival.

| Persona | Who | What would win them | What would lose them |
| --- | --- | --- | --- |
| Bernard, 68 | Retired bus mechanic in Glasgow, **L1**: calls, texts and the camera; his son put the app on and showed him once. Scottish English, thinks in "nine times out of ten", does the football pools and likes a horse-racing tip | Something he gets without help, plain words, a wee bit of fun | Being made to feel daft, small print, anything he has to set up |
| Linda, 74 | Retired primary-school teacher in Dayton, Ohio, **L2**: FaceTime, Facebook and Wordle with her granddaughter, who installed this for her. Loves quizzes and puzzles, reads every word | A daily quiz she looks forward to, warmth, something to talk about with her granddaughter | Jargon, tiny text, nothing new to do most days |
| Dale, 61 | Corn and soybean farmer in Iowa, **L2**: weather, markets and Facebook; heard about forecasting on an ag podcast. Sceptical of apps, trusts his own read of the sky and the markets | Respect for his judgement, plain talk, a reason it beats the notebook in the truck | Cutesy badges, a self-help "trust your gut" tone, a city-office idea of what's worth predicting |
| Ramón, 52 | Owns a taquería in Phoenix, Spanish first, **L3**: WhatsApp, Instagram for the shop, Square; his daughter recommended it. Guesses busy nights, deliveries, staff showing up | Something that helps the business, quick between rushes | Abstract talk, nothing about work like his, English that takes two reads |
| Amara, 34 | Runs a tailoring side business and two kids' school runs in Nairobi, Kenyan English and Swahili, **L3**: M-Pesa, WhatsApp, an older iPhone on capped data. A friend's card arrived in her women's business WhatsApp group | Something that respects her time and data, warmth, examples that fit her life | Data-hungry screens, US-only examples, being lectured |
| Sophie, 41 | HR manager in Lyon, French first, **L3**: Headspace, Calm, Apple Health; found it browsing the App Store's Productivity charts. Likes calm, pretty, gentle apps | Gentle feedback, a calm look, insight that feels kind | Clinical statistics, guilt, a cold or busy screen |
| Ruth, 46 | CBT therapist in Melbourne, **L3**; a colleague suggested it for anxious clients who catastrophise. Judges every line as a client would hear it | Language that normalises uncertainty, no grades, nothing that shames a miss | A score that reads as a verdict, streak guilt, anything a fragile client could take as proof they're failing |
| Zara, 17 | Sixth-former in Leeds, **L4**, lives on Instagram and TikTok; a friend's card in her story ("what's yours? 😏"). No money of her own, her parents' Apple ID | A result about her she'd post, a card that looks good in a story, fast | Homework vibes, a bank-app look, being asked to pay or sign up |
| Bia, 23 | Marketing intern in São Paulo, Portuguese first, **L4**, Co-Star and 16Personalities fan; found it in a TikTok about being overconfident | A "type" that feels like her, something to compare with friends, mystique | Dry numbers with no story, nothing to share, waiting weeks for anything |
| Dev, 28 | IT support in Bengaluru, Indian English, **L4**, fantasy cricket and a dozen WhatsApp groups; price-sensitive (₹); a YouTube short asked "are you overconfident?" | Bragging rights, beating his friends, something he can show the group | No way to compare, prices that feel like dollars, slow payoff |
| Victoria, 44 | Partner at a consulting firm in London, **L4**, pays for premium apps (Superhuman, Oura), ten minutes between meetings; read about forecasting in The Economist | Sharp, credible, worth the money, an executive summary of her judgement | Cutesy, slow, unclear value, anything that looks free-to-play |
| Ji-woo, 31 | Product designer in Seoul, Korean first, **L5**: judges craft against Toss and Things, notices spacing, motion and conventions; found it on a design newsletter's "apps we liked" | Restraint, polish, an idea new to them, details that respect iOS | Web-like feel, inconsistent spacing, English-only copy that reads as an afterthought |
| Héctor, 58 | Retired early after thirty years as a network engineer at Uruguay's telecom, Montevideo, Spanish first, **L5**; walks daily and checks his blood pressure since a heart scare; quit stickK when it felt like punishment; heard a podcast on calibration (Tetlock). Plain taste, sceptical, on the bus with one hand | Maths he can check, a method stated, a record that isn't punishment | A number with no method, a claim the maths doesn't back, money or guilt on the line |
| Teresa, 70 | Retired school-canteen cook in Quezon City, Tagalog first and Taglish, **L1**: Messenger video calls with her daughter, a nurse in Dubai, who installed it on a visit home. Watches PAGASA for typhoons, follows the price of rice, plays the PCSO lotto on Sundays | Big plain words, something warm to do each day, a reason to tell her daughter on the call | English that takes two reads, anything that looks like a bill, being made to feel slow |
| Haruto, 19 | First-year chemistry student at Osaka University, Japanese first, reads English slowly but well, **L4**, LINE and X; got it from a friend's card in exam season, used it in bursts, then stopped. Posting your own score feels like boasting | A quiet, exact record of how his exam guesses do, nothing showy | Boasting cards, cheerleading, English idioms |
| Ingrid, 38 | Data engineer in Oslo, Norwegian first, fluent English, **L5**; runs with a club, takes the 08:12 tram, ships releases; read about it on Hacker News. Janteloven: nobody shows off | Statistics done right and said plainly, a tool, not a game | A score that flatters, gamified nagging, anything that wants to be shared |
| Earl, 67 | Retired bus dispatcher in Tucson, back at community college for a night class in bookkeeping, **L3**; a classmate's card got him started nearly three years ago and he hasn't missed a day: the walk, the 7:40 tram, the crossword, his daughter's Sunday call, the weekly shopping budget. A 900-day Duolingo Spanish streak | A streak worth keeping, a little fun, plain words | Losing the streak to a technicality, a screen that gets slower or busier as the years pile up |
| Nusrat, 16 | Year 11 in Dhaka, Bangla first, English-medium school, **L4**; sells hand-painted phone cases on Instagram, paid through her mother's bKash; Duolingo every night; shares a room with her sister, careful about what her parents see; found it on a Reels short at 1 am | Something fun about her, quick, a guess game for her orders | Anything that asks for an account or money, her business on show, homework vibes |
| Wen, 49 | Quantitative risk manager at a bank in Hong Kong, Cantonese first, fluent English, **L5**; builds value-at-risk models, reads app statistics the way she reads a model validation; commutes on the MTR with one hand on the rail and one thumb on the phone; found it in a newsletter about forecasting | Maths she can check: what the score is, what the give-or-take means, whether the luck range is right | A number that claims more than its sample, any statistic she can't reproduce, reaching for the top of the screen one-handed |
| Sanjana, 15 | Year 10 in Kathmandu, Nepali first, English-medium school but reads plainly, **L3**; uses Voice Control after a sports injury to both hands; an older cousin installed the app and she logged her school tests for six weeks, then stopped for exams; privacy-minded ("who can see this?"); flies between Kathmandu and her cousin's in New York; uses a goal planner; thinks in "7 in 10" | Every control reachable by its visible name; due days that don't jump when she lands in another time zone; nothing about her stored or shown that she didn't choose; words a 15-year-old reads first time | A control she can't name, a date that moves by a day when she travels, anything that feels like it's watching her or would embarrass her if her family saw it |
| Min-jun, 16 | High-school student in Seoul, Korean first, dyslexic (long English sentences cost him), **L5**: codes small games, uses a stylus in his left hand while a broken finger on his right heals; his mother, a physiotherapist, installed the app so he'd predict and track his daily hand exercises; privacy-minded (classmates see his screen on the bus); thinks in "7 in 10" | Targets big enough for a stylus held left-handed; short words; nothing a classmate glancing over would laugh at; a reason to use it that's his, not his mum's | Small or close targets, walls of text, anything that looks like homework from his mum, anything embarrassing on screen |
| Nadia, 67 | Retired draughtswoman from Kharkiv, in Manchester since 2022; Ukrainian first, Russian second, English third (an ESOL class at the college), **L2**: Viber, WhatsApp, Facebook, a pill-reminder app; found it in a Facebook short about overconfidence; tidy taste; can't sleep, so the phone at midnight in the dark, Bold Text and Increase Contrast; careful with what apps know | Plain exact words, a calm dark screen, her blood pressure and sleep kept to herself | English she must read twice, anything that seems to collect or show her health, clutter |
| Youssef, 16 | Lycée pupil in Casablanca, Darija and Arabic first, French second, English third, **L4**; maths olympiad, Raja ultra, score predictions with friends for no money; an older brother's iPhone SE; used it in bursts around exams, then stopped; found it through a French science podcast | Proof he reads football better than his friends, a number he can argue with | Being treated as a child, a betting look, a lost streak said as a loss |
| Callum, 23 | Junior gameplay programmer in Cardiff, **L5** (judges game feel and juice), ADHD, skims, uneasy with maths; cares for his mum with MS evenings and weekends, so interrupted; Finch and Duolingo; found it in a TikTok about overconfidence; anxious about deadlines and her bad days | Small wins that feel good, quick logging between interruptions, kindness when he's wrong | Walls of text, homework maths, a cold verdict on an anxious night |
| Somchai, 47 | Runs a small coffee roastery in Chiang Mai, Thai first, reads plain English, **L3**; after a health check his doctor told him to run and cut beer, for his daughter; checks the air-quality app before every run; found it searching the App Store; sceptical, modest (kreng jai) | To know whether his "7 in 10" about himself is honest, quietly | Being praised or scolded, English that takes two reads, a price in dollars |
| Rim, 24 | Pharmacy assistant in Tunis, Tunisian Arabic first, French second, English third, **L2**; mild cerebral palsy in her right hand, so her left thumb and no drags; lives with her parents and brothers, who pick up her phone; prepaid; found it searching the App Store after arguing with her brother about who guesses family things better | Big targets, simple words, nothing her brothers can read over her shoulder | Small targets, a drag-only control, English idioms, her family's business on screen |
| Mateo, 31 | Sales at a fintech in Santiago, Spanish first, fluent English, **L4**; a friend's card landed in his five-a-side WhatsApp group; social, curious, predicts his social life (the asado, a date's reply, who turns up on Thursday) | Something to compare with his friends, fun about himself, fast | Waiting weeks for anything, nothing to answer his friend with, a lecture |
| Lakshmi, 58 | Sells jasmine garlands at a stall in Mylapore, Chennai, Tamil first, Tamil-medium school to 10th, reads simple English slowly, **L1**: WhatsApp video calls with her son in Bengaluru, devotional songs on YouTube; her son installed it and made the text bigger ("Amma, you always know when the rain will come"); prepaid; thinks in "7 in 10" | Big simple words, something to tell her son on the call, rain and flower prices taken seriously | English that takes two reads, numbers she can't place, anything that looks like a bill |
| Leila, 23 | Vet nurse at a small-animal clinic in Amman, Arabic first, fluent English from university, **L2** (WhatsApp, Instagram, a habit tracker; avoids settings), keratoconus so the text is bigger, interrupted by the clinic phone; found it on an Arabic science podcast; uneasy with percentages; curious and warm | Her own guesses about her patients and her day, in words she reads first time | Small text, maths, nothing for pets or the clinic |
| Imran, 52 | Owns a travel agency in Karachi, Urdu and Sindhi first, English third, **L3**; a former insurance clerk who thinks in odds, checks a flight-delay forecaster daily, pays for premium apps; his staff borrow his phone; found it searching the App Store | Proof his calls on visas and flights are good, worth paying for, clients' names kept private | Staff reading his predictions, padding, vague value in Plus |
| Lotte, 19 | First-year veterinary student in Utrecht, Dutch first, fluent English, **L3**, ADHD, anxious, a rescue cat called Pim; used it in bursts around exams, then stopped for three weeks; found it searching the App Store | A way back that doesn't scold, her cat and her exams somewhere sensible | A pile of guilt, a lost streak said loudly, unclear whether something saved |
| Omar, 15 | Lives in Alexandria, looks after his two little sisters after school, Arabic first, dyslexic, strong at maths, **L3**, uses his mother's phone, Reduce Motion for motion sickness, impatient; found it on a short video | Something quick and his own, the family's trips and his dad's flights from Dubai somewhere to go | Long sentences, his mother seeing his guesses, waiting |
| Ellie, 14 | Blind since birth, in Year 10 in Belfast, VoiceOver every day, Notes for her worries, **L2**; her school counsellor suggested the app for catastrophising; prepaid; uses it late at night when worries come | Every control named, a calm way to check her worries against what happens | Unnamed buttons, a verdict about her, maths she can't hear in order |
| Thanh, 34 | Biostatistics PhD student in Houston, Vietnamese first, fluent English, **L4**, recovering from burnout after his qualifying exams (running, sleep, no alcohol); his sister installed it; uses Apple Health and Reminders | Maths that holds up, his recovery tracked honestly, something to show his sister | A wrong statistic, a number that claims too much, a sting on a good day |
| Mrs Lau, 73 | Retired primary-school English teacher in Hong Kong, Cantonese first, reads English well and slowly, **L1** (WhatsApp voice notes, a mahjong app her grandson set up); watches the Observatory's typhoon signals; modest; her grandson installed this | A daily puzzle, plain words, something to tell her grandson | Tiny text, anything like a bill, boasting, being hurried |
| Efua, 29 | Product designer at a fintech in Accra, Ghanaian English, **L5**, judges craft and conventions; a friend's card arrived in her design team's chat; competitive and sceptical | Craft, a reason to beat her friend, numbers that hold up | Web-like feel, sloppy copy, a card she can't decode |
| Shigeru, 68 | Retired actuary who runs a second-hand camera shop in Osaka, Japanese first, fluent English, **L3**; walks every evening since a heart scare; heard of the app on a business podcast; practical, playful taste (Pokémon GO with his grandson), modest about results; his daughter-in-law borrows his phone | A record of his walks that's honest about chance, numbers he can check | Bragging, his walks on show, statistics that overclaim |
| Tharani, 31 | Data-science MSc student in Colombo after burning out as a designer, Tamil first, Sinhala, English third, **L5**; anxious, brain fog late at night; came back after three weeks away | Starting again without shame, craft, honest small-sample talk | A guilt pile, cluttered screens, a verdict on a bad month |
| Dawit, 21 | Actuarial-science student in Dublin, born in Eritrea, Tigrinya first, Arabic, English third, **L3**; low vision (zoom); his sister installed it; social, warm; types some titles in Ge'ez | A badge that means something, his own language in titles, something to tell his sister | Unexplained words, tiny text, a badge that feels like luck |
| Nafisa, 16 | Class 10 student in Dhaka, Bangla first, dyslexic, thinks in "7 in 10", **L4**; prepaid; privacy-minded on the family phone her brother uses; playful taste | Hiding her guesses at home, fixing a slip fast, short words | Long paragraphs, anything her brother can read, a surprise bill |
| Rêbaz, 24 | Junior civil engineer in Erbil, Kurdish first, Arabic, English third, **L4**; no money of his own to spare; a friend's card in a group chat at midnight; practical, playful taste | Decoding his friend's card, something real by tomorrow, beating his friend | A card he can't read, nothing to do after the first save |
| Jaylen, 17 | High-school senior in Sacramento, blind since birth, VoiceOver expert, **L3**; his debate coach suggested it five months ago; his family pays for premium apps; premium taste, playful | Knowing how good he really is, everything reachable by VoiceOver, a recap worth sharing | Unlabelled controls, folded text he can't find, condescension |
| Yolanda, 54 | Sells fruit at a market stall in Lima, Spanish first, reads plain English slowly, **L1**; her nephew installed it; prepaid and tight; curious, warm taste; customers interrupt constantly | Something simple she can do between customers, her place kept | English she can't follow, a lost result, anything that costs money |
| Wanjiru, 47 | Runs two matatus in Nairobi, Kikuyu first, Swahili, English, **L2**; bets on football every weekend; found it searching for a prediction app; old phone, slow data; competitive, sceptical, plain taste | Seeing whether her football calls are as good as she thinks | Being told how to bet, slow screens, a free trial that bills |
| Katrin, 51 | Head of procurement at a shipping company in Hamburg, German first, fluent English, **L4**; pays for Oura, Strava and Things; her executive coach suggested it five months ago; direct, practical, premium taste, ten minutes between meetings | A sharp summary of where her judgement fails, worth the money, no fluff | Cutesy badges, vague value in Plus, anything slow or padded |
| Vusi, 69 | Retired train driver in Durban, isiZulu first, reads plain English slowly, **L1**: WhatsApp, calls and the radio; his old workmate Sipho posted his warm-up card in the church men's WhatsApp group, and his grandson installed the app and made the text bigger; grows vegetables and reads the sky; prepaid and tight; curious, plain taste | Something he gets on his own, his garden and the rain taken seriously, a reply for Sipho | English he must read twice, anything that looks like a bill, being made to feel slow |
| Sander, 33 | iOS developer in Ghent, Dutch first, fluent English, **L5**: reads an app like a code review (craft, conventions, copy); races cyclocross on Sundays; a colleague's card in the team Slack; pays for premium tools; sceptical and competitive; deuteranopia; impatient (double taps) | Craft that respects iOS, numbers that hold up, a way to beat his colleague | A web-like feel, meaning carried by colour, sloppy copy, a fix that takes many taps |
| Ayu, 44 | Primary-school headteacher in Yogyakarta, Javanese and Indonesian first, fluent English, **L3**; her district's leadership trainer suggested it five months ago for decision-making; modest (andhap asor: showing off is rude); careful money; practical, warm taste | Seeing where her judgement holds, a summary she can show her trainer without boasting | A card that boasts, health or money on show, a cold verdict |
| Noa, 29 | Product manager at a Tel Aviv start-up, Hebrew first, fluent English, **L4**; posts her wins on LinkedIn and Instagram; found it through a forecaster's LinkedIn post; Friday dinners with friends, runs; comfortable; social, competitive, playful taste; types titles in Hebrew | A card worth posting, proof she beats the people in the post, Hebrew that reads right | Nothing to compare with friends, a card that undersells her, garbled Hebrew |
| Isabela, 35 | On maternity leave from a bank job in Porto Alegre, Portuguese first, plain English, **L3**; logged her days for six weeks, then her baby came three weeks ago; night feeds, one hand, a dark room; anxious, warm taste; found it searching the App Store | Coming back without guilt, quick one-handed answers, her place kept when the baby wakes | A pile that scolds, a lost place, small targets at the top of the screen |
| Zainab, 24 | Accessibility engineer on parental leave from a Leeds agency, from Bradford, Urdu first, fluent English, **L5**, blind since childhood, VoiceOver and a keyboard; at her parents' in Lahore with her baby; found it through an accessibility creator's short video; premium taste, curious; titles in Urdu; Notes for everything | Every control named, headings to jump by, her place kept, Urdu read right | Unlabelled controls, silent changes, a lost run, a card she can't hear |
| Kalani, 15 | Sophomore in Hilo, Hawaiʻi, native English with ʻōlelo Hawaiʻi words, **L4**, impatient; an old iPhone SE handed down to her, which her cousin borrows; volleyball and bio quizzes; no money of her own; found it from a short video; playful, privacy-minded | Fun, quick, about her, hiding things from her cousin | Homework vibes, a slow phone made slower, anything her cousin can read, a paywall |
| Prakash, 66 | Retired postmaster in Pune, Marathi first, fluent Indian English, **L2**: WhatsApp, YouTube, cricket scores; his daughter installed it last Sunday and set up his walking group; checks his fasting sugar; his wife reads his phone and worries; cataracts (more contrast); careful money; practical, privacy-minded | His sugar and his walking group taken seriously, his numbers private, plain words | His sugar on show to his wife, settings he can't find, a surprise charge |

**Diversity axes.** A round covers people, not only screens. Each run's persona has a value on
every axis; a round's cast spreads across them:

| Axis | Values |
| --- | --- |
| Age | 13–17 (the 4+ rating lets teenagers in), 18–25, 26–40, 41–60, 61+ |
| Language | native English, fluent second language, careful third language, plain-language reader, dyslexic reader |
| Locale conventions | US (12-hour, M/D), 24-hour and D/M, right-to-left text in titles, other scripts in titles (Japanese, Ge'ez), Spanish or Portuguese first |
| Numeracy | at ease with percentages, thinks in "7 in 10", a statistics expert |
| Access need | none, low vision (zoom), Bold Text and Increase Contrast, motor (tremor, one hand, stylus), Voice Control and Switch Control, colour vision, screen reader and keyboard, attention (ADHD), Reduce Motion, dyslexia and dictation, fatigue and brain fog |
| What they predict | work, health, money, sport (and betting), family, exams, recovery and habits |
| Stakes | curiosity, self-improvement, a miss that hurts |
| Device and network | a new phone, a Pro Max in one hand, an old small slow phone, a phone on a stand, slow or capped data, offline mid-flow, a shared phone |
| Tech literacy | **L1** calls, texts and the camera, needs someone to install apps; **L2** a few familiar apps (WhatsApp, Facebook, YouTube), follows what's on screen, avoids settings; **L3** everyday: installs and tries apps, changes settings now and then; **L4** power user: many apps, widgets, notices polish; **L5** builds or designs software, judges craft and conventions. (Older rounds' "low" is L1–L2, "everyday" L3, "expert" L4–L5.) |
| Life stage | in school, student, early career, parent of young children, mid-career, caregiver, self-employed, retired |
| Region and culture | US, UK and Ireland, Western Europe, East Asia, South Asia, Sub-Saharan Africa, Latin America, the Middle East; bragging welcome or frowned on; feedback direct or indirect |
| Money | none of their own, prepaid and tight, careful, comfortable, pays for premium |
| How they found it | App Store search, a friend's card, a short video, a family member installed it, a professional suggested it, an article or podcast |
| Taste | plain is fine, warm and friendly, playful, minimal and crafted, premium |
| Mindset | curious, practical, playful, competitive, sceptical, anxious, social, privacy-minded |
| Where they are in the app | first five minutes, first week, daily habit, back after a gap, long-time (months or years) |
| Context | sitting with time, two-minute break, interrupted mid-task, impatient (double taps, swipes away), dark room, on the move, around midnight, crossing time zones |
| Screen | 320 × 568, 375 × 812, 390 × 844, 402 × 874, 440 × 956 (portrait only); light or dark |
| What they use now | a habit tracker, a goal planner, a gamified app, a commitment device with money, a forecasting tool, an AI coach, a diet or fitness app, Apple's built-ins, paper, Notes or a spreadsheet, nothing (what each teaches its users: `research/competitors-2026-11.md`) |

**Choosing a round's cast.** Six to eight runs. The focus picks one or two personas who must be
there (Elena for data leaving the phone, Kofi for accessibility, Dana for inputs and layout, Kai for
the record). Fill the rest so that:
- at least one fresh install and one long-time or returning user;
- at least one non-native, plain-language or dyslexic reader, one access need other than large text,
  and one who thinks in "7 in 10" rather than percentages;
- at least one under 26 and one over 60;
- no two runs predicting about the same part of life, and at least one whose stakes hurt (a miss
  that matters to them);
- one run with a device or network stand-in (an old small phone, slow data or offline mid-flow);
- each run starts from a §9 playtest profile where one fits, named in the cast table;
- one **edge of the audience** (a teenager, a bettor, a shared phone): someone the app wasn't
  designed around but will meet, to check it treats them responsibly;
- no two runs share both screen size and appearance, and at least one run is at 320 wide;
- no persona from either of the last two rounds' tables comes back unless the focus needs them;
- one **wildcard**: draw each axis at random (as in `research/playtest-2026-11-05.md`), fix only
  what doesn't hang together, and record the draw and the fixes in the round's Method;
- prefer personas never cast before. When the axes leave a gap nobody in the table covers, write a
  new persona row here first, in the same commit as the round.

**Choosing an appeal round's cast** (`/playtest appeal`, `docs/playtest-appeal.md`). The same
six to eight runs, cast for where appeal parts ways rather than for edges:
- tech literacy across at least four of the five levels, with at least two runs at L1–L2 and one
  at L5;
- at least four age bands, with one under 20 and one over 65;
- at least three runs from outside the US, UK and Ireland, in at least two regions, and one from a
  culture where bragging is frowned on (it changes the card);
- at least three ways of finding it, including a friend's card (the growth loop) and a family
  member installing it;
- money: one with little or none, one who pays for premium apps;
- taste: one design-literate judge (L5, or minimal and crafted) and one who likes playful apps;
- stage: at least half in the first five minutes or first week (appeal is decided early), one
  long-time user (does it stay appealing), one back after a gap;
- motivation: at least three of curious, practical, social, competitive, sceptical;
- each on the phone they'd own (402 × 874 an iPhone 17, 375 × 812 an older one, 440 × 956 a Pro
  Max, 320 × 568 an SE), in the appearance they'd use; stress stand-ins only where the person
  needs them;
- the wildcard and "prefer personas never cast" as for any round.

The round's file lists each run's axis values, so gaps show across rounds.

**Usability method.** Tasks are goals in the persona's words ("make sure you'll hear about it
tomorrow"), never button names. The tester says what it expects before a meaningful tap and whether
that happened, rates each task's ease (1–7, the Single Ease Question), answers three comprehension
questions in its own words at the end, and gives each issue a severity (0 cosmetic to 4 blocks the
task). The main session can add interruptions (a reload mid-flow, back navigation, an app-switch
pause) and a stand-in the agent can't set itself: colour vision through a CDP vision deficiency or a
colour matrix, offline through CDP network conditions.

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
| First impression | Every run can say what the app is for after five seconds on the first screen; no L1–L2 run leaves before the Warm-up's result (appeal rounds) | `docs/playtest-appeal.md` |
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
| Cold start | Not measured yet; the first TestFlight build is on the phone, and the owner's measurement on it sets the baseline (device only) |
| Network | Complete offline; sync, billing, Coach and analytics degrade silently |

## §14 Live ops

none until launch. Then: D0 aha rate (`warmup_completed / warmup_started`) and share rate (shares
per active user), the two validation questions with their SQL in `docs/HUMAN_VERIFICATION.md`
"Open work that is code"; D1 / D7 / D30 retention and crashes (App Store Connect); installs per
share surface (the `ct=share-card-text` campaign token, once `APP_STORE_PROVIDER_TOKEN` is set);
trial conversion (RevenueCat); range
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
  notification permission dialog, real purchases in sandbox, the Sandbox Apple Account's Age
  Assurance setting for the under-13 check (`docs/HUMAN_VERIFICATION.md` D4).
- Decisions: price changes, EU trader status, the domain, the submission date, anything in
  UI_ROADMAP §2 not yet decided, anything that spends money or deletes someone's data.
  Counsel on the under-13 rule (D70; the points in `docs/design/research/under-13-2026-11.md`).

## §17 Store presence

`docs/APP_STORE_LISTING.md` is the draft and wins. Name `Fairly Sure: Calibration Log`; subtitle
"Know when to trust your gut" [30]; keywords [100 bytes] in §1 there; Productivity, then
Lifestyle; age rating 4+ with "Yes" for age assurance; screenshots: at least one 6.9-inch set
(1320 × 2868), seven planned (§5 there), finals from a device build; privacy policy
`https://tapjason.github.io/calibrate-app/privacy/` and support `/support/` (live on GitHub
Pages); App Privacy answers in `docs/APP_PRIVACY.md`; review notes in §4 there; export
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
- **TestFlight builds:** `npx eas build --profile production --platform ios`, then
  `npx eas submit --profile production --platform ios` (both the owner's), installed from the
  TestFlight app. They carry the bundle as built and use no dev server, so any change, JS
  included, reaches the phone only in the next build. Build 2 (1.0.0, steps through 186) has been
  on the phone since 2026-11-16.
- **Native only, never verified on web:** haptics; SF Symbols (web falls back to Ionicons);
  `ui-rounded` numerals; Liquid Glass; native sheets (`formSheet`, page sheets) and their gestures;
  the iOS switch (63 × 28 pt on iOS 26, drawn exactly in its measured frame); the date and time
  pickers; local notifications, their permission dialog and the Happened / Didn't actions; Sign in
  with Apple; the Declared Age Range sheet and the under-13 band it can return (D70; the
  dev seed's `dev-seed-under13` shows the screens on web, not Apple's answer); the OS share
  sheet and PNG export (view-shot); the
  rating prompt; RevenueCat purchases and restore; real Dynamic Type; VoiceOver; cold start;
  keyboard avoidance; the app lock (Face ID and the passcode, the lock screen's overlay over sheets,
  the cover in the app switcher) and the phone's Region setting (`expo-localization`).
- **Known iOS-vs-web traps** (from the first device run, 2026-11-07 and 08):
  - react-native-screens on the New Architecture can resize a `formSheet`'s scroll view over its
    header; Log is a page sheet with its header inside the scroll view (`app/_layout.tsx`).
  - Yoga squashes an in-flow child inside a 0-height wrapper down to its padding where CSS
    wouldn't; a measured canvas lays out out of flow (`ScaledCanvas`, `position: 'absolute'`).
  - Centring a switch on a label plus a two-line description lines it up with neither; switch rows
    put the switch on the label's line (`ToggleRow`, `ToggleSwitch`).
  - iOS asks before a Log draft is discarded (`useLogDraftGuard`); web has no action sheet.
  - Web shows times as "07:00 PM", the device as the system's locale ("19:00").
  - The JavaScript formatter doesn't carry the phone's 24-Hour Time switch on an English phone;
    `locale.ts` reads it from `expo-localization` (step 185).
  - `SafeAreaView` measured no top inset inside the `fullScreenModal` paywall (the first
    TestFlight build, 2026-11-16); the route pads by `useSafeAreaInsets` (step 187).
- **Where device results go:** the owner reports; the main session records them in `HANDOFF.md`
  and ticks `docs/HUMAN_VERIFICATION.md` (Batch C, D). `/device-check` writes the list to check.
