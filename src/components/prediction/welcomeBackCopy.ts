// The words for Today's welcome-back card (roadmap D51). Pure, so tests hold
// them to the numbers; the return itself is the engine's (`returnAfterGap`).

import { localCount } from '@/components/ui/count';
import type { ReturnAfterGap } from '@/types';

export interface WelcomeBackInput {
  gap: ReturnAfterGap;
  /** Open predictions ready to answer now. */
  ready: number;
  /** Whether today already counts toward a streak. */
  todayCounts: boolean;
  /** Whether the rating is unlocked (not provisional). */
  rated: boolean;
  /** Whether anything has been logged or answered today. */
  activeToday?: boolean;
}

/** "3 weeks", "8 weeks", "2 months": rounded down, never more than it was. */
export function awayFor(days: number): string {
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  const months = Math.floor(days / 30);
  return `${months} months`;
}

/**
 * What changed while the person was away, one fact a line, plainly: the gap,
 * what's waiting, the streak, and that the rating moves as they catch up.
 * Never a loss frame: the streak "ended" and a new one starts today
 * (DESIGN_SYSTEM §6.2).
 */
export function welcomeBackLines({
  gap,
  ready,
  todayCounts,
  rated,
  activeToday = false,
}: WelcomeBackInput): string[] {
  // Past tense once something's done today, when "since you last" stops being true.
  const lines = [
    activeToday
      ? `It had been ${awayFor(gap.awayDays)} since you last logged, answered or practised.`
      : `It’s been ${awayFor(gap.awayDays)} since you last logged, answered or practised.`,
  ];
  if (ready > 0) {
    const what = ready === 1 ? 'One prediction is' : `${localCount(ready)} predictions are`;
    lines.push(
      // "about it" for one (blind playtest 2026-11-13b, run 1: "each, of one?").
      `${what} ready to answer. Answer what you remember about ${ready === 1 ? 'it' : 'each'}.`,
    );
    if (rated) lines.push('Your rating moves as you answer them.');
  }
  if (gap.endedStreak >= 2) {
    lines.push(
      `Your ${localCount(gap.endedStreak)}-day streak ended while you were away. ` +
        (todayCounts ? 'Today started a new one.' : 'One prediction today starts a new one.'),
    );
  }
  return lines;
}
