import { StyleSheet, Text, View } from 'react-native';

import { CloseButton } from '@/components/ui/CloseButton';
import { holdRanges } from '@/components/ui/holdRanges';
import { LensEmblem } from '@/components/ui/LensEmblem';
import { colors, radius, space, type } from '@/constants/theme';

import { badgeRows, scoringSections } from './scoringCopy';

/**
 * "How scoring works" (roadmap step 29): the math in plain words, on demand.
 * The product pitch is identity, not statistics (CLAUDE.md), so this never
 * appears unasked; it is one tap away from the number it explains, for anyone
 * who wants to check it. Calibrated trust, not maximum trust.
 */
export function ScoringExplainer({
  onClose,
  onBadgesLayout,
}: {
  onClose?: () => void;
  /**
   * Where the Badges section starts, so the sheet can open there when it's
   * reached from Today's identity line (roadmap D27).
   */
  onBadgesLayout?: (y: number) => void;
}) {
  const sections = scoringSections();
  return (
    <View style={styles.wrap} testID="scoring-explainer">
      {/* The way out sits at the top, where a sheet's is looked for (roadmap
          step 79); a reader at the end swipes down, as with any sheet. */}
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          How scoring works
        </Text>
        {onClose && <CloseButton onPress={onClose} testID="scoring-close" />}
      </View>
      {sections.map((section) => (
        <View
          key={section.title}
          style={styles.section}
          onLayout={
            section.title === 'Badges' && onBadgesLayout
              ? (e) => onBadgesLayout(e.nativeEvent.layout.y)
              : undefined
          }
          testID={section.title === 'Badges' ? 'scoring-section-badges' : undefined}
        >
          <Text style={styles.heading} accessibilityRole="header">
            {section.title}
          </Text>
          {section.paragraphs.map((p) => (
            <Text key={p} style={styles.body}>
              {holdRanges(p)}
            </Text>
          ))}
          {section.title === 'Badges' && (
            <View style={styles.badges}>
              {badgeRows().map((row) => (
                <View
                  key={row.badge}
                  style={styles.badgeRow}
                  accessible
                  accessibilityLabel={`${row.label}: ${row.criteria}`}
                  testID={`scoring-badge-${row.badge}`}
                >
                  <LensEmblem tier={row.badge} size={28} />
                  <View style={styles.badgeText}>
                    <Text style={styles.badgeLabel}>{row.label}</Text>
                    <Text style={styles.badgeCriteria}>{row.criteria}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl, padding: space.lg, paddingBottom: space.xxxl },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: space.md },
  title: { ...type.title1, color: colors.textPrimary, flex: 1 },
  section: { gap: space.sm },
  heading: { ...type.headline, color: colors.textPrimary },
  body: { ...type.body, color: colors.textSecondary },
  badges: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.md,
    marginTop: space.xs,
    padding: space.lg,
  },
  badgeRow: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  badgeText: { flex: 1 },
  badgeLabel: { ...type.subhead, color: colors.textPrimary, fontWeight: '600' },
  badgeCriteria: { ...type.footnote, color: colors.textSecondary },
});
