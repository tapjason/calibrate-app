// Presentation copy for "How scoring works" (roadmap step 29). Pure, so a test
// can hold it to CLAUDE.md's calibration engine: every threshold in the text
// comes from the shared constants or the badge metadata, never typed by hand,
// and the worked examples are CLAUDE.md's own.

import { BADGE_META } from '@/constants/badges';
import {
  BRIER_MIN_N,
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

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** "Three" (D17): it starts a sentence, so it's spelled out (roadmap step 95). */
function dailyGoal(): string {
  return NUMBER_WORDS[DAILY_GOAL] ?? String(DAILY_GOAL);
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
        "It isn't about being right. A 60% call that doesn't happen isn't a mistake: about 4 in 10 of them shouldn't happen.",
      ],
    },
    {
      title: "How it's worked out",
      paragraphs: [
        'Your scored calls are grouped into five ranges by how sure you said you were: 0–20%, 20–40%, 40–60%, 60–80% and 80–100%. A call at exactly 20% goes in 20–40%, and 100% goes in 80–100%.',
        'In each range, the app compares what you said, on average, with how often it happened. The gap is the miss. The score is 100 minus your average miss, with each range counting in proportion to the calls in it: a range of fifty counts for more than a range of one.',
        'Say you called ten things 90% likely and five happened. You said 90%, 50% happened: a 40-point miss, and a score of 60. With misses of 5, 20 and 35 points in ranges of 20, 10 and 20 calls, the average miss is 20, so the score is 80.',
      ],
    },
    {
      title: 'The Brier score',
      paragraphs: [
        `From ${BRIER_MIN_N} scored answers, Insights also shows a Brier score: the average of the squared gap between how sure you said you were and what happened. It rewards being decisive as well as calibrated, so calling everything 50% can't flatter it. Lower is better, and beside it is what you'd score by saying the same number every time, that number being how often your calls came true. Beat it by more than luck could give, checked the way the give-or-take is, and yours does better; when the gap is that small, Insights says it's about the same. It waits for ${BRIER_MIN_N} because with fewer, luck moves it too much to read.`,
      ],
    },
    {
      title: `Why it waits for ${MIN_N_OVERALL}`,
      paragraphs: [
        'With two predictions in a range, it can only read 0%, 50% or 100%. That is noise, not a score.',
        `So your rating stays "calibrating" until ${MIN_N_OVERALL} answers are scored, a category's score until ${MIN_N_CATEGORY} have in that category, and the app doesn't say which way a range leans until it holds ${MIN_N_BAND}. A range leans when its calls came true clearly more or less often than you said, by more than luck gives.`,
        // One word for it (roadmap D54): "answered" everywhere, said once here.
        "Scored answers are the Yes and No ones that count toward your numbers. A Can't tell, or an answer given the day the prediction was logged, is answered but not scored.",
        'Even then, every number has some luck in it. The grey bar behind each dot on the chart is where a perfectly calibrated forecaster\'s dot lands 8 times in 10 with that many predictions, and the app calls a lean only for a dot outside it. And your rating comes with a "give or take": how far it could move on the same habits with different luck, 8 times in 10. It comes from rescoring your own answers drawn again at random, hundreds of times: half the spread of the middle 80% of those scores, either side of your rating. A category’s give-or-take is worked out the same way from its own answers. Both narrow as you answer more.',
      ],
    },
    {
      title: 'Badges',
      paragraphs: [
        'Each category earns its own badge, so you can be Sharp in one and just getting started in another. A badge needs both the score and the count: a high score on three lucky calls earns nothing. Above Tracker, the score has to clear the bar at its low end, which is the score minus its give-or-take: a score of 89, give or take 10, is 79 at its low end. That makes it hard for luck alone to carry a category over a line. A badge follows the record both ways: if the low end falls back under a bar, or the count under a minimum, the badge goes back to the highest one it still clears.',
      ],
    },
    {
      // What a shared card's squares and strip mean (roadmap D60 (c)): a
      // tester who came from a friend's 🟩🟧 read them as Wordle, green right
      // and orange wrong, and nothing in the app said otherwise (blind
      // playtest 2026-11-13b, run 5).
      title: 'The squares on a shared card',
      paragraphs: [
        `Shared as text, your card carries five squares, one for each range, low to high: 🟩 no clear lean, 🟧 too sure, 🟦 too cautious, and ⬜ a range with fewer than ${MIN_N_BAND} scored answers. The image shows the same as a strip: ○ no clear lean, ▼ too sure, ▲ too cautious, • under ${MIN_N_BAND} answers, – none.`,
        `They aren't right and wrong. A range is 🟩 when its calls came true about as often as you said, or near enough that luck could explain the gap, misses and all. The squares come once your rating unlocks and a range holds ${MIN_N_BAND} scored answers.`,
      ],
    },
    {
      // The integrity bonus section went with D23 (2026-10-10): it paid for a
      // stated number, which pushes reports toward it.
      title: 'Use the whole range',
      paragraphs: [
        'Log some things you think won\'t happen, too. A score built only from the confident end of the range only measures that end.',
      ],
    },
    {
      title: 'Your streak',
      paragraphs: [
        `A day counts when you log or answer at least ${dayMinimum()} in it, and your streak is how many days in a row have counted. Today joins it with that; until then, yesterday's streak still stands.`,
        `${dailyGoal()} a day is the daily goal. It fills today's dots, and it's there for the habit: the streak doesn't need it.`,
        `Every ${REST_DAY_EVERY} days that count save a rest day, up to ${REST_DAYS_MAX}. A day that doesn't count uses one, and the streak carries on without adding that day; with none saved, it ends.`,
        `The milestones are ${checkpointList()} days, then every year after that. Today names the day you reach one.`,
        "The streak is about the habit, not the score: it doesn't change your calibration, and nothing is lost when it ends. If it feels like pressure, you can hide it and the daily goal in You.",
      ],
    },
    {
      title: "What doesn't count",
      paragraphs: [
        '"Can\'t tell / doesn\'t apply" answers, which stay out of the score, the streak and your recaps. If you can tell later, you can answer one until a week after its due day, or until the end of the day after you chose Can\'t tell, if that\'s later; after that it stays Can\'t tell. An answer you give it then can be changed for a day, like any other. And the Warmup and the daily practice, which are practice and kept apart from your real record.',
        "An answer given the same day the prediction was logged. It stays in History and keeps your streak, but it isn't scored: a call made and settled in one day says little, and it made the score easy to pad. So the earliest due date is tomorrow.",
        "Changing a prediction's words makes it a new prediction from that day, with the same number: an answer that day isn't scored, and its due date is tomorrow at the earliest. Otherwise a call could be turned into its opposite once the outcome was known. Fixing case or a full stop doesn't count.",
        "A deleted prediction leaves the score. If it was already answered, or was due that day or the next, Insights says how many were, so a miss can't disappear without a trace. The same goes for a due date moved later, or new words, that close to the due day. A change on the day a prediction was made isn't counted while it isn't due yet: that's fixing a slip. Only this phone keeps these counts.",
      ],
    },
  ];
}
