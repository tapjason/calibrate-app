import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Confetti } from '@/components/ui/Confetti';
import { CountUp } from '@/components/ui/CountUp';
import { localCount } from '@/components/ui/count';
import { Icon } from '@/components/ui/Icon';
import type { Entrance } from '@/components/ui/useSpringIn';
import { colors, DISPLAY_MAX_SCALE, radius, space, tabularNums, type } from '@/constants/theme';
import { useSettingsStore } from '@/store/settingsStore';
import { DAILY_GOAL, type StreakStatus } from '@/types';

import { useCheckpointMoment, type CheckpointMoment } from './checkpointMoment';
import { streakCopy } from './streakCopy';

interface StreakLineProps {
  status: StreakStatus;
  testID?: string;
  /**
   * What the streak is and how to hide it (How scoring works, at Your
   * streak): two streak-wary testers tapped the row first and nothing
   * happened (blind playtest 2026-11-13, runs 4 and 7).
   */
  onPress?: () => void;
  /**
   * A checkpoint's moment to play (step 194): Today passes one when a log
   * reached a checkpoint. Out of sight while `play` is false, so the count
   * doesn't show and then roll back; the moment runs once it turns true.
   */
  moment?: CheckpointMoment | null;
  /**
   * Today's practice row follows as its pair (D68): 8 below instead of 16.
   * The space lives on the row, so with the row hidden (off in You, or no
   * streak) none is left behind.
   */
  paired?: boolean;
}

/** "149 day streak": the figure held to its words. */
const NBSP = '\u00A0';

const FLAME = 22;

/**
 * The streak on Home (roadmap D2): a day counts with one prediction logged
 * or answered (D17; it was three), and the number climbs every day it does.
 * One quiet row: the flame, the day count as its own figure, the day's goal
 * of three as pips, and a line saying what today adds. Never red, never
 * animated when it ends (DESIGN_SYSTEM §6.2). For a week after a streak of 2
 * days or more ends, while none runs, the row says so plainly, with no dots
 * (roadmap D60 (e)); after that it isn't shown until the next one starts.
 *
 * The flame says whether today counts, by its shape (step 193, D67): an
 * outline until it does, then filled in ink; an outline in the quietest grey
 * for a streak that ended. Still ink: the colour study found no flame hue
 * that wouldn't read as `over`.
 *
 * On a checkpoint day (7, 30, 100, 365…) the row takes the milestone tint and
 * names it for the rest of the day. When a log reached it, the row plays the
 * checkpoint's moment once (`moment`, step 194; `checkpointMoment.ts`).
 *
 * A third, quieter line carries the rest days (roadmap step 87): what's saved,
 * the day one covered, or when the next one comes.
 */
