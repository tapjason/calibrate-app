// Coach output validator (COACH_AGENT.md §5.1, §5.8, §6).
//
// This is the component that makes the Coach's grounding claim true. Every
// insight must cite an `evidence` number that appears in the CoachContext the
// model was given; anything else is dropped, silently and without negotiation.
// A model that hallucinates a statistic about someone's own judgment is worse
// than no Coach at all, which is why the failure mode here is "show nothing".
//
// The validator also enforces min-N: no verdict on a category under
// MIN_N_CATEGORY or overall under MIN_N_OVERALL. Below threshold the only
// admissible insight is encouragement to keep logging.
//
// It runs on the client even though the Edge Function validates too (§3, "server
// + client"). The client is the last thing standing between a bad payload and
// the user's screen, and it is the half we can be sure ships together.

import {
  MIN_N_CATEGORY,
  MIN_N_OVERALL,
  type Category,
  type CoachContext,
  type CoachInsight,
  type CoachInsightType,
  type CoachOutput,
} from '@/types';

const MAX_INSIGHTS = 3;
const MAX_MESSAGE_LENGTH = 240;
const MAX_SUGGESTION_LENGTH = 240;

/**
 * How close a cited number must be to a real one, PER SCALE.
 *
 * Half a unit absorbs the rounding a model does when it writes 55 for 54.7 on
 * a 0–100 figure. Applied to a 0–1 rate it is a ±50-percentage-point window,
 * which grounds essentially any fabricated rate: with an actual_rate of 0.5,
 * "you hit 90% of your health calls" (evidence 0.9) would pass. The tolerance
 * has to match the scale of the value it is checking.
 */
const TOLERANCE_ABSOLUTE = 0.5; // fractional 0–100 figures — scores, means
const TOLERANCE_RATE = 0.005; // fractional 0–1 rates; absorbs 0.548 → 0.55
const TOLERANCE_EXACT = 1e-9; // integers — see below

/**
 * Tolerance exists to absorb display rounding, and an integer has none to
 * absorb: a resolution count of 25 is cited as 25, a weekday index of 1 as 1.
 * Granting those ±0.5 makes small values into wide windows — a day index of 1
 * would ground any claim between 0.5 and 1.5, which is how a fabricated
 * `0.9` hit rate slips through on the back of an unrelated pattern value.
 */
function toleranceFor(value: number, scale: 'rate' | 'absolute'): number {
  if (Number.isInteger(value)) return TOLERANCE_EXACT;
  return scale === 'rate' ? TOLERANCE_RATE : TOLERANCE_ABSOLUTE;
}

/**
 * Out-of-domain advice the Coach must never give (§5.4): substantive medical,
 * financial, or legal direction, and numeric diet/weight/exercise targets.
 *
 * The system prompt already forbids all of this. This is the second lock,
 * because a prompt is a request and a validator is a guarantee — and grounding
 * alone would not catch it: "move 40% into bonds" cites a real number if 40
 * happens to appear in the context, and would otherwise sail through.
 */
const DOMAIN_ADVICE = [
  // Financial direction
  /\b(invest|buy|sell|short|allocate|move|shift|put)\b[^.]*\b(stocks?|bonds?|crypto|shares?|portfolio|savings|your money|\d+\s?%)/i,
  /\b(financial advisor|investment advice)\b/i,
  // Medical / clinical
  /\b(dose|dosage|medication|prescri(be|ption)|diagnos(e|is|ed)|symptoms? of|you (may|might) have)\b/i,
  // Legal
  /\b(sue|lawsuit|legal advice|liable|breach of contract)\b/i,
  // Numeric health targets — out of scope entirely, per §5.4.
  /\b\d+\s?(calories|kcal|lbs?|pounds|kg|kilos|reps|miles|km)\b/i,
  /\b(lose|gain|cut|burn)\b[^.]*\b\d+\s?(lbs?|pounds|kg|kilos|calories|kcal)\b/i,
  /\bBMI\b/,
];

function looksLikeDomainAdvice(insight: CoachInsight): boolean {
  const text = `${insight.message} ${insight.suggestion ?? ''}`;
  return DOMAIN_ADVICE.some((p) => p.test(text));
}

const INSIGHT_TYPES: readonly CoachInsightType[] = [
  'overconfidence',
  'underconfidence',
  'strength',
  'pattern',
  'encouragement',
];

const CATEGORIES: readonly Category[] = [
  'work',
  'health',
  'finance',
  'social',
  'personal',
];

