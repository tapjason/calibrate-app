import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResolvePrompt } from '@/components/resolution/ResolvePrompt';

export default function ResolveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;

  // This route has no nav header (the root Stack is headerShown: false) and is
  // reached via push/notification deep-link, so it must inset its own top edge
  // — without this the content sits under the status bar / notch.
  if (typeof id !== 'string' || id.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.title}>Invalid link</Text>
          <Text style={styles.body}>No prediction id was provided.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ResolvePrompt
        predictionId={id}
        onResolved={() => router.replace('/' as never)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  body: { color: '#6b7280' },
});
