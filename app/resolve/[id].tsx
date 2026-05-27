import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ResolvePrompt } from '@/components/resolution/ResolvePrompt';

export default function ResolveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;

  if (typeof id !== 'string' || id.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Invalid link</Text>
        <Text style={styles.body}>No prediction id was provided.</Text>
      </View>
    );
  }

  return (
    <ResolvePrompt
      predictionId={id}
      onResolved={() => router.replace('/' as never)}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  body: { color: '#6b7280' },
});
