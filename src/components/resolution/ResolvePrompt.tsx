import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { localDate } from '@/components/ui/dates';
import { endSentence } from '@/components/ui/sentence';
import { textLanguage } from '@/components/ui/textLanguage';
import { AnsweredDetails, CORRECTED_NOTE } from '@/components/prediction/AnsweredDetails';
import { daysUntilDue } from '@/components/prediction/dueGroups';
import { loggedAgainLine, logAgainWords } from '@/components/prediction/dueWords';
import { MIN_BUCKET_N_FOR_VERDICT } from '@/components/stats/chartTakeaway';
import { claimStreakMoment } from '@/components/stats/checkpointMoment';
import { BADGE_LADDER } from '@/components/stats/scoringCopy';
import { BADGE_META, BADGE_SCORE_BAR } from '@/constants/badges';
import { Button } from '@/components/ui/Button';
import { naturalFrequencyFor } from '@/components/ui/ConfidenceControl';
import { haptics } from '@/components/ui/haptics';
import { holdRanges } from '@/components/ui/holdRanges';
import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import {
  colors,
  FONT_FAMILY,
  radius,
  space,
  tabularNums,
  type,
} from '@/constants/theme';
import {
  answerNowIsSameDay,
  rewordedLater,
  openRepeatOf,
  skipAnswerBy,
  usePredictionStore,
} from '@/store/predictionStore';
import { useRatingStore } from '@/store/ratingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { answeredSameDay, useStatsStore } from '@/store/statsStore';
import {
  MIN_N_OVERALL,
  type BucketStat,
  type Milestone,
  type Prediction,
  type ResolvedStatus,
  type TierDrop,
} from '@/types';
import { categoryLabel, categoryTitle, useCategoryStore } from '@/store/categoryStore';

import { MilestoneCard, milestoneCopy } from './MilestoneCard';
import { sameDayHeadsUp } from './sameDayWarned';
import { StreakCheckpointCard } from './StreakCheckpointCard';

interface ResolvePromptProps {
  /** Prediction id read from the URL or notification payload. */
  predictionId: string;
  /**
   * Called when the user is finished here (after answering, or skipping).
   * 'skipped' when Can't tell moved straight on, so a run can say it landed.
   */
  onResolved?: (outcome?: 'skipped') => void;
  /**
   * Called as a Yes or No lands, before "Next" (D62): a run clears its "Last
   * one recorded: can't tell." then, so two "recorded" lines never show at
   * once (blind playtest 2026-11-13d, run 3).
   */
  onAnswered?: () => void;
  /**
   * The reflection typed so far and not yet saved ('' when there is none), so
   * the screen can ask before a swipe-down throws it away.
   */
  onDraftChange?: (draft: string) => void;
  /** The finishing button after an answer: "Done" alone, "Next" in a run. */
  advanceLabel?: string;
  /**
   * In a run the reflection waits behind "Add a reflection", so moving on is
   * one tap; on its own it's open, since there's nothing else to do.
   */
  reflectionCollapsed?: boolean;
  /**
   * An earlier answer in this run already said why one answer only nudges the
   * rating, so this one gives the move alone (Answer all).
   */
  ratingExplained?: boolean;
  /**
   * Called when this card's note said why the rating moves little, so the run
   * stops repeating it. Only then: a skip, a same-day answer or the unlocking
   * answer says nothing about it (code review 2026-11-13).
   */
  onRatingExplained?: () => void;
  /**
   * "Log it again" (roadmap step 22): offered after Yes or No when set. The
   * reflection is saved first, as with Done. Left unset inside a run, where
   * leaving for the Log screen would end the run.
   */
  onPredictAgain?: (prediction: Prediction) => void;
  /**
   * Set when a reminder action already recorded this answer (roadmap D8).
   * The screen opens on the acknowledgement and does not record again.
   */
  recordedAnswer?: 'resolved_yes' | 'resolved_no';
  /**
   * Answer it now's confirmation said, today, that an answer today isn't
   * scored (roadmap D56): the note before Yes and No isn't repeated. Only
   * that route sets it; every other way here keeps the note.
   */
  sameDayWarned?: boolean;
}

/**
 * "At 60–80%, 6 of your 9 calls happened." Counts, not a verdict, so it
 * is honest below min-N — and it is the natural-frequency habit applied at the
 * moment it means most (DESIGN_SYSTEM §7.10).
 *
 * From MIN_BUCKET_N_FOR_VERDICT resolved, the range's own comparison follows
 * (roadmap step 58): "You said about 48% and got 52%." Calibration
 * feedback, said against what happened, is what moved forecasters' calibration
 * in the studies; bare outcomes barely did (research/confidence-2026-10.md
 * §6). Both numbers come from the engine's bucket, as on the Stats table.
 * Worded by D76 (the voice pass, 2026-11-23).
 */
