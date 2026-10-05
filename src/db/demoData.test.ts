import { computeCalibration, evaluateBadge } from '@/engine/calibration';
import { classifyDirection } from '@/engine/direction';
import { computeStreak } from '@/engine/streak';
import type { Category, Prediction } from '@/types';
import { MIN_N_CATEGORY, MIN_N_OVERALL } from '@/types';

import { buildDemoPredictions } from './demoData';

const NOW = new Date('2026-10-03T15:00:00.000Z');
const rows = buildDemoPredictions('demo-user', NOW);
const resolved = rows.filter((p) => p.status !== 'pending');
const pending = rows.filter((p) => p.status === 'pending');

function category(c: Category): Prediction[] {
  return resolved.filter((p) => p.category === c);
}

function profile(c: Category) {
  const list = category(c);
  const score = computeCalibration(list).rating;
  const mean = list.reduce((s, p) => s + p.confidence, 0) / list.length;
  const rate = list.filter((p) => p.status === 'resolved_yes').length / list.length;
  return {
    n: list.length,
    score,
    badge: evaluateBadge(list.length, score),
    direction: classifyDirection(mean, rate),
  };
}

describe('buildDemoPredictions', () => {
  it('is deterministic for a given clock', () => {
    expect(buildDemoPredictions('demo-user', NOW)).toEqual(rows);
  });

  it('unlocks the overall rating and every category score', () => {
    expect(resolved.length).toBeGreaterThanOrEqual(Math.max(60, MIN_N_OVERALL));
    for (const c of ['work', 'health', 'finance', 'social', 'personal'] as const) {
      expect(category(c).length).toBeGreaterThanOrEqual(MIN_N_CATEGORY);
    }
  });

  it('reads "Sharp in health, Guesser in finance", with real miscalibration', () => {
    expect(profile('health').badge).toBe('sharp');
    expect(profile('finance').badge).toBe('guesser');
    expect(profile('finance').direction).toBe('overconfident');
    expect(profile('finance').score).toBeLessThan(70);
    expect(profile('work').badge).toBe('forecaster');
    expect(profile('personal').direction).toBe('underconfident');
  });

  it('covers the low confidence ranges, not just the confident half', () => {
    expect(resolved.some((p) => p.confidence < 20)).toBe(true);
    expect(resolved.some((p) => p.confidence >= 20 && p.confidence < 40)).toBe(true);
  });

  it('keeps every date coherent and in the past for resolved rows', () => {
    for (const p of resolved) {
      expect(Date.parse(p.created_at)).toBeLessThan(Date.parse(p.due_date));
      expect(Date.parse(p.resolved_at!)).toBeLessThanOrEqual(NOW.getTime());
    }
    for (const p of pending) {
      expect(p.resolved_at).toBeNull();
      expect(Date.parse(p.created_at)).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('has a live streak ending yesterday', () => {
    expect(computeStreak(resolved, { now: NOW })).toBeGreaterThanOrEqual(6);
  });

  it('leaves some open predictions, including ones ready to resolve', () => {
    expect(pending.length).toBeGreaterThanOrEqual(4);
    expect(pending.some((p) => Date.parse(p.due_date) < NOW.getTime())).toBe(true);
  });

  it('gives unique ids and applies the integrity-bonus rule', () => {
    expect(new Set(rows.map((p) => p.id)).size).toBe(rows.length);
    for (const p of rows) {
      expect(p.integrity_bonus).toBe(p.confidence >= 35 && p.confidence <= 65);
    }
  });
});

// Dates are relative to the seeding day, so a weekday in a title ("by
// Friday") ends up contradicting the due date shown under it.
describe('demo titles', () => {
  it('never name a weekday', () => {
    const weekday = /\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/;
    expect(rows.filter((p) => weekday.test(p.title)).map((p) => p.title)).toEqual([]);
  });
});
