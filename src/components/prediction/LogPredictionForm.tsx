import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { refinePrediction } from '@/ai/refine';
import { track } from '@/analytics/track';
import { CoverageNudge } from '@/components/prediction/CoverageNudge';
import { CategoryChips } from '@/components/prediction/CategoryChips';
import { datePresets, DueDateChips } from '@/components/prediction/DueDateChips';
import { dueWords, savedLine } from '@/components/prediction/dueWords';
import { type LogAgainDraft } from '@/components/prediction/logAgain';
import { pastOutcomesLine } from '@/components/prediction/pastOutcomesLine';
import { StarterIdeas } from '@/components/prediction/StarterIdeas';
import { stillNeeded } from '@/components/prediction/stillNeeded';
import { trackRecordLine } from '@/components/prediction/trackRecord';
import { Button } from '@/components/ui/Button';
import { ConfidenceControl } from '@/components/ui/ConfidenceControl';
import { haptics } from '@/components/ui/haptics';
import { holdRanges } from '@/components/ui/holdRanges';
import { TextButton } from '@/components/ui/TextButton';
import { TextField } from '@/components/ui/TextField';
import { usePinnedFooter } from '@/components/ui/usePinnedFooter';
import { useScrollReveal } from '@/components/ui/useScrollReveal';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { REFINE_ENABLED, TRACK_RECORD_MIN_N } from '@/constants/app';
import { colors, space, type } from '@/constants/theme';
import { categoryOptions } from '@/store/categoryStore';
import { useLogDraftStore, type LogDraft } from '@/store/logDraftStore';
import {
  canRenumber,
  dueDateSavedAt,
  openTwinFor,
  pastOutcomesFor,
  usePredictionStore,
} from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  coverageNudgeNow,
  useStatsStore,
  type CoverageNudgeDecision,
} from '@/store/statsStore';
import { type Category } from '@/types';

const TITLE_MAX_LENGTH = 200;
/** How long after a change the draft is written, in ms (step 173). */
export const LOG_DRAFT_WRITE_MS = 300;

interface LogPredictionFormProps {
  /** Called after a successful create. Used by the screen to navigate away. */
  onSubmitted?: () => void;
  /**
   * Whether there's a typed title not yet saved, so the Log sheet can ask
   * before a swipe or the × throws it away (DESIGN_SYSTEM §7.7).
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * "Log it again" (roadmap step 22): start from a resolved prediction's
   * title, category and lead time. The confidence still starts empty, never
   * the old number. Read at mount; give the form a new key to apply a
   * different one.
   */
  again?: LogAgainDraft | null;
  /**
   * A draft kept from an interrupted Log (step 173), restored whole: title,
   * category, the person's own number and the date. Read at mount.
   */
  kept?: LogDraft | null;
  /**
   * The sheet's title row, drawn as the first thing inside the scroll view.
   * As a sibling above it, the first device run (iOS 26, 2026-11-07) drew the
   * scroll view from the top of the sheet, over the title and the ×.
   */
  header?: ReactNode;
}