export function bucketLine(bucket: BucketStat): string {
  const range = `${bucket.low}–${bucket.high}%`;
  const n = bucket.total_resolved;
  if (n === 1) return `That's your first call at ${range}.`;
  const counts = `At ${range}, ${bucket.resolved_yes} of your ${n} calls happened.`;
  if (n < MIN_BUCKET_N_FOR_VERDICT) return counts;
  const happened = Math.round(bucket.actual_rate * 100);
  const said = Math.round(bucket.stated_confidence_mean);
  // "about": the said figure is the range's mean, and a blind tester who'd
  // said 40% read "the 47% you said" as a misquote (2026-10-09).
  return `${counts} You said about ${said}% and got ${happened}%.`;
}

/**
 * The first yes/no answer ever gets this in place of the bucket line (roadmap
 * D18, refined 2026-10-09): what the stated number means, identical for Yes
 * and No. A first "it happened" otherwise reads as "I was right" (outcome
 * bias, Baron & Hershey 1988), which isn't what 70% means. In D76's words
 * (the owner, 2026-11-23): "70% means right about 7 times in 10. It takes
 * around 20 answers before we can tell how you're doing."
 */
export function firstAnswerLine(confidence: number): string {
  return (
    `That's your first. ${numberMeans(confidence)} ` +
    `It takes around ${MIN_N_OVERALL} answers before we can tell how you're doing.`
  );
}

/**
 * "70% means right about 7 times in 10." The slider's own words for the
 * number, so 85% reads "8 or 9 times in 10" here too, not a flat 9 (blind
 * playtest 2026-11-04, third round). Under 50% it says "it happens": "right"
 * on a call someone thinks won't happen reads the other way round.
 */
function numberMeans(confidence: number): string {
  if (confidence >= 100) return '100% means right every time.';
  if (confidence <= 0) return '0% means it never happens.';
  if (confidence === 50) return '50% means right half the time.';
  const often = naturalFrequencyFor(confidence);
  return confidence > 50
    ? `${confidence}% means right ${often}.`
    : `${confidence}% means it happens ${often}.`;
}

/**
 * Under the range's record on every answer until the rating unlocks (roadmap
 * D50), the same for Yes and No: what one answer means. "A miss at 70% isn't
 * a mistake" was on the Warmup and in How scoring works, but not on the
 * screen where a tester's miss stung (blind playtest 2026-11-09b, finding 6).
 * Null at 0% and 100%, where one the other way is a miss of the number.
 */
export function meaningLine(confidence: number): string | null {
  if (confidence <= 0 || confidence >= 100) return null;
  return `${numberMeans(confidence)} A miss isn't a mistake, and a hit isn't proof.`;
}

/** Why one answer only nudges the rating: said once per answer run. */
export const RATING_WHY = 'One answer only nudges it. The pattern is what counts.';

/**
 * Once the rating is unlocked, what this answer did to it, the same for Yes
 * and No (roadmap D50): it moved on Today with nothing said, and two testers
 * read the drop as a grade (blind playtest 2026-11-09b, findings 4 and 6).
 */
export function ratingChangeLine(before: number, after: number, explain = true): string {
  const move =
    before === after
      ? `Your rating stays at ${after}.`
      : `Your rating went from ${before} to ${after}.`;
  // Once a run has said why, the move alone: three in a row read as wallpaper
  // (blind playtest 2026-11-13b, run 3).
  return explain ? `${move} ${RATING_WHY}` : move;
}

/**
 * The rating as Today shows it, or null while it's provisional, or while the
 * stats are stale: after a write that failed and a reload that failed too,
 * memory may hold numbers the database doesn't, so no "moved from 91 to 89"
 * is ever built from them (statsStore `stale`, review round 5).
 */
function shownRating(): number | null {
  const { userStat: stat, stale } = useStatsStore.getState();
  if (stale || !stat || stat.rating_is_provisional) return null;
  return Math.round(stat.calibration_rating);
}

/**
 * The acknowledgement after a yes or no: the range line, a milestone, a
 * streak checkpoint. Reads what the resolve just left in the stores, then
 * clears it so a later screen doesn't celebrate the same answer again.
 */
/**
 * After a same-day answer (roadmap D41), in place of the range's record,
 * beside "Log it again" (D56): the button sat under "Answered the day you
 * logged it, so it isn't scored" and nothing tied the two together, so a
 * tester tapped Done and retyped his walk (blind playtest 2026-11-10, run 2).
 * Short since D76 (the voice pass, 2026-11-23): the rule was said once, before
 * the answer, and the button sits right under it.
 */
export const SAME_DAY_LINE = 'Saved, but not scored, since you logged it today.';
/** The same for a prediction whose words changed today (D45). */
export const SAME_DAY_REWORDED_LINE = 'Saved, but not scored, since you reworded it today.';

const isSameDayLine = (line: string | null) =>
  line === SAME_DAY_LINE || line === SAME_DAY_REWORDED_LINE;

