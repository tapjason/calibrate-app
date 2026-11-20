import { __setDeviceLocaleForTests } from '@/constants/locale';

import {
  crisisTopicsIn,
  INTERNATIONAL_CONTACT,
  scanForCrisis,
  supportResource,
  TERRITORY_FALLBACK_CONTACT,
  TERRITORY_LIFELINE_CONTACT,
  US_LIFELINE_CONTACT,
} from './crisisFilter';

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

// Security review 2026-11-18, finding 14: iOS types a curly apostrophe
// (U+2019) by default, and "can'?t" missed "I can’t go on".
describe('scanForCrisis — text as an iPhone types it', () => {
  it.each([
    ['I can’t go on', 'distress'],
    ['I can’t take this anymore', 'distress'],
    ['I can‘t do this any more', 'distress'],
    ['I canʼt go on', 'distress'],
    ['I can`t go on', 'distress'],
    ['ｓｕｉｃｉｄｅ', 'self_harm'],
    ['thinking about killing myself', 'self_harm'],
    ['I want  to die', 'self_harm'],
    ['I want to\ndie', 'self_harm'],
    ['self‐harm again', 'self_harm'],
    ['self–harm again', 'self_harm'],
    ['he hits me', 'abuse'],
  ])('flags %p', (text, topic) => {
    expect(scanForCrisis([text])).toEqual({ safe: false, topic });
  });
});

// Finding 15: idioms that replaced the Coach with a support card on every tap.
// Each carve-out is narrow, and the distress reading of the same words still
// matches. Narrowed again 2026-11-19 (Coach re-review F, main session's
// decision): "beats me to it", "beats me by 3 points", "not eating for 20 hrs"
// and "for 18h" were let through until then and are flagged now (below), as
// a missed disclosure costs more than an unneeded support card.
describe('scanForCrisis — idioms that are not distress', () => {
  it.each([
    'Sam beats me at chess',
    'My sister beats me in tennis every week',
    'Dad beats me at cards',
    'Jo beats me at Mario Kart',
    'Kim beats me at Catan',
    'Alex beats me at padel',
    'He beats me at poker',
    'Cut myself some slack this week',
    'cutting myself some slack on the diet',
    'Finish breaking down the moving boxes',
    'Breaking down the problem into steps',
    'breaking down tasks for the sprint',
    'Breaking down a big project',
    'breaking down an old wall',
    'breaking down this recipe',
    'breaking down that budget',
    'Not eating for 16 hours today',
    'not eat for 12 hours before the blood test',
    'not eating for 1 hour',
  ])('lets %p through', (text) => {
    expect(scanForCrisis([text])).toEqual({ safe: true, topic: null });
  });

  it.each([
    // Re-included 2026-11-19: no carve-out may hide the distress reading.
    ['he beats me by 9 every night', 'abuse'],
    ['he beats me at game night', 'abuse'],
    ['he beats me at games', 'abuse'],
    ['she beats me in sports', 'abuse'],
    ['He beats me by 3 points', 'abuse'],
    ['She always beats me to it', 'abuse'],
    ['not eating for 20 hours at a time', 'eating_disorder'],
    ['not eating for 20 hrs on Friday', 'eating_disorder'],
    ['Not eating for 18h', 'eating_disorder'],
    ['not eating for 17 hours', 'eating_disorder'],
    ['breaking down a lot lately', 'distress'],
    ['breaking down this week', 'distress'],
    ['breaking down that night', 'distress'],
    // Round 6 (2026-11-19): a named game followed by a place or a time.
    ['he beats me at poker night', 'abuse'],
    ['she beats me at chess club', 'abuse'],
    ['he beats me at tennis practice', 'abuse'],
    ['he beats me at poker nights', 'abuse'],
    ['he beats me at poker tonight', 'abuse'],
    ['he beats me at cards at home', 'abuse'],
    ['he beats me at poker after work', 'abuse'],
    ['he beats me at darts every night', 'abuse'],
    ['she beats me at golf lessons', 'abuse'],
    ['he beats me at chess in class', 'abuse'],
    ['he beats me at scrabble camp', 'abuse'],
    ['he beats me at chess school', 'abuse'],
    ['he beats me at ping-pong club', 'abuse'],
    ['he beats me at Mario Kart night', 'abuse'],
    ['she beats me in tennis classes', 'abuse'],
    ['he beats me at poker-night', 'abuse'],
    ['he beats me', 'abuse'],
    ['My husband beats me at home', 'abuse'],
    ['she beats me when she drinks', 'abuse'],
    ['he beats me to a pulp', 'abuse'],
    ['he beats me in front of the kids', 'abuse'],
    ['I keep cutting myself', 'self_harm'],
    ['I cut myself again last night', 'self_harm'],
    ['cut myself off from everyone', 'self_harm'],
    ['I keep breaking down', 'distress'],
    ['breaking down in tears at work', 'distress'],
    ['breaking down all the time', 'distress'],
    ['breaking down every day', 'distress'],
    ['breaking down', 'distress'],
    ['not eating for days', 'eating_disorder'],
    ['not eating for a week', 'eating_disorder'],
    ['not eating for 3 days', 'eating_disorder'],
    ['not eating for 24 hours', 'eating_disorder'],
    ['not eating for as long as I can', 'eating_disorder'],
    ['not eat at all', 'eating_disorder'],
  ])('still flags %p', (text, topic) => {
    expect(scanForCrisis([text])).toEqual({ safe: false, topic });
  });
});

