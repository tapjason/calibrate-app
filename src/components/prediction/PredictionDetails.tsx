import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { CategoryChips } from '@/components/prediction/CategoryChips';
import { datePresets, DueDateChips } from '@/components/prediction/DueDateChips';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { CategoryIcon } from '@/components/ui/Icon';
import { TextButton } from '@/components/ui/TextButton';
import { TextField } from '@/components/ui/TextField';
import { colors, FONT_FAMILY, space, tabularNums, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Category, Prediction } from '@/types';

/** As Log's field: long enough for a sentence, short enough for a reminder. */
const TITLE_MAX_LENGTH = 200;

interface PredictionDetailsProps {
  predictionId: string;
  /** Close the sheet: after a delete, or from the ×. */
  onClose: () => void;
  /** Answer it now: the route opens Resolve in this sheet's place. */
  onAnswer: (id: string) => void;
}

type Mode = 'view' | 'edit' | 'delete' | 'early';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * An open prediction that isn't due yet (roadmap D25, DESIGN_SYSTEM §7.23):
 * what you said and when, the due date, then Edit (title, category and due
 * date, never the confidence: it's the record), Answer it now (early, after
 * one line that says so) and Delete (after a confirmation). Two blind
 * testers tapped a prediction due next week, landed on Yes/No with no due
 * date on screen, and had no way to fix a typo.
 *
 * The id arrives untrusted (a URL); predictionStore.getById applies the
 * owner filter, as Resolve's does.
 */
export function PredictionDetails({ predictionId, onClose, onAnswer }: PredictionDetailsProps) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remindersOn = useSettingsStore((s) => s.notificationsEnabled && s.remindersEnabled);

  // The edit draft, and the presets frozen when editing starts (as on Log).
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [presets, setPresets] = useState(datePresets);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setPrediction(await usePredictionStore.getState().getById(predictionId));
      } finally {
        setLoading(false);
      }
    })();
  }, [predictionId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand600} />
      </View>
    );
  }
  if (!prediction || prediction.status !== 'pending') {
    return (
      <View style={styles.center} testID="details-missing">
        <Text style={styles.heading}>This prediction isn't open</Text>
        <Text style={styles.body}>It may have been answered or deleted.</Text>
      </View>
    );
  }

  const startEditing = () => {
    setTitle(prediction.title);
    setCategory(prediction.category);
    setDueDate(prediction.due_date);
    setPresets(datePresets());
    setPicking(false);
    setError(null);
    setMode('edit');
  };

  const saveEdit = async () => {
    if (category === null || title.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await usePredictionStore.getState().update(prediction.id, {
        title,
        category,
        due_date: dueDate,
      });
      haptics.commit();
      setPrediction(await usePredictionStore.getState().getById(prediction.id));
      setMode('view');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[details] save failed:', e);
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await usePredictionStore.getState().remove(prediction.id);
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[details] delete failed:', e);
      setError("Couldn't delete that. Try again.");
      setBusy(false);
    }
  };

  const header = (
    <>
      {/* What you said, first, as on Resolve (DESIGN_SYSTEM §7.10). */}
      <Text style={styles.stated} testID="details-stated">
        On {new Date(prediction.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{' '}
        you said <Text style={styles.statedNumber}>{prediction.confidence}%</Text>
      </Text>
      <View style={styles.categoryRow}>
        <CategoryIcon category={prediction.category} size={14} color={colors.textSecondary} />
        <Text style={styles.category}>{prediction.category}</Text>
      </View>
      <Text style={styles.title} testID="details-title">
        {prediction.title}
      </Text>
      <Text style={styles.due} testID="details-due">
        Due {shortDate(prediction.due_date)}
        {/* The web build sends no notifications, so it promises none. */}
        {Platform.OS === 'web' ? '' : remindersOn ? ' · reminder that evening' : ' · reminders off'}
      </Text>
    </>
  );

  if (mode === 'edit') {
    const canSave = title.trim().length > 0 && category !== null && !busy;
    return (
      <View style={styles.wrap} testID="details-edit">
        <Text style={styles.stated}>
          You said <Text style={styles.statedNumber}>{prediction.confidence}%</Text>
        </Text>
        <Text style={styles.note}>
          The number you said stays as it is: it's the record.
        </Text>
        <TextField
          label="Prediction"
          value={title}
          onChangeText={setTitle}
          maxLength={TITLE_MAX_LENGTH}
          testID="details-title-field"
        />
        <Text style={styles.label}>Category</Text>
        <CategoryChips value={category} onChange={setCategory} />
        <Text style={[styles.label, styles.spaced]}>Due date</Text>
        <DueDateChips
          presets={presets}
          value={dueDate}
          picking={picking}
          onChange={setDueDate}
          onPickingChange={setPicking}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.actions}>
          <Button
            label={busy ? 'Saving…' : 'Save changes'}
            onPress={() => void saveEdit()}
            disabled={!canSave}
            testID="details-save"
          />
          <TextButton label="Cancel" onPress={() => setMode('view')} testID="details-cancel-edit" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="details">
      {header}
      {error && <Text style={styles.error}>{error}</Text>}

      {mode === 'view' && (
        <View style={styles.actions}>
          <Button label="Edit" variant="secondary" onPress={startEditing} testID="details-edit-button" />
          <TextButton label="Answer it now" onPress={() => setMode('early')} testID="details-answer" />
          <TextButton
            label="Delete"
            destructive
            onPress={() => setMode('delete')}
            testID="details-delete"
          />
        </View>
      )}

      {mode === 'early' && (
        <View style={styles.confirm} testID="details-early">
          <Text style={styles.body}>
            It's due {shortDate(prediction.due_date)}. Answering early is fine; just answer what
            you know now.
          </Text>
          <Button label="Answer now" onPress={() => onAnswer(prediction.id)} testID="details-answer-now" />
          <TextButton label="Not yet" onPress={() => setMode('view')} testID="details-not-yet" />
        </View>
      )}

      {mode === 'delete' && (
        <View style={styles.confirm} testID="details-delete-confirm">
          <Text style={styles.body}>
            Delete this prediction? It won't count anywhere, and it can't be undone.
          </Text>
          {/* Outlined with a destructive label, never a filled primary (§7.20). */}
          <Button
            label={busy ? 'Deleting…' : 'Delete'}
            variant="danger"
            onPress={() => void confirmDelete()}
            disabled={busy}
            testID="details-delete-yes"
          />
          <TextButton label="Cancel" onPress={() => setMode('view')} testID="details-delete-cancel" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.sm },
  center: { alignItems: 'center', gap: space.sm, justifyContent: 'center', padding: space.xxl },
  heading: { ...type.headline, color: colors.textPrimary },
  body: { ...type.body, color: colors.textSecondary },
  stated: { ...type.title3, color: colors.textSecondary },
  statedNumber: { ...type.title1, ...tabularNums, fontFamily: FONT_FAMILY, color: colors.textPrimary },
  categoryRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  title: { ...type.title2, color: colors.textPrimary },
  due: { ...type.subhead, color: colors.textSecondary },
  note: { ...type.footnote, color: colors.textSecondary, marginBottom: space.sm },
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary, marginTop: space.md },
  spaced: { marginTop: space.lg },
  actions: { gap: space.xs, marginTop: space.xl },
  confirm: { gap: space.sm, marginTop: space.xl },
  error: { ...type.subhead, color: colors.destructive },
});
