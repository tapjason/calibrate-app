# Calibrate — App Store Listing (draft)

**As of:** 2026-10-04 (age rating re-done for Apple's 2026 questionnaire) · Drafted from `CLAUDE.md` and the shipped code. Every
feature claimed below exists in `master`; ✨ Refine is cut and appears nowhere.
The limits in brackets are Apple's, and every field was counted against them.

---

## 0. The name is the open question

Two US App Store apps already use it:

- **Calibrate – Metabolic Health** by Calibrate Inc., a GLP-1 weight-loss
  program with an established brand, in the health space.
- **Calibrate: Recovery & Fitness**, a wearable-recovery app.

App Store names must be unique, and a bare "Calibrate" will almost certainly be
refused when the App Store Connect record is created. A descriptor suffix
("Calibrate: …") may be accepted, but it still sits next to a health company's
brand while this app ships a *health* category. **Whether that's acceptable is
a legal and brand call. It's yours, not the agent's.**

Options, in order of how little they change:

| Option | Store name [30] | Note |
|---|---|---|
| Keep the brand, add a descriptor | `Calibrate: Prediction Journal` | Smallest change. Trademark exposure unchanged. |
| Keep the brand, add a qualifier | `Calibrated – Trust Your Gut` | Distinct string, same idea. |
| Rename | e.g. `Hunchmark`, `Brier`, `Oddsmith` | Cleanest. Every `Calibrate` string in the app and docs changes. **None checked for availability.** Creating the App Store Connect record is the only definitive check. |

The rest of this document says "Calibrate". Substitute as needed.

---

## 1. Store fields

**Subtitle** [30]

> Know when to trust your gut

**Promotional text** [170] (editable any time without review)

> Log a prediction, say how sure you are, and find out if you were right to be.
> Sharp in health, Guesser in money? Your calibration score shows you where.

**Keywords** [100 bytes, comma-separated, no spaces, no words already in the name]

> forecast,prediction,confidence,journal,decision,habit,goal,self,insight,bias,overconfidence,tracker

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
| In-app controls (parental controls, age assurance) | No, or **Yes** for age assurance once `NEXT_STEPS.md` item i ships | Answer to match the build that's submitted. |

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
> are, from 0 to 100%, and pick a due date. When it comes due, Calibrate reminds
> you. Tap yes or no. That's it.
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
> **SHARP IN HEALTH, GUESSER IN MONEY**
> Calibration isn't one number. Calibrate scores you separately for work, health,
> finance, social life, and personal goals, and gives each a badge from Guesser
> to Oracle. Badges need a real track record, so a lucky streak won't earn one.
>
> **HONEST BY DESIGN**
> • Calibrate rewards calibration, not correctness. A miss at 60% confidence is
> exactly what 60% means.
> • Your score stays hidden until you have enough resolved predictions for it to
> mean something.
> • An integrity bonus rewards the honest middle (35–65%), where the most useful
> data lives.
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
> • Trends: month-by-month calibration, per-category drill-down, and CSV export.
> • Extra card themes.
>
> Plus is available monthly, annually (with a one-month free trial), or as a
> one-time lifetime purchase. The trial converts to a paid annual subscription
> unless you cancel at least 24 hours before it ends. Subscriptions renew
> automatically unless cancelled at least 24 hours before the end of the
> current period, and you can manage them in your App Store account settings.
>
> Privacy policy: [URL]
> Terms of use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

**The last two lines are required, not decoration.** Apple's subscription rules
(Guideline 3.1.2) require a functional privacy policy link and terms of use
(Apple's standard EULA is fine) in the metadata. The paywall links to both as of
2026-09-25; its Privacy Policy link appears once `PRIVACY_POLICY_URL` in
`src/constants/app.ts` is set to the hosted policy.

---

## 3. In-app purchase metadata

| Product id | Display name [30] | Description [45] |
|---|---|---|
| `calibrate_plus_monthly` | Calibrate Plus Monthly | Coach, trends, export and card themes |
| `calibrate_plus_annual` | Calibrate Plus Annual | Coach, trends, export and card themes |
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
| 1 | **Identity card** (Share → Card) | **Sharp in health. Guesser in money.** |
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
it on the device.

**How:** final images from a device or simulator build. The web target plus
Playwright at 440 × 956 CSS px, 3× scale, gives 1320 × 2868 drafts now. Web
rendering differs slightly (system font, no status bar), so treat those as
layout drafts rather than uploads. Drafts of screens 1–6 were made 2026-10-03
(git-ignored, `screenshots/draft/`).

---

## Sources

- App Store: [Calibrate – Metabolic Health](https://apps.apple.com/us/app/calibrate-metabolic-health/id1514232557) · [Calibrate: Recovery & Fitness](https://apps.apple.com/us/app/calibrate-health-recovery/id6757204030)
- Screenshot sizes: [AppLaunchFlow, 2026 specifications](https://www.applaunchflow.com/blog/app-store-screenshot-specifications-2026) · [Screenhance, 2026 dimensions](https://screenhance.com/blog/app-store-screenshot-dimensions-2026)
- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (3.1.2 subscriptions, 5.1.1 privacy, 5.1.2(i) third-party AI)
- Apple, [Updated age ratings in App Store Connect](https://developer.apple.com/news/?id=ks775ehf) · [Update for apps distributed in Texas](https://developer.apple.com/news/?id=sg176nne)