// The patterns as they were before 2026-11-18, copied verbatim. Everything
// they caught is still caught, except the four idioms above.
describe('scanForCrisis — never catches less than before', () => {
  const OLD: ReadonlyArray<{ topic: string; pattern: RegExp }> = [
    {
      topic: 'self_harm',
      pattern:
        /\b(kill(ing)? myself|end(ing)? (my life|it all)|take my own life|want(ed)? to die|better off dead|suicid(e|al)|self[-\s]?harm|hurt(ing)? myself|cut(ting)? myself|no reason to (live|go on))\b/i,
    },
    {
      topic: 'eating_disorder',
      pattern:
        /\b(starv(e|ing) myself|make myself (throw up|vomit|sick)|purg(e|ing) after|binge and purge|stop eating (entirely|completely)|not eat(ing)? (for|at all)|hate my body so much)\b/i,
    },
    {
      topic: 'abuse',
      pattern:
        /\b(hits me|beats me|hurts me|abus(es|ing) me|being abused|afraid of (him|her|them|my partner)|threatens to hurt me)\b/i,
    },
    {
      topic: 'distress',
      pattern:
        /\b(can'?t|cannot|can not) (go on|take (this|it) any\s?more|do this any\s?more)\b|\b(breaking down|falling apart completely|hopeless about everything|nothing matters any\s?more)\b/i,
    },
  ];
  const oldScan = (text: string) => OLD.find(({ pattern }) => pattern.test(text))?.topic ?? null;

  // Every phrase each old pattern names, alone and inside a sentence.
  const PHRASES = [
    'kill myself', 'killing myself', 'end my life', 'ending it all', 'take my own life',
    'want to die', 'wanted to die', 'better off dead', 'suicide', 'suicidal', 'self harm',
    'self-harm', 'selfharm', 'hurt myself', 'hurting myself', 'cut myself', 'cutting myself',
    'no reason to live', 'no reason to go on',
    'starve myself', 'starving myself', 'make myself throw up', 'make myself vomit',
    'make myself sick', 'purge after', 'purging after', 'binge and purge',
    'stop eating entirely', 'stop eating completely', 'not eat for', 'not eating for',
    'not eat at all', 'not eating at all', 'hate my body so much',
    'hits me', 'beats me', 'hurts me', 'abuses me', 'abusing me', 'being abused',
    'afraid of him', 'afraid of her', 'afraid of them', 'afraid of my partner',
    'threatens to hurt me',
    "can't go on", 'cant go on', 'cannot go on', 'can not go on', "can't take this anymore",
    'cannot take it any more', "can't do this anymore", 'can not do this any more',
    'breaking down', 'falling apart completely', 'hopeless about everything',
    'nothing matters anymore', 'nothing matters any more',
  ];
  const CORPUS = PHRASES.flatMap((p) => [
    p,
    p.toUpperCase(),
    `Honestly ${p} lately.`,
    `I think ${p}, and then ${p}`,
    `${p} again`,
    `${p} at home`,
    `${p} for days`,
  ]);

  it.each(CORPUS)('%p', (text) => {
    const before = oldScan(text);
    if (before === null) return;
    expect(scanForCrisis([text])).toEqual({ safe: false, topic: before });
  });

  it('loses exactly the four idioms', () => {
    const idioms = [
      'Sam beats me at chess',
      'cut myself some slack',
      'Finish breaking down the moving boxes',
      'Not eating for 16 hours today',
    ];
    for (const text of idioms) {
      expect(oldScan(text)).not.toBeNull();
      expect(scanForCrisis([text]).safe).toBe(true);
    }
  });
});

// Item 14 (2026-11-19): without String.prototype.normalize the scan still
// reads each text as typed and with apostrophes, dashes and spaces made
// plain; only the NFKC reading is lost (it only ever adds matches).
describe('scanForCrisis — without NFKC', () => {
  const original = Object.getOwnPropertyDescriptor(String.prototype, 'normalize')!;
  afterEach(() => Object.defineProperty(String.prototype, 'normalize', original));

  it.each([
    ['missing', undefined],
    ['throwing', () => {
      throw new RangeError('no ICU');
    }],
  ])('still flags every reading but NFKC when normalize is %s', (_name, normalize) => {
    Object.defineProperty(String.prototype, 'normalize', { ...original, value: normalize });
    expect(scanForCrisis(['I want to die'])).toEqual({ safe: false, topic: 'self_harm' });
    expect(scanForCrisis(['I can’t go on'])).toEqual({ safe: false, topic: 'distress' });
    expect(scanForCrisis(['self–harm again'])).toEqual({ safe: false, topic: 'self_harm' });
    expect(scanForCrisis(['I want  to\ndie'])).toEqual({ safe: false, topic: 'self_harm' });
    expect(scanForCrisis(['he beats me at game night'])).toEqual({ safe: false, topic: 'abuse' });
    expect(scanForCrisis(['he beats me at poker night'])).toEqual({ safe: false, topic: 'abuse' });
    expect(scanForCrisis(['Ship the prototype by Friday'])).toEqual({ safe: true, topic: null });
    expect(crisisTopicsIn(['he hits me and I can’t go on'])).toEqual(['abuse', 'distress']);
  });
});

// Re-review round two, 2026-11-19 (HIGH): one note can match two topics, and
// "Back to Coach" must show the card of each before it sets those words aside.
describe('crisisTopicsIn', () => {
  it('is empty for a clean scan, and skips null and empty entries', () => {
    expect(crisisTopicsIn([])).toEqual([]);
    expect(crisisTopicsIn([null, undefined, '', 'Ship the prototype by Friday'])).toEqual([]);
    expect(crisisTopicsIn(['Sam beats me at chess', 'Cut myself some slack this week'])).toEqual([]);
  });

  it.each([
    ['I want to die', ['self_harm']],
    ['I will starve myself until the weigh-in', ['eating_disorder']],
    ['he hits me when I am late', ['abuse']],
    ['I cannot go on like this', ['distress']],
  ])('names the one topic of %p', (text, topics) => {
    expect(crisisTopicsIn([text])).toEqual(topics);
  });

  it('names both topics of one note, in rank order', () => {
    expect(crisisTopicsIn(["he hits me when he drinks and I can't go on"])).toEqual(['abuse', 'distress']);
    expect(crisisTopicsIn(['I can’t go on, he hits me when he drinks'])).toEqual(['abuse', 'distress']);
    expect(crisisTopicsIn(['he hits me and I want to die'])).toEqual(['self_harm', 'abuse']);
  });

  it('names every topic in rank order, wherever each sits in the words', () => {
    expect(crisisTopicsIn(['I can’t go on, he hits me, I starve myself, I want to die'])).toEqual([
      'self_harm',
      'eating_disorder',
      'abuse',
      'distress',
    ]);
  });

  it('reads across texts, each topic once', () => {
    expect(crisisTopicsIn(['he hits me', 'I want to die', 'he hits me again', null])).toEqual(['self_harm', 'abuse']);
  });

  it('keeps the carve-outs: an idiom adds no topic beside a real one', () => {
    expect(crisisTopicsIn(['Sam beats me at chess and I can’t go on'])).toEqual(['distress']);
    expect(crisisTopicsIn(['he beats me at poker night and I can’t go on'])).toEqual(['abuse', 'distress']);
  });

  // The same readings and patterns: its first topic is always the scan's.
  it.each([
    [['Ship the prototype']],
    [['I want to die']],
    [['he hits me when he drinks and I can’t go on']],
    [['Not eating for 16 hours today', 'breaking down in tears at work']],
    [['ｓｕｉｃｉｄｅ', 'he hits me']],
    [['I can‘t do this any more', 'make myself throw up after dinner']],
    [['self–harm again']],
    [[null, 'She always beats me to it', '']],
  ])('agrees with scanForCrisis on %p', (texts) => {
    const topics = crisisTopicsIn(texts);
    const scan = scanForCrisis(texts);
    expect(topics[0] ?? null).toBe(scan.topic);
    expect(topics.length === 0).toBe(scan.safe);
  });
});

describe('supportResource', () => {
  // A US phone, whatever the machine running the tests is set to.
  beforeEach(() => __setDeviceLocaleForTests('en-US'));
  afterEach(() => __setDeviceLocaleForTests(null));

  it('returns nothing for a clean scan', () => {
    expect(supportResource({ safe: true, topic: null })).toBeNull();
  });

  // The owner, 2026-11-20: 988 on every topic on a US phone, as on a
  // territory's, open at all hours; no line of its own for any topic.
  it.each(['self_harm', 'eating_disorder', 'abuse', 'distress'] as const)(
    'points %s signals at the crisis lifeline',
    (topic) => {
      const r = supportResource({ safe: false, topic });
      expect(r?.contact).toBe(
        '988 Suicide & Crisis Lifeline — call or text 988 (US)\nOutside the US: search for a crisis line in your country, or call your local emergency number.',
      );
    },
  );

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
  // was told "in your country" and shown no number. Main session, 2026-11-19
  // (decision 13): 988 on every topic there, the one line confirmed in all
  // five territories and one for any emotional distress (SAMHSA's 988 FAQ,
  // 988lifeline.org), and a second line that says neither "the US" nor "your
  // country". The owner, 2026-11-20: 988 on every topic on a US phone too,
  // and the eating-disorder and domestic-violence numbers out of the app.
  const territory =
    "988 Suicide & Crisis Lifeline — call or text 988\nIf 988 doesn't connect where you are: search for a local crisis line, or call your local emergency number.";
  const usPhone = `988 Suicide & Crisis Lifeline — call or text 988 (US)\n${elsewhere}`;

  it('pins the territory lines', () => {
    expect(TERRITORY_LIFELINE_CONTACT).toBe('988 Suicide & Crisis Lifeline — call or text 988');
    expect(TERRITORY_FALLBACK_CONTACT).toBe(
      "If 988 doesn't connect where you are: search for a local crisis line, or call your local emergency number.",
    );
    expect(TERRITORY_FALLBACK_CONTACT).not.toMatch(/the US|your country|\.com|\.org|https?:|www\./i);
  });

  it('pins the US line: the territory line with "(US)"', () => {
    expect(US_LIFELINE_CONTACT).toBe('988 Suicide & Crisis Lifeline — call or text 988 (US)');
    expect(US_LIFELINE_CONTACT).toBe(`${TERRITORY_LIFELINE_CONTACT} (US)`);
  });

  describe.each(['PR', 'GU', 'VI', 'AS', 'MP'])('on a phone set to %s', (region) => {
    it.each(['self_harm', 'eating_disorder', 'abuse', 'distress'] as const)(
      'gives 988 and the territory line for %s, with the topic’s own words',
      (topic) => {
        const r = supportResource({ safe: false, topic }, region)!;
        const us = supportResource({ safe: false, topic }, 'US')!;
        expect(r).toEqual({ title: us.title, body: us.body, contact: territory });
        expect(r.contact).not.toMatch(/\(US\)|the US|your country|1-8/);
      },
    );
  });

  it('reads a territory from the phone too', () => {
    __setDeviceLocaleForTests('es-PR');
    expect(supportResource({ safe: false, topic: 'self_harm' })!.contact).toBe(territory);
    expect(supportResource({ safe: false, topic: 'abuse' })!.contact).toBe(territory);
    __setDeviceLocaleForTests('en-GU');
    expect(supportResource({ safe: false, topic: 'eating_disorder' })!.contact).toBe(territory);
  });

  // Every topic, every kind of region, character for character: the contact
  // by region alone (the owner, 2026-11-20), and each topic's own title and
  // body under it, as they were.
  const TOPIC_WORDS = {
    self_harm: {
      title: 'Support is available',
      body: 'If you are going through something heavy, talking to someone can help. Trained people are there to listen.',
    },
    eating_disorder: {
      title: 'Support is available',
      body: 'If your relationship with food or your body is weighing on you, there are people who can help.',
    },
    abuse: {
      title: 'Support is available',
      body: 'If someone is hurting you or you feel unsafe, there are people you can talk to.',
    },
    distress: {
      title: 'Support is available',
      body: 'If things feel like a lot right now, talking to someone can help.',
    },
  } as const;
  const CONTACT_BY_REGION: ReadonlyArray<[string | null, string]> = [
    ['US', usPhone],
    [null, usPhone],
    ['PR', territory],
    ['GU', territory],
    ['VI', territory],
    ['AS', territory],
    ['MP', territory],
    ['CA', elsewhere],
  ];

  describe.each(['self_harm', 'eating_disorder', 'abuse', 'distress'] as const)('for %s', (topic) => {
    it.each(CONTACT_BY_REGION)('on a phone set to %p, gives exactly its contact', (region, contact) => {
      expect(supportResource({ safe: false, topic }, region)).toEqual({ ...TOPIC_WORDS[topic], contact });
    });
  });

  it('gives both when the region cannot be read', () => {
    const r = supportResource({ safe: false, topic: 'abuse' }, null)!;
    expect(r.contact).toBe(`988 Suicide & Crisis Lifeline — call or text 988 (US)\n${elsewhere}`);
  });

  // The owner, 2026-11-20: the National Alliance for Eating Disorders'
  // helpline and the National Domestic Violence Hotline left the app. Neither
  // number, in any spacing, nor either name, on any topic in any region: every
  // two-letter region, two UN M.49 ones (as in "es-419"), and none.
  it('names neither removed helpline on any topic in any region', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const regions: Array<string | null> = [null, '419', '001'];
    for (const a of letters) for (const b of letters) regions.push(a + b);
    for (const topic of ['self_harm', 'eating_disorder', 'abuse', 'distress'] as const) {
      for (const region of regions) {
        const r = supportResource({ safe: false, topic }, region)!;
        const shown = `${r.title}\n${r.body}\n${r.contact}`;
        const digits = shown.replace(/\D/g, '');
        expect({ topic, region, removedNumber: /8666621235|8007997233/.test(digits) }).toEqual({
          topic,
          region,
          removedNumber: false,
        });
        expect(shown).not.toMatch(/1-866|1-800|662-1235|799-7233|Eating Disorders|Domestic Violence|Hotline/i);
      }
    }
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
  // or outcome, on any topic. The contact too: 988 is on every topic for its
  // hours (the owner, 2026-11-20), but the card doesn't promise them.
  it('promises nothing about confidentiality or hours', () => {
    for (const topic of ['self_harm', 'eating_disorder', 'abuse', 'distress'] as const) {
      for (const region of ['US', 'GB', 'PR', null]) {
        const r = supportResource({ safe: false, topic }, region)!;
        expect(`${r.title} ${r.body} ${r.contact}`).not.toMatch(
          /confidential|any time|24\/7|24 hours|always|guarantee/i,
        );
      }
    }
  });
});
