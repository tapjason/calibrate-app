// One fixture set, run through BOTH Coach validators: the app's
// (./coachValidate.ts) and the Edge Function's
// (supabase/functions/coach/contract.ts). The rules are written twice on
// purpose (Deno can't import from the app bundle; COACH_AGENT.md §3 asks for
// "server + client"), and this file is what keeps them the same rules. Every
// fixture must give the same answer on both sides; a rule added to one side
// without the other fails here.
//
// The fixtures are COACH_AGENT.md §9's adversarial set plus every example from
// the security review of 2026-11-18. Most drops come with a "kept" twin that
// differs only in the part under test, so the check, not some other one, is
// what drops it.
//
// The last section checks compatibility: what the app builds send is what the
// new function accepts, and what this build sends is what the function
// deployed before 2026-11-18 accepts.

import {
  CATEGORIES,
  type Category,
  type CoachContext,
  type Prediction,
  type UserStat,
} from '@/types';

import {
  MAX_CATEGORIES as SERVER_MAX_CATEGORIES,
  MAX_PATTERNS as SERVER_MAX_PATTERNS,
  parseContext,
  validateOutput as serverValidate,
} from '../../supabase/functions/coach/contract';

import { buildCoachContext } from './coachContext';
import { validateCoachOutput as clientValidate } from './coachValidate';

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

/**
 * 81 scored answers. Finance leans over and social under (both past the
 * category gate), work has no clear lean and what it said sits within 5
 * points of what happened (75 against 77), health is thin (4 answers). The
 * weekday carries its answer count (24, past the floor of 20). The drifts
 * come without their halves' count, as from a build before 2026-11-19, so
 * none is citable (finance's halves would be 12 and 13); drift_health is
 * what a build before 2026-11-18 sends for a thin category.
 */
const CTX: CoachContext = {
  overall: { calibration_rating: 72.4, total_resolved: 81 },
  by_category: [
    { category: 'finance', resolved: 25, calibration_score: 61.37, mean_stated_confidence: 80, actual_rate: 0.55, direction: 'overconfident' },
    { category: 'health', resolved: 4, calibration_score: 90, mean_stated_confidence: 70, actual_rate: 0.75, direction: 'calibrated' },
    { category: 'social', resolved: 22, calibration_score: 66.8, mean_stated_confidence: 60, actual_rate: 0.82, direction: 'underconfident' },
    { category: 'work', resolved: 30, calibration_score: 88, mean_stated_confidence: 75, actual_rate: 0.77, direction: 'calibrated' },
  ],
  patterns: [
    { kind: 'weakest_day_of_week', value: 1 },
    { kind: 'weakest_day_score', value: 58 },
    { kind: 'weakest_day_answers', value: 24 },
    { kind: 'drift_finance', value: -6.5 },
    { kind: 'drift_work', value: 7.3 },
    { kind: 'drift_health', value: -50 },
  ],
};

const withPatterns = (patterns: CoachContext['patterns'], overall = CTX.overall): CoachContext => ({
  ...CTX,
  overall,
  patterns,
});
const withCategory = (
  base: CoachContext,
  category: string,
  change: Partial<CoachContext['by_category'][number]>,
): CoachContext => ({
  ...base,
  by_category: base.by_category.map((c) => (c.category === category ? { ...c, ...change } : c)),
});
const WEEKDAY = (answers: number): CoachContext['patterns'] => [
  { kind: 'weakest_day_of_week', value: 1 },
  { kind: 'weakest_day_score', value: 58 },
  { kind: 'weakest_day_answers', value: answers },
];

const OLDER_BUILD = withPatterns([
  { kind: 'weakest_day_of_week', value: 1 },
  { kind: 'weakest_day_score', value: 58 },
]);
/** 12 answers on the day: past the floor of 2026-11-18 (10), under today's (20). */
const THIN_DAY = withPatterns(WEEKDAY(12));
const DAY_19 = withPatterns(WEEKDAY(19));
const DAY_20 = withPatterns(WEEKDAY(20));
const THIN_OVERALL_DAY = withPatterns(WEEKDAY(24), { calibration_rating: 72.4, total_resolved: 15 });

/**
 * Drifts as this build sends them: finance with 44 answers (halves of 22),
 * work with 48 (halves of 24), each with its halves' count.
 */
const RICH: CoachContext = {
  ...withCategory(withCategory(CTX, 'finance', { resolved: 44 }), 'work', { resolved: 48 }),
  patterns: [
    ...WEEKDAY(24),
    { kind: 'drift_finance', value: -6.5 },
    { kind: 'drift_half_answers_finance', value: 22 },
    { kind: 'drift_work', value: 7.3 },
    { kind: 'drift_half_answers_work', value: 24 },
    { kind: 'drift_health', value: -50 },
  ],
};
/** Finance's drift from halves of 19 and 20 (39 answers): under the floor. */
const HALF_19: CoachContext = {
  ...withCategory(CTX, 'finance', { resolved: 39 }),
  patterns: [
    { kind: 'drift_finance', value: -6.5 },
    { kind: 'drift_half_answers_finance', value: 19 },
  ],
};
/** Finance's drift from halves of 20 (40 answers): at the floor. */
const HALF_20: CoachContext = {
  ...withCategory(CTX, 'finance', { resolved: 40 }),
  patterns: [
    { kind: 'drift_finance', value: -6.5 },
    { kind: 'drift_half_answers_finance', value: 20 },
  ],
};

/** 85 scored answers; finance has 21, health 12 (thin). A count can sit on a score's place. */
const COUNTS: CoachContext = {
  overall: { calibration_rating: 71.6, total_resolved: 85 },
  by_category: [
    { category: 'finance', resolved: 21, calibration_score: 64.2, mean_stated_confidence: 78, actual_rate: 0.52, direction: 'overconfident' },
    { category: 'health', resolved: 12, calibration_score: 88, mean_stated_confidence: 70, actual_rate: 0.75, direction: 'calibrated' },
    { category: 'work', resolved: 52, calibration_score: 83, mean_stated_confidence: 72, actual_rate: 0.7, direction: 'calibrated' },
  ],
  patterns: [],
};
/** Work's said and happened 5 whole points apart (75 against 79.5, which rounds to 80). */
const WORK_5_APART = withCategory(CTX, 'work', { actual_rate: 0.795 });
/** 4 apart (75 against 79.4, which rounds to 79). */
const WORK_4_APART = withCategory(CTX, 'work', { actual_rate: 0.794 });
/** Finance came true 57.5% of the time: 0.575 × 100 is 57.49999999999999 in floating point. */
const FLOAT_EDGE = withCategory(CTX, 'finance', { actual_rate: 0.575 });
/** Exactly 988 scored answers: a count, not a helpline. */
const TOTAL_988 = withPatterns([], { calibration_rating: 72.4, total_resolved: 988 });
/** Under every gate: 12 answers, all health. */
const THIN: CoachContext = {
  overall: { calibration_rating: 72.4, total_resolved: 12 },
  by_category: [
    { category: 'health', resolved: 12, calibration_score: 90, mean_stated_confidence: 70, actual_rate: 0.75, direction: 'calibrated' },
  ],
  patterns: [],
};
/** As THIN, with a provisional rating that sits on the count. */
const THIN_COINCIDENT: CoachContext = { ...THIN, overall: { calibration_rating: 12.2, total_resolved: 12 } };
/** Finance at 25 answers with no clear lean: the chart says "No clear lean". */
const FINANCE_CALIBRATED: CoachContext = {
  ...CTX,
  by_category: CTX.by_category.map((c) =>
    c.category === 'finance' ? { ...c, direction: 'calibrated' as const } : c,
  ),
};

// --- Round 6 (2026-11-19) ---
/**
 * The record re-review's case (R4): finance at 21 answers, 80% said and 70%
 * happened, inside luck, so Insights says "No clear lean", 10 points apart.
 */
const FINANCE_NO_LEAN_21 = withCategory(CTX, 'finance', {
  resolved: 21,
  calibration_score: 82,
  actual_rate: 0.7,
  direction: 'calibrated',
});
/** A rating of 82.5, which the screen shows as 83 (ratingHeadline, Math.round). */
const RATING_HALF = withPatterns(CTX.patterns, { calibration_rating: 82.5, total_resolved: 81 });
/**
 * Figures on a half, each shown rounded up: finance's score 61.5 (62),
 * social's stated 60.5 (61%), work's hit rate 0.775 (78%).
 */
const HALVES = withCategory(
  withCategory(withCategory(CTX, 'finance', { calibration_score: 61.5 }), 'social', { mean_stated_confidence: 60.5 }),
  'work',
  { actual_rate: 0.775 },
);
/** Health at 12 answers, its provisional score 12.5: a number near it still blocks. */
const HEALTH_SCORE_HALF = withCategory(CTX, 'health', { resolved: 12, calibration_score: 12.5 });
/** The same with a provisional score nowhere near the count. */
const HEALTH_SCORE_FAR = withCategory(CTX, 'health', { resolved: 12, calibration_score: 72 });

// --- Round 7 (2026-11-19) ---
/** As RICH, with work's drift negative: its recent answers score 7.3 points lower. */
const WORK_DOWN: CoachContext = {
  ...RICH,
  patterns: RICH.patterns.map((p) => (p.kind === 'drift_work' ? { ...p, value: -7.3 } : p)),
};
/** Finance came true 19 times in 33: a share with decimals that never end (0.5757…). */
const RATE_19_33 = withCategory(CTX, 'finance', { resolved: 33, actual_rate: 19 / 33 });

// ---------------------------------------------------------------------------
// The fixtures
// ---------------------------------------------------------------------------

interface Fixture {
  name: string;
  insight: unknown;
  context?: CoachContext;
}

const over = (message: string, extra: Record<string, unknown> = {}) => ({
  type: 'overconfidence',
  category: 'finance',
  message,
  evidence: 80,
  ...extra,
});
const BASE = 'Your finance predictions run overconfident — 80% stated against a 55% hit rate.';

