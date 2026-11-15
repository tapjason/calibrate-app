import { __setTimeZoneForTests } from '@/engine/localTime';
import { isSameDayAnswer } from '@/engine/sameDay';
import { CATEGORY_NAME_MAX } from '@/store/categoryStore';
import { isCategory, MIN_N_CATEGORY, MIN_N_OVERALL, type Prediction } from '@/types';

import { buildProfile, PLAYTEST_PROFILES, type ProfileId } from './playtestProfiles';

const NOW = new Date('2026-11-12T15:00:00.000Z');
const ids = PLAYTEST_PROFILES.map((p) => p.id);

const scored = (rows: Prediction[]) =>
  rows.filter(
    (p) => (p.status === 'resolved_yes' || p.status === 'resolved_no') && !isSameDayAnswer(p),
  );
const open = (rows: Prediction[]) => rows.filter((p) => p.status === 'pending');
const dueBeforeToday = (p: Prediction) => {
  const start = new Date(NOW);
  start.setHours(0, 0, 0, 0);
  return new Date(p.due_date) < start;
};

describe.each(ids)('profile %s', (id: ProfileId) => {
  const { predictions, categories } = buildProfile(id, 'local-guest', NOW);

  it('is the same on every load, with ids unique to the load', () => {
    expect(buildProfile(id, 'local-guest', NOW)).toEqual({ predictions, categories });
    const again = buildProfile(id, 'local-guest', NOW, 'other');
    expect(again.predictions.map((p) => p.title)).toEqual(predictions.map((p) => p.title));
    const first = new Set(predictions.map((p) => p.id));
    expect(again.predictions.some((p) => first.has(p.id))).toBe(false);
  });

  it('writes rows the app itself would accept', () => {
    expect(new Set(predictions.map((p) => p.id)).size).toBe(predictions.length);
    for (const p of predictions) {
      expect(isCategory(p.category)).toBe(true);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.title.length).toBeLessThanOrEqual(200);
      expect((p.reflection ?? '').length).toBeLessThanOrEqual(500);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(100);
      expect(new Date(p.created_at).getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (p.resolved_at) {
        expect(new Date(p.resolved_at).getTime()).toBeLessThanOrEqual(NOW.getTime());
        expect(new Date(p.resolved_at).getTime()).toBeGreaterThanOrEqual(
          new Date(p.created_at).getTime(),
        );
      }
    }
    for (const c of categories) {
      expect(isCategory(c.id)).toBe(true);
      expect((c.name ?? '').length).toBeLessThanOrEqual(CATEGORY_NAME_MAX);
    }
  });
});

describe('a repeated title keeps one category', () => {
  // Except the stress profile, which mixes them on purpose.
  it.each(ids.filter((id) => id !== 'stress'))('%s', (id) => {
    const seen = new Map<string, string>();
    for (const p of buildProfile(id, 'local-guest', NOW).predictions) {
      expect(seen.get(p.title) ?? p.category).toBe(p.category);
      seen.set(p.title, p.category);
    }
  });
});

// The days must be calendar days wherever the phone is: loaded at 23:55 a
// week after an autumn clock change, 24-hour blocks put a walk logged the
// evening before onto its due day, so it read "not scored" (pre-push review,
// 2026-11-12).
describe('across a clock change, late in the evening', () => {
  afterEach(() => __setTimeZoneForTests(null));

  // The first weeks and threshold hold one same-day answer on purpose.
  it.each(ids.filter((id) => !id.startsWith('first-week') && id !== 'threshold'))(
    '%s has no answer on the day it was logged',
    (id) => {
      __setTimeZoneForTests('America/Chicago');
      // 23:55 on Thu, Nov 12 in Chicago (CST, UTC−6); the clocks went back on Nov 1.
      const lateEvening = new Date('2026-11-13T05:55:00.000Z');
      const rows = buildProfile(id, 'local-guest', lateEvening).predictions;
      expect(rows.filter(isSameDayAnswer)).toEqual([]);
    },
  );
});

