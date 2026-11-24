# Store listing draft for 1.0.1 (2026-11-23)

A draft in the voice the owner approved on 2026-11-23 (`voice-sample-sheet-2026-11-23.md`). Not
entered anywhere: `docs/APP_STORE_LISTING.md` stays the record of what is live until he approves
this and it goes in with the 1.0.1 version. No new claim is made; every sentence restates one the
live description already makes, and the subscription paragraph and the two links (Guideline 3.1.2)
are unchanged. The practice line doesn't say practice improves anything (`CLAUDE.md` §9).

## Description [4000]: 2261 characters, 398 words (live: 3065 characters, 529 words)

> Most of us are too sure about some things and too cautious about others, and never find out which. Fairly Sure shows you.
> 
> HOW IT WORKS
> Write down something you think will happen ("I'll finish the report by Friday"). Say how sure you are. When the day comes, Fairly Sure reminds you. Tap yes or no. That's it.
> 
> Keep going for a few weeks and the pattern shows. If you say 80%, about 8 in 10 should come true. Your chart shows where you're on the mark, where you're too sure, and where you sell yourself short.
> 
> TRY IT IN A MINUTE
> A ten-question warm-up gives you a first look on day one. After that, three quick practice questions a day give you something to do while your own predictions come due.
> 
> SHARP IN HEALTH, SHAKY WITH MONEY?
> You get a separate score and badge for work, health, finance, social life, personal goals and any category you add. Badges take a real track record, so a lucky run is unlikely to earn one.
> 
> BUILT TO BE HONEST
> • It isn't about being right. A miss at 60% is what 60% means.
> • No score until there's enough to go on.
> • An answer given the day you logged it isn't scored, so sure things are harder to pad with.
> • No money, no odds, no betting. Just your own track record.
> 
> YOURS, AND PRIVATE
> The whole free app works offline, with no account. No ads, no tracking. Sign in only if you want a backup or the Coach. Lock it with Face ID or your passcode if you share your phone (you choose how soon it locks). Share a card of your results any time. Sharing is always free.
> 
> FAIRLY SURE PLUS
> Optional, for going deeper:
> • Coach: short AI notes on your own numbers. It sees your statistics, never what you wrote.
> • Trends: your calibration month by month and category by category.
> • Extra card themes.
> (Exporting your own predictions as CSV is free.)
> 
> Plus is available monthly, annually (with a one-month free trial for new subscribers), or as a one-time lifetime purchase. The trial converts to a paid annual subscription unless you cancel at least 24 hours before it ends. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period, and you can manage them in your App Store account settings.
> 
> Privacy policy: https://tapjason.github.io/calibrate-app/privacy/
> Terms of use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

Left out on purpose: the Brier score bullet (fine print in the app too), the track-record line
while setting a number, "the same for everyone that day", the list of Trends' contents.

## Promotional text [170]: 150 characters. Can be pasted at any time, no review.

> Write down what you think will happen and how sure you are. Then find out if you were right to be. Sharp in health, shaky with money? Now you'll know.

## What's New in 1.0.1 [4000]

> • Simpler, friendlier wording, and a lot less of it.
> • The fine print behind your score now sits one tap away.
> • The warm-up and practice sliders now run from 0 to 100%.
> • App lock: choose how long you can be away before it locks (5 minutes to start, for everyone who had it on; choose Immediately in You to lock every time).

The slider line stays only if that change ships in the build submitted.

## Review notes: two additions owed before submission (Guideline 2.3.1 a)

The notes in `docs/APP_STORE_LISTING.md` §4 are still build 7's (3,833 of 4,000 bytes). These two
additions come to about 400 bytes, so about 240 have to come out of the current text first.

> (after the app-lock paragraph's first sentence) "Lock after" under the switch sets how long the app can be away before it locks: Immediately, 1, 5 or 15 minutes (5 by default). Choose Immediately to see it lock at once.

> New in this version: "Lock after"; the Warm-up and practice confidence control now runs 0–100% (it starts empty, and Next waits for a number); shorter wording, with the score's explanations under Insights → "What does this mean?".

Without the first, a reviewer who turns the lock on and returns within 5 minutes sees no lock.
The demo account's re-seed is owed at the same time.

## Unchanged

Name, subtitle ("Know when to trust your gut") and keywords.

## Screenshots to retake with the version (Guideline 2.3)

Of the six uploaded (`screenshots/store/final-1206/`), four show wording that changed or text that
is now folded: `02-curve` (the chart's subtitle, and the key now behind "How to read this chart"),
`04-badges` (the furthest-off line now shows its first sentence), `03-log` (the track-record line)
and `01-today` (the practice row). `05-card` and `06-year` are unchanged. Retake once the build is
final. (Found by the policy audit of 2026-11-23.)

The description, the promotional text and What's New took four small changes from that audit:
"finance" for "money" in the category list, "for new subscribers" on the free month, and the lock's
"you choose how soon it locks" and "choose Immediately in You to lock every time".