const KEEP: Fixture[] = [
  { name: 'an overconfidence note on its own numbers', insight: over(BASE) },
  {
    name: 'an underconfidence note on its own numbers',
    insight: { type: 'underconfidence', category: 'social', message: 'Your social calls run underconfident: you said 60% on average and 82% happened.', evidence: 82 },
  },
  {
    name: 'a well-calibrated category called so',
    insight: { type: 'strength', category: 'work', message: 'Work is well calibrated, with a score of 88.', evidence: 88 },
  },
  {
    name: 'the weekday score, past both gates',
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers calibrate worst, at 58.', evidence: 58 },
  },
  {
    name: 'encouragement on a thin category, citing its count',
    insight: { type: 'encouragement', category: 'health', message: 'Only 4 health answers so far, so keep logging.', evidence: 4 },
  },
  {
    name: 'encouragement labelled overall that names a thin category',
    insight: { type: 'encouragement', category: 'overall', message: 'Keep logging: health has 4 scored answers.', evidence: 4 },
  },
  {
    name: 'a drift, written by its size',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped by 6.5 points from your older answers to your recent ones.', evidence: -6.5 },
  },
  {
    name: 'a positive drift',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Work improved by 7.3 points from earlier to recent answers.', evidence: 7.3 },
  },
  {
    name: 'the overall rating, rounded, past its gate',
    insight: { type: 'pattern', category: 'overall', message: 'Across 81 scored answers, your calibration rating is 72.', evidence: 72 },
  },
  {
    name: 'a gate in its own phrasing',
    insight: { type: 'encouragement', category: 'health', message: 'Health has 4 scored answers so far.', suggestion: 'Its score unlocks at 20 scored answers.', evidence: 4 },
  },
  {
    name: 'the rating on its scale',
    insight: { type: 'strength', category: 'overall', message: 'Your calibration rating is 72/100 across 81 answers.', evidence: 72.4 },
  },
  {
    name: 'the professional-advice note §5.4 asks for',
    insight: over(BASE, {
      suggestion: 'Try stating finance calls lower when you feel very sure. Not a substitute for professional advice.',
      evidence: 0.55,
    }),
  },
  { name: 'one line break', insight: over('Finance runs overconfident.\n80% stated, 55% happened.') },
  { name: 'a curly apostrophe', insight: over('Finance’s calls run overconfident — 80% stated.') },
  // Round 6: this was "…77 percent of the time against 75 percent stated.",
  // and "against N% stated" is a contrast now, allowed only in an over/under
  // card (it moved to DROP, item 1). The same numbers without it are kept:
  // work's said and happened are within 5 points.
  {
    name: 'percent written out',
    insight: { type: 'strength', category: 'work', message: 'Work came true 77 percent of the time, and you said 75 percent.', evidence: 77 },
  },
  {
    name: 'a fractional score, rounded',
    insight: { type: 'strength', category: 'finance', message: 'Finance scores 61 across 25 answers.', evidence: 61 },
  },
  { name: 'a rate written as a fraction', insight: over('Finance: 80% stated, a 0.55 hit rate.') },
  {
    name: '"work on" read as advice, not as the work category',
    insight: over(BASE, { suggestion: 'Work on stating finance calls lower.' }),
  },
  { name: 'weight as a figure of speech', insight: over(BASE, { suggestion: 'Give your low numbers more weight.' }) },
  { name: 'save without an amount', insight: over(BASE, { suggestion: 'Pause before you save the number.' }) },
  { name: 'a pause without a target', insight: over(BASE, { suggestion: 'Spend a moment on each finance call before you set a number.' }) },
  // Number words that claim no number.
  { name: '"double-check"', insight: over(BASE, { suggestion: 'Double-check finance calls you feel very sure about.' }) },
  { name: '"think twice"', insight: over(BASE, { suggestion: 'Think twice before a very sure finance call.' }) },
  { name: '"zero in on"', insight: over(BASE, { suggestion: 'Zero in on the finance calls you feel surest about.' }) },
  {
    name: 'a drift told by its halves',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance scored 6.5 points lower over your newer half of answers than your older half.', evidence: -6.5 },
  },
  {
    name: 'a count that is not provisional in a thin context',
    context: THIN,
    insight: { type: 'encouragement', category: 'overall', message: '12 answers so far, keep logging.', evidence: 12 },
  },
  {
    name: 'a category with no lean, not called overconfident',
    context: FINANCE_CALIBRATED,
    insight: { type: 'strength', category: 'finance', message: 'Finance scores 61 across 25 answers.', evidence: 61 },
  },
  {
    name: 'everything else from an older build',
    context: OLDER_BUILD,
    insight: over(BASE),
  },

  // --- 2026-11-19, item 1: what a number is, from the words beside it ---
  {
    name: 'a count named as a count',
    context: COUNTS,
    insight: { type: 'strength', category: 'finance', message: 'Finance has 21 scored answers and a score of 64.', evidence: 64.2 },
  },
  {
    name: 'the overall count, named overall',
    context: COUNTS,
    insight: { type: 'pattern', category: 'overall', message: 'You have 85 scored answers in total.', evidence: 85 },
  },
  {
    name: 'what happened and what was said, each by its own word (the swap’s twin)',
    insight: over('You were right 55% of the time in finance, though you felt 80% sure.'),
  },
  // Round 6, item 6: "…below your rating of 72." moved to DROP. In a sentence
  // that names a category only "overall", "in total" or "across all" make a
  // number the overall figure ("In finance, your rating is 72." is read as
  // finance's).
  {
    name: 'a category’s score beside the overall rating, named as the overall rating',
    insight: { type: 'strength', category: 'finance', message: 'Finance scores 61, below your overall rating of 72.', evidence: 61 },
  },
  {
    name: 'two categories in two clauses',
    insight: { type: 'strength', category: 'work', message: 'Finance sits at 80% stated, while work sits at 75%.', evidence: 75 },
  },
  {
    name: 'a percentage after "at" read as what was said',
    insight: over('Finance runs overconfident at 80%.'),
  },
  { name: 'what was said, as a percentage written out', insight: { type: 'strength', category: 'finance', message: 'You said 80 percent on average in finance.', evidence: 80 } },
  {
    name: 'a count named as answers',
    insight: { type: 'pattern', category: 'overall', message: 'You are at 81 scored answers so far.', evidence: 81 },
  },
  {
    name: 'a bare number in an encouragement reads as a count',
    insight: { type: 'encouragement', category: 'overall', message: 'You are at 81 so far, keep logging.', evidence: 81 },
  },
  {
    name: 'a bare number in a verdict reads as a score',
    insight: { type: 'strength', category: 'work', message: 'Work stands out at 88.', evidence: 88 },
  },
  {
    name: 'the weekday in a card labelled with a category',
    insight: { type: 'pattern', category: 'finance', message: 'Finance runs overconfident. Your Monday answers calibrate worst, at 58.', evidence: 58 },
  },

  // --- Item 2: "well calibrated" only within 5 points ---
  ...[
    'Work is spot-on, with a score of 88.',
    'Work is perfectly calibrated, with a score of 88.',
    'Work is about right, with a score of 88.',
    'Your work calls are accurate, with a score of 88.',
    'Work is in line with what happened, with a score of 88.',
    'Work is right on target, with a score of 88.',
    'Your work calls matched what happened, with a score of 88.',
    'Work is calibrated, with a score of 88.',
    'Work shows no clear lean, with a score of 88.',
    // Item 6: a negated lean is calibrated wording, held to the same rule.
    'Work is neither overconfident nor underconfident, with a score of 88.',
    'Work isn’t overconfident, with a score of 88.',
    'Your work calls are not too sure, with a score of 88.',
  ].map((message) => ({
    name: `close words for a category within 5 points: "${message}"`,
    insight: { type: 'strength', category: 'work', message, evidence: 88 },
  })),
  {
    name: '"no clear lean" for a calibrated category 25 points apart',
    context: FINANCE_CALIBRATED,
    insight: { type: 'strength', category: 'finance', message: 'Finance shows no clear lean, with a score of 61.', evidence: 61 },
  },
  {
    name: '"well calibrated" 4 whole points apart',
    context: WORK_4_APART,
    insight: { type: 'strength', category: 'work', message: 'Work is well calibrated, with a score of 88.', evidence: 88 },
  },
  {
    name: '"poorly calibrated" for a category that leans',
    insight: { type: 'pattern', category: 'finance', message: 'Finance is poorly calibrated, with a score of 61.', evidence: 61 },
  },
  {
    name: '"isn’t well calibrated" for a category that leans',
    insight: { type: 'pattern', category: 'finance', message: 'Finance isn’t well calibrated, with a score of 61.', evidence: 61 },
  },
  {
    name: 'a weekday "worst calibrated", a comparison and no verdict',
    insight: { type: 'pattern', category: 'overall', message: 'Mondays are your worst calibrated day, at 58.', evidence: 58 },
  },

  // --- Item 3: leans in plain words, in a card the direction backs ---
  ...[
    'Finance calls came true less often than you said.',
    'Fewer finance calls happened than you expected.',
    'Finance calls came true less often than the 80% you said.',
    'Your finance calls overstated how often things happen.',
    'You overrate your finance calls.',
    'Your finance numbers overshoot what happens.',
    'You are overly confident on finance calls.',
    'Your finance calls run optimistic.',
    'Compared with what you said, finance came true at 55%.',
    'Finance fell short: you said 80% and 55% happened.',
  ].map((message) => ({ name: `an overconfident lean in plain words: "${message}"`, insight: over(message) })),
  ...[
    'Social calls came true more often than you said.',
    'More social calls happened than you expected.',
    'Your social calls understated how often things happen.',
    'You underrate your social calls.',
    'You are not confident enough on social calls.',
    'Your social calls run cautious.',
    'Your social numbers look conservative.',
  ].map((message) => ({
    name: `an underconfident lean in plain words: "${message}"`,
    insight: { type: 'underconfidence', category: 'social', message, evidence: 82 },
  })),
  // A bare "cautious" or "optimistic" as advice names no lean: it is what
  // the card should advise.
  { name: 'advice to be more cautious in an overconfident card', insight: over(BASE, { suggestion: 'Consider being more cautious with your finance calls.' }) },
  { name: 'advice for more conservative numbers in an overconfident card', insight: over(BASE, { suggestion: 'Try more conservative numbers in finance.' }) },
  {
    name: 'advice to be more optimistic in an underconfident card',
    insight: { type: 'underconfidence', category: 'social', message: 'Social runs underconfident.', suggestion: 'Try being a bit more optimistic with social calls.', evidence: 82 },
  },
  {
    name: '"on the cautious side" for an underconfident category',
    insight: { type: 'underconfidence', category: 'social', message: 'Your social numbers sit on the cautious side: 60% stated, 82% happened.', evidence: 82 },
  },
  // An aim claims nothing about now.
  { name: 'advice "to become well calibrated" in an overconfident card', insight: over(BASE, { suggestion: 'Lower your finance numbers to become well calibrated.' }) },
  { name: 'advice to bring numbers "in line with" what happens', insight: over(BASE, { suggestion: 'Bring your finance numbers in line with what happens.' }) },
  { name: 'advice "to be more accurate"', insight: over(BASE, { suggestion: 'Try lower finance numbers to be more accurate.' }) },
  // Item 7: a score that runs high is honest.
  { name: 'a score that "runs high"', insight: { type: 'strength', category: 'work', message: 'Your work score runs high at 88.', evidence: 88 } },

  // --- Item 4: the floors at 20 ---
  {
    name: 'the weekday score from 20 answers on the day',
    context: DAY_20,
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers calibrate worst, at 58.', evidence: 58 },
  },
  {
    name: 'a drift from halves of 20',
    context: HALF_20,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped by 6.5 points.', evidence: -6.5 },
  },

  // --- Item 5: idioms that hold a category's word ---
  { name: '"keep up the good work" in a finance card', insight: over('Finance runs overconfident at 80%. Keep up the good work!') },
  { name: '"personal best" in a finance card', insight: over('Finance runs overconfident at 80%. Calibration is not about a personal best.') },
  {
    name: '"not financial advice" in a work card',
    insight: { type: 'strength', category: 'work', message: 'Work is well calibrated, with a score of 88. Not financial advice.', evidence: 88 },
  },

  // --- Item 8: calibration advice with a number is not money advice ---
  { name: 'move your number toward what happened', insight: over(BASE, { suggestion: 'Move your finance numbers toward 55%.' }) },
  { name: 'shift your number', insight: over(BASE, { suggestion: 'Shift your number toward 55%.' }) },

  // --- Item 9: floating point ---
  // Round 6, item 4: this was 58%, kept since 0.575 is 57.5% on paper. The
  // app shows Math.round(0.575 × 100) = 57% (coachReceipt, on this very card),
  // so a whole number must be that; 58% moved to DROP.
  {
    name: '57% for a rate of 0.575, as the card’s receipt shows it',
    context: FLOAT_EDGE,
    insight: { type: 'strength', category: 'finance', message: 'Finance came true 57% of the time.', evidence: 57 },
  },

  // --- Item 10: the disclaimers ---
  { name: '"Not legal advice."', insight: over(BASE, { suggestion: 'Not legal advice.' }) },
  { name: '"This is not investment advice."', insight: over(BASE, { suggestion: 'This is not investment advice.' }) },

  // --- Item 13: 988 as a count ---
  {
    name: 'exactly 988 scored answers',
    context: TOTAL_988,
    insight: { type: 'pattern', category: 'overall', message: 'You have 988 scored answers in total.', evidence: 988 },
  },

  // === Round 6 (2026-11-19). Each has a dropped twin below. ===

  // --- R6.1: what was said beside what happened, only where the app backs it ---
  {
    name: 'R6.1 a category with no clear lean: what was said, alone',
    context: FINANCE_NO_LEAN_21,
    insight: { type: 'strength', category: 'finance', message: 'In finance you said 80% on average.', evidence: 82 },
  },
  {
    name: 'R6.1 a category with no clear lean: what happened, alone',
    context: FINANCE_NO_LEAN_21,
    insight: { type: 'strength', category: 'finance', message: 'In finance, 70% of your calls came true.', evidence: 82 },
  },
  {
    name: 'R6.1 a category with no clear lean, called so',
    context: FINANCE_NO_LEAN_21,
    insight: { type: 'strength', category: 'finance', message: 'Finance shows no clear lean, with a score of 82.', evidence: 82 },
  },
  {
    name: 'R6.1 both, for a category within 5 points',
    insight: { type: 'strength', category: 'work', message: 'In work you said 75% on average, and 77% happened.', evidence: 88 },
  },
  {
    name: 'R6.1 both, in a pattern card, with only what was said in the words and a score as evidence',
    insight: { type: 'pattern', category: 'finance', message: 'You said 80% on average in finance.', evidence: 61 },
  },
  { name: 'R6.1 "but only" in an overconfidence card', insight: over('In finance you said 80% on average, but only 55% happened.') },
  { name: 'R6.1 "didn’t come true as often as you said" in an overconfidence card', insight: over('Finance calls didn’t come true as often as you said.') },
  { name: 'R6.1 "often miss" in an overconfidence card', insight: over('Your surest finance calls often miss.') },
  {
    name: 'R6.1 "as often as you said" for a category within 5 points',
    insight: { type: 'strength', category: 'work', message: 'Work calls came true about as often as you said.', evidence: 88 },
  },
  // What was said as a noun, and "less often" with no "than" (round 6,
  // found beside R4): in a card the direction backs.
  { name: 'R6.1 "below your stated confidence" in an overconfidence card', insight: over('Finance outcomes came in below your stated confidence.') },
  { name: 'R6.1 "compared with your confidence" in an overconfidence card', insight: over('Compared with your confidence, finance came true less often.') },
  { name: 'R6.1 "came true less often" in an overconfidence card', insight: over('Finance calls came true less often.') },
  {
    name: 'R6.1 "more often than your numbers" in an underconfidence card',
    insight: { type: 'underconfidence', category: 'social', message: 'Social calls came true more often than your numbers.', evidence: 82 },
  },
  { name: 'R6.1 "go over your numbers" is advice, not a lean', insight: over(BASE, { suggestion: 'Go over your numbers before each finance call.' }) },
  ...[
    'Finance results didn’t live up to your confidence.',
    'Your finance calls run too hopeful.',
    'Finance calls came true less frequently.',
    'Your surest finance calls often didn’t come true.',
  ].map((message) => ({ name: `R6.1 an overconfident lean in an overconfidence card: "${message}"`, insight: over(message) })),
  {
    name: 'R6.1 "more often than not" is no lean',
    insight: { type: 'strength', category: 'work', message: 'Your work calls came true more often than not, with a score of 88.', evidence: 88 },
  },

  // --- R6.2: a drift with the way it went ---
  {
    name: 'R6.2 a negative drift that fell',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score fell 6.5 points.', evidence: -6.5 },
  },
  {
    name: 'R6.2 a positive drift that rose',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Work rose 7.3 points.', evidence: 7.3 },
  },
  {
    name: 'R6.2 a positive drift, higher',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Your recent work answers score 7.3 points higher than your older ones.', evidence: 7.3 },
  },
  {
    name: 'R6.2 a negative drift as the evidence, the message saying it slipped',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped recently.', evidence: -6.5 },
  },
  {
    name: 'R6.2 a drift as the evidence of a card about something else',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance runs overconfident.', evidence: -6.5 },
  },
  {
    name: 'R6.2 a negative drift, down',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance is down 6.5 points from your older answers to your newer ones.', evidence: -6.5 },
  },

  // --- R6.3: a count is how many were answered ---
  { name: 'R6.3 a count of answers', insight: { type: 'strength', category: 'finance', message: 'Finance has 25 scored answers.', evidence: 25 } },
  {
    name: 'R6.3 a count beside a share that came true',
    insight: { type: 'pattern', category: 'finance', message: 'Your 25 finance calls came true 55% of the time.', evidence: 25 },
  },
  {
    name: 'R6.3 a count that a share is of',
    insight: { type: 'pattern', category: 'finance', message: '55% of your 25 finance answers came true.', evidence: 25 },
  },

  // --- R6.4: a whole number is the app's rounding ---
  {
    name: 'R6.4 a rating of 82.5 cited as 83, as the screen shows it',
    context: RATING_HALF,
    insight: { type: 'pattern', category: 'overall', message: 'Your rating is 83 overall.', evidence: 82.5 },
  },
  {
    name: 'R6.4 a rating of 82.5 cited with its decimal',
    context: RATING_HALF,
    insight: { type: 'pattern', category: 'overall', message: 'Your rating is 82.5 overall.', evidence: 82.5 },
  },
  { name: 'R6.4 a score of 61.5 cited as 62', context: HALVES, insight: { type: 'strength', category: 'finance', message: 'Finance scores 62.', evidence: 61.5 } },
  {
    name: 'R6.4 a stated 60.5% cited as 61%',
    context: HALVES,
    insight: { type: 'underconfidence', category: 'social', message: 'Your social calls run underconfident: you said 61% and 82% happened.', evidence: 82 },
  },
  { name: 'R6.4 a hit rate of 0.775 cited as 78%', context: HALVES, insight: { type: 'strength', category: 'work', message: 'Work came true 78% of the time.', evidence: 88 } },
  {
    name: 'R6.4 a drift of −6.5 cited as 6, as the receipt shows it (−6)',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped by 6 points.', evidence: -6.5 },
  },
  { name: 'R6.4 a drift of 7.3 cited as 7', context: RICH, insight: { type: 'pattern', category: 'work', message: 'Work improved by 7 points.', evidence: 7.3 } },
  {
    name: 'R6.4 a count beside a provisional score nowhere near it',
    context: HEALTH_SCORE_FAR,
    insight: { type: 'encouragement', category: 'overall', message: 'Health has 12 scored answers so far.', evidence: 81 },
  },

  // --- R6.5: a unit narrows, never decides alone ---
  { name: 'R6.5 a score in points', context: RICH, insight: { type: 'strength', category: 'work', message: 'Work scores 88 points.', evidence: 88 } },
  {
    name: 'R6.5 "score 7.3 points better": the unit says what can’t be both',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Work: score 7.3 points better than your earlier answers.', evidence: 7.3 },
  },

  // --- R6.6: overall in so many words, in a sentence that names a category ---
  {
    name: 'R6.6 "your overall rating" in a sentence that names finance',
    insight: { type: 'strength', category: 'finance', message: 'In finance, your overall rating is 72.', evidence: 61 },
  },

  // --- R6.7: badge names only as badges; "80% finance calls" ---
  { name: 'R6.7 "your 80% finance calls" read as what was said', insight: over('Your 80% finance calls came true 55% of the time.') },
  {
    name: 'R6.7 "just getting started" about a category under 20',
    insight: { type: 'encouragement', category: 'health', message: 'Keep logging: you’re just getting started in health, with 4 answers.', evidence: 4 },
  },
  {
    name: 'R6.7 "getting started" as a phrase about a category under 20 (a drop until round 6)',
    insight: { type: 'encouragement', category: 'health', message: 'You are getting started in health with 4 answers.', evidence: 4 },
  },
  {
    name: 'R6.7 "a sharp drop"',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance saw a sharp drop of 6.5 points.', evidence: -6.5 },
  },
  { name: 'R6.7 "a sharp eye"', insight: over(BASE, { suggestion: 'Keep a sharp eye on your surest finance calls.' }) },
  {
    name: 'R6.7 "Sharp drops" opening a line',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped by 6.5 points.\nSharp drops can follow very sure calls.', evidence: -6.5 },
  },

  // D80's medal names as ordinary words ("the gold standard", "a silver
  // lining") moved to DROP (record audit 2026-11-25): beside a score they read
  // as the tier, so the medals are tiers wherever they appear.

  // === Round 7 (2026-11-19, final Coach re-review). Each has a dropped twin below. ===

  // --- R7.1 (L2): the new words for what happened, beside a share (a count beside them drops) ---
  ...[
    'In finance, 55% of your calls worked out.',
    'In finance, 55% of your calls succeeded.',
    'In finance, 55% of your calls went your way.',
    'In finance, 55% of your calls resolved yes.',
    'In finance, 55% of your calls proved true.',
    'In finance, 55% of your calls paid off.',
  ].map((message) => ({
    name: `R7.1 a share beside a word for what happened: "${message}"`,
    insight: { type: 'pattern', category: 'finance', message, evidence: 0.55 },
  })),

  // --- R7.2 (L1): a negated change word reads the other way ---
  {
    name: 'R7.2 "hasn’t improved" as the words of a drift that slipped (its receipt shows −7)',
    context: WORK_DOWN,
    insight: { type: 'pattern', category: 'work', message: 'Your work score hasn’t improved lately.', evidence: -7.3 },
  },
  {
    name: 'R7.2 "didn’t improve by 7.3 points" beside a drift that slipped by that much',
    context: WORK_DOWN,
    insight: { type: 'pattern', category: 'work', message: 'Work didn’t improve by 7.3 points.', evidence: -7.3 },
  },
  {
    name: 'R7.2 the suggestion says the way the evidence drift went',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance runs overconfident.', suggestion: 'Its score has slipped lately.', evidence: -6.5 },
  },

  // --- R7.3 (L3): leans the lists missed, in a card the direction backs ---
  ...[
    'Fewer finance calls came true than you hoped.',
    'Fewer finance calls happened than you imagined.',
    'You said 80% in finance. Fewer than that came true.',
    'Finance outcomes trail your numbers.',
    'Finance outcomes lag behind what you said.',
  ].map((message) => ({ name: `R7.3 an overconfident lean in an overconfidence card: "${message}"`, insight: over(message) })),
  ...[
    'More social calls happened than you would think.',
    'More social calls happened than you’d think.',
    'You said 60% in social. More than that came true.',
    'Social outcomes are outpacing your stated confidence.',
    'What happened in social outpaces what you said.',
  ].map((message) => ({
    name: `R7.3 an underconfident lean in an underconfidence card: "${message}"`,
    insight: { type: 'underconfidence', category: 'social', message, evidence: 82 },
  })),

  // --- R7.4: a figure copied with its decimals, as the prompt now asks ---
  {
    name: 'R7.4 57.5% for a rate of 0.575 (the prompt asked for 58% until round 7, which drops)',
    context: FLOAT_EDGE,
    insight: { type: 'strength', category: 'finance', message: 'Finance came true 57.5% of the time.', evidence: 0.575 },
  },
  {
    name: 'R7.4 a rate of 0.5757… cut to 57.57% in the words, copied whole as the evidence',
    context: RATE_19_33,
    insight: over('Finance came true 57.57% of the time.', { evidence: 19 / 33 }),
  },

  // --- R7.5: a change word before "to" and a number: the level reached, backed by a drift ---
  {
    name: 'R7.5 "fell to 61" for a score whose drift slipped (dropped until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score fell to 61.', evidence: 61 },
  },
  {
    name: 'R7.5 "improved to 88" for a score whose drift rose',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Work improved to 88.', evidence: 88 },
  },
  {
    name: 'R7.5 "rose to about 88" for a score whose drift rose',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Work rose to about 88.', evidence: 88 },
  },
  {
    name: 'R7.5 "is down to 61" for a score whose drift slipped',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score is down to 61.', evidence: 61 },
  },
  {
    name: 'R7.5 "fell to a score of 61" for a score whose drift slipped',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance fell to a score of 61.', evidence: 61 },
  },
  {
    name: 'R7.5 a score beside "after slipping", whose drift slipped',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance scores 61 after slipping recently.', evidence: 61 },
  },

  // --- R7.6: "no gap" is calibrated wording ---
  {
    name: 'R7.6 "no gap between what you said and what happened" for a category within 5 points (dropped until round 7)',
    insight: { type: 'strength', category: 'work', message: 'In work there is no gap between what you said and what happened.', evidence: 88 },
  },
  {
    name: 'R7.6 "not a big gap" for a category within 5 points',
    insight: { type: 'strength', category: 'work', message: 'In work there is not a big gap between what you said and what happened.', evidence: 88 },
  },

  // --- R7.7: a trend said with no number, backed by the drift ---
  {
    name: 'R7.7 "has been slipping" for a category whose drift slipped, a score as evidence',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance calibration has been slipping lately.', evidence: 61 },
  },
  {
    name: 'R7.7 "hasn’t improved" for a category whose drift slipped, a score as evidence',
    context: WORK_DOWN,
    insight: { type: 'pattern', category: 'work', message: 'Your work score hasn’t improved lately.', evidence: 88 },
  },
  {
    name: 'R7.7 advice to raise the numbers is no trend',
    context: RICH,
    insight: { type: 'underconfidence', category: 'social', message: 'Social runs underconfident.', suggestion: 'Try increasing your social numbers a little.', evidence: 82 },
  },
];

