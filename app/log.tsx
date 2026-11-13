import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logAgainDraft, type LogAgainDraft } from '@/components/prediction/logAgain';
import { LogPredictionForm } from '@/components/prediction/LogPredictionForm';
import { useLogDraftGuard } from '@/components/prediction/useLogDraftGuard';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, space, type } from '@/constants/theme';
import { useLogDraftStore } from '@/store/logDraftStore';
import { usePredictionStore } from '@/store/predictionStore';

/**
 * Log, as a full-height sheet over whichever tab opened it (roadmap D3): an
 * action, not a place, so the "+" opens it instead of a tab holding it. Each
 * open starts a fresh form at the top.
 */
export default function LogScreen() {
  const router = useRouter();
  // "Log it again" from Resolve (roadmap step 22) or History's answered
  // details (D56) arrives as ?again=<id>.
  const { again } = useLocalSearchParams<{ again?: string }>();
  const [draft, setDraft] = useState<LogAgainDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  // "Discard prediction" throws the kept draft away too (step 173).
  const guard = useLogDraftGuard(dirty, () => void useLogDraftStore.getState().clear());
  // A draft kept from an interrupted Log, offered back on a plain open (step
  // 173): read once, at mount, so the form's own saves don't remount it.
  // "Log it again" starts from its own prediction instead.
  const [kept] = useState(() =>
    typeof again === 'string' && again.length > 0 ? null : useLogDraftStore.getState().draft,
  );

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

  // The top edge inset, as every other sheet's (Resolve, Scoring, Share): zero
  // inside the page sheet, which starts below the status bar, but whenever Log
  // ends up full screen it keeps the title row and its × out from under the
  // Dynamic Island (owner, iPhone 17, 2026-11-12: "sometimes" hidden there).
  return (
    <SafeAreaView style={styles.sheet} edges={['top']}>
      {/* The form scrolls its own fields and pins Save beneath them. A new key
          per repeated prediction, so the form starts from it. The title row
          rides inside the scroll view (see LogPredictionForm's `header`). */}
      <LogPredictionForm
        key={draft?.sourceId ?? 'blank'}
        again={draft}
        kept={draft ? null : kept}
        header={
          // The way out before anything is saved (roadmap step 79), besides
          // the swipe; a typed draft asks first.
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              New prediction
            </Text>
            <CloseButton onPress={close} testID="log-close" />
          </View>
        }
        onDirtyChange={setDirty}
        onSubmitted={() => {
          guard.markLeaving();
          close();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.canvas, flex: 1 },
  // Inside the form's padded scroll content, so no padding of its own.
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  title: { ...type.title2, color: colors.textPrimary },
});
