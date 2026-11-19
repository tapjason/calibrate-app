import { SUPPORT_ASIDE_MAX_KEYS } from '@/types';

import { isSupportAsideKey, supportAsideKey, withSupportAsideKeys } from './supportAside';

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
    const many = Array.from({ length: SUPPORT_ASIDE_MAX_KEYS }, (_, i) => key(i));
    const next = withSupportAsideKeys(many, [key(1000), key(1001)]);
    expect(next).toHaveLength(SUPPORT_ASIDE_MAX_KEYS);
    expect(next[0]).toBe(key(2));
    expect(next.slice(-2)).toEqual([key(1000), key(1001)]);
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
