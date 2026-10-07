// Presentation copy for "How scoring works" (roadmap step 29). Pure, so a test
// can hold it to CLAUDE.md's calibration engine: every threshold in the text
// comes from the shared constants or the badge metadata, never typed by hand,
// and the worked examples are CLAUDE.md's own.

import { BADGE_META } from '@/constants/badges';
import {
  DAILY_GOAL,
  MIN_N_BAND,
  MIN_N_CATEGORY,
  MIN_N_OVERALL,
  REST_DAY_EVERY,
  REST_DAYS_MAX,
  STREAK_CHECKPOINTS,
  STREAK_DAY_MIN,
  type BadgeLevel,
} from '@/types';

/** "7, 30, 100 and 365", from the engine's list. */
function checkpointList(): string {
  const days = [...STREAK_CHECKPOINTS];
  const last = days.pop();
  return `${days.join(', ')} and ${last}`;
}

/** "one prediction" (D17), or "3 predictions" if the minimum ever goes back up. */
function dayMinimum(): string {
  return STREAK_DAY_MIN === 1 ? 'one prediction' : `${STREAK_DAY_MIN} predictions`;
}

export interface ScoringSection {
  title: string;
  paragraphs: string[];
}

/** Ladder order, weakest first. */
export const BADGE_LADDER: readonly BadgeLevel[] = [
  'guesser',
  'tracker',
  'forecaster',
  'sharp',
  'oracle',
];

/** The five badges with what each takes, as the badge legend shows them. */
export function badgeRows(): { badge: BadgeLevel; label: string; criteria: string }[] {
  return BADGE_LADDER.map((badge) => ({
    badge,
    label: BADGE_META[badge].label,
    criteria: BADGE_META[badge].tagline,
  }));
}

export function scoringSections(): ScoringSection[] {
  return [
    {
      title: 'What the score measures',
      paragraphs: [
        'How closely your confidence matches what happens. At 100, the things you call 70% likely happen 7 times in 10, and the things you call 90% likely happen 9 times in 10.',
        "It isn't about being right. A 60% call that doesn't happen isn't a mistake: about 4 in 10 of them shouldn't.",
      ],
    },
    {
      title: "How it's worked out",
      paragraphs: [
        'Your resolved calls are grouped into five bands by how sure you said you were: 0–20%, 20–40%, 40–60%, 60–80% and 80–100%. A call at exactly 20% goes in 20–40%, and 100% goes in 80–100%.',
        'In each band, the app compares what you said, on average, with how often it happened. The gap is the miss. The score is 100 minus your average miss across the bands you have used.',
        'Say you called ten things 90% likely and five happened. You said 90%, 50% happened: a 40-point miss, and a score of 60. With misses of 5, 20 and 35 points in three bands, the average miss is 20, so the score is 80.',
      ],
    },
    {
      title: `Why it waits for ${MIN_N_OVERALL}`,
      paragraphs: [
        'With two predictions in a band, it can only read 0%, 50% or 100%. That is noise, not a score.',
        `So your rating stays "calibrating" until ${MIN_N_OVERALL} predictions have resolved, a category's score until ${MIN_N_CATEGORY} have in that category, and the app doesn't say which way a band leans until it holds ${MIN_N_BAND}.`,
        'Even then, every number has some luck in it. The grey bar behind each dot on the chart is where a perfectly calibrated forecaster\'s dot lands half the time with that many predictions: a dot inside it is as close as chance allows. And your rating comes with a "give or take": how far it could move on the same habits with different luck. Both narrow as you resolve more.',
      ],
    },
    {
      title: 'Badges',
      paragraphs: [
        'Each category earns its own badge, so you can be Sharp in one and a Guesser in another. A badge needs both the score and the count: a high score on three lucky calls earns nothing.',
      ],
    },
    {
      title: 'Honest uncertainty',
      paragraphs: [
        'Calls between 35% and 65% get the integrity bonus. They are the hardest to make, and they tell you the most.',
        'Log some things you think won\'t happen, too. A score built only from the confident end of the range only measures that end.',
      ],
    },
    {
      title: 'Your streak',
      paragraphs: [
        `A day counts when you log or answer at least ${dayMinimum()} in it, and your streak is how many days in a row have counted. Today joins it with that; until then, yesterday's streak still stands.`,
        `${DAILY_GOAL} a day is the daily goal. It fills today's dots, and it's there for the habit: the streak doesn't need it.`,
        `Every ${REST_DAY_EVERY} days that count save a rest day, up to ${REST_DAYS_MAX}. A day that doesn't count uses one, and the streak carries on without adding that day; with none saved, it ends.`,
        `The milestones are ${checkpointList()} days, then every year after that. Today names the day you reach one.`,
        "The streak is about the habit, not the score: it doesn't change your calibration, and nothing is lost when it ends.",
      ],
    },
    {
      title: "What doesn't count",
      paragraphs: [
        '"Can\'t tell / doesn\'t apply" answers, which stay out of the score, the streak and your recaps. And the Warmup, which is practice and kept apart from your real record.',
      ],
    },
  ];
}
