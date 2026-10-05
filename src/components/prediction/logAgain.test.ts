import type { Prediction } from '@/types';

import { leadDays, logAgainDraft, noonInDays } from './logAgain';

const resolved = (created: string, due: string): Prediction => ({
  id: 'p1',
  user_id: 'u1',
  title: 'Swim twice this week',
  category: 'health',
  confidence: 80,
  created_at: created,
  due_date: due,
  status: 'resolved_yes',
  resolved_at: due,
  reflection: null,
  integrity_bonus: false,
});

describe('logAgain (roadmap step 22)', () => {
  it('measures the lead time in whole local days', () => {
    expect(leadDays(resolved('2026-06-01T09:00:00', '2026-06-08T12:00:00'))).toBe(7);
    // Logged late in the evening, due the next noon: one day ahead.
    expect(leadDays(resolved('2026-06-01T23:30:00', '2026-06-02T12:00:00'))).toBe(1);
  });

  it('never comes back due today or earlier', () => {
    expect(leadDays(resolved('2026-06-01T09:00:00', '2026-06-01T18:00:00'))).toBe(1);
    expect(leadDays(resolved('not a date', '2026-06-01T18:00:00'))).toBe(7);
  });

  it('carries the title, category and lead time, not the confidence', () => {
    const now = new Date('2026-10-04T10:00:00');
    const draft = logAgainDraft(resolved('2026-06-01T09:00:00', '2026-06-08T12:00:00'), now);
    expect(draft).toEqual({
      sourceId: 'p1',
      title: 'Swim twice this week',
      category: 'health',
      dueIso: noonInDays(7, now),
    });
    expect(draft).not.toHaveProperty('confidence');
  });

  it('lands on local noon, the same instant as the Log date chips', () => {
    const due = new Date(noonInDays(7, new Date('2026-10-04T22:00:00')));
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([11, 12, 0]);
  });
});
