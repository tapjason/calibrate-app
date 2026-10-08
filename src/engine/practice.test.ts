import { PRACTICE_FACTS } from '@/constants/practiceFacts';
import {
  PRACTICE_MIN_N,
  PRACTICE_PER_DAY,
  type PracticeAnswer,
  type PracticeFacts,
  type PracticeQuestion,
} from '@/types';

import {
  MAX_GAP,
  MIN_GAP,
  PRACTICE_KINDS,
  practiceDayTally,
  practiceQuestions,
  scorePractice,
  warmupQuestions,
} from './practice';

// A few hundred days either side of launch, enough to meet every kind often.
const DAYS = Array.from({ length: 1500 }, (_, i) => 20_000 + i);

/** Each table's entries by option label, with the value that decides the answer. */
function lookup(facts: PracticeFacts) {
  const label = (m: { name: string; label?: string }) =>
    m.label ?? m.name.charAt(0).toUpperCase() + m.name.slice(1);
  return {
    north: new Map(facts.places.map((p) => [p.name, p.lat])),
    east: new Map(facts.places.map((p) => [p.name, p.lon])),
    area: new Map(facts.countries.map((m) => [label(m), m.value])),
    height: new Map(facts.mountains.map((m) => [label(m), m.value])),
    size: new Map(facts.bodies.map((m) => [label(m), m.value])),
    first: new Map(facts.events.map((e) => [e.name, -e.year])),
    born: new Map(facts.people.map((p) => [p.name, -p.born])),
    element: new Map(facts.elements.map((e) => [e.name, e.z])),
  };
}

