import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { holdRanges } from '@/components/ui/holdRanges';
import { SheetCloseBar } from '@/components/ui/SheetCloseBar';
import { colors, radius, space, type } from '@/constants/theme';

import { ScoringExplainer } from './ScoringExplainer';

interface ScoringSheetProps {
  onClose: () => void;
  /**
   * The section to open at: Badges from Today's identity line (roadmap D27),
   * Your streak from the streak row (blind playtest 2026-11-13, runs 4 and 7:
   * the streak was the first thing a streak-wary person tapped, and nothing
   * happened).
   */
  openAt?: string | null;
  /**
   * The person's own rating in words, above the explainer, when it's opened
   * from a rating (step 173: "is 86 good?" was answered nowhere): from Today's
   * rating, and from "What does this mean?" on Insights since D76, which moved
   * these lines off the page. One paragraph each, in order
   * (`ratingDetailLines`); none while the rating is provisional.
   */
  ratingLines?: readonly string[] | null;
}

/**
 * "How scoring works" as a sheet: the explainer under a pinned × bar. Opened
 * at Badges, the × used to sit in the scroll, six screens up at large text,
 * with no tab bar to fall back on (blind playtest 2026-11-12e, finding 1), so
 * it is the scroll's sticky first child, as on details and Resolve.
 */
export function ScoringSheet({ onClose, openAt = null, ratingLines = null }: ScoringSheetProps) {
  const scroll = useRef<ScrollView>(null);
  const jumped = useRef(false);
  // A hairline sets the bar off once the text has scrolled under it.
  const [scrolled, setScrolled] = useState(false);
  return (
    <ScrollView
      ref={scroll}
      stickyHeaderIndices={[0]}
      onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 0)}
      scrollEventThrottle={16}
      testID="scoring-scroll"
    >
      <SheetCloseBar onPress={onClose} testID="scoring-close" scrolled={scrolled} />
      {ratingLines && ratingLines.length > 0 && (
        <View style={styles.yours} testID="scoring-rating-line">
          {/* A heading of its own, so a heading jump reaches it (blind
              playtest 2026-11-13e, run 6: it sat above the first heading). */}
          <Text style={styles.yoursHeading} accessibilityRole="header">
            Your rating
          </Text>
          {ratingLines.map((line, i) => (
            <Text key={line} style={styles.yoursText} testID={`scoring-rating-line-${i}`}>
              {holdRanges(line)}
            </Text>
          ))}
        </View>
      )}
      <ScoringExplainer
        onSectionLayout={
          openAt
            ? (title, y) => {
                if (title !== openAt) return;
                // Once: a later layout pass mustn't pull the reader back.
                if (jumped.current) return;
                jumped.current = true;
                // `y` is from the explainer's top, which sits one bar's height
                // down the content; the pinned bar then covers that same
                // height of the view. The two cancel, so scrolling to `y`
                // puts the heading just under the bar, and a little more
                // keeps it off the bar's edge.
                scroll.current?.scrollTo({ y: Math.max(0, y - space.lg), animated: false });
              }
            : undefined
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A sunken panel, no hue (the welcome-back card's shape, roadmap D33).
  yours: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.lg,
  },
  yoursHeading: { ...type.headline, color: colors.textPrimary, marginBottom: space.xs },
  yoursText: { ...type.body, color: colors.textPrimary },
});
