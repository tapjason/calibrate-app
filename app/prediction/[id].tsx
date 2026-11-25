import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictionDetails } from '@/components/prediction/PredictionDetails';
import { useEditDraftGuard } from '@/components/prediction/useLogDraftGuard';
import { SheetCloseBar } from '@/components/ui/SheetCloseBar';
import { useScrollReveal } from '@/components/ui/useScrollReveal';
import { warnedKey } from '@/components/resolution/sameDayWarned';
import { useRenumberStore } from '@/store/renumberStore';

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
  const guard = useEditDraftGuard(dirty);
  // The × sits on a bar the content scrolls under (blind playtest 2026-11-12,
  // finding 21); a hairline sets it off once scrolled.
  const [scrolled, setScrolled] = useState(false);
  // Edit's date block, brought into view when "Pick a date" opens its
  // calendar (the owner, 2026-11-24); it sits in the details' own view.
  const dateReveal = useScrollReveal({ nested: true });
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Sticky first child: pinned, never over the content (code review
          2026-11-12). */}
      <ScrollView
        ref={dateReveal.scrollRef}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        stickyHeaderIndices={[0]}
        onLayout={dateReveal.onViewportLayout}
        onScroll={(e) => {
          setScrolled(e.nativeEvent.contentOffset.y > 0);
          dateReveal.onScroll(e);
        }}
        onScrollBeginDrag={dateReveal.onScrollBeginDrag}
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
          // sheet's place with what Edit holds, so nothing typed is lost and
          // there's nothing to ask about (blind playtest 2026-11-13e, run 2).
          onRenumber={(p, edits) => {
            guard.markLeaving();
            useRenumberStore.getState().hand(p.id, edits);
            router.replace(`/log?renumber=${encodeURIComponent(p.id)}` as never);
          }}
          onDirtyChange={setDirty}
          dateReveal={dateReveal}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
