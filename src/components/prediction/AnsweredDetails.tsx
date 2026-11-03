import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CategoryChips } from '@/components/prediction/CategoryChips';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { TextButton } from '@/components/ui/TextButton';
import { colors, FONT_FAMILY, space, tabularNums, type } from '@/constants/theme';
import { correctionWindow, usePredictionStore } from '@/store/predictionStore';
import type { Category, Prediction } from '@/types';
import { categoryTitle, useCategoryStore } from '@/store/categoryStore';
import { answeredSameDay } from '@/store/statsStore';

interface AnsweredDetailsProps {
  prediction: Prediction;
  /** The prediction as it now stands, after a correction or a re-file. */
  onChanged: (next: Prediction) => void;
  onClose: () => void;
  /** Read the clock from outside in tests; the screen passes nothing. */
  now?: Date;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** "6:00 PM today" or "6:00 PM tomorrow": when the window closes. */
function closesAt(until: Date, now: Date): string {
  const time = until.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = until.toDateString() === now.toDateString() ? 'today' : 'tomorrow';
  return `${time}\u00A0${day}`;
}

/**
 * An answered prediction, opened from History (roadmap D34). For a day after
 * the answer it can be switched between Yes and No, moved to another
 * category or deleted, since three blind testers had a mistaken or misfiled
 * answer they couldn't fix; after that it is the record, and this says so.
 * Never "Can't tell": that was how a miss got parked.
 */
export function AnsweredDetails({ prediction, onChanged, onClose, now }: AnsweredDetailsProps) {
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the store refuses a change, so a window that closed while the
  // sheet was open is read again and the controls go.
  const [, setChecked] = useState(0);
  const at = now ?? new Date();
  const until = correctionWindow(prediction, at);
  const happened = prediction.status === 'resolved_yes';

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
    }, "Couldn't change that. Try again.");

  const refile = (category: Category) => {
    if (category === prediction.category) return;
    void run(async () => {
      await usePredictionStore.getState().refile(prediction.id, category);
      haptics.commit();
      await reload();
    }, "Couldn't move that. Try again.");
  };

  const remove = () =>
    run(async () => {
      await usePredictionStore.getState().remove(prediction.id);
      onClose();
    }, "Couldn't delete that. Try again.");

  return (
    <View style={styles.wrap} testID="answered-details">
      <Text style={styles.stated} testID="answered-stated">
        On {new Date(prediction.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{' '}
        you said <Text style={styles.statedNumber}>{prediction.confidence}%</Text>
      </Text>
      <View style={styles.categoryRow}>
        <CategoryIcon category={prediction.category} size={14} color={colors.textSecondary} />
        <Text style={styles.category} testID="answered-category">
          {categoryTitle(prediction.category)}
        </Text>
      </View>
      <Text style={styles.title}>{prediction.title}</Text>
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
      {answeredSameDay(prediction) && (
        <Text style={styles.body} testID="answered-same-day">
          Answered the day it was logged, so it isn’t scored.
        </Text>
      )}
      {prediction.reflection && (
        <Text style={styles.reflection}>“{prediction.reflection}”</Text>
      )}

      {until === null && error && <Text style={styles.error}>{error}</Text>}
      {until === null ? (
        <Text style={styles.body} testID="answered-locked">
          Answers can be changed for a day after they’re given. This one is part of your record
          now.
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
              <Text style={styles.body}>
                Delete this prediction? It won’t count anywhere, and it can’t be undone.
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
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  title: { ...type.title2, color: colors.textPrimary },
  outcomeRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  outcome: { ...type.subhead, color: colors.textPrimary, flexShrink: 1 },
  reflection: { ...type.footnote, color: colors.textSecondary, fontStyle: 'italic' },
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary, marginTop: space.lg },
  actions: { gap: space.sm, marginTop: space.lg },
  error: { ...type.subhead, color: colors.destructive },
});