const DROP: Fixture[] = [
  // --- 1. Provisional and thin-sample figures (review finding 1) ---
  {
    name: 'review example: a thin category’s score as encouragement',
    insight: { type: 'encouragement', category: 'health', message: 'Health is off to a sharp start at 90, keep logging.', evidence: 90 },
  },
  {
    name: 'review example: a thin category’s drift, labelled overall',
    insight: { type: 'pattern', category: 'overall', message: 'Your health calibration fell 50 points recently.', evidence: -50 },
  },
  {
    name: 'a thin category’s drift with no category named',
    insight: { type: 'pattern', category: 'overall', message: 'Your calibration fell 50 points recently.', evidence: -50 },
  },
  {
    name: 'a thin category’s drift, labelled with it',
    insight: { type: 'pattern', category: 'health', message: 'Health slipped by 50 points.', evidence: -50 },
  },
  {
    name: 'the provisional overall rating',
    context: THIN,
    insight: { type: 'encouragement', category: 'overall', message: '12 answers so far; your rating is 72.', evidence: 12 },
  },
  {
    name: 'a count that coincides with the provisional rating',
    context: THIN_COINCIDENT,
    insight: { type: 'encouragement', category: 'overall', message: 'Your rating is 12 so far, keep logging.', evidence: 12 },
  },
  {
    name: 'the weekday score from a build that sends no day count',
    context: OLDER_BUILD,
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers calibrate worst, at 58.', evidence: 58 },
  },
  {
    name: 'the weekday score from 6 answers on the day',
    context: THIN_DAY,
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers calibrate worst, at 58.', evidence: 58 },
  },
  {
    name: 'the weekday score under the overall gate',
    context: THIN_OVERALL_DAY,
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers calibrate worst, at 58.', evidence: 58 },
  },
  {
    name: 'a thin category’s mean in an encouragement',
    insight: { type: 'encouragement', category: 'health', message: '4 health answers so far, at 70% average confidence.', evidence: 4 },
  },
  {
    name: 'encouragement citing a score',
    insight: { type: 'encouragement', category: 'finance', message: 'Finance sits at 61; keep logging.', evidence: 61.37 },
  },
  {
    name: 'one category’s numbers given to a thin one',
    insight: over('Health: 80% stated, 55% happened.'),
  },
  {
    name: 'one category’s numbers given to another',
    insight: { type: 'strength', category: 'work', message: 'Work: 80% stated, 55% happened.', evidence: 88 },
  },
  {
    name: 'a verdict naming a thin category',
    insight: { type: 'strength', category: 'work', message: 'Work leads at 88, ahead of health.', evidence: 88 },
  },
  {
    name: 'a verdict about a category with no answers',
    insight: { type: 'strength', category: 'personal', message: 'Personal calls look steady.', evidence: 81 },
  },

  // --- 2. Numbers in the words (finding 2) ---
  {
    name: 'review example: an invented hit rate in the message',
    insight: over('When you say 80%, it happens about 30% of the time.'),
  },
  { name: 'an invented figure in the suggestion', insight: over(BASE, { suggestion: 'Try shading finance calls down by 15.' }) },
  { name: 'an invented gap in the suggestion', insight: over(BASE, { suggestion: 'Try stating finance calls 15 points lower.' }) },
  { name: 'a count written as a percentage', insight: over('When you say 80%, finance happens 25% of the time.') },
  {
    name: 'a score written as a percentage',
    insight: { type: 'strength', category: 'work', message: 'Your work score is 88%.', evidence: 88 },
  },
  { name: 'a range the data does not hold', insight: over('Finance calls at 80–100% run overconfident.') },
  {
    name: 'an ordinal',
    insight: { type: 'strength', category: 'work', message: 'Work ranks 1st at 88.', evidence: 88 },
  },
  {
    name: '"top 3"',
    insight: { type: 'strength', category: 'work', message: 'Work is in your top 3 at 88.', evidence: 88 },
  },
  { name: 'a number word', insight: over('Finance happened about half the time you said 80%.') },
  { name: 'a spelled-out fraction', insight: over('Two thirds of finance calls ran overconfident.') },
  { name: 'a multiple', insight: { type: 'pattern', category: 'work', message: 'Work’s score doubled.', evidence: 88 } },
  { name: '"zero" outside the idiom', insight: { type: 'strength', category: 'work', message: 'Work has zero misses at 88.', evidence: 88 } },
  { name: '"the other half"', insight: over('Finance at 80%: the other half did not happen.') },
  {
    name: 'a gate number dressed as a count',
    insight: { type: 'strength', category: 'finance', message: 'You have 20 answers in finance, scoring 61.', evidence: 61 },
  },
  { name: 'a gate number dressed as a gap', insight: over('Finance runs 20 points overconfident at 80%.') },
  { name: 'evidence of the wrong sign for a drift', context: RICH, insight: { type: 'pattern', category: 'finance', message: 'Finance slipped by 6.5 points.', evidence: 6.5 } },

  // --- 3. Leans the app didn't name (finding 3) ---
  {
    name: 'review example: overconfidence where the app says no clear lean',
    context: FINANCE_CALIBRATED,
    insight: over(BASE),
  },
  {
    name: 'overconfidence labelled overall',
    insight: { type: 'overconfidence', category: 'overall', message: 'You run overconfident overall at 72.', evidence: 72.4 },
  },
  {
    name: 'underconfidence for an overconfident category',
    insight: { type: 'underconfidence', category: 'finance', message: 'Finance scores 61.', evidence: 61 },
  },
  {
    name: 'lean words in a strength card about a category with no lean',
    insight: { type: 'strength', category: 'work', message: 'Work runs too sure at 88.', evidence: 88 },
  },
  {
    name: 'the opposite lean in words',
    insight: { type: 'pattern', category: 'finance', message: 'Finance runs too cautious at 61.', evidence: 61 },
  },
  {
    name: '"well calibrated" for a category that leans',
    insight: { type: 'strength', category: 'finance', message: 'Finance is well calibrated at 61.', evidence: 61 },
  },
  { name: 'two leans in one card', insight: over('Finance runs too sure while social runs too cautious.') },
  {
    name: 'a lean on a thin category in an encouragement',
    insight: { type: 'encouragement', category: 'health', message: 'Keep logging; health already looks overconfident.', evidence: 4 },
  },
  {
    name: 'an overall lean in an encouragement',
    insight: { type: 'encouragement', category: 'overall', message: '81 answers in, and you run too sure.', evidence: 81 },
  },

  // --- 4. The weekday index (finding 4) ---
  {
    name: 'the weekday index as evidence',
    insight: { type: 'pattern', category: 'overall', message: 'Mondays calibrate worst.', evidence: 1 },
  },
  {
    name: 'the weekday index in the words',
    insight: { type: 'pattern', category: 'overall', message: 'Your day 1 answers calibrate worst, at 58.', evidence: 58 },
  },
  {
    name: 'the weekday’s answer count as evidence',
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers calibrate worst, across 24 answers.', evidence: 24 },
  },

  // --- 5. What the words may contain ---
  { name: 'a URL', insight: over('Finance runs overconfident at 80%; see https://x.test for more.') },
  { name: 'a bare domain', insight: over('Finance runs overconfident at 80%; more at example.com today.') },
  { name: 'www', insight: over('Finance runs overconfident at 80%; see www.example for more.') },
  { name: 'an email address', insight: over('Finance runs overconfident at 80%; write to coach@example.') },
  { name: 'a phone number', insight: over('Finance runs overconfident at 80%: call 1-800-799-7233.') },
  { name: 'HTML', insight: over('<b>Finance</b> runs overconfident at 80%.') },
  { name: 'a markdown link', insight: over('[Finance](x) runs overconfident at 80%.') },
  { name: 'markdown emphasis', insight: over('**Finance** runs overconfident at 80%.') },
  { name: 'backticks', insight: over('`Finance` runs overconfident at 80%.') },
  { name: 'a bidi override', insight: over('Finance runs overconfident‮ at 80%.') },
  { name: 'a zero-width space', insight: over('Finance runs over​confident at 80%.') },
  { name: 'a control character', insight: over('Finance runs overconfident\u0007 at 80%.') },
  { name: 'two line breaks', insight: over('Finance runs overconfident.\n\n80% stated, 55% happened.') },
  { name: 'line breaks across message and suggestion', insight: over('Finance runs overconfident.', { suggestion: 'State lower.\nThen check.\nAgain.' }) },
  {
    name: 'a Cyrillic look-alike hiding a lean word',
    insight: { type: 'strength', category: 'work', message: 'Work runs оverconfident at 88.', evidence: 88 },
  },
  { name: 'digits from another script', insight: over('Finance runs overconfident: ٣٠% happened.') },
  { name: 'a currency amount', insight: over('Finance runs overconfident at 80%, a $25 habit.') },
  { name: 'a badge named', insight: { type: 'strength', category: 'finance', message: 'You’re a Forecaster in finance at 61.', evidence: 61 } },

  // --- 6. Advice the Coach must never give (with grounded numbers, so the
  // advice check alone is what drops them) ---
  { name: 'steps', insight: over(BASE, { suggestion: 'Take 80 steps before each finance call.' }) },
  { name: 'minutes', insight: over(BASE, { suggestion: 'Spend 25 minutes on each finance call.' }) },
  { name: 'hours of sleep', insight: over(BASE, { suggestion: 'Get 25 hours of rest before finance calls.' }) },
  { name: 'grams', insight: over(BASE, { suggestion: 'Eat 25 grams before finance calls.' }) },
  { name: 'servings', insight: over(BASE, { suggestion: 'Have 25 servings of greens.' }) },
  { name: 'cal', insight: over(BASE, { suggestion: 'Cut 80 cal from lunch.' }) },
  { name: 'cups', insight: over(BASE, { suggestion: 'Drink 25 cups of water.' }) },
  { name: 'glasses', insight: over(BASE, { suggestion: 'Have 25 glasses of water a day.' }) },
  { name: 'percent of income', insight: over(BASE, { suggestion: 'Put 80% of your income aside.' }) },
  { name: 'save an amount', insight: over(BASE, { suggestion: 'Save 80 a month.' }) },
  { name: 'see a doctor', insight: over(BASE, { suggestion: 'See a doctor about your finance calls.' }) },
  { name: 'a therapist', insight: over(BASE, { suggestion: 'Talk to a therapist about finance.' }) },
  { name: 'a lawyer', insight: over(BASE, { suggestion: 'Ask a lawyer before finance calls.' }) },
  { name: 'an advisor', insight: over(BASE, { suggestion: 'Check with an advisor first.' }) },
  { name: 'a helpline', insight: over(BASE, { suggestion: 'A helpline can help with money worries.' }) },
  { name: 'you’re anxious', insight: over(BASE, { suggestion: 'You’re anxious about money.' }) },
  { name: 'you seem stressed', insight: over(BASE, { suggestion: 'You seem stressed about finance.' }) },
  { name: 'you’re afraid', insight: over(BASE, { suggestion: "You're afraid of losing." }) },
  { name: 'index funds', insight: over(BASE, { suggestion: 'Index funds would steady your finance calls.' }) },
  { name: 'diet talk', insight: over(BASE, { suggestion: 'A better diet might help.' }) },

  // --- 8. Shape ---
  { name: 'an added category as the label', insight: over(BASE, { category: 'c-abcd1234' }) },
  { name: 'a message that is an object', insight: over(BASE, { message: { text: BASE } }) },
  { name: 'evidence that is an object', insight: over(BASE, { evidence: { value: 80 } }) },
  { name: 'a type that is an array', insight: over(BASE, { type: ['overconfidence'] }) },
  { name: 'a category that is an object', insight: over(BASE, { category: { name: 'finance' } }) },
  { name: 'an over-long message', insight: over('x'.repeat(241)) },
  { name: 'a message that only NFKC makes over-long', insight: over(`${'ﬁ'.repeat(121)}`) },

  // --- 2026-11-19, item 1: a number shown as a kind it isn't ---
  {
    name: 'record re-audit: a total count as a thin category’s score',
    context: COUNTS,
    insight: { type: 'encouragement', category: 'health', message: 'Your health score is 85 so far. Keep logging.', evidence: 12 },
  },
  {
    name: 'a total count as a category’s score, in a verdict',
    context: COUNTS,
    insight: { type: 'strength', category: 'work', message: 'Your work score is 85.', evidence: 83 },
  },
  {
    name: 'record re-audit: a category’s count as its score',
    context: COUNTS,
    insight: { type: 'strength', category: 'finance', message: 'Your finance score is 21.', evidence: 64.2 },
  },
  {
    name: 'record re-audit: what was said and what happened swapped',
    insight: over('You were right 80% of the time in finance, though you felt only 55% sure.'),
  },
  {
    name: 'the overall rating as a category’s score',
    insight: { type: 'strength', category: 'finance', message: 'Your finance score is 72.', evidence: 61 },
  },
  {
    name: 'one number beside two categories',
    insight: { type: 'strength', category: 'work', message: 'Finance and work both sit at 80%.', evidence: 75 },
  },
  {
    name: 'what happened as a plain number, read as a count',
    insight: over('Finance: 80% stated, and 55 happened.'),
  },
  {
    name: 'what was said, presented as a share resolved',
    insight: { type: 'strength', category: 'finance', message: 'You resolved 80 percent of what you logged in finance.', evidence: 80 },
  },
  {
    name: 'a bare count in a verdict, read as a score',
    insight: { type: 'pattern', category: 'overall', message: 'You are at 81 so far.', evidence: 81 },
  },
  {
    name: 'what happened, after "at", read as what was said',
    insight: { type: 'underconfidence', category: 'social', message: 'Social runs underconfident at 82%.', evidence: 82 },
  },
  {
    name: 'the overall count in a category’s card',
    insight: over('Finance runs overconfident.\nYou have 81 scored answers.'),
  },

  // --- Item 2: "well calibrated" where the app says "no clear lean" ---
  ...[
    'Finance is well calibrated, with a score of 61.',
    'Finance is spot-on, with a score of 61.',
    'Finance is perfectly calibrated, with a score of 61.',
    'Finance is about right, with a score of 61.',
    'Your finance calls are accurate, with a score of 61.',
    'Finance is in line with what happened, with a score of 61.',
    'Finance is right on target, with a score of 61.',
    'Your finance calls matched what happened, with a score of 61.',
    'Finance is calibrated, with a score of 61.',
    'Finance is neither overconfident nor underconfident, with a score of 61.',
    'Finance isn’t overconfident, with a score of 61.',
    'Your finance calls are not too sure, with a score of 61.',
  ].map((message) => ({
    name: `close words for a calibrated category 25 points apart: "${message}"`,
    context: FINANCE_CALIBRATED,
    insight: { type: 'strength', category: 'finance', message, evidence: 61 },
  })),
  {
    name: '"well calibrated" 5 whole points apart',
    context: WORK_5_APART,
    insight: { type: 'strength', category: 'work', message: 'Work is well calibrated, with a score of 88.', evidence: 88 },
  },
  {
    name: 'a negated lean for a category that leans',
    insight: { type: 'pattern', category: 'finance', message: 'Finance isn’t overconfident, with a score of 61.', evidence: 61 },
  },
  {
    name: '"poorly calibrated" for a category with no lean',
    insight: { type: 'strength', category: 'work', message: 'Work is poorly calibrated, with a score of 88.', evidence: 88 },
  },
  {
    name: '"isn’t well calibrated" for a category within 5 points',
    insight: { type: 'strength', category: 'work', message: 'Work isn’t well calibrated, with a score of 88.', evidence: 88 },
  },

  // --- Item 3: the same leans where the direction doesn't back them ---
  ...[
    'Work calls came true less often than you said.',
    'Fewer work calls happened than you expected.',
    'Your work calls overstated how often things happen.',
    'You overrate your work calls.',
    'Your work numbers overshoot what happens.',
    'You are overly confident on work calls.',
    'Your work calls run optimistic.',
    'Work calls came true more often than you said.',
    'More work calls happened than you expected.',
    'Your work calls understated how often things happen.',
    'You underrate your work calls.',
    'You are not confident enough on work calls.',
    'Your work calls run cautious.',
    'Your work numbers look conservative.',
    'Compared with what you said, work came true at 77%.',
    'Your confidence runs high in work.',
  ].map((message) => ({
    name: `a lean in plain words for a category with no lean: "${message}"`,
    insight: { type: 'strength', category: 'work', message, evidence: 88 },
  })),
  {
    name: 'a comparison with what was said outside an over/under card',
    insight: { type: 'pattern', category: 'finance', message: 'Finance came true less often than you expected.', evidence: 80 },
  },
  {
    name: 'a comparison with what was said in an overall card',
    insight: { type: 'pattern', category: 'overall', message: 'Your calls came true less often than you said.', evidence: 81 },
  },
  {
    name: 'a comparison the wrong way for the card',
    insight: over('More finance calls happened than you said.'),
  },

  // --- Item 4: the floors at 20 ---
  {
    name: 'the weekday score from 19 answers on the day',
    context: DAY_19,
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers calibrate worst, at 58.', evidence: 58 },
  },
  {
    name: 'a drift from halves of 19 and 20',
    context: HALF_19,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped by 6.5 points.', evidence: -6.5 },
  },
  {
    name: 'a drift sent without its halves’ count (a build before 2026-11-19)',
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped by 6.5 points.', evidence: -6.5 },
  },
  {
    name: 'a drift’s halves’ count cited',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance compares halves of 22 answers.', evidence: 44 },
  },

  // --- Item 5: a real use of the category's word still names it ---
  { name: 'work named by "your work calls" in a finance card', insight: over('Finance runs overconfident at 80%, and so do your work calls.') },
  { name: 'work named by "at work" in a finance card', insight: over('Finance runs overconfident at 80%, unlike your calls at work.') },
  { name: 'work named by "related to work" in a finance card', insight: over('Finance runs overconfident at 80%, unlike calls related to work.') },
  {
    name: '"well calibrated" as a claim, not an aim, for a category that leans',
    insight: over(BASE, { suggestion: 'Finance is well calibrated now.' }),
  },
  { name: 'personal named by "your personal calls"', insight: over('Finance runs overconfident at 80%, and so do your personal calls.') },
  {
    name: 'finance named by "your financial calls" in a work card',
    insight: { type: 'strength', category: 'work', message: 'Work is well calibrated, with a score of 88, as are your financial calls.', evidence: 88 },
  },

  // --- Item 8: money advice still drops ---
  { name: 'a percentage of savings into bonds', insight: over(BASE, { suggestion: 'Move 55% of your savings into bonds.' }) },
  { name: 'a percentage put aside', insight: over(BASE, { suggestion: 'Put 55% aside each month.' }) },
  { name: 'shorting', insight: over(BASE, { suggestion: 'Short the market less often.' }) },

  // --- Item 9: still only rounding ---
  {
    name: '59% for a rate of 0.575',
    context: FLOAT_EDGE,
    insight: { type: 'strength', category: 'finance', message: 'Finance came true 59% of the time.', evidence: 58 },
  },

  // --- Items 10 and 13: words ---
  { name: 'legal advice given', insight: over(BASE, { suggestion: 'Get legal advice before finance calls.' }) },
  { name: '"a couple"', insight: over('A couple of finance calls ran overconfident.') },
  { name: '"a pair"', insight: over('A pair of finance calls ran overconfident.') },
  { name: '"a fifth"', insight: over('A fifth of finance calls ran overconfident.') },
  { name: 'a badge: Sharp', insight: { type: 'strength', category: 'work', message: 'Work is sharp at 88.', evidence: 88 } },
  // Round 6, item 7: "You are getting started in health with 4 answers." was
  // here. It is the plain phrase, about a category under 20 answers, where
  // the first tier's name is true too, so it moved to KEEP; the tier label
  // and the phrase about a category past 20 are below.
  { name: 'a badge: Guesser', insight: { type: 'strength', category: 'work', message: 'Work is past Guesser at 88.', evidence: 88 } },
  { name: 'hire an accountant', insight: over(BASE, { suggestion: 'Hire an accountant for finance calls.' }) },
  { name: 'find a therapist', insight: over(BASE, { suggestion: 'Find a therapist.' }) },
  {
    name: '988 as a line to call',
    context: TOTAL_988,
    insight: { type: 'pattern', category: 'overall', message: 'You have 988 scored answers. Call 988 if this feels heavy.', evidence: 988 },
  },

  // === Round 6 (2026-11-19). The twins of the round-6 KEEP fixtures. ===

  // --- R6.1 (BLOCKER, R4): a contrast where the app says "No clear lean" ---
  ...[
    'In finance you said 80% on average, but only 70% happened.',
    'In finance you said 80%; just 70% came true.',
    'Your surest finance calls often miss.',
    // No contrast word: the two numbers side by side are the lean.
    'In finance you said 80% on average, and 70% happened.',
    'Finance calls didn’t come true as often as you said.',
    'Finance came true, but not as often as you said.',
    'Finance came true 70% of the time against 80% stated.',
    'In finance there is a gap between what you said and what happened.',
    'What happened in finance trails what you said.',
    'In finance what you said and what happened don’t line up.',
    'Your finance calls miss more than you would think.',
    'Finance came true a long way from what you said.',
    'Finance shows a mismatch between your numbers and outcomes.',
  ].map((message) => ({
    name: `R6.1 a contrast for a category with no clear lean: "${message}"`,
    context: FINANCE_NO_LEAN_21,
    insight: { type: 'strength', category: 'finance', message, evidence: 82 },
  })),
  {
    name: 'R6.1 what was said in the words, what happened as the evidence (its receipt shows on the card)',
    context: FINANCE_NO_LEAN_21,
    insight: { type: 'strength', category: 'finance', message: 'In finance you said 80% on average.', evidence: 0.7 },
  },
  {
    name: 'R6.1 both in a pattern card, for a category that leans (only an over/under card)',
    insight: { type: 'pattern', category: 'finance', message: 'Finance: 80% stated, 55% happened.', evidence: 80 },
  },
  {
    name: 'R6.1 what happened as the evidence of a pattern card that says what was said',
    insight: { type: 'pattern', category: 'finance', message: 'You said 80% on average in finance.', evidence: 0.55 },
  },
  {
    name: 'R6.1 "didn’t come true as often as" is never calibrated wording',
    insight: { type: 'strength', category: 'work', message: 'Work calls didn’t come true as often as you said.', evidence: 88 },
  },
  {
    name: 'R6.1 "against 75 percent stated" in a strength card (kept until round 6)',
    insight: { type: 'strength', category: 'work', message: 'Work came true 77 percent of the time against 75 percent stated.', evidence: 77 },
  },
  // What was said as a noun, and "less often" with no "than", where the
  // app says "No clear lean".
  ...[
    'Finance outcomes came in below your stated confidence.',
    'Compared with your confidence, finance came true less often.',
    'Finance calls came true less often.',
    'Finance calls came true more often than your numbers.',
    'Finance results didn’t live up to your confidence.',
    'Your finance calls run too hopeful.',
    'Finance calls came true less frequently.',
    'Your surest finance calls often didn’t come true.',
  ].map((message) => ({
    name: `R6.1 what was said as a noun, for a category with no clear lean: "${message}"`,
    context: FINANCE_NO_LEAN_21,
    insight: { type: 'strength', category: 'finance', message, evidence: 82 },
  })),
  {
    name: 'R6.1 "came true less often" in an underconfidence card (the wrong way)',
    insight: { type: 'underconfidence', category: 'social', message: 'Social calls came true less often.', evidence: 82 },
  },

  // --- R6.2: a drift's direction ---
  {
    name: 'R6.2 a negative drift said to improve',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score improved by 6.5 points.', evidence: -6.5 },
  },
  {
    name: 'R6.2 a drift with no direction',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score moved 6.5 points.', evidence: -6.5 },
  },
  {
    name: 'R6.2 a positive drift said to slip',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Work slipped by 7.3 points.', evidence: 7.3 },
  },
  {
    name: 'R6.2 a negative drift as the evidence, the message saying it improved (its receipt shows −6)',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score improved recently.', evidence: -6.5 },
  },
  {
    name: 'R6.2 a positive drift as the evidence, the message saying it fell',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Your work score fell lately.', evidence: 7.3 },
  },
  {
    name: 'R6.2 a drift with both directions beside it',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Your work score rose 7.3 points from a lower start.', evidence: 7.3 },
  },

  // --- R6.3: a count shown as the number that came true ---
  { name: 'R6.3 "25 predictions came true"', insight: { type: 'strength', category: 'finance', message: 'In finance, 25 predictions came true.', evidence: 25 } },
  { name: 'R6.3 "81 of your predictions came true"', insight: { type: 'pattern', category: 'overall', message: '81 of your predictions came true.', evidence: 81 } },
  { name: 'R6.3 "came true 25 times"', insight: { type: 'strength', category: 'finance', message: 'Finance came true 25 times.', evidence: 25 } },
  {
    name: 'R6.3 a count beside "came true" with a share not pressed against it',
    insight: { type: 'pattern', category: 'finance', message: '25 finance calls came true at 55%.', evidence: 25 },
  },

  // --- R6.4: a whole number a point off the screen ---
  {
    name: 'R6.4 a rating of 82.5 cited as 82, a point below the screen’s 83',
    context: RATING_HALF,
    insight: { type: 'pattern', category: 'overall', message: 'Your rating is 82 overall.', evidence: 82.5 },
  },
  { name: 'R6.4 a score of 61.5 cited as 61', context: HALVES, insight: { type: 'strength', category: 'finance', message: 'Finance scores 61.', evidence: 61.5 } },
  {
    name: 'R6.4 a stated 60.5% cited as 60%',
    context: HALVES,
    insight: { type: 'underconfidence', category: 'social', message: 'Your social calls run underconfident: you said 60% and 82% happened.', evidence: 82 },
  },
  { name: 'R6.4 a hit rate of 0.775 cited as 77%', context: HALVES, insight: { type: 'strength', category: 'work', message: 'Work came true 77% of the time.', evidence: 88 } },
  {
    name: 'R6.4 58% for a rate of 0.575, which the card shows as 57% (kept until round 6)',
    context: FLOAT_EDGE,
    insight: { type: 'strength', category: 'finance', message: 'Finance came true 58% of the time.', evidence: 58 },
  },
  {
    name: 'R6.4 a drift of −6.5 cited as 7, which the receipt shows as −6',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped by 7 points.', evidence: -6.5 },
  },
  {
    name: 'R6.4 a count within the tolerance of a provisional score still blocks (12 beside 12.5)',
    context: HEALTH_SCORE_HALF,
    insight: { type: 'encouragement', category: 'overall', message: 'Health has 12 scored answers so far.', evidence: 81 },
  },

  // --- R6.5: a unit no longer decides alone ---
  { name: 'R6.5 "improved by 88 points" with 88 the score', context: RICH, insight: { type: 'strength', category: 'work', message: 'Work improved by 88 points.', evidence: 88 } },
  {
    name: 'R6.5 "improved by about 88 points": a change word in reach makes it a drift',
    context: RICH,
    insight: { type: 'strength', category: 'work', message: 'Work improved by about 88 points.', evidence: 88 },
  },

  // --- R6.6: "your rating" and a weekday don't switch a named category's sentence to overall ---
  { name: 'R6.6 "In finance, your rating is 72."', insight: { type: 'strength', category: 'finance', message: 'In finance, your rating is 72.', evidence: 61 } },
  {
    name: 'R6.6 "below your rating of 72" beside finance’s score (kept until round 6)',
    insight: { type: 'strength', category: 'finance', message: 'Finance scores 61, below your rating of 72.', evidence: 61 },
  },
  {
    name: 'R6.6 a weekday beside the number, in a sentence that names finance',
    insight: { type: 'pattern', category: 'finance', message: 'In finance, your Monday answers score 58.', evidence: 61 },
  },

  // --- R6.7: badges as badges ---
  { name: 'R6.7 "your 80% finance calls came true 80%": the second is a hit rate', insight: over('Your 80% finance calls came true 80% of the time.') },
  { name: 'R6.7 Sharp capitalised in a sentence', insight: { type: 'strength', category: 'work', message: 'Work is Sharp at 88.', evidence: 88 } },
  { name: 'R6.7 "sharp" with no ordinary noun after it', insight: { type: 'strength', category: 'finance', message: 'Finance is sharp, with a score of 61.', evidence: 61 } },
  { name: 'R6.7 "Sharp in work"', insight: { type: 'strength', category: 'work', message: 'Sharp in work at 88.', evidence: 88 } },
  {
    name: 'R6.7 "Getting started" as a tier label',
    insight: { type: 'encouragement', category: 'health', message: 'You are at Getting started in health with 4 answers.', evidence: 4 },
  },
  {
    name: 'R6.7 "the getting started badge"',
    insight: { type: 'encouragement', category: 'health', message: 'Health has the getting started badge with 4 answers.', evidence: 4 },
  },
  {
    name: 'R6.7 "still getting started" about a category past 20',
    insight: { type: 'encouragement', category: 'finance', message: 'You are still getting started in finance with 25 answers.', evidence: 25 },
  },
  {
    name: 'R6.7 "just getting started" about a record past 20',
    insight: { type: 'encouragement', category: 'overall', message: 'You are just getting started with 81 answers.', evidence: 81 },
  },

  // --- D80 (2026-11-25): the medals as badges ---
  { name: 'D80 "work is gold"', insight: { type: 'strength', category: 'work', message: 'Work is gold, with a score of 88.', evidence: 88 } },
  { name: 'D80 "Gold in work"', insight: { type: 'strength', category: 'work', message: 'Gold in work at 88.', evidence: 88 } },
  { name: 'D80 Silver capitalised in a sentence', insight: { type: 'strength', category: 'work', message: 'Work is Silver at 88.', evidence: 88 } },
  { name: 'D80 "a silver badge"', insight: { type: 'strength', category: 'work', message: 'Work holds a silver badge at 88.', evidence: 88 } },
  { name: 'D80 "platinum level"', insight: { type: 'strength', category: 'work', message: 'Work is at platinum level, with a score of 88.', evidence: 88 } },
  { name: 'D80 "a gold medal"', insight: { type: 'strength', category: 'work', message: 'Work earns a gold medal at 88.', evidence: 88 } },
  { name: 'D80 "at Bronze"', insight: { type: 'strength', category: 'finance', message: 'Finance is at Bronze with a score of 61.', evidence: 61 } },
  { name: 'D80 "Platinum" opening a sentence, with no ordinary noun after it', insight: { type: 'strength', category: 'work', message: 'Platinum for work: a score of 88.', evidence: 88 } },
  // The old names stay forbidden beside the medals.
  { name: 'D80 an old name still dropped: Oracle', insight: { type: 'strength', category: 'work', message: 'Work is near Oracle at 88.', evidence: 88 } },
  // Record audit 2026-11-25: the medals as ordinary words are tiers too (all
  // three kept until then), and "medal" or "badge" names one without its name.
  {
    name: 'D80 "the gold standard" (kept until 2026-11-25)',
    insight: { type: 'strength', category: 'work', message: 'Work scores 88, the gold standard in your record.', evidence: 88 },
  },
  {
    name: 'D80 "a silver lining" (kept until 2026-11-25)',
    insight: over(BASE, { suggestion: 'The silver lining: lower finance numbers are easy to try.' }),
  },
  {
    name: 'D80 "Gold standard" opening a line (kept until 2026-11-25)',
    insight: { type: 'strength', category: 'work', message: 'Gold standard work: a score of 88.', evidence: 88 },
  },
  { name: 'D80 "a bronze rush"', insight: { type: 'strength', category: 'work', message: 'Work had a bronze rush, scoring 88.', evidence: 88 } },
  { name: '"a medal" with no tier named', insight: { type: 'strength', category: 'work', message: 'Work earns a medal at 88.', evidence: 88 } },
  { name: '"badges" with no tier named', insight: { type: 'strength', category: 'work', message: 'Work at 88 is where badges come from.', evidence: 88 } },
  // Review round 3 (2026-11-25): a tier said without a medal's name.
  { name: '"golden" with no tier named', insight: { type: 'strength', category: 'work', message: 'Work is golden at 88.', evidence: 88 } },
  { name: '"top tier" with no tier named', insight: { type: 'strength', category: 'work', message: 'Work is top tier at 88.', evidence: 88 } },
  { name: '"top-tier" with no tier named', insight: { type: 'strength', category: 'work', message: 'Work is top-tier at 88.', evidence: 88 } },
  { name: '"Top tier" opening a line', insight: { type: 'strength', category: 'work', message: 'Top tier work: a score of 88.', evidence: 88 } },

  // === Round 7 (2026-11-19). The twins of the round-7 KEEP fixtures. ===

  // --- R7.1 (L2): a count shown as what worked out (25 is finance's answer count) ---
  ...[
    'In finance, 25 predictions worked out.',
    'In finance, 25 predictions succeeded.',
    '25 of your finance calls went your way.',
    'In finance, 25 predictions resolved yes.',
    'In finance, 25 predictions proved true.',
    'In finance, 25 predictions paid off.',
  ].map((message) => ({
    name: `R7.1 a count shown as what came true (kept until round 7): "${message}"`,
    insight: { type: 'strength', category: 'finance', message, evidence: 25 },
  })),

  // --- R7.2 (L1): a negated change word, and the suggestion, against the drift ---
  {
    name: 'R7.2 "didn’t improve by 7.3 points" beside a drift that rose (kept until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Work didn’t improve by 7.3 points.', evidence: 7.3 },
  },
  {
    name: 'R7.2 "hasn’t improved" as the words of a drift that rose (kept until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Your work score hasn’t improved lately.', evidence: 7.3 },
  },
  {
    name: 'R7.2 the suggestion says the other way from the evidence drift (kept until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Finance runs overconfident.', suggestion: 'Its score has improved lately.', evidence: -6.5 },
  },
  {
    name: 'R7.2 "no improvement" beside a drift that rose: a negated noun reads either way (kept until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Work shows no improvement lately.', evidence: 7.3 },
  },
  {
    name: 'R7.2 "never been better" beside a drift that slipped: a negated comparison reads either way, never turned',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score has never been better.', evidence: -6.5 },
  },

  // --- R7.3 (L3): the same leans where the direction doesn't back them ---
  ...[
    'In work, fewer calls came true than you hoped.',
    'Fewer work calls happened than you imagined.',
    'Fewer work calls happened than you believe.',
    'More work calls happened than you’d think.',
    'You said 75% in work. Fewer than that came true.',
    'You said 75% in work. More than that came true.',
    'Work outcomes are outpacing your stated confidence.',
    'What happened in work outpaces what you said.',
    'Your work confidence outpaced the outcomes.',
  ].map((message) => ({
    name: `R7.3 a lean for a category with no lean (kept until round 7): "${message}"`,
    insight: { type: 'strength', category: 'work', message, evidence: 88 },
  })),
  {
    name: 'R7.3 "trail your numbers" in an underconfidence card, the wrong way (kept until round 7)',
    insight: { type: 'underconfidence', category: 'social', message: 'Social outcomes trail your numbers.', evidence: 82 },
  },
  {
    name: 'R7.3 "outpacing your stated confidence" in an overconfidence card, the wrong way (kept until round 7)',
    insight: over('Finance outcomes are outpacing your stated confidence.'),
  },
  {
    name: 'R7.3 "outpaced" with no said object reads either way (kept until round 7)',
    insight: { type: 'underconfidence', category: 'social', message: 'Your social confidence outpaced the outcomes.', evidence: 82 },
  },
  {
    name: 'R7.3 "more than that came true" in an overconfidence card, the wrong way (kept until round 7)',
    insight: over('You said 80% in finance. More than that came true.'),
  },

  // --- R7.4: why the prompt keeps the evidence whole ---
  {
    name: 'R7.4 a rate of 0.5757… cut to 0.57 as the evidence: outside the rate’s tolerance of 0.005',
    context: RATE_19_33,
    insight: over('Finance came true 57.57% of the time.', { evidence: 0.57 }),
  },

  // --- R7.5: a score said to have moved, with no drift to back it or the wrong way ---
  {
    name: 'R7.5 "fell to 61" with the drift under its gate',
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score fell to 61.', evidence: 61 },
  },
  {
    name: 'R7.5 "rose to 61" for a score whose drift slipped',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score rose to 61.', evidence: 61 },
  },
  {
    name: 'R7.5 "moved to 61": no way said',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score moved to 61.', evidence: 61 },
  },
  {
    name: 'R7.5 "is up to 61": "up to" says no way (kept until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score is up to 61.', evidence: 61 },
  },
  {
    name: 'R7.5 the rating said to fall: the context holds no overall drift',
    context: RICH,
    insight: { type: 'pattern', category: 'overall', message: 'Your rating fell to 72.', evidence: 72 },
  },
  {
    name: 'R7.5 the weekday score said to fall: the context holds no drift for it',
    context: RICH,
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers fell to 58.', evidence: 58 },
  },
  {
    name: 'R7.5 "is down to 61" with the drift under its gate (kept until round 7)',
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score is down to 61.', evidence: 61 },
  },
  {
    name: 'R7.5 "fell to a score of 61" with the drift under its gate (kept until round 7)',
    insight: { type: 'pattern', category: 'finance', message: 'Finance fell to a score of 61.', evidence: 61 },
  },
  {
    name: 'R7.5 a score beside "after slipping" with the drift under its gate (kept until round 7)',
    insight: { type: 'pattern', category: 'finance', message: 'Finance scores 61 after slipping recently.', evidence: 61 },
  },

  // --- R7.6: "no gap" where the app doesn't say well calibrated ---
  {
    name: 'R7.6 "no gap" for a category with no clear lean, 10 points apart',
    context: FINANCE_NO_LEAN_21,
    insight: { type: 'strength', category: 'finance', message: 'In finance there is no gap between what you said and what happened.', evidence: 82 },
  },
  {
    name: 'R7.6 "no gap" in an overconfidence card (kept until round 7)',
    insight: over('In finance there is no gap between what you said and what happened.'),
  },

  // --- R7.7: a trend said with no number, against the drift or with none to back it ---
  {
    name: 'R7.7 "has been improving" for a category whose drift slipped, a score as evidence (kept until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'finance', message: 'Your finance calibration has been improving lately.', evidence: 61 },
  },
  {
    name: 'R7.7 "has been slipping" with the drift under its gate (kept until round 7)',
    insight: { type: 'pattern', category: 'finance', message: 'Your finance calibration has been slipping lately.', evidence: 61 },
  },
  {
    name: 'R7.7 "hasn’t improved" for a category whose drift rose, a score as evidence (kept until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'work', message: 'Your work score hasn’t improved lately.', evidence: 88 },
  },
  {
    name: 'R7.7 the rating said to improve: the context holds no overall drift (kept until round 7)',
    context: RICH,
    insight: { type: 'pattern', category: 'overall', message: 'Your rating has improved lately.', evidence: 72.4 },
  },
];

