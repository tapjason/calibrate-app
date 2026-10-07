import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isReadyToResolve, RUN_THRESHOLD } from '@/components/prediction/dueGroups';
import { expectedLine } from '@/components/share/wrappedCopy';
import { StreakLine } from '@/components/stats/StreakLine';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, radius, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import type { AnswerTally } from '@/types';

import { ResolvePrompt } from './ResolvePrompt';

/** Home offers a run once this many predictions are ready (roadmap step 18). */
export { RUN_THRESHOLD };

/**
 * What the run came to (roadmap step 65): "3 answered. 2 happened. You
 * expected about 2." Counts against the user's own numbers, as Wrapped says
 * it, so it compares confidence with reality without a verdict at n = 3; a
 * hit rate alone would reward safe calls. Null when nothing was answered
 * here (everything was resolved elsewhere meanwhile).
 */
export function runSummary(tally: AnswerTally): string | null {
  const { resolved, skipped } = tally;
  if (resolved === 0 && skipped === 0) return null;
  if (resolved === 0) return `${skipped} marked can't tell.`;
  const answered = skipped > 0 ? `${resolved} answered, ${skipped} can't tell.` : `${resolved} answered.`;
  const expected = expectedLine(tally);
  return expected ? `${answered} ${expected}` : answered;
}

interface ResolveRunProps {
  /** Leave the run: after "All caught up", or straight away if nothing is ready. */
  onClose: () => void;
  /** The current card's unsaved reflection, so the screen can guard a dismissal. */
  onDraftChange?: (predictionId: string, draft: string) => void;
  /** The × beside the progress (roadmap step 79): leave mid-run. */
  onDismiss?: () => void;
}

/**
 * Resolve every ready prediction in one sitting (roadmap step 18). A backlog
 * of overdue predictions is where people quit, and resolution is what feeds
 * the data.
 *
 * One ResolvePrompt at a time, in due order. Yes or No shows the usual
 * acknowledgement and waits for **Next**: an automatic advance would take the
 * pace away from the user (WCAG 2.2.1) and hide the bucket line. Skip moves on
 * at once, as it does alone. A milestone appears on the card that earned it.
 *
 * The queue is a snapshot taken when the run opens, so a sync landing midway
 * can't reshuffle it; a card resolved elsewhere in the meantime is passed over.
 */
export function ResolveRun({ onClose, onDraftChange, onDismiss }: ResolveRunProps) {
  const [queue] = useState<string[]>(() => {
    const now = new Date();
    return usePredictionStore
      .getState()
      .pending.filter((p) => isReadyToResolve(p, now))
      .sort((a, b) => (Date.parse(a.due_date) || 0) - (Date.parse(b.due_date) || 0))
      .map((p) => p.id);
  });
  const [index, setIndex] = useState(0);
  // The cards answered here, as against the queue: one answered elsewhere and
  // passed over isn't part of what this run came to.
  const [answeredHere, setAnsweredHere] = useState<string[]>([]);

  // Stable per card, so ResolvePrompt's draft effect doesn't re-fire on
  // every render of the run.
  const currentId = queue[index];
  const reportDraft = useCallback(
    (draft: string) => {
      if (currentId) onDraftChange?.(currentId, draft);
    },
    [currentId, onDraftChange],
  );

  const advance = () => {
    setAnsweredHere((ids) => [...ids, queue[index]]);
    const stillOpen = new Set(usePredictionStore.getState().pending.map((p) => p.id));
    let next = index + 1;
    while (next < queue.length && !stillOpen.has(queue[next])) next += 1;
    setIndex(next);
  };

  if (index >= queue.length) {
    const predictions = usePredictionStore.getState();
    const summary = answeredHere.length > 0 ? runSummary(predictions.tallyFor(answeredHere)) : null;
    return (
      <View style={styles.done} testID="resolve-run-done">
        <Text style={styles.doneTitle} accessibilityRole="header">
          All caught up
        </Text>
        {/* The tally says what "caught up" came to; without one, the line
            says why the run is empty. */}
        {summary ? (
          <Text style={styles.summary} testID="resolve-run-summary">
            {summary}
          </Text>
        ) : (
          <Text style={styles.doneBody}>
            {queue.length === 0
              ? 'Nothing is ready to resolve right now.'
              : 'Every prediction that was ready has an answer.'}
          </Text>
        )}
        {/* Three answers make a day count, so a run usually just did: say
            where the streak stands, checkpoint tint and all. */}
        {queue.length > 0 && (
          <StreakLine status={predictions.streakNow()} testID="resolve-run-streak" />
        )}
        <Button label="Done" onPress={onClose} testID="resolve-run-close" />
      </View>
    );
  }

  const id = queue[index];
  const last = index === queue.length - 1;
  const progress = (index + 1) / queue.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Prediction ${index + 1} of ${queue.length}`}
          accessibilityValue={{ min: 0, max: queue.length, now: index + 1 }}
          testID="resolve-run-progress"
        >
          <Text style={styles.count}>
            {index + 1} of {queue.length}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        {onDismiss && <CloseButton onPress={onDismiss} testID="resolve-run-dismiss" />}
      </View>
      {/* A new key per card: each one starts fresh, with its own answer and
          reflection state. */}
      <ResolvePrompt
        key={id}
        predictionId={id}
        advanceLabel={last ? 'Finish' : 'Next'}
        reflectionCollapsed
        onResolved={advance}
        onDraftChange={reportDraft}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  progress: { flex: 1, gap: space.xs },
  count: { ...type.eyebrow, color: colors.textSecondary },
  track: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    height: 4,
    overflow: 'hidden',
  },
  fill: { backgroundColor: colors.brand600, height: 4 },
  done: { flex: 1, gap: space.md, justifyContent: 'center', padding: space.xxl },
  doneTitle: { ...type.title2, color: colors.textPrimary },
  doneBody: { ...type.subhead, color: colors.textSecondary },
  summary: { ...type.body, color: colors.textPrimary },
});
