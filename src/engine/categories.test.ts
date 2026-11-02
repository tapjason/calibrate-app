import type { Category, Prediction } from '@/types';

import { categoriesIn } from './categories';

const p = (category: Category): Prediction => ({
  id: category,
  user_id: 'u1',
  title: 't',
  category,
  confidence: 70,
  created_at: '2026-10-01T12:00:00.000Z',
  due_date: '2026-10-02T12:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
});

// Roadmap D39: the person's own categories are walked too, after the built-ins.
describe('categoriesIn', () => {
  it('lists the categories used, built-ins in order then added ones by id', () => {
    expect(categoriesIn([p('c-zz99'), p('finance'), p('work'), p('c-aa11'), p('work')])).toEqual([
      'work',
      'finance',
      'c-aa11',
      'c-zz99',
    ]);
    expect(categoriesIn([])).toEqual([]);
  });
});
