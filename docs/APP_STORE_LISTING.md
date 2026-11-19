# Fairly Sure — App Store Listing

**As of:** 2026-11-18 · The source for the App Store Connect record's fields, drafted from
`CLAUDE.md` and the shipped code (the 2026 age-rating answers and review notes from the policy
audits of 2026-11-14 and 2026-11-15; the review notes, the Google sentence and the age-range
lines revised after the security and policy review of 2026-11-18). Every feature claimed below exists in `master`; ✨ Refine
is cut and appears nowhere.
The limits in brackets are Apple's, and every field was counted against them.

---

## 0. The name: Fairly Sure

**Chosen 2026-11-03: Fairly Sure**, store name `Fairly Sure: Calibration Log`. The App Store
Connect record exists (Apple ID `6831917395`, 2026-11-07). The app says "Fairly Sure" since
step 147; the repo, the internal ids and older docs still say "Calibrate". Why not Calibrate:
five apps already use "Calibrate:", four in Health & Fitness, and Calibrate Health holds a
registered CALIBRATE mark (Reg. 7432181, classes 9 and 42, software and apps). A direct
competitor also exists: Hedge: Calibrated Trivia (a calibration game, 5 ratings, 2026). The
shortlist and the other apps checked are in git history.

**Trademark screen (2026-11-03): clear to proceed, two risks for counsel.** A knockout screen,
not a legal opinion (the USPTO's search index, common-law and store searches). No mark, app,
company or product found for FAIRLY SURE or its close variants.

- **FAIRLY** (Fairly AI Inc., Reg. 8320299, 8320298 and FAIRLY AI 8340321, classes 9 and 42,
  software for AI governance and compliance) sits wholly inside FAIRLY SURE in the same
  classes, so an examiner could cite it; meaning, impression, goods and buyers all differ.
  **Risk: low to moderate.**
- **The phrase** is suggestive, so it should register, but a "failure to function" refusal for
  an everyday expression (TMEP §1202.04) is the risk to raise. **Risk: low to moderate.**
- **Not checked:** other countries (Canada, the EU, the UK), state registers, social handles.

**Still open (counsel and the owner):** a clearance opinion and filing in classes 9 and 42
(an intent-to-use application can be filed before launch), and the `fairlysure.app` domain
(unregistered on 2026-11-03; `fairlysure.com` is parked for resale at Afternic).

**Done for the chosen name (2026-11-03):** the US trademark screen (above), the
in-app rename (step 147), the policy, and this listing. **Permanent ids, decided
before anything is registered with Apple:** bundle id `app.fairlysure` (the
reverse of `fairlysure.app`; it can never change once registered) and URL scheme
`fairlysure` (`calibrate://` could be claimed by Calibrate Health's app, and two
apps claiming one scheme make a sign-in redirect unpredictable). Kept: the
product ids `calibrate_plus_*` (never shown to anyone, and RevenueCat and the
webhook use them; once created in App Store Connect they can never be reused),
the Expo slug `calibrate` (the EAS project is linked to it), and the repo name
(the policy's URL carries it until Pages has a custom domain).

**Store name** [30]: `Fairly Sure: Calibration Log` (28). "Calibration" and
"Log" are indexed from the name, so the keywords below leave them out. Never put
"Calibrate" in the keywords: it is another company's registered mark
(Guideline 2.3.7).

---

## 1. Store fields

**Support URL** (required): https://tapjason.github.io/calibrate-app/support/
(`docs/SUPPORT.md`, live on GitHub Pages).
**Copyright:** 2026 Jason Zou.

**Subtitle** [30]

> Know when to trust your gut

**Promotional text** [170] (editable any time without review)

> Log a prediction, say how sure you are, and find out if you were right to be.
> Sharp in health, shaky with money? Your calibration score shows you where.

**Keywords** [100 bytes, comma-separated, no spaces, no words already in the name]

> forecast,prediction,confidence,journal,decision,goal,self,insight,bias,overconfidence,tracker

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
| Unrestricted web access | No | The only links open fixed pages (privacy policy, store terms, the support page). |
| Mature or suggestive themes | None | The app shows no such content. The Coach's support surface (a helpline pointer when someone's own text signals distress) isn't a depiction of trauma or abuse; if Apple's wording counts it, "infrequent" is 9+: the owner's call on the day. |
| Advertising | No | There are no ads. |
| In-app controls (parental controls, age assurance) | **Yes** for age assurance. No parental controls. | The build asks Apple's Declared Age Range API once per launch until a band is stored, so after a decline it asks again at the next launch (`src/age/ageRange.ts`: one ask per process, and nothing is stored on a decline). Nothing in the app is gated on the result. Apple defines age assurance as a mechanism that confirms an age "meets the age requirement for accessing specific content or services"; the build asks and gates nothing, so read the question as worded on the day (policy audit, 2026-11-14; the under-13 decision in `SHIP_READINESS.md` would settle it). |
| Social media; social media disabled under 13 (asked since July 2026, required from September) | No | No feed, profiles, followers or posts. |
| Shared location; dating and relationships (descriptors from 2026-11-16, all apps by 2027-01-12) | No | The app reads no location and matches nobody. |
| Gambling; simulated gambling; contests; loot boxes (asked one by one) | None | No stakes, odds, currency, prizes or chance mechanics. Nobody competes: a friend comparison, if ever built, would change the contests answer. |
| Medical or treatment information | None | The Coach's support surface points to a helpline when someone's own text signals distress. That is a referral, not treatment information. If Apple's wording counts it, "infrequent" is 13+: the owner's call on the day. |

Read the questions as App Store Connect words them on the day; if one doesn't
map onto this table, ask rather than guess. A rating that's later found to be
wrong is a reason for rejection, and under Texas SB 2420 a later rating change
can be a "significant change" that minors' parents must re-approve (Apple
leaves that judgement to the developer), so getting it right first time matters.

