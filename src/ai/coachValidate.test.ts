import { MIN_N_CATEGORY, type CoachContext } from '@/types';

import { validateCoachOutput } from './coachValidate';

/**
 * A user with a well-populated finance category (over MIN_N_CATEGORY) and a
 * thin health one, overall past MIN_N_OVERALL. The weekday carries its answer
 * count (24, past WEEKDAY_MIN_N), as the app sends it from 2026-11-18. It was
 * 12 until the weekday's floor rose from 10 to 20 (2026-11-19).
 */
const CONTEXT: CoachContext = {
  overall: { calibration_rating: 72, total_resolved: 40 },
  by_category: [
    {
      category: 'finance',
      resolved: 25,
      calibration_score: 61,
      mean_stated_confidence: 80,
      actual_rate: 0.55,
      direction: 'overconfident',
    },
    {
      category: 'health',
      resolved: 3,
      calibration_score: 90,
      mean_stated_confidence: 70,
      actual_rate: 0.67,
      direction: 'calibrated',
    },
  ],
  patterns: [
    { kind: 'weakest_day_of_week', value: 1 },
    { kind: 'weakest_day_score', value: 58 },
    { kind: 'weakest_day_answers', value: 24 },
  ],
};

const GOOD_INSIGHT = {
  type: 'overconfidence',
  category: 'finance',
  message:
    'Your finance predictions run overconfident — 80% stated against a 55% hit rate.',
  evidence: 80,
};

