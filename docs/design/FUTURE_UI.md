# Calibrate — Future UI Features

**As of:** 2026-10-07. A1, A3, A5, A6, A4's one-tap half ("Log it again") and most of §B shipped as build-log steps 16–26, and A2 as step 88 (with its reminder, step 89); `UI_ROADMAP.md` §1.1 lists what each remaining item waits on. A parking lot, not a plan. [`UI_ROADMAP.md`](UI_ROADMAP.md) is
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
| A1 | Track record on the Log slider | S–M | **Shipped 2026-10-04** (roadmap step 19) |
| A2 | Daily drill | M | **Shipped 2026-10-07** as daily practice (roadmap steps 88–89) |
| A3 | Resolve several at once | M | **Shipped 2026-10-04** (roadmap step 18) |
| A4 | Repeating predictions | L | Schema change. Its one-tap half, "Log it again", **shipped 2026-10-04** (roadmap step 22) |
| A5 | Personal correction table | M | **Shipped 2026-10-04** (roadmap step 20) |
| A6 | Calibration by time horizon | S–M | **Shipped 2026-10-04** (roadmap step 21) |
| A7 | Changing your confidence before the due date | L | Schema change; scoring rule |
| A8 | Web Warmup as the share-card landing page | M | Hosting (GitHub Pages) |
| A9 | Predict the same event with a friend | L | Backend, invites |
| A10 | Widgets and a Siri Shortcut | L (the Shortcut drops to M on SDK 58) | EAS build; SDK 58 for `expo-app-intents` |
| A11 | Today's three as a share card | S–M | A scope call, like D6 |

### A2. Daily drill (shipped 2026-10-07 as daily practice, roadmap steps 88–89)
What shipped differs from the sketch below: three questions a day rather than one,
generated from reference tables rather than a written bank (so there was no ~200-item
fact-check), the same for everyone on the same day, and no streak credit (the streak
stays about real predictions). The sketch, as parked:

One estimation question a day with the same confidence control, stored separately
like the Warmup and **never** mixed into `UserStat`/`CategoryStat`. Real predictions
resolve when they come due, which the user doesn't control, so this gives a reason to
open the app every day.
- Needs a bank of ~200+ two-choice questions with sourced facts. (As built: reference
  tables, `src/constants/practiceFacts.ts`, rather than a written bank.)
- A rolling "drill calibration" mini-chart could sit on Stats, labelled as practice.
- Interacts with **D2**: if the visible streak becomes weekly, a drill could count
  toward it.
- The same bank, if sampled representatively rather than picked to be tricky, would
  let the Warmup draw its ten at random: option (c) of **D14**, so the Day-0 verdict
  describes the person, not the question selection (`research/confidence-2026-10.md`
  §3). Done: the Warmup draws from the practice tables (steps 97 and 106).

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

### A11. Today's three as a share card
Everyone answers the same three on the same day, which is what made Wordle's grid
travel ("it's one puzzle, and everybody is solving it"). A small card: the date, three
marks (filled for right, hollow for a miss, as the answer key draws them) and the
confidence beside each, with no answers on it, so it spoils nothing for someone who
hasn't played yet.
- A new share surface, so a scope call like D6. Free, like every shareable.
- Reward calibration, not correctness: lead with "said 80% · got 2 of 3" rather than
  a score, and never a streak of right answers.

---

## B. Polish deferred from the roadmap

| Item | Where it came from | Why deferred |
|---|---|---|
| Progress **ring** instead of the bar on Home/Stats | Roadmap step 4 | Optional. The bar reads fine. |
| 👍 / 👎 on Coach cards | DESIGN_SYSTEM §7.13 | Only once there's an analytics event to receive it. |
| **Streak checkpoint celebration** (B1 below) | Owner, 2026-10-06, with step 64 | Kept out of scope on purpose: the checkpoints ship with a static acknowledgement first. |