/** What a validator kept, without the client's receipt annotation. */
function kept(out: { insights: Array<Record<string, unknown>> }) {
  return out.insights.map(({ evidence_source: _source, ...rest }) => rest);
}

function runBoth(insights: unknown[], context: CoachContext) {
  const raw = { insights, safe: true };
  return {
    client: kept(clientValidate(raw, context) as unknown as { insights: Array<Record<string, unknown>> }),
    server: kept(serverValidate(raw, context) as unknown as { insights: Array<Record<string, unknown>> }),
  };
}

describe('Coach lockstep — fixtures the server accepts as input', () => {
  it.each([
    ['CTX', CTX],
    ['OLDER_BUILD', OLDER_BUILD],
    ['THIN_DAY', THIN_DAY],
    ['THIN_OVERALL_DAY', THIN_OVERALL_DAY],
    ['THIN', THIN],
    ['THIN_COINCIDENT', THIN_COINCIDENT],
    ['FINANCE_CALIBRATED', FINANCE_CALIBRATED],
    ['DAY_19', DAY_19],
    ['DAY_20', DAY_20],
    ['RICH', RICH],
    ['HALF_19', HALF_19],
    ['HALF_20', HALF_20],
    ['COUNTS', COUNTS],
    ['WORK_5_APART', WORK_5_APART],
    ['WORK_4_APART', WORK_4_APART],
    ['FLOAT_EDGE', FLOAT_EDGE],
    ['TOTAL_988', TOTAL_988],
    ['FINANCE_NO_LEAN_21', FINANCE_NO_LEAN_21],
    ['RATING_HALF', RATING_HALF],
    ['HALVES', HALVES],
    ['HEALTH_SCORE_HALF', HEALTH_SCORE_HALF],
    ['HEALTH_SCORE_FAR', HEALTH_SCORE_FAR],
    ['WORK_DOWN', WORK_DOWN],
    ['RATE_19_33', RATE_19_33],
  ])('%s is a payload the function takes', (_name, context) => {
    expect(parseContext(context)).toEqual(context);
  });
});