function readAcknowledgement(
  prediction: Prediction,
  outcome: 'resolved_yes' | 'resolved_no',
  /** The rating before this answer, or null if it was provisional or unknown. */
  ratingBefore: number | null = null,
  /** The run already said why one answer only nudges it. */
  ratingExplained = false,
): {
  outcome: 'resolved_yes' | 'resolved_no';
  line: string | null;
  note: string | null;
  ratingBefore: number | null;
  milestone: Milestone | null;
  tierDrop: TierDrop | null;
  checkpoint: { days: number; next: number; celebrate: boolean } | null;
  unlocked: boolean;
} {
  const stats = useStatsStore.getState();
  const bucket = stats.bucketFor(prediction.confidence);
  const predictions = usePredictionStore.getState();
  // An answer's checkpoint only: one a log reached is Today's to show (step 194).
  const days =
    predictions.streakCheckpointFrom === 'answer' ? predictions.streakCheckpoint : null;
  const milestone = stats.milestone;
  // Only a drop in this prediction's category is this answer's: a sync in
  // between could have dropped another (code review, step 176).
  const tierDrop = stats.tierDrop?.category === prediction.category ? stats.tierDrop : null;
  if (milestone?.kind === 'rating_unlocked') useRatingStore.getState().noteMoment();
  stats.clearMilestone();
  if (days !== null) predictions.clearStreakCheckpoint();
  // Answered the day it was logged (roadmap D41): said instead of the range's
  // record, which this answer doesn't join.
  const sameDay = answeredSameDay({
    ...prediction,
    status: outcome,
    resolved_at: prediction.resolved_at ?? new Date().toISOString(),
  });
  const first = stats.userStat?.total_resolved === 1;
  return {
    outcome,
    line: sameDay
      ? rewordedLater(prediction)
        ? SAME_DAY_REWORDED_LINE
        : SAME_DAY_LINE
      : first
        ? firstAnswerLine(prediction.confidence)
        : bucket
          ? bucketLine(bucket)
          : null,
    note: answerNote(
      prediction.confidence,
      sameDay || first,
      ratingBefore,
      milestone?.kind === 'rating_unlocked',
      ratingExplained,
    ),
    ratingBefore,
    milestone,
    tierDrop,
    unlocked: milestone?.kind === 'rating_unlocked',
    checkpoint:
      days === null
        ? null
        : {
            days,
            next: predictions.streakNow().nextCheckpoint,
            // One full moment per answer (step 194): when it also unlocked
            // the rating or earned a badge, that one plays and the checkpoint
            // shows still. Decided here, once, so reopening it can't replay it.
            celebrate: milestone === null && claimStreakMoment(),
          },
  };
}

/**
 * When an answer takes a badge back (roadmap D60 (a)): said plainly, the same
 * after Yes and No, never as a loss. A tester's 20th health answer named
 * "Forecaster in health" and the next one took it away without a word: "If
 * I'd screenshotted that banner for my guys, I'd have been posting a lie"
 * (blind playtest 2026-11-13b, run 7). Exported for tests.
 */
export function tierDropLine(drop: TierDrop): string {
  // The bar of the tier just above where it landed: after a fall of two, the
  // one it now misses by the least (code review, step 176).
  const above = BADGE_LADDER[BADGE_LADDER.indexOf(drop.to) + 1] ?? drop.from;
  const bar = BADGE_SCORE_BAR[above];
  const to = BADGE_META[drop.to].label;
  const why =
    bar === undefined
      ? 'after this answer it no longer clears the bar'
      : `after this answer its score's low end is no longer above ${BADGE_META[above].label}'s ${bar}`;
  return `Back to ${to} in ${categoryLabel(drop.category)}: ${why}. A badge follows the record both ways.`;
}

/**
 * The second line after a Yes or No (roadmap D50): the rating's move once it's
 * unlocked, what the number means before then. Nothing after a same-day answer
 * (it moves nothing) or the first answer (its line already says it).
 */
function answerNote(
  confidence: number,
  skip: boolean,
  ratingBefore: number | null,
  unlocked = false,
  ratingExplained = false,
): string | null {
  if (skip) return null;
  const after = shownRating();
  if (after === null) return meaningLine(confidence);
  if (ratingBefore !== null) return ratingChangeLine(ratingBefore, after, !ratingExplained);
  // The answer that unlocked the rating (its milestone says so, not a
  // missing "before", which can also mean unknown: a reminder's answer on a
  // cold start) was given while it was provisional, so it keeps what the
  // number means, as D50 says until the unlock. It had neither line, so a
  // miss there read as a cross and a bare score (blind playtest 2026-11-12e,
  // run 5; code review 2026-11-12).
  return unlocked ? meaningLine(confidence) : null;
}

/**
 * Resolve one prediction: what you said, then the question, then — after the
 * answer — one factual line about that confidence range and an optional
 * reflection. The reflection comes after the answer because typing first
 * would delay the only required tap.
 *
 * The id arrives untrusted (URL or notification payload). predictionStore
 * .getById applies the current-user filter, so a crafted deep-link can't
 * surface another user's prediction.
 */
