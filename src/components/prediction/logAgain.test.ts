import type { Prediction } from '@/types';

import {
  lateRenumberDraft,
  leadDays,
  logAgainDraft,
  noonInDays,
  renumberDraft,
} from './logAgain';

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

describe('renumberDraft (D62)', () => {
  it('starts from the words, category and own due date, replacing the original', () => {
    const p = { ...resolved('2026-11-13T09:00:00', '2026-11-16T12:00:00'), status: 'pending' as const };
    expect(renumberDraft(p)).toEqual({
      sourceId: 'renumber:p1',
      title: p.title,
      category: p.category,
      dueIso: p.due_date,
      replaces: 'p1',
    });
  });
});

describe('renumberDraft with what Edit held (step 179)', () => {
  it('keeps typed words, category and date, and falls back when blank', () => {
    const p = { ...resolved('2026-11-13T09:00:00', '2026-11-16T12:00:00'), status: 'pending' as const };
    const due = new Date('2026-11-18T12:00:00').toISOString();
    expect(renumberDraft(p, { title: 'Swim three times', category: 'personal', dueIso: due })).toMatchObject({
      title: 'Swim three times',
      category: 'personal',
      dueIso: due,
      replaces: 'p1',
    });
    expect(renumberDraft(p, { title: '  ', category: null, dueIso: 'nope' })).toMatchObject({
      title: p.title,
      category: p.category,
      dueIso: p.due_date,
    });
  });
});

describe('lateRenumberDraft (code review, step 179)', () => {
  it('keeps what Edit held as a new one, due tomorrow at the earliest', () => {
    const now = new Date('2026-11-14T00:05:00');
    const p = { ...resolved('2026-11-13T09:00:00', '2026-11-14T12:00:00'), status: 'pending' as const };
    const late = lateRenumberDraft(renumberDraft(p, { title: 'Swim three times' }), now);
    expect(late.replaces).toBeUndefined();
    expect(late.title).toBe('Swim three times');
    expect(late.dueIso).toBe(noonInDays(1, now));
    const later = new Date('2026-11-20T12:00:00').toISOString();
    expect(lateRenumberDraft(renumberDraft(p, { dueIso: later }), now).dueIso).toBe(later);
  });
});