describe('practiceQuestions', () => {
  it('asks three a day, each of a different kind', () => {
    for (const day of DAYS.slice(0, 200)) {
      const qs = practiceQuestions(PRACTICE_FACTS, day);
      expect(qs).toHaveLength(PRACTICE_PER_DAY);
      expect(new Set(qs.map((q) => q.kind)).size).toBe(PRACTICE_PER_DAY);
    }
  });

  it('asks everyone the same three on the same day', () => {
    expect(practiceQuestions(PRACTICE_FACTS, 20_400)).toEqual(practiceQuestions(PRACTICE_FACTS, 20_400));
    expect(practiceQuestions(PRACTICE_FACTS, 20_400)).not.toEqual(practiceQuestions(PRACTICE_FACTS, 20_401));
  });

  it('meets every kind, and both answer positions about equally', () => {
    const all = DAYS.flatMap((d) => practiceQuestions(PRACTICE_FACTS, d));
    for (const kind of PRACTICE_KINDS) {
      expect(all.filter((q) => q.kind === kind).length).toBeGreaterThan(all.length / 16);
    }
    const first = all.filter((q) => q.correctIndex === 0).length / all.length;
    expect(first).toBeGreaterThan(0.45);
    expect(first).toBeLessThan(0.55);
  });

  // Each kind deals from a shuffled deck of every fair pair, so nothing comes
  // back until its deck has gone round: the smallest, the solar system's,
  // lasts most of a year.
  it('asks no pair twice within half a year', () => {
    const pair = (q: PracticeQuestion) => `${q.kind}:${[...q.options].sort().join('|')}`;
    const half = DAYS.slice(0, 183).flatMap((d) => practiceQuestions(PRACTICE_FACTS, d).map(pair));
    expect(new Set(half).size).toBe(half.length);
  });

  // The guarantee that matters: across 1,500 days, every answer agrees with
  // the tables, and every pair differs by more than sources disagree, and by
  // less than a giveaway.
  it('marks the right answer, and only asks about clear differences', () => {
    const values = lookup(PRACTICE_FACTS);
    for (const day of DAYS) {
      for (const q of practiceQuestions(PRACTICE_FACTS, day)) {
        const table = values[q.kind];
        const [a, b] = q.options.map((o) => table.get(o));
        expect([q.id, a, b]).toEqual([q.id, expect.any(Number), expect.any(Number)]);
        const right = q.correctIndex === 0 ? a! : b!;
        const wrong = q.correctIndex === 0 ? b! : a!;
        expect(right).toBeGreaterThan(wrong);
        const gap =
          q.kind === 'area' || q.kind === 'height' || q.kind === 'size' ? right / wrong : right - wrong;
        expect(gap).toBeGreaterThanOrEqual(MIN_GAP[q.kind]);
        expect(gap).toBeLessThanOrEqual(MAX_GAP[q.kind]);
      }
    }
  });

  it('writes the answer key with the right answer first', () => {
    const qs = DAYS.flatMap((d) => practiceQuestions(PRACTICE_FACTS, d));
    for (const q of qs.slice(0, 300)) {
      const right = q.options[q.correctIndex];
      // The fact's first words are the right answer (case aside: "The Sun", "the Sun").
      const named = q.kind === 'first' ? null : right.replace(/ \(.*\)$/, '').toLowerCase();
      if (named) expect(q.fact.toLowerCase().startsWith(named)).toBe(true);
      expect(q.fact).toMatch(/^[A-Z].*\.$/);
      expect(q.fact).not.toMatch(/undefined|NaN|e\+/);
    }
  });

  it('words each kind the way the answer key reads it', () => {
    const facts: PracticeFacts = {
      places: [
        { name: 'Rome', lat: 41.9, lon: 12.5 },
        { name: 'New York', lat: 40.71, lon: -74.01 },
      ],
      countries: [
        { name: 'Spain', value: 505_990 },
        { name: 'the United Kingdom', value: 242_495, label: 'The United Kingdom' },
      ],
      mountains: [],
      bodies: [],
      events: [
        { name: 'The Eiffel Tower opens', said: 'The Eiffel Tower opened in 1889', year: 1889 },
        { name: 'The Statue of Liberty is dedicated', said: 'The Statue of Liberty was dedicated in 1886', year: 1886 },
      ],
      people: [],
      elements: [
        { name: 'Gold', z: 79 },
        { name: 'Tin', z: 50 },
      ],
    };
    const seen = new Map<string, PracticeQuestion>();
    for (const day of DAYS.slice(0, 100)) {
      for (const q of practiceQuestions(facts, day)) seen.set(q.kind, q);
    }
    expect(seen.get('north')).toMatchObject({
      prompt: 'Which is farther north?',
      fact: 'Rome is about 1° farther north than New York (41.9°N against 40.7°N).',
    });
    // 86.5° apart in longitude: too far to be a question.
    expect(seen.has('east')).toBe(false);
    expect(seen.get('area')).toMatchObject({
      prompt: 'Which country is larger?',
      fact: 'Spain covers about 506,000 km², the United Kingdom about 242,000 km².',
    });
    expect(seen.get('area')?.options).toContain('The United Kingdom');
    expect(seen.get('first')?.fact).toBe(
      'The Statue of Liberty was dedicated in 1886; the Eiffel Tower opened in 1889.',
    );
    expect(seen.get('element')?.fact).toBe('Gold is element 79, tin element 50.');
    // Empty tables are skipped, not asked about.
    expect(seen.has('height')).toBe(false);
  });

  it('asks "farther east" only within 30 degrees, so there is one answer', () => {
    const facts: PracticeFacts = {
      places: [
        { name: 'Tokyo', lat: 35.68, lon: 139.69 },
        { name: 'Honolulu', lat: 21.31, lon: -157.86 },
        { name: 'Rome', lat: 41.9, lon: 12.5 },
        { name: 'Madrid', lat: 40.42, lon: -3.7 },
      ],
      countries: [],
      mountains: [],
      bodies: [],
      events: [],
      people: [],
      elements: [],
    };
    const east = DAYS.slice(0, 50)
      .flatMap((d) => practiceQuestions(facts, d))
      .filter((q) => q.kind === 'east');
    expect(east.length).toBeGreaterThan(0);
    for (const q of east) {
      expect([...q.options].sort()).toEqual(['Madrid', 'Rome']);
      expect(q.fact).toBe('Rome is about 16° farther east than Madrid (12.5°E against 3.7°W).');
    }
  });
});

