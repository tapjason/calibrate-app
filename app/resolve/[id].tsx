import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResolvePrompt } from '@/components/resolution/ResolvePrompt';
import { useReflectionGuard } from '@/components/resolution/useReflectionGuard';
import { colors, type } from '@/constants/theme';

export default function ResolveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const [draft, setDraft] = useState('');
  // Asks before a swipe-down discards a typed reflection.
  const guard = useReflectionGuard(typeof id === 'string' ? id : '', draft);

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
          onResolved={() => {
            guard.markLeaving();
            if (router.canGoBack()) router.back();
            else router.replace('/' as never);
          }}
          onDraftChange={setDraft}
          // Roadmap step 22: close this sheet and start a fresh call on Log.
          onPredictAgain={(prediction) => {
            guard.markLeaving();
            const href = `/log?again=${encodeURIComponent(prediction.id)}`;
            if (router.canGoBack()) router.dismissTo(href as never);
            else router.replace(href as never);
          }}
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
