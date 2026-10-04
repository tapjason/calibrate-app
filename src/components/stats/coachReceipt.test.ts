import { coachReceipt } from './coachReceipt';

describe('coachReceipt', () => {
  it('says what each category figure counts', () => {
    expect(coachReceipt({ field: 'resolved', scope: 'finance', value: 25 })).toEqual({
      figure: '25',
      label: 'resolved in finance',
    });
    expect(coachReceipt({ field: 'calibration_score', scope: 'health', value: 71.4 })).toEqual({
      figure: '71',
      label: 'your health score',
    });
    expect(
      coachReceipt({ field: 'mean_stated_confidence', scope: 'work', value: 80 }),
    ).toEqual({ figure: '80%', label: 'average confidence in work' });
  });

  it('shows a hit rate as a percentage', () => {
    expect(coachReceipt({ field: 'actual_rate', scope: 'finance', value: 0.548 })).toEqual({
      figure: '55%',
      label: 'came true in finance',
    });
  });

  it('describes overall figures', () => {
    expect(coachReceipt({ field: 'calibration_rating', scope: 'overall', value: 72 })?.label).toBe(
      'your calibration rating',
    );
    expect(coachReceipt({ field: 'total_resolved', scope: 'overall', value: 40 })?.label).toBe(
      'resolved in total',
    );
  });

  it('names the weekday rather than its index', () => {
    expect(
      coachReceipt({ field: 'pattern', scope: 'overall', value: 1, kind: 'weakest_day_of_week' }),
    ).toEqual({ figure: 'Monday', label: 'your least calibrated day' });
  });

  it('signs a drift', () => {
    const drift = (value: number) =>
      coachReceipt({ field: 'pattern', scope: 'overall', value, kind: 'drift_health' });
    expect(drift(6.2)?.figure).toBe('+6');
    expect(drift(-4)?.figure).toBe('−4');
    expect(drift(-4)?.label).toBe('change in your health score, earlier to recent');
  });

  it('leaves the receipt off for a pattern it cannot describe', () => {
    expect(coachReceipt({ field: 'pattern', scope: 'overall', value: 3, kind: 'new_thing' })).toBe(
      null,
    );
    expect(
      coachReceipt({ field: 'pattern', scope: 'overall', value: 9, kind: 'weakest_day_of_week' }),
    ).toBe(null);
  });
});
