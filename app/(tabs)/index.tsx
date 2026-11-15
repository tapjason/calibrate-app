import { useScrollToTop } from '@react-navigation/native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { PracticeCard } from '@/components/practice/PracticeCard';
import {
  firstAnswerLead,
  groupByDue,
  isReadyToResolve,
  nextDueLine,
} from '@/components/prediction/dueGroups';
import { cardPlacement, locateCard } from '@/components/prediction/locateCard';
import { PredictionCard, rowPosition } from '@/components/prediction/PredictionCard';
import { ReminderPrompt } from '@/components/prediction/ReminderPrompt';
import { WelcomeBackCard } from '@/components/prediction/WelcomeBackCard';
import { RUN_THRESHOLD } from '@/components/resolution/ResolveRun';
import { BackupNudge } from '@/components/settings/BackupNudge';
import { firstLookLine, todayEstimateLine } from '@/components/stats/beforeScoreCopy';
import { chartVerdict } from '@/components/stats/chartTakeaway';
import { IdentityLine } from '@/components/stats/IdentityLine';
import { NextBadgeLine } from '@/components/stats/NextBadgeLine';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { ScoreBar } from '@/components/stats/ScoreBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StreakLine } from '@/components/stats/StreakLine';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { Button } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { holdRanges } from '@/components/ui/holdRanges';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { colors, radius, space, tabularNums, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { useRatingStore } from '@/store/ratingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWarmupStore } from '@/store/warmupStore';
import { unlockEstimateFor, useStatsStore } from '@/store/statsStore';
import { MIN_N_OVERALL, type Direction, type Prediction } from '@/types';

/** Warm for over, cool for under, green on the line: the takeaway's own hue. */
/** The hue of a direction, for the dot beside Today's read (rule 0.5). */
function directionMark(lean: Direction): string {
  if (lean === 'overconfident') return colors.overMark;
  if (lean === 'underconfident') return colors.underMark;
  return colors.calibratedMark;
}