describe('validateCoachOutput — shape', () => {
  it('rejects anything that is not an object', () => {
    for (const raw of [null, undefined, 'text', 42, []]) {
      expect(validateCoachOutput(raw, CONTEXT)).toEqual({
        insights: [],
        safe: true,
      });
    }
  });

  it('rejects a payload with no insights array', () => {
    expect(validateCoachOutput({ safe: true }, CONTEXT).insights).toEqual([]);
  });

  it('accepts a well-formed grounded insight', () => {
    const out = validateCoachOutput(
      { insights: [GOOD_INSIGHT], safe: true },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
    expect(out.insights[0].category).toBe('finance');
  });

  it('caps the response at three insights', () => {
    const out = validateCoachOutput(
      { insights: Array(6).fill(GOOD_INSIGHT), safe: true },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(3);
  });

  it('drops insights with an unknown type or category', () => {
    const out = validateCoachOutput(
      {
        insights: [
          { ...GOOD_INSIGHT, type: 'diagnosis' },
          { ...GOOD_INSIGHT, category: 'romance' },
          GOOD_INSIGHT,
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
  });

  it('drops insights with a missing, empty, or overlong message', () => {
    const out = validateCoachOutput(
      {
        insights: [
          { ...GOOD_INSIGHT, message: '' },
          { ...GOOD_INSIGHT, message: '   ' },
          { ...GOOD_INSIGHT, message: 'x'.repeat(241) },
          { ...GOOD_INSIGHT, message: undefined },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  // Until 2026-11-18 the kept suggestion here was "Try shading finance calls
  // down by 15." — a figure the context doesn't hold, accepted because only
  // `evidence` was checked (security review, finding 2). It now drops the
  // insight (below); the kept one carries no number.
  it('keeps a valid suggestion and drops a malformed one without losing the insight', () => {
    const out = validateCoachOutput(
      {
        insights: [
          { ...GOOD_INSIGHT, suggestion: 'Try shading finance calls down a little.' },
          { ...GOOD_INSIGHT, suggestion: 42 },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(2);
    expect(out.insights[0].suggestion).toBe('Try shading finance calls down a little.');
    expect(out.insights[1].suggestion).toBeUndefined();
  });

  it('drops the insight when its suggestion invents a figure', () => {
    const out = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, suggestion: 'Try shading finance calls down by 15.' }], safe: true },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  it('keeps an over-long suggestion out without losing the insight', () => {
    const out = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, suggestion: 'y'.repeat(241) }], safe: true },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
    expect(out.insights[0].suggestion).toBeUndefined();
  });
});

// COACH_AGENT.md §9 — Grounding: the tempting claim that the numbers do not
// support must not survive.
describe('validateCoachOutput — grounding', () => {
  it('drops an insight citing a number that is not in the context', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            ...GOOD_INSIGHT,
            message: 'You are right 91% of the time in finance.',
            evidence: 91,
          },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  it('drops a non-numeric or non-finite evidence value', () => {
    const out = validateCoachOutput(
      {
        insights: [
          { ...GOOD_INSIGHT, evidence: '80' },
          { ...GOOD_INSIGHT, evidence: Number.NaN },
          { ...GOOD_INSIGHT, evidence: Number.POSITIVE_INFINITY },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  // The tolerance is per-scale. A flat 0.5 applied to a 0-1 rate is a
  // +/-50-percentage-point window, which grounds almost any fabricated rate.
  it('rejects a fabricated rate that a flat 0.5 tolerance would have admitted', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'strength',
            category: 'finance',
            message: 'You hit 90% of your finance calls.',
            evidence: 0.9, // actual_rate is 0.55; |0.55 - 0.9| = 0.35
          },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  it('still absorbs rounding within the rate scale', () => {
    const out = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, evidence: 0.552 }], safe: true },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
  });

  it('accepts a rate cited either as a fraction or a percentage', () => {
    const asFraction = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, evidence: 0.55 }], safe: true },
      CONTEXT,
    );
    const asPercent = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, evidence: 55 }], safe: true },
      CONTEXT,
    );
    expect(asFraction.insights).toHaveLength(1);
    expect(asPercent.insights).toHaveLength(1);
  });

  it('absorbs rounding of a fractional figure but not invention', () => {
    // A real score is rarely a round number; the model reports it rounded.
    const fractional: CoachContext = {
      ...CONTEXT,
      by_category: [{ ...CONTEXT.by_category[0], calibration_score: 61.37 }],
    };

    const rounded = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, evidence: 61 }], safe: true },
      fractional,
    );
    const invented = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, evidence: 64 }], safe: true },
      fractional,
    );
    expect(rounded.insights).toHaveLength(1);
    expect(invented.insights).toEqual([]);
  });

  // Tolerance exists to absorb rounding, and an integer has none to absorb.
  // Granting integers ±0.5 is what let a fabricated 0.9 hit rate ground itself
  // against an unrelated weekday index of 1.
  it('requires an exact citation of an integer figure', () => {
    const off = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, evidence: 61.4 }], safe: true },
      CONTEXT, // calibration_score is exactly 61
    );
    const exact = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, evidence: 61 }], safe: true },
      CONTEXT,
    );
    expect(off.insights).toEqual([]);
    expect(exact.insights).toHaveLength(1);
  });

  it('can cite a deterministic pattern value', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'pattern',
            category: 'overall',
            message: 'Your Monday resolutions calibrate worst, at 58.',
            evidence: 58,
          },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
  });

  it('keeps the grounded insights and drops only the ungrounded ones', () => {
    const out = validateCoachOutput(
      {
        insights: [
          { ...GOOD_INSIGHT, evidence: 999 },
          GOOD_INSIGHT,
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
    expect(out.insights[0].evidence).toBe(80);
  });
});

// COACH_AGENT.md §9 — Min-N: an n=3 category earns "keep logging", not a verdict.
describe('validateCoachOutput — minimum N', () => {
  it('drops a verdict about a category below MIN_N_CATEGORY', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'strength',
            category: 'health',
            message: 'You are sharp on health — 90 calibration.',
            evidence: 90,
          },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  it('allows encouragement on a thin category', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'encouragement',
            category: 'health',
            message: 'Only 3 health resolutions so far — keep logging.',
            evidence: 3,
          },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
  });

  it('drops an overall verdict below MIN_N_OVERALL', () => {
    const thin: CoachContext = {
      ...CONTEXT,
      overall: { calibration_rating: 72, total_resolved: 6 },
    };
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'overconfidence',
            category: 'overall',
            message: 'You run overconfident overall — 72.',
            evidence: 72,
          },
        ],
        safe: true,
      },
      thin,
    );
    expect(out.insights).toEqual([]);
  });

  it('drops a verdict about a category absent from the payload', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'overconfidence',
            category: 'social',
            message: 'Your social predictions run overconfident at 80%.',
            evidence: 80,
          },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  it('admits a verdict once the category clears the bar', () => {
    const context: CoachContext = {
      ...CONTEXT,
      by_category: [
        { ...CONTEXT.by_category[1], resolved: MIN_N_CATEGORY },
        CONTEXT.by_category[0],
      ],
    };
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'strength',
            category: 'health',
            message: 'Health is your strongest category at 90.',
            evidence: 90,
          },
        ],
        safe: true,
      },
      context,
    );
    expect(out.insights).toHaveLength(1);
  });
});