describe('what each profile is for', () => {
  const get = (id: ProfileId) => buildProfile(id, 'local-guest', NOW);

  it('day1: nothing answered, the first one due today', () => {
    const { predictions } = get('day1');
    expect(scored(predictions)).toHaveLength(0);
    expect(open(predictions).some((p) => !dueBeforeToday(p) && new Date(p.due_date) <= NOW)).toBe(
      true,
    );
  });

  it('first-week: a Can’t tell and a same-day answer that isn’t scored', () => {
    const { predictions, categories } = get('first-week');
    expect(predictions.filter((p) => p.status === 'skipped')).toHaveLength(1);
    expect(predictions.filter(isSameDayAnswer)).toHaveLength(1);
    expect(categories[0]).toMatchObject({ id: 'social', name: 'Running club' });
  });

  // Round 23: the same week in a pupil's and a retiree's life.
  it.each([
    ['first-week-school', 'work', 'School'],
    ['first-week-retired', 'social', 'Walking group'],
  ] as const)('%s: the first week’s shape, in its own words', (id, renamed, name) => {
    const week = get('first-week').predictions;
    const { predictions, categories } = get(id);
    expect(predictions.map((p) => [p.status, p.confidence, p.due_date, p.created_at])).toEqual(
      week.map((p) => [p.status, p.confidence, p.due_date, p.created_at]),
    );
    expect(predictions.filter(isSameDayAnswer)).toHaveLength(1);
    expect(predictions.some((p) => week.some((w) => w.title === p.title))).toBe(false);
    expect(categories).toEqual([expect.objectContaining({ id: renamed, name })]);
    expect(predictions.some((p) => p.category === renamed)).toBe(true);
  });

  it('habit: every daily answer is scored, logged the evening before, with misses at 90%', () => {
    const answered = get('habit').predictions.filter((p) => p.status !== 'pending');
    expect(answered.length).toBeGreaterThanOrEqual(21);
    expect(answered.filter(isSameDayAnswer)).toHaveLength(0);
    const walks = answered.filter((p) => p.title === 'I walk 30 minutes today');
    expect(walks.filter((p) => p.status === 'resolved_yes')).toHaveLength(16);
    expect(walks).toHaveLength(21);
  });

  it('return: several came due while away, nothing in the last three weeks', () => {
    const { predictions } = get('return');
    // The summary on /dev/seed says six.
    expect(open(predictions).filter(dueBeforeToday)).toHaveLength(6);
    const latest = Math.max(...predictions.map((p) => new Date(p.created_at).getTime()));
    expect(NOW.getTime() - latest).toBeGreaterThan(21 * 24 * 3600e3);
  });

  it('threshold: one scored answer short of both bars, the crossing one due today', () => {
    const { predictions } = get('threshold');
    const s = scored(predictions);
    expect(s).toHaveLength(MIN_N_OVERALL - 1);
    expect(s.filter((p) => p.category === 'health')).toHaveLength(MIN_N_CATEGORY - 1);
    expect(open(predictions).some((p) => p.category === 'health')).toBe(true);
  });

  it('stress: a crowded list at the limits', () => {
    const { predictions, categories } = get('stress');
    const o = open(predictions);
    expect(o).toHaveLength(36);
    expect(o.filter(dueBeforeToday)).toHaveLength(12);
    expect(predictions.some((p) => p.title.length === 200)).toBe(true);
    expect(predictions.some((p) => (p.reflection ?? '').length === 500)).toBe(true);
    expect(predictions.some((p) => p.confidence === 0)).toBe(true);
    expect(predictions.some((p) => p.confidence === 100)).toBe(true);
    expect(categories.filter((c) => c.id.startsWith('c-'))).toHaveLength(8);
    expect(categories.some((c) => (c.name ?? '').length === CATEGORY_NAME_MAX)).toBe(true);
    expect(scored(predictions).length).toBeGreaterThanOrEqual(MIN_N_OVERALL);
  });

  it('years: a thousand days, one answer each', () => {
    expect(scored(get('years').predictions)).toHaveLength(1000);
  });
});
