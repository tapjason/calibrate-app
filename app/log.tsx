import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { logAgainDraft, type LogAgainDraft } from '@/components/prediction/logAgain';
import { LogPredictionForm } from '@/components/prediction/LogPredictionForm';
import { usePredictionStore } from '@/store/predictionStore';

export default function LogScreen() {
  const router = useRouter();
  // "Log it again" from Resolve (roadmap step 22) arrives as ?again=<id>.
  const { again } = useLocalSearchParams<{ again?: string }>();
  const [draft, setDraft] = useState<LogAgainDraft | null>(null);
  // The tab stays mounted, and so does its scroll offset. On a short phone
  // Save is reached by scrolling, so the next visit opened at the bottom, the
  // empty Prediction field scrolled off the top. A new form starts at the top.
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (typeof again !== 'string' || again.length === 0) return;
    (async () => {
      // getById applies the current-user filter, so a crafted link can't
      // prefill someone else's prediction.
      const source = await usePredictionStore.getState().getById(again);
      if (source) {
        setDraft(logAgainDraft(source));
        scroll.current?.scrollTo({ y: 0, animated: false });
      }
      // Consumed only now (clearing it first would re-run this effect and
      // race the lookup), so a reload doesn't prefill the form a second time.
      router.setParams({ again: undefined });
    })();
  }, [again, router]);

  return (
    // Keeps Save reachable with the keyboard up, and a drag down dismisses it.
    <ScrollView
      ref={scroll}
      contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      {/* A new key per repeated prediction, so the form starts from it. */}
      <LogPredictionForm
        key={draft?.sourceId ?? 'blank'}
        again={draft}
        onSubmitted={() => {
          setDraft(null);
          scroll.current?.scrollTo({ y: 0, animated: false });
          router.replace('/' as never);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
});
