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
// suppressed insight costs the user nothing they can't get by tapping again
// tomorrow; a missed signal costs something real. So the patterns below are
// phrase-shaped rather than keyword-shaped: "kill" alone would fire on "I'll
// kill this presentation", which is both useless and alarming.

import { deviceRegion } from '@/constants/locale';

/** Which support resource the surface should point at. */
export type CrisisTopic = 'self_harm' | 'eating_disorder' | 'abuse' | 'distress';

export interface CrisisScan {
  /** false → suppress all coaching and render the support surface. */
  safe: boolean;
  topic: CrisisTopic | null;
}

const SAFE: CrisisScan = { safe: true, topic: null };

// Ordered: the more specific topics are tested first so the support surface
// points at the most appropriate resource rather than the generic one.
const PATTERNS: ReadonlyArray<{ topic: CrisisTopic; pattern: RegExp }> = [
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
    // "cannot" and "can not" are spelled out at least as often as "can't" in
    // written reflections, so all three forms have to match.
    topic: 'distress',
    pattern:
      /\b(can'?t|cannot|can not) (go on|take (this|it) any\s?more|do this any\s?more)\b|\b(breaking down|falling apart completely|hopeless about everything|nothing matters any\s?more)\b/i,
  },
];

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
  for (const { topic, pattern } of PATTERNS) {
    for (const text of texts) {
      if (!text) continue;
      if (pattern.test(text)) return { safe: false, topic };
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
 * The support content for a scan result, or null when the scan was clean.
 * The contact follows the phone's region: on a US phone, or when the region
 * can't be read, the US line and then the line for elsewhere (someone with a
 * US phone may be abroad); on any other phone, the line for elsewhere alone.
 */
export function supportResource(
  scan: CrisisScan,
  region: string | null = deviceRegion(),
): SupportResource | null {
  if (!scan.topic) return null;
  const us = RESOURCES[scan.topic];
  return {
    ...us,
    contact:
      region === 'US' || region === null
        ? `${us.contact}\n${INTERNATIONAL_CONTACT}`
        : INTERNATIONAL_CONTACT,
  };
}