export function LogPredictionForm({
  onSubmitted,
  onDirtyChange,
  again,
  kept,
  header,
}: LogPredictionFormProps) {
  // A kept draft's category only if it can still be chosen (renamed is fine;
  // hidden or gone, it waits for a new pick), and its date only if Save would
  // still keep it (a date the calendar caught up with moves on, as on save).
  const [restored] = useState(() =>
    kept
      ? {
          ...kept,
          category: categoryOptions().includes(kept.category as Category) ? kept.category : null,
          dueIso: dueDateSavedAt(kept.dueIso),
        }
      : null,
  );
  const { pinned, onFooterLayout } = usePinnedFooter();
  // After a category is picked, the confidence control comes into view if it
  // isn't: at 320 it sat under the pinned Save, with only "—% not set yet"
  // showing (blind playtest 2026-11-12e, finding 3). As the Warm-up's pick.
  const reveal = useScrollReveal();
  // Presets are frozen at mount: regenerating them every render would change
  // the ISO strings each tick and break chip-selection comparison below.
  const [presets, setPresets] = useState(datePresets);
  // A new category typed and not added holds Save (D61): Save then filed the
  // prediction under the chip still chosen and dropped the new name.
  const [categoryPending, setCategoryPending] = useState(false);
  const [title, setTitle] = useState(again?.title ?? restored?.title ?? '');
  const dirty = title.trim().length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const [category, setCategory] = useState<Category | null>(
    again?.category ?? restored?.category ?? null,
  );
  // Empty until set (roadmap D13): a preset can't be told apart from a choice,
  // so a save that never touched the control sat at a number nobody chose.
  const [confidence, setConfidence] = useState<number | null>(restored?.confidence ?? null);
  // Starter ideas only for a first prediction ever (step 40).
  const firstEver = usePredictionStore((s) => s.pending.length + s.resolved.length === 0);
  // They step aside once one is picked, or once a category is chosen after
  // typing, not at the first letter: going then moved the chips up about 300 px
  // under the thumb (blind playtest 2026-11-12f, finding 13; step 173). Not on
  // leaving the title either: the tap on a category is what leaves it, and the
  // jump as they went swallowed that tap (blind playtest 2026-11-13, run 3).
  // On a category, the form brings the slider into view anyway (useScrollReveal),
  // so the shift is absorbed by a move the person expects.
  const [ideasGone, setIdeasGone] = useState(false);
  // Every prediction starts on Tomorrow (roadmap D55; D18 (4) did it for the
  // first only): "In a week" caught five of eight testers who meant tomorrow
  // or a weekday (blind playtest 2026-11-10). "Log it again" brings its own.
  const [dueDate, setDueDate] = useState(again?.dueIso ?? restored?.dueIso ?? presets[0].iso);
  // Said once at the top while the form still holds the kept draft.
  const [keptShown, setKeptShown] = useState(restored !== null);
  // The draft is kept as it's typed, a moment after each change (step 173),
  // so a kill or a reload loses at most that moment. Only once the person has
  // changed something here: at mount it would clear a kept draft, or replace
  // it with "Log it again"'s words (code review 2026-11-12).
  const touched = useRef(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    touched.current = true;
    return undefined;
  }, [title, category, confidence, dueDate]);
  useEffect(() => {
    // Not for "Use another number" (D62): restored later as a plain draft, it
    // would save a second prediction beside the one it was to replace (code
    // review of step 178).
    if (!touched.current || again?.replaces) return undefined;
    const t = setTimeout(() => {
      void useLogDraftStore.getState().save({ title, category, confidence, dueIso: dueDate });
    }, LOG_DRAFT_WRITE_MS);
    return () => clearTimeout(t);
  }, [title, category, confidence, dueDate, again?.replaces]);
  // Showing the inline picker (iOS inline calendar / web date input).
  const [picking, setPicking] = useState(false);
  // Opening "Pick a date" adds the calendar at the end of the form and pushed
  // the "Due …" line out of view behind Save (blind playtests 2026-11-13,
  // run 5, and 2026-11-13b, run 1); the inline calendar (the owner,
  // 2026-11-24) is taller still. Once it's laid out, the form scrolls just
  // far enough to show the date block's bottom, or its top when the block is
  // taller than the view, so the calendar's month and arrows show.
  const dateReveal = useScrollReveal({ scrollRef: reveal.scrollRef });
  // A form left open (the Log tab, before D3; a sheet now) kept yesterday's
  // presets after midnight, and "Tomorrow" meant today. When the day turns, rebuild them and
  // keep the chosen chip chosen; a picked date stays as picked.
  const day = useLocalDay();
  const [presetsDay, setPresetsDay] = useState(day);
  useEffect(() => {
    if (day === presetsDay) return;
    const next = datePresets();
    const chosen = presets.findIndex((p) => p.iso === dueDate);
    setPresets(next);
    if (chosen >= 0) setDueDate(next[chosen].iso);
    // A picked date the calendar has caught up with moves to the earliest
    // allowed, as the store would on save, so the sentence under the chips
    // and Save's label name the same day (D55).
    else setDueDate(dueDateSavedAt(dueDate));
    setPresetsDay(day);
  }, [day, presetsDay, presets, dueDate]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set before the first await: taps landing in the same frame all saw
  // `submitting` false and saved one prediction each (playtest 2026-11-08b,
  // finding 1).
  const submittingRef = useRef(false);
  const [refining, setRefining] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // REFINE_ENABLED is the release-level switch (currently off — see the
  // constant). Settings is the user-level one on top of it. When either is
  // off, the button + suggestion UI are
  // hidden entirely; the rest of the save flow is untouched.
  const aiRefineEnabled = useSettingsStore((s) => s.aiRefineEnabled);
  // A first prediction ever gets starter ideas under the title (step 40).

  // The range-coverage nudge (CLAUDE.md, "Range coverage caveat"). Latched
  // once shown: marking it shown starts the cooldown, which would otherwise
  // re-hide the panel on the very next render.
  const coverageGap = useStatsStore((s) => s.coverageGap);
  const [nudge, setNudge] = useState<CoverageNudgeDecision | null>(null);

  // Track record for the chosen category and confidence (roadmap step 19).
  // Subscribing to both calibrations re-renders when a resolution moves them;
  // the bucket lookup itself stays in the store.
  const calibration = useStatsStore((s) => s.calibration);
  useStatsStore((s) => s.categoryCalibration);
  const { bucketFor, categoryBucketFor } = useStatsStore.getState();
  const record =
    confidence === null
      ? null
      : trackRecordLine(
          category,
          category === null ? null : categoryBucketFor(category, confidence),
          bucketFor(confidence),
        );
  // Room kept for the line once some range could show it, so it doesn't push
  // the date chips down as it appears at the first number (blind playtest
  // 2026-11-12, finding 9: about 46 px under the finger). Two lines, at the
  // text size in use.
  const { fontScale } = useWindowDimensions();
  const recordRoom = calibration.buckets.some((b) => b.total_resolved >= TRACK_RECORD_MIN_N)
    ? Math.ceil(2 * styles.record.lineHeight * fontScale)
    : 0;
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // This prediction's own record (roadmap D32): when the title matches ones
  // already answered, how they came out. Outcomes only; the old confidence
  // would anchor the new one. The matching is the engine's, through the store.
  const resolved = usePredictionStore((s) => s.resolved);
  const past = useMemo(
    () => pastOutcomesLine(pastOutcomesFor(resolved, title)),
    [resolved, title],
  );

  // The same words already open for the day this would save on (step 181).
  // Not while replacing one ("Use another number").
  const pendingList = usePredictionStore((s) => s.pending);
  const twin = useMemo(
    () => openTwinFor(title, dueDateSavedAt(dueDate), pendingList, again?.replaces),
    [title, dueDate, pendingList, again?.replaces],
  );

  useEffect(() => {
    if (nudge || nudgeDismissed) return;
    // Not right after an answer, whichever way it went (roadmap D50).
    const lastAnsweredAt = resolved.reduce<string | null>(
      (latest, p) => (p.resolved_at && (!latest || p.resolved_at > latest) ? p.resolved_at : latest),
      null,
    );
    const decision = coverageNudgeNow(lastAnsweredAt);
    if (!decision.show) return;
    setNudge(decision);
    void track('coverage_nudge_shown', { buckets_used: decision.buckets_used });
    void useSettingsStore.getState().markCoverageNudgeShown();
  }, [coverageGap, nudge, nudgeDismissed]);

  const acceptNudge = () => {
    if (nudge) setConfidence(nudge.suggested_confidence);
    setNudgeDismissed(true);
    void track('coverage_nudge_accepted');
  };

  const onRefine = async () => {
    // Fire-and-forget by design: per CLAUDE.md, refine must never block the
    // save flow. A null result silently leaves the user's text untouched.
    setSuggestion(null);
    setRefining(true);
    try {
      const result = await refinePrediction(title);
      if (result && result !== title.trim()) {
        setSuggestion(result);
      }
    } finally {
      setRefining(false);
    }
  };

  const acceptSuggestion = () => {
    if (suggestion) {
      setTitle(suggestion);
      setSuggestion(null);
    }
  };

  // "Saved, due Sunday." at the top of a form kept open by "Save and log
  // another" (step 173).
  const [savedNote, setSavedNote] = useState<{ text: string; n: number } | null>(null);
  // Cancelled if the sheet closes first, so it isn't said over the next screen.
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    [],
  );

  const onSubmit = async (another = false) => {
    if (confidence === null || category === null || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const input = { title, category, confidence, due_date: dueDate };
      // "Use another number" (D62) replaces the one made today.
      if (again?.replaces) await usePredictionStore.getState().renumber(again.replaces, input);
      else await usePredictionStore.getState().create(input);
      haptics.commit();
      // Saved, so nothing to keep: cleared now, not by the blank form's
      // write, which the sheet closing would cancel.
      void useLogDraftStore.getState().clear();
      setKeptShown(false);
      const note = savedLine(dueDateSavedAt(dueDate));
      // The sheet closes on save; a screen reader hears that it worked
      // (blind playtest 2026-11-04, second round, run 2).
      // After "Save and log another" the focused button goes as the form
      // resets, and the focus move cut a same-moment announcement off (code
      // review 2026-11-12): said a moment later.
      if (another) {
        if (announceTimer.current) clearTimeout(announceTimer.current);
        announceTimer.current = setTimeout(
          () => AccessibilityInfo.announceForAccessibility(note),
          600,
        );
      }
      else AccessibilityInfo.announceForAccessibility('Saved.');
      setTitle('');
      // "Save and log another" keeps the category just chosen: a batch of
      // exercise predictions wanted Health each time (blind playtest
      // 2026-11-13b, run 8; roadmap D60 (h)). D29's empty start is for a
      // category nobody picked; this one was picked a moment ago, in view.
      if (!another) setCategory(null);
      setConfidence(null);
      const next = datePresets();
      setPresets(next);
      setDueDate(next[0].iso);
      setPicking(false);
      if (another) {
        // A batch stays in the sheet: every save went back to Today, and four
        // quick ones took three extra trips (blind playtest 2026-11-12f,
        // finding 12). The form starts over at the top, the save said there.
        setSavedNote((prev) => ({ text: note, n: (prev?.n ?? 0) + 1 }));
        reveal.reset();
        dateReveal.reset();
        reveal.scrollRef.current?.scrollTo({ y: 0, animated: false });
      } else {
        onSubmitted?.();
      }
    } catch (e) {
      // The store's messages are for developers ("confidence must be an
      // integer…"). Say what happened in words, keep the detail in the log.
      // eslint-disable-next-line no-console
      console.warn('[log] save failed:', e);
      // Past midnight the one it replaces is the record: say so (D62).
      let closed = false;
      if (again?.replaces) {
        try {
          const source = await usePredictionStore.getState().getById(again.replaces);
          closed = source !== null && !canRenumber(source);
        } catch {
          closed = false;
        }
      }
      setError(
        closed
          ? 'The one this replaces was made before today now, so its number stays as it is.'
          : "Couldn't save that. Try again.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Save waits for a title, a category and a confidence (DESIGN_SYSTEM §7.12,
  // roadmap D13 and D29), as iOS's own Add buttons do, instead of answering a
  // tap with an error far below the field.
  const canSave =
    title.trim().length > 0 &&
    category !== null &&
    confidence !== null &&
    !submitting &&
    !categoryPending;
  // What Save is waiting for, once the form is started (blind playtest
  // 2026-11-01): an empty form needs no list, and a started one did.
  const started =
    title.trim().length > 0 || category !== null || confidence !== null || categoryPending;
  const needs =
    started && !submitting
      ? stillNeeded({
          title: title.trim().length > 0,
          category: category !== null,
          confidence: confidence !== null,
          categoryPending,
        })
      : null;

  // Save names the date it will save (roadmap D55), so the date is in view at
  // the moment of saving even when the chips are scrolled off (at 320 they sat
  // under this bar). The store's clamp, so it never names a date that won't be
  // saved; `day` re-renders it when the date turns over.
  const saveDue = useMemo(
    () => dueWords(dueDateSavedAt(dueDate), new Date()),
    // `day` so it moves on at midnight with the chips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dueDate, day],
  );

  // Past a quarter of the screen (large text on a small phone), Save ends the
  // scroll instead (usePinnedFooter): the pinned bar hid the due date.
  const footer = (
    <View style={[styles.footer, !pinned && styles.footerInline]} onLayout={onFooterLayout}>
      {error && <Text style={styles.error} testID="log-error">{error}</Text>}
      {needs && (
        <Text style={styles.needs} testID="log-needs">
          {needs}
        </Text>
      )}
      <View>
        <Button
          label={submitting ? 'Saving…' : `Save, due ${saveDue.text}`}
          accessibilityLabel={submitting ? 'Saving' : `Save prediction, due ${saveDue.spoken}`}
          accessibilityHint={
            twin !== null && !submitting
              ? `You already have this one open, due ${dueWords(twin.due_date, new Date()).spoken}.`
              : undefined
          }
          onPress={() => void onSubmit()}
          disabled={!canSave}
          testID="submit-button"
        />
      </View>
      {/* For a batch (step 173), once there's something to save: it takes the
          place of the "still needed" line, so the bar barely grows. */}
      {canSave && !again?.replaces && (
        <TextButton
          label="Save and log another"
          onPress={() => void onSubmit(true)}
          testID="submit-another"
        />
      )}
    </View>
  );

  // Save is pinned under the fields (2026-10-09): at the end of the form it sat
  // below the fold on a 667pt phone even after the starter ideas had gone. The
  // fields scroll; the one action stays put. With the keyboard up it sits
  // behind it, which costs nothing: Save also waits for a confidence, and
  // setting one means the keyboard is down.
  return (
    <View style={styles.form}>
      <ScrollView
        ref={reveal.scrollRef}
        contentContainerStyle={styles.fields}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        onLayout={(e) => {
          reveal.onViewportLayout(e);
          dateReveal.onViewportLayout(e);
        }}
        onScroll={(e) => {
          reveal.onScroll(e);
          dateReveal.onScroll(e);
        }}
        onScrollBeginDrag={() => {
          reveal.onScrollBeginDrag();
          dateReveal.onScrollBeginDrag();
        }}
        scrollEventThrottle={32}
      >
        {header}
        {keptShown && (
          <View style={styles.keptRow} testID="log-kept">
            <Text style={styles.keptText}>Kept from before you left.</Text>
            <TextButton
              label="Start over"
              onPress={() => {
                setKeptShown(false);
                setTitle('');
                setCategory(null);
                setConfidence(null);
                setDueDate(presets[0].iso);
                setPicking(false);
                void useLogDraftStore.getState().clear();
              }}
              testID="log-kept-clear"
            />
          </View>
        )}
        {savedNote && (
          <Text key={savedNote.n} style={styles.savedNote} testID="log-saved-note">
            {savedNote.text}
          </Text>
        )}
        {nudge && !nudgeDismissed && (
          <CoverageNudge
            suggestedConfidence={nudge.suggested_confidence}
            onAccept={acceptNudge}
            onDismiss={() => setNudgeDismissed(true)}
          />
        )}

        <TextField
          label="Prediction"
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (suggestion) setSuggestion(null);
          }}
          // Short enough to fit at 320pt (checked in Inter, about 6% wider than
          // Instrument Sans, D33), and
          // dateless: the due date has its own chips and starts on Tomorrow.
          placeholder="e.g. I'll finish the draft"
          // Wraps and grows, so a long prediction stays in view (playtest 2026-11-01).
          grows
          maxLength={TITLE_MAX_LENGTH}
          testID="title-field"
        >
          {past !== null && (
            <Text style={styles.record} testID="past-outcomes">
              {past}
            </Text>
          )}
          {twin !== null && !submitting && (
            <Text style={styles.record} testID="log-open-twin" accessibilityLiveRegion="polite">
              You already have this one open, due {dueWords(twin.due_date, new Date()).text}.
            </Text>
          )}
        </TextField>

        {firstEver && !ideasGone && (
          <StarterIdeas
            onPick={(idea) => {
              setIdeasGone(true);
              setTitle(idea.title);
              setCategory(idea.category);
              const preset = presets.find((p) => p.id === idea.due);
              if (preset) setDueDate(preset.iso);
              setPicking(false);
            }}
          />
        )}

        {REFINE_ENABLED && aiRefineEnabled && title.trim().length > 0 && (
          <>
            <View style={styles.refineRow}>
              <Pressable
                onPress={onRefine}
                disabled={refining}
                testID="refine-button"
                style={({ pressed }) => [
                  styles.refineButton,
                  refining && styles.refineDisabled,
                  pressed && styles.refinePressed,
                ]}
              >
                <Text style={styles.refineLabel}>
                  {refining ? 'Refining…' : '✨ Refine'}
                </Text>
              </Pressable>
            </View>

            {suggestion && (
              <View style={styles.suggestion} testID="refine-suggestion">
                <Text style={styles.suggestionLabel}>Suggested rewrite</Text>
                <Text style={styles.suggestionText}>{suggestion}</Text>
                <View style={styles.suggestionActions}>
                  <Button
                    label="Use this"
                    onPress={acceptSuggestion}
                    testID="refine-accept"
                  />
                  <Button
                    label="Dismiss"
                    variant="secondary"
                    onPress={() => setSuggestion(null)}
                    testID="refine-dismiss"
                  />
                </View>
              </View>
            )}
          </>
        )}

        <View style={styles.block}>
          <Text style={styles.label}>Category</Text>
          {/* Nothing chosen to start (roadmap D29): a preset Work filed
              untouched predictions under Work. */}
          <CategoryChips
            value={category}
            canAdd
            onAddPendingChange={setCategoryPending}
            onChange={(c) => {
              setCategory(c);
              // After the tap has landed, never as it lands.
              if (title.trim().length > 0) setIdeasGone(true);
              // The keyboard down first: its height isn't taken off the view,
              // so a slider under it read as visible (code review 2026-11-12).
              // A confidence is next, and setting one needs it down anyway.
              Keyboard.dismiss();
              // Checked again for a moment: the line under Save can change.
              reveal.reveal();
            }}
          />
        </View>

        <View style={styles.block} onLayout={reveal.onTargetLayout} testID="log-confidence-block">
          {/* No band and no chip for any number (roadmap D23, 2026-10-10): the
              integrity bonus paid for 35–65%, which pushes reports toward it. */}
          <ConfidenceControl value={confidence} onChange={setConfidence} />
          {record ? (
            <Text style={[styles.record, { minHeight: recordRoom }]} testID="track-record">
              {holdRanges(record.text)}
            </Text>
          ) : recordRoom > 0 ? (
            <View style={[styles.recordRoom, { minHeight: recordRoom }]} testID="track-record-room" />
          ) : null}
        </View>

        <View style={styles.block} onLayout={dateReveal.onTargetLayout} testID="log-due-block">
          <Text style={styles.label}>Due date</Text>
          {/* Revealed only when the calendar is about to appear: with it
              already showing (a second tap) nothing grows (code review
              2026-11-13). */}
          <DueDateChips
            presets={presets}
            value={dueDate}
            picking={picking}
            onChange={setDueDate}
            onPickingChange={setPicking}
            onPickerReveal={dateReveal.reveal}
          />
        </View>

        {!pinned && footer}
      </ScrollView>

      {pinned && footer}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1 },
  fields: { padding: space.lg, paddingBottom: space.md },
  footer: {
    backgroundColor: colors.canvas,
    borderTopColor: colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
    paddingBottom: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  // In the scroll: the same width as pinned (out through the fields'
  // padding), so its height, which decides where it goes, doesn't change.
  footerInline: { marginHorizontal: -space.lg, marginBottom: -space.md },
  block: { marginBottom: space.xl },
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary, marginBottom: space.sm },
  // Counts in plain ink: information, not a verdict or a nudge. The track
  // record under the slider and the past outcomes under the title alike.
  record: { ...type.footnote, color: colors.textSecondary, marginTop: space.sm },
  recordRoom: { marginTop: space.sm },
  error: { ...type.subhead, color: colors.destructive, marginBottom: space.md },
  // Plain ink, like the counts: a direction, not an error.
  needs: { ...type.footnote, color: colors.textSecondary, textAlign: 'center' },
  savedNote: { ...type.subhead, color: colors.textSecondary, marginBottom: space.md },
  keptRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.md,
    marginBottom: space.sm,
  },
  keptText: { ...type.subhead, color: colors.textSecondary },
  refineRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  refineButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.action,
    backgroundColor: colors.selectedFill,
  },
  refinePressed: { opacity: 0.7 },
  refineDisabled: { opacity: 0.4 },
  refineLabel: { ...type.footnote, color: colors.actionText, fontWeight: '600' },
  suggestion: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.selectedFill,
    borderWidth: 1,
    borderColor: colors.emphasis,
  },
  suggestionLabel: {
    ...type.caption,
    fontWeight: '600',
    color: colors.selectedText,
    marginBottom: 4,
  },
  suggestionText: { ...type.subhead, color: colors.textPrimary, marginBottom: 12 },
  suggestionActions: { flexDirection: 'row', gap: 8 },
});