---

## 2. Description [4000]

> Most people are overconfident about some things and underconfident about
> others, and never find out which. Fairly Sure shows you.
>
> **HOW IT WORKS**
> Write a prediction ("I'll finish the report by Friday"), set how confident you
> are, from 0 to 100%, and pick a due date. As you set it, you see how your past
> calls at that confidence turned out. When it comes due, Fairly Sure reminds you.
> Tap yes or no. That's it.
>
> Over time, Fairly Sure compares what you said against what happened. If you're
> 80% sure of things, about 80% of them should come true. Your calibration curve
> shows where you're on target, where you're overconfident, and where you sell
> yourself short.
>
> **YOUR RESULT IN 60 SECONDS**
> Don't want to wait weeks? The warmup quiz gives you a first read on day one:
> ten quick either-or questions, each with how sure you are, and how your
> confidence compared with how many you got right.
>
> **THREE QUESTIONS A DAY**
> On days when nothing comes due, there's daily practice: three quick
> either-or questions, the same for everyone that day, each with how sure you
> are. Practice stays apart from your real score.
>
> **SHARP IN HEALTH, TRACKER IN MONEY**
> Calibration isn't one number. Fairly Sure scores you separately for work,
> health, finance, social life, personal goals and any category you add, and
> each earns a badge from Tracker to Oracle. Badges need a real track record, so
> a lucky run is unlikely to earn one.
>
> **HONEST BY DESIGN**
> • Fairly Sure rewards calibration, not correctness. A miss at 60% confidence is
> exactly what 60% means.
> • Your score stays hidden until you have enough resolved predictions for it to
> mean something.
> • A second measure, the Brier score, shows once you have 50 answers whether
> your numbers also tell apart what will happen from what won't.
> • An answer given the day you logged the prediction isn't scored, so the
> score is harder to pad with sure things.
> • No money, no odds, no betting. Just your own track record.
>
> **SHARE YOUR RESULTS**
> Turn your per-category results into a card, or get a weekly and yearly recap
> of your forecasting. Sharing is always free.
>
> **PRIVATE BY DEFAULT**
> The whole free app works offline, without an account. Sign in only if you
> want a backup or the Coach. No ads, no tracking. Lock the app with Face ID or
> your passcode if you share your phone.
>
> **FAIRLY SURE PLUS**
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
(Apple's standard EULA is fine) in the metadata. The paywall and You link
to both. That privacy URL is `docs/PRIVACY_POLICY.md` on GitHub Pages
(`permalink: /privacy/`, source `master` / `/docs`), live since 2026-11-15;
`check.sh --release` checks that it loads.

---

## 3. In-app purchase metadata

| Product id | Display name [30] | Description [45] |
|---|---|---|
| `calibrate_plus_monthly` | Fairly Sure Plus Monthly | Coach, trends and card themes |
| `calibrate_plus_annual` | Fairly Sure Plus Annual | Coach, trends and card themes |
| `calibrate_plus_lifetime` | Fairly Sure Plus Lifetime | Every Plus feature, one payment, forever |

Subscription group name: **Fairly Sure Plus**. Put annual at level 1 and monthly
at level 2 (same features, so this only orders upgrades and downgrades).

---

## 4. App Review notes

> Fairly Sure works fully without an account; no sign-in is needed to review
> the core features (log with +, answer on Today, Insights, Share).
>
> To review Fairly Sure Plus: You → Fairly Sure Plus → purchase any plan with
> your sandbox account. The Coach requires signing in because it runs on our
> server. Please sign in with this demo account: You → Sign in, enter the email
> and password under Sign in, [DEMO ACCOUNT: email / password, pre-seeded with
> 153 resolved predictions and with Plus]. Please don't create a new account by
> email: confirmation emails aren't being sent yet, so a new email account
> can't be confirmed. Sign in with Apple and Continue with Google also work.
> The Coach is off by default; enable it in You → Coach (AI), then Insights →
> Get feedback. Coach feedback needs predictions resolved in the past, which the
> demo account has.
>
> Account deletion: You → Delete account (at the bottom, once signed in).
>
> Notifications are local reminders only; no push server is involved.
>
> The Coach sends only computed statistics (counts, scores and percentages),
> never the user's text or account id, to OpenAI through our server, and only
> after the user turns it on in You → Coach (AI), which says a third-party AI
> service writes the feedback (the privacy policy names OpenAI). It needs an
> account because our server checks the subscription per account; Sign in with
> Apple asks for the email only. Continue with Google sits below Sign in with
> Apple; it opens Google in the system sign-in sheet (no Google SDK is in the
> app), and our database removes the name and picture Google sends as they
> arrive.
>
> After the first screen appears, the app asks Apple's Declared Age Range API
> for an age band, once per launch until one is shared; after a decline it asks
> again at the next launch. Declining changes nothing.

**Before pasting the Google sentence** (2026-11-18): "our database removes the name and
picture Google sends as they arrive" is true only once the owner has turned off Supabase's
Authentication → Configuration → Audit Logs → "Write audit logs to the database" and
purged `auth.audit_log_entries`; until then each sign-in keeps the Google name there
(`docs/APP_PRIVACY.md`, the Name row). If those steps aren't done, end the sentence at "(no
Google SDK is in the app)." The age-range lines follow `src/age/ageRange.ts` (one ask per
process, nothing stored on a decline); whether iOS shows its sheet again after a decline
is iOS's decision, so say "asks", not "shows".
>
> Optional app lock: You → Lock with Face ID (off by default; named Lock with
> Touch ID or Lock with iPhone passcode on other iPhones). It uses
> LocalAuthentication with LAPolicy.deviceOwnerAuthentication, so the device
> passcode is always offered as the alternative to Face ID. The app never
> receives biometric data or the passcode: only whether the check passed, and
> which methods the phone has set up, to name the switch. This is the app's
> only use of Face ID. It is not account sign-in, and nothing requires it. On a
> device with no passcode the switch explains that one must be set and does
> not turn on.
>
> If a user's own prediction text signals distress, the Coach gives no
> feedback and the app shows helpline information instead. That check runs on
> the device; the text is not sent anywhere.
>
> There is no gambling, no stakes and no currency. Predictions are private
> notes about the user's own life ("I'll finish the report by Friday").

