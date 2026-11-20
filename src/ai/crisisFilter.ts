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
// (src/store/coachStore.ts), so a match replaces the Coach with the support
// card on every request until the person sets the card aside ("Back to
// Coach", D71 (b)). `useCoachStore.backToCoach` then remembers each
// prediction that matched by its id and a hash of its title and note
// (src/engine/supportAside.ts), on this phone only, once the card of every
// topic its words match has been shown (`crisisTopicsIn`), and
// `requestInsights` leaves those out of the scan. A new matching prediction,
// or a changed title or note on one set aside, brings the card back; words a
// caller passes in are screened whole. Setting it aside is a step the person
// has to take each time it comes back, so the patterns below are still
// phrase-shaped rather than keyword-shaped: "kill" alone would fire on "I'll
// kill this presentation", which is both useless and alarming. A few idioms
// that matched are carved out (security review, 2026-11-18; narrowed
// 2026-11-19), each only where the words can't be the distress reading.
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

// The carve-outs (security review, 2026-11-18; narrowed 2026-11-19, Coach
// re-review F, main session's decision). Each is a negative lookahead on one
// phrase, never a change to the rest of its pattern, and each keeps the
// distress readings of the same words: "beats me at home", "cutting myself
// again", "breaking down in tears", "not eating for days" all still match.
// Only phrasings that can't be the distress reading are carved out: a missed
// disclosure costs more than an unneeded support card. "beats me by 9",
// "beats me at game night", "beats me to it" and fasting past 16 hours match
// again.
//
//   "beats me" at or in a named game ("Sam beats me at chess"). A short,
//   explicit list: never "game", "games" or "sports", which can be a place
//   or a time ("he beats me at game night"); and never when a place or a
//   time follows the game ("he beats me at poker night", "at chess club",
//   "at tennis practice", "at cards at home"), which those words can be the
//   distress reading of (round 6, 2026-11-19).
const GAME_THEN_PLACE_OR_TIME =
  '(?:\\s+|\\s*-\\s*)(?:(?:at|after|before|during|on|in|every|each|last|this|that)\\s+)?(?:nights?|tonight|clubs?|practices?|class(?:es)?|camps?|lessons?|home|work|school)\\b';
const BEATS_ME = `beats me(?!\\s+(?:at|in)\\s+(?:chess|checkers|tennis|padel|squash|badminton|golf|darts|cards|poker|scrabble|wordle|ping[\\s-]?pong|pickleball|mario\\s+kart|catan)\\b(?!${GAME_THEN_PLACE_OR_TIME}))`;
//   "cut myself (some) slack".
const CUT_MYSELF = 'cut(ting)? myself(?!\\s+(?:some\\s+)?slack\\b)';
//   "breaking down" with a thing as its object ("breaking down the moving
//   boxes", "breaking down a big project"). Intransitive uses all still match.
const BREAKING_DOWN =
  'breaking down(?!\\s+(?:(?:the|a|an|this|that|these|those|my|our|all|some|old|moving|cardboard|big|large|empty)\\s+)*(?:boxes|box|cardboard|tasks?|projects?|problems?|steps|goals?|data|numbers|costs?|budget|barriers|walls?|recipes?)\\b)';
//   "not eating for" a fasting window of 1 to 16 hours ("for 16 hours").
//   Days, weeks, "a while", or 17 hours and more still match.
const NOT_EATING_FOR = 'not eat(ing)? (?:for(?!\\s+(?:[1-9]|1[0-6])\\s*(?:hours?|hrs?|h)\\b)|at all)';

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

/** Every reading of every text; null and empty entries have none. */
function readAll(texts: ReadonlyArray<string | null | undefined>): string[][] {
  return texts.map((text) => (text ? readings(text) : []));
}

/** Whether `pattern` matches any reading of any text. */
function matchesAny(pattern: RegExp, read: ReadonlyArray<readonly string[]>): boolean {
  return read.some((forms) => forms.some((form) => pattern.test(form)));
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
  const read = readAll(texts);
  for (const { topic, pattern } of PATTERNS) {
    if (matchesAny(pattern, read)) return { safe: false, topic };
  }
  return SAFE;
}

/**
 * Every topic the texts trip, in the filter's own rank order (the order
 * `scanForCrisis` tries them, so its topic is always the first here), each
 * once; empty when the scan is clean. The same readings and the same
 * patterns, carve-outs included, as `scanForCrisis`: a topic is here exactly
 * when that scan would name it with every higher-ranked pattern taken away.
 * For "Back to Coach" (src/store/coachStore.ts, review 2026-11-19): one note
 * can match two topics ("he hits me when he drinks and I can't go on"), and
 * the card of each must be shown before those words are set aside.
 *
 * Null and empty entries are skipped, as by `scanForCrisis`. Pure.
 */
export function crisisTopicsIn(texts: ReadonlyArray<string | null | undefined>): CrisisTopic[] {
  const read = readAll(texts);
  return PATTERNS.filter(({ pattern }) => matchesAny(pattern, read)).map(({ topic }) => topic);
}

export interface SupportResource {
  title: string;
  body: string;
  /** What to show as the contact line: by the phone's region (below). */
  contact: string;
}

/**
 * Outside the US. 988, below, is a US line, and the app is sold in other
 * English-language storefronts, where a US number can't be called (policy
 * audit, 2026-11-14; §5.5 asks for region-appropriate resources).
 * No number per country: a wrong one costs more than a missing one. And no
 * named directory: Find A Helpline's terms require written permission for
 * commercial use, which a paid feature is (policy audit of step 182,
 * 2026-11-15; guideline 5.2.2). Naming it waits on that permission.
 */
