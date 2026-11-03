# Calibrate — App Store Listing (draft)

**As of:** 2026-10-08 (daily practice and "no betting" added to the description; age rating re-done for Apple's 2026 questionnaire on 2026-10-04) · Drafted from `CLAUDE.md` and the shipped code. Every
feature claimed below exists in `master`; ✨ Refine is cut and appears nowhere.
The limits in brackets are Apple's, and every field was counted against them.

---

## 0. The name: Fairly Sure (working choice)

**Chosen 2026-11-03, for now: Fairly Sure**, store name `Fairly Sure: Calibration Log`.
Not final until the trademark search and the App Store Connect record (next
steps below). The app and the rest of the docs still say "Calibrate".

**Re-researched 2026-11-03. Recommendation: rename.** Not legal advice; a
trademark search by counsel is the real check.

### The other Calibrate apps (US App Store, 2026-11-03)

| App | Ratings | Since | Read |
|---|---|---|---|
| Calibrate – Metabolic Health (Calibrate Health, Inc.) | 5,378, 4.8★ | 2020 | Established and steady, not surging. Moved to selling through employers (about 90% of its business, Feb 2026); expects its first profitable year. Updated 2026-10-26. |
| Calibrate: Recovery & Fitness | 1 | Jan 2026 | Negligible. |
| Calibrate: Time Block Planner | 0 | Jan 2026 | Negligible. |
| Calibrate: ADHD Med Tracker | 0 | May 2026 | Negligible. |
| Calibrate: Calorie Tracker | 0 | Sep 2026 | Negligible. |

None of them is trending; the point is the crowd and the mark. Five apps now
use "Calibrate:", four of them in Health & Fitness, and **Calibrate Health
holds a registered CALIBRATE mark (Reg. 7432181, 2024) listed in classes 9 and
42, software and apps**, by third-party trademark sites (verify in USPTO TSDR).
A "Calibrate: Prediction Journal" store name would sit inside that mark's
classes, beside its owner's health brand, while this app ships a *health*
category. A direct competitor also exists: **Hedge: Calibrated Trivia** (a
calibration game, 5 ratings, 2026).

### Words to avoid

- **Odds, wager, bet, "prediction"** in the name: the App Store's "prediction"
  results are now prediction markets (Polymarket-style), and gambling words
  invite a closer review. "Prediction" is fine in the subtitle.
- **Names about being right** ("Called It", "Mostly Right"): the app rewards
  calibration, not correctness (CLAUDE.md principles).
- **Taken in the same space:** "Surely" (Surely – Smarter Decisions, Surely
  Predictions), "Reckon" (Reckon: Decision Journal), "Hunch" (a dating app,
  7.5k ratings), "Credence" and "Likely" (crowded), "Surecast" (registered
  SURECAST mark, classes 38 and 41).

### Shortlist (each clear on the US App Store by name, `.app` domain unregistered, 2026-11-03)

| Name | Store name [30] | Why | Against |
|---|---|---|---|
| **Fairly Sure** (first choice) | `Fairly Sure: Calibration Log` (28) | Speaks the product's own language: the share line is "How sure are you?" and a 70% call *is* fairly sure. Humble, which is the point of calibration. Reads as identity ("I'm fairly sure"). No app, brand or mark found. | A common phrase: harder to own in web search. Two words. `fairlysure.com` is registered (nothing identifiable on it). |
| **Hunchmark** | `Hunchmark: Calibration Journal` (30) | Coined, so ownable: no app, brand, mark or web result at all. "Mark your hunches", with a nod to benchmark. | Says less about confidence; "hunch" is gut, not measurement. `hunchmark.com` registered, not serving. |
| **Sure Enough** | `Sure Enough: Prediction Log` (27) | Warm, and it names the resolution moment. No app, brand or mark found. | Leans toward being right ("sure enough, it happened"). `sureenough.com` registered. |

Also clear but weaker: Hunchwise, Truehunch. Checked and dropped: Brier,
Oddsmith, Calibrated, Inkling, Priors, Plumbline, Lodestar, Sharpen, Ninety,
Second Guess, Gut Check, Percently, Callmark, Sureline, Gutmark.

**Next steps for the chosen name:** a USPTO search (classes 9 and 42), then claim
the `.app` domain and create the App Store Connect record, which is the only
definitive name check. Every "Calibrate" string in the app and docs then
changes; the bundle id `com.calibrate.app` can stay (users never see it).

The rest of this document says "Calibrate". Substitute as needed.

---

## 1. Store fields

**Subtitle** [30]

> Know when to trust your gut

**Promotional text** [170] (editable any time without review)

> Log a prediction, say how sure you are, and find out if you were right to be.
> Sharp in health, shaky with money? Your calibration score shows you where.

**Keywords** [100 bytes, comma-separated, no spaces, no words already in the name]

> forecast,prediction,confidence,journal,decision,habit,goal,self,insight,bias,overconfidence,tracker

Since prediction markets went mainstream in 2026, "prediction" brings betting
traffic too (`GROWTH_AND_MONETIZATION.md` §2.6). Keep it, since it's what people
call the thing they log, but the description now says "No money, no odds, no
betting" so the wrong visitor leaves before installing, not after. Revisit with
App Store Connect's search-term data once there is some.

**Primary category:** Productivity · **Secondary:** Lifestyle

Not Health & Fitness. The app reads no health data, and that category invites
the name collision above.

**Age rating:** target **4+**. Apple replaced the questionnaire in 2025 (new
13+, 16+ and 18+ tiers), and since 2026-01-31 App Store Connect blocks
submission until the new questions are answered. Proposed answers, each with
the reason:

| Question group | Answer | Why |
|---|---|---|
| Content (violence, mature themes, profanity, gambling, …) | None | Nothing of the kind ships. Predictions are the user's own text and stay on their device and account. |
| Medical or wellness topics | None | "Health" is only a label the user puts on their own predictions. The app gives no medical or wellness information, and the Coach is forbidden from medical advice and numeric diet or exercise targets (`COACH_AGENT.md`). |
| AI assistant / chatbot | Count the Coach in. Its output carries no sensitive content: insights are schema-validated, cite numbers from the input or are dropped, and distress-signalling text never reaches the model. | Apple asks for AI features to be included when judging how often sensitive content appears. |
| User-generated content, messaging, chat | No | No user-to-user interaction. Shared cards go out through the OS share sheet, which Apple doesn't count as in-app user-generated content. |
| Unrestricted web access | No | The only links open fixed pages (privacy policy, store terms). |
| Advertising | No | There are no ads. |
| In-app controls (parental controls, age assurance) | **Yes** for age assurance. No parental controls. | The build asks Apple's Declared Age Range API once (`src/age/ageRange.ts`). Nothing in the app is gated on the result. |

Read the questions as App Store Connect words them on the day; if one doesn't
map onto this table, ask rather than guess. A rating that's later found to be
wrong is a reason for rejection, and under Texas SB 2420 a later rating change
can be a "significant change" that minors' parents must re-approve (Apple
leaves that judgement to the developer), so getting it right first time matters.

