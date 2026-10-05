import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';

interface PlusTeaserProps {
  onUpgrade: () => void;
  /** Months of resolved history on file — the Trends hook gets more concrete. */
  monthsOnFile?: number;
}

/**
 * The one Plus teaser on Stats (DESIGN_SYSTEM §7.1/§7.6; baseline 05 had two
 * grey "See Plus" slabs that read as disabled buttons). It sits below the
 * user's own score, curve and badges — all free — and never over them.
 *
 * One card, one button, two benefits in a line each, the way the paywall
 * itself will read.
 */
export function PlusTeaser({ onUpgrade, monthsOnFile = 0 }: PlusTeaserProps) {
  const trendsLine =
    monthsOnFile > 0
      ? `Trends: your ${monthsOnFile} ${monthsOnFile === 1 ? 'month' : 'months'} on file, what your 80% really means, and CSV export.`
      : 'Trends: your calibration month by month, what your 80% really means, and CSV export.';

  return (
    <View style={styles.card} testID="plus-teaser">
      <Text style={styles.eyebrow}>Calibrate Plus</Text>
      <Text style={styles.title}>Go deeper on your own numbers</Text>

      <View style={styles.benefit}>
        <Icon sf="sparkles" fallback="sparkles" size={18} color={colors.brand600} />
        <Text style={styles.benefitText}>
          Coach: an AI read of what your calibration numbers mean.
        </Text>
      </View>
      <View style={styles.benefit}>
        <Icon
          sf="chart.line.uptrend.xyaxis"
          fallback="trending-up"
          size={18}
          color={colors.brand600}
        />
        <Text style={styles.benefitText}>{trendsLine}</Text>
      </View>

      <Text style={styles.free}>Your score, curve, badges and cards stay free.</Text>

      <Button
        label="See Plus"
        variant="secondary"
        onPress={onUpgrade}
        testID="plus-teaser-cta"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    padding: space.lg,
  },
  eyebrow: { ...type.eyebrow, color: colors.brandText },
  title: { ...type.title3, color: colors.textPrimary },
  benefit: { alignItems: 'flex-start', flexDirection: 'row', gap: space.sm },
  benefitText: { ...type.subhead, color: colors.textSecondary, flex: 1 },
  free: { ...type.footnote, color: colors.textSecondary },
});
