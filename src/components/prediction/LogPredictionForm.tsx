import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { refinePrediction } from '@/ai/refine';
import { track } from '@/analytics/track';
import { CoverageNudge } from '@/components/prediction/CoverageNudge';
import { CategoryChips } from '@/components/prediction/CategoryChips';
import { datePresets, DueDateChips } from '@/components/prediction/DueDateChips';
import { type LogAgainDraft } from '@/components/prediction/logAgain';
import { StarterIdeas } from '@/components/prediction/StarterIdeas';
import { trackRecordLine } from '@/components/prediction/trackRecord';
import { Button } from '@/components/ui/Button';
import { ConfidenceControl } from '@/components/ui/ConfidenceControl';
import { haptics } from '@/components/ui/haptics';
import { holdRanges } from '@/components/ui/holdRanges';
import { TextField } from '@/components/ui/TextField';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { REFINE_ENABLED } from '@/constants/app';
import { colors, radius, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  coverageNudgeNow,
  useStatsStore,
  type CoverageNudgeDecision,
} from '@/store/statsStore';
import { type Category } from '@/types';

const TITLE_MAX_LENGTH = 200;

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
}

export function LogPredictionForm({ onSubmitted, onDirtyChange, again }: LogPredictionFormProps) {
  // Presets are frozen at mount: regenerating them every render would change
  // the ISO strings each tick and break chip-selection comparison below.
  const [presets, setPresets] = useState(datePresets);
  const [title, setTitle] = useState(again?.title ?? '');
  const dirty = title.trim().length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const [category, setCategory] = useState<Category | null>(again?.category ?? null);
  // Empty until set (roadmap D13): a preset can't be told apart from a choice,
  // so a save that never touched the control sat at a number nobody chose.
  const [confidence, setConfidence] = useState<number | null>(null);
  // A first prediction is due tomorrow, so its result lands on Day 1 (D18 (4));
  // after that, in a week.
  const firstEver = usePredictionStore((s) => s.pending.length + s.resolved.length === 0);
  const [dueDate, setDueDate] = useState(
    again?.dueIso ?? presets[firstEver ? 0 : 1].iso,
  );
  // Showing the inline picker (iOS compact / web date input).
  const [picking, setPicking] = useState(false);
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
    setPresetsDay(day);
  }, [day, presetsDay, presets, dueDate]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
  useStatsStore((s) => s.calibration);
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
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  useEffect(() => {
    if (nudge || nudgeDismissed) return;
    const decision = coverageNudgeNow();
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

  const onSubmit = async () => {
    if (confidence === null || category === null) return;
    setError(null);
    setSubmitting(true);
    try {
      await usePredictionStore.getState().create({
        title,
        category,
        confidence,
        due_date: dueDate,
      });
      haptics.commit();
      setTitle('');
      setCategory(null);
      setConfidence(null);
      const next = datePresets();
      setPresets(next);
      setDueDate(next[1].iso);
      setPicking(false);
      onSubmitted?.();
    } catch (e) {
      // The store's messages are for developers ("confidence must be an
      // integer…"). Say what happened in words, keep the detail in the log.
      // eslint-disable-next-line no-console
      console.warn('[log] save failed:', e);
      setError("Couldn't save that. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Save waits for a title, a category and a confidence (DESIGN_SYSTEM §7.12,
  // roadmap D13 and D29), as iOS's own Add buttons do, instead of answering a
  // tap with an error far below the field.
  const canSave =
    title.trim().length > 0 && category !== null && confidence !== null && !submitting;

  // Save is pinned under the fields (2026-10-09): at the end of the form it sat
  // below the fold on a 667pt phone even after the starter ideas had gone. The
  // fields scroll; the one action stays put. With the keyboard up it sits
  // behind it, which costs nothing: Save also waits for a confidence, and
  // setting one means the keyboard is down.
  return (
    <View style={styles.form}>
      <ScrollView
        contentContainerStyle={styles.fields}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
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
          // Short enough to fit at 320pt in Inter, which runs wider than SF, and
          // dateless: a first prediction starts on Tomorrow, later ones a week.
          placeholder="e.g. I'll finish the draft"
          maxLength={TITLE_MAX_LENGTH}
          testID="title-field"
        />

        {firstEver && title.trim().length === 0 && (
          <StarterIdeas
            onPick={(idea) => {
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
          <CategoryChips value={category} onChange={setCategory} />
        </View>

        <View style={styles.block}>
          {/* No band and no chip for any number (roadmap D23, 2026-10-10): the
              integrity bonus paid for 35–65%, which pushes reports toward it. */}
          <ConfidenceControl value={confidence} onChange={setConfidence} />
          {record && (
            <Text style={styles.record} testID="track-record">
              {holdRanges(record.text)}
            </Text>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Due date</Text>
          <DueDateChips
            presets={presets}
            value={dueDate}
            picking={picking}
            onChange={setDueDate}
            onPickingChange={setPicking}
          />
        </View>

      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.error} testID="log-error">{error}</Text>}
        <Button
          label={submitting ? 'Saving…' : 'Save prediction'}
          onPress={onSubmit}
          disabled={!canSave}
          testID="submit-button"
        />
      </View>
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
  block: { marginBottom: space.xl },
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary, marginBottom: space.sm },
  // Counts in plain ink: information, not a verdict or a nudge.
  record: { ...type.footnote, color: colors.textSecondary, marginTop: space.sm },
  error: { ...type.subhead, color: colors.destructive, marginBottom: space.md },
  refineRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  refineButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.brand600,
    backgroundColor: colors.brand50,
  },
  refinePressed: { opacity: 0.7 },
  refineDisabled: { opacity: 0.4 },
  refineLabel: { ...type.footnote, color: colors.brandText, fontWeight: '600' },
  suggestion: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.brand50,
    borderWidth: 1,
    borderColor: colors.brand200,
  },
  suggestionLabel: {
    ...type.caption,
    fontWeight: '600',
    color: colors.brand800,
    marginBottom: 4,
  },
  suggestionText: { ...type.subhead, color: colors.textPrimary, marginBottom: 12 },
  suggestionActions: { flexDirection: 'row', gap: 8 },
});
