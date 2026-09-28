> **Raw research, 2026-09-28.** Second round, covering the surfaces the first round
> (market, libraries, visual-language) left out. Kept for its sources and reasoning. The
> decisions drawn from it live in [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) §7.10–§7.15
> and [`../UI_ROADMAP.md`](../UI_ROADMAP.md); where they differ, those files win.

# Calibrate: the everyday surfaces — Resolve, notifications, Coach, Wrapped, Log, dark mode

Research date: 2026-09-28. Method: an audit of the current components against
DESIGN_SYSTEM.md's non-negotiables, then primary sources for each gap (Apple HIG pages
read as their JSON-rendered text, the installed `expo-notifications` 55.0.23 type
definitions, the Expo docs, Google PAIR). Contrast ratios computed with the WCAG 2.x
formula. Code references are to the tree at `e67b9d1`.

The first round designed the *showcase* surfaces (score, chart, badges, share card,
paywall, Warmup). The surfaces people touch every week — the resolve prompt, the
reminder that leads to it, the prediction card, the Log form's other fields, the Coach
and Wrapped panels — had no patterns. That is where most of the findings below are.

---

## 1. Audit: what the current code does against the design rules

| # | Where | What it does | Rule it breaks |
|---|---|---|---|
| A1 | `ResolvePrompt.tsx` | **No** is `variant="danger"` (red); Yes is the primary fill. | Non-negotiable 4: Yes and No look and feel identical; red never appears for an outcome. HIG Buttons also reserves red for *destructive* actions, and a No is not one. |
| A2 | `ResolvePrompt.tsx` | Yes / No / **Skip** are three equal buttons in one row. | Skip is not a peer outcome: it removes the prediction from scoring. Equal weight makes dodging a miss as easy as recording it (see §2.3). |
| A3 | `ResolvePrompt.tsx` | Confidence appears only in a small grey ALL-CAPS eyebrow ("WORK · 70%"). There's no question and no date logged. | The stated confidence is the thing being tested; it should be read *before* answering (hindsight bias, §2.2). ALL-CAPS labels are banned (§7.9). |
| A4 | `PredictionCard.tsx` | Overdue cards turn amber (`#fffbeb` / `#b45309`) with an "Overdue" label. Status reads "Yes ✓" / "No ✗". | No-guilt principle: a prediction coming due is not the user's lapse. Glyphs ✓/✗ are the green/red idiom in disguise; DESIGN_SYSTEM §2.4 specifies neutral ink `checkmark.circle.fill` / `xmark.circle`. |
| A5 | `digest.ts` `buildBody` | With zero open predictions: "log one to keep your streak going." | **Factually wrong.** `engine/streak.ts` counts days with a yes/no *resolution*; logging never extends it, and with nothing open it cannot be extended this week at all. It is also the streak-guilt copy the research warned against. |
| A6 | `scheduler.ts` + `LogPredictionForm.tsx` | Due presets are anchored at **12:00 local**, and the reminder fires at `due_date`, so "Did it happen?" arrives at noon on the due day. | For "I'll finish the report by Friday", noon Friday is before the outcome exists. Asking early invites a guess, or a dismissal the user then forgets (HIG: don't send repeat notifications for the same thing, so there's one shot). |
| A7 | `scheduler.ts` | Body = the prediction title, verbatim; no preview placeholder. | HIG Notifications: avoid sensitive or personal information and provide generic text for hidden previews. Titles can be health or money things. |
| A8 | `LogPredictionForm.tsx` | Due date is three chips (tomorrow, +1 week, +1 month); no other date is possible. | Minimal friction is right, but a prediction due in 3 days or at a quarter-end has no honest option. |
| A9 | `CoachPanel.tsx` | Insight cards show category (grey caps), message, suggestion. `CoachInsight.evidence` is validated but **never shown**. No way to dismiss or rate. | HIG Generative AI: keep people in control, let them dismiss and give feedback. PAIR: show what data an output rests on. COACH_AGENT.md makes the evidence number the grounding contract; hiding it throws away the receipt. |
| A10 | `wrappedCopy.ts` + `engine/wrapped.ts` | The weekly recap's verdict is gated on `MIN_N_OVERALL` (20) resolutions **in the window**. | Correct gating, but almost nobody resolves 20 things in a week, so the weekly Wrapped will essentially always say "N more resolutions and this window earns a calibration read." The weekly surface needs a story that doesn't depend on a verdict (§5). |
| A11 | `TrendsPanel.tsx`, `CoachPanel.tsx` | Two separate grey "See Plus" blocks on Stats. | Already in the roadmap (baseline 05); listed for completeness. One Plus teaser per screen. |
| A12 | `app.json` | `userInterfaceStyle: "light"`. | HIG Dark Mode: people "generally expect all apps … to respect their preference" (§6). |

