import { localCount } from './count';

describe('localCount', () => {
  it('keeps small numbers as digits', () => {
    expect(localCount(0)).toBe('0');
    expect(localCount(999)).toBe('999');
  });

  it('groups thousands', () => {
    // A comma on every phone (D63): countLocale is plain English.
    expect(localCount(1001)).toBe('1,001');
    expect(localCount(1234567)).toBe('1,234,567');
  });
});
