import { scanForCrisis, supportResource } from './crisisFilter';

describe('scanForCrisis', () => {
  it('passes ordinary prediction text through', () => {
    expect(
      scanForCrisis([
        'Ship the prototype by Friday',
        'Run 5k three times this week',
        'Close the Q3 deal',
      ]),
    ).toEqual({ safe: true, topic: null });
  });

  // The reason the patterns are phrase-shaped, not keyword-shaped: firing on
  // "kill" would suppress coaching on perfectly ordinary text.
  it('does not fire on violent-sounding idiom', () => {
    expect(scanForCrisis(['I will kill this presentation']).safe).toBe(true);
    expect(scanForCrisis(['This deadline is killing me']).safe).toBe(true);
    expect(scanForCrisis(['Dead certain I finish the draft']).safe).toBe(true);
  });

  it('skips null and empty entries', () => {
    expect(scanForCrisis([null, undefined, '', 'Finish the report']).safe).toBe(
      true,
    );
  });

  it.each([
    ['I want to die', 'self_harm'],
    ['thinking about killing myself', 'self_harm'],
    ['I have been hurting myself again', 'self_harm'],
    ['everyone would be better off dead', 'self_harm'],
  ])('flags self-harm signals: %s', (text, topic) => {
    expect(scanForCrisis([text])).toEqual({ safe: false, topic });
  });

  it.each([
    ['I will starve myself until the weigh-in'],
    ['make myself throw up after dinner'],
  ])('flags eating-disorder signals: %s', (text) => {
    const scan = scanForCrisis([text]);
    expect(scan.safe).toBe(false);
    expect(scan.topic).toBe('eating_disorder');
  });

  it('flags abuse signals', () => {
    const scan = scanForCrisis(['he hits me when I am late']);
    expect(scan.safe).toBe(false);
    expect(scan.topic).toBe('abuse');
  });

  it('flags acute distress', () => {
    const scan = scanForCrisis(['I cannot go on like this']);
    expect(scan.safe).toBe(false);
    expect(scan.topic).toBe('distress');
  });

  it('is case-insensitive', () => {
    expect(scanForCrisis(['I WANT TO DIE']).safe).toBe(false);
  });

  it('suppresses the whole request when any one entry matches', () => {
    const scan = scanForCrisis([
      'Ship the prototype',
      'I want to die',
      'Run 5k',
    ]);
    expect(scan.safe).toBe(false);
  });
});

describe('supportResource', () => {
  it('returns nothing for a clean scan', () => {
    expect(supportResource({ safe: true, topic: null })).toBeNull();
  });

  it('points eating-disorder signals at the right helpline', () => {
    const r = supportResource({ safe: false, topic: 'eating_disorder' });
    expect(r?.contact).toMatch(/Eating Disorders/);
  });

  it('points self-harm signals at the crisis lifeline', () => {
    const r = supportResource({ safe: false, topic: 'self_harm' });
    expect(r?.contact).toMatch(/988/);
  });

  // §5.5: gentle, non-clinical, and no categorical promises.
  it('keeps the copy non-clinical and free of guarantees', () => {
    for (const topic of ['self_harm', 'eating_disorder', 'abuse', 'distress'] as const) {
      const r = supportResource({ safe: false, topic })!;
      const text = `${r.title} ${r.body}`;
      expect(text).not.toMatch(/diagnos|disorder you|treatment|guarantee|will fix/i);
    }
  });
});