export function ResolvePrompt({
  predictionId,
  onResolved,
  onAnswered,
  onDraftChange,
  advanceLabel = 'Done',
  reflectionCollapsed = false,
  ratingExplained = false,
  onRatingExplained,
  onPredictAgain,
  recordedAnswer,
  sameDayWarned = false,
}: ResolvePromptProps) {
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  // An open prediction with the same words: "Logged again" instead of a
  // second copy (D56, as History's details).
  const pending = usePredictionStore((s) => s.pending);
  const [loading, setLoading] = useState(true);
  // A checkpoint card only while the streak is shown (step 173).
  const streakShown = useSettingsStore((s) => s.streakShown);
  const [reflectionOpen, setReflectionOpen] = useState(!reflectionCollapsed);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * "Answer it now" on a Can't tell: the question shows, and the skip stays
   * as it is until Yes or No is tapped (playtest 2026-11-08b, finding 2).
   */
  const [answeringSkip, setAnsweringSkip] = useState(false);
  /** Set once Yes or No has been recorded: the acknowledgement step. */
  const [answered, setAnswered] = useState<{
    outcome: 'resolved_yes' | 'resolved_no';
    line: string | null;
    /** What the number means, or what the answer did to the rating (D50). */
    note: string | null;
    /** The rating before the first answer, kept for a correction's line. */
    ratingBefore: number | null;
    milestone: Milestone | null;
    /** A badge this answer took back (D60 (a)), said under the range's record. */
    tierDrop: TierDrop | null;
    /**
     * A streak checkpoint this answer reached (7, 30, 100…), the next one,
     * and whether its card plays the checkpoint's moment (step 194).
     */
    checkpoint: { days: number; next: number; celebrate: boolean } | null;
    /** This answer unlocked the rating: its meaning line survives a correction. */
    unlocked: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await usePredictionStore.getState().getById(predictionId);
        if (cancelled) return;
        setPrediction(p);
        // A reminder action already recorded this. Show the same
        // acknowledgement a tap in the app would, including a milestone.
        if (p && recordedAnswer && p.status === recordedAnswer) {
          setAnswered(
            readAcknowledgement(p, recordedAnswer, useStatsStore.getState().takeRatingBefore(p.id)),
          );
          haptics.resolve();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [predictionId, recordedAnswer]);

  useEffect(() => {
    onDraftChange?.(answered ? reflection : '');
  }, [answered, reflection, onDraftChange]);

  // The spoken badge news, said a moment after the answer (below).
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    [],
  );

  /**
   * After an answer `resolve` saved, when the read of the row after it
   * failed: the answer as given, and nothing that read would have backed. No
   * range line, no rating move, no badge, no checkpoint; what the stores hold
   * for this answer is cleared, so it can't land on a later acknowledgement.
   * The same for Yes and No (rule 0.4).
   */
  const recordedUnread = (outcome: ResolvedStatus, ratingBefore: number | null) => {
    if (!prediction) return;
    const store = usePredictionStore.getState();
    // The lists held here, if their reload after the answer went through, can
    // still show the row holding something else than this answer since it was
    // opened: a reminder or another phone got there first and `resolve` left
    // it as it was. Then that is shown, as the read's copy would have been.
    const held = [...store.pending, ...store.resolved].find((p) => p.id === prediction.id);
    if (held && held.status !== outcome && held.status !== prediction.status) {
      setPrediction(held);
      return;
    }
    useStatsStore.getState().clearMilestone();
    if (store.streakCheckpointFrom === 'answer') store.clearStreakCheckpoint();
    haptics.resolve();
    if (outcome === 'skipped') {
      AccessibilityInfo.announceForAccessibility('Recorded: can’t tell.');
      onResolved?.('skipped');
      return;
    }
    // Whether it was answered the day it was logged (D41) is known without the
    // read: the row as it was opened, answered now. Said, so a same-day
    // answer isn't taken for a scored one.
    const sameDay = answeredSameDay({
      ...prediction,
      status: outcome,
      resolved_at: new Date().toISOString(),
    });
    setAnswered({
      outcome,
      line: sameDay
        ? rewordedLater(prediction)
          ? SAME_DAY_REWORDED_LINE
          : SAME_DAY_LINE
        : null,
      note: null,
      // Known before the answer, and only ever used to decide whether a
      // correction says the rating follows it (no figures, D50).
      ratingBefore,
      milestone: null,
      tierDrop: null,
      checkpoint: null,
      unlocked: false,
    });
    onAnswered?.();
    AccessibilityInfo.announceForAccessibility(recordedText(outcome));
  };

  const submit = async (outcome: ResolvedStatus) => {
    if (!prediction) return;
    setError(null);
    setSubmitting(true);
    try {
      // Anything left over belongs to an earlier change, not to this answer.
      // A log's checkpoint stays for Today, which shows it (step 194).
      useStatsStore.getState().clearMilestone();
      const leftover = usePredictionStore.getState();
      if (leftover.streakCheckpointFrom === 'answer') leftover.clearStreakCheckpoint();
      const ratingBefore = shownRating();
      await usePredictionStore
        .getState()
        .resolve(prediction.id, outcome, undefined, { answeringSkip });
      // The answer is saved once `resolve` returns. A read after it that
      // fails must not show an error, which invites answering again (security
      // review, 2026-11-18): the answer is shown from what is known instead.
      let landed: Prediction | null;
      try {
        landed = await usePredictionStore.getState().getById(prediction.id);
      } catch {
        recordedUnread(outcome, ratingBefore);
        return;
      }
      // A reminder action may have recorded this already. Don't celebrate an
      // outcome the row doesn't have, and don't leave on a skip that didn't land.
      if (!landed || landed.status !== outcome) {
        setPrediction(landed);
        return;
      }
      // One haptic for Yes, No and Skip alike — a No is not an error.
      haptics.resolve();
      if (outcome === 'skipped') {
        AccessibilityInfo.announceForAccessibility('Recorded: can’t tell.');
        onResolved?.('skipped');
        return;
      }
      // The row as it now stands: an answered skip's time is this answer's,
      // not the skip's.
      const ack = readAcknowledgement(landed, outcome, ratingBefore, ratingExplained);
      setAnswered(ack);
      onAnswered?.();
      if (ack.note?.endsWith(RATING_WHY)) onRatingExplained?.();
      // Said, as Log's "Saved." is: the screen changed under the finger and
      // nothing was announced (playtest 2026-11-08, finding 38).
      // With the badge it brought or took back, the same both ways (D60):
      // iOS ignores the cards' live regions, so VoiceOver heard neither, and
      // the web build spoke the gain only (blind playtest 2026-11-14, run 6).
      const badgeNews = [
        ack.milestone
          ? // The unlock's number is drawn on its card, not written in its title.
            ack.milestone.kind === 'rating_unlocked'
            ? `${milestoneCopy(ack.milestone).title}: ${ack.milestone.rating} out of 100.`
            : `${milestoneCopy(ack.milestone).title}.`
          : null,
        // The unlock's card carries a badge earned with it in its body.
        ack.milestone?.kind === 'rating_unlocked' && ack.milestone.badge
          ? `New badge, too: ${BADGE_META[ack.milestone.badge.badge].label} in ${categoryLabel(ack.milestone.badge.category)}.`
          : null,
        ack.tierDrop ? tierDropLine(ack.tierDrop) : null,
      ].filter(Boolean);
      const said =
        badgeNews.length > 0
          ? `${recordedText(outcome)}. ${badgeNews.join(' ')}`
          : recordedText(outcome);
      // With badge news, a moment later: the focused Yes or No button goes as
      // the screen changes, and the focus move cut a same-moment announcement
      // off on Log (code review 2026-11-12); the short one alone is as it was.
      if (badgeNews.length > 0) {
        if (announceTimer.current) clearTimeout(announceTimer.current);
        announceTimer.current = setTimeout(
          () => AccessibilityInfo.announceForAccessibility(said),
          600,
        );
      } else AccessibilityInfo.announceForAccessibility(said);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // Switches Yes and No in place (roadmap D34). It used to put the
  // prediction back to open, where "Can't tell" was one tap away: a miss could
  // be parked and answered later (blind playtest 2026-11-01). The reflection
  // typed so far stays; it's about the same prediction.
  const changeAnswer = async () => {
    if (!prediction || !answered) return;
    setError(null);
    setSubmitting(true);
    try {
      const outcome = answered.outcome === 'resolved_yes' ? 'resolved_no' : 'resolved_yes';
      const { ratingBefore } = answered;
      await usePredictionStore.getState().correct(prediction.id, outcome);
      // Badge news still waiting to be spoken was the first answer's: the
      // correction may just have taken it back (code review, round 2). After
      // the change, so a failed one leaves it to be said.
      if (announceTimer.current) {
        clearTimeout(announceTimer.current);
        announceTimer.current = null;
      }
      // Whether the switch can move a rating or badge on screen: a scored
      // answer, with a rating shown before it, by it (the unlock) or now.
      const moves =
        !isSameDayLine(answered.line) &&
        (answered.unlocked || ratingBefore !== null || shownRating() !== null);
      const stats = useStatsStore.getState();
      const bucket = stats.bucketFor(prediction.confidence);
      setAnswered({
        ...answered,
        outcome,
        // A same-day answer stays one after a correction (D34 keeps its time).
        line: isSameDayLine(answered.line)
          ? answered.line
          : stats.userStat?.total_resolved === 1
            ? firstAnswerLine(prediction.confidence)
            : bucket
              ? bucketLine(bucket)
              : null,
        // No rating line after a correction: both answers' effect on one
        // screen made a false outcome a one-tap comparison (record audit,
        // 2026-11-09). The meaning line still shows while provisional.
        // The unlocking answer's meaning line stays: it says nothing about the
        // outcome (code review 2026-11-12).
        note: answered.unlocked
          ? // The unlocking answer keeps its meaning line, and says the
            // rating follows the answer: its card, with the rating and any
            // badge, has just gone (D63; record audit and code review, round 2).
            moves
            ? withCorrected(answered.note)
            : answered.note
          : ratingBefore !== null || shownRating() !== null
            ? // No figures (D50), but no longer silence (D63): a badge with
              // confetti earned on a mis-tap went back with no word here.
              moves
              ? CORRECTED_NOTE
              : null
            : answerNote(
                prediction.confidence,
                isSameDayLine(answered.line) || stats.userStat?.total_resolved === 1,
                null,
              ),
        // What the first answer crossed isn't this one's to show, and a
        // badge's fall under the other answer would make it a one-tap
        // comparison, as the rating's move would (D50).
        milestone: null,
        tierDrop: null,
      });
      const changed =
        outcome === 'resolved_yes' ? 'Changed to: it happened.' : 'Changed to: it didn’t happen.';
      AccessibilityInfo.announceForAccessibility(
        moves ? `${changed} ${CORRECTED_NOTE}` : changed,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  /** Save any reflection, then leave: by default to wherever the screen goes. */
  const finish = async (then: () => void = () => onResolved?.()) => {
    if (!prediction) return;
    setError(null);
    setSubmitting(true);
    try {
      if (reflection.trim().length > 0) {
        await usePredictionStore.getState().reflect(prediction.id, reflection);
      }
      then();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!prediction) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundTitle}>Prediction not found</Text>
        <Text style={styles.notFoundBody}>
          It may have been deleted, or this link is for a different account.
        </Text>
      </View>
    );
  }

  if (answered) {
    // A same-day answer, which the advice line names (D41, D56): the same
    // whichever way it went, so the offer is identical after Yes and No (R8).
    const sameDayAnswer = isSameDayLine(answered.line);
    // "Log it again" names the date it brings, from the draft Log opens with.
    const again = logAgainWords(prediction);
    // Under the advice it belongs to it: close to the line, with the room
    // below it that the line's box usually keeps (D56).
    const tied = sameDayAnswer && onPredictAgain !== undefined;
    const repeat = openRepeatOf(prediction, pending);
    const againButton = repeat ? (
      <View style={tied ? styles.againTied : styles.again}>
        <Text style={styles.loggedAgain} testID="resolve-logged-again">
          {loggedAgainLine(repeat.due_date)}
        </Text>
      </View>
    ) : (
      <View style={tied ? styles.againTied : styles.again}>
        <Button
          label={`Log it again, due ${again.text}`}
          accessibilityLabel={`Log it again, due ${again.spoken}`}
          variant="secondary"
          onPress={() => void finish(() => onPredictAgain?.(prediction))}
          disabled={submitting}
          testID="resolve-again"
        />
      </View>
    );
    const dropLine = answered.tierDrop && (
      <Text style={styles.bucketNote} testID="resolve-tier-drop">
        {tierDropLine(answered.tierDrop)}
      </Text>
    );
    // Same acknowledgement for Yes and No (rule 0.4): no outcome colour, no
    // celebration — a precise, neutral "recorded".
    return (
      <View style={styles.wrap} testID="resolve-recorded">
        {/* Says which answer was recorded, in neutral ink: filled vs hollow
            glyph plus words, never green vs red (DESIGN_SYSTEM §2.4). */}
        <View style={styles.recordedRow}>
          <Icon
            sf={answered.outcome === 'resolved_yes' ? 'checkmark.circle.fill' : 'xmark.circle'}
            fallback={
              answered.outcome === 'resolved_yes' ? 'checkmark-circle' : 'close-circle-outline'
            }
            size={20}
            color={colors.textPrimary}
          />
          <Text style={styles.recorded} accessibilityRole="header" testID="resolve-recorded-label">
            {recordedText(answered.outcome)}
          </Text>
        </View>
        <Text style={styles.title} accessibilityLanguage={textLanguage(prediction.title)}>
          {prediction.title}
        </Text>
        {answered.milestone && <MilestoneCard milestone={answered.milestone} />}
        {/* CLAUDE.md names a checkpoint on the answer that earned it, so it
            shows even beside a score or badge milestone, after it: still
            then, since that milestone has the moment (step 194). */}
        {answered.checkpoint && streakShown && (
          <StreakCheckpointCard
            days={answered.checkpoint.days}
            next={answered.checkpoint.next}
            celebrate={answered.checkpoint.celebrate}
          />
        )}
        {answered.line && (
          <View style={[styles.bucketBox, tied && styles.bucketBoxTied]}>
            <Text style={styles.bucketLine} testID="resolve-bucket-line">
              {holdRanges(answered.line)}
            </Text>
            {answered.note && (
              <Text style={styles.bucketNote} testID="resolve-answer-note">
                {answered.note}
              </Text>
            )}
            {answered.tierDrop && dropLine}
          </View>
        )}
        {answered.tierDrop && !answered.line && dropLine}
        {/* The advice and its button together (roadmap D56). */}
        {onPredictAgain && sameDayAnswer && againButton}

        {reflectionOpen ? (
          <TextField
            label="Reflection (optional)"
            value={reflection}
            onChangeText={setReflection}
            // The same for Yes and No: "What surprised you?" read as a grade
            // after a miss (blind playtest 2026-11-09b, finding 6).
            placeholder="Anything to remember about this one?"
            multiline
            maxLength={500}
            testID="reflection-field"
          />
        ) : (
          <Pressable
            onPress={() => setReflectionOpen(true)}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.addReflection}
            testID="resolve-add-reflection"
          >
            <Text style={styles.changeAnswerText}>Add a reflection</Text>
          </Pressable>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Button
          label={submitting ? 'Saving…' : advanceLabel}
          onPress={() => void finish()}
          disabled={submitting}
          testID="resolve-done"
        />
        {onPredictAgain && !sameDayAnswer && againButton}
        {/* A mis-tap shouldn't be permanent (HIG: let people undo). */}
        <Pressable
          onPress={() => void changeAnswer()}
          disabled={submitting}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.changeAnswer}
          testID="resolve-change"
        >
          <Text style={styles.changeAnswerText}>
            {answered.outcome === 'resolved_yes'
              ? 'Change to: it didn’t happen'
              : 'Change to: it happened'}
          </Text>
        </Pressable>
      </View>
    );
  }

  // A skip can be taken back (roadmap step 39). It never counted, so
  // answering it later can't move a score after the fact, and a mis-tap on
  // "Can't tell" otherwise had no undo (HIG: let people undo). Only for a
  // week past its due day (D45): open forever, a call that looked bad could
  // be parked as a skip and only the good ones answered.
  const answerBy = prediction.status === 'skipped' ? skipAnswerBy(prediction) : null;
  if (prediction.status === 'skipped' && !(answeringSkip && answerBy)) {
    return (
      <View style={styles.center} testID="resolve-skipped">
        <Text style={styles.notFoundTitle}>Not scored</Text>
        {answerBy ? (
          <Text style={[styles.notFoundBody, styles.skippedBody]} testID="resolve-skip-open">
            You marked “{prediction.title}” as can’t tell. If you can tell now, answer it
            and it counts like any other. You can answer it until the end of{' '}
            {endSentence(formatDay(answerBy))}
          </Text>
        ) : (
          <Text style={[styles.notFoundBody, styles.skippedBody]} testID="resolve-skip-closed">
            You marked “{prediction.title}” as can’t tell. It’s more than a week past its due
            day, so it stays that way and isn’t scored.
          </Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        {answerBy && (
          <Button
            label="Answer it now"
            variant="secondary"
            onPress={() => {
              setAnsweringSkip(true);
              // The button goes with the screen it was on; say what replaced it.
              AccessibilityInfo.announceForAccessibility('Did it happen?');
            }}
            disabled={submitting}
            testID="resolve-unskip"
          />
        )}
      </View>
    );
  }

  // Opened again once answered (a reload, a second tap on a reminder): its
  // details, which say what was recorded and, for a day, can change it (D34).
  // A bare "Already resolved" left a mis-tap hunting through History (blind
  // playtest 2026-11-04, third round, run 5).
  if (prediction.status === 'resolved_yes' || prediction.status === 'resolved_no') {
    return (
      <AnsweredDetails
        prediction={prediction}
        onChanged={setPrediction}
        onClose={() => onResolved?.()}
        // A typed note asks before a swipe, as the reflection does (D62).
        onDirtyChange={(d) => onDraftChange?.(d ? 'note' : '')}
      />
    );
  }
  // Can't tell isn't final for a while (D45), and the line said only that it
  // won't count, which read as final (blind playtest 2026-11-13b, runs 2 and
  // 4; roadmap D60): the last day it could still be answered, as if chosen now.
  const skipBy = skipAnswerBy({
    ...prediction,
    status: 'skipped',
    resolved_at: new Date().toISOString(),
  });
  const skipNote = skipBy
    ? `It won't count toward your score. ${endSentence(`You can still answer it until the end of ${formatDay(skipBy)}`)}`
    : "It won't count toward your score.";

  if (prediction.status !== 'pending' && prediction.status !== 'skipped') {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundTitle}>Already answered</Text>
        <Text style={styles.notFoundBody}>This prediction has already been recorded.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* The stated confidence comes first, before the outcome is asked for:
          once people know how it turned out they misremember how sure they
          were (hindsight bias; DESIGN_SYSTEM §7.10). */}
      <Text style={styles.stated} testID="resolve-stated">
        On {formatLogged(prediction.created_at)} you said{' '}
        <Text style={styles.statedNumber}>{prediction.confidence}%</Text>
        {/* Answered after its due day, the day it was about: "today" in a
            title three weeks old read as this morning (blind playtest
            2026-11-13b, run 7; roadmap D60). */}
        {daysUntilDue(prediction, new Date()) < 0
          ? `. ${endSentence(`It was due ${formatLogged(prediction.due_date)}`)}`
          : ''}
      </Text>
      <View style={styles.categoryRow}>
        <CategoryIcon category={prediction.category} size={14} color={colors.textSecondary} />
        <Text style={styles.category} numberOfLines={1}>
          {categoryTitle(prediction.category)}
        </Text>
      </View>
      <Text style={styles.title} accessibilityLanguage={textLanguage(prediction.title)}>
        {prediction.title}
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Said before the answer, not only after it (roadmap D41): finding
          out once Yes is tapped read as a trick (blind playtest 2026-11-04). */}
      {/* Not when Answer it now's confirmation said it a moment ago (D56). */}
      {answerNowIsSameDay(prediction) && !sameDayWarned && (
        <Text style={styles.sameDayNote} testID="resolve-same-day">
          {sameDayHeadsUp(rewordedLater(prediction))}
        </Text>
      )}

      <Text style={styles.question} accessibilityRole="header">
        Did it happen?
      </Text>
      {/* Yes and No share one neutral style: a No is an outcome, not a
          failure, and red is for destructive actions (DESIGN_SYSTEM §7.10). */}
      <View style={styles.row}>
        <View style={styles.answer}>
          <Button
            label={submitting ? '…' : 'Yes'}
            variant="secondary"
            onPress={() => submit('resolved_yes')}
            disabled={submitting}
            testID="resolve-yes"
          />
        </View>
        <View style={styles.answer}>
          <Button
            label={submitting ? '…' : 'No'}
            variant="secondary"
            onPress={() => submit('resolved_no')}
            disabled={submitting}
            testID="resolve-no"
          />
        </View>
      </View>
      {/* Skip is not a peer of Yes and No: equal weight would make dodging a
          miss as cheap as recording it. Skips are excluded from the score,
          the streak and Wrapped alike, so the line below is true everywhere
          (DESIGN_SYSTEM §7.10, roadmap D10). */}
      {prediction.status === 'skipped' ? (
        // Answering a Can't tell: nothing is written yet, so going back
        // leaves it as it was.
        <Pressable
          onPress={() => {
            setAnsweringSkip(false);
            AccessibilityInfo.announceForAccessibility('Left as can’t tell.');
          }}
          disabled={submitting}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.skip}
          testID="resolve-keep-skip"
        >
          <Text style={styles.skipText}>Leave it as can’t tell</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => void submit('skipped')}
          disabled={submitting}
          accessibilityRole="button"
          // The note in the label, not only the hint, which screen readers can
          // skip (playtest 2026-11-08, finding 39).
          accessibilityLabel={`Can't tell / doesn't apply. ${skipNote}`}
          hitSlop={8}
          style={styles.skip}
          testID="resolve-skip"
        >
          <Text style={styles.skipText}>Can't tell / doesn't apply</Text>
          <Text style={styles.skipNote} testID="resolve-skip-note">
            {skipNote}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** What Resolve says it recorded, on screen and to VoiceOver. */
function recordedText(outcome: 'resolved_yes' | 'resolved_no'): string {
  return outcome === 'resolved_yes' ? 'Recorded: it happened' : 'Recorded: it didn’t happen';
}

/** The note with the correction's line after it, once. */
function withCorrected(note: string | null): string {
  if (!note) return CORRECTED_NOTE;
  return note.endsWith(CORRECTED_NOTE) ? note : `${note} ${CORRECTED_NOTE}`;
}

/** "3 Sep" in the user's locale. */
function formatLogged(iso: string): string {
  return localDate(new Date(iso), { day: 'numeric', month: 'short' });
}

/** "Thu, Nov 13": the last day a skip can be answered (D45). */
function formatDay(day: Date): string {
  return localDate(day, { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.lg, backgroundColor: colors.canvas },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    backgroundColor: colors.canvas,
  },
  stated: { ...type.title3, color: colors.textSecondary, marginBottom: space.md },
  statedNumber: {
    ...type.title1,
    ...tabularNums,
    fontFamily: FONT_FAMILY,
    color: colors.textPrimary,
  },
  // One line beside its icon: a long name ends in an ellipsis instead of
  // running off the sheet (playtest 2026-11-08, finding 1).
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    flexShrink: 1,
    fontWeight: '600',
  },
  title: { ...type.title2, color: colors.textPrimary, marginBottom: space.xxl },
  question: { ...type.headline, color: colors.textPrimary, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  // Yes and No share the width equally.
  answer: { flex: 1 },
  skip: { alignItems: 'center', marginTop: space.lg, minHeight: 44, paddingVertical: space.sm },
  skipText: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
  skipNote: { ...type.footnote, color: colors.textSecondary, marginTop: space.xxs },
  sameDayNote: { ...type.footnote, color: colors.textSecondary, marginBottom: space.md },
  recordedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.sm,
  },
  recorded: { ...type.headline, color: colors.textPrimary },
  bucketBox: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    marginBottom: space.xxl,
    padding: space.lg,
  },
  bucketLine: { ...type.callout, color: colors.textPrimary },
  bucketNote: { ...type.footnote, color: colors.textSecondary, marginTop: space.sm },
  changeAnswer: { alignSelf: 'center', marginTop: space.lg, paddingVertical: space.sm },
  again: { marginTop: space.sm },
  bucketBoxTied: { marginBottom: space.md },
  loggedAgain: { ...type.subhead, color: colors.textSecondary, textAlign: 'center' },
  againTied: { marginBottom: space.xxl },
  addReflection: { alignSelf: 'flex-start', marginBottom: space.lg, paddingVertical: space.sm },
  changeAnswerText: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.xs,
  },
  error: { ...type.subhead, color: colors.destructive, marginBottom: space.md },
  notFoundTitle: { ...type.headline, color: colors.textPrimary, marginBottom: space.sm },
  notFoundBody: { ...type.subhead, color: colors.textSecondary, textAlign: 'center' },
  skippedBody: { marginBottom: space.lg },
});
