import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScoringExplainer } from '@/components/stats/ScoringExplainer';

/**
 * "How scoring works", opened from Stats and Settings (roadmap step 29), and
 * from Today's identity line with `?section=badges`, where it opens at the
 * Badges section (roadmap D27).
 */
export default function ScoringScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scroll = useRef<ScrollView>(null);
  const jumped = useRef(false);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView ref={scroll}>
        <ScoringExplainer
          onClose={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/insights' as never);
          }}
          onBadgesLayout={
            section === 'badges'
              ? (y) => {
                  // Once: a later layout pass mustn't pull the reader back.
                  if (jumped.current) return;
                  jumped.current = true;
                  // A little above, so the heading isn't flush with the edge.
                  scroll.current?.scrollTo({ y: Math.max(0, y - 16), animated: false });
                }
              : undefined
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
