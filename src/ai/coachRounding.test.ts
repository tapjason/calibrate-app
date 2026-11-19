// Round 6, item 4 (Coach re-review R11/R12): a whole number the Coach writes
// for a score, a rating, a percentage or a drift must be the one the app
// shows. The card's own receipt (coachReceipt, DESIGN_SYSTEM §7.13) is the
// screen the number sits beside, and it rounds every kind with Math.round,
// as Today (ratingHeadline) and Insights (CategoryBadge) do. Here, for each
// kind and for values on and around a half, the number in the receipt is
// kept by both validators and the numbers one either side of it are dropped.
// A rating of 82.5 shows as 83; the Coach's "82" was kept until round 6.
// Round 7: what the prompt now asks for, every figure with its decimals cut
// after the second, is kept too.

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
  /** Round 7: a value as long as the context sends it (a mean, a share, a difference). */
  long: number;
  context: (value: number) => CoachContext;
  source: (value: number) => CoachEvidenceSource;
  insight: (value: number, written: number | string) => Record<string, unknown>;
  /** The figure copied as the prompt says, before any cut: with every decimal it has. */
  copied: (value: number) => string;
}

/** A 0–1 rate as a percent, the decimal point moved two places on its digits (0.575 is "57.5"). */
function asPercent(rate: number): string {
  const m = /^0\.(\d{2})(\d*)$/.exec(String(rate).padEnd(4, '0'));
  if (m === null) throw new Error(`not a 0–1 rate: ${rate}`);
  return `${Number(m[1])}${m[2] ? `.${m[2]}` : ''}`;
}
/** Cut after the second decimal, as the prompt says (73.3333 is 73.33). */
const cutTwo = (text: string) => text.replace(/(\.\d{2})\d+$/, '$1');

const KINDS: Kind[] = [
  {
    name: 'the rating',
    values: [82.5, 72.49, 72.51, 0.5, 99.5],
    long: 73.33333333333333,
    context: (v) => ({ ...BASE, overall: { calibration_rating: v, total_resolved: 81 } }),
    source: (v) => ({ field: 'calibration_rating', scope: 'overall', value: v }),
    insight: (v, n) => ({ type: 'pattern', category: 'overall', message: `Your rating is ${n} overall.`, evidence: v }),
    copied: (v) => String(v),
  },
  {
    name: 'a category’s score',
    values: [61.5, 61.37, 61.49, 64.5, 0.5],
    long: 82.85714285714286,
    context: (v) => finance({ calibration_score: v }),
    source: (v) => ({ field: 'calibration_score', scope: 'finance', value: v }),
    insight: (v, n) => ({ type: 'strength', category: 'finance', message: `Finance scores ${n}.`, evidence: v }),
    copied: (v) => String(v),
  },
  {
    name: 'the stated confidence',
    values: [80.5, 77.5, 79.49, 64.5],
    long: 73.33333333333333,
    context: (v) => finance({ mean_stated_confidence: v }),
    source: (v) => ({ field: 'mean_stated_confidence', scope: 'finance', value: v }),
    insight: (v, n) => ({ type: 'overconfidence', category: 'finance', message: `You said ${n}% on average in finance.`, evidence: v }),
    copied: (v) => String(v),
  },
  {
    name: 'the hit rate, as a percentage',
    values: [0.575, 0.545, 0.555, 0.775, 0.825, 0.005, 0.3333],
    long: 0.5714285714285714,
    context: (v) => finance({ actual_rate: v }),
    source: (v) => ({ field: 'actual_rate', scope: 'finance', value: v }),
    insight: (v, n) => ({ type: 'overconfidence', category: 'finance', message: `Finance came true ${n}% of the time.`, evidence: v }),
    copied: asPercent,
  },
  {
    name: 'the weekday score',
    values: [58.5, 57.49, 41.5],
    long: 41.66666666666667,
    context: (v) => pattern('weakest_day_score', v),
    source: (v) => ({ field: 'pattern', scope: 'overall', value: v, kind: 'weakest_day_score' }),
    insight: (v, n) => ({ type: 'pattern', category: 'overall', message: `Your Monday answers calibrate worst, at ${n}.`, evidence: v }),
    copied: (v) => String(v),
  },
  {
    name: 'a drift, written by its size with its direction',
    values: [-6.5, 6.5, -2.5, 7.3, -7.5, 1.5],
    long: -6.428571428571431,
    context: (v) => pattern('drift_finance', v),
    source: (v) => ({ field: 'pattern', scope: 'overall', value: v, kind: 'drift_finance' }),
    insight: (v, n) => ({
      type: 'pattern',
      category: 'finance',
      message: `Your finance score ${v > 0 ? 'rose' : 'fell'} ${n} points.`,
      evidence: v,
    }),
    copied: (v) => String(Math.abs(v)),
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

  // Round 7, item 4: the prompt asked for "half up (82.5 is 83)" until now,
  // and a model that followed it on 0.575 (57.49999… stored, shown as 57)
  // was dropped. It now copies every figure with its decimals, cut after the
  // second, never to a whole number (SYSTEM_PROMPT, contract.test.ts). Each
  // figure written that way is kept by both validators.
  it.each([...kind.values, kind.long])('at %p, keeps the figure copied with its decimals, cut after the second', (value) => {
    const written = cutTwo(kind.copied(value));
    expect([written, keeps(kind.context(value), kind.insight(value, written))]).toEqual([written, [1, 1]]);
  });

  // Why the cut: the context sends a mean, a share or a difference as it
  // comes (73.33333333333333), and seven digits in a run read as a phone
  // number, which drops the card.
  it(`drops ${kind.long} copied with all its decimals: seven digits in a run read as a phone number`, () => {
    const whole = kind.copied(kind.long);
    expect(whole.replace(/\D/g, '').length).toBeGreaterThanOrEqual(7);
    expect([whole, keeps(kind.context(kind.long), kind.insight(kind.long, whole))]).toEqual([whole, [0, 0]]);
  });
});
