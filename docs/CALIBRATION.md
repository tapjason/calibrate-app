# Calibrate — Calibration Math Reference

The single authoritative description of every scoring formula in the app. This
documents **what the code actually does** (`src/engine/calibration.ts`,
`src/engine/streak.ts`, `src/store/predictionStore.ts`, `src/store/statsStore.ts`),
verified against the unit tests. Where this disagrees with `CLAUDE.md`, the
divergence is called out explicitly in [Known inconsistencies](#known-inconsistencies).

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
predictions — against the integrity-first design.

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
bucket_error           = (stated_confidence_mean / 100 − actual_rate)²  // 0..1
```

Note `stated_confidence_mean` is the **mean of the actual stated confidences in the
bucket**, not the bucket midpoint and not a single nominal value. This is the
standard reliability-diagram / Expected Calibration Error construction.

Because both terms are in `[0,1]`, `bucket_error ∈ [0,1]`.

---

## 4. Overall rating

```
rating = 100 − ( mean(bucket_error over non-empty buckets) × 100 )
```

Properties:

- **Range:** `rating ∈ [0, 100]`, provably — each `bucket_error ∈ [0,1]`, so their
  mean is in `[0,1]`, so `rating ∈ [0,100]`. No clamping is applied or needed.
- **Unweighted:** the mean is over *buckets*, not predictions. A bucket with 1
  prediction influences the score exactly as much as a bucket with 50. This is a
  deliberate "each confidence region weighted equally" choice; it differs from a
  sample-size-weighted ECE.
- **Empty input convention:** `computeCalibration([])` returns `{ rating: 0,
  buckets: [] }`. Rating `0` (not `100`) so callers can distinguish "no data" from
  "perfectly calibrated" by checking `buckets.length`.

Stored unrounded in `UserStat.calibration_rating` and
`CategoryStat.calibration_score` (the same `rating` value, computed over the
category's subset).

### Worked examples (from the unit tests)

| Scenario | stated_mean | actual_rate | bucket_error | rating |
|----------|:---:|:---:|:---:|:---:|
| 10 preds @ 100% conf, all yes | 1.00 | 1.00 | 0.00 | **100** |
| 10 preds @ 90% conf, 5 yes (overconfident) | 0.90 | 0.50 | 0.16 | **84** |
| 10 preds @ 30% conf, 7 yes (underconfident) | 0.30 | 0.70 | 0.16 | **84** |

Over- and under-confidence are penalized symmetrically because the error is squared.

---

## 5. Badge levels (per category)

`evaluateBadge(predictionsResolved, calibrationScore)` returns the **highest** badge
the user qualifies for. Evaluated top-down:

| Badge | Criteria (as implemented) |
|-------|---------------------------|
| `oracle` | `score > 90` **AND** `resolved ≥ 100` |
| `sharp` | `score > 85` |
| `forecaster` | `score > 70` |
| `tracker` | `resolved ≥ 20` |
| `guesser` | default floor (no threshold) |

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
| tracker | forecaster | `needScore: 70` |
| forecaster | sharp | `needScore: 85` |
| sharp | oracle | `needResolved: 100, needScore: 90` |
| oracle | — | `null` |

---

## 6. Streak

`computeStreak(resolved)` counts **consecutive UTC days** with at least one yes/no
resolution, walking backward from the most recent.

- **Day key:** the `YYYY-MM-DD` UTC slice of `resolved_at`.
- **Anchor:** the *latest* `resolved_at` day in the input — **not** real "today."
  This keeps the result deterministic offline (device clocks are untrusted). The
  trade-off: a streak doesn't expire just because today passed without a
  resolution; the next resolution still chains to the previous day. Switch the
  anchor to trusted server time once available.
- **Skips don't count** (see §1). Empty input → `0`.

---

## 7. Integrity bonus

Set once at creation time (`src/store/predictionStore.ts`), never recomputed:

```
integrity_bonus = (35 ≤ confidence ≤ 65)     // inclusive both ends
```

It marks honest-uncertainty predictions. It is a flag only — it does **not** feed
into the calibration rating, badges, or streak.

---

## Spec reconciliation

Two earlier `CLAUDE.md` wordings disagreed with the implementation; both were
resolved in favor of the code (the code, tests, and this doc were already
consistent — only the spec wording changed):

1. **Guesser badge.** `CLAUDE.md` used to list Guesser as *"First 5 predictions
   resolved,"* but `evaluateBadge` has no such gate — `guesser` is the
   unconditional default floor (`evaluateBadge(4, 50) === 'guesser'`, asserted in
   the tests). The spec now reads "Default starting badge (no threshold)."

2. **`bucket_error`.** `CLAUDE.md` used to write `(stated_confidence/100 −
   actual_rate)²`, which read as a single nominal value; the implementation uses
   the per-bucket **mean** stated confidence (§3). The spec now spells out
   `stated_confidence_mean`.
