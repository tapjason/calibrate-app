import { expectedPhrase } from './expectedPhrase';

// The words for an expected count, on Wrapped, practice, the chart's headline
// and its counts table alike (roadmap D57).
describe('expectedPhrase', () => {
  it('says "less than 1" below a half', () => {
    expect(expectedPhrase(0.4)).toBe('less than\u00A01');
  });

  it('says both neighbours below 10 when the count is near a half', () => {
    expect(expectedPhrase(2.45)).toBe('2\u00A0or\u00A03');
    expect(expectedPhrase(8.4)).toBe('8\u00A0or\u00A09');
    expect(expectedPhrase(9.5)).toBe('9\u00A0or\u00A010');
  });

  it('says "about" a whole number otherwise', () => {
    expect(expectedPhrase(2.2)).toBe('about\u00A02');
    expect(expectedPhrase(13.86)).toBe('about\u00A014');
    expect(expectedPhrase(10.5)).toBe('about\u00A011');
  });
});
