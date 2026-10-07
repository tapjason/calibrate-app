import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { logAgainDraft, type LogAgainDraft } from '@/components/prediction/logAgain';
import { LogPredictionForm } from '@/components/prediction/LogPredictionForm';
import { useLogDraftGuard } from '@/components/prediction/useLogDraftGuard';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';

/**
 * Log, as a full-height sheet over whichever tab opened it (roadmap D3): an
 * action, not a place, so the "+" opens it instead of a tab holding it. Each
 * open starts a fresh form at the top.
 */
export default function LogScreen() {
  const router = useRouter();
  // "Log it again" from Resolve (roadmap step 22) arrives as ?again=<id>.
  const { again } = useLocalSearchParams<{ again?: string }>();
  const [draft, setDraft] = useState<LogAgainDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const guard = useLogDraftGuard(dirty);

  useEffect(() => {
    if (typeof again !== 'string' || again.length === 0) return;
    (async () => {
      // getById applies the current-user filter, so a crafted link can't
      // prefill someone else's prediction.
      const source = await usePredictionStore.getState().getById(again);
      if (source) setDraft(logAgainDraft(source));
      // Consumed only now (clearing it first would re-run this effect and
      // race the lookup), so a reload doesn't prefill the form a second time.
      router.setParams({ again: undefined });
    })();
  }, [again, router]);

  // A sheet closes back to the tab it opened over; reached directly (the
  // Warmup's last step, a cold link) it has nothing behind it, so Today.
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  };

  return (
    <View style={styles.sheet}>
      {/* The way out before anything is saved (roadmap step 79), besides the
          grabber and the swipe; a typed draft asks first. */}
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          New prediction
        </Text>
        <CloseButton onPress={close} testID="log-close" />
      </View>
      {/* Keeps Save reachable with the keyboard up, and a drag down dismisses it. */}
      <ScrollView
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {/* A new key per repeated prediction, so the form starts from it. */}
        <LogPredictionForm
          key={draft?.sourceId ?? 'blank'}
          again={draft}
          onDirtyChange={setDirty}
          onSubmitted={() => {
            guard.markLeaving();
            close();
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.canvas, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  title: { ...type.title2, color: colors.textPrimary },
  wrap: { padding: space.lg },
});
