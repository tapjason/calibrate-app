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
  /** What to show as the contact line. Region-specific; US defaults for now. */
  contact: string;
}

// Deliberately non-clinical, and makes no categorical promise about
// confidentiality or outcome (§5.5). These are US resources — localizing them
// is an open item, tracked in COACH_AGENT.md §10.
const RESOURCES: Record<CrisisTopic, SupportResource> = {
  self_harm: {
    title: 'Support is available',
    body: 'If you are going through something heavy, talking to someone can help. Trained people are available any time.',
    contact: '988 Suicide & Crisis Lifeline — call or text 988 (US)',
  },
  eating_disorder: {
    title: 'Support is available',
    body: 'If your relationship with food or your body is weighing on you, there are people who can help.',
    contact: 'National Alliance for Eating Disorders — 1-866-662-1235 (US)',
  },
  abuse: {
    title: 'Support is available',
    body: 'If someone is hurting you or you feel unsafe, you can talk to someone confidentially.',
    contact: 'National Domestic Violence Hotline — 1-800-799-7233 (US)',
  },
  distress: {
    title: 'Support is available',
    body: 'If things feel like a lot right now, talking to someone can help.',
    contact: '988 Suicide & Crisis Lifeline — call or text 988 (US)',
  },
};

/** The support content for a scan result, or null when the scan was clean. */
export function supportResource(scan: CrisisScan): SupportResource | null {
  return scan.topic ? RESOURCES[scan.topic] : null;
}
