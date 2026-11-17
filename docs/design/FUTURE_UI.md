# Fairly Sure — Future UI Features

**As of:** 2026-11-16. A parking lot, not a plan. A1, A2, A3, A5, A6 and A4's one-tap half
("Log it again") are built (the build-log steps below); [`UI_ROADMAP.md`](UI_ROADMAP.md) §1
lists what each remaining item waits on, and [`BUILT_LOG.md`](BUILT_LOG.md) holds what has
been built. Nothing here is scheduled, and anything that changes product
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
| A1 | Track record on the Log slider | — | **Built:** step 19 (2026-10-04); from 5 scored answers since D57 (step 170) |
| A2 | Daily drill | — | **Built** as daily practice: steps 88–89 (2026-10-07) |
| A3 | Resolve several at once | — | **Built:** step 18 (2026-10-04) |
| A4 | Repeating predictions | L | Schema change. Its one-tap half, "Log it again", is **built** (step 22; on History's details and naming its date since D56, step 169) |
| A5 | Personal correction table | — | **Built:** step 20 (2026-10-04, Plus) |
| A6 | Calibration by time horizon | — | **Built:** step 21 (2026-10-04, Plus) |
| A7 | Changing your confidence before the due date | L | Schema change; scoring rule |
| A8 | Web Warmup as the share-card landing page | M | Whether web visitors are counted |
| A9 | Predict the same event with a friend, and friend streaks (cooperative only, D44) | L | Backend, invites, guideline 1.2 |
| A10 | Widgets and a Siri Shortcut | L (the Shortcut drops to M on SDK 58) | The SDK 58 upgrade (D5): `expo-app-intents` for the Shortcut |
| A11 | Today's three as a share card | S–M | A scope call, like D6 |

### A2. Daily drill
Built as daily practice (steps 88–89; `CLAUDE.md`, Daily practice): three questions a day
from reference tables (`src/constants/practiceFacts.ts`), the same for everyone on the same
day, stored apart from the real record and never counted toward the streak. The Warmup draws
its ten from the same tables (D14 (c), steps 97 and 106).

### A4. Repeating predictions
"Gym 3× this week", weekly. Each instance is its own prediction with its own
confidence (prefilled from last time, editable), so the engine is unchanged. Volume
per category goes up, so categories reach `MIN_N_CATEGORY` sooner.
- Needs a `recurrences` table plus a scheduler that creates the next instance on
  resolve (L2/L4), and notification scheduling for each instance.
- The prefilled confidence would go against what "Log it again" decided (step 22: the
  number never carries over, so the new one isn't anchored on the old); settle that first.

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
- Hosting: GitHub Pages is on (it serves the privacy and support pages), and the store
  link exists (`APP_STORE_ID`).
- No account and no sync on web. Warmup results stay in the browser.
- Needs a decision on whether web visitors are counted: D43 counts a guest's funnel
  events in the app, not on the web.

### A9. Predict the same event with a friend
Two people put their confidence on one yes/no event via an invite link, and compare
once it resolves. It's a second way for the app to spread beyond the share card.
- Backend (shared prediction rows, RLS by participant), invites, and abuse limits.
  Not before sync has real users.
- Keep it to *calibration* ("you were both 70%; it happened"), not a winner/loser
  leaderboard. That would reward correctness, not calibration.
- **Cooperative only** (decided 2026-11-03, roadmap D44). The owner wants this and
  friend streaks as add-ons after v1, with no competition at all: no head-to-head
  score, not even a Brier comparison on the shared event, no group table, no
  leaderboard. People choose and answer their own predictions, so points between
  people reward gaming; a shared event is still answered by one side.
- **Friend streaks** go with it: two friends who each log or answer something on
  a day keep a shared count, with the same rest days as the streak. Evidence
  (correlational): `docs/design/research/retention-2026-10.md` §2.6.
- Showing one person's prediction text to another is user-generated content
  under App Store guideline 1.2: a filter, report and block, and a contact, and
  the age rating, `APP_PRIVACY.md` and the policy change with it. A friend needs
  an account. Invite links need the domain and associated domains.

### A10. Widgets and a Siri Shortcut
A Home or Lock Screen widget ("3 ready to resolve", or the identity line once a
category unlocks), and an App Intent for "Log a prediction".
- Needs a native target and a new build (the app is on SDK 55).
- Comes after **D5**, the upgrade straight to SDK 58. SDK 58 adds
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
| Progress **ring** instead of the bar on Today and Insights | Roadmap step 4 | Optional. The bar reads fine. |
| 👍 / 👎 on Coach cards | DESIGN_SYSTEM §7.13 | Only once there's an analytics event to receive it. |
| **Streak checkpoint celebration** (B1 below) | Owner, 2026-10-06, with step 64 | Kept out of scope on purpose: the checkpoints ship with a static acknowledgement first. |

### B1. Streak checkpoint celebration (planned, not built)
Checkpoints are 7, 30, 100 and 365 days, then each further year (`STREAK_CHECKPOINTS`
in `src/types`). Step 64 marks them without motion: the tinted streak row on Today and
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
  sheet goes straight back to Today. So the trigger is `predictionStore
  .streakCheckpoint`, which `resolve` sets today; `create` has to set it too, and Today
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
  build this with the iPhone in hand, not a reason to build it blind.
- Size S–M. Needs the haptic call and a check on the iPhone (60 fps, haptic timing),
  like step 17's tier-up flip.

---

## D. Platform features (researched 2026-10-05)

Details and sources in [`research/platform-2026-10.md`](research/platform-2026-10.md).
All need a development build; none run on the web build.

| # | Feature | Size | Needs first |
|---|---|---|---|
| P1 | Home and Lock Screen widgets: "2 ready to resolve · next due Tue", and the identity line | M | The SDK 58 upgrade (D5; `expo-widgets` is stable from SDK 56) |
| P2 | Private on-device Coach on Apple Foundation Models, server Coach as fallback; same grounding validator | M | Decision D11; iOS 26 + Apple Intelligence device; a community bridge (`@react-native-ai/apple`) |
| P3 | Siri and Shortcuts: "Log a prediction" (opens Log with the title filled in), "What's my calibration?" | M | SDK 58 (`expo-app-intents`, alpha) |
| P4 | A native SwiftUI Gauge for the rating | S | The SDK 58 upgrade (`@expo/ui`, stable from SDK 56); keep the current bar on web |

Not recommended: Live Activities (predictions resolve on a day scale) and resolving
from an interactive widget (Resolve must show the stated confidence first, and the
widget extension can't write to the app's database).

---

## C. From the 2026-10-05 review (need the owner)

| Item | Why it waits |
|---|---|
| A category's own page (its curve, its predictions, its badge path) from Insights' badge list | Trends' upsell already sells "drills into each category" as Plus. A free category page would give that away; a Plus one is a scope call. |
| Retake the Warmup from You | It overwrites the stored result and the first share card, and changes what the Warmup is for (Day 0 only, or a repeatable check). A product call. |

---

Decisions in `UI_ROADMAP.md` §2 are not repeated here. Still open: D5 (SDK 58), D6
(milestone cards), D11 (on-device Coach) and D12 (widgets). D8 (resolve from the
notification) was built as step 145. From the 2026-10-09 layout pass, one optional
change without a number yet: Insights repeats Today's rating as its own hero. (Its
other one, History's cards three to a screen, went with D33's rows, DESIGN_SYSTEM §7.11.)
Open work outside the design files is in `docs/SHIP_READINESS.md`, "Open work".
