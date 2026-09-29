import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { LogPredictionForm } from '@/components/prediction/LogPredictionForm';

export default function LogScreen() {
  const router = useRouter();
  return (
    // Keeps Save reachable with the keyboard up, and a drag down dismisses it.
    <ScrollView
      contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      <LogPredictionForm onSubmitted={() => router.replace('/' as never)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
});