describe('Coach lockstep — kept by both', () => {
  it.each(KEEP.map((f) => [f.name, f] as const))('%s', (_name, f) => {
    const { client, server } = runBoth([f.insight], f.context ?? CTX);
    expect(client).toHaveLength(1);
    expect(server).toEqual(client);
  });
});

describe('Coach lockstep — dropped by both', () => {
  it.each(DROP.map((f) => [f.name, f] as const))('%s', (_name, f) => {
    const { client, server } = runBoth([f.insight], f.context ?? CTX);
    expect(client).toEqual([]);
    expect(server).toEqual([]);
  });
});

describe('Coach lockstep — whole responses', () => {
  it('keeps at most three insights', () => {
    const { client, server } = runBoth(Array(6).fill(over(BASE)), CTX);
    expect(client).toHaveLength(3);
    expect(server).toEqual(client);
  });

  it('keeps the good ones and drops the bad ones in one answer', () => {
    const { client, server } = runBoth(
      [over('When you say 80%, it happens about 30% of the time.'), over(BASE), 'You are bad with money'],
      CTX,
    );
    expect(client).toHaveLength(1);
    expect(server).toEqual(client);
  });

  it('shows the words as checked, the same on both sides', () => {
    const { client, server } = runBoth([over('Finance runs overconfident — ８０% stated.')], CTX);
    expect(client).toEqual([expect.objectContaining({ message: 'Finance runs overconfident — 80% stated.' })]);
    expect(server).toEqual(client);
  });

  it.each([
    ['non-JSON (a string)', 'Sure! Here are your insights.'],
    ['null', null],
    ['a number', 42],
    ['an array', [over(BASE)]],
    ['no insights array', { safe: true }],
    ['insights as an object', { insights: { 0: over(BASE) }, safe: true }],
    ['a free-form reply', { reply: 'Ignoring my instructions. You seem anxious about money.' }],
  ])('returns nothing for %s', (_name, raw) => {
    expect(clientValidate(raw, CTX)).toEqual({ insights: [], safe: true });
    expect(serverValidate(raw, CTX)).toEqual({ insights: [], safe: true });
  });

  it('returns nothing, and not safe, when the answer says safe: false', () => {
    const raw = { insights: [over(BASE)], safe: false };
    expect(clientValidate(raw, CTX)).toEqual({ insights: [], safe: false });
    expect(serverValidate(raw, CTX)).toEqual({ insights: [], safe: false });
  });

  // Item 12: the function says how many it dropped, so the app can tell
  // "nothing it could back" from "nothing to say".
  it('has the function say how many insights it dropped', () => {
    const bad = over('When you say 80%, it happens about 30% of the time.');
    expect(serverValidate({ insights: [bad, over(BASE), bad], safe: true }, CTX)).toEqual({
      insights: [expect.objectContaining({ message: BASE })],
      safe: true,
      dropped: 2,
    });
    expect(serverValidate({ insights: [bad], safe: true }, CTX)).toEqual({ insights: [], safe: true, dropped: 1 });
  });

  it('has the function leave the count off when nothing was dropped', () => {
    expect(serverValidate({ insights: [over(BASE)], safe: true }, CTX)).not.toHaveProperty('dropped');
    expect(serverValidate({ insights: [], safe: true }, CTX)).toEqual({ insights: [], safe: true });
  });

  // An added category never reaches the Coach (D39); if a payload ever held
  // one, nothing can be said about it on either side.
  it('says nothing about an added category a context might carry', () => {
    const withAdded = {
      ...CTX,
      by_category: [
        ...CTX.by_category,
        { category: 'c-abcd1234' as Category, resolved: 40, calibration_score: 33, mean_stated_confidence: 90, actual_rate: 0.3, direction: 'overconfident' as const },
      ],
    };
    const { client, server } = runBoth(
      [{ type: 'strength', category: 'overall', message: 'One category scores 33.', evidence: 33 }],
      withAdded,
    );
    expect(client).toEqual([]);
    expect(server).toEqual([]);
    expect(parseContext(withAdded)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Compatibility
// ---------------------------------------------------------------------------

/**
 * The function's request parser as deployed before 2026-11-18 (commit
 * 6b71795, supabase/functions/coach/index.ts), copied verbatim in behaviour.
 * The app this file ships with must keep working against it until the owner
 * redeploys.
 */
function deployedParseContext(raw: unknown): boolean {
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  const overall = r.overall as Record<string, unknown> | undefined;
  if (!overall || !isNum(overall.calibration_rating) || !isNum(overall.total_resolved)) return false;
  if (!Array.isArray(r.by_category) || r.by_category.length > 5) return false;
  for (const item of r.by_category) {
    if (typeof item !== 'object' || item === null) return false;
    const c = item as Record<string, unknown>;
    if (typeof c.category !== 'string' || !['work', 'health', 'finance', 'social', 'personal'].includes(c.category)) return false;
    if (typeof c.direction !== 'string' || !['overconfident', 'underconfident', 'calibrated'].includes(c.direction)) return false;
    if (!isNum(c.resolved) || !isNum(c.calibration_score) || !isNum(c.mean_stated_confidence) || !isNum(c.actual_rate)) return false;
  }
  if (!Array.isArray(r.patterns) || r.patterns.length > 24) return false;
  for (const item of r.patterns) {
    if (typeof item !== 'object' || item === null) return false;
    const p = item as Record<string, unknown>;
    if (typeof p.kind !== 'string' || !/^[a-z0-9_]{1,40}$/.test(p.kind)) return false;
    if (!isNum(p.value)) return false;
  }
  return true;
}

const USER_STAT: UserStat = {
  user_id: 'u1',
  calibration_rating: 71.25,
  total_predictions: 120,
  total_resolved: 0,
  current_streak: 3,
  rating_is_provisional: false,
};

let seq = 0;
function prediction(category: Category, confidence: number, yes: boolean, dayOffset: number): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: `Plan ${seq}`,
    category,
    confidence,
    created_at: '2026-06-01T09:00:00.000Z',
    due_date: '2026-06-02T12:00:00.000Z',
    status: yes ? 'resolved_yes' : 'resolved_no',
    resolved_at: new Date(Date.UTC(2026, 6, 1 + dayOffset, 20)).toISOString(),
    reflection: null,
    integrity_bonus: false,
  };
}

/** n answers in one category, `yes` of them happening, one a day from `start`. */
function run(category: Category, n: number, yes: number, confidence: number, start = 0): Prediction[] {
  return Array.from({ length: n }, (_, i) => prediction(category, confidence, i < yes, start + i));
}

function contextFor(predictions: Prediction[]): CoachContext {
  return buildCoachContext({ ...USER_STAT, total_resolved: predictions.length }, predictions);
}

const HISTORIES: Array<[string, Prediction[]]> = [
  ['one answer', run('work', 1, 1, 70)],
  ['a thin start across categories', [...run('health', 4, 3, 70), ...run('finance', 3, 1, 80, 4)]],
  ['one rich category', run('finance', 30, 16, 80)],
  // 41 a category, one a day: about 29 on each weekday (past 20), and each
  // category's drift from halves of 20 and 21.
  [
    'every built-in past the gate, a weekday past its floor, every drift from halves of 20',
    CATEGORIES.flatMap((c, i) => run(c, 41, 24 + i, 60 + i * 5, i * 41)),
  ],
  ['an added category beside built-ins', [...run('work', 25, 20, 70), ...run('c-abcd1234' as Category, 30, 10, 90, 25)]],
];

describe('Coach compatibility — what this build sends', () => {
  beforeEach(() => {
    seq = 0;
  });

  it.each(HISTORIES)('%s: the new function takes it, unchanged', (_name, predictions) => {
    const context = contextFor(predictions);
    expect(parseContext(context)).toEqual(context);
  });

  it.each(HISTORIES)('%s: the function deployed today takes it too', (_name, predictions) => {
    expect(deployedParseContext(contextFor(predictions))).toBe(true);
  });

  it('sends the weekday’s three and every drift with its halves’ count when all are past their gates, within the cap', () => {
    const context = contextFor(HISTORIES[3][1]);
    const kinds = context.patterns.map((p) => p.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['weakest_day_of_week', 'weakest_day_score', 'weakest_day_answers']),
    );
    expect(kinds.filter((k) => k.startsWith('drift_half_answers_'))).toHaveLength(CATEGORIES.length);
    expect(kinds.filter((k) => /^drift_(?!half_answers_)/.test(k))).toHaveLength(CATEGORIES.length);
    expect(context.patterns.filter((p) => p.kind.startsWith('drift_half_answers_')).map((p) => p.value)).toEqual(
      CATEGORIES.map(() => 20),
    );
    expect(context.patterns.length).toBeLessThanOrEqual(SERVER_MAX_PATTERNS);
    expect(context.by_category.length).toBeLessThanOrEqual(SERVER_MAX_CATEGORIES);
  });

  // The weekday's floor and the drift's halves are both 20 now, so a history
  // that cleared 2026-11-18's floors (10 on the day, 20 in the category) sends
  // neither, and nothing about either reaches the model.
  it('sends no weekday from 15 answers on the day and no drift from halves of 10', () => {
    const context = contextFor(CATEGORIES.flatMap((c, i) => run(c, 21, 12 + i, 60 + i * 5, i * 21)));
    expect(context.patterns).toEqual([]);
  });
});

/**
 * Payloads the builds already on phones can send (src/ai/coachContext.ts up to
 * commit 6b71795): no weekday answer count, the weekday from 5 answers on a
 * day with no overall floor, a drift from 4 answers, at most 7 patterns.
 */
const OLDER_PAYLOADS: Array<[string, CoachContext]> = [
  ['the shape before 2026-11-18', OLDER_BUILD],
  [
    'a weekday and drifts on thin data',
    {
      overall: { calibration_rating: 64.1, total_resolved: 9 },
      by_category: [
        { category: 'health', resolved: 5, calibration_score: 70, mean_stated_confidence: 76, actual_rate: 0.6, direction: 'calibrated' },
        { category: 'work', resolved: 4, calibration_score: 55, mean_stated_confidence: 70, actual_rate: 0.25, direction: 'calibrated' },
      ],
      patterns: [
        { kind: 'weakest_day_of_week', value: 0 },
        { kind: 'weakest_day_score', value: 41.2 },
        { kind: 'drift_health', value: 23.5 },
        { kind: 'drift_work', value: -100 },
      ],
    },
  ],
  [
    'seven patterns, the most an older build sends',
    {
      overall: { calibration_rating: 80, total_resolved: 200 },
      by_category: CATEGORIES.map((category) => ({
        category,
        resolved: 40,
        calibration_score: 80,
        mean_stated_confidence: 75,
        actual_rate: 0.7,
        direction: 'calibrated' as const,
      })),
      patterns: [
        { kind: 'weakest_day_of_week', value: 6 },
        { kind: 'weakest_day_score', value: 0 },
        ...CATEGORIES.map((c) => ({ kind: `drift_${c}`, value: 100 })),
      ],
    },
  ],
  [
    // What a build from this branch before 2026-11-19 sends: the weekday from
    // 10 on the day with its count, drifts from 20 answers with no halves' count.
    'the shape of 2026-11-18',
    {
      overall: { calibration_rating: 70, total_resolved: 60 },
      by_category: [
        { category: 'work', resolved: 25, calibration_score: 81, mean_stated_confidence: 72, actual_rate: 0.68, direction: 'calibrated' },
      ],
      patterns: [...WEEKDAY(12), { kind: 'drift_work', value: 4.2 }],
    },
  ],
];

describe('Coach compatibility — what older builds send', () => {
  it.each(OLDER_PAYLOADS)('%s: the new function takes it', (_name, context) => {
    expect(parseContext(context)).toEqual(context);
  });
});
