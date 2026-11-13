import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
  // Each card, and "All caught up", starts at the top (blind playtest
  // 2026-11-13, run 1: the done screen opened with its heading cut off).
  const scroll = useRef<ScrollView>(null);

  const onDraftChange = useCallback((id: string, text: string) => {
    setCurrent(id);
    setDraft(text);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <ResolveRun
          onDraftChange={onDraftChange}
          onStep={() => scroll.current?.scrollTo({ y: 0, animated: false })}
          // The × mid-run (roadmap step 79): answered cards are saved, the rest
          // stay open, and a typed reflection goes through the guard.
          onDismiss={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/' as never);
          }}
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
