import { StyleSheet, Text, View } from 'react-native';

import type { CoachSample } from '@/components/stats/patternCopy';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors, FONT_FAMILY, radius, space, tabularNums, type } from '@/constants/theme';

interface PlusTeaserProps {
  onUpgrade: () => void;
  /**
   * Whole months since the first answer (wholeMonthsSince), so the Trends
   * hook gets more concrete; 0 under a month, which names no number.
   */
  monthsOnFile?: number;
  /**
   * One Coach card written by the app from the person's own record (roadmap
   * D37), shown as a sample of what Coach does, or null.
   */
  sample?: CoachSample | null;
}

/**
 * The one Plus teaser on Stats (DESIGN_SYSTEM §7.1/§7.6; baseline 05 had two
 * grey "See Plus" slabs that read as disabled buttons). It sits below the
 * user's own score, curve and badges — all free — and never over them.
 *
 * One card, one button, two benefits in a line each, the way the paywall
 * itself will read.
 */
export function PlusTeaser({ onUpgrade, monthsOnFile = 0, sample = null }: PlusTeaserProps) {
  const trendsLine =
    monthsOnFile > 0
      ? `Trends: your ${monthsOnFile} ${monthsOnFile === 1 ? 'month' : 'months'} on file, and what your 80% really means.`
      : 'Trends: your calibration month by month, and what your 80% really means.';

  return (
    <View style={styles.card} testID="plus-teaser">
      <Text style={styles.eyebrow}>Calibrate Plus</Text>
      <Text accessibilityRole="header" style={styles.title}>Go deeper on your own numbers</Text>

      <View style={styles.benefit}>
        <Icon sf="text.bubble" fallback="chatbubble-ellipses-outline" size={18} color={colors.action} />
        <Text style={styles.benefitText}>
          Coach: an AI read of what your calibration numbers mean.
        </Text>
      </View>
      {sample && (
        <View style={styles.sample} testID="plus-teaser-sample">
          <Text style={styles.sampleLabel}>A sample, on your own numbers</Text>
          <View
            style={styles.sampleReceipt}
            accessible
            accessibilityLabel={`${sample.figure}, ${sample.label}`}
          >
            <Text style={styles.sampleFigure}>{sample.figure}</Text>
            <Text style={styles.sampleReceiptLabel}>{sample.label}</Text>
          </View>
          <Text style={styles.sampleMessage}>{sample.message}</Text>
          {/* Honest about who wrote it: the app, from the record. Coach itself
              needs Plus and a sign-in, and writes its own. */}
          <Text style={styles.sampleNote}>
            Written by the app from your record. With Plus, Coach writes cards like this when you
            ask.
          </Text>
        </View>
      )}
      <View style={styles.benefit}>
        <Icon
          sf="chart.line.uptrend.xyaxis"
          fallback="trending-up"
          size={18}
          color={colors.action}
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
  eyebrow: { ...type.eyebrow, color: colors.actionText },
  title: { ...type.title3, color: colors.textPrimary },
  benefit: { alignItems: 'flex-start', flexDirection: 'row', gap: space.sm },
  benefitText: { ...type.subhead, color: colors.textSecondary, flex: 1 },
  free: { ...type.footnote, color: colors.textSecondary },
  // The Coach card's look (CoachPanel), sunken so it reads as an example
  // inside the card rather than a second card.
  sample: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.xs,
    padding: space.md,
  },
  sampleLabel: { ...type.footnote, color: colors.textSecondary, fontWeight: '600' },
  sampleReceipt: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sampleFigure: { ...type.title2, ...tabularNums, color: colors.textPrimary, fontFamily: FONT_FAMILY },
  sampleReceiptLabel: { ...type.footnote, color: colors.textSecondary },
  sampleMessage: { ...type.subhead, color: colors.textPrimary },
  sampleNote: { ...type.caption, color: colors.textSecondary },
});
