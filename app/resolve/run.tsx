import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResolveRun } from '@/components/resolution/ResolveRun';
import { useReflectionGuard } from '@/components/resolution/useReflectionGuard';

/**
 * Resolve every ready prediction in one sheet (roadmap step 18). A static
 * segment, so it wins over `resolve/[id]`.
 */
export default function ResolveRunScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [draft, setDraft] = useState('');
  // The same guard as single Resolve, for whichever card is showing.
  const guard = useReflectionGuard(current, draft);

  const onDraftChange = useCallback((id: string, text: string) => {
    setCurrent(id);
    setDraft(text);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <ResolveRun
          onDraftChange={onDraftChange}
          onClose={() => {
            guard.markLeaving();
            if (router.canGoBack()) router.back();
            else router.replace('/' as never);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
});