A1, A5 and A7 are the ones that ship something wrong today; the rest are design debt.

---

## 2. Resolve

### 2.1 What the moment is

Resolution is the data hook (`CLAUDE.md`) and happens dozens of times per user per
month. It has to be fast, neutral, and honest, in that order. The spec's own principle —
"reward calibration, not correctness" — means the screen must not read a No as a
failure.

### 2.2 Show the original confidence first (hindsight bias)

Once an outcome is known, people misremember how likely they thought it was, and the
memory drifts toward the outcome (Fischhoff 1975, *Hindsight ≠ foresight*, J. Exp.
Psych.: HPP 1(3):288–299; replicated many times since). A calibration app is uniquely
exposed to this: the resolve screen is where the user compares their past self with
reality. So the stated confidence and the date it was stated are not metadata — they are
the headline, set *before* the question: "On 3 Sep you said **70%**." The user then
answers the plain question "Did it happen?".

### 2.3 Skip is not an outcome

The engine excludes skips (correctly — see the streak comment in `engine/streak.ts`).
But if skipping costs the same tap as No, the cheapest way to protect a score is to skip
the misses. Nothing prevents that, and it shouldn't be *prevented* (some predictions
genuinely become unresolvable), but the visual weight should match intent:

- Yes and No: two equal, large, neutral buttons.
- Skip: a text button below, labelled for what it means — "Can't tell / doesn't apply" —
  with a one-line consequence ("It won't count toward your score").