### B1. Streak checkpoint celebration (planned, not built)
Checkpoints are 7, 30, 100 and 365 days, then each further year (`STREAK_CHECKPOINTS`
in `src/types`). Step 64 marks them without motion: the tinted streak row on Home and
the still `StreakCheckpointCard` on the answer that earned it. The celebration that
goes on top, as proposed:
- **Motion:** the card or row scales in on the milestone spring (MilestoneCard's
  damping 14 / stiffness 180), the day count counts up from yesterday's (6 → 7,
  `CountUp`), and the flame bounces once (`flame.fill` with the SF Symbols bounce
  effect on iOS; a 1.0 → 1.15 → 1.0 scale elsewhere). Reduce Motion: a 200 ms
  cross-fade, no count-up, haptic still fires (§6.1 `reduced`).
- **Escalation:** confetti from the emblem only at 100 and 365 and the yearly ones; 7
  and 30 stay without it, so the burst keeps meaning something.
- **Haptic, needs a call:** DESIGN_SYSTEM §6.2 keeps `notificationAsync(Success)` for
  unlocks and tier-ups. Either checkpoints join them as a fourth full moment, or they
  take `impactAsync(Rigid)`, the `reveal` haptic. Recommendation: Rigid for 7 and 30,
  Success from 100.
- **Both paths:** a log can reach a checkpoint as well as an answer, and the Log
  screen goes straight back to Home. So the trigger is `predictionStore
  .streakCheckpoint`, which `resolve` sets today; `create` has to set it too, and Home
  plays it once when it arrives from Log.
- **Once each:** a relaunch the same day must not replay it. Keep the last celebrated
  checkpoint in the settings table and compare.
- **Never:** nothing animates when a streak ends, and notifications still never
  mention the streak (§7.15).
- **Share:** 100 and 365 are candidates for D6's milestone share cards.
- **Evidence (2026-10-06):** fun, satisfying, delight and haptics are the most
  lopsided praise in 8,057 reviews of 4.7+ apps (5.9% of five-star reviews, 0.9% of
  one- and two-star), and two thirds of it goes to apps with a character or a
  completion that feels physical (`research/elements-2026-10.md` §1.2). A reason to
  build this once a device is available, not a reason to build it blind.
- Size S–M. Needs the haptic call and a device build (60 fps, haptic timing), like
  step 17's tier-up flip.

---

## D. Platform features (researched 2026-10-05)

Details and sources in [`research/platform-2026-10.md`](research/platform-2026-10.md).
All need a development build; none run in Expo Go or on the web build.

| # | Feature | Size | Needs first |
|---|---|---|---|
| P1 | Home and Lock Screen widgets: "2 ready to resolve · next due Tue", and the identity line | M | SDK 56+ (`expo-widgets` stable there; NEXT_STEPS j) |
| P2 | Private on-device Coach on Apple Foundation Models, server Coach as fallback; same grounding validator | M | Decision D11; iOS 26 + Apple Intelligence device; a community bridge (`@react-native-ai/apple`) |
| P3 | Siri and Shortcuts: "Log a prediction" (opens Log with the title filled in), "What's my calibration?" | M | SDK 58 (`expo-app-intents`, alpha) |
| P4 | A native SwiftUI Gauge for the rating | S | SDK 56+ `@expo/ui`; keep the current bar on web |

Not recommended: Live Activities (predictions resolve on a day scale) and resolving
from an interactive widget (Resolve must show the stated confidence first, and the
widget extension can't write to the app's database).

---

## C. From the 2026-10-05 review (need the owner)

| Item | Why it waits |
|---|---|
| A category's own page (its curve, its predictions, its badge path) from the Stats badge list | Trends' upsell already sells "drills into each category" as Plus. A free category page would give that away; a Plus one is a scope call. |
| Retake the Warmup from Settings | It overwrites the stored result and the first share card, and changes what the Warmup is for (Day 0 only, or a repeatable check). A product call. |

---

Moved to `UI_ROADMAP.md` on 2026-10-04 and shipped the same day: the tier-up
confetti and emblem flip (step 17) and the chart-label halo (step 16). The web
Back guard moved as step 23.

Decisions in `UI_ROADMAP.md` §2 are not repeated here. Still open as of 2026-10-09:
D5 (SDK 58), D6 (milestone cards), D8 (resolve from the notification), D11 (on-device
Coach) and D12 (widgets). From the 2026-10-09 layout pass, two optional ones without a
number yet: Insights repeats Today's 92 as its own hero, and History's cards fit three
to a screen (a denser row would show six).
