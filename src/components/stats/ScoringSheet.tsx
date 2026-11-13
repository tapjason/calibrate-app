import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SheetCloseBar } from '@/components/ui/SheetCloseBar';
import { colors, radius, space, type } from '@/constants/theme';

import { ScoringExplainer } from './ScoringExplainer';

interface ScoringSheetProps {
  onClose: () => void;
  /** Open at the Badges section (from Today's identity line, roadmap D27). */
  openAtBadges?: boolean;
  /**
   * The person's own rating in words, above the explainer, when it's opened
   * from Today's rating (step 173): "is 86 good?" was answered nowhere.
   */
  ratingLine?: string | null;
}

/**
 * "How scoring works" as a sheet: the explainer under a pinned × bar. Opened
 * at Badges, the × used to sit in the scroll, six screens up at large text,
 * with no tab bar to fall back on (blind playtest 2026-11-12e, finding 1), so
 * it is the scroll's sticky first child, as on details and Resolve.
 */
export function ScoringSheet({ onClose, openAtBadges = false, ratingLine = null }: ScoringSheetProps) {
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
      {ratingLine && (
        <View style={styles.yours} testID="scoring-rating-line">
          <Text style={styles.yoursText}>{ratingLine}</Text>
        </View>
      )}
      <ScoringExplainer
        onBadgesLayout={
          openAtBadges
            ? (y) => {
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
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.lg,
  },
  yoursText: { ...type.body, color: colors.textPrimary },
});
