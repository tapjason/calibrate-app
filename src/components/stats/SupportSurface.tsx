import { StyleSheet, Text, View } from 'react-native';

import { supportResource, type CrisisTopic } from '@/ai/crisisFilter';
import { colors, radius, space, type } from '@/constants/theme';

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

// Sunken and borderless: nothing here borrows the Coach card's chrome
// (DESIGN_SYSTEM §7.13).
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.sm,
    padding: space.lg,
  },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  contact: { ...type.subhead, color: colors.textPrimary, fontWeight: '600' },
});
