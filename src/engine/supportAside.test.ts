import { SUPPORT_ASIDE_MAX_KEYS } from '@/types';

import {
  isSupportAsideKey,
  supportAsideKey,
  supportAsideKeyId,
  supportAsideKeysStandingAfter,
  supportAsideKeysStandingWith,
  withSupportAsideKeys,
} from './supportAside';

const p = (id: string, title: string, reflection: string | null = null) => ({ id, title, reflection });

describe('supportAsideKey', () => {
  it('gives the same key for the same words', () => {
    expect(supportAsideKey(p('a', 'I want to die before this ships', 'rough week'))).toBe(
      supportAsideKey(p('a', 'I want to die before this ships', 'rough week')),
    );
  });

  it('is the id, then # and 16 hex digits, with none of the words', () => {
    const key = supportAsideKey(p('pred-1', 'I want to die before this ships', 'rough week'));
    expect(key).toMatch(/^pred-1#[0-9a-f]{16}$/);
    expect(key).not.toMatch(/die|ships|rough|week/);
    expect(isSupportAsideKey(key)).toBe(true);
  });

  it('changes with the note', () => {
    const before = supportAsideKey(p('a', 'Title', 'first note'));
    expect(supportAsideKey(p('a', 'Title', 'first note!'))).not.toBe(before);
    expect(supportAsideKey(p('a', 'Title', null))).not.toBe(before);
  });

  it('changes with the title', () => {
    expect(supportAsideKey(p('a', 'Title one'))).not.toBe(supportAsideKey(p('a', 'Title two')));
  });

  it('changes with the id', () => {
    expect(supportAsideKey(p('a', 'Same words'))).not.toBe(supportAsideKey(p('b', 'Same words')));
  });

  it('never reads two different title and note pairs alike', () => {
    expect(supportAsideKey(p('a', 'ab', 'c'))).not.toBe(supportAsideKey(p('a', 'a', 'bc')));
    expect(supportAsideKey(p('a', 'ab'))).not.toBe(supportAsideKey(p('a', 'a', 'b')));
  });

  it('reads an empty note as none', () => {
    expect(supportAsideKey(p('a', 'Title', ''))).toBe(supportAsideKey(p('a', 'Title', null)));
  });

  it('spreads keys out: a thousand nearby titles give a thousand keys', () => {
    const keys = new Set(Array.from({ length: 1000 }, (_, i) => supportAsideKey(p('a', `Title ${i}`))));
    expect(keys.size).toBe(1000);
  });
});

describe('isSupportAsideKey', () => {
  it.each([[''], ['a'], ['a#123'], ['#0123456789abcdef'], ['a#0123456789ABCDEF'], [42], [null], [{}]])(
    'rejects %p',
    (value) => {
      expect(isSupportAsideKey(value)).toBe(false);
    },
  );
});

describe('withSupportAsideKeys', () => {
  const key = (i: number) => supportAsideKey(p(`p${i}`, `Title ${i}`));

  it('adds new keys at the newest end, each once', () => {
    expect(withSupportAsideKeys([key(1), key(2)], [key(3), key(1)])).toEqual([key(2), key(3), key(1)]);
  });

  it(`keeps at most ${SUPPORT_ASIDE_MAX_KEYS}, dropping the oldest`, () => {
    expect(SUPPORT_ASIDE_MAX_KEYS).toBe(2000);
    const many = Array.from({ length: SUPPORT_ASIDE_MAX_KEYS }, (_, i) => key(i));
    // Two keys not among the first `SUPPORT_ASIDE_MAX_KEYS`.
    const a = key(SUPPORT_ASIDE_MAX_KEYS + 1000);
    const b = key(SUPPORT_ASIDE_MAX_KEYS + 1001);
    const next = withSupportAsideKeys(many, [a, b]);
    expect(next).toHaveLength(SUPPORT_ASIDE_MAX_KEYS);
    expect(next[0]).toBe(key(2));
    expect(next.slice(-2)).toEqual([a, b]);
    expect(next).not.toContain(key(0));
    expect(next).not.toContain(key(1));
  });

  it('leaves out anything that is not a key', () => {
    expect(withSupportAsideKeys(['words', 7, null, key(1)], ['x'])).toEqual([key(1)]);
  });

  it('honours a smaller cap', () => {
    expect(withSupportAsideKeys([key(1), key(2), key(3)], [], 2)).toEqual([key(2), key(3)]);
    expect(withSupportAsideKeys([key(1)], [], 0)).toEqual([]);
  });
});

describe('supportAsideKeyId', () => {
  it('is the id a key was made for', () => {
    expect(supportAsideKeyId(supportAsideKey(p('pred-1', 'Title')))).toBe('pred-1');
  });

  it('keeps a # inside the id', () => {
    expect(supportAsideKeyId(supportAsideKey(p('a#b', 'Title', 'note')))).toBe('a#b');
  });

  it.each([['words'], ['a#123'], [7], [null]])('is null for %p', (value) => {
    expect(supportAsideKeyId(value)).toBeNull();
  });
});

// 2026-11-19: a key must not outlive the words it hashes.
describe('supportAsideKeysStandingWith', () => {
  it('keeps a key whose prediction is there with the same words', () => {
    const stands = supportAsideKeysStandingWith([p('a', 'Title', 'note'), p('b', 'Other')]);
    expect(stands(supportAsideKey(p('a', 'Title', 'note')))).toBe(true);
    expect(stands(supportAsideKey(p('b', 'Other')))).toBe(true);
  });

  it('drops a key whose prediction is gone', () => {
    const stands = supportAsideKeysStandingWith([p('b', 'Other')]);
    expect(stands(supportAsideKey(p('a', 'Title')))).toBe(false);
  });

  it('drops a key whose note or title changed', () => {
    const stands = supportAsideKeysStandingWith([p('a', 'Title', null), p('b', 'New title')]);
    expect(stands(supportAsideKey(p('a', 'Title', 'removed note')))).toBe(false);
    expect(stands(supportAsideKey(p('b', 'Old title')))).toBe(false);
  });

  it('keeps nothing beside an empty list', () => {
    expect(supportAsideKeysStandingWith([])(supportAsideKey(p('a', 'Title')))).toBe(false);
  });
});

describe('supportAsideKeysStandingAfter', () => {
  const before = supportAsideKey(p('a', 'Title', 'hurtful note'));
  const other = supportAsideKey(p('b', 'Other', 'note'));

  it('drops the changed prediction’s old key and leaves every other', () => {
    const stands = supportAsideKeysStandingAfter('a', { title: 'Title', reflection: null });
    expect(stands(before)).toBe(false);
    expect(stands(other)).toBe(true);
  });

  it('keeps its key when the words are the same', () => {
    const stands = supportAsideKeysStandingAfter('a', { title: 'Title', reflection: 'hurtful note' });
    expect(stands(before)).toBe(true);
  });

  it('drops every key for a prediction that is gone, or couldn’t be read', () => {
    const stands = supportAsideKeysStandingAfter('a', null);
    expect(stands(before)).toBe(false);
    expect(stands(supportAsideKey(p('a', 'Some other words')))).toBe(false);
    expect(stands(other)).toBe(true);
  });

  it('never matches an id that only starts the same', () => {
    const stands = supportAsideKeysStandingAfter('a', null);
    expect(stands(supportAsideKey(p('ab', 'Title')))).toBe(true);
  });
});
