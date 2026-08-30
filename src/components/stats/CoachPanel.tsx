import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useCoachStore } from '@/store/coachStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import type { CoachInsight } from '@/types';

import { SupportSurface } from './SupportSurface';

/**
 * The Coach surface on Stats (COACH_AGENT.md §8, L6).
 *
 * Pull, not push: the user asks. Every render path here is a no-op unless the
 * user is Plus AND has turned Coach on, so a free user sees a one-line upsell
 * and never triggers a request.
 *
 * The AI label is not decoration — §5.6 requires the Coach be clearly marked
 * as AI wherever it speaks.
 */
export function CoachPanel() {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const coachEnabled = useSettingsStore((s) => s.coachEnabled);
  const userStat = useStatsStore((s) => s.userStat);
  const resolved = usePredictionStore((s) => s.resolved);

  const insights = useCoachStore((s) => s.insights);
  const crisisTopic = useCoachStore((s) => s.crisisTopic);
  const loading = useCoachStore((s) => s.loading);
  const failed = useCoachStore((s) => s.lastRequestFailed);
  const lastAnsweredAt = useCoachStore((s) => s.lastAnsweredAt);
  const requestInsights = useCoachStore((s) => s.requestInsights);

  if (!isPlus) {
    return (
      <View style={styles.wrap} testID="coach-upsell">
        <Text style={styles.heading}>Coach</Text>
        <Text style={styles.muted}>
          Plus reads your calibration numbers and tells you what they mean.
        </Text>
      </View>
    );
  }

  if (!coachEnabled) {
    return (
      <View style={styles.wrap} testID="coach-disabled">
        <Text style={styles.heading}>Coach</Text>
        <Text style={styles.muted}>
          Turn Coach on in Settings to get AI feedback on your calibration.
        </Text>
      </View>
    );
  }

  const onAsk = () =>
    void requestInsights({ userStat, resolved, isPlus, enabled: coachEnabled });

  return (
    <View style={styles.wrap} testID="coach-panel">
      <View style={styles.header}>
        <Text style={styles.heading}>Coach</Text>
        <Text style={styles.aiLabel}>AI</Text>
      </View>

      {crisisTopic ? (
        <SupportSurface topic={crisisTopic} />
      ) : (
        <>
          {insights.map((insight, i) => (
            <InsightCard key={`${insight.category}-${i}`} insight={insight} />
          ))}

          {insights.length === 0 && lastAnsweredAt && !failed && (
            <Text style={styles.muted} testID="coach-nothing-to-say">
              Nothing worth flagging yet — keep logging and resolving.
            </Text>
          )}

          {failed && (
            <Text style={styles.muted} testID="coach-unavailable">
              Coach is unavailable right now.
            </Text>
          )}
        </>
      )}

      <Button
        label={loading ? 'Reading your numbers…' : 'Get feedback'}
        testID="coach-ask"
        disabled={loading}
        onPress={onAsk}
      />
    </View>
  );
}

function InsightCard({ insight }: { insight: CoachInsight }) {
  return (
    <View style={styles.card} testID={`coach-insight-${insight.category}`}>
      <Text style={styles.category}>{insight.category}</Text>
      <Text style={styles.message}>{insight.message}</Text>
      {insight.suggestion && (
        <Text style={styles.suggestion}>{insight.suggestion}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, padding: 16, paddingTop: 0 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  heading: { fontSize: 17, fontWeight: '700' },
  aiLabel: {
    backgroundColor: '#eef2ff',
    borderRadius: 4,
    color: '#4338ca',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  muted: { color: '#6b7280', fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    gap: 4,
    padding: 14,
  },
  category: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  message: { color: '#111827', fontSize: 15, lineHeight: 21 },
  suggestion: { color: '#4b5563', fontSize: 14, lineHeight: 20 },
});
