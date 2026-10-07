import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { refinePrediction } from '@/ai/refine';
import { track } from '@/analytics/track';
import { CoverageNudge } from '@/components/prediction/CoverageNudge';
import { DuePicker, openDueDialog } from '@/components/prediction/DuePicker';
import { noonInDays, type LogAgainDraft } from '@/components/prediction/logAgain';
import { StarterIdeas } from '@/components/prediction/StarterIdeas';
import { trackRecordLine } from '@/components/prediction/trackRecord';
import { Button } from '@/components/ui/Button';
import { ConfidenceControl } from '@/components/ui/ConfidenceControl';
import { haptics } from '@/components/ui/haptics';
import { holdRanges } from '@/components/ui/holdRanges';
import { CategoryIcon } from '@/components/ui/Icon';
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
import { CATEGORIES, type Category } from '@/types';

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
  const [category, setCategory] = useState<Category>(again?.category ?? 'work');
  // Empty until set (roadmap D13). A preset 50% sat inside the 35–65% band,
  // so a save that never touched the control earned the integrity bonus.
  const [confidence, setConfidence] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(again?.dueIso ?? presets[1].iso);
  // Showing the inline picker (iOS compact / web date input).
  const [picking, setPicking] = useState(false);
  const isCustomDate = !presets.some((p) => p.iso === dueDate);
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
  const firstEver = usePredictionStore((s) => s.pending.length + s.resolved.length === 0);

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
      : trackRecordLine(category, categoryBucketFor(category, confidence), bucketFor(confidence));
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
    if (confidence === null) return;
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

  // Save waits for a title and a confidence (DESIGN_SYSTEM §7.12, roadmap
  // D13), as iOS's own Add buttons do, instead of answering a tap with an
  // error far below the field.
  const canSave = title.trim().length > 0 && confidence !== null && !submitting;

  return (
    <View>
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
        // Short enough to fit at 320pt in Inter, which runs wider than SF.
        placeholder="e.g. I'll ship 3 tasks by Friday"
        maxLength={TITLE_MAX_LENGTH}
        testID="title-field"
      />

      {firstEver && title.trim().length === 0 && (
        <StarterIdeas
          onPick={(idea) => {
            setTitle(idea.title);
            setCategory(idea.category);
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
        <View style={styles.row}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              testID={`category-${c}`}
              accessibilityRole="radio"
              accessibilityLabel={`Category: ${c}`}
              accessibilityState={{ selected: category === c }}
              style={[styles.chip, styles.chipWithIcon, category === c && styles.chipActive]}
            >
              <CategoryIcon
                category={c}
                size={15}
                color={category === c ? colors.brand800 : colors.textSecondary}
              />
              <Text
                style={[
                  styles.chipText,
                  styles.capitalize,
                  category === c && styles.chipTextActive,
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <ConfidenceControl value={confidence} onChange={setConfidence} showIntegrityZone />
        {confidence !== null && confidence >= 35 && confidence <= 65 && (
          // A brand chip, not green text: honesty is rewarded, but green means
          // "calibrated" and never "good job" (DESIGN_SYSTEM §2.3).
          <View style={styles.bonus} testID="integrity-bonus">
            <Text style={styles.bonusText}>Integrity bonus · honest uncertainty</Text>
          </View>
        )}
        {record && (
          <Text style={styles.record} testID="track-record">
            {holdRanges(record.text)}
          </Text>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Due date</Text>
        <View style={styles.row}>
          {presets.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => {
                setDueDate(preset.iso);
                setPicking(false);
              }}
              testID={`due-${preset.id}`}
              accessibilityRole="radio"
              accessibilityLabel={`Due ${preset.label.toLowerCase()}`}
              accessibilityState={{ selected: dueDate === preset.iso }}
              style={[
                styles.chip,
                dueDate === preset.iso && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  dueDate === preset.iso && styles.chipTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              if (Platform.OS === 'android') openDueDialog(dueDate, setDueDate);
              else setPicking(true);
            }}
            testID="due-pick"
            accessibilityRole="radio"
            accessibilityLabel="Pick a date"
            accessibilityState={{ selected: isCustomDate || picking }}
            style={[styles.chip, (isCustomDate || picking) && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                (isCustomDate || picking) && styles.chipTextActive,
              ]}
            >
              Pick a date
            </Text>
          </Pressable>
        </View>
        {picking && <DuePicker value={dueDate} onChange={setDueDate} />}
        <Text style={styles.dateValue} testID="due-sentence">
          Due{' '}
          {new Date(dueDate).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          })}
        </Text>
      </View>

      {error && <Text style={styles.error} testID="log-error">{error}</Text>}

      <Button
        label={submitting ? 'Saving…' : 'Save prediction'}
        onPress={onSubmit}
        disabled={!canSave}
        testID="submit-button"
      />
    </View>
  );
}

function datePresets(): { id: string; label: string; iso: string }[] {
  // Add days in LOCAL time so "tomorrow" means the user's tomorrow, not
  // UTC's, anchored at noon (see noonInDays, shared with "Log it again").
  const make = (daysAhead: number): string => noonInDays(daysAhead);
  return [
    // Words, not "+1 week" — that reads as arithmetic (DESIGN_SYSTEM §7.12).
    { id: 'tomorrow', label: 'Tomorrow', iso: make(1) },
    { id: 'week', label: 'In a week', iso: make(7) },
    { id: 'month', label: 'In a month', iso: make(30) },
  ];
}

const styles = StyleSheet.create({
  block: { marginBottom: space.xl },
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary, marginBottom: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  chip: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  // Selected = tint + bolder label, not colour alone (DESIGN_SYSTEM §7.12).
  chipActive: { backgroundColor: colors.brand50, borderColor: colors.brand600 },
  chipText: { ...type.subhead, color: colors.textPrimary },
  capitalize: { textTransform: 'capitalize' },
  chipWithIcon: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  chipTextActive: { color: colors.brand800, fontWeight: '700' },
  bonus: {
    alignSelf: 'flex-start',
    backgroundColor: colors.integrityBackground,
    borderRadius: radius.pill,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bonusText: { ...type.footnote, color: colors.integrityText, fontWeight: '600' },
  // Counts in plain ink: information, not a verdict or a nudge.
  record: { ...type.footnote, color: colors.textSecondary, marginTop: space.sm },
  dateValue: { ...type.subhead, marginTop: space.sm, color: colors.textSecondary },
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
  refineLabel: { ...type.footnote, color: colors.brand700, fontWeight: '600' },
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
    color: colors.brand700,
    marginBottom: 4,
  },
  suggestionText: { ...type.subhead, color: colors.textPrimary, marginBottom: 12 },
  suggestionActions: { flexDirection: 'row', gap: 8 },
});
