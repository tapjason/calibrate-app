import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictionDetails } from '@/components/prediction/PredictionDetails';
import { useEditDraftGuard } from '@/components/prediction/useLogDraftGuard';
import { SheetCloseBar } from '@/components/ui/SheetCloseBar';
import { warnedKey } from '@/components/resolution/sameDayWarned';

/**
 * An open prediction that isn't due yet (roadmap D25, DESIGN_SYSTEM §7.23),
 * as a sheet from Today or History; a due one opens Resolve instead. An
 * answered one opens here from History too, correctable for a day (D34).
 */
export default function PredictionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // A changed, unsaved edit asks before the sheet is swiped away, as Log
  // does (playtest 2026-11-08b, finding 20).
  const [dirty, setDirty] = useState(false);
  useEditDraftGuard(dirty);
  // The × sits on a bar the content scrolls under (blind playtest 2026-11-12,
  // finding 21); a hairline sets it off once scrolled.
  const [scrolled, setScrolled] = useState(false);
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Sticky first child: pinned, never over the content (code review
          2026-11-12). */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        stickyHeaderIndices={[0]}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 0)}
        scrollEventThrottle={16}
      >
        <SheetCloseBar onPress={close} testID="details-close" scrolled={scrolled} />
        <PredictionDetails
          predictionId={typeof id === 'string' ? id : ''}
          onClose={close}
          // One sheet at a time (HIG): Resolve takes this one's place. After
          // the same-day warning, today's date rides along so Resolve doesn't
          // repeat it, and only today (roadmap D56): a reloaded or restored
          // link on a later day shows Resolve's note again.
          onAnswer={(pid, opts) =>
            router.replace(
              (opts?.warned
                ? `/resolve/${pid}?warned=${warnedKey()}`
                : `/resolve/${pid}`) as never,
            )
          }
          // "Log it again" from an answered one (roadmap D56): Log takes this
          // sheet's place, as from Resolve.
          onPredictAgain={(p) => router.replace(`/log?again=${encodeURIComponent(p.id)}` as never)}
          // "Use another number" on the day it was made (D62): Log takes this
          // sheet's place, starting from the saved prediction; unsaved edits
          // still ask first.
          onRenumber={(p) => router.replace(`/log?renumber=${encodeURIComponent(p.id)}` as never)}
          onDirtyChange={setDirty}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
