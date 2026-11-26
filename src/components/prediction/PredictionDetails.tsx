import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { dueDay, localDate } from '@/components/ui/dates';
import { textLanguage } from '@/components/ui/textLanguage';
import { AnsweredDetails } from '@/components/prediction/AnsweredDetails';
import { CategoryChips } from '@/components/prediction/CategoryChips';
import { datePresets, DueDateChips } from '@/components/prediction/DueDateChips';
import { daysUntilDue } from '@/components/prediction/dueGroups';
import { stillNeeded } from '@/components/prediction/stillNeeded';
import { sameDayHeadsUp } from '@/components/resolution/sameDayWarned';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { CategoryIcon } from '@/components/ui/Icon';
import { TextButton } from '@/components/ui/TextButton';
import { TextField } from '@/components/ui/TextField';
import { useLocalDay } from '@/components/ui/useLocalDay';
import type { ScrollReveal } from '@/components/ui/useScrollReveal';
import { colors, FONT_FAMILY, space, tabularNums, type } from '@/constants/theme';
import {
  answeredBefore,
  answerNowIsSameDay,
  canRenumber,
  categoryChangeCountedIfAnswered,
  categoryChangeIsCounted,
  deleteIsCounted,
  dueDateSavedForEdit,
  earliestDueForEdit,
  madeAt,
  moveIsCounted,
  rewordedLater,
  rewordIsCounted,
  rewords,
  usePredictionStore,
} from '@/store/predictionStore';
import { reminderTimeLabel } from '@/notifications/copy';
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
  /**
   * "Use another number" on the day an open one was made (D62), with what
   * Edit holds now, so typed words carry over.
   */
  onRenumber?: (
    prediction: Prediction,
    edits: { title: string; category: Category | null; dueIso: string },
  ) => void;
  /** Whether Edit holds changes not saved yet, for the sheet's draft guard. */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * The sheet's scroll view, made `nested`: Edit's date block is brought into
   * view when "Pick a date" opens its calendar (the owner, 2026-11-24).
   */
  dateReveal?: ScrollReveal;
}

type Mode = 'view' | 'edit' | 'delete' | 'early';

const shortDate = (iso: string) =>
  localDate(new Date(iso), { weekday: 'short', month: 'short', day: 'numeric' });


/** What VoiceOver hears as Edit's notes appear (step 173). */
// "Doesn't change your score": a competitive tester had to save to find out
// (blind playtest 2026-11-13, run 2).
const LATE_MOVE_SPOKEN =
  'Moving it later is counted on Insights: the outcome may already be known. It doesn’t change your score.';
/**
 * The rewording note (D45), printed and spoken in the same words: VoiceOver
 * heard it without the earliest due date (review round 3, 2026-11-25).
 * Exported for tests.
 */
export const REWORD_SPOKEN =
  'Changing the words makes this a new prediction from today: an answer today isn’t scored, and the earliest due date is tomorrow.';
/**
 * New words on the eve or after are counted (D62), said before Save as a late
 * move is: the date stays, so a call whose outcome was in sight could be
 * rewritten.
 */
export const REWORD_COUNTED =
  'It’s due soon, so changing its words is counted on Insights, as moving it later would be. It doesn’t change your score.';
/**
 * Another category from the eve of its due day is counted too (owner decision
 * 2026-11-19, D69 (e)): a likely miss moved out before it was answered took
 * its category's score with it. Said before Save, as a late move is, in the
 * late move's words.
 */
const CATEGORY_COUNTED_SPOKEN =
  'Changing its category is counted on Insights: the outcome may already be known. It doesn’t change your score.';

/**
 * Edit's note under the category chips when the change will be counted,
 * worded as the late move's under the date. Exported for tests.
 */
export function categoryCountedNote(daysLeft: number): string {
  const when =
    daysLeft >= 1 ? 'It’s due tomorrow' : daysLeft === 0 ? 'It’s due today' : 'It’s past its due day';
  return `${when}, so changing its category is counted on Insights: the outcome may already be known. It doesn’t change your score.`;
}

