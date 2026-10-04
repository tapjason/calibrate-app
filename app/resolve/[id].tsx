import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResolvePrompt } from '@/components/resolution/ResolvePrompt';
import { colors, type } from '@/constants/theme';

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
      {/* Scrolls, and moves clear of the keyboard: on a small phone the
          reflection box, a milestone card and Done don't all fit above it. */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <ResolvePrompt
          predictionId={id}
          // A sheet closes back to wherever it opened from; a cold start from a
          // notification has nowhere to go back to, so it lands on Home.
          onResolved={() =>
            router.canGoBack() ? router.back() : router.replace('/' as never)
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  // flexGrow so the prompt's centred loading / not-found states still centre.
  scroll: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { ...type.headline, marginBottom: 8 },
  body: { color: colors.textSecondary },
});
