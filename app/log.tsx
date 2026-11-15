import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  lateRenumberDraft,
  logAgainDraft,
  renumberDraft,
  type LogAgainDraft,
} from '@/components/prediction/logAgain';
import { LogPredictionForm } from '@/components/prediction/LogPredictionForm';
import { useLogDraftGuard } from '@/components/prediction/useLogDraftGuard';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, space, type } from '@/constants/theme';
import { useLogDraftStore } from '@/store/logDraftStore';
import { categoryOptions } from '@/store/categoryStore';
import { canRenumber, deleteIsCounted, usePredictionStore } from '@/store/predictionStore';
import { useRenumberStore } from '@/store/renumberStore';

/**
 * Log, as a full-height sheet over whichever tab opened it (roadmap D3): an
 * action, not a place, so the "+" opens it instead of a tab holding it. Each
 * open starts a fresh form at the top.
 */
export default function LogScreen() {
  const router = useRouter();
  // "Log it again" from Resolve (roadmap step 22) or History's answered
  // details (D56) arrives as ?again=<id>.
  // "Use another number" from an open prediction's Edit (D62) as
  // ?renumber=<id>.
  const { again, renumber } = useLocalSearchParams<{
    again?: string;
    renumber?: string;
  }>();
  const [draft, setDraft] = useState<LogAgainDraft | null>(null);
  // "Use another number" tapped after the day it was made ended (past
  // midnight with Edit open): Log keeps what Edit held as a new prediction,
  // and says so (code review, step 179).
  const [renumberClosed, setRenumberClosed] = useState(false);
  // Whether the replaced one's delete counts (a time zone can make it due
  // today, record audit of step 179): the note says only what's true.
  const [renumberCounted, setRenumberCounted] = useState(false);
  const [dirty, setDirty] = useState(false);
  // "Discard prediction" throws the kept draft away too (step 173).
  // Not while replacing a number (D62): the kept draft is another prediction's.
  const guard = useLogDraftGuard(dirty, () => {
    if (!draft?.replaces) void useLogDraftStore.getState().clear();
  });
  // A draft kept from an interrupted Log, offered back on a plain open (step
  // 173): read once, at mount, so the form's own saves don't remount it.
  // "Log it again" starts from its own prediction instead.
  const [kept] = useState(() =>
    (typeof again === 'string' && again.length > 0) ||
    (typeof renumber === 'string' && renumber.length > 0)
      ? null
      : useLogDraftStore.getState().draft,
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

  useEffect(() => {
    if (typeof renumber !== 'string' || renumber.length === 0) return;
    // Edit's words, category and date, handed over in memory (none after a
    // reload, when the prediction's own carry over).
    const edits = useRenumberStore.getState().take(renumber);
    (async () => {
      const source = await usePredictionStore.getState().getById(renumber);
      if (source) {
        // A category no longer offered falls back to the prediction's own.
        const offered = categoryOptions({ includeHidden: true });
        const next = renumberDraft(source, {
          title: edits?.title ?? null,
          category: edits?.category && offered.includes(edits.category) ? edits.category : null,
          dueIso: edits?.dueIso ?? null,
        });
        if (canRenumber(source)) {
          setDraft(next);
          setRenumberCounted(deleteIsCounted(source));
        }
        else if (edits) {
          // Too late to replace it: what was typed stays, as a new one.
          setDraft(lateRenumberDraft(next));
          setRenumberClosed(true);
        }
      }
      router.setParams({ renumber: undefined });
    })();
  }, [renumber, router]);

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
            <View style={styles.titleBlock}>
              <Text style={styles.title} accessibilityRole="header">
                {draft?.replaces ? 'Another number' : 'New prediction'}
              </Text>
              {draft?.replaces && (
                <Text style={styles.subtitle} testID="log-renumber-note">
                  {renumberCounted
                    ? 'Saving replaces the one you made today. It’s due today, so Insights counts it as deleted.'
                    : 'Saving replaces the one you made today. On the day it was made that’s fixing a slip, so Insights doesn’t count it as a deletion.'}
                </Text>
              )}
              {renumberClosed && !draft?.replaces && (
                <Text style={styles.subtitle} testID="log-renumber-closed">
                  It can’t be replaced now, so its number is the record. This saves a new
                  prediction beside it.
                </Text>
              )}
            </View>
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
    // The × at the top, not centred on a title with a two-line note (profile §18).
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  title: { ...type.title2, color: colors.textPrimary },
  titleBlock: { flex: 1, gap: space.xs, marginRight: space.sm },
  subtitle: { ...type.footnote, color: colors.textSecondary },
});