export const INTERNATIONAL_CONTACT =
  'Outside the US: search for a crisis line in your country, or call your local emergency number.';

// Each topic's own title and body, the same on every phone. Deliberately
// non-clinical, and makes no categorical promise about confidentiality, hours
// or outcome (§5.5): the words sit above services the app can't vouch for.
// The contact under them is the same for every topic and follows the phone's
// region (`supportResource`): 988 first on a US or US-territory phone, or one
// whose region can't be read; the line above alone anywhere else.
const RESOURCES: Record<CrisisTopic, Omit<SupportResource, 'contact'>> = {
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
};

/**
 * The US territories a phone names as its own region: Puerto Rico, Guam, the
 * US Virgin Islands, American Samoa and the Northern Mariana Islands. Until
 * 2026-11-15 they got the line for elsewhere alone, "in your country", and no
 * number (code review of step 182); until 2026-11-19, 988 on two topics only.
 */
const US_TERRITORIES: ReadonlySet<string> = new Set(['PR', 'GU', 'VI', 'AS', 'MP']);

/**
 * A territory phone's first line, on every topic (main session, 2026-11-19,
 * decision 13, delegated by the owner): 988, the one line confirmed in all
 * five territories, and one that takes calls about any emotional distress,
 * not only suicide. Checked on 2026-11-19:
 *
 *   SAMHSA, "988 Frequently Asked Questions" (last updated 12/16/2025),
 *   https://www.samhsa.gov/mental-health/988/faqs
 *     Q: "Is the 988 Suicide & Crisis Lifeline available in all states and
 *     all five territories?" A: "Yes." … "Anyone located in a U.S. state,
 *     territory or tribal land with access to telephone, cellular, or internet
 *     services" … "There are many reasons that people connect with the 988
 *     Lifeline beyond suicide." … "problems with drug or alcohol use,
 *     emotional distress, anxiety, depression, mental illness" … "offering
 *     one-on-one support for mental health, suicide, and substance use-related
 *     problems for anyone 24/7."
 *   988 Lifeline, "Get Help", https://988lifeline.org/get-help/
 *     "connects individuals in need of support with counselors across the
 *     United States and its territories." "People do not have to be suicidal
 *     to call." "Reasons to call include: substance use disorder, economic
 *     worries, relationships, culture and identity, illness, … intimate
 *     partner violence, depression, mental and physical illness, and
 *     loneliness."
 *
 * No "(US)": on a territory phone it would read as a line for somewhere
 * else. A US phone's first line is the same with "(US)" (`US_LIFELINE_CONTACT`).
 */
export const TERRITORY_LIFELINE_CONTACT = '988 Suicide & Crisis Lifeline — call or text 988';

/**
 * A US phone's first line, on every topic, and the first line when the
 * region can't be read (the owner, 2026-11-20): 988, as on a territory phone,
 * with "(US)", since the line for elsewhere follows it (someone with a US
 * phone may be abroad).
 *
 * Until then only the self-harm and distress topics named 988 here: the
 * eating-disorder topic named the National Alliance for Eating Disorders'
 * helpline alone, and the abuse topic the National Domestic Violence
 * Hotline's alone. The owner's reasons: the Alliance's own site gives its
 * helpline hours as weekdays 9 am to 7 pm Eastern, so outside them the card
 * pointed at a line nobody answers, while 988 is there "for anyone 24/7" and
 * takes calls about any emotional distress, "intimate partner violence" among
 * the reasons the Lifeline lists (SAMHSA and the 988 Lifeline, quoted above);
 * and he wants fewer helplines in the app, not more, since its purpose isn't
 * to connect people to helplines. Both numbers and both names left the app
 * that day, on every phone, so there is nothing left to ask either
 * organisation about the territories either.
 */
export const US_LIFELINE_CONTACT = `${TERRITORY_LIFELINE_CONTACT} (US)`;

/**
 * A territory phone's second line, on every topic: what to do if 988 doesn't
 * get through, without "the US" or "your country", both the wrong frame for a
 * territory. Names no number and no website, like the line for elsewhere.
 */
export const TERRITORY_FALLBACK_CONTACT =
  "If 988 doesn't connect where you are: search for a local crisis line, or call your local emergency number.";

/**
 * The support content for a scan result, or null when the scan was clean.
 * Each topic keeps its own title and body everywhere; the contact is the same
 * for every topic and follows the phone's region:
 *   - a US phone, or a region that can't be read: 988, then the line for
 *     elsewhere (someone with a US phone may be abroad) (`US_LIFELINE_CONTACT`,
 *     `INTERNATIONAL_CONTACT`);
 *   - a US territory's phone: 988 and the territory's fallback line
 *     (`TERRITORY_LIFELINE_CONTACT`, `TERRITORY_FALLBACK_CONTACT`);
 *   - any other phone: the line for elsewhere alone.
 */
export function supportResource(
  scan: CrisisScan,
  region: string | null = deviceRegion(),
): SupportResource | null {
  if (!scan.topic) return null;
  const words = RESOURCES[scan.topic];
  if (region !== null && US_TERRITORIES.has(region)) {
    return { ...words, contact: `${TERRITORY_LIFELINE_CONTACT}\n${TERRITORY_FALLBACK_CONTACT}` };
  }
  const showUsLine = region === 'US' || region === null;
  return {
    ...words,
    contact: showUsLine ? `${US_LIFELINE_CONTACT}\n${INTERNATIONAL_CONTACT}` : INTERNATIONAL_CONTACT,
  };
}