/**
 * Nothing to show. A factory, not a shared constant: the returned object ends
 * up in Zustand state, and handing every caller the same `insights` array
 * would let one future in-place mutation leak across unrelated results.
 */
const empty = (): CoachOutput => ({ insights: [], safe: true });

/** A number the model was allowed to see, with the tolerance for its scale. */
interface GroundedValue {
  value: number;
  tolerance: number;
}

/**
 * Every number the model was allowed to see.
 *
 * Rates arrive as 0–1 and the model routinely cites them as percentages, so
 * each rate is admissible in both forms. That is not a loosening of grounding:
 * 0.55 and 55% are the same fact, and the alternative is dropping correct
 * insights over a unit convention. Each form carries its own tolerance.
 */
function groundedValues(context: CoachContext): GroundedValue[] {
  const values: GroundedValue[] = [];
  const absolute = (value: number) =>
    values.push({ value, tolerance: toleranceFor(value, 'absolute') });
  const rate = (value: number) =>
    values.push({ value, tolerance: toleranceFor(value, 'rate') });

  absolute(context.overall.calibration_rating);
  absolute(context.overall.total_resolved);

  for (const c of context.by_category) {
    absolute(c.resolved);
    absolute(c.calibration_score);
    absolute(c.mean_stated_confidence);
    rate(c.actual_rate);
    if (c.actual_rate >= 0 && c.actual_rate <= 1) absolute(c.actual_rate * 100);
  }

  for (const p of context.patterns) absolute(p.value);

  return values;
}

function isGrounded(evidence: number, values: readonly GroundedValue[]): boolean {
  return values.some((v) => Math.abs(v.value - evidence) <= v.tolerance);
}

function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

/**
 * Whether there is enough data behind an insight to allow a verdict.
 * Encouragement is exempt — "keep logging" is precisely what a thin category
 * should produce.
 */
function clearsMinimumN(insight: CoachInsight, context: CoachContext): boolean {
  if (insight.type === 'encouragement') return true;

  if (insight.category === 'overall') {
    return context.overall.total_resolved >= MIN_N_OVERALL;
  }

  const stat = context.by_category.find((c) => c.category === insight.category);
  // A verdict about a category absent from the payload is ungrounded by
  // definition.
  if (!stat) return false;
  return stat.resolved >= MIN_N_CATEGORY;
}

/** Narrow one raw item to a CoachInsight, or null if it doesn't hold up. */
function parseInsight(raw: unknown): CoachInsight | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (!INSIGHT_TYPES.includes(r.type as CoachInsightType)) return null;

  const category = r.category;
  const validCategory =
    category === 'overall' || CATEGORIES.includes(category as Category);
  if (!validCategory) return null;

  if (!isNonEmptyString(r.message, MAX_MESSAGE_LENGTH)) return null;

  if (typeof r.evidence !== 'number' || !Number.isFinite(r.evidence)) return null;

  const insight: CoachInsight = {
    type: r.type as CoachInsightType,
    category: category as Category | 'overall',
    message: r.message,
    evidence: r.evidence,
  };

  // Optional, and dropped rather than rejected when malformed — a bad
  // suggestion shouldn't cost the user a good observation.
  if (isNonEmptyString(r.suggestion, MAX_SUGGESTION_LENGTH)) {
    insight.suggestion = r.suggestion;
  }

  return insight;
}

/**
 * Validate a raw Coach response against the context it was given.
 *
 * Returns at most three insights. Anything unparseable, ungrounded, or below
 * the minimum-N bar is dropped; if that leaves nothing, the surface renders
 * nothing, which is the intended fail-safe (§5.8).
 *
 * A response marked `safe: false` — the crisis path — returns no insights at
 * all, regardless of what else it contains.
 */
export function validateCoachOutput(
  raw: unknown,
  context: CoachContext,
): CoachOutput {
  if (typeof raw !== 'object' || raw === null) return empty();
  const r = raw as Record<string, unknown>;

  if (r.safe === false) return { insights: [], safe: false };

  if (!Array.isArray(r.insights)) return empty();

  const values = groundedValues(context);
  const insights: CoachInsight[] = [];

  for (const item of r.insights) {
    const insight = parseInsight(item);
    if (!insight) continue;
    if (!isGrounded(insight.evidence, values)) continue;
    if (!clearsMinimumN(insight, context)) continue;
    if (looksLikeDomainAdvice(insight)) continue;

    insights.push(insight);
    if (insights.length === MAX_INSIGHTS) break;
  }

  return { insights, safe: true };
}