/**
 * Edit's note under the category chips for an earlier move (review round 6):
 * one made after the day it was made, earlier than the eve, is counted with
 * the moved answers if the prediction gets a scored answer in the new
 * category (`categoryChangeCountedIfAnswered`). Never shown beside
 * `categoryCountedNote`, whose move is counted at once. "A scored answer",
 * not "answered": a Can't tell, or an answer the day its words change, isn't
 * scored and isn't counted. Read aloud as written. Exported for tests.
 */
export const CATEGORY_COUNTED_IF_ANSWERED =
  'If it gets a scored answer in this category, the move is counted on Insights. It doesn’t change your score.';

/**
 * Edit's line under the number. The number can't change. On the day it was
 * made, it also says what to do instead: a tester who set 90 for 70 found
 * only delete-and-retype by guessing (blind playtest 2026-11-13c, finding
 * 24). Only then, so it never points at swapping a number once the outcome
 * may be known (record audit 2026-11-13). Exported for tests.
 */
export const EDIT_NUMBER_NOTE = "The number you said stays as it is: it's the record.";
/**
 * On the day it was made (D62): the way to another number, one tap away. It
 * was "delete this one and log it again", 13 to 19 taps that three testers
 * took (blind playtest 2026-11-13d, runs 1, 4 and 8).
 */