**Give the demo account Plus before review** (the policy audit, 2026-11-14): right
after a sandbox purchase the server may not have the entitlement yet, and the
reviewer would see "Coach couldn't confirm your Plus subscription yet" (since step
189 the Coach asks RevenueCat itself then, so this should be rare). Seed the account, grant it
Plus in RevenueCat (a promotional entitlement), and tell the reviewer to look at
the purchase flow signed out.

**Why the demo account matters:** a reviewer on a fresh install has no resolved
predictions. The Coach then says it needs a scored answer first, and Insights shows
only progress. Both are correct, and both look like broken features to someone
with ten minutes. Seed a demo account with `node scripts/seed-demo-sql.mjs <user-uuid>` (153 resolved
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
| 2 | **Calibration curve** (Insights, a post-threshold user, points off the diagonal) | **See exactly where you're overconfident** |
| 3 | **Warm-up result** (counts, chart and the answers) | **Your first result in 60 seconds** |
| 4 | **Log screen** with the confidence slider mid-range | **Say how sure you are. Find out later.** |
| 5 | **Category badges** on Insights | **Earn your badges. No lucky streaks.** |
| 6 | **Wrapped** (Share → This year) | **Your year in predictions** |
| 7 | **Coach panel** on Insights, with insights | **Feedback grounded in your own numbers** (Plus) |

**Data for them:** a seeded user with at least 60 resolved predictions spread
across all five categories, with real miscalibration (overconfident in finance,
well calibrated in health). Without it, screens 2, 5 and 7 show the provisional
state. `src/db/demoData.ts` is that user; on a development build, `/dev/seed` loads
it on the device. The same screen's **Preview Plus until reload** turns on the Plus
surfaces in memory only (nothing is written to the entitlement mirror), for screen
7 and for the correction table on Insights ("What your confidence means"), which is a
candidate for a screen of its own: *In finance, your 80–100% came true 48% of the
time.* `/dev/celebrations` replays the unlock and tier-up cards.

**How:** final images from a device or simulator build. The web target plus
Playwright at 440 × 956 CSS px, 3× scale, gives 1320 × 2868 drafts now. Web
rendering differs slightly (no status bar, and no SF Symbols or glass), so treat
those as layout drafts rather than uploads. Bring the browser window to the front
(`page.bringToFront()`) or force a repaint before each capture: a window hidden
behind others keeps presenting its first frame, the launch spinner, after the
screen has drawn. **Drafts redone 2026-11-03** under the Fairly Sure name and D33
(git-ignored, `screenshots/draft/`, files `1-` to `6-`; the `0x-` files are the
pre-D33 set): a 1320 × 2868 window with the page zoomed 3×, so it lays out at
440 × 956, from a fresh install with the Warm-up done and the demo data loaded.
Screen 7 (Coach with insights) needs a signed-in Plus account, so it waits for a
device build; screen 5 already shows the Plus card's sample. Screen 6's draft
predates D42 and D60 (the year card now names both sides when there are both, and
its calls read "Surest call that happened" and "Surest call that didn't happen"):
retake it.

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
