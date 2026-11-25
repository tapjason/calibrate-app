# Fairly Sure — App Store Listing

**As of:** 2026-11-25 · The source for the App Store Connect record's fields, drafted from
`CLAUDE.md` and the code, and read against `master` for 1.1.0 (the review of 2026-11-25,
after D79 and D80), not against build 7. Before that, the release gate of 2026-11-20 read it
against production build 1.0.0 (7) (commit `590ab75`): its policy audit rewrote the review
notes' opening (§4) and its release audit counted every field. Earlier revisions: the
age-rating answers and review notes from the policy audits of 2026-11-14 and 2026-11-15, the
security and policy review of 2026-11-18, and the under-13 rule (D70) and its review on
2026-11-19. Every feature claimed below is in `master` for 1.1.0, the under-13 rule
included; ✨ Refine is cut and appears nowhere.
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

**The owner's chosen line for 1.1.0** (D80, 2026-11-25: "I also like the changed slogan"):
**"Learn when to trust your gut"** (28 of 30), for the subtitle and to lead the promotional
text. It is the share cards' hook in the app since D80. *For the owner to paste in App Store
Connect at the 1.1.0 submission;* the line above is the record's until then.

**Promotional text** [170] (editable any time without review)

> Log a prediction, say how sure you are, and find out if you were right to be.
> Sharp in health, shaky with money? Your calibration score shows you where.

*Needs the owner's word at 1.1.0:* the second line plays on the old tier name, and the app
no longer says "sharp" (D80). **The main session's suggestion, for the owner to confirm**
(2026-11-25), the medals in the same shape:

> Gold in health, Bronze with money? Your calibration score shows you where.

