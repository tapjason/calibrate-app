import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { localDate } from '@/components/ui/dates';
import { textLanguage } from '@/components/ui/textLanguage';
import { AnsweredDetails } from '@/components/prediction/AnsweredDetails';
import { CategoryChips } from '@/components/prediction/CategoryChips';
import { datePresets, DueDateChips } from '@/components/prediction/DueDateChips';
import { daysUntilDue } from '@/components/prediction/dueGroups';
import { stillNeeded } from '@/components/prediction/stillNeeded';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { CategoryIcon } from '@/components/ui/Icon';
import { TextButton } from '@/components/ui/TextButton';
import { TextField } from '@/components/ui/TextField';
import { colors, FONT_FAMILY, space, tabularNums, type } from '@/constants/theme';
import {
  answerNowIsSameDay,
  deleteIsCounted,
  earliestDueForEdit,
  madeAt,
  moveIsCounted,
  rewords,
  usePredictionStore,
} from '@/store/predictionStore';
import { reminderTimeLabel } from '@/notifications/practiceReminder';
import { useSettingsStore } from '@/store/settingsStore';
import type { Category, Prediction } from '@/types';
import { categoryTitle, useCategoryStore } from '@/store/categoryStore';

/** As Log's field: long enough for a sentence, short enough for a reminder. */
const TITLE_MAX_LENGTH = 200;

interface PredictionDetailsProps {
  predictionId: string;
  /** Close the sheet: after a delete, or from the ×. */
  onClose: () => void;
  /**
   * Answer it now: the route opens Resolve in this sheet's place. `warned`
   * when the confirmation just said an answer today isn't scored, so Resolve
   * doesn't say it again (roadmap D56).
   */
  onAnswer: (id: string, opts?: { warned: boolean }) => void;
  /** "Log it again" from an answered prediction (roadmap D56). */
  onPredictAgain?: (prediction: Prediction) => void;
  /** Whether Edit holds changes not saved yet, for the sheet's draft guard. */
  onDirtyChange?: (dirty: boolean) => void;
}

type Mode = 'view' | 'edit' | 'delete' | 'early';

const shortDate = (iso: string) =>
  localDate(new Date(iso), { weekday: 'short', month: 'short', day: 'numeric' });


/** What VoiceOver hears as Edit's notes appear (step 173). */
// "Doesn't change your score": a competitive tester had to save to find out
// (blind playtest 2026-11-13, run 2).
const LATE_MOVE_SPOKEN =
  'Moving it later is counted on Insights: the outcome may already be known. It doesn’t change your score.';
