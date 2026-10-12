import type { Prediction, PredictionStatus } from '@/types';

import { pastOutcomes, titleKey } from './pastOutcomes';

let seq = 0;

function p(title: string, status: PredictionStatus, confidence = 70): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title,
    category: 'health',
    confidence,
    created_at: '2026-10-01T10:00:00.000Z',
    due_date: '2026-10-08T12:00:00.000Z',
    status,
    resolved_at: status === 'pending' ? null : '2026-10-08T19:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
  };
}

describe('titleKey (roadmap D32)', () => {
  it('ignores case, spaces and end punctuation', () => {
    const key = titleKey('Swim twice this week');
    expect(titleKey('swim TWICE this week')).toBe(key);
    expect(titleKey('  Swim   twice\tthis week ')).toBe(key);
    expect(titleKey('Swim twice this week.')).toBe(key);
    expect(titleKey('Swim twice this week!?')).toBe(key);
    expect(titleKey('Swim twice this week …')).toBe(key);
    expect(titleKey('Swim twice this week,')).toBe(key);
  });

  // iOS's Smart Punctuation types ’ where a starter idea or a web title has '.
  it('reads curly apostrophes and quotes as straight ones', () => {
    expect(titleKey('I’ll get outside for a walk tomorrow')).toBe(
      titleKey("I'll get outside for a walk tomorrow"),
    );
    expect(titleKey('Sam says “yes” to the trip')).toBe(titleKey('Sam says "yes" to the trip'));
  });

  it('keeps the words, and punctuation inside them', () => {
    expect(titleKey('Swim twice this week')).not.toBe(titleKey('Swim three times this week'));
    expect(titleKey('Hit 8,000 steps today')).not.toBe(titleKey('Hit 8000 steps today'));
    expect(titleKey('No caffeine after 2pm')).not.toBe(titleKey('No caffeine after 2 pm'));
    // Only the end: a question mark mid-title stays.
    expect(titleKey('Rain? Then the run moves')).not.toBe(titleKey('Rain Then the run moves'));
  });

  it('is empty for a title with no words', () => {
    expect(titleKey('')).toBe('');
    expect(titleKey('   ')).toBe('');
    expect(titleKey('...?')).toBe('');
  });
});

describe('pastOutcomes (roadmap D32)', () => {
  it('counts the answered ones with the same title, and how many happened', () => {
    const resolved = [
      p('Swim twice this week', 'resolved_yes'),
      p('swim twice this week.', 'resolved_no'),
      p('Swim twice this week', 'resolved_no'),
      p('Run three times this week', 'resolved_yes'),
    ];
    expect(pastOutcomes(resolved, 'Swim twice this week')).toEqual({
      answered: 3,
      happened: 1,
    });
  });

  it('leaves out skips and open ones', () => {
    const resolved = [
      p('Swim twice this week', 'resolved_yes'),
      p('Swim twice this week', 'skipped'),
      p('Swim twice this week', 'pending'),
    ];
    expect(pastOutcomes(resolved, 'Swim twice this week')).toEqual({
      answered: 1,
      happened: 1,
    });
  });

  it('is null until one has been answered yes or no', () => {
    expect(pastOutcomes([], 'Swim twice this week')).toBeNull();
    expect(pastOutcomes([p('Swim twice this week', 'skipped')], 'Swim twice this week')).toBeNull();
    expect(pastOutcomes([p('Swim twice this week', 'pending')], 'Swim twice this week')).toBeNull();
    expect(pastOutcomes([p('Run three times this week', 'resolved_yes')], 'Swim')).toBeNull();
  });

  it('is null for a title with no words, even against one with none', () => {
    expect(pastOutcomes([p('...', 'resolved_yes')], '?')).toBeNull();
    expect(pastOutcomes([p('Swim', 'resolved_yes')], '   ')).toBeNull();
  });

  // "Log it again" carries the title over exactly.
  it('always matches a prediction repeated under its own title', () => {
    const resolved = [
      p('  Call Grandma this week! ', 'resolved_no'),
      p('I’ll finish the draft', 'resolved_yes'),
    ];
    for (const repeated of resolved) {
      expect(pastOutcomes(resolved, repeated.title)?.answered).toBe(1);
    }
  });

  // The old number would anchor the new one, so it never leaves the engine.
  it('carries outcomes only, never a confidence', () => {
    const result = pastOutcomes(
      [p('Swim twice this week', 'resolved_yes', 90), p('Swim twice this week', 'resolved_no', 60)],
      'Swim twice this week',
    );
    expect(Object.keys(result ?? {}).sort()).toEqual(['answered', 'happened']);
  });
});