---

## 2. Description [4000]

> Most people are overconfident about some things and underconfident about
> others, and never find out which. Calibrate shows you.
>
> **HOW IT WORKS**
> Write a prediction ("I'll finish the report by Friday"), set how confident you
> are, from 0 to 100%, and pick a due date. As you set it, you see how your past
> calls at that confidence turned out. When it comes due, Calibrate reminds you.
> Tap yes or no. That's it.
>
> Over time, Calibrate compares what you said against what happened. If you're
> 80% sure of things, about 80% of them should come true. Your calibration curve
> shows where you're on target, where you're overconfident, and where you sell
> yourself short.
>
> **YOUR RESULT IN 60 SECONDS**
> Don't want to wait weeks? The warmup quiz gives you a first read on day one:
> ten quick estimation questions, and a verdict on how well your confidence
> matches your accuracy.
>
> **THREE QUESTIONS A DAY**
> On days when nothing comes due, there's daily practice: three quick
> either-or questions, the same for everyone that day, each with how sure you
> are. Practice stays apart from your real score.
>
> **SHARP IN HEALTH, TRACKER IN MONEY**
> Calibration isn't one number. Calibrate scores you separately for work, health,
> finance, social life, and personal goals, and gives each a badge from Guesser
> to Oracle. Badges need a real track record, so a lucky streak won't earn one.
>
> **HONEST BY DESIGN**
> • Calibrate rewards calibration, not correctness. A miss at 60% confidence is
> exactly what 60% means.
> • Your score stays hidden until you have enough resolved predictions for it to
> mean something.
> • A second measure, the Brier score, rewards being decisive as well as
> calibrated, so playing it safe doesn't flatter you.
> • No money, no odds, no betting. Just your own track record.
>
> **SHARE YOUR RESULTS**
> Turn your per-category results into a card, or get a weekly and yearly recap
> of your forecasting. Sharing is always free.
>
> **PRIVATE BY DEFAULT**
> Everything works offline, without an account. Sign in only if you want a
> backup. No ads, no tracking.
>
> **CALIBRATE PLUS**
> Optional, for going deeper:
> • Coach: short AI feedback grounded in your own numbers. It sees your
> statistics, never your predictions' text.
> • Trends: month-by-month calibration, per-category drill-down, what your 80%
> really means in each area, and how you do by how far ahead you call it.
> • Extra card themes.
> (Exporting your own predictions as CSV is free.)
>
> Plus is available monthly, annually (with a one-month free trial), or as a
> one-time lifetime purchase. The trial converts to a paid annual subscription
> unless you cancel at least 24 hours before it ends. Subscriptions renew
> automatically unless cancelled at least 24 hours before the end of the
> current period, and you can manage them in your App Store account settings.
>
> Privacy policy: https://tapjason.github.io/calibrate-app/privacy/
> Terms of use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

