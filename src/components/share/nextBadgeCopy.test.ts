import { nextBadge } from '@/engine/calibration';
import { MIN_N_CATEGORY, type Category, type CategoryStat } from '@/types';

import { nextBadgeProgress } from './nextBadgeCopy';

function stat(category: Category, resolved: number, score: number): CategoryStat {
  return {
    user_id: 'u1',
    category,
    predictions_made: resolved,
    predictions_resolved: resolved,
    calibration_score: score,
    score_is_provisional: resolved < MIN_N_CATEGORY,
    badge_level: 'guesser',
  };
}

/** The store derives nextBadges from the engine; do the same here. */
function next(stats: CategoryStat[]) {
  return Object.fromEntries(
    stats.map((s) => [
      s.category,
      nextBadge(s.predictions_resolved, s.calibration_score),
    ]),
  );
}

function progressFor(stats: CategoryStat[]) {
  return nextBadgeProgress(stats, next(stats));
}

describe('nextBadgeProgress', () => {
  it('says nothing without category stats', () => {
    expect(nextBadgeProgress([], {})).toBeNull();
  });

  it('counts down resolutions to the next badge', () => {
    expect(progressFor([stat('health', 17, 60)])).toEqual({
      category: 'health',
      badge: 'tracker',
      badgeLabel: 'Tracker',
      text: 'To reach Tracker or higher in health: 3 more scored answers',
      line: '3 more scored answers to your first badge in health.',
      progress: 17 / 20,
    });
  });

  // Roadmap step 47: Forecaster → Sharp needs 50 answered and a score above
  // 85; with both short, the count alone over-promised.
  it('names the score threshold too when both requirements are short', () => {
    expect(progressFor([stat('work', 30, 80)])?.text).toBe(
      'To reach Sharp in work: 20 more scored answers and a score above 85 at its low end',
    );
    expect(progressFor([stat('work', 30, 92)])?.text).toBe('To reach Sharp in work: 20 more scored answers');
  });

  it('counts the last answer in the singular', () => {
    expect(progressFor([stat('work', 49, 80)])?.text).toBe(
      'To reach Sharp in work: 1 more scored answer and a score above 85 at its low end',
    );
  });

  it('picks the category closest to its next badge', () => {
    const p = progressFor([
      stat('work', 5, 50),
      stat('health', 18, 50),
      stat('finance', 2, 50),
    ]);
    expect(p?.category).toBe('health');
    expect(p?.text).toBe('To reach Tracker or higher in health: 2 more scored answers');
  });

  it('breaks ties by predictions made, then by id so the story is stable', () => {
    expect(progressFor([stat('work', 10, 50), stat('health', 10, 50)])?.category).toBe(
      'health',
    );
    // Blind playtest 2026-11-12b finding 19: two Work calls, one Finance, none
    // answered; the recap named finance.
    expect(
      progressFor([
        { ...stat('finance', 0, 0), predictions_made: 1 },
        { ...stat('work', 0, 0), predictions_made: 2 },
      ])?.category,
    ).toBe('work');
  });

  it('prefers a resolution countdown over a score gate', () => {
    // work is a Tracker needing score > 70 for Forecaster; social needs 4 more.
    const p = progressFor([stat('work', 25, 65), stat('social', 16, 50)]);
    expect(p?.text).toBe('To reach Tracker or higher in social: 4 more scored answers');
  });

  it('names the score gate when no category is short on resolutions', () => {
    expect(progressFor([stat('work', 25, 64.8)])).toEqual({
      category: 'work',
      badge: 'forecaster',
      badgeLabel: 'Forecaster',
      text: 'To reach Forecaster in work: a score above 70 at its low end (now 65)',
      line: "Forecaster in work needs a score that clears 70 with room to spare. You’re at 65.",
      progress: null,
    });
  });

  // Record audit 2026-11-23: Math.floor said 64 here while Insights' badge row
  // said 65 for the same 64.8.
  it('prints the score as Insights badge row does, rounded', () => {
    for (const score of [64.8, 64.5, 64.2, 87.4]) {
      const s = stat('work', 25, score);
      const target = { work: { badge: 'forecaster' as const, needResolved: 20, needScore: 90 } };
      const p = nextBadgeProgress([s], target);
      const shown = String(Math.round(score));
      expect(p?.line).toBe(
        `Forecaster in work needs a score that clears 90 with room to spare. You’re at ${shown}.`,
      );
      expect(p?.text).toContain(`(now ${shown})`);
    }
  });

  it('never prints a provisional score', () => {
    const provisional = { ...stat('work', 25, 64), score_is_provisional: true };
    expect(nextBadgeProgress([provisional], next([provisional]))).toBeNull();
  });

  it('says nothing at the top of the ladder', () => {
    expect(progressFor([stat('health', 120, 95)])).toBeNull();
  });
});

// D76 (the voice pass, 2026-11-23): Today's own words. The recap card keeps
// its "To reach" line, led away from the tier (record audit 2026-11-12).
describe("nextBadgeProgress, Today's line", () => {
  it('names the first badge as the first, never a tier it might skip', () => {
    expect(progressFor([stat('work', 16, 60)])?.line).toBe(
      '4 more scored answers to your first badge in work.',
    );
    expect(progressFor([stat('work', 19, 60)])?.line).toBe(
      '1 more scored answer to your first badge in work.',
    );
  });

  it('names a higher tier when only answers are short', () => {
    expect(progressFor([stat('work', 30, 92)])?.line).toBe('20 more scored answers to Sharp in work.');
  });

  it('says both when the score is short too, without printing the score', () => {
    expect(progressFor([stat('work', 30, 80)])?.line).toBe(
      'Sharp in work needs 20 more scored answers and a score that clears 85 with room to spare.',
    );
  });

  it('says the score gate with room to spare, and where the score is, never its give-or-take', () => {
    const stats = [{ ...stat('health', 60, 87.4), badge_level: 'forecaster' as const }];
    const next = { health: { badge: 'sharp' as const, needResolved: 50, needScore: 85 } };
    expect(nextBadgeProgress(stats, next, { health: 4 })?.line).toBe(
      "Sharp in health needs a score that clears 85 with room to spare. You’re at 87.",
    );
  });
});

// Roadmap D35: a tier above Tracker needs the score minus its give-or-take
// over the bar; over the bar itself isn't enough.
describe('nextBadgeProgress with a give-or-take', () => {
  it('says what is short when only the low end is under the bar', () => {
    const stats = [
      {
        user_id: 'u1',
        category: 'health' as const,
        predictions_made: 60,
        predictions_resolved: 60,
        calibration_score: 87.4,
        score_is_provisional: false,
        badge_level: 'forecaster' as const,
      },
    ];
    const next = { health: { badge: 'sharp' as const, needResolved: 50, needScore: 85 } };
    expect(nextBadgeProgress(stats, next, { health: 4 })?.text).toBe(
      'To reach Sharp in health: a score above 85 at its low end (now 87, give or take 4)',
    );
    expect(nextBadgeProgress(stats, next, {})).toBeNull();
  });
});
