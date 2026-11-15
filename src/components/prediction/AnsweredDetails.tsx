import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { localTime } from '@/constants/locale';
import { localDate } from '@/components/ui/dates';
import { textLanguage } from '@/components/ui/textLanguage';
import { CategoryChips } from '@/components/prediction/CategoryChips';
import { loggedAgainLine, logAgainWords } from '@/components/prediction/dueWords';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { TextButton } from '@/components/ui/TextButton';
import { TextField } from '@/components/ui/TextField';
import { colors, FONT_FAMILY, space, tabularNums, type } from '@/constants/theme';
import {
  answeredBefore,
  correctionWindow,
  deleteIsCounted,
  refileIsCounted,
  rewordedLater,
  openRepeatOf,
  usePredictionStore,
} from '@/store/predictionStore';
import type { Category, Prediction } from '@/types';
import { categoryTitle, useCategoryStore } from '@/store/categoryStore';
import { answeredSameDay, useStatsStore } from '@/store/statsStore';

interface AnsweredDetailsProps {
  prediction: Prediction;
  /** The prediction as it now stands, after a correction or a re-file. */
  onChanged: (next: Prediction) => void;
  onClose: () => void;
  /** Read the clock from outside in tests; the screen passes nothing. */
  now?: Date;
  /**
   * "Log it again" (roadmap D56): offered here at any time, not only right
   * after the answer, since a tester repeating his daily walk went to History
   * and retyped it (blind playtest 2026-11-10, run 2).
   */
  onPredictAgain?: (prediction: Prediction) => void;
  /** Whether a typed note waits unsaved, for the sheet's draft guard (D62). */
  onDirtyChange?: (dirty: boolean) => void;
}

const shortDate = (iso: string) =>
  localDate(new Date(iso), { weekday: 'short', day: 'numeric', month: 'short' });

/** "6:00 PM today" or "6:00 PM tomorrow": when the window closes. */
function closesAt(until: Date, now: Date): string {
  const time = localTime(until, { hour: 'numeric', minute: '2-digit' });
  const day = until.toDateString() === now.toDateString() ? 'today' : 'tomorrow';
  return `${time}\u00A0${day}`;
}

/**
 * After a correction: the rating and any badge now follow the answer as it
 * stands. No figures, so the other answer's effect isn't a one-tap comparison
 * (D50), but no longer silence: a badge earned on a mis-tap went back to
 * Tracker, and 88 to 86, with no word (blind playtest 2026-11-14, run 5; D60's
 * open item).
 */
export const CORRECTED_NOTE =
  'Your rating and badges now follow this answer, so they may have moved.';

/**
 * After moving an answer to another category inside its window: each
 * category's score and badge follow where it's filed. The one way left to
 * take a scored miss out of a category's score with no word (record audit,
 * round 2). Since step 184 (D65) Insights counts it: `REFILE_COUNTED_HINT`.
 */
export const REFILED_NOTE =
  'Each category’s score and badge now follow where this is filed, so they may have moved.';

/**
 * Under the category chips of a scored answer (step 184, D65), before a move
 * and after: a count nobody was told about reads as being caught, so it is
 * said first, as a delete's is. True whichever way the answer was last
 * moved, since one moved back is off the count.
 */
export const REFILE_COUNTED_HINT =
  'Insights counts a scored answer left in a different category from the one it was answered in.';

/** Whether switching this answer can move a rating or a badge on screen. */
export function correctionMoves(prediction: Prediction): boolean {
  if (answeredSameDay(prediction)) return false;
  const userStat = useStatsStore.getState().userStat;
  return userStat !== null && !userStat.rating_is_provisional;
}

/**
 * An answered prediction, opened from History (roadmap D34). For a day after
 * the answer it can be switched between Yes and No, moved to another
 * category or deleted, since three blind testers had a mistaken or misfiled
 * answer they couldn't fix; after that it is the record, and this says so.
 * Never "Can't tell": that was how a miss got parked.
 */
