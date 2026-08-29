import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShareCardPanel } from '@/components/share/ShareCardPanel';
import { Button } from '@/components/ui/Button';

/**
 * Share screen. Reached from Stats — pushed rather than tabbed, since it is a
 * thing you go do, not a place you live. No nav header (the root Stack draws
 * none), so it insets its own top edge.
 */
export default function ShareScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Your card</Text>
          <Text style={styles.body}>
            Where your judgment holds up, and where it doesn&apos;t.
          </Text>
        </View>

        <ShareCardPanel />

        <Button label="Done" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { gap: 20, padding: 20, paddingBottom: 40 },
  header: { gap: 6 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { color: '#6b7280', fontSize: 15, lineHeight: 21 },
});
