# Calibrate — Calibration Math Reference

The single authoritative description of every scoring formula in the app. This
documents **what the code actually does** (`src/engine/calibration.ts`,
`src/engine/streak.ts`, `src/store/predictionStore.ts`, `src/store/statsStore.ts`),
verified against the unit tests. It is aligned with the canonical spec in `CLAUDE.md`;
the history of how the two were reconciled lives in [Spec reconciliation](#spec-reconciliation).

All engine functions are pure: plain `Prediction` objects in, plain numbers/objects
out. No I/O, no clamping tricks — the ranges below fall out of the algebra.

---

## 1. What counts

A prediction is **calibratable** (it feeds calibration, streak, and the badge
resolution counts) only when its outcome is a yes/no:

```
calibratable(p)  ⇔  p.status ∈ { 'resolved_yes', 'resolved_no' }
```

`pending` and `skipped` predictions are **not** calibratable. A skip is an explicit
"don't score this," so letting it count would reward dismissing one's own
predictions — against the honesty-first design.

| Aggregate | Counts pending? | Counts skipped? | Counts yes/no? |
|-----------|:---:|:---:|:---:|
| `UserStat.total_predictions` | ✅ | ✅ | ✅ |
| `UserStat.total_resolved` | ❌ | ❌ | ✅ |
| `CategoryStat.predictions_made` | ✅ | ✅ | ✅ |
| `CategoryStat.predictions_resolved` | ❌ | ❌ | ✅ |
| Calibration buckets | ❌ | ❌ | ✅ |
| Streak | ❌ | ❌ | ✅ |

So a skip is visible in the "made" totals but never affects a score.

---

## 2. Confidence buckets

Confidence (an integer `0..100`) maps to one of five buckets:

```
[0,20)   [20,40)   [40,60)   [60,80)   [80,100]
```

- All buckets are half-open `[low, high)` **except the top**, which is closed
  `[80,100]` so `confidence = 100` has a home.
- Boundary rule: `bucketIndex = floor(confidence / 20)`, with `confidence ≥ 100`
  forced into the top bucket. So `20 → [20,40)`, `40 → [40,60)`, `80 → [80,100]`.
- Only buckets that actually receive a calibratable prediction are materialized.
  Empty buckets are absent from the output — they are **not** treated as zero-error.

`BucketStat.high` is reported as `(index+1) × 20` (so the top bucket reads `high =
100`); read it as inclusive only for that top bucket.

---

## 3. Per-bucket statistics

For each non-empty bucket, over the calibratable predictions that fell in it:

```
stated_confidence_mean = mean(confidence of predictions in bucket)   // 0..100
actual_rate            = resolved_yes / total_resolved_in_bucket     // 0..1
bucket_error           = | stated_confidence_mean / 100 − actual_rate |  // 0..1
```

Note `stated_confidence_mean` is the **mean of the actual stated confidences in the
bucket**, not the bucket midpoint and not a single nominal value. This is the
standard reliability-diagram / Expected Calibration Error construction.

The error is **absolute (mean absolute error), not squared** — see §4 for why.
Because both terms are in `[0,1]`, `bucket_error ∈ [0,1]`.

---

## 4. Overall rating

```
rating = 100 − ( Σ(n_b × bucket_error_b) / N × 100 )

  over non-empty buckets b; n_b = yes/no predictions in b; N = Σ n_b
```

Properties:

- **Range:** `rating ∈ [0, 100]`, provably — each `bucket_error ∈ [0,1]`, so their
  weighted mean is in `[0,1]`, so `rating ∈ [0,100]`. The code clamps to `[0,100]` as a cheap
  guard against float drift; the algebra never requires it.
- **Weighted by count** (since 2026-10-10, roadmap D24): each bucket counts in
  proportion to its predictions, the standard expected calibration error (ECE). It
  used to be an unweighted mean over buckets, so a bucket with 1 prediction moved the
  score as much as one with 50. With one bucket, or buckets of equal size, the two
  are identical, so every single-bucket example below is unchanged.
- **Empty input convention:** `computeCalibration([])` returns `{ rating: 0,
  buckets: [] }`. Rating `0` (not `100`) so callers can distinguish "no data" from
  "perfectly calibrated" by checking `buckets.length`.

**Why absolute, not squared.** Squared error compresses the usable range into roughly
84–100 for anyone who isn't at an extreme — a user stating 90% who is right 50% of the
time would score 84, one point below "Sharp." Absolute error drops the score about one
point per average percentage point of miscalibration: discriminating, and directly
interpretable to the user.

Stored unrounded in `UserStat.calibration_rating` and
`CategoryStat.calibration_score` (the same `rating` value, computed over the
category's subset).

### Worked examples (from the unit tests / CLAUDE.md)

| Scenario | stated_mean | actual_rate | bucket_error | rating |
|----------|:---:|:---:|:---:|:---:|
| Perfect (10 preds @ 90%, 9 yes) | 0.90 | 0.90 | 0.00 | **100** |
| Slightly off (@ 90%, 85% yes) | 0.90 | 0.85 | 0.05 | **95** |
| Moderately overconfident (@ 80%, 60% yes) | 0.80 | 0.60 | 0.20 | **80** |
| Badly overconfident (@ 90%, 50% yes) | 0.90 | 0.50 | 0.40 | **60** |
| Underconfident (@ 60%, 85% yes) | 0.60 | 0.85 | 0.25 | **75** |
| Multi-bucket (errors 0.05 n=20, 0.20 n=10, 0.35 n=20) | — | — | weighted mean 0.20 | **80** |
| Weighting matters (errors 0.05 n=50, 0.45 n=1) | — | — | weighted mean 0.0578 | **94.2** (unweighted: 75) |

Over- and under-confidence are penalized symmetrically (the error is an absolute value).

### Brier score (secondary)

```
brier = (1/N) × Σ over yes/no predictions of (confidence/100 − outcome)²
        outcome = 1 for resolved_yes, 0 for resolved_no
```

`computeBrier` in `src/engine/calibration.ts`; `null` with nothing resolved. Range
`[0, 1]`, lower is better: 0 is perfect, always saying 50% scores 0.25, and always
saying 100% about things that never happen scores 1. Unlike the rating it rewards
sharpness as well as calibration, so logging only coin-flips can't make it look
good. Derived on every read, never stored; shown only as a quiet line on Insights
and in How scoring works once the rating is unlocked (`MIN_N_OVERALL`), per
`CLAUDE.md`.

Worked examples (unit-tested):

| Scenario | brier |
|---|:---:|
| 10 @ 90%, 9 yes | **0.09**: each yes (0.9 − 1)² = 0.01, the no (0.9 − 0)² = 0.81; (9 × 0.01 + 0.81) / 10 |
| 10 @ 50%, any outcomes | **0.25** |
| 1 @ 100%, no | **1** |

---

## 4a. Minimum-N gating

Small samples make `actual_rate` meaningless — with two resolved predictions a bucket
can only read 0, 0.5, or 1.0. So a score is **provisional** until it rests on enough
data:

```
MIN_N_OVERALL  = 20   // UserStat.rating_is_provisional  = total_resolved < 20
MIN_N_CATEGORY = 15   // CategoryStat.score_is_provisional = predictions_resolved < 15
```

- `isRatingProvisional(totalResolved)` and `isScoreProvisional(resolvedCount)` are pure
  engine predicates; the stats store persists their results onto the stat rows.
- While provisional the engine still computes the score (for internal trend use), but
  the **UI must not headline it** — it shows progress toward the threshold instead
  ("12 more resolutions until your finance score unlocks").
- No badge above `tracker` is awarded while provisional; the badge resolution gates
  (§5) already enforce this, since every gate above tracker requires ≥ 20 > 15 resolved.

---

## 5. Badge levels (per category)

`evaluateBadge(predictionsResolved, calibrationScore)` returns the **highest** badge
the user qualifies for. Evaluated top-down:

| Badge | Criteria (as implemented) |
|-------|---------------------------|
| `oracle` | `score > 90` **AND** `resolved ≥ 100` |
| `sharp` | `score > 85` **AND** `resolved ≥ 50` |
| `forecaster` | `score > 70` **AND** `resolved ≥ 20` |
| `tracker` | `resolved ≥ 20` |
| `guesser` | default floor (no threshold) |

Every badge above `tracker` gates on **both** a score threshold and a resolution
minimum. The minimums are required, not decorative — a badge earned on three lucky
predictions actively misleads the user about themselves, the opposite of the app's
purpose. They also subsume the "no badge above tracker while provisional" rule (§4a).

Boundary conventions: **scores use strict `>`** (a score of exactly 85 is *not*
sharp), **counts use inclusive `≥`** (exactly 20 resolved *is* a tracker).

`predictionsResolved` here is the yes/no count (skips excluded — see §1).

### Next-badge hint

`nextBadge(...)` returns the badge one rung **up the fixed ladder**
`guesser → tracker → forecaster → sharp → oracle`, with that rung's absolute
thresholds, for the UI's "what's next" hint. It is purely positional: a forecaster's
next is always `sharp`, even if they never met tracker's resolution count. Returns
`null` for an oracle (top of ladder).

| Current | Next | Threshold shown |
|---------|------|-----------------|
| guesser | tracker | `needResolved: 20` |
| tracker | forecaster | `needResolved: 20, needScore: 70` |
| forecaster | sharp | `needResolved: 50, needScore: 85` |
| sharp | oracle | `needResolved: 100, needScore: 90` |
| oracle | — | `null` |

---

## 6. Streak

`computeStreak(resolved, { now })` counts **consecutive local calendar days**
with at least one yes/no resolution, walking backward from the most recent.

- **Day key:** the device's local calendar day of `resolved_at`
  (`src/engine/localTime.ts`). Changed from the UTC slice on 2026-09-25: in
  UTC, a Pacific-time user resolving at 10:00 Monday and 18:00 Tuesday had
  resolved on Monday and *Wednesday*, and the streak broke over a day they
  never missed. The zone is on the device and needs no trusted clock.
- **Expiry:** with `now`, a streak whose latest day is before yesterday has
  ended and reads `0`. Yesterday still counts, so it doesn't vanish at midnight
  before the user can extend it today. `statsStore` passes `now` both when it
  recomputes and when it loads, so a lapsed streak shows `0` on the next
  launch. Without `now` it anchors at the latest resolution, as before.
- **DST-proof:** days are compared as calendar dates, not as 24-hour spans.
- **Skips don't count** (see §1). Empty input → `0`.

The same local-calendar rule applies to the weekday pattern the Coach sees
(`patterns.ts`), the monthly trend (`trends.ts`) and the yearly Wrapped window
(`wrapped.ts`). Jest pins the zone to UTC (`jest.globalSetup.js`). Tests for
other zones use `__setTimeZoneForTests`.

---

## 7. Integrity bonus (dropped 2026-10-10, roadmap D23)

The field is still set at creation time (`src/store/predictionStore.ts`) and synced,
so the schema doesn't change:

```
integrity_bonus = (35 ≤ confidence ≤ 65)     // inclusive both ends
```

Nothing reads it any more: no chip on Log, no band on the slider, no Wrapped note,
no CSV column. It never fed the rating, badges or streak. The analytics event
`prediction_logged` still carries it, as a coverage measure of how often people log
mid-range calls.

---

## Spec reconciliation

`CLAUDE.md` is the canonical spec; the code and this doc now match it. History of
the alignments, for context:

1. **Guesser badge.** `CLAUDE.md` used to list Guesser as *"First 5 predictions
   resolved,"* but `evaluateBadge` has no such gate — `guesser` is the
   unconditional default floor (`evaluateBadge(4, 50) === 'guesser'`, asserted in
   the tests). The spec reads "Default starting badge: fewer than 20 resolved in the
   category" (the Tracker gate).

2. **`bucket_error` shape.** `CLAUDE.md` used to write a single nominal value; the
   implementation uses the per-bucket **mean** stated confidence (§3). The spec now
   spells out `stated_confidence_mean`.

3. **Absolute, not squared error** *(adopted from the canonical spec)*. The engine
   previously used squared error (`… ² `, scores compressed into 84–100). The spec
   now mandates **mean absolute error**; `computeCalibration` uses
   `| stated_mean/100 − actual_rate |` and clamps to `[0,100]` (§3, §4). The worked
   examples and the store/prediction tests were updated to the MAE values.

4. **Badge resolution minimums** *(adopted from the canonical spec)*. Forecaster now
   also requires `resolved ≥ 20` and Sharp `resolved ≥ 50` (§5), so a high score on a
   handful of calls can no longer earn a top badge — this is the same principle as the
   min-N provisional gating (§4a).

5. **Count-weighted rating and a Brier score** *(2026-10-10, roadmap D24)*. The
   rating's mean over buckets is now weighted by each bucket's count (§4), and a
   Brier score sits beside it as a secondary, quiet number. A blind tester who knew
   the field pointed out that the unweighted score was jumpy and that a
   calibration-only score can be raised by logging safe calls
   (`docs/design/research/dryrun-2026-10-09.md`).