export default function TodayScreen() {
  const router = useRouter();
  const listRef = useRef<SectionList<Prediction>>(null);
  // A second tap on the tab scrolls back to the top, as iOS tabs do
  // (playtest 2026-11-08b, finding 13).
  useScrollToTop(listRef);
  // The groups, the streak row and the dates below read the clock: re-render
  // when the day turns, not only when a store changes.
  const day = useLocalDay();
  // Back on Today after a Resolve sheet: the one place a rating ask may come,
  // if a finished run or the score's unlock earned one (roadmap D15).
  useFocusEffect(
    useCallback(() => {
      void useRatingStore.getState().askIfDue();
    }, []),
  );
  const pending = usePredictionStore((s) => s.pending);
  // Subscribed so the streak line and the estimate follow each answer.
  const resolved = usePredictionStore((s) => s.resolved);
  const resolvedCount = resolved.length;
  const warmupResult = useWarmupStore((s) => s.result);
  const warmupRight = warmupResult ? Math.round(warmupResult.accuracy * warmupResult.answered) : 0;
  const streak = usePredictionStore.getState().streakNow();
  const userStat = useStatsStore((s) => s.userStat);
  const overall = useStatsStore((s) => s.overallCounts);
  // The first answer's part of the day follows the reminder's time (D38).
  const reminderAt = useSettingsStore((s) => s.dueReminderTime);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const buckets = useStatsStore((s) => s.calibration.buckets);
  const headline = ratingHeadline(userStat);
  // When it could unlock at the recent pace (roadmap D53): only while
  // calibrating, and not on every render (review, 2026-11-09).
  const calibrating = !userStat || userStat.rating_is_provisional;
  const estimate = useMemo(() => {
    if (!calibrating) return null;
    const now = new Date();
    const e = unlockEstimateFor(resolved, pending, now);
    return e ? todayEstimateLine(e, now) : null;
    // `day` re-reads it when the date turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrating, resolved, pending, day]);
  // `day` regroups them when the date turns.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupByDue(pending, new Date()), [pending, day]);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  // After a save, Today takes you to the new card (roadmap D48): on a small
  // phone it could land below the fold, and testers couldn't see that it had
  // been saved. On the focus after Log's sheet closes (Log from "Log it
  // again" replaces Resolve, so it closes onto Today too), only when the card
  // isn't already all on screen (owner, 2026-11-10: on Day 0 a scroll would
  // push "Your first answer: tomorrow evening" off the top), and only as far
  // as needed (`cardPlacement`).
  const reduceMotion = useReducedMotion();
  const fullyVisible = useRef<ReadonlySet<string>>(new Set());
  const cardHeights = useRef(new Map<string, number>());
  const viewHeight = useRef<number | null>(null);
  const retryFor = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToCard = useCallback(
    (id: string, retry: boolean) => {
      const sections = groupsRef.current;
      const at = locateCard(sections, id);
      if (!at) return;
      const order = sections.flatMap((s) => s.data.map((p) => p.id));
      const firstVisible = order.findIndex((k) => fullyVisible.current.has(k));
      const placement = cardPlacement({
        cardPos: order.indexOf(id),
        firstVisiblePos: firstVisible >= 0 ? firstVisible : null,
        cardHeight: cardHeights.current.get(id) ?? null,
        viewHeight: viewHeight.current,
        margin: space.lg,
      });
      // A failure is reported during the call, so the retry is armed only
      // for its length.
      retryFor.current = retry ? id : null;
      listRef.current?.scrollToLocation({
        ...at,
        // viewPosition 1 lines the card's bottom up with the list's, and a
        // negative offset lifts it clear (VirtualizedList.scrollToIndex).
        ...(placement === 'top'
          ? { viewPosition: 0, viewOffset: space.lg }
          : { viewPosition: 1, viewOffset: -space.lg }),
        animated: !reduceMotion,
      });
      retryFor.current = null;
    },
    [reduceMotion],
  );
  // The card to decide about, and when Today regained focus. The decision
  // waits for the list's reports of what's on screen to settle: a screen
  // under a sheet can report nothing (the web build hides it) and only
  // catches up once shown, about a tenth of a second later; on Day 0 it has
  // never been laid out at all. A fixed short wait scrolled a card that was
  // already in full view (web check, 2026-11-10).
  const target = useRef<{ id: string; since: number } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decide = useRef(() => {});
  decide.current = () => {
    const t = target.current;
    target.current = null;
    if (t && !fullyVisible.current.has(t.id)) scrollToCard(t.id, true);
  };
  const settle = useRef(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    const t = target.current;
    if (!t) return;
    const wait = Math.max(0, Math.min(SETTLE_MS, t.since + MAX_WAIT_MS - Date.now()));
    settleTimer.current = setTimeout(() => decide.current(), wait);
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    fullyVisible.current = new Set(viewableItems.map((v) => v.key));
    // A fresh report restarts the wait, up to MAX_WAIT_MS from focus.
    settle();
  }).current;
  useFocusEffect(
    useCallback(() => {
      // Read, not subscribed: the save always lands while Log covers Today.
      const id = usePredictionStore.getState().justSavedId;
      if (!id) return undefined;
      usePredictionStore.getState().clearJustSaved();
      target.current = { id, since: Date.now() };
      settle();
      return () => {
        target.current = null;
        for (const t of [settleTimer, retryTimer]) {
          if (t.current) clearTimeout(t.current);
          t.current = null;
        }
        retryFor.current = null;
      };
    }, [settle]),
  );
  // What's ready to answer comes before the streak and practice rows (D22,
  // 2026-10-09): it's the one thing on Today that asks for a tap, and below
  // them it sat about a screen down. With nothing ready, the open ones still
  // come first (D48, 2026-11-06): on a small phone the hero, streak and
  // practice rows filled the screen, and a card just saved couldn't be seen.
  const hasReady = groups.some((g) => g.key === 'ready');
  const daily = (
    <>
      {/* The daily streak (roadmap D2): one logged or answered a day keeps
          it, three is the day's goal (D17). */}
      <StreakLine
        status={streak}
        onPress={() => router.push('/scoring?section=streak' as never)}
      />
      {/* After 30 days on one phone without an account (roadmap D31). */}
      <BackupNudge onSignIn={() => router.push('/account' as never)} />
      {/* A reason to open the app on a day nothing comes due (roadmap
          step 88). Not before the first prediction: on Day 0 the Warmup
          has just asked ten questions, and the next thing is the first
          real one. */}
      {pending.length + resolvedCount > 0 && (
        <PracticeCard
          onOpen={() => router.push('/practice' as never)}
          beforeFirstAnswer={resolvedCount === 0}
        />
      )}
    </>
  );

  // The one-line read, only when a band has enough to say it (chartVerdict's
  // own min-N); otherwise the number stands alone. A verdict, not the
  // chart's fallback title: "No clear lean at 60–80%" (roadmap D57) counts,
  // and "Your curve so far" doesn't.
  const read = headline && !headline.provisional ? chartVerdict(buckets, false) : null;
  const hero =
    headline && !headline.provisional ? (
      <View style={styles.rated}>
        {/* Identity leads and the number is its receipt (DESIGN_SYSTEM §1,
            §7.1; roadmap D33): the share card's headline, once a category
            has climbed past Guesser. */}
        <IdentityLine
          userStat={userStat}
          categoryStats={categoryStats}
          // What the tiers mean, not the share card (roadmap D27).
          onPress={() => router.push('/scoring?section=badges' as never)}
        />
        {/* With no badge yet, the closest one (step 173). */}
        <NextBadgeLine onPress={() => router.push('/scoring?section=badges' as never)} />
        {/* The bar and the number open what the number means (step 173):
            testers tapped the 88 and the bar to find out whether it was good,
            and nothing happened (blind playtest 2026-11-12f, finding 1). No
            badge marks here: they're a category's bars, not the rating's. */}
        <Pressable
          onPress={() => router.push('/scoring?section=rating' as never)}
          accessibilityRole="button"
          accessibilityLabel={`Calibration rating, ${headline.rating} out of 100.`}
          accessibilityHint="Explains what it means"
          style={({ pressed }) => [styles.ratingTap, pressed && styles.pressed]}
          testID="home-rating-group"
        >
          <ScoreBar score={headline.rating} marks={false} testID="home-score-bar" />
          {/* Number and label as one stop for a screen reader (roadmap step 43). */}
          <View style={styles.receipt}>
            <CountUp value={headline.rating} style={styles.ratingNumber} testID="home-rating" />
            <Text style={styles.ratingLabel}>calibration rating</Text>
          </View>
        </Pressable>
        {read && (
          <View style={styles.takeawayRow}>
            {/* The direction's own hue, beside the words that carry it (rule 0.5). */}
            {/* No dot for a read both ways: one hue can't say it. */}
            {read.lean !== null && read.lean !== 'both' && (
              <View
                style={[styles.takeawayDot, { backgroundColor: directionMark(read.lean) }]}
              />
            )}
            <Text style={styles.takeaway} testID="home-takeaway">
              {holdRanges(read.title)}
            </Text>
          </View>
        )}
      </View>
    ) : (
      // Never a countdown in the hero slot (DESIGN_SYSTEM §0 rule 2).
      <UnlockProgress
        testID="home-unlock-progress"
        resolved={userStat?.total_resolved ?? 0}
        pending={pending.length}
        total={MIN_N_OVERALL}
        // Before the first answer, the lead names its day and the reminder's part
        // of it (roadmap D30, D38), and
        // the caption doesn't repeat the date.
        lead={
          (userStat?.total_resolved ?? 0) === 0
            ? firstAnswerLead(pending, new Date(), reminderAt.hour)
            : null
        }
        nextDue={
          (userStat?.total_resolved ?? 0) === 0 ? null : nextDueLine(pending, new Date())
        }
        // When it could unlock at the recent pace (roadmap D53).
        estimate={estimate}
        // Plain counts from 10 scored answers (D62).
        firstLook={firstLookLine(overall)}
      />
    );

  return (
    <SectionList
      ref={listRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      sections={groups}
      keyExtractor={(p) => p.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <>
          {/* Back after a long gap: what changed, before anything else (D51). */}
          <WelcomeBackCard />
          <View style={styles.hero}>{hero}</View>
          {/* Asks for notification permission here, in context, not at
              launch (roadmap step 38). Native only. Under the score whatever
              is ready, beside the predictions it's about: on Day 0 it's the
              ask that brings someone back for their first answer (D19), and
              below the cards it could fall off a small screen (owner,
              2026-11-10, with D48). */}
          <ReminderPrompt />
        </>
      }
      ListFooterComponent={
        hasReady ? null : (
          <View style={styles.dailyAfterOpen} testID="home-daily-after-open">
            {daily}
          </View>
        )
      }
      onLayout={(e) => {
        viewHeight.current = e.nativeEvent.layout.height;
      }}
      viewabilityConfig={FULLY_VISIBLE}
      onViewableItemsChanged={onViewableItemsChanged}
      // Not rendered yet (a long list, no getItemLayout): jump near it so the
      // list renders that far, then try once more, from the groups as they
      // are then (RN's documented pattern).
      onScrollToIndexFailed={(info) => {
        const id = retryFor.current;
        retryFor.current = null;
        if (!id) return;
        listRef.current
          ?.getScrollResponder()
          ?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
        retryTimer.current = setTimeout(() => scrollToCard(id, false), RETRY_MS);
      }}
      renderSectionFooter={({ section }) =>
        section.key === 'ready' ? (
          <View style={styles.dailyAfterReady} testID="home-daily-after-ready">
            {daily}
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) => (
        <>
          <SectionHeader title={section.title} count={section.data.length} unit={PREDICTIONS} />
          {/* A backlog is where people quit: past a few, answer them in one
              sitting (roadmap step 18). */}
          {section.key === 'ready' && section.data.length >= RUN_THRESHOLD && (
            <View style={styles.run}>
              <Button
                label={`Answer all ${section.data.length}`}
                testID="home-resolve-all"
                onPress={() => router.push('/resolve/run' as never)}
              />
            </View>
          )}
        </>
      )}
      renderItem={({ item, index, section }) => (
        // Measured, so a card taller than the screen is brought in by its
        // title (D48).
        <View
          onLayout={(e) => {
            cardHeights.current.set(item.id, e.nativeEvent.layout.height);
          }}
        >
          <PredictionCard
            prediction={item}
            position={rowPosition(index, section.data.length)}
            // The header already says it (roadmap D33).
            showReady={section.key !== 'ready'}
            // A due one opens Resolve; one that isn't due yet opens its details,
            // where it can be edited, deleted or answered early (roadmap D25).
            onPress={(id) =>
              router.push(
                (isReadyToResolve(item, new Date()) ? `/resolve/${id}` : `/prediction/${id}`) as never,
              )
            }
          />
        </View>
      )}
      ListEmptyComponent={
        <View>
          {/* The Warm-up's result stays one tap away until the first real
              prediction is saved (D62): interrupted on it, a tester came back
              to Today with the result and its share button gone (blind
              playtest 2026-11-13d, run 7). */}
          {warmupResult && resolvedCount === 0 && (
            <Pressable
              onPress={() => router.push('/warmup' as never)}
              accessibilityRole="button"
              accessibilityLabel={`Your warm-up: ${warmupRight} of ${warmupResult.answered} right. See your result.`}
              style={({ pressed }) => [styles.warmupRow, pressed && styles.pressed]}
              testID="home-warmup-result"
            >
              <Text style={styles.warmupText}>
                Your warm-up: {warmupRight} of {warmupResult.answered} right.
              </Text>
              <Text style={styles.warmupAction}>See your result</Text>
            </Pressable>
          )}
          <EmptyState
            testID="home-empty"
            symbol={{ sf: 'calendar.badge.plus', fallback: 'calendar-outline' }}
            message="Nothing open. What do you think will happen this week?"
            actionLabel="Log a prediction"
            onAction={() => router.push('/log' as never)}
          />
        </View>
      }
    />
  );
}

const PREDICTIONS = { one: 'prediction', other: 'predictions' };

/**
 * After a save (D48): how long the list's reports of what's on screen must be
 * quiet before Today decides whether to scroll, and the longest it waits.
 */
const SETTLE_MS = 120;
const MAX_WAIT_MS = 600;
/** Before the one retry, once the list has rendered nearer the card. */
const RETRY_MS = 150;

/** A card counts as on screen only when all of it is (D48). */
const FULLY_VISIBLE = { itemVisiblePercentThreshold: 100 };

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas },
  content: { padding: space.lg, paddingBottom: space.xxl },
  // The daily rows after the ready ones (D22): spaced like a section.
  dailyAfterReady: { marginTop: space.lg },
  // And after the open ones, when nothing is ready (D48).
  dailyAfterOpen: { marginTop: space.lg },
  hero: { marginBottom: space.xxxl, marginTop: space.sm },
  // Left-aligned, like everything below it (roadmap D33).
  rated: { alignItems: 'stretch' },
  ratingTap: { alignSelf: 'stretch' },
  pressed: { opacity: 0.6 },
  warmupRow: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.xs,
    marginBottom: space.lg,
    minHeight: 44,
    padding: space.md,
  },
  warmupText: { ...type.subhead, color: colors.textPrimary },
  warmupAction: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
  receipt: { alignItems: 'baseline', flexDirection: 'row', gap: space.md, marginTop: space.md },
  // The hero numeral is always ink (DESIGN_SYSTEM §2.4).
  ratingNumber: { ...type.readout, ...tabularNums, color: colors.textPrimary },
  ratingLabel: { ...type.subhead, color: colors.textSecondary, flexShrink: 1 },
  takeawayRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm, marginTop: space.md },
  takeawayDot: { borderRadius: 5, height: 10, width: 10 },
  takeaway: { ...type.callout, color: colors.textPrimary, flexShrink: 1 },
  run: { marginBottom: space.md },
});
