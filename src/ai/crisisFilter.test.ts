import { __setDeviceLocaleForTests } from '@/constants/locale';

import { INTERNATIONAL_CONTACT, scanForCrisis, supportResource } from './crisisFilter';

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
  // A US phone, whatever the machine running the tests is set to.
  beforeEach(() => __setDeviceLocaleForTests('en-US'));
  afterEach(() => __setDeviceLocaleForTests(null));

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

// Policy audits, 2026-11-14 and 11-15: the lines were US numbers on every
// phone; and no third-party site is named without its permission.
describe('supportResource by region', () => {
  afterEach(() => __setDeviceLocaleForTests(null));
  const elsewhere =
    'Outside the US: search for a crisis line in your country, or call your local emergency number.';

  it('says where to turn outside the US, naming no website', () => {
    expect(INTERNATIONAL_CONTACT).toBe(elsewhere);
    expect(INTERNATIONAL_CONTACT).not.toMatch(/\.com|\.org|https?:|www\./i);
  });

  it('gives the US line and the line for elsewhere on a US phone', () => {
    const r = supportResource({ safe: false, topic: 'self_harm' }, 'US')!;
    expect(r.contact).toBe(`988 Suicide & Crisis Lifeline — call or text 988 (US)\n${elsewhere}`);
  });

  it.each(['GB', 'CA', 'AU', 'IN', 'BR'])('gives no US number in %s', (region) => {
    for (const topic of ['self_harm', 'eating_disorder', 'abuse', 'distress'] as const) {
      const r = supportResource({ safe: false, topic }, region)!;
      expect(r.contact).toBe(elsewhere);
      expect(r.contact).not.toMatch(/\(US\)|988|1-8/);
      // The words above the contact are the same everywhere.
      expect(r.body).toBe(supportResource({ safe: false, topic }, 'US')!.body);
    }
  });

  // Code review and policy audit, 2026-11-15: a phone set to a US territory
  // was told "in your country" and shown no number. 988 is confirmed there
  // (SAMHSA: "a U.S. state, territory or tribal land"); the other two lines
  // aren't, so those topics keep the line for elsewhere until the owner decides.
  describe.each(['PR', 'GU', 'VI', 'AS', 'MP'])('on a phone set to %s', (region) => {
    it.each(['self_harm', 'distress'] as const)('gives 988 for %s, as on a US phone', (topic) => {
      const r = supportResource({ safe: false, topic }, region)!;
      expect(r.contact).toBe(`988 Suicide & Crisis Lifeline — call or text 988 (US)\n${elsewhere}`);
      expect(r).toEqual(supportResource({ safe: false, topic }, 'US'));
    });

    it.each(['abuse', 'eating_disorder'] as const)('gives no unconfirmed number for %s', (topic) => {
      const r = supportResource({ safe: false, topic }, region)!;
      expect(r.contact).toBe(elsewhere);
      expect(r.contact).not.toMatch(/\(US\)|988|1-8/);
    });
  });

  it('reads a territory from the phone too', () => {
    __setDeviceLocaleForTests('es-PR');
    expect(supportResource({ safe: false, topic: 'self_harm' })!.contact).toMatch(/988[^]*Outside the US/);
    expect(supportResource({ safe: false, topic: 'abuse' })!.contact).toBe(elsewhere);
  });

  it('gives both when the region cannot be read', () => {
    const r = supportResource({ safe: false, topic: 'abuse' }, null)!;
    expect(r.contact).toBe(`National Domestic Violence Hotline — 1-800-799-7233 (US)\n${elsewhere}`);
  });

  it('reads the region from the phone when none is passed', () => {
    __setDeviceLocaleForTests('en-GB');
    expect(supportResource({ safe: false, topic: 'distress' })!.contact).toBe(elsewhere);
    __setDeviceLocaleForTests('es-US');
    expect(supportResource({ safe: false, topic: 'distress' })!.contact).toMatch(/988[^]*Outside the US/);
    __setDeviceLocaleForTests('ja');
    expect(supportResource({ safe: false, topic: 'distress' })!.contact).toMatch(/988[^]*Outside the US/);
  });

  // COACH_AGENT.md §5.5: no categorical promise about confidentiality, hours
  // or outcome, on any topic.
  it('promises nothing about confidentiality or hours', () => {
    for (const topic of ['self_harm', 'eating_disorder', 'abuse', 'distress'] as const) {
      for (const region of ['US', 'GB', null]) {
        const r = supportResource({ safe: false, topic }, region)!;
        expect(`${r.title} ${r.body}`).not.toMatch(/confidential|any time|24\/7|always|guarantee/i);
      }
    }
  });
});
