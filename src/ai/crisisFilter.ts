// Crisis pre-filter (COACH_AGENT.md §5.5). A hard safeguard, not a heuristic
// nicety.
//
// The rule it enforces: if freetext entering the Coach pipeline signals
// self-harm, suicidal ideation, abuse, or acute distress, that text never
// becomes coaching input. The filter runs BEFORE the model call — suppressing
// a bad answer after the fact would mean the content was sent anyway, and the
// spec is explicit that it must not be.
//
// The Coach never counsels, assesses risk, or diagnoses. It steps back and
// points to humans.
//
// On matching: coaching is suppressed entirely and the caller shows the
// support surface. False positives are the acceptable direction to err — a
// missed signal costs something real — but they aren't free: the store scans
// every answered prediction's title and note on each request
// (src/store/coachStore.ts), and an answered title can't be edited, so a
// match keeps the Coach replaced by the support card for as long as that
// prediction is in the record (a note can be changed or removed). So the
// patterns below are phrase-shaped rather than keyword-shaped: "kill" alone
// would fire on "I'll kill this presentation", which is both useless and
// alarming. A few idioms that matched are carved out (security review,
// 2026-11-18), each only where the words can't be the distress reading.
//
// Every text is read as typed and again with the iPhone's curly apostrophes
// and dashes made plain, whitespace collapsed and NFKC applied, and a match in
// any reading counts: those readings only ever add matches. iOS types "can’t"
// (U+2019) by default, which "can'?t" missed.

import { deviceRegion } from '@/constants/locale';

/** Which support resource the surface should point at. */
export type CrisisTopic = 'self_harm' | 'eating_disorder' | 'abuse' | 'distress';

export interface CrisisScan {
  /** false → suppress all coaching and render the support surface. */
  safe: boolean;
  topic: CrisisTopic | null;
}

const SAFE: CrisisScan = { safe: true, topic: null };

// The carve-outs (security review, 2026-11-18). Each is a negative lookahead
// on one phrase, never a change to the rest of its pattern, and each keeps the
// distress readings of the same words: "beats me at home", "cutting myself
// again", "breaking down in tears", "not eating for days" all still match.
//
//   "beats me" at a game ("Sam beats me at chess"), "to it", "by 3".
const BEATS_ME =
  'beats me(?!\\s+(?:at|in)\\s+(?:chess|checkers|tennis|squash|badminton|golf|pool|darts|cards|poker|scrabble|wordle|trivia|ping[\\s-]?pong|pickleball|basketball|soccer|football|bowling|racing|races?|running|video games?|board games?|games?|sports?)\\b|\\s+to\\s+it\\b|\\s+by\\s+\\d)';
//   "cut myself (some) slack".
const CUT_MYSELF = 'cut(ting)? myself(?!\\s+(?:some\\s+)?slack\\b)';
//   "breaking down" with a thing as its object ("breaking down the moving
//   boxes", "breaking down the problem"). Intransitive uses all still match.
const BREAKING_DOWN =
  'breaking down(?!\\s+(?:(?:the|these|those|my|our|all|some|old|moving|cardboard|big|large|empty)\\s+)*(?:boxes|box|cardboard|tasks?|projects?|problems?|steps|goals?|data|numbers|costs?|budget|barriers|walls?|recipes?)\\b)';
//   "not eating for" a fasting window of up to 20 hours ("for 16 hours").
//   Days, weeks, "a while", or 21 hours and more still match.
const NOT_EATING_FOR = 'not eat(ing)? (?:for(?!\\s+(?:[1-9]|1\\d|20)\\s*(?:hours?|hrs?|h)\\b)|at all)';

// Ordered: the more specific topics are tested first so the support surface
// points at the most appropriate resource rather than the generic one.
const PATTERNS: ReadonlyArray<{ topic: CrisisTopic; pattern: RegExp }> = [
  {
    topic: 'self_harm',
    pattern: new RegExp(
      `\\b(kill(ing)? myself|end(ing)? (my life|it all)|take my own life|want(ed)? to die|better off dead|suicid(e|al)|self[-\\s]?harm|hurt(ing)? myself|${CUT_MYSELF}|no reason to (live|go on))\\b`,
      'i',
    ),
  },
  {
    topic: 'eating_disorder',
    pattern: new RegExp(
      `\\b(starv(e|ing) myself|make myself (throw up|vomit|sick)|purg(e|ing) after|binge and purge|stop eating (entirely|completely)|${NOT_EATING_FOR}|hate my body so much)\\b`,
      'i',
    ),
  },
  {
    topic: 'abuse',
    pattern: new RegExp(
      `\\b(hits me|${BEATS_ME}|hurts me|abus(es|ing) me|being abused|afraid of (him|her|them|my partner)|threatens to hurt me)\\b`,
      'i',
    ),
  },
  {
    // "cannot" and "can not" are spelled out at least as often as "can't" in
    // written reflections, so all three forms have to match.
    topic: 'distress',
    pattern: new RegExp(
      `\\b(can'?t|cannot|can not) (go on|take (this|it) any\\s?more|do this any\\s?more)\\b|\\b(${BREAKING_DOWN}|falling apart completely|hopeless about everything|nothing matters any\\s?more)\\b`,
      'i',
    ),
  },
];

