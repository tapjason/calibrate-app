import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScoringExplainer } from '@/components/stats/ScoringExplainer';

/** "How scoring works", opened from Stats and Settings (roadmap step 29). */
export default function ScoringScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView>
        <ScoringExplainer
          onClose={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/stats' as never);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