Fatebook, the closest real forecasting tracker, offers Yes / No / Ambiguous for the same
reason ([fatebook.io](https://fatebook.io)); the third option exists but is not a peer.

### 2.4 Feedback

DESIGN_SYSTEM §6.1 already defines `resolve`: identical neutral check for both answers,
`impactAsync(Medium)` for both. What's missing is what the user *learns*. After the
tap, the prompt can show one factual line about the bucket this prediction landed in —
"That's 6 of 9 in your 60–80% range" — which is a count, not an inference, so it is safe
below min-N. It is also the natural-frequency habit from §7.9 applied at the moment it
means most.

### 2.5 Reflection

Keep it optional and after the answer, not before (typing first delays the only
required tap). One line, placeholder in the user's voice ("What surprised you?").
Reflections are freetext and not sent to Coach by default (`COACH_AGENT.md` §5.6), and
the crisis pre-filter reads them; no visual change needed.

---

## 3. Notifications

### 3.1 What the HIG says (Notifications, Managing notifications — read 2026-09-28)

- "Avoid including sensitive, personal, or confidential information in a notification."
- "Provide generically descriptive text to display when notification previews aren't
  available … like 'Friend request,' 'New comment,' 'Reminder'."
- "Avoid sending multiple notifications for the same thing, even if someone hasn't
  responded."
- "Avoid sending a notification that tells people to perform specific tasks within your
  app. If it makes sense to offer simple tasks that people can perform without opening
  your app, you can provide notification actions."
- Titles: short, title-style capitalisation, no ending punctuation; body in sentence
  case with complete sentences; don't include the app name.
- Interruption levels: *Passive* for things people view at leisure, *Active* default,
  *Time Sensitive* only for events "happening now or within an hour". "Build trust by
  accurately representing the urgency."
- Marketing notifications need explicit opt-in.

### 3.2 Resolve from the notification

A resolution reminder is the textbook case for notification actions: two buttons, no
app open needed, and exactly the "simple task" the HIG describes. The installed
`expo-notifications` (55.0.23) supports it: `setNotificationCategoryAsync(id, actions,
options)` with `NotificationAction.options.opensAppToForeground`, plus
`previewPlaceholder` for hidden previews and `categoryIdentifier` on the content.

**Platform caveat (verified in the Expo docs, 2026-09-28):** a background notification
task "also runs in response to a notification action tap when the app is backgrounded or
terminated" **only on Android**. On iOS, an action that doesn't open the app is not
guaranteed to reach JS, and the resolve must write SQLite and run the engine. So the
safe first version uses **foreground** actions: tapping *Yes* opens the app straight
into the resolved state (acknowledgement, bucket line, optional reflection). That still
removes the find-and-tap step. A true background resolve needs a native check on device
before anyone builds on it.

Also note: resolving from the notification skips §2.2 (the user never sees "you said
70%"). Put the confidence in the notification itself — "You said 70%" is not sensitive —
so the reminder does the anti-hindsight work.

### 3.3 Proposed copy

| Notification | Title | Body | Hidden-preview placeholder | Level |
|---|---|---|---|---|
| Resolution reminder | Did it happen | `{title}` · You said 70% | A prediction is ready to resolve | Active |
| Weekly digest, open > 0 | Your week ahead | 3 predictions are coming due. | Weekly check-in | Passive |
| Weekly digest, open = 0 | Your week ahead | Nothing open. What do you think will happen this week? | Weekly check-in | Passive |

The digest is a leisure read, which is the HIG's definition of Passive. It must never
mention the streak (A5).

### 3.4 When the reminder fires

Asking at noon on the due day (A6) asks before the answer exists. Two options:

1. **Evening of the due day** (e.g. 19:00 local): the outcome exists, the day is still
   fresh. One-line change in how presets anchor the time, plus the scheduler.
2. A user-set "check-in time" in Settings, default 19:00.

Either is a services change (Layer 5), not a component change, and it alters behaviour
users may already rely on, so it's a decision (UI_ROADMAP D9).

---

## 4. Coach cards

### 4.1 Sources

- **HIG Generative AI** (updated 2026-06-08): "Clearly identify when and where you use
  AI"; "Give them the ability to dismiss new content they don't want"; "clearly
  communicate that AI-generated content may contain errors"; "Consider giving specific,
  reassuring feedback during generation … instead of 'Processing…', say 'Summarizing key
  themes from your notes'"; "Let people share feedback on outputs … like simple
  thumbs-up and thumbs-down buttons"; "Always make providing feedback voluntary."
- **Google PAIR, Explainability + Trust:** show "which aspects of their data are being
  used for what purpose"; "Tell the user when a lack of data might mean they'll need to
  use their own judgment"; the goal is *calibrated* trust, not maximum trust. (For a
  calibration app that sentence is the whole brief.)
- **Oura Advisor** renders the user's own data as a chart alongside the text
  ([Oura blog](https://ouraring.com/blog/oura-advisor/)); **Bevel** keeps scores free
  and sells the interpretation (first-round market research §4).

### 4.2 What that means for Calibrate

The Coach already has the hard part: every insight carries an `evidence` number that
`coachValidate.ts` checks against the input. The UI just doesn't show it (A9). The card
should **lead with the receipt**: the evidence number in `title2` Rounded, what it
counts in `footnote` ("in your 80–100% range, 12 resolved"), then the message, then the
suggestion. That makes every insight checkable against the chart two inches above it,
which is exactly the "calibrate your trust" behaviour PAIR asks for.

Other rules that follow:

- The "AI" chip stays on the panel header (already there, per COACH_AGENT.md §5.6) and
  a one-line "Coach reads your numbers, not your predictions. It can be wrong." sits
  under the first card, once.
- Loading copy names what's happening: "Reading your 5 categories…", not a spinner.
- Each card gets a dismiss (×) and 👍/👎 — voluntary, no follow-up prompt. Feedback
  needs somewhere to go (analytics event); if it has nowhere, ship dismiss only.
- Coach cards never use the calibration hues for anything but the direction they
  describe, and never use `oracleGold` or celebration motion.
- The support surface (`SupportSurface.tsx`) stays deliberately plain: no AI chip, no
  card chrome shared with insights, no feedback buttons. Its current comment is right.

---

## 5. Wrapped

### 5.1 The weekly problem

Because the weekly window almost never reaches 20 resolutions (A10), a weekly Wrapped
modelled on the yearly one would be a card that says "not enough data" 52 times a year.
Gating is right; the story is wrong. The weekly recap should be built from things that
are always true at small n:

1. **Counts** — "4 resolved · 3 logged · 1 honest coin-flip".
2. **One receipt in natural frequencies**, factual, not inferred — "You said 90% three
   times. All three happened." (counts are safe to print; `wrappedCopy.ts` already says
   so).
3. **Progress** — the unlock ring ("16 of 20") or the next badge ("Tracker in health: 3
   to go"). This is the identity layer doing retention work, which `CLAUDE.md` says is
   what carries retention.
4. **The verdict only when the window earns it** — which for weekly means rarely, and
   for yearly usually.

The yearly Wrapped keeps the Spotify structure from the first round (archetype + one
receipt + selective colour).

### 5.2 Motion

DESIGN_SYSTEM §6.2 already gives weekly Wrapped `reveal` without confetti. Keep it.

---

## 6. Dark mode

### 6.1 What the HIG says (Dark Mode, read 2026-09-28)

- "People often choose Dark Mode as their default interface style, and they generally
  expect all apps and games to respect their preference."
- "Avoid offering an app-specific appearance setting … they may think your app is
  broken because it doesn't respond to their systemwide appearance choice."
- "At a minimum, make sure the contrast ratio between colors is no lower than 4.5:1 …
  strive for a contrast ratio of 7:1, especially in small text."
- Colours "aren't necessarily inversions of their light counterparts."

### 6.2 What it costs Calibrate

The dark semantic values already exist (DESIGN_SYSTEM §2.3, for share cards). The only
missing piece is a dark neutral ramp. A proposed indigo-tinted set, computed with the
WCAG formula:

| Token | Dark hex | on canvas | on surface | on sunken |
|---|---|---|---|---|
| `canvas` | `#0C0B16` | — | — | — |
| `surface` | `#17162A` | — | — | — |
| `surfaceSunken` | `#211F36` | — | — | — |
| `hairline` | `#2E2C47` | decorative | | |
| `controlBorder` | `#6E6C88` | 3.87 | 3.51 | 3.17 |
| `textPrimary` | `#F4F3FA` | 17.72 | 16.08 | 14.50 |
| `textSecondary` | `#B9B7CE` | 9.98 | 9.06 | 8.16 |
| `textTertiary` | `#9391AC` | 6.41 | 5.81 | 5.24 |
| link / selection text | `#818CF8` (`brand400`) | 6.55 | 5.94 | 5.36 |
| `destructive` | `#FF6B5E` | 6.99 | 6.35 | 5.72 |
| `over` / `under` / `calibrated` marks | `#E06B20` / `#2D96D8` / `#14A87B` | 5.85 / 6.01 / 6.43 | 5.31 / 5.46 / 5.84 | 4.79 / 4.92 / 5.26 |

The CTA keeps `brand600` fill with white text (6.29:1). The fill itself is 3.11:1 on
dark canvas but 2.82:1 on dark surface, so CTAs on dark cards need the white label to
carry them (it does) or a `brand500` hairline.

**The cheap decision now:** shape `src/constants/theme.ts` as light/dark pairs from the
first commit (roadmap step 1), even if dark values ship later. Retro-fitting a flat
token object into a themed one touches every file twice.

---

## 7. Log form: the other fields

- **Due date.** Keep the chips (they are the 15-second path) and add a fourth, "Pick a
  date", that opens the native date picker (`@react-native-community/datetimepicker`,
  in the Expo SDK) in a compact style. Chip labels in words, not symbols: "Tomorrow",
  "In a week", "In a month" (the current "+1 week" reads as maths). Show the resolved
  date under the chips as a sentence: "Due Friday, 3 Oct".
- **Category.** Chips with the category SF Symbol + word (DESIGN_SYSTEM §5); the
  selected chip gets `brand50` fill + `brand800` text + a check symbol, not just a
  colour change.
- **Coverage nudge.** The copy in `CoverageNudge.tsx` is good (explains what the app
  can't see, "Not now" is a real answer). Visually it should be a quiet inline card
  above the title field on `surfaceSunken`, not a brand-tinted block, and its accept
  button is the *secondary* style: the primary action on Log is always Save.
- **Save.** One primary capsule at the bottom, disabled until title is non-empty, with
  the `commit` motion (§6.1).

---

## 8. Could not verify

- Whether iOS delivers a non-foreground notification action to an Expo JS handler when
  the app is terminated. The Expo docs only state the Android behaviour. Needs a device
  test.
- Detailed visual specs of WHOOP's and Oura's AI cards: the public sources describe the
  features, not the layout.

---

## 9. Sources

- Apple HIG, read as JSON-rendered text from developer.apple.com on 2026-09-28:
  - [Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications)
  - [Managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications)
  - [Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai) (change log: new 2025-06-09, updated 2026-06-08)
  - [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
  - [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Expo Notifications docs](https://docs.expo.dev/versions/latest/sdk/notifications/)
  and `node_modules/expo-notifications/build/*.d.ts` (v55.0.23): categories, actions,
  `previewPlaceholder`, `interruptionLevel`, background-task platform note.
- [Google PAIR Guidebook — Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/)
- [Oura Advisor announcement](https://ouraring.com/blog/oura-advisor/)
- Fischhoff, B. (1975). Hindsight ≠ foresight: The effect of outcome knowledge on
  judgment under uncertainty. *J. Exp. Psychology: Human Perception and Performance*,
  1(3), 288–299.
- [Fatebook](https://fatebook.io) (resolve options Yes / No / Ambiguous).
