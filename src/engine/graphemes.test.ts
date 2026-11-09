import {
  fitEdit,
  fitGraphemes,
  graphemeLength,
  splitGraphemes,
  splitGraphemesFallback,
  unitBackstop,
} from './graphemes';

const FAMILY = '👩‍👩‍👧‍👦'; // 11 UTF-16 units, one character
const FLAG = '🇯🇵';
const THUMB = '👍🏽';
const KEYCAP = '1️⃣';
const ACCENT = 'é';

describe('graphemes', () => {
  it.each([
    ['plain', 'abc', 3],
    ['a family', `Friends ${FAMILY}`, 9],
    ['a flag', FLAG, 1],
    ['a skin tone', THUMB, 1],
    ['a keycap', KEYCAP, 1],
    ['an accent', ACCENT, 1],
  ])('counts %s as people see it', (_, text, n) => {
    expect(graphemeLength(text)).toBe(n);
    expect(splitGraphemesFallback(text)).toHaveLength(n);
  });

  it('splits two flags into two', () => {
    expect(splitGraphemesFallback(FLAG + FLAG)).toEqual([FLAG, FLAG]);
    expect(splitGraphemes(FLAG + FLAG)).toEqual([FLAG, FLAG]);
  });

  it('never cuts through an emoji (playtest 2026-11-08b, finding 6)', () => {
    const name = `Friends and famil${FAMILY}x`;
    // 17 letters, then the family as one character.
    expect(fitGraphemes(name, 18)).toBe(`Friends and famil${FAMILY}`);
    expect(fitGraphemes(name, 17)).toBe('Friends and famil');
  });

  it('leaves text within the limit alone', () => {
    expect(fitGraphemes(`ab${FAMILY}`, 3)).toBe(`ab${FAMILY}`);
    expect(fitGraphemes('abcdef', 4)).toBe('abcd');
  });

  it('gives the input room for long characters', () => {
    expect(unitBackstop(24)).toBeGreaterThanOrEqual(24 * FAMILY.length);
  });

  // Review, 2026-11-08: typing into the middle of a full field kept the new
  // words and dropped the field's last ones. Run twice: with Intl.Segmenter
  // (Node, the web) and without it, as Hermes on the phone likely is.
  describe.each([
    ['with Intl.Segmenter', false],
    ['with the fallback splitter', true],
  ])('fitEdit %s', (_, hideSegmenter) => {
    const intl = Intl as unknown as { Segmenter?: unknown };
    const saved = intl.Segmenter;
    beforeAll(() => {
      if (hideSegmenter) delete intl.Segmenter;
    });
    afterAll(() => {
      intl.Segmenter = saved;
    });

    it('runs on the splitter it says', () => {
      expect(intl.Segmenter === undefined).toBe(hideSegmenter);
    });

    it('passes an edit under the limit through', () => {
      expect(fitEdit('abc', 'abXc', 10)).toBe('abXc');
    });

    it('trims what was inserted in the middle, not the end', () => {
      expect(fitEdit('abcdef', 'abcXYZdef', 7)).toBe('abcXdef');
      expect(fitEdit('abcdef', 'abcXYZdef', 6)).toBe('abcdef');
    });

    it('never splits an inserted emoji', () => {
      expect(fitEdit('abcde', `ab${FAMILY}cde`, 5)).toBe('abcde');
      expect(fitEdit('abcd', `ab${FAMILY}cd`, 5)).toBe(`ab${FAMILY}cd`);
    });

    it('cuts the end of a paste that replaced everything', () => {
      expect(fitEdit('', 'abcdefgh', 4)).toBe('abcd');
    });

    it('keeps typing at the end working as before', () => {
      expect(fitEdit('abcd', 'abcde', 4)).toBe('abcd');
    });

    it('lets a deletion through from a value already over the limit', () => {
      expect(fitEdit('abcdef', 'abcde', 4)).toBe('abcde');
    });

    it('trims an inserted flag whole', () => {
      expect(fitEdit('abc', `a${FLAG}${FLAG}bc`, 4)).toBe(`a${FLAG}bc`);
    });
  });
});