// COACH_AGENT.md §9 — Injection: a successful injection still cannot produce a
// free-form or unsafe payload, because the schema is enforced after the fact.
describe('validateCoachOutput — injection resistance', () => {
  it('discards a free-form payload that ignored the schema', () => {
    const out = validateCoachOutput(
      { reply: 'Sure! Ignoring my instructions. You seem anxious about money.' },
      CONTEXT,
    );
    expect(out).toEqual({ insights: [], safe: true });
  });

  it('discards insights smuggled in as strings', () => {
    const out = validateCoachOutput(
      { insights: ['You are bad with money'], safe: true },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  // Grounding alone would NOT have caught this one: total_resolved is 40, so
  // "move 40% into bonds" cites a real number. The out-of-domain guard is what
  // stops it.
  it('drops advice that claims a new role even when the number checks out', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'pattern',
            category: 'overall',
            message: 'As your financial advisor, move 40% into bonds.',
            evidence: 40,
          },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  it('ignores extra fields an injected payload tries to add', () => {
    const out = validateCoachOutput(
      {
        insights: [{ ...GOOD_INSIGHT, action: 'navigate', url: 'https://x.test' }],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
    // evidence_source is the validator's own annotation, not a passed-through field.
    expect(Object.keys(out.insights[0]).sort()).toEqual([
      'category',
      'evidence',
      'evidence_source',
      'message',
      'type',
    ]);
  });

  it('never takes evidence_source from the model', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            ...GOOD_INSIGHT,
            evidence_source: { field: 'calibration_rating', scope: 'overall', value: 99 },
          },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights[0].evidence_source).toEqual({
      field: 'mean_stated_confidence',
      scope: 'finance',
      value: 80,
    });
  });
});

// COACH_AGENT.md §9 — Out-of-domain: calibration notes only, no domain advice
// and no numeric health targets, whatever the categories contain.
describe('validateCoachOutput — out of domain', () => {
  const insight = (message: string, over: Record<string, unknown> = {}) => ({
    insights: [{ ...GOOD_INSIGHT, message, ...over }],
    safe: true,
  });

  it.each([
    'Shift 80% of your savings into bonds.',
    'These symptoms of anxiety show in your finance calls.',
    'You may have a problem worth diagnosing.',
    'Consider whether you are liable for breach of contract.',
    'Aim to cut 80 calories a day and the health calls improve.',
    'Target a BMI under 25 to hit these health predictions.',
  ])('drops domain advice: %s', (message) => {
    expect(validateCoachOutput(insight(message), CONTEXT).insights).toEqual([]);
  });

  it('drops domain advice hidden in the suggestion field', () => {
    const out = validateCoachOutput(
      insight('Your finance calls run overconfident.', {
        suggestion: 'Move 80% into index funds.',
      }),
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  // The suggestion was "Try stating finance calls 15 points lower." until
  // 2026-11-18: 15 is in no figure (security review, finding 2), so that one
  // now drops the insight, and the kept note carries no invented number.
  it('keeps a calibration note about a sensitive category', () => {
    const out = validateCoachOutput(
      insight(
        'Your finance predictions run overconfident — 80% stated, 55% actual.',
        { suggestion: 'Try stating finance calls lower when you feel very sure. Not a substitute for professional advice.' },
      ),
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
  });

  it('drops a calibration note whose suggestion invents a gap', () => {
    const out = validateCoachOutput(
      insight('Your finance predictions run overconfident — 80% stated, 55% actual.', {
        suggestion: 'Try stating finance calls 15 points lower.',
      }),
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });

  // The sentence here was "You resolved 80 percent of what you logged in
  // finance." until 2026-11-19, and it was kept: 80 is finance's mean stated
  // confidence, which that sentence calls a share resolved (Coach re-review,
  // item 1: a number is the kind its words name). It now drops (below), and
  // the kept sentence names 80 as what was said.
  it('does not trip on ordinary calibration language containing numbers', () => {
    const out = validateCoachOutput(insight('You said 80 percent on average in finance.'), CONTEXT);
    expect(out.insights).toHaveLength(1);
  });

  it('drops a number its words call something it is not', () => {
    const out = validateCoachOutput(
      insight('You resolved 80 percent of what you logged in finance.'),
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });
});

// COACH_AGENT.md §5.5 — the crisis path suppresses everything.
describe('validateCoachOutput — crisis path', () => {
  it('returns no insights when the response is marked unsafe', () => {
    const out = validateCoachOutput(
      { insights: [GOOD_INSIGHT], safe: false },
      CONTEXT,
    );
    expect(out).toEqual({ insights: [], safe: false });
  });
});

// DESIGN_SYSTEM §7.13: the card leads with the evidence number and says what
// it counts. The validator names the figure it matched — or nothing, when the
// number could be more than one thing.
describe('validateCoachOutput — evidence source', () => {
  const sourceOf = (over: Record<string, unknown>) =>
    validateCoachOutput({ insights: [{ ...GOOD_INSIGHT, ...over }], safe: true }, CONTEXT)
      .insights[0]?.evidence_source;

  it('names the figure in the insight’s own category', () => {
    expect(sourceOf({ evidence: 25 })).toEqual({
      field: 'resolved',
      scope: 'finance',
      value: 25,
    });
  });

  it('reads a percentage citation as the 0–1 rate it came from', () => {
    expect(sourceOf({ evidence: 55 })).toEqual({
      field: 'actual_rate',
      scope: 'finance',
      value: 0.55,
    });
    expect(sourceOf({ evidence: 0.55 })?.field).toBe('actual_rate');
  });

  it('names overall figures and patterns for an overall insight', () => {
    expect(sourceOf({ type: 'pattern', category: 'overall', evidence: 40 })).toEqual({
      field: 'total_resolved',
      scope: 'overall',
      value: 40,
    });
    expect(sourceOf({ type: 'pattern', category: 'overall', evidence: 58 })).toEqual({
      field: 'pattern',
      scope: 'overall',
      value: 58,
      kind: 'weakest_day_score',
    });
  });

  it('claims no source when the number fits two figures', () => {
    const ambiguous: CoachContext = {
      ...CONTEXT,
      by_category: [{ ...CONTEXT.by_category[0], resolved: 61 }],
    };
    const out = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, evidence: 61 }], safe: true },
      ambiguous,
    );
    // Still grounded and still shown — just without a receipt line.
    expect(out.insights).toHaveLength(1);
    expect(out.insights[0].evidence_source).toBeUndefined();
  });

  // Security review 2026-11-18, finding 4: the weekday index is a day, not a
  // figure, so it grounds nothing and is never a receipt.
  it('never names the weekday index as a source', () => {
    const out = validateCoachOutput(
      {
        insights: [
          { type: 'pattern', category: 'overall', message: 'Mondays calibrate worst.', evidence: 1 },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });
});

// The words are checked as they render (NFKC), and shown as they were checked.
describe('validateCoachOutput — normalised text', () => {
  it('returns the message as checked: fullwidth digits read and shown as plain digits', () => {
    const out = validateCoachOutput(
      {
        insights: [
          { ...GOOD_INSIGHT, message: 'Your finance predictions run overconfident — ８０% stated.' },
        ],
        safe: true,
      },
      CONTEXT,
    );
    expect(out.insights).toHaveLength(1);
    expect(out.insights[0].message).toBe('Your finance predictions run overconfident — 80% stated.');
  });

  it('checks a fullwidth figure like any other: an invented one drops the insight', () => {
    const out = validateCoachOutput(
      { insights: [{ ...GOOD_INSIGHT, message: 'Finance runs overconfident: ３０% happened.' }], safe: true },
      CONTEXT,
    );
    expect(out.insights).toEqual([]);
  });
});

// Item 14 (2026-11-19): a runtime without NFKC used to drop every card. It
// now checks the raw text, held to plain ASCII, which NFKC would leave as it
// is. The validator checks for NFKC once, when it loads, so each case loads a
// fresh copy with String.prototype.normalize changed first.
describe('validateCoachOutput — without NFKC', () => {
  const original = Object.getOwnPropertyDescriptor(String.prototype, 'normalize')!;
  afterEach(() => Object.defineProperty(String.prototype, 'normalize', original));

  function validatorWith(normalize: unknown): typeof validateCoachOutput {
    Object.defineProperty(String.prototype, 'normalize', { ...original, value: normalize });
    let fresh: typeof validateCoachOutput | undefined;
    jest.isolateModules(() => {
      fresh = (require('./coachValidate') as typeof import('./coachValidate')).validateCoachOutput;
    });
    return fresh!;
  }

  const ascii = { ...GOOD_INSIGHT, message: 'Your finance predictions run overconfident: 80% stated against a 55% hit rate.' };
  const run = (validate: typeof validateCoachOutput, message: string) =>
    validate({ insights: [{ ...ascii, message }], safe: true }, CONTEXT).insights;

  it.each([
    ['missing', undefined],
    ['throwing', () => {
      throw new RangeError('no ICU');
    }],
    ['returning its input unchanged', function (this: string) {
      return String(this);
    }],
  ])('keeps a plain-ASCII card when normalize is %s', (_name, normalize) => {
    const validate = validatorWith(normalize);
    expect(run(validate, ascii.message)).toEqual([expect.objectContaining({ message: ascii.message })]);
  });

  it.each([
    ['a fullwidth digit, which NFKC would have read', 'Finance runs overconfident: ８０% stated.'],
    ['a curly apostrophe, outside ASCII', 'Finance’s calls run overconfident: 80% stated.'],
    ['an em dash, outside ASCII', 'Finance runs overconfident — 80% stated.'],
  ])('drops %s', (_name, message) => {
    const validate = validatorWith(undefined);
    expect(run(validate, message)).toEqual([]);
  });

  it('still drops what the rules drop', () => {
    const validate = validatorWith(undefined);
    expect(run(validate, 'When you say 80%, it happens about 30% of the time.')).toEqual([]);
  });

  it('is the full check again once NFKC is there', () => {
    const validate = validatorWith(original.value);
    expect(run(validate, 'Finance runs overconfident: ８０% stated.')).toEqual([
      expect.objectContaining({ message: 'Finance runs overconfident: 80% stated.' }),
    ]);
  });
});

// A build from before 2026-11-18 sends no weekday answer count, and its
// weekday came from as few as 5 answers on the day: its score is never cited.
describe('validateCoachOutput — a context from an older build', () => {
  const older: CoachContext = {
    ...CONTEXT,
    patterns: [
      { kind: 'weakest_day_of_week', value: 1 },
      { kind: 'weakest_day_score', value: 58 },
    ],
  };

  it('does not cite the weekday score without the day’s count', () => {
    const out = validateCoachOutput(
      {
        insights: [
          {
            type: 'pattern',
            category: 'overall',
            message: 'Your Monday resolutions calibrate worst, at 58.',
            evidence: 58,
          },
        ],
        safe: true,
      },
      older,
    );
    expect(out.insights).toEqual([]);
  });

  it('still takes everything else', () => {
    expect(validateCoachOutput({ insights: [GOOD_INSIGHT], safe: true }, older).insights).toHaveLength(1);
  });
});
