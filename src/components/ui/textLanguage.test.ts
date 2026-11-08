import { spokenExcerpt, textLanguage } from './textLanguage';

const fromCodes = (...codes: number[]) => String.fromCharCode(...codes);
// "shalom" and "salam", built from code points (docs/tooling-notes.md).
const HEBREW_WORD = fromCodes(0x05e9, 0x05dc, 0x05d5, 0x05dd);
const ARABIC_WORD = fromCodes(0x0633, 0x0644, 0x0627, 0x0645);

// Playtest 2026-11-08, findings 40 and 41.
describe('textLanguage', () => {
  it('names Hebrew and Arabic text', () => {
    expect(textLanguage(`${HEBREW_WORD} ${HEBREW_WORD}`)).toBe('he');
    expect(textLanguage(`${ARABIC_WORD} ${ARABIC_WORD}`)).toBe('ar');
  });

  it("leaves Latin text, and text that's mostly Latin, to the app's voice", () => {
    expect(textLanguage('Ship the beta by Friday')).toBeUndefined();
    expect(textLanguage(`Say ${HEBREW_WORD} to the new neighbours`)).toBeUndefined();
    expect(textLanguage('42')).toBeUndefined();
  });
});

describe('spokenExcerpt', () => {
  it('keeps a short note whole', () => {
    expect(spokenExcerpt('  Rained all day.  ')).toBe('Rained all day.');
  });

  it('cuts a long note at a word, with an ellipsis', () => {
    const note = 'word '.repeat(100);
    const spoken = spokenExcerpt(note, 140);
    expect(spoken.length).toBeLessThanOrEqual(141);
    expect(spoken.endsWith('word…')).toBe(true);
  });
});
