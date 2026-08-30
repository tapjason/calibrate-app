import { StyleSheet, Text, View } from 'react-native';

import { supportResource, type CrisisTopic } from '@/ai/crisisFilter';

interface SupportSurfaceProps {
  topic: CrisisTopic;
}

/**
 * The `safe: false` path (COACH_AGENT.md §5.5). Shown instead of any coaching
 * when the crisis pre-filter trips.
 *
 * Deliberately plain. This is not a Coach card wearing different colors — no
 * insight, no statistic, no suggestion, nothing that reads as the app having
 * an opinion about the person. It steps back and points to humans, which is
 * the entire specified behavior.
 *
 * The copy makes no promise about confidentiality or outcome, and never names
 * or implies a condition.
 */
export function SupportSurface({ topic }: SupportSurfaceProps) {
  const resource = supportResource({ safe: false, topic });
  if (!resource) return null;

  return (
    <View style={styles.card} testID="coach-support-surface">
      <Text style={styles.title}>{resource.title}</Text>
      <Text style={styles.body}>{resource.body}</Text>
      <Text style={styles.contact} testID="support-contact">
        {resource.contact}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  title: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  body: { color: '#475569', fontSize: 14, lineHeight: 20 },
  contact: { color: '#0f172a', fontSize: 14, fontWeight: '600', lineHeight: 20 },
});
