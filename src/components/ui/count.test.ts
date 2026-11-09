import { localCount } from './count';

describe('localCount', () => {
  it('keeps small numbers as digits', () => {
    expect(localCount(0)).toBe('0');
    expect(localCount(999)).toBe('999');
  });

  it('groups thousands', () => {
    expect(localCount(1001)).toMatch(/^1\D?001$/);
    expect(localCount(1001)).not.toBe('1001');
  });
});
