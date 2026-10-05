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
  };
}

describe('trackRecordLine (roadmap step 19)', () => {
  it("reads the category's own band first", () => {
    expect(trackRecordLine('finance', bucket(60, 12, 7), bucket(60, 52, 30))).toEqual({
      scope: 'category',
      text: 'Your 60–80% calls in finance: 7 of 12 happened.',
    });
  });

  it('falls back to every category while this one is thin', () => {
    expect(trackRecordLine('finance', bucket(60, 4, 1), bucket(60, 52, 30))).toEqual({
      scope: 'overall',
      text: 'Your 60–80% calls: 30 of 52 happened.',
    });
  });

  // The chart title's rule (chartTakeaway): nothing on fewer than 10.
  it('says nothing until a band has ten behind it', () => {
    expect(trackRecordLine('finance', bucket(60, 9, 5), bucket(60, 9, 5))).toBeNull();
    expect(trackRecordLine('finance', null, null)).toBeNull();
  });

  it('reads naturally at the edges', () => {
    expect(trackRecordLine('health', bucket(80, 12, 12), null)?.text).toBe(
      'Your 80–100% calls in health: all 12 happened.',
    );
    expect(trackRecordLine('health', bucket(0, 10, 0), null)?.text).toBe(
      'Your 0–20% calls in health: none of 10 happened.',
    );
  });
});
