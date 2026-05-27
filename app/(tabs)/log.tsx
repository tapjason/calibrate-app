import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { LogPredictionForm } from '@/components/prediction/LogPredictionForm';

export default function LogScreen() {
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <LogPredictionForm onSubmitted={() => router.replace('/' as never)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
});
