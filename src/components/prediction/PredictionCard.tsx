import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import type { Prediction } from '@/types';

import { isReadyToResolve } from './dueGroups';

interface PredictionCardProps {
  prediction: Prediction;
  onPress?: (id: string) => void;
}

/** "Fri, 3 Oct" in the user's locale. */
function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Status in words, all in one neutral ink (DESIGN_SYSTEM §7.11). No ✓/✗ —
 * those are the green/red idiom in disguise, and a No is an outcome, not a
 * mistake. A prediction whose day has come is "ready", never "overdue".
 */
function statusLabel(prediction: Prediction, now: Date): string {
  switch (prediction.status) {
    case 'resolved_yes':
      return 'Happened';
    case 'resolved_no':
      return "Didn't happen";
    case 'skipped':
      return 'Not scored';
    case 'pending':
      return isReadyToResolve(prediction, now) ? 'Ready to resolve' : 'Open';
  }
}

export function PredictionCard({ prediction, onPress }: PredictionCardProps) {
  const due = formatDue(prediction.due_date);
  const status = statusLabel(prediction, new Date());
  // A resolved card dates itself by when it was answered, not when it was due.
  const answered = prediction.status !== 'pending' && prediction.resolved_at;
  const when = answered ? `resolved ${formatDue(answered)}` : `due ${due}`;
  // Outcome glyphs in neutral ink, filled vs hollow — never green/red
  // (DESIGN_SYSTEM §2.4). The word beside them carries the meaning.
  const glyph =
    prediction.status === 'resolved_yes'
      ? ({ sf: 'checkmark.circle.fill', ion: 'checkmark-circle' } as const)
      : prediction.status === 'resolved_no'
        ? ({ sf: 'xmark.circle', ion: 'close-circle-outline' } as const)
        : null;
  // Resolve asks "What surprised you?"; History is where the answer is read
  // back (roadmap step 31). Only on a resolved card, and only if written.
  const reflection =
    prediction.status !== 'pending' ? prediction.reflection?.trim() || null : null;

  return (
    <Pressable
      testID={`prediction-card-${prediction.id}`}
      onPress={() => onPress?.(prediction.id)}
      accessibilityRole={onPress ? 'button' : undefined}
      // One sentence instead of fragments read in layout order.
      accessibilityLabel={
        `${prediction.title}. ${prediction.category}, ${prediction.confidence}% confident, ` +
        `${when}. ${status}.` +
        (reflection ? ` Your note: ${reflection}` : '')
      }
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.categoryRow}>
        <CategoryIcon category={prediction.category} size={14} color={colors.textSecondary} />
        <Text style={styles.category}>{prediction.category}</Text>
      </View>
      <Text style={styles.title} numberOfLines={3}>
        {prediction.title}
      </Text>
      {reflection && (
        <Text style={styles.reflection} numberOfLines={4} testID="prediction-card-reflection">
          “{reflection}”
        </Text>
      )}
      <View style={styles.footer}>
        <Text style={styles.meta}>
          {prediction.confidence}% · {when}
        </Text>
        <View style={styles.statusRow}>
          {glyph && (
            <Icon sf={glyph.sf} fallback={glyph.ion} size={16} color={colors.textPrimary} />
          )}
          {/* "Open" is the default state and the list's group header already
              says when it's due, so it isn't repeated on every card. */}
          {status !== 'Open' && <Text style={styles.status}>{status}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.xs,
    marginBottom: space.sm,
    padding: space.lg,
  },
  pressed: { opacity: 0.7 },
  categoryRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  title: { ...type.body, color: colors.textPrimary },
  // The user's own words, quoted and quieter than the prediction they're about.
  reflection: { ...type.footnote, color: colors.textSecondary, fontStyle: 'italic' },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  meta: { ...type.subhead, color: colors.textSecondary },
  status: { ...type.subhead, color: colors.textPrimary, fontWeight: '600' },
});