const REWORD_SPOKEN =
  'Changing the words makes this a new prediction from today: an answer today isn’t scored.';

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
export function PredictionDetails({
  predictionId,
  onClose,
  onAnswer,
  onPredictAgain,
  onDirtyChange,
}: PredictionDetailsProps) {
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remindersOn = useSettingsStore((s) => s.notificationsEnabled && s.remindersEnabled);
  // The person's own time since D38, not always "that evening".
  const reminderAt = useSettingsStore((s) => s.dueReminderTime);

  // The edit draft, and the presets frozen when editing starts (as on Log).
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [presets, setPresets] = useState(datePresets);
  const [picking, setPicking] = useState(false);

  // Unsaved: editing, with anything changed from what is stored.
  const dirty =
    mode === 'edit' &&
    prediction !== null &&
    (title !== prediction.title ||
      category !== prediction.category ||
      dueDate !== prediction.due_date);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    (async () => {
      try {
        setPrediction(await usePredictionStore.getState().getById(predictionId));
      } finally {
        setLoading(false);
      }
    })();
  }, [predictionId]);

  // Edit's two notes before Save, said aloud as they appear: iOS ignores a
  // live region, so VoiceOver users never heard them (code review
  // 2026-11-12). The late move is step 173's; the rewording D45's.
  const editing = mode === 'edit' && prediction !== null;
  const lateMoveNow = editing && moveIsCounted(prediction, dueDate, title);
  const rewordNow = editing && title.trim().length > 0 && rewords(prediction.title, title);
  useEffect(() => {
    if (lateMoveNow) AccessibilityInfo.announceForAccessibility(LATE_MOVE_SPOKEN);
  }, [lateMoveNow]);
  useEffect(() => {
    if (rewordNow) AccessibilityInfo.announceForAccessibility(REWORD_SPOKEN);
  }, [rewordNow]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.action} />
      </View>
    );
  }
  // An answered one: its own details, open to correction for a day (D34).
  if (prediction && (prediction.status === 'resolved_yes' || prediction.status === 'resolved_no')) {
    return (
      <AnsweredDetails
        prediction={prediction}
        onChanged={setPrediction}
        onClose={onClose}
        onPredictAgain={onPredictAgain}
      />
    );
  }
  if (!prediction || prediction.status !== 'pending') {
    return (
      <View style={styles.center} testID="details-missing">
        <Text accessibilityRole="header" style={styles.heading}>This prediction isn't open</Text>
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

  // An edit can move the due date to today (the picker's earliest day), and a
  // deep link can open a due one here: then the answer isn't early, so it
  // goes straight to Resolve, and the date reads "today".
  const daysLeft = daysUntilDue(prediction, new Date());
  const due = daysLeft <= 0;
  // Reworded since it was logged (D45): it counts as made then.
  const reworded = madeAt(prediction) !== prediction.created_at;
  // Said once, here, with what to do (roadmap D56): a daily walk logged in
  // the morning was "not scored" three times per tick (blind playtest
  // 2026-11-10, run 2). Resolve doesn't repeat it when opened from here.
  const sameDayNow = answerNowIsSameDay(prediction);
  const dueOn = shortDate(prediction.due_date);
  const earlyText = !sameDayNow
    ? `It's due ${dueOn}. Answering early is fine; just answer what you know now.`
    : reworded
      ? `It's due ${dueOn}. You changed its words today, so an answer today isn’t scored. From tomorrow it is.`
      : `It's due ${dueOn}. You logged it today, so an answer today isn’t scored. From tomorrow it is. For something you do every day, log the next one the evening before.`;
  // Deleting a due one hides an outcome that may be known, so it is counted.
  const deleteText = deleteIsCounted(prediction)
    ? 'Delete this prediction? It’s due, so Insights will count it as deleted. This can’t be undone.'
    : "Delete this prediction? It won't count anywhere, and it can't be undone.";
  const answerEarly = () => {
    setMode('early');
    // The warning appears in place of the button; a screen reader hears it
    // (blind playtest 2026-11-04, second round, run 2).
    AccessibilityInfo.announceForAccessibility(earlyText);
  };

  const header = (
    <>
      {/* What you said, first, as on Resolve (DESIGN_SYSTEM §7.10). */}
      <Text style={styles.stated} testID="details-stated">
        On {localDate(new Date(prediction.created_at), { day: 'numeric', month: 'short' })}{' '}
        you said <Text style={styles.statedNumber}>{prediction.confidence}%</Text>
      </Text>
      <View style={styles.categoryRow}>
        <CategoryIcon category={prediction.category} size={14} color={colors.textSecondary} />
        <Text style={styles.category} numberOfLines={1}>
          {categoryTitle(prediction.category)}
        </Text>
      </View>
      <Text
        style={styles.title}
        testID="details-title"
        // The screen's heading, so a heading jump lands on it, as Resolve's
        // question does (playtest 2026-11-09b, finding 18).
        accessibilityRole="header"
        // Read in its own language's voice (playtest 2026-11-08, finding 41).
        accessibilityLanguage={textLanguage(prediction.title)}
      >
        {prediction.title}
      </Text>
      {reworded && (
        <Text style={styles.due} testID="details-reworded">
          Words changed {shortDate(madeAt(prediction))}, so it counts as made that day
        </Text>
      )}
      <Text style={styles.due} testID="details-due">
        Due {daysLeft === 0 ? 'today' : shortDate(prediction.due_date)}
        {/* The web build sends no notifications, so it promises none; a past
            due day's reminder has been and gone. */}
        {Platform.OS === 'web' || daysLeft < 0
          ? ''
          : remindersOn
            ? `, with a reminder at ${reminderTimeLabel(reminderAt)}`
            : ', reminders off'}
      </Text>
    </>
  );

  if (mode === 'edit') {
    const canSave = title.trim().length > 0 && category !== null && !busy;
    // What Save changes is waiting for, as on Log (blind playtest 2026-11-01).
    const needs = busy
      ? null
      : stillNeeded({ title: title.trim().length > 0, category: category !== null });
    // New words are a new prediction from today (D45), said before Save.
    const changingWords = title.trim().length > 0 && rewords(prediction.title, title);
    // A due date moved later on its eve or after is counted (step 173), said
    // before Save as a counted delete is.
    const lateMove = moveIsCounted(prediction, dueDate, title);
    const daysLeft = daysUntilDue(prediction, new Date());
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
          // Wraps and grows, so a long prediction stays in view (playtest 2026-11-01).
          grows
          maxLength={TITLE_MAX_LENGTH}
          testID="details-title-field"
        />
        {changingWords && (
          <Text style={styles.note} testID="details-reword-note" accessibilityLiveRegion="polite">
            Changing the words makes this a new prediction from today: an answer today
            isn’t scored, and the earliest due date is tomorrow.
          </Text>
        )}
        <Text style={styles.label}>Category</Text>
        <CategoryChips value={category} onChange={setCategory} />
        <Text style={[styles.label, styles.spaced]}>Due date</Text>
        <DueDateChips
          presets={presets}
          value={dueDate}
          picking={picking}
          onChange={setDueDate}
          onPickingChange={setPicking}
          earliest={earliestDueForEdit(prediction, title)}
        />
        {lateMove && (
          <Text style={styles.note} testID="details-late-move" accessibilityLiveRegion="polite">
            {daysLeft >= 1 ? 'It’s due tomorrow' : daysLeft === 0 ? 'It’s due today' : 'It’s past its due day'},
            so moving it later is counted on Insights: the outcome may already be known. It
            doesn’t change your score.
          </Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        {needs && (
          <Text style={styles.needs} testID="details-needs">
            {needs}
          </Text>
        )}
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
          <TextButton
            label="Answer it now"
            onPress={() => (due ? onAnswer(prediction.id) : answerEarly())}
            testID="details-answer"
          />
          {/* Set apart from "Answer it now", which sat 6pt above it (blind
              playtest 2026-11-04, third round). It still asks first. */}
          <View style={styles.apart}>
            <TextButton
              label="Delete"
              destructive
              onPress={() => setMode('delete')}
              testID="details-delete"
            />
          </View>
        </View>
      )}

      {mode === 'early' && (
        <View style={styles.confirm} testID="details-early">
          <Text style={styles.body}>{earlyText}</Text>
          <Button
            label="Answer now"
            onPress={() => onAnswer(prediction.id, { warned: sameDayNow })}
            // The warning above, on the button too: a swipe can skip the text
            // (playtest 2026-11-08b, finding 29).
            accessibilityHint={earlyText}
            testID="details-answer-now"
          />
          <TextButton label="Not yet" onPress={() => setMode('view')} testID="details-not-yet" />
        </View>
      )}

      {mode === 'delete' && (
        <View style={styles.confirm} testID="details-delete-confirm">
          <Text style={styles.body} testID="details-delete-text">{deleteText}</Text>
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
  // One line beside its icon: a long name ends in an ellipsis instead of
  // running off the sheet (playtest 2026-11-08, finding 1).
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    flexShrink: 1,
    fontWeight: '600',
  },
  title: { ...type.title2, color: colors.textPrimary },
  due: { ...type.subhead, color: colors.textSecondary },
  note: { ...type.footnote, color: colors.textSecondary, marginBottom: space.sm },
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary, marginTop: space.md },
  spaced: { marginTop: space.lg },
  // space.sm between Edit and Answer it now, and Save changes and Cancel: at
  // xs they were about 4 px apart (blind playtest 2026-11-12, finding 10).
  actions: { gap: space.sm, marginTop: space.xl },
  confirm: { gap: space.sm, marginTop: space.xl },
  apart: { marginTop: space.lg },
  error: { ...type.subhead, color: colors.destructive },
  needs: { ...type.footnote, color: colors.textSecondary, marginTop: space.md },
});
