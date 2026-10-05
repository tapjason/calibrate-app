# Calibrate — Future UI Features

**As of:** 2026-10-04 (A1, A3, A5, A6 and two §B items moved to `UI_ROADMAP.md` §1.1). A parking lot, not a plan. [`UI_ROADMAP.md`](UI_ROADMAP.md) is
what's being built now. Nothing here is scheduled, and anything that changes product
behaviour needs the owner's call first. `CLAUDE.md` still governs every item:
shareable artifacts are never paywalled, no number built on noise (min-N), AI stays
out of the critical path, and the UI never does calibration math (that lives in
`src/engine/`).

Size: **S** ≈ a day, **M** ≈ a few days, **L** = needs a new table, the backend or
a native build.

---

## A. New features

| # | Feature | Size | Needs first |
|---|---|---|---|
| A1 | Track record on the Log slider | S–M | **Moved to UI_ROADMAP §1.1 (step 19), 2026-10-04** |
| A2 | Daily drill | M | A question bank; fits with D2 (streak unit) |
| A3 | Resolve several at once | M | **Moved to UI_ROADMAP §1.1 (step 18), 2026-10-04** |
| A4 | Repeating predictions | L | Schema change |
| A5 | Personal correction table | M | **Moved to UI_ROADMAP §1.1 (step 20), 2026-10-04** |
| A6 | Calibration by time horizon | S–M | **Moved to UI_ROADMAP §1.1 (step 21), 2026-10-04** |
| A7 | Changing your confidence before the due date | L | Schema change; scoring rule |
| A8 | Web Warmup as the share-card landing page | M | Hosting (GitHub Pages) |
| A9 | Predict the same event with a friend | L | Backend, invites |
| A10 | Widgets and a Siri Shortcut | L (the Shortcut drops to M on SDK 58) | EAS build; SDK 58 for `expo-app-intents` |

### A2. Daily drill
One estimation question a day with the same confidence control, stored separately
like the Warmup and **never** mixed into `UserStat`/`CategoryStat`. Real predictions
resolve when they come due, which the user doesn't control, so this gives a reason to
open the app every day.
- Needs a bank of ~200+ two-choice questions with sourced facts (the Warmup ships
  10 in `warmupQuestions.ts`).
- A rolling "drill calibration" mini-chart could sit on Stats, labelled as practice.
- Interacts with **D2**: if the visible streak becomes weekly, a drill could count
  toward it.

### A4. Repeating predictions
"Gym 3× this week", weekly. Each instance is its own prediction with its own
confidence (prefilled from last time, editable), so the engine is unchanged. Volume
per category goes up, so categories reach `MIN_N_CATEGORY` sooner.
- Needs a `recurrences` table plus a scheduler that creates the next instance on
  resolve (L2/L4), and notification scheduling for each instance.

### A7. Changing your confidence before the due date
"I said 70% on Monday; by Wednesday it's 90%." Show the revision history on Resolve.
**The score stays on the first stated number** so it can't be gamed. A later Plus view
could show whether updating helped.
- Schema change (a `revisions` table). The scoring rule needs to be written into
  `CLAUDE.md` before any code.

### A8. Web Warmup as the share-card landing page
The share card's "get your own" hook links to a web Warmup: 60 seconds in the
browser, no install, ending in an App Store link. The web build already runs the
Warmup. This is the shortest path from a shared card to a new user.
- Hosting: the GitHub Pages switch already planned for the privacy policy.
- No account and no sync on web. Warmup results stay in the browser.
- Needs a store link and a decision on whether web visitors are counted (item 2.3, the
  anonymous-funnel question in `docs/NEXT_STEPS.md`).

### A9. Predict the same event with a friend
Two people put their confidence on one yes/no event via an invite link, and compare
once it resolves. It's a second way for the app to spread beyond the share card.
- Backend (shared prediction rows, RLS by participant), invites, and abuse limits.
  Not before sync has real users.
- Keep it to *calibration* ("you were both 70%; it happened"), not a winner/loser
  leaderboard. That would reward correctness, not calibration.

### A10. Widgets and a Siri Shortcut
A Home or Lock Screen widget ("3 ready to resolve", or the identity line once a
category unlocks), and an App Intent for "Log a prediction".
- Needs a native target and an EAS build. Not testable in Expo Go (iPhone-only
  setup).
- Revisit after **D5** (SDK upgrade). SDK 58 (beta 2026-09-15) adds
  `expo-app-intents`, which exposes Siri, Shortcuts, Spotlight and Apple
  Intelligence intents from JavaScript, so "Log a prediction" no longer needs
  hand-written Swift. Widgets still need a native target.

---

## B. Polish deferred from the roadmap

| Item | Where it came from | Why deferred |
|---|---|---|
| Progress **ring** instead of the bar on Home/Stats | Roadmap step 4 | Optional. The bar reads fine. |
| 👍 / 👎 on Coach cards | DESIGN_SYSTEM §7.13 | Only once there's an analytics event to receive it. |
| Guard the web build's browser Back against losing a typed reflection | Roadmap step 11 | React Navigation's prevent-remove doesn't see the browser's own Back. Native ships, so web is low priority. |

Moved to `UI_ROADMAP.md` §1.1 on 2026-10-04: the tier-up confetti and emblem
flip (step 17) and the chart-label halo (step 16).

Decisions **D1–D10** in `UI_ROADMAP.md` §2 (typeface, weekly streak, four tabs, honesty
bands, SDK, milestone cards, dark mode, resolving from a notification, reminder time,
what Skip means) are not repeated here. They're ready to build once decided.