/**
 * The ways one text is read: as typed; with curly or modifier apostrophes and
 * the dash family made plain and whitespace collapsed; and the same after
 * NFKC (fullwidth letters, no-break spaces, ligatures). A pattern matching any
 * reading is a match, so a reading can only add matches, never lose one.
 */
function readings(text: string): string[] {
  const plain = (s: string) =>
    s
      .replace(/[‘’‛ʼ′´`＇]/g, "'")
      .replace(/[‐‑‒–—−]/g, '-')
      .replace(/\s+/g, ' ');
  const out = [text, plain(text)];
  try {
    out.push(plain(text.normalize('NFKC')));
  } catch {
    // No normaliser: the first two readings still stand.
  }
  return out;
}

/**
 * Scan freetext for distress signals. Any match suppresses coaching for the
 * whole request — the pipeline is not granular enough to safely coach around
 * one flagged item while ignoring it.
 *
 * Null and empty entries are skipped, so callers can pass optional reflections
 * straight through.
 */
export function scanForCrisis(
  texts: ReadonlyArray<string | null | undefined>,
): CrisisScan {
  const read = texts.map((text) => (text ? readings(text) : []));
  for (const { topic, pattern } of PATTERNS) {
    for (const forms of read) {
      if (forms.some((form) => pattern.test(form))) return { safe: false, topic };
    }
  }
  return SAFE;
}

export interface SupportResource {
  title: string;
  body: string;
  /** What to show as the contact line: by the phone's region (below). */
  contact: string;
}

/**
 * Outside the US. The lines below are US numbers, and the app is sold in
 * other English-language storefronts, where a US number can't be called
 * (policy audit, 2026-11-14; §5.5 asks for region-appropriate resources).
 * No number per country: a wrong one costs more than a missing one. And no
 * named directory: Find A Helpline's terms require written permission for
 * commercial use, which a paid feature is (policy audit of step 182,
 * 2026-11-15; guideline 5.2.2). Naming it waits on that permission.
 */
export const INTERNATIONAL_CONTACT =
  'Outside the US: search for a crisis line in your country, or call your local emergency number.';

// Deliberately non-clinical, and makes no categorical promise about
// confidentiality, hours or outcome (§5.5): the words sit above services the
// app can't vouch for. These are US resources; a phone set to another region
// gets the line above.
const RESOURCES: Record<CrisisTopic, SupportResource> = {
  self_harm: {
    title: 'Support is available',
    body: 'If you are going through something heavy, talking to someone can help. Trained people are there to listen.',
    contact: '988 Suicide & Crisis Lifeline — call or text 988 (US)',
  },
  eating_disorder: {
    title: 'Support is available',
    body: 'If your relationship with food or your body is weighing on you, there are people who can help.',
    contact: 'National Alliance for Eating Disorders — 1-866-662-1235 (US)',
  },
  abuse: {
    title: 'Support is available',
    body: 'If someone is hurting you or you feel unsafe, there are people you can talk to.',
    contact: 'National Domestic Violence Hotline — 1-800-799-7233 (US)',
  },
  distress: {
    title: 'Support is available',
    body: 'If things feel like a lot right now, talking to someone can help.',
    contact: '988 Suicide & Crisis Lifeline — call or text 988 (US)',
  },
};

/**
 * The US territories a phone names as its own region: Puerto Rico, Guam, the
 * US Virgin Islands, American Samoa and the Northern Mariana Islands. Until
 * 2026-11-15 they got the line for elsewhere alone, "in your country", and no
 * number (code review of step 182).
 */
const US_TERRITORIES: ReadonlySet<string> = new Set(['PR', 'GU', 'VI', 'AS', 'MP']);

/**
 * The topics whose line is 988, the one line confirmed for the territories:
 * SAMHSA's 988 FAQ says anyone in "a U.S. state, territory or tribal land" can
 * call, chat or text it (policy audit, 2026-11-15). The other two lines aren't
 * confirmed there (the eating-disorders line for none of the five, the
 * domestic-violence line for some), so a territory phone keeps the line for
 * elsewhere on those topics until the owner decides (`docs/SHIP_READINESS.md`).
 */
const LIFELINE_TOPICS: ReadonlySet<CrisisTopic> = new Set<CrisisTopic>(['self_harm', 'distress']);

/**
 * The support content for a scan result, or null when the scan was clean.
 * The contact follows the phone's region: on a US phone, or when the region
 * can't be read, the US line and then the line for elsewhere (someone with a
 * US phone may be abroad); on a US territory's phone the same, for the 988
 * topics only; on any other phone, the line for elsewhere alone.
 */
export function supportResource(
  scan: CrisisScan,
  region: string | null = deviceRegion(),
): SupportResource | null {
  if (!scan.topic) return null;
  const us = RESOURCES[scan.topic];
  const showUsLine =
    region === 'US' ||
    region === null ||
    (US_TERRITORIES.has(region) && LIFELINE_TOPICS.has(scan.topic));
  return {
    ...us,
    contact: showUsLine ? `${us.contact}\n${INTERNATIONAL_CONTACT}` : INTERNATIONAL_CONTACT,
  };
}
