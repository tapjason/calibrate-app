import { prefersUsUnits, withUsUnits } from './answerKeyUnits';

// Step 173 (aggregate B2): feet and miles beside metres for a US phone.
describe('prefersUsUnits', () => {
  it('reads the region from the locale', () => {
    expect(prefersUsUnits('en-US')).toBe(true);
    expect(prefersUsUnits('es-US')).toBe(true);
    expect(prefersUsUnits('en-GB')).toBe(false);
    expect(prefersUsUnits('ja-JP')).toBe(false);
    expect(prefersUsUnits('en')).toBe(false);
  });
});

describe('withUsUnits', () => {
  it('adds feet to heights', () => {
    expect(withUsUnits('Everest is 8,849 m high, K2 8,611 m.')).toBe(
      'Everest is 8,849 m (29,032 ft) high, K2 8,611 m (28,251 ft).',
    );
  });
  it('adds miles to diameters and square miles to areas', () => {
    expect(withUsUnits('Mars is 6,779 km across, Mercury 4,879 km.')).toBe(
      'Mars is 6,779 km (4,212 miles) across, Mercury 4,879 km (3,032 miles).',
    );
    expect(withUsUnits('Chad covers about 1.28 million km², Peru about 1.29 million km².')).toBe(
      'Chad covers about 1.28 million km² (0.494 million sq mi), Peru about 1.29 million km² (0.498 million sq mi).',
    );
    expect(withUsUnits('Malta covers about 316 km², Andorra about 468 km².')).toBe(
      'Malta covers about 316 km² (122 sq mi), Andorra about 468 km² (181 sq mi).',
    );
  });
  it('leaves other facts alone', () => {
    const s = 'Hydrogen is element 1, helium element 2.';
    expect(withUsUnits(s)).toBe(s);
    expect(withUsUnits('Mozart was born in 1756, Haydn in 1732.')).toBe(
      'Mozart was born in 1756, Haydn in 1732.',
    );
  });
});