export function StreakLine({
  status,
  testID = 'streak-line',
  onPress,
  moment = null,
  paired = false,
}: StreakLineProps) {
  const copy = streakCopy(status);
  // Off in You (step 173): the row, its goal dots and its rest days go, and
  // nothing plays (step 194).
  const shown = useSettingsStore((s) => s.streakShown);
  const entrance: Entrance =
    moment && shown && copy?.checkpoint ? (moment.play ? 'play' : 'waiting') : 'still';
  const days = moment?.days ?? status.streak;
  const celebration = useCheckpointMoment(days, entrance);
  if (!copy || !shown) return null;

  // Shape carries whether today counts, never colour alone (rule 0.5).
  const flame = copy.ended
    ? ({ sf: 'flame', fallback: 'flame-outline', color: colors.textTertiary } as const)
    : copy.counted
      ? ({ sf: 'flame.fill', fallback: 'flame', color: colors.action } as const)
      : ({ sf: 'flame', fallback: 'flame-outline', color: colors.textSecondary } as const);

  // One type step above the headline, not display size: Today's one hero is
  // the rating (rule 0.2). Capped like a hero numeral, since it can reach
  // four digits.
  const figure = celebration.playing ? (
    <CountUp
      value={days}
      from={days - 1}
      format={localCount}
      style={styles.count}
      testID={`${testID}-count`}
    />
  ) : (
    <Text style={styles.count} maxFontSizeMultiplier={DISPLAY_MAX_SCALE} testID={`${testID}-count`}>
      {copy.count}
    </Text>
  );

  return (
    // The moment's spring scales the whole row; the margin stays outside it.
    <Animated.View
      style={[paired ? styles.wrapPaired : styles.wrap, celebration.whole]}
      testID={`${testID}-moment`}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          styles.row,
          copy.checkpoint && styles.rowCheckpoint,
          pressed && styles.pressed,
        ]}
        accessible
        accessibilityRole={onPress ? 'button' : 'text'}
        accessibilityLabel={copy.spoken}
        accessibilityHint={onPress ? 'Explains the streak, and how to hide it' : undefined}
        testID={testID}
      >
        {/* Above the words, so confetti leaving the flame isn't drawn under them. */}
        <View style={styles.flame}>
          <Animated.View style={celebration.flame}>
            <Icon
              sf={flame.sf}
              fallback={flame.fallback}
              size={FLAME}
              color={flame.color}
              testID={`${testID}-flame`}
            />
          </Animated.View>
          {celebration.confetti && (
            <Confetti originX={FLAME / 2} originY={FLAME / 2} testID={`${testID}-confetti`} />
          )}
        </View>
        <View style={styles.text}>
          {copy.ended ? (
            <Text style={styles.headline} testID={`${testID}-headline`}>
              {copy.headline}
            </Text>
          ) : (
            // "149 day streak" on screen; VoiceOver hears the row's sentence,
            // "149-day streak" (step 193). The words take the figure's cap:
            // uncapped, at the largest text sizes "day streak" grew to about
            // twice the size of the count it follows (security review,
            // 2026-11-18). The figure carries the same cap itself.
            <Text
              style={styles.headline}
              maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
              testID={`${testID}-headline`}
            >
              {figure}
              {`${NBSP}${copy.unit}`}
            </Text>
          )}
          {copy.detail && (
            <Text style={styles.detail} testID={`${testID}-detail`}>
              {copy.detail}
            </Text>
          )}
          {copy.rest && (
            <Text style={[styles.rest, copy.checkpoint && styles.onTint]} testID={`${testID}-rest`}>
              {copy.rest}
            </Text>
          )}
        </View>
        {/* The day's goal of three, filled as they're done, and named under
            them (step 193). Shape, not colour alone: filled vs hollow. Hidden
            from VoiceOver, which hears it in the row's sentence. One piece, so
            when it wraps below the words the name goes with the dots. Not
            beside a streak that ended (D60 (e)). */}
        {!copy.ended && (
          <View
            style={styles.goal}
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID={`${testID}-goal`}
          >
            <View style={styles.pips}>
              {Array.from({ length: DAILY_GOAL }, (_, i) => (
                <View
                  key={i}
                  testID={`${testID}-pip-${i}`}
                  style={[
                    styles.pip,
                    i < copy.filled ? styles.pipOn : styles.pipOff,
                    i >= copy.filled && copy.checkpoint && styles.pipOffOnTint,
                  ]}
                />
              ))}
            </View>
            {/* On two lines, as narrow as the dots: on one it pushed the
                dots below the words at 320pt, where they used to sit beside
                them, and squeezed the words at 375pt. */}
            <Text
              style={[styles.goalName, copy.checkpoint && styles.onTint]}
              testID={`${testID}-goal-name`}
            >
              {"Today's\ngoal"}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const PIP = 10;

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  // With the practice row under it on Today, the two read as a pair (D68).
  wrapPaired: { marginBottom: space.sm },
  pressed: { opacity: 0.6 },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    // Narrow or zoomed, the dots drop below the words instead of squeezing
    // them to a letter a line (playtest 2026-11-03).
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  // The milestone card's tint (MilestoneCard).
  rowCheckpoint: { backgroundColor: colors.selectedFill, borderColor: colors.emphasis },
  flame: { zIndex: 1 },
  // Wraps below the flame when there isn't room for about 160, then shrinks
  // to fit the line it has.
  text: { flexBasis: 160, flexGrow: 1, flexShrink: 1 },
  headline: { ...type.headline, color: colors.textPrimary },
  // Tabular since step 194: the figure rolls up on a checkpoint (§3). It used
  // not to be, while the count sat inside "15-day streak", where tabular
  // figures spaced the digits apart (and Inter's widened the hyphen).
  count: { ...type.title3, ...tabularNums, fontWeight: '700', color: colors.textPrimary },
  detail: { ...type.footnote, color: colors.textSecondary },
  // Quieter than the detail, still 4.6:1 or better on surface (§2.2).
  rest: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  // On the checkpoint tint the quietest grey measures 4.4:1 (light and dark),
  // under the 4.5 text floor, so the quiet lines take the secondary grey there.
  onTint: { color: colors.textSecondary },
  // At the end of the line; wrapped below the words, at the right, as the
  // practice row's end does.
  goal: { alignItems: 'center', gap: space.xs, marginLeft: 'auto' },
  pips: { flexDirection: 'row', gap: space.xs },
  pip: { borderRadius: PIP / 2, height: PIP, width: PIP },
  pipOn: { backgroundColor: colors.action },
  pipOff: { borderColor: colors.controlBorder, borderWidth: 1.5 },
  // controlBorder is 2.8:1 on the checkpoint tint, under the 3:1 graphic floor.
  pipOffOnTint: { borderColor: colors.textTertiary },
  goalName: { ...type.caption, color: colors.textTertiary, textAlign: 'center' },
});
