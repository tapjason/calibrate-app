import { useRef, useState } from 'react';
import { ScrollView } from 'react-native';

import { SheetCloseBar } from '@/components/ui/SheetCloseBar';
import { space } from '@/constants/theme';

import { ScoringExplainer } from './ScoringExplainer';

interface ScoringSheetProps {
  onClose: () => void;
  /** Open at the Badges section (from Today's identity line, roadmap D27). */
  openAtBadges?: boolean;
}

/**
 * "How scoring works" as a sheet: the explainer under a pinned × bar. Opened
 * at Badges, the × used to sit in the scroll, six screens up at large text,
 * with no tab bar to fall back on (blind playtest 2026-11-12e, finding 1), so
 * it is the scroll's sticky first child, as on details and Resolve.
 */
export function ScoringSheet({ onClose, openAtBadges = false }: ScoringSheetProps) {
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
