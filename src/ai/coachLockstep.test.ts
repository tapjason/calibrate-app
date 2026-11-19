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
 * category gate), work has no clear lean, health is thin (4 answers). The
 * weekday carries its answer count. drift_health is what a build before
 * 2026-11-18 sends for a thin category (its drift ran from 4 answers).
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
    { kind: 'weakest_day_answers', value: 12 },
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

const OLDER_BUILD = withPatterns([
  { kind: 'weakest_day_of_week', value: 1 },
  { kind: 'weakest_day_score', value: 58 },
]);
const THIN_DAY = withPatterns([
  { kind: 'weakest_day_of_week', value: 1 },
  { kind: 'weakest_day_score', value: 58 },
  { kind: 'weakest_day_answers', value: 6 },
]);
const THIN_OVERALL_DAY = withPatterns(
  [
    { kind: 'weakest_day_of_week', value: 1 },
    { kind: 'weakest_day_score', value: 58 },
    { kind: 'weakest_day_answers', value: 12 },
  ],
  { calibration_rating: 72.4, total_resolved: 15 },
);
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
    insight: { type: 'pattern', category: 'finance', message: 'Your finance score slipped by 6.5 points from your older answers to your recent ones.', evidence: -6.5 },
  },
  {
    name: 'a positive drift',
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
  {
    name: 'percent written out',
    insight: { type: 'strength', category: 'work', message: 'Work came true 77 percent of the time against 75 percent stated.', evidence: 77 },
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
  { name: 'evidence of the wrong sign for a drift', insight: { type: 'pattern', category: 'finance', message: 'Finance slipped by 6.5 points.', evidence: 6.5 } },

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
    insight: { type: 'pattern', category: 'overall', message: 'Your Monday answers calibrate worst, across 12 answers.', evidence: 12 },
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
  [
    'every built-in past the gate, a weekday past its floor',
    CATEGORIES.flatMap((c, i) => run(c, 21, 12 + i, 60 + i * 5, i * 21)),
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

  it('sends the weekday’s three and every drift when all are past their gates, within the cap', () => {
    const context = contextFor(HISTORIES[3][1]);
    const kinds = context.patterns.map((p) => p.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['weakest_day_of_week', 'weakest_day_score', 'weakest_day_answers']),
    );
    expect(kinds.filter((k) => k.startsWith('drift_'))).toHaveLength(CATEGORIES.length);
    expect(context.by_category.length).toBeLessThanOrEqual(SERVER_MAX_CATEGORIES);
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
];

describe('Coach compatibility — what older builds send', () => {
  it.each(OLDER_PAYLOADS)('%s: the new function takes it', (_name, context) => {
    expect(parseContext(context)).toEqual(context);
  });
});
