// Round 6, item 4 (Coach re-review R11/R12): a whole number the Coach writes
// for a score, a rating, a percentage or a drift must be the one the app
// shows. The card's own receipt (coachReceipt, DESIGN_SYSTEM §7.13) is the
// screen the number sits beside, and it rounds every kind with Math.round,
// as Today (ratingHeadline) and Insights (CategoryBadge) do. Here, for each
// kind and for values on and around a half, the number in the receipt is
// kept by both validators and the numbers one either side of it are dropped.
// A rating of 82.5 shows as 83; the Coach's "82" was kept until round 6.

import { coachReceipt } from '@/components/stats/coachReceipt';
import type { CoachContext, CoachEvidenceSource } from '@/types';

import { validateOutput as serverValidate } from '../../supabase/functions/coach/contract';

import { validateCoachOutput as clientValidate } from './coachValidate';

const BASE: CoachContext = {
  overall: { calibration_rating: 72.4, total_resolved: 81 },
  by_category: [
    { category: 'finance', resolved: 44, calibration_score: 61.37, mean_stated_confidence: 80, actual_rate: 0.55, direction: 'overconfident' },
  ],
  patterns: [
    { kind: 'weakest_day_of_week', value: 1 },
    { kind: 'weakest_day_score', value: 58 },
    { kind: 'weakest_day_answers', value: 24 },
    { kind: 'drift_finance', value: -6.5 },
    { kind: 'drift_half_answers_finance', value: 22 },
  ],
};

const finance = (change: Partial<CoachContext['by_category'][number]>): CoachContext => ({
  ...BASE,
  by_category: [{ ...BASE.by_category[0], ...change }],
});
const pattern = (kind: string, value: number): CoachContext => ({
  ...BASE,
  patterns: BASE.patterns.map((p) => (p.kind === kind ? { ...p, value } : p)),
});

interface Kind {
  name: string;
  values: number[];
  context: (value: number) => CoachContext;
  source: (value: number) => CoachEvidenceSource;
  insight: (value: number, written: number) => Record<string, unknown>;
}

const KINDS: Kind[] = [
  {
    name: 'the rating',
    values: [82.5, 72.49, 72.51, 0.5, 99.5],
    context: (v) => ({ ...BASE, overall: { calibration_rating: v, total_resolved: 81 } }),
    source: (v) => ({ field: 'calibration_rating', scope: 'overall', value: v }),
    insight: (v, n) => ({ type: 'pattern', category: 'overall', message: `Your rating is ${n} overall.`, evidence: v }),
  },
  {
    name: 'a category’s score',
    values: [61.5, 61.37, 61.49, 64.5, 0.5],
    context: (v) => finance({ calibration_score: v }),
    source: (v) => ({ field: 'calibration_score', scope: 'finance', value: v }),
    insight: (v, n) => ({ type: 'strength', category: 'finance', message: `Finance scores ${n}.`, evidence: v }),
  },
  {
    name: 'the stated confidence',
    values: [80.5, 77.5, 79.49, 64.5],
    context: (v) => finance({ mean_stated_confidence: v }),
    source: (v) => ({ field: 'mean_stated_confidence', scope: 'finance', value: v }),
    insight: (v, n) => ({ type: 'overconfidence', category: 'finance', message: `You said ${n}% on average in finance.`, evidence: v }),
  },
  {
    name: 'the hit rate, as a percentage',
    values: [0.575, 0.545, 0.555, 0.775, 0.825, 0.005, 0.3333],
    context: (v) => finance({ actual_rate: v }),
    source: (v) => ({ field: 'actual_rate', scope: 'finance', value: v }),
    insight: (v, n) => ({ type: 'overconfidence', category: 'finance', message: `Finance came true ${n}% of the time.`, evidence: v }),
  },
  {
    name: 'the weekday score',
    values: [58.5, 57.49, 41.5],
    context: (v) => pattern('weakest_day_score', v),
    source: (v) => ({ field: 'pattern', scope: 'overall', value: v, kind: 'weakest_day_score' }),
    insight: (v, n) => ({ type: 'pattern', category: 'overall', message: `Your Monday answers calibrate worst, at ${n}.`, evidence: v }),
  },
  {
    name: 'a drift, written by its size with its direction',
    values: [-6.5, 6.5, -2.5, 7.3, -7.5, 1.5],
    context: (v) => pattern('drift_finance', v),
    source: (v) => ({ field: 'pattern', scope: 'overall', value: v, kind: 'drift_finance' }),
    insight: (v, n) => ({
      type: 'pattern',
      category: 'finance',
      message: `Your finance score ${v > 0 ? 'rose' : 'fell'} ${n} points.`,
      evidence: v,
    }),
  },
];

const keeps = (context: CoachContext, insight: Record<string, unknown>) => {
  const raw = { insights: [insight], safe: true };
  return [clientValidate(raw, context).insights.length, serverValidate(raw, context).insights.length];
};

describe.each(KINDS)('$name', (kind) => {
  it.each(kind.values)('at %p, keeps the receipt’s number and drops one either side', (value) => {
    const receipt = coachReceipt(kind.source(value));
    const shown = Number(/\d+/.exec(receipt?.figure ?? '')?.[0]);
    expect(Number.isInteger(shown)).toBe(true);
    const context = kind.context(value);
    expect([shown, keeps(context, kind.insight(value, shown))]).toEqual([shown, [1, 1]]);
    for (const off of [shown - 1, shown + 1]) {
      if (off < 0) continue;
      expect([off, keeps(context, kind.insight(value, off))]).toEqual([off, [0, 0]]);
    }
  });
});
