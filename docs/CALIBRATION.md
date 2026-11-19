# Fairly Sure — Calibration Math Reference

This expands on the "Calibration Engine (authoritative)" section of `CLAUDE.md`,
which wins on any conflict. It documents **what the code actually does**
(`src/engine/calibration.ts`, `src/engine/sameDay.ts`, `src/engine/streak.ts`,
`src/store/predictionStore.ts`, `src/store/statsStore.ts`), verified against the unit
tests.

All engine functions are pure: plain `Prediction` objects in, plain numbers/objects
out. No I/O; the ranges below fall out of the algebra (the one clamp is a guard
against float drift).

---

## 1. What counts

A prediction is **calibratable** (it feeds calibration, the Brier score and the badge
resolution counts) only when its outcome is a yes/no:

```
calibratable(p)  ⇔  p.status ∈ { 'resolved_yes', 'resolved_no' }
```

`pending` and `skipped` predictions are **not** calibratable. A skip is an explicit
"don't score this," so letting it count would reward dismissing one's own
predictions — against the honesty-first design.

**Same-day answers aren't scored** (D41). A Yes or No given on the calendar day the
prediction was logged (`isSameDayAnswer`; which day, below) stays in History but counts
toward nothing calibrated. The stats store drops them first (`scoredOnly`), so every row
below marked "scored" excludes them. "Logged" means `scoredFrom(p)`: `created_at`, or
`title_edited_at` when the words changed later (D45), since new words are a new
prediction. Derived on every read, never stored as a verdict. **Judged in the zone the
prediction was made in** (D69 (f), as refined 2026-11-19): the prediction stores the
phone's UTC offset when it was logged and when it was reworded (`created_utc_offset_min`,
`title_edited_utc_offset_min`, SQLite migration 018), and both days the rule compares, the
day it was made and the day of the answer, are read in the offset stored with
`scoredFrom`'s moment (`scoredFromOffset`, `isOnMadeDay`), never in the zone the answer
was given in. So moving the phone to another zone neither re-scores past answers nor turns
a same-day answer into a scored one, and someone who answers early after travelling east is
unscored until the next day has begun where the prediction was made. No offset is kept for
the answer (migration 018's `resolved_utc_offset_min` column stays, unused). With no
stored offset (rows from before migration 018, or one pulled from another phone while the
offsets don't sync), both days are read in the phone's current zone, as before. An offset
is not a zone: across a daylight-saving change between the two moments the day boundary
moves by the change (`src/engine/sameDay.ts`). The same reading decides "made today" for
the late-change exemptions (`src/engine/corrections.ts`); their window, the eve and the due
day, is the phone's day, as the due date is shown. The offsets sync only once Supabase
migration 011 is applied and `UTC_OFFSET_SYNC` is on.

| Aggregate | Counts pending? | Counts skipped? | Counts yes/no? |
|-----------|:---:|:---:|:---:|
| `UserStat.total_predictions` | ✅ | ✅ | ✅ |
| `UserStat.total_resolved` | ❌ | ❌ | ✅ scored only |
| `CategoryStat.predictions_made` | ✅ | ✅ | ✅ |
| `CategoryStat.predictions_resolved` | ❌ | ❌ | ✅ scored only |
| Calibration buckets, Brier | ❌ | ❌ | ✅ scored only |
| Streak | its day of logging | its day of logging | its day of logging and its day of answer (same-day too) |

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

### Give-or-take

`computeRatingRange` resamples the scored answers with replacement
(`RATING_RESAMPLES`, 400, deterministic), takes the middle 80% of the resampled
ratings, and sets half its width either side of the rounded rating ("87, give or take
3"). Centred on the rating, not on the resampled percentiles: resampling only ever adds
error, so a near-perfect record's percentiles would exclude its own score. Whole points,
clamped to `0..100`; `null` with nothing scored. Each category gets its own, which its
badge uses (§5).

### Brier score (secondary)

```
brier = (1/N) × Σ over yes/no predictions of (confidence/100 − outcome)²
        outcome = 1 for resolved_yes, 0 for resolved_no
```

`computeBrier` in `src/engine/calibration.ts`; `null` with nothing resolved. Range
`[0, 1]`, lower is better: 0 is perfect, always saying 50% scores 0.25, and always
saying 100% about things that never happen scores 1. Unlike the rating it rewards
sharpness as well as calibration, so logging only coin-flips can't make it look
good. Derived on every read, never stored; shown only as a quiet line in Insights'
fine print ("More about your record") and in How scoring works, and only from
`BRIER_MIN_N` (50) scored answers (D62), per `CLAUDE.md`.

Its yardstick is the person's own base rate (D35): `computeBrierBaseline` returns
`p(1 − p)`, `p` being the share of scored yes/no predictions that happened, which is what
always saying `p` would score. `brierEdge` says who wins (step 173): `'alike'` when
`|brier − p(1 − p)|` is under `BRIER_EDGE_MIN` (0.01); `'about_same'` when the middle
80% of a paired bootstrap of that gap (`p` recomputed in each resample, the
give-or-take's method) holds 0; otherwise `'better'` or `'worse'`.

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
MIN_N_CATEGORY = 20   // CategoryStat.score_is_provisional = predictions_resolved < 20 (D46; 15 until 2026-11-10)
```

- `isRatingProvisional(totalResolved)` and `isScoreProvisional(resolvedCount)` are pure
  engine predicates; the stats store persists their results onto the stat rows.
- While provisional the engine still computes the score (for internal trend use), but
  the **UI must not headline it** — it shows progress toward the threshold instead
  ("12 more scored answers until your finance score unlocks").
- No badge above `tracker` is awarded while provisional; the badge resolution gates
  (§5) already enforce this, since every gate above tracker requires ≥ 20 = MIN_N_CATEGORY resolved.

---

## 5. Badge levels (per category)

`evaluateBadge(predictionsResolved, calibrationScore, giveOrTake = 0)` returns the
**highest** badge the user qualifies for, evaluated top-down. The score is judged at
its **low end** (D35): `low = calibrationScore − max(0, giveOrTake)`, where the stats
store passes the category's own give-or-take (§4). A score that only luck put over a
bar doesn't earn the tier.

| Badge | Criteria (as implemented) |
|-------|---------------------------|
| `oracle` | `low > 90` **AND** `resolved ≥ 100` |
| `sharp` | `low > 85` **AND** `resolved ≥ 50` |
| `forecaster` | `low > 70` **AND** `resolved ≥ 20` |
| `tracker` | `resolved ≥ 20` |
| `guesser` | default floor (no threshold; shown as "Getting started" since D36) |

Every badge above `tracker` gates on **both** a score threshold and a resolution
minimum. The minimums are required, not decorative — a badge earned on three lucky
predictions actively misleads the user about themselves, the opposite of the app's
purpose. They also subsume the "no badge above tracker while provisional" rule (§4a).

Boundary conventions: **scores use strict `>`** (a low end of exactly 85 is *not*
sharp), **counts use inclusive `≥`** (exactly 20 resolved *is* a tracker).

`predictionsResolved` here is the scored yes/no count (skips and same-day answers
excluded — see §1).

### Next-badge hint

`nextBadge(predictionsResolved, calibrationScore, giveOrTake = 0)` returns the badge
one rung **up the fixed ladder** `guesser → tracker → forecaster → sharp → oracle`
from the one `evaluateBadge` gives for the same arguments, with that rung's absolute
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

`streakStatus(predictions, now)` (and `computeStreak(predictions, { now })`, which
returns its length) counts **local calendar days** on which at least one prediction
was done (`STREAK_DAY_MIN`, one since D17): each prediction counts once on the day it
was logged (`created_at`) and once on the day it was answered yes or no
(`resolved_at`). A skip earns nothing. A same-day answer counts toward the streak
though it isn't scored. `DAILY_GOAL` (3) fills the day's dots and is asked of nobody.

- **Rest days:** every `REST_DAY_EVERY` (7) counted days in a run save one, up to
  `REST_DAYS_MAX` (2). A past day that didn't count spends one, and the streak carries
  on without adding that day; with none saved, the run ends and the reserve goes with
  it. Nothing is stored: the walk replays every day from the first that counted, so
  a sync or a back-dated answer gives the same streak on every device.
- **Expiry:** with `now`, today isn't judged until it's over. Until today counts the
  streak stands through yesterday, so it doesn't vanish at midnight before the user
  can extend it. A run with a past day that neither counted nor was covered has ended
  and reads `0`. `statsStore` passes `now` both when it recomputes and when it loads,
  so a lapsed streak shows `0` on the next launch. Without `now` it anchors at the
  latest counted day.
- **Day key:** the device's local calendar day (`src/engine/localTime.ts`). Changed
  from the UTC slice on 2026-09-25: in UTC, a Pacific-time user acting at 10:00
  Monday and 18:00 Tuesday had acted on Monday and *Wednesday*, and the streak broke
  over a day they never missed. The zone is on the device and needs no trusted clock.
- **DST-proof:** days are compared as calendar dates, not as 24-hour spans.
- **Checkpoints:** 7, 30, 100 and 365 days, then every further year
  (`isStreakCheckpoint`); the day a streak reaches one is named.
- Empty input → `0`.

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