export const EDIT_NUMBER_FIX =
  'You made it today, so you can still change the number. From tomorrow it’s the record.';

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
  onRenumber,
  onDirtyChange,
  dateReveal,
}: PredictionDetailsProps) {
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  // Re-render when the day turns, as Log does: the date Save keeps, the late
  // move's note and the rewording's quiet day read the clock at render, and
  // nothing else redrew a sheet left open past midnight (review round 3,
  // 2026-11-25).
  useLocalDay();
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  // A new category typed and not added holds Save changes (D61).
  const [categoryPending, setCategoryPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remindersOn = useSettingsStore((s) => s.notificationsEnabled && s.remindersEnabled);
  // For D56's habit tip, only on a repeat (D62).
  const resolvedList = usePredictionStore((s) => s.resolved);
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
  // An answered one's typed note counts too (D62).
  const [noteDirty, setNoteDirty] = useState(false);
  useEffect(() => {
    onDirtyChange?.(dirty || noteDirty);
  }, [dirty, noteDirty, onDirtyChange]);

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
  // The words the date follows: the draft's, or the stored ones while the
  // field is empty (Save waits for words then), so clearing it moves nothing.
  const dueTitle = prediction !== null && title.trim().length === 0 ? prediction.title : title;
  const lateMoveNow = editing && moveIsCounted(prediction, dueDate, dueTitle);
  // Quiet on the day it was logged while it isn't due yet (D63): it already
  // counts as made today, its date can't be before tomorrow, and the
  // rewording isn't counted. Due today (a clock or time-zone change, a
  // synced row) the rewording is counted and moves the date, so it's said
  // (record audit of step 181).
  const rewordQuiet =
    prediction !== null && canRenumber(prediction) && daysUntilDue(prediction, new Date()) >= 1;
  const rewordNow =
    editing && !rewordQuiet && title.trim().length > 0 && rewords(prediction.title, title);
  const rewordCountedNow = editing && rewordIsCounted(prediction, title);
  useEffect(() => {
    if (lateMoveNow) AccessibilityInfo.announceForAccessibility(LATE_MOVE_SPOKEN);
  }, [lateMoveNow]);
  useEffect(() => {
    if (rewordNow) {
      AccessibilityInfo.announceForAccessibility(
        rewordCountedNow && !lateMoveNow ? `${REWORD_SPOKEN} ${REWORD_COUNTED}` : REWORD_SPOKEN,
      );
    }
  }, [rewordNow, rewordCountedNow, lateMoveNow]);
  // Another category from the eve on (D69 (e)), said as it appears.
  const categoryCountedNow =
    editing && category !== null && categoryChangeIsCounted(prediction, category);
  useEffect(() => {
    if (categoryCountedNow) AccessibilityInfo.announceForAccessibility(CATEGORY_COUNTED_SPOKEN);
  }, [categoryCountedNow]);
  // An earlier move, counted if a scored answer comes in the new category
  // (review round 6), against the category this phone remembers for it.
  // Never with the eve note: the store's rule excludes it, and so does this.
  const categoryOrigin = usePredictionStore((s) => s.categoryOrigins[predictionId] ?? null);
  const categoryCountedIfAnsweredNow =
    editing &&
    category !== null &&
    !categoryCountedNow &&
    categoryChangeCountedIfAnswered(prediction, category, categoryOrigin);
  useEffect(() => {
    if (categoryCountedIfAnsweredNow) {
      AccessibilityInfo.announceForAccessibility(CATEGORY_COUNTED_IF_ANSWERED);
    }
  }, [categoryCountedIfAnsweredNow]);

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
        onDirtyChange={setNoteDirty}
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
      // The chosen date: `update` moves it up by the same rule as the line
      // under the chips (dueDateSavedForEdit), on its own clock.
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
      // The copy this screen showed (review round 7): sync then removes only
      // that from the server, and an answer given on another phone since
      // comes back instead of being deleted everywhere.
      await usePredictionStore.getState().remove(prediction.id, prediction);
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
  // Only when the words changed on a later day than it was logged: on the
  // day itself it counts as made today either way (step 181).
  const reworded = rewordedLater(prediction);
  // Said once, here, with what to do (roadmap D56): a daily walk logged in
  // the morning was "not scored" three times per tick (blind playtest
  // 2026-11-10, run 2). Resolve doesn't repeat it when opened from here.
  const sameDayNow = answerNowIsSameDay(prediction);
  // "in 3 days", "tomorrow", "Nov 21 (Friday)" (the owner, 2026-11-24);
  // "today by 11:59 PM" on its day (D80).
  const dueOn = dueDay(new Date(prediction.due_date)).text;
  // In D76's words (the voice pass, 2026-11-23), the date as the owner's
  // (2026-11-24): "It's due in 3 days." The same-day note is Resolve's too
  // (`sameDayHeadsUp`), which it skips when opened from here.
  const earlyText = !sameDayNow
    ? `It’s due ${dueOn}. Know already? Go ahead.`
    : reworded
      ? sameDayHeadsUp(true)
      : `${sameDayHeadsUp(false)}${
          answeredBefore(prediction, resolvedList)
            ? ' For something you do every day, log the next one the evening before.'
            : ''
        }`;
  // A delete is counted on any day after the day it was logged (owner
  // decision 2026-11-19, review round 7; from the eve until then, D61): with
  // "Answer it now" an outcome can be known on any day. A rewording doesn't
  // move that day. On the day it was logged, only once it's due. The text
  // gives the reason that holds, told apart as the store's contract says:
  // counted and still the day it was logged (`canRenumber`) means it's due.
  // One clock for both, so midnight can't fall between them. Marked Can't
  // tell on another phone while this is up, it is counted on the same days
  // (owner's list item 20), so the words still hold.
  const deleteNow = new Date();
  const deleteText = !deleteIsCounted(prediction, deleteNow)
    ? "Delete this prediction? It won't count anywhere, and it can't be undone."
    : canRenumber(prediction, deleteNow)
      ? 'Delete this prediction? It’s due, so Insights will count it as deleted. This can’t be undone.'
      : 'Delete this prediction? You logged it before today, so Insights will count it as deleted. This can’t be undone.';
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
        Due {dueOn}
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
    const canSave = title.trim().length > 0 && category !== null && !busy && !categoryPending;
    // What Save changes is waiting for, as on Log (blind playtest 2026-11-01).
    const needs = busy
      ? null
      : stillNeeded({
          title: title.trim().length > 0,
          category: category !== null,
          categoryPending,
        });
    // New words are a new prediction from today (D45), said before Save.
    const changingWords = title.trim().length > 0 && rewords(prediction.title, title);
    // A due date moved later on its eve or after is counted (step 173), said
    // before Save as a counted delete is.
    const lateMove = moveIsCounted(prediction, dueDate, dueTitle);
    // The date Save will keep (record audit 2026-11-25): new words move the
    // earliest day to tomorrow, and a date chosen before it moves up with it,
    // as Log's does at midnight. Derived, not set: words put back bring the
    // chosen date back, rather than leave a later one counted as a late move.
    const savedDue = dueDateSavedForEdit(prediction, dueTitle, dueDate);
    const daysLeft = daysUntilDue(prediction, new Date());
    return (
      <View style={styles.wrap} testID="details-edit" onLayout={dateReveal?.onParentLayout}>
        <Text style={styles.stated}>
          You said <Text style={styles.statedNumber}>{prediction.confidence}%</Text>
        </Text>
        {/* One message, not a no and a yes (blind playtest 2026-11-13e, runs
            1, 4 and 8): the record's rule, or on its day how to change it. */}
        <Text style={styles.note} testID="details-number-note">
          {canRenumber(prediction) && onRenumber ? EDIT_NUMBER_FIX : EDIT_NUMBER_NOTE}
        </Text>
        {canRenumber(prediction) && onRenumber && (
          <TextButton
            label="Use another number"
            onPress={() => onRenumber(prediction, { title, category, dueIso: dueDate })}
            testID="details-renumber"
          />
        )}
        <TextField
          label="Prediction"
          value={title}
          onChangeText={setTitle}
          // Wraps and grows, so a long prediction stays in view (playtest 2026-11-01).
          grows
          maxLength={TITLE_MAX_LENGTH}
          testID="details-title-field"
        />
        {/* Not on the day it was logged, while it isn't due yet: it's already
            today's, and the note made a first-day fix look like a mistake
            (blind playtest 2026-11-14, run 1). */}
        {changingWords && !rewordQuiet && (
          <Text style={styles.note} testID="details-reword-note" accessibilityLiveRegion="polite">
            {REWORD_SPOKEN}
            {/* Not when the move line below says it already (due today). */}
            {rewordIsCounted(prediction, title) && !lateMove ? ` ${REWORD_COUNTED}` : ''}
          </Text>
        )}
        <Text style={styles.label}>Category</Text>
        <CategoryChips
          value={category}
          onChange={setCategory}
          canAdd
          onAddPendingChange={setCategoryPending}
        />
        {/* Another category from the eve of its due day is counted (D69 (e)),
            said before Save under the chips, as a late move is under the date. */}
        {categoryCountedNow && (
          <Text style={styles.note} testID="details-category-counted" accessibilityLiveRegion="polite">
            {categoryCountedNote(daysLeft)}
          </Text>
        )}
        {/* Earlier than the eve, counted only once a scored answer comes in
            this category (review round 6), said in the same place and style. */}
        {categoryCountedIfAnsweredNow && (
          <Text
            style={styles.note}
            testID="details-category-counted-if-answered"
            accessibilityLiveRegion="polite"
          >
            {CATEGORY_COUNTED_IF_ANSWERED}
          </Text>
        )}
        <Text style={[styles.label, styles.spaced]}>Due date</Text>
        {/* The date and everything under it, to Save changes: the calendar
            opening brings the whole block into view, so Save isn't left just
            below the edge (iOS simulator 2026-11-25). A short screen shows
            the block from its top. */}
        <View style={styles.dueGroup} onLayout={dateReveal?.onTargetLayout} testID="details-due-block">
          <DueDateChips
            presets={presets}
            value={savedDue}
            picking={picking}
            onChange={setDueDate}
            onPickingChange={setPicking}
            earliest={earliestDueForEdit(prediction, dueTitle)}
            onPickerReveal={dateReveal?.reveal}
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
          <Text style={styles.body} testID="details-early-text">
            {earlyText}
          </Text>
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
  dueGroup: { gap: space.sm },
  // space.sm between Edit and Answer it now, and Save changes and Cancel: at
  // xs they were about 4 px apart (blind playtest 2026-11-12, finding 10).
  actions: { gap: space.sm, marginTop: space.xl },
  confirm: { gap: space.sm, marginTop: space.xl },
  apart: { marginTop: space.lg },
  error: { ...type.subhead, color: colors.destructive },
  needs: { ...type.footnote, color: colors.textSecondary, marginTop: space.md },
});
