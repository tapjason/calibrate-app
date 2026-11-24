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
}

/**
 * What's waiting, the streak, and that the rating moves as they catch up,
 * under the card's "Welcome back" (D76, the voice pass, 2026-11-23: "Welcome
 * back. 2 predictions are waiting. Go with what you remember."; the line on
 * how long it had been went, the title says it). Never a loss frame: the
 * streak "ended" and a new one starts today (DESIGN_SYSTEM §6.2).
 */
export function welcomeBackLines({ gap, ready, todayCounts, rated }: WelcomeBackInput): string[] {
  const lines: string[] = [];
  if (ready > 0) {
    lines.push(
      ready === 1
        ? 'One prediction is waiting. Go with what you remember.'
        : `${localCount(ready)} predictions are waiting. Go with what you remember.`,
    );
    if (rated) lines.push(`Your rating moves as you answer ${ready === 1 ? 'it' : 'them'}.`);
  } else {
    lines.push('Nothing is waiting to be answered.');
  }
  if (gap.endedStreak >= 2) {
    lines.push(
      `Your ${localCount(gap.endedStreak)}-day streak ended while you were away. ` +
        (todayCounts ? 'Today started a new one.' : 'One prediction today starts a new one.'),
    );
  }
  return lines;
}