describe('the reference tables', () => {
  const tables = [
    PRACTICE_FACTS.places,
    PRACTICE_FACTS.countries,
    PRACTICE_FACTS.mountains,
    PRACTICE_FACTS.bodies,
    PRACTICE_FACTS.events,
    PRACTICE_FACTS.people,
    PRACTICE_FACTS.elements,
  ];

  it('name each entry once per table', () => {
    for (const table of tables) {
      const names = table.map((e) => e.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('hold plausible values', () => {
    for (const p of PRACTICE_FACTS.places) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
    }
    for (const m of [...PRACTICE_FACTS.countries, ...PRACTICE_FACTS.mountains, ...PRACTICE_FACTS.bodies]) {
      expect(m.value).toBeGreaterThan(0);
    }
    expect(Math.max(...PRACTICE_FACTS.mountains.map((m) => m.value))).toBe(8849);
    for (const e of PRACTICE_FACTS.events) {
      expect(e.said).toContain(e.year < 1000 ? `AD ${e.year}` : String(e.year));
    }
    const zs = PRACTICE_FACTS.elements.map((e) => e.z);
    expect(new Set(zs).size).toBe(zs.length);
  });
});

const answer = (confidence: number, correct: boolean, day = 20_000): PracticeAnswer => ({
  day,
  slot: 0,
  question: {
    id: 'north:a|b',
    kind: 'north',
    prompt: 'Which is farther north?',
    options: ['a', 'b'],
    correctIndex: 0,
    fact: 'A is north of B.',
  },
  picked: correct ? 0 : 1,
  correct,
  confidence,
  answered_at: '2026-10-07T12:00:00.000Z',
});

describe('practiceDayTally', () => {
  it('counts the day in expected and actual', () => {
    expect(practiceDayTally([answer(90, true), answer(70, false), answer(80, true)])).toEqual({
      answered: 3,
      correct: 2,
      expected: expect.closeTo(2.4, 5),
    });
  });
});

describe('scorePractice', () => {
  it('is empty with nothing answered', () => {
    expect(scorePractice([])).toEqual({
      answered: 0,
      correct: 0,
      days: 0,
      mean_confidence: 0,
      accuracy: 0,
      direction: null,
      buckets: [],
    });
  });

  it('gives counts only below the minimum', () => {
    const answers = Array.from({ length: PRACTICE_MIN_N - 1 }, (_, i) => answer(90, i % 2 === 0, 20_000 + (i % 4)));
    expect(scorePractice(answers)).toMatchObject({
      answered: PRACTICE_MIN_N - 1,
      days: 4,
      direction: null,
      buckets: [],
    });
  });

  it('says which way it leans from the minimum, with the chart', () => {
    // 20 at 90%, 12 right: 90% said, 60% right.
    const answers = Array.from({ length: PRACTICE_MIN_N }, (_, i) => answer(90, i < 12));
    const record = scorePractice(answers);
    expect(record).toMatchObject({
      answered: 20,
      correct: 12,
      mean_confidence: 90,
      accuracy: 0.6,
      direction: 'overconfident',
    });
    expect(record.buckets).toHaveLength(1);
    expect(record.buckets[0]).toMatchObject({ low: 80, total_resolved: 20, resolved_yes: 12 });
  });
});

describe('warmupQuestions', () => {
  it('is ten distinct two-way questions, the same every time', () => {
    const qs = warmupQuestions(PRACTICE_FACTS);
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.id)).size).toBe(10);
    expect(warmupQuestions(PRACTICE_FACTS)).toEqual(qs);
    for (const q of qs) {
      expect(q.options).toHaveLength(2);
      expect([0, 1]).toContain(q.correctIndex);
    }
  });

  it('draws the same fair pairs a day of practice does', () => {
    const values = lookup(PRACTICE_FACTS);
    for (const q of warmupQuestions(PRACTICE_FACTS)) {
      const [a, b] = q.options.map((o) => values[q.kind]!.get(o)!);
      expect(a).not.toBe(b);
    }
  });
});
