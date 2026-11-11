import type { BucketStat } from '@/types';

import { trackRecordLine } from './trackRecord';

function bucket(low: number, n: number, yes: number): BucketStat {
  return {
    low,
    high: low === 80 ? 100 : low + 20,
    total_resolved: n,
    resolved_yes: yes,
    stated_confidence_mean: low + 10,
    actual_rate: n === 0 ? 0 : yes / n,
    bucket_error: 0,
    direction: 'calibrated',
    chance_low: 0,
    chance_high: 1,
    expected_yes: 0,
  };
}

describe('trackRecordLine (roadmap step 19)', () => {
  it("reads the category's own band first", () => {
    expect(trackRecordLine('finance', bucket(60, 12, 7), bucket(60, 52, 30))).toEqual({
      scope: 'category',
      text: 'Of your 12 scored finance calls at 60–80%, 7 happened.',
    });
  });

  // Roadmap D29: no category is chosen at first, so the line reads every one.
  it('reads every category while none is chosen', () => {
    expect(trackRecordLine(null, bucket(60, 12, 7), bucket(60, 52, 30))).toEqual({
      scope: 'overall',
      text: 'Of your 52 scored calls at 60–80%, 30 happened.',
    });
  });

  it('falls back to every category while this one is thin', () => {
    expect(trackRecordLine('finance', bucket(60, 4, 1), bucket(60, 52, 30))).toEqual({
      scope: 'overall',
      text: 'Of your 52 scored calls at 60–80%, 30 happened.',
    });
  });

  // Roadmap D57: it was the one line that moved testers' numbers, and it
  // vanished below 10 (blind playtest 2026-11-10, runs 5 and 6).
  it('shows every category from 5, saying it is too few to read', () => {
    expect(trackRecordLine('finance', bucket(40, 3, 1), bucket(40, 9, 4))).toEqual({
      scope: 'overall',
      text: 'Of your 9 scored calls at 40–60%, 4 happened. Too few to read yet.',
    });
    expect(trackRecordLine(null, null, bucket(40, 5, 2))?.text).toBe(
      'Of your 5 scored calls at 40–60%, 2 happened. Too few to read yet.',
    );
  });

  it('says nothing below 5', () => {
    expect(trackRecordLine('finance', bucket(60, 4, 2), bucket(60, 4, 2))).toBeNull();
    expect(trackRecordLine('finance', null, null)).toBeNull();
  });

  it('reads naturally at the edges', () => {
    expect(trackRecordLine('health', bucket(80, 12, 12), null)?.text).toBe(
      'Of your 12 scored health calls at 80–100%, all 12 happened.',
    );
    expect(trackRecordLine('health', bucket(0, 10, 0), null)?.text).toBe(
      'Of your 10 scored health calls at 0–20%, none happened.',
    );
  });
});