**The last two lines are required, not decoration.** Apple's subscription rules
(Guideline 3.1.2) require a functional privacy policy link and terms of use
(Apple's standard EULA is fine) in the metadata. The paywall and Settings link
to both. That privacy URL is `docs/PRIVACY_POLICY.md` on GitHub Pages
(`permalink: /privacy/`). It has to load before submission: Pages on, source
`master` / `/docs`. Until then the in-app link 404s.
`docs/HUMAN_VERIFICATION.md` has the switch and the check.

---

## 3. In-app purchase metadata

| Product id | Display name [30] | Description [45] |
|---|---|---|
| `calibrate_plus_monthly` | Calibrate Plus Monthly | Coach, trends and card themes |
| `calibrate_plus_annual` | Calibrate Plus Annual | Coach, trends and card themes |
| `calibrate_plus_lifetime` | Calibrate Plus Lifetime | Every Plus feature, one payment, forever |

Subscription group name: **Calibrate Plus**. Put annual at level 1 and monthly
at level 2 (same features, so this only orders upgrades and downgrades).

---

## 4. App Review notes

> Calibrate works fully without an account; no sign-in is needed to review the
> core features (Log, Resolve, Stats, Share).
>
> To review Calibrate Plus: Stats → "See Plus" → purchase any plan with your
> sandbox account. The Coach requires signing in (Settings → Account) because
> it runs on our server. It is off by default; enable it in Settings → Coach,
> then Stats → Get feedback. Coach feedback needs predictions resolved in the
> past. To see it with data, [DEMO ACCOUNT: email / password, pre-seeded with
> 145 resolved predictions].
>
> Account deletion: Settings → Account → Delete account.
>
> Notifications are local reminders only; no push server is involved.

**Why the demo account matters:** a reviewer on a fresh install has no resolved
predictions. The Coach then shows "keep logging", and the Stats screen shows
only progress. Both are correct, and both look like broken features to someone
with ten minutes. Seed a demo account with `node scripts/seed-demo-sql.mjs <user-uuid>` (145 resolved
predictions; paste the output into the Supabase SQL editor, and re-run it shortly
before submitting, since dates are relative to the run) and put its credentials in
App Store Connect, **not** in the repo.

---

## 5. Screenshots

**Spec:** at least one **6.9-inch** set, 1320 × 2868 px portrait (1290 × 2796
and 1260 × 2736 are also accepted), sRGB PNG or JPEG, no transparency, 1–10
images. Apple scales down to smaller iPhones. `supportsTablet: false`, so no
iPad set is needed.

The order matters. Most people see only the first three.

| # | Screen | Caption (short, large type) |
|---|---|---|
| 1 | **Identity card** (Share → Card) | **Sharp in health. Tracker in money.** |
| 2 | **Calibration curve** (Stats, a post-threshold user, points off the diagonal) | **See exactly where you're overconfident** |
| 3 | **Warmup verdict** | **Your first result in 60 seconds** |
| 4 | **Log screen** with the confidence slider mid-range | **Say how sure you are. Find out later.** |
| 5 | **Category badges** on Stats | **Earn your badges. No lucky streaks.** |
| 6 | **Wrapped** (This year) | **Your year in predictions** |
| 7 | **Coach panel** with insights | **Feedback grounded in your own numbers** (Plus) |

**Data for them:** a seeded user with at least 60 resolved predictions spread
across all five categories, with real miscalibration (overconfident in finance,
well calibrated in health). Without it, screens 2, 5 and 7 show the provisional
state. `src/db/demoData.ts` is that user; on a development build, `/dev/seed` loads
it on the device. The same screen's **Preview Plus until reload** turns on the Plus
surfaces in memory only (nothing is written to the entitlement mirror), for screen
7 and for the correction table on Stats ("What your confidence means"), which is a
candidate for a screen of its own: *In finance, your 80–100% came true 47% of the
time.* `/dev/celebrations` replays the unlock and tier-up cards.

**How:** final images from a device or simulator build. The web target plus
Playwright at 440 × 956 CSS px, 3× scale, gives 1320 × 2868 drafts now. Web
rendering differs slightly (no status bar, and no SF Symbols or glass), so treat
those as layout drafts rather than uploads. Bring the browser window to the front
(`page.bringToFront()`) or force a repaint before each capture: a window hidden
behind others keeps presenting its first frame, the launch spinner, after the
screen has drawn. Drafts of screens 1–6 were made 2026-10-03
(git-ignored, `screenshots/draft/`), before D33, so they show the old indigo and
Inter and need redoing.

**Marketing visuals: the stageshow skill (parked 2026-11-01, use before
release).** `.claude/skills/stageshow/` is a vendored Claude Code skill
(`benjitaylor/skills`, MIT, pinned in `skills-lock.json`) for faux product UI:
framed stills and short cursor-driven demos, built in browser React and CSS. It
is installed but unused until release prep. Planned uses:

- Framed screenshot compositions: a device frame, a crop and a caption set
  around a real capture of each screen in the table above.
- A landing-page hero and feature cards, e.g. the calibration curve drawing
  itself, or a badge going from Tracker to Sharp.
- Launch and social visuals for the "Sharp in health · Tracker in money" idea.

Limits:

- **Not for the app's own screens.** Its kit is web React (`div`, CSS, Vite),
  not React Native, and its look rules are for illustrations, not for
  `docs/design/DESIGN_SYSTEM.md`. It won't run in the Expo app.
- **Not for the App Store preview video, and not as a substitute for the app
  in screenshots.** Guideline 2.3.4 allows previews built only from screen
  captures of the app itself, and 2.3.3 requires screenshots to show the app in
  use. A stageshow mock may frame a real capture; it may not stand in for one
  or show anything the app doesn't do.

To use it: `cd .claude/skills/stageshow && npm install && npm run dev`, then
follow its `SKILL.md` (it starts by filming the closest "gold" example). To
refresh it from upstream, run `npx skills update stageshow -p`. If the folder is
ever deleted, `npx skills experimental_install` restores it from the lockfile.

---

## Sources

- App Store: [Calibrate – Metabolic Health](https://apps.apple.com/us/app/calibrate-metabolic-health/id1514232557) · [Calibrate: Recovery & Fitness](https://apps.apple.com/us/app/calibrate-health-recovery/id6757204030)
- Screenshot sizes: [AppLaunchFlow, 2026 specifications](https://www.applaunchflow.com/blog/app-store-screenshot-specifications-2026) · [Screenhance, 2026 dimensions](https://screenhance.com/blog/app-store-screenshot-dimensions-2026)
- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (3.1.2 subscriptions, 5.1.1 privacy, 5.1.2(i) third-party AI)
- Apple, [Updated age ratings in App Store Connect](https://developer.apple.com/news/?id=ks775ehf) · [Update for apps distributed in Texas](https://developer.apple.com/news/?id=sg176nne)