export function AnsweredDetails({
  prediction,
  onChanged,
  onClose,
  now,
  onPredictAgain,
  onDirtyChange,
}: AnsweredDetailsProps) {
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  const [busy, setBusy] = useState(false);
  // The answer was switched here: say what follows it (step 181).
  const [switched, setSwitched] = useState(false);
  const [refiled, setRefiled] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A note added or changed after the answer (D62): it changes no number,
  // and leaving Resolve lost one (blind playtest 2026-11-13c, finding 14).
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const noteDirty =
    noteDraft !== null && noteDraft.trim() !== (prediction.reflection ?? '').trim();
  useEffect(() => {
    onDirtyChange?.(noteDirty);
  }, [noteDirty, onDirtyChange]);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the store refuses a change, so a window that closed while the
  // sheet was open is read again and the controls go.
  const [, setChecked] = useState(0);
  const at = now ?? new Date();
  const until = correctionWindow(prediction, at);
  const happened = prediction.status === 'resolved_yes';
  // The same words already open: say so instead of offering a second copy.
  const pending = usePredictionStore((s) => s.pending);
  const resolvedList = usePredictionStore((s) => s.resolved);
  const repeat = openRepeatOf(prediction, pending);
  const again = logAgainWords(prediction, at);

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[answered] change failed:', e);
      const message = e instanceof Error ? e.message : '';
      // The store's own sentence when the window has closed, not "Try again".
      setError(message.startsWith('This answer is part of the record') ? message : failure);
      setChecked((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    const next = await usePredictionStore.getState().getById(prediction.id);
    if (next) onChanged(next);
  };

  const switchAnswer = () =>
    run(async () => {
      await usePredictionStore
        .getState()
        .correct(prediction.id, happened ? 'resolved_no' : 'resolved_yes');
      haptics.commit();
      await reload();
      setSwitched(true);
      // The line only where something can move: a scored answer, with the
      // rating unlocked (no badge moves under 20 either). Seen and spoken
      // alike (record audit of step 181).
      const changed = `Changed to: ${happened ? 'it didn’t happen' : 'it happened'}.`;
      AccessibilityInfo.announceForAccessibility(
        correctionMoves(prediction) ? `${changed} ${CORRECTED_NOTE}` : changed,
      );
    }, "Couldn't change that. Try again.");

  const refile = (category: Category) => {
    if (category === prediction.category) return;
    void run(async () => {
      await usePredictionStore.getState().refile(prediction.id, category);
      haptics.commit();
      await reload();
      setRefiled(true);
      const moved = `Moved to ${categoryTitle(category)}.`;
      AccessibilityInfo.announceForAccessibility(
        correctionMoves(prediction) ? `${moved} ${REFILED_NOTE}` : moved,
      );
    }, "Couldn't move that. Try again.");
  };

  // A note changes no number, so it can go at any time: after a switch it
  // can read as the opposite of the answer (blind playtest 2026-11-04,
  // second round, run 3), and it is the person's own words.
  const removeNote = () =>
    run(async () => {
      await usePredictionStore.getState().reflect(prediction.id, '');
      await reload();
    }, "Couldn't remove that. Try again.");

  const saveNote = () =>
    run(async () => {
      await usePredictionStore.getState().reflect(prediction.id, noteDraft ?? '');
      setNoteDraft(null);
      await reload();
    }, "Couldn't save that. Try again.");

  const remove = () =>
    run(async () => {
      await usePredictionStore.getState().remove(prediction.id);
      onClose();
    }, "Couldn't delete that. Try again.");

  return (
    <View style={styles.wrap} testID="answered-details">
      <Text style={styles.stated} testID="answered-stated">
        On {localDate(new Date(prediction.created_at), { day: 'numeric', month: 'short' })}{' '}
        you said <Text style={styles.statedNumber}>{prediction.confidence}%</Text>
      </Text>
      <View style={styles.categoryRow}>
        <CategoryIcon category={prediction.category} size={14} color={colors.textSecondary} />
        <Text style={styles.category} numberOfLines={1} testID="answered-category">
          {categoryTitle(prediction.category)}
        </Text>
      </View>
      <Text style={styles.title} accessibilityLanguage={textLanguage(prediction.title)}>
        {prediction.title}
      </Text>
      {/* Glyph and words in neutral ink, the same for Yes and No (§2.4). */}
      <View style={styles.outcomeRow}>
        <Icon
          sf={happened ? 'checkmark.circle.fill' : 'xmark.circle'}
          fallback={happened ? 'checkmark-circle' : 'close-circle-outline'}
          size={18}
          color={colors.textPrimary}
        />
        <Text style={styles.outcome} testID="answered-outcome">
          {happened ? 'It happened' : 'It didn’t happen'}
          {prediction.resolved_at ? `, answered ${shortDate(prediction.resolved_at)}` : ''}
        </Text>
      </View>
      {switched && correctionMoves(prediction) && (
        <Text style={styles.body} testID="answered-corrected">
          {CORRECTED_NOTE}
        </Text>
      )}
      {refiled && correctionMoves(prediction) && (
        <Text style={styles.body} testID="answered-refiled">
          {REFILED_NOTE}
        </Text>
      )}
      {answeredSameDay(prediction) && (
        <Text style={styles.body} testID="answered-same-day">
          {/* The why (How scoring works' reason, D41) and what to do (D56) (blind
              playtest 2026-11-12c, finding 17: only the what was here). */}
          {rewordedLater(prediction)
            ? 'Answered the day its words changed, so it isn’t scored: new words count as a new prediction, and a call made and settled in one day says little.'
            : `Answered the day it was logged, so it isn’t scored: a call made and settled in one day says little. From the next day, an answer is scored.${
                // The habit tip only on a repeat (D62).
                answeredBefore(prediction, resolvedList)
                  ? ' For something you do every day, log the next one the evening before.'
                  : ''
              }`}
        </Text>
      )}
      {onPredictAgain &&
        (repeat ? (
          <Text style={styles.body} testID="answered-logged-again">
            {loggedAgainLine(repeat.due_date, at)}
          </Text>
        ) : (
          <View style={styles.again}>
            <Button
              label={`Log it again, due ${again.text}`}
              accessibilityLabel={`Log it again, due ${again.spoken}`}
              variant="secondary"
              onPress={() => onPredictAgain(prediction)}
              disabled={busy}
              testID="answered-again"
            />
          </View>
        ))}
      {noteDraft !== null ? (
        <View style={styles.noteRow} testID="answered-note-edit">
          <TextField
            label="Note"
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder="Anything to remember about this one?"
            multiline
            maxLength={500}
            autoFocus
            testID="answered-note-field"
          />
          <Button
            label={busy ? 'Saving…' : 'Save note'}
            onPress={() => void saveNote()}
            disabled={busy}
            testID="answered-note-save"
          />
          <TextButton
            label="Cancel"
            onPress={() => {
              if (!busy) setNoteDraft(null);
            }}
            testID="answered-note-cancel"
          />
        </View>
      ) : prediction.reflection ? (
        <View style={styles.noteRow}>
          <Text style={styles.reflection} testID="answered-reflection">
            “{prediction.reflection}”
          </Text>
          <TextButton
            label="Change note"
            onPress={() => setNoteDraft(prediction.reflection ?? '')}
            testID="answered-change-note"
          />
          <TextButton
            label="Remove note"
            onPress={() => void removeNote()}
            testID="answered-remove-note"
          />
        </View>
      ) : (
        <TextButton
          label="Add a note"
          onPress={() => setNoteDraft('')}
          testID="answered-add-note"
        />
      )}

      {until === null && error && <Text style={styles.error}>{error}</Text>}
      {until === null ? (
        <Text style={styles.body} testID="answered-locked">
          Answers can be changed for a day after they’re given. After that they stay as they
          are, whichever way they went, so the record can’t be rewritten later. This one is
          part of your record now.
        </Text>
      ) : (
        <>
          <Text style={styles.body} testID="answered-window">
            Until {closesAt(until, at)} you can change the answer, move it to another category or
            delete it. After that it’s part of your record.
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          {confirmingDelete ? (
            <View style={styles.actions} testID="answered-delete-confirm">
              <Text style={styles.body} testID="answered-delete-text">
                {/* A scored answer leaves a count behind (roadmap D45). */}
                {deleteIsCounted(prediction)
                  ? 'Delete this prediction? Its answer leaves your scores, and Insights will count it as deleted after answering. This can’t be undone.'
                  : 'Delete this prediction? It won’t count anywhere, and it can’t be undone.'}
              </Text>
              <Button
                label={busy ? 'Deleting…' : 'Delete'}
                variant="danger"
                onPress={() => void remove()}
                disabled={busy}
                testID="answered-delete-yes"
              />
              <TextButton
                label="Cancel"
                onPress={() => setConfirmingDelete(false)}
                testID="answered-delete-cancel"
              />
            </View>
          ) : (
            <>
              <View style={styles.actions}>
                <Button
                  label={happened ? 'Change to: it didn’t happen' : 'Change to: it happened'}
                  variant="secondary"
                  onPress={() => void switchAnswer()}
                  disabled={busy}
                  testID="answered-switch"
                />
              </View>
              <Text style={styles.label}>Category</Text>
              <CategoryChips value={prediction.category} onChange={refile} />
              {refileIsCounted(prediction) && (
                <Text style={styles.body} testID="answered-refile-hint">
                  {REFILE_COUNTED_HINT}
                </Text>
              )}
              <View style={styles.actions}>
                <TextButton
                  label="Delete"
                  destructive
                  onPress={() => setConfirmingDelete(true)}
                  testID="answered-delete"
                />
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.sm },
  body: { ...type.body, color: colors.textSecondary, marginTop: space.md },
  stated: { ...type.title3, color: colors.textSecondary },
  statedNumber: { ...type.title1, ...tabularNums, fontFamily: FONT_FAMILY, color: colors.textPrimary },
  categoryRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  // One line beside its icon: a long name ends in an ellipsis instead of
  // running off the sheet (playtest 2026-11-08, finding 1).
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    flexShrink: 1,
    fontWeight: '600',
  },
  title: { ...type.title2, color: colors.textPrimary },
  outcomeRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  outcome: { ...type.subhead, color: colors.textPrimary, flexShrink: 1 },
  noteRow: { alignItems: 'flex-start', gap: space.xs },
  reflection: { ...type.footnote, color: colors.textSecondary, fontStyle: 'italic' },
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary, marginTop: space.lg },
  actions: { gap: space.sm, marginTop: space.lg },
  // 12 pt below the outcome, and the correction controls keep their own
  // margin below it, so a thumb aiming for one doesn't land on the other.
  again: { marginTop: space.md },
  error: { ...type.subhead, color: colors.destructive },
});
