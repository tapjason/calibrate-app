import type { Prediction } from '@/types';

import { canCorrect, correctableUntil, CORRECTION_WINDOW_HOURS } from './corrections';

const answered = (over: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
  user_id: 'u1',
  title: 'x',
  category: 'work',
  confidence: 70,
  created_at: '2026-10-30T12:00:00.000Z',
  due_date: '2026-11-01T12:00:00.000Z',
  status: 'resolved_no',
  resolved_at: '2026-11-01T18:00:00.000Z',
  reflection: null,
  integrity_bonus: false,
  ...over,
});

describe('corrections (roadmap D34)', () => {
  it('keeps a Yes or No open to correction for 24 hours after the answer', () => {
    expect(CORRECTION_WINDOW_HOURS).toBe(24);
    expect(correctableUntil(answered())?.toISOString()).toBe('2026-11-02T18:00:00.000Z');
    expect(canCorrect(answered(), new Date('2026-11-02T17:59:59.000Z'))).toBe(true);
    expect(canCorrect(answered(), new Date('2026-11-02T18:00:00.000Z'))).toBe(false);
    expect(canCorrect(answered({ status: 'resolved_yes' }), new Date('2026-11-01T19:00:00.000Z'))).toBe(true);
  });

  // A skip is answered later instead (step 39); an open one has nothing to correct.
  it('has no window for an open prediction, a skip or an unreadable time', () => {
    const now = new Date('2026-11-01T19:00:00.000Z');
    expect(canCorrect(answered({ status: 'pending', resolved_at: null }), now)).toBe(false);
    expect(canCorrect(answered({ status: 'skipped' }), now)).toBe(false);
    expect(correctableUntil(answered({ resolved_at: 'never' }))).toBeNull();
  });
});