(152 of 170 with the first line.) His slogan above can take its place instead ("Learn
when to trust your gut, category by category." is one way).

**What's New in 1.1.0** [4000] (a draft for the owner, 2026-11-25; not entered anywhere)

> • Badges are medals now: Bronze, Silver, Gold and Platinum.
> • Due dates are in plain words, like "due in 3 days". One due today reads "due today by
> 11:59 PM".
> • "Pick a date" opens the full calendar.
> • Reminders never show your words, and they don't have Happened and Didn't buttons any
> more. Tap one to answer in the app.
> • "Hide the words" is gone: your predictions show as you wrote them, and category names
> show on your card too. Leave a category off the card before you share it if you'd rather.
> • Practice is now Trivia, and its reminder is gone.
> • Fairly Sure Plus is here: Coach, Trends and extra card themes.

His draft of 2026-11-23 (`docs/design/research/store-listing-draft-1.0.1.md`) has four more
lines that also ship in 1.1.0: the shorter wording, the fine print one tap away, the warm-up
and trivia sliders at 0 to 100%, and "Lock after". Merge them in when he picks the final text.

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
| AI assistant / chatbot | Count the Coach in. Its output carries no sensitive content: no words the person typed reach the model (it reads computed numbers only), and every insight is schema-validated, cites a number from the input and passes the content checks, or is dropped. | Apple asks for AI features to be included when judging how often sensitive content appears. |
| User-generated content, messaging, chat | No | No user-to-user interaction. Shared cards go out through the OS share sheet, which Apple doesn't count as in-app user-generated content. |
| Unrestricted web access | No | The only links open fixed pages (privacy policy, store terms, the support page). |
| Mature or suggestive themes | None | The app shows no such content. |
| Advertising | No | There are no ads. |
| In-app controls (parental controls, age assurance) | **Yes** for age assurance. No parental controls. | The build asks Apple's Declared Age Range API once at every launch, whatever band is stored (since the D70/D71 review, 2026-11-19: the band belongs to the install, not to the Apple Account), and again on a return to the app 24 hours after the last ask while the rule applies or a band of 13 or over is known (`src/age/ageRange.ts`: one ask per launch; a decline stores nothing and keeps a stored band). **The result gates services** (the under-13 rule, D70, 2026-11-19; `docs/design/research/under-13-2026-11.md`): a band that can include someone under 13 makes the app local-only, with no sign-in, backup, usage counts, Coach or RevenueCat, and Plus not offered (`useAgeStore.localOnly`). Apple defines age assurance as a mechanism that confirms an age "meets the age requirement for accessing specific content or services": accounts, backup, the Coach and purchases are those services here, so "Yes" is plainly true of a build that carries D70. A build without it asked and gated nothing (policy audit, 2026-11-14). Counsel is still to be asked about the state acts' duties (`SHIP_READINESS.md` decision 2). |
| Social media; social media disabled under 13 (asked since July 2026, required from September) | No | No feed, profiles, followers or posts. |
| Shared location; dating and relationships (descriptors from 2026-11-16, all apps by 2027-01-12) | No | The app reads no location and matches nobody. |
| Gambling; simulated gambling; contests; loot boxes (asked one by one) | None | No stakes, odds, currency, prizes or chance mechanics. Nobody competes: a friend comparison, if ever built, would change the contests answer. |
| Medical or treatment information | None | The app gives no medical or treatment information, and the Coach's validators drop medical advice and referrals from its output. |

**The owner checks in App Store Connect** (D73, 2026-11-20): whether the review notes ever
carried the paragraph about the Coach's support card, or the age rating an "Infrequent"
answer for it on Mature or suggestive themes or Medical or treatment information. If
either was entered, correct it with the build that removes the card.

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
> On days when nothing comes due, there's daily trivia: three quick
> either-or questions, the same for everyone that day, each with how sure you
> are. Trivia is just for fun and stays apart from your real score.
>
> **GOLD IN HEALTH, BRONZE IN MONEY**
> Calibration isn't one number. Fairly Sure scores you separately for work,
> health, finance, social life, personal goals and any category you add, and
> each earns a badge from Bronze to Platinum. Badges need a real track record, so
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
> **PRIVATE BY DESIGN**
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

Paste-ready for 1.1.0 (3,972 of Apple's 4,000 characters; 3,998 bytes as UTF-8, also under 4,000;
counted by script 2026-11-25, the block between the fences, line breaks included). Since build
7's notes: + is on Today only, a "New in 1.1.0" line (Guideline 2.3.1(a)) that also names
what 1.1.0 removes ("Hide the words", the practice reminder, "Got a friend's card?"; the
review of 2026-11-25, round 3), the "Lock after" clause, and shorter Coach, usage-count and
age lines to make room. The opening was rewritten by
the release gate's policy audit (2026-11-20, Guideline 2.1): the purchase flow is shown
before signing in, since the demo account already has Plus and its Plus screen has no
plans; the reviewer is asked to delete an account of their own, not the demo one; and the
core loop is "Answer it now", since nothing is due on a fresh install. The demo account's
email and password go in App Store Connect's **Sign-In Information** (tick "Sign-in
required"), never in these notes and never in the repo.

```text
Fairly Sure works fully without an account. To try the core loop on a fresh install: log a prediction with + on Today, then tap it and choose Answer it now. A new prediction is due tomorrow at the earliest, and an answer given the day it was logged is kept but not scored, by design. The demo account shows a scored record.

New in 1.1.0: badges read Bronze to Platinum; reminders show only the date and confidence, no words or answer buttons; practice is now Trivia, with no reminder; "Hide the words" and "Got a friend's card?" are gone; "Lock after" (below); first Plus subscriptions.

Fairly Sure Plus: before signing in, open You → Fairly Sure Plus and buy any plan with your sandbox account (Annual offers new subscribers a free month; Restore purchases is on the same screen). The demo account already has Plus, so while signed in to it that screen says "You're on Fairly Sure Plus" instead of the plans.

Coach: sign in with the demo account (You → Sign in; the email and password are under Sign-In Information). It holds 153 answered predictions and has Plus. Turn on You → Coach (AI), then Insights → Get feedback. The Coach needs an account: our server checks Plus per account. Creating an account by email is off for now, so the email form signs in to existing accounts only; Sign in with Apple and Continue with Google also work. Signing out removes the account's predictions from the phone; signing back in brings them back.

Account deletion: You → Delete account (at the bottom, once signed in). Please test it with an account you create with Sign in with Apple, so the demo account stays available.

Notifications are local reminders only; no push server is involved.

The Coach sends only computed statistics (counts, scores and percentages), never the user's text or account id, to OpenAI through our server, and only after the user turns it on in You → Coach (AI), which says a third-party AI service writes the feedback (the privacy policy names OpenAI). Sign in with Apple asks for the email only. Continue with Google sits below Sign in with Apple; it opens Google in the system sign-in sheet (no Google SDK is in the app), and our database removes the name and picture Google sends as they arrive.

At each launch, after the first screen appears, the app asks Apple's Declared Age Range API for an age band. Declining changes nothing. If the band includes ages under 13, the app keeps everything on the phone: no sign-in, backup, usage counts or Coach, and Plus isn't offered; You explains it under "Kept on this phone". Until Apple has answered at a launch with no band stored, sign-in ("Sign-in isn't ready yet. Try again in a moment.") and the Plus plans wait. To see it, set the device's Sandbox Apple Account to Under 13 (Settings → Developer → Sandbox Apple Account → Manage → Age Assurance), then, signed out, You → Erase your data on this phone if a band was already shared, and relaunch.

Usage counts: before any is sent from a phone without an account, the Warm-up's first screen says "Fairly Sure sends a few usage counts, with no account or device id, to see how the app is used. You can turn this off here or in You." with a switch (also in You → Usage stats). On a phone set to Canada the switch starts off and the line says so. The sign-in screen says what goes with an account, with the same switch.

Optional app lock: You → Lock with Face ID (named for the phone's unlock method; off by default). "Lock after", under it, is 5 minutes by default; set it to Immediately to see the lock at once. It uses LocalAuthentication with LAPolicy.deviceOwnerAuthentication, so the device passcode is always offered as the alternative to Face ID. The app never receives biometric data or the passcode, only whether the check passed and which unlock methods the phone has set up, to name the switch.

There is no gambling, no stakes and no currency. Predictions are private notes about the user's own life ("I'll finish the report by Friday").
```

**What the lines rest on.** The Google sentence holds: `auth.audit_log_entries` read 0
rows on the live database on 2026-11-20 (read-only), consistent with the audit-log setting
off and the table purged. As written 2026-11-18: "our database removes the name and
picture Google sends as they arrive" is true only once the owner has turned off Supabase's
Authentication → Configuration → Audit Logs → "Write audit logs to the database" and
purged `auth.audit_log_entries`; until then each sign-in keeps the Google name there
(`docs/APP_PRIVACY.md`, the Name row). If those steps aren't done, end the sentence at "(no
Google SDK is in the app)." The age-range lines follow `src/age/ageRange.ts` (one ask per
process, whatever band is stored, since the D70/D71 review of 2026-11-19; nothing stored
on a decline); whether iOS shows its sheet again, after a decline or for a band already
shared, is iOS's decision, so say "asks", not "shows". The under-13 lines hold only for a
build that carries D70 and the D70/D71 review's fixes (2026-11-19) and quote
`LOCAL_ONLY_GUEST_ROW` ("Kept on this phone", `src/components/age/localOnlyCopy.ts`),
`AGE_PENDING_SIGN_IN` (`src/supabase/auth.ts`) and the paywall's no-plans line
(`noPlansText`, `src/components/paywall/paywallCopy.ts`: "Plus plans couldn't load. Check
your connection, then open this again."). The wait matters to a reviewer: on a fresh
install a sign-in tapped while Apple's sheet is still unanswered is refused for the
moment, and works once the sheet is answered or declined. If a request to Apple can stay
unresolved on a review device, sign-in and the plans stay unavailable for that run
(`docs/design/research/under-13-2026-11.md`, "What only the iPhone can show"); check D4 on
the owner's iPhone before submitting. The sandbox path is from
`docs/design/research/under-13-2026-11.md` ("What only the iPhone can show": it needs
Developer Mode, a Sandbox Apple Account and iOS 26.2 or later); confirm it on the owner's
iPhone (`HUMAN_VERIFICATION.md` D4) before pasting, and leave the last sentence out if it
doesn't hold. Erase clears the stored band, so the relaunch asks Apple again. The usage-count lines (2026-11-19) quote
`WARMUP_USAGE_NOTE` (`src/components/warmup/UsageStatsNotice.tsx`) and hold only for a
build that carries round 5 (commit `7b5b0ea`, which saves the "notice shown" stamp; the
privacy policy's working notes, `PRIVACY_POLICY.notes.md`, step 8); the words "to see how the app is used" only for one that
carries round 7 (2026-11-19, the policy re-audit's L1); check the quote against that build. The sign-in and sign-out lines hold from the
same build (`EMAIL_SIGN_UP_ENABLED = false`, D69 (a) and (c)); "with the same switch" only
from the build that carries D71 (d) (`UsageStatsSwitch` on the sign-in screen).

**Give the demo account Plus before review** (the policy audit, 2026-11-14): right
after a sandbox purchase the server may not have the entitlement yet, and the
reviewer would see "Coach couldn't confirm your Plus subscription yet" (since step
189 the Coach asks RevenueCat itself then, so this should be rare). Seed the account, grant it
Plus in RevenueCat (a promotional entitlement), and tell the reviewer to look at
the purchase flow signed out (the notes above now do). From the release gate's policy
audit, 2026-11-20: create the user email-confirmed (the app's sign-up is hidden and no
mail is sent); sign in once on a phone first so RevenueCat has the customer; make the
grant **Lifetime** (a timed grant reads as a monthly subscription, which shows the
subscription warning on Delete account and could lapse during review); then make one
Coach request as that user. The server reads its `entitlements` row and, failing that,
asks RevenueCat for the account's active entitlements; that a promotional grant shows up
there was not confirmed from the repo. The Coach allows 25 requests a day per account.

**Why the demo account matters:** a reviewer on a fresh install has no resolved
predictions. The Coach then says it needs a scored answer first, and Insights shows
only progress. Both are correct, and both look like broken features to someone
with ten minutes. Seed a demo account with `node scripts/seed-demo-sql.mjs <user-uuid>` (153 resolved
predictions; paste the output into the Supabase SQL editor, and re-run it shortly
before submitting, since dates are relative to the run) and put its credentials in
App Store Connect, **not** in the repo.

---

## 5. Screenshots

**Spec, as App Store Connect showed it to the owner on 2026-11-20:** the iPhone slot is
"iPhone with Dynamic Island (medium display)", 6.1" or 6.3": **1206 × 2622** or
1179 × 2556 px portrait, 1–10 images; there was no 6.9-inch slot (the 1320 × 2868
requirement this section carried until then was out of date). Other slots listed: iPhone
Duo, iPad 13" and Apple Watch; `supportsTablet: false`, so no iPad set, and whether iPhone
Duo is required wasn't shown. App previews (video) are optional. **Header and Search
Results assets** (new 2026-10-05, iOS 27 and later; one 5244 × 2950 PNG can serve both,
with safe areas) are optional by third-party guides, not confirmed on Apple's page; none
made for launch.

**The set made 2026-11-20** (git-ignored, `screenshots/store/`): six web captures with
the demo data, each in a drawn iPhone with a status bar under a caption, on the app's
background and typeface. `final-1206/` is the upload set (1206 × 2622), `final/` the same
at 1320 × 2868; `frame/index.html` and `frame/shots.js` re-render them
(`?shot=<name>`, `&size=1206`) from the `cap-*.png` captures. Order and captions:
Today "Know when to trust your gut"; curve "See exactly where you’re overconfident";
Log "Say how sure you are. Find out later." (due "In a week", so the title's Friday and the
date agree); badges "Badges need a real track record" (the gate's audits failed "Badges you
can’t luck into": luck can still clear a bar about 1 time in 10); share
card "Gold in health. Bronze in finance." (captured before D80 as "Sharp in health.
Tracker in finance.": the share card needs a new capture for 1.1.0); year "Your year in predictions". They are
web renders: no SF Symbols or glass. The table and "How" below are the earlier plan.

**For 1.1.0, all six need a retake** (the `final-1206/` images, read
2026-11-25): `01-today` has the old tier names ("Sharp in health", "Tracker in finance"),
the "Today's practice" row and the old date words ("due Wed, Nov 18"); `03-log` the old
date words ("Due Friday, Nov 27", "Save, due Fri, Nov 27"); `04-badges` the old tier names
and the "+" on Insights; `05-card` the old tier names and the old card footer ("What are you
sharp at?"); `06-year` "New this year: Sharp in health." and the old footer; `02-curve` the
"+" on Insights (gone since D79), the chart's caption in full (behind "How to read this
chart" since D76) and the old subtitle wording ("Of 61 things you called 80–100% likely, 40
happened.").

The order matters. Most people see only the first three.

| # | Screen | Caption (short, large type) |
|---|---|---|
| 1 | **Identity card** (Share → Card) | **Gold in health. Bronze in money.** |
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
  itself, or a badge going from Bronze to Gold.
- Launch and social visuals for the "Gold in health · Bronze in money" idea.

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
