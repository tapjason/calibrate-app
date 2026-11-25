// Coach output validator (COACH_AGENT.md §5.1, §5.3, §5.4, §5.8, §6).
//
// This is the component that makes the Coach's grounding claim true. Every
// number an insight writes, its `evidence` and every number in its message
// and suggestion, must be a figure in the CoachContext the model was given
// that the app itself would show as a number; anything else is dropped,
// silently and without negotiation. A model that hallucinates a statistic
// about someone's own judgment is worse than no Coach at all, which is why
// the failure mode here is "show nothing".
//
// It runs on the client even though the Edge Function validates too (§3,
// "server + client"). The client is the last thing standing between a bad
// payload and the user's screen, and it is the half we can be sure ships
// together: it holds whatever function is deployed to these rules.
//
// THE RULES ARE WRITTEN TWICE ON PURPOSE: the server's copy is
// supabase/functions/coach/contract.ts (Deno can't import from this bundle).
// The two keep the same names and order, and src/ai/coachLockstep.test.ts runs
// one fixture set through both. Change a rule in one, change it in the other.
//
// What is enforced (security review 2026-11-18, accuracy rounds 2026-11-19;
// every check fails closed):
//   - Numbers: the overall rating only from MIN_N_OVERALL scored answers; a
//     category's score, mean stated confidence and hit rate only from
//     MIN_N_CATEGORY in that category; its drift only with DRIFT_HALF_MIN_N in
//     each half; the weekday score only with the overall gate and
//     WEEKDAY_MIN_N answers on that day; the weekday index never. A number
//     that also matches a figure still under its gate is dropped.
//     Encouragement cites counts only. A whole number written for a score,
//     rating, percentage or drift is the app's own rounding (Math.round, as
//     every screen shows it); only a number with decimals has a tolerance.
//   - What a number is: the words beside it say ("score", "answers", "said",
//     "happened"), and the figure it matches must be that kind: a count is
//     never shown as a score, nor a hit rate as what was said, nor as the
//     number that came true (the context holds no such count). A unit right
//     after a number narrows what the words beside it say; a change word
//     ("improved", "slipped") makes it a drift. A number with no such word
//     reads as a score (a count in an encouragement), a percentage as
//     either. Two kinds equally near is ambiguous: dropped. A drift is said
//     with the way it went, and that way agrees with its sign; a negated
//     change word ("didn't improve") says the other way, a negated
//     comparison or noun ("never been better", "no improvement") either
//     way. A change word right before "to" and a number ("fell to 61")
//     makes the number the level reached, not the change, and a score
//     beside a change word says it moved: a citable drift of its scope must
//     back that, said the way the drift went (round 7); so must a score,
//     rating or calibration said to have moved with no number at all ("your
//     finance calibration has been improving"). A count is never what
//     "worked out", "paid off" or "went your way" either.
//   - Whose number: the category named in its clause, else in its sentence,
//     else the label; overall figures only beside a word that says overall
//     ("overall", "your rating", a weekday) where no category is named, or
//     beside "overall", "in total" or "across all" where the sentence names
//     one. Two categories in one clause or sentence beside a number is
//     ambiguous.
//   - Leans: over / under only about categories whose `direction` says
//     exactly that, past MIN_N_CATEGORY; a comparison or contrast with what
//     was said ("less often than you said", "but only", "a gap") only in an
//     over/under card, and a category's stated confidence beside its hit
//     rate only there or within CLOSE_TO_SAID_POINTS; "well calibrated" (and
//     "accurate", "about right", "isn't overconfident"…) only for a
//     `calibrated` category whose stated and happened are within
//     CLOSE_TO_SAID_POINTS, the chart's rule ("no gap between what you said
//     and what happened" is that wording too, round 7); "no clear lean" for
//     any `calibrated` one.
//   - Words: no links, addresses, phone numbers, markup, invisible or unusual
//     characters, spelled-out numbers, badge names, the old and the medals
//     (as badges: "a sharp drop", "just getting started" and "the gold
//     standard" are words), numeric health targets, domain
//     advice, referrals or mental-state claims.

import {
  CATEGORIES,
  isBuiltInCategory,
  MIN_N_CATEGORY,
  MIN_N_OVERALL,
  type BuiltInCategory,
  type CoachContext,
  type CoachEvidenceSource,
  type CoachInsight,
  type CoachInsightType,
  type CoachOutput,
} from '@/types';

import {
  DRIFT_HALF_ANSWERS_PREFIX,
  DRIFT_HALF_MIN_N,
  DRIFT_PREFIX,
  WEEKDAY_ANSWERS_KIND,
  WEEKDAY_KIND,
  WEEKDAY_MIN_N,
  WEEKDAY_SCORE_KIND,
} from './coachPatterns';

export const MAX_INSIGHTS = 3;
export const MAX_MESSAGE_LENGTH = 240;
export const MAX_SUGGESTION_LENGTH = 240;
/** A message or suggestion may break its line once, never more. */
export const MAX_LINE_BREAKS = 1;

/**
 * How close a cited number must be to a real one, PER SCALE.
 *
 * Half a unit absorbs the rounding a model does when it writes 55 for 54.7 on
 * a 0–100 figure. Applied to a 0–1 rate it is a ±50-percentage-point window,
 * which grounds essentially any fabricated rate: with an actual_rate of 0.5,
 * "you hit 90% of your health calls" (evidence 0.9) would pass. The tolerance
 * has to match the scale of the value it is checking.
 *
 * Tolerance exists to absorb display rounding, and an integer has none to
 * absorb: a resolution count of 25 is cited as 25. Granting integers ±0.5
 * makes small values into wide windows.
 */
export const TOLERANCE_ABSOLUTE = 0.5; // fractional 0–100 figures — scores, means
export const TOLERANCE_RATE = 0.005; // fractional 0–1 rates; absorbs 0.548 → 0.55
export const TOLERANCE_EXACT = 1e-9; // integers
/**
 * Added to every tolerance: 0.575 × 100 is 57.49999999999999 in floating
 * point, 0.50000000000001 from "58%", which a 0.5 tolerance alone refused.
 */
export const TOLERANCE_EPSILON = 1e-9;

/**
 * "Well calibrated" needs what was said and what happened within this many
 * whole points: `closeToSaid` in src/components/stats/chartTakeaway.ts, the
 * chart's and the recaps' line between "well calibrated" and "no clear lean"
 * (roadmap D57). Each rounded to a whole percent first, as there.
 * coachThresholds.test.ts pins this rule to that function.
 */
export const CLOSE_TO_SAID_POINTS = 5;

const INSIGHT_TYPES: readonly CoachInsightType[] = [
  'overconfidence',
  'underconfidence',
  'strength',
  'pattern',
  'encouragement',
];

type CategoryEntry = CoachContext['by_category'][number];

/**
 * Nothing to show. A factory, not a shared constant: the returned object ends
 * up in Zustand state, and handing every caller the same `insights` array
 * would let one future in-place mutation leak across unrelated results.
 */
const empty = (): CoachOutput => ({ insights: [], safe: true });

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isBuiltIn = (v: unknown): v is BuiltInCategory => typeof v === 'string' && isBuiltInCategory(v);

/** The chart's rule (chartTakeaway's closeToSaid): within 5 whole points. */
export function closeToSaid(statedPercent: number, happenedPercent: number): boolean {
  return Math.abs(Math.round(statedPercent) - Math.round(happenedPercent)) < CLOSE_TO_SAID_POINTS;
}

// ---------------------------------------------------------------------------
// The words (§5.2, §5.3, §5.4)
// ---------------------------------------------------------------------------

/**
 * Whether this runtime really has NFKC, checked once: a ligature and a
 * fullwidth digit must come back plain. Hermes implements
 * String.prototype.normalize; if a build ever lacked it (or it returned its
 * input unchanged), every card used to drop.
 */
const HAS_NFKC: boolean = (() => {
  try {
    return typeof ''.normalize === 'function' && 'ﬁ８'.normalize('NFKC') === 'fi8';
  } catch {
    return false;
  }
})();

/**
 * Every character a message may hold, after NFKC: printable ASCII, one kind
 * of line break, and the typographic punctuation a model writes in English
 * (hyphen, en and em dashes, curly quotes, bullet, middle dot, minus, approx,
 * the two inequalities, plus-minus, arrow). Anything else is dropped: bidi
 * and zero-width characters, controls, other scripts (homoglyphs), digits
 * from other scripts (which the number check can't read), emoji, currency.
 * NFKC leaves every one of these characters as it is (coachThresholds.test.ts
 * checks each), which is what lets normalise do without it.
 */
export const ALLOWED_CHARACTERS =
  /^[\x20-\x7E\n‐–—‘’“”•·−≈≤≥±→]*$/;

/**
 * NFKC, so look-alike and compatibility characters (fullwidth digits, the
 * mathematical alphabets, ligatures, superscripts) are checked as the plain
 * characters they render as, and line endings as \n. Without NFKC the raw
 * text is checked, and only if every character is one ALLOWED_CHARACTERS
 * lets through: NFKC changes none of them, so the text is exactly what NFKC
 * would have returned, and anything NFKC would have changed drops the
 * insight. (Until round 6 this fallback took plain ASCII only, so a curly
 * apostrophe or an em dash dropped the card.) Null when the field can't be
 * checked.
 */
function normalise(text: string): string | null {
  if (HAS_NFKC) {
    try {
      return text.normalize('NFKC').replace(/\r\n?/g, '\n');
    } catch {
      // Fall through to the raw text, held to the allowed characters.
    }
  }
  const raw = text.replace(/\r\n?/g, '\n');
  return ALLOWED_CHARACTERS.test(raw) ? raw : null;
}

/** Markup (HTML, markdown emphasis, links, code), addresses and money. */
const FORBIDDEN_MARKS = /[<>`*_[\]{}\\|#^@$]|~~/;

/** Links in any form, read on the lowercased text. */
const LINK_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\//,
  /\b(?:javascript|vbscript|data|mailto|tel|sms|file):\S/,
  /\bwww\d{0,3}\./,
  // A bare domain: "example.com", "x.ai". "e.g." and "0.55" don't match.
  /\b[a-z0-9-]+\.[a-z]{2,24}\b/,
];

/** Seven or more digits in one run, separators allowed: a phone number. */
const PHONE_NUMBER = /\d(?:[\s().-]*\d){6,}/;

/**
 * Numbers written as words can't be matched against the context, so they are
 * not allowed at all ("one" is left alone: it is mostly a pronoun). The prompt
 * asks for digits. "two" or "half" can't be checked against a figure either,
 * so they stay banned outside the idioms below.
 */
const NUMBER_WORDS =
  /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|dozens?|half|halves|halved|thirds?|quarters?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|hundredths?|twice|double[sd]?|doubling|triple[sd]?|tripling|(?:two|three|four|five|ten)fold|couples?|pairs?)\b/;
/** Idioms that hold a number word but claim no number; removed before the check. */
const NUMBER_WORD_IDIOMS =
  /\b(?:(?:older|newer|earlier|recent|later|latest|first|second) half|both halves|think(?:ing)? twice|double[\s-]check\w*|zero(?:ing)? in on)\b/g;

// Badge tiers: the context has none, so any tier named is a guess. Some of
// the names are ordinary words too ("a sharp drop", "just getting started",
// "the gold standard"), so those are read as badges only where they read as
// one (round 6; the medals since D80).
// Read on the text in its own case, apostrophes and dashes made plain.

/** The tier nouns, in any case: no ordinary Coach sentence needs them. */
const BADGE_NOUNS = /\b(?:oracles?|forecasters?|trackers?|guessers?)\b/i;
/**
 * "sharp" is the Sharp tier ("Sharp in health", "work is sharp at 88", "a
 * Sharp badge") unless one of these nouns follows it ("a sharp drop", "a
 * sharp start"); capitalised inside a sentence, always.
 */
const SHARP = /\bsharp\b/gi;
const SHARP_ORDINARY_AFTER =
  /^\s+(?:drops?|rises?|falls?|jumps?|dips?|declines?|increases?|decreases?|improvements?|changes?|shifts?|swings?|turns?|turnarounds?|reversals?|contrasts?|differences?|splits?|spikes?|climbs?|slides?|slumps?|upticks?|downturns?|moves?|start|eye|focus)\b/i;
/**
 * The medal tiers (roadmap D80: Bronze, Silver, Gold, Platinum) are ordinary
 * words too, so they are read as "sharp" is: a tier ("Gold in health",
 * "health is gold", "a silver badge", "platinum level") unless one of these
 * nouns follows it ("the gold standard", "a silver lining"); capitalised
 * inside a sentence, always. The old names stay forbidden beside them.
 */
const MEDALS = /\b(?:bronze|silver|gold|platinum)\b/gi;
const MEDAL_ORDINARY_AFTER = /^(?:\s+|-)(?:standards?|linings?|bullets?|mines?|rush)\b/i;
/**
 * "getting started" is the first tier's label ("still at Getting started",
 * "the getting started badge") unless it is the plain phrase: not
 * capitalised inside a sentence, after "just", "still", "are"…, and with no
 * badge word after it. Even then it is said only where that tier is true
 * (judgeInsight), so neither reading can be wrong.
 */
const GETTING_STARTED = /\bgetting\s+started\b/gi;
const GETTING_STARTED_PLAIN_BEFORE =
  /\b(?:just|still|only|now|really|am|are|is|was|were|be|been|being|you're|we're|i'm|they're|it's|you've|we've)\s+$/i;
const BADGE_WORD_AFTER = /^\s*-?\s*(?:badges?|tiers?|levels?|labels?|stages?|ranks?|status)\b/i;

/** Whether `index` opens a sentence: only spaces, quotes or brackets since a break, a line break or the start. */
function opensSentence(text: string, index: number): boolean {
  const before = text.slice(0, index).replace(/["'“”( \t]+$/, '');
  return before.length === 0 || /[.!?:;\n-]$/.test(before);
}

/**
 * How the words use a badge's name: 'badge' (drop), 'plain' (the phrase
 * "getting started" and nothing else), or 'none'.
 */
function badgeUse(cased: string): 'badge' | 'plain' | 'none' {
  if (BADGE_NOUNS.test(cased)) return 'badge';
  for (const [word, ordinaryAfter] of [
    [SHARP, SHARP_ORDINARY_AFTER],
    [MEDALS, MEDAL_ORDINARY_AFTER],
  ] as const) {
    const re = new RegExp(word.source, 'gi');
    for (let m = re.exec(cased); m !== null; m = re.exec(cased)) {
      if (m[0][0] !== m[0][0].toLowerCase() && !opensSentence(cased, m.index)) return 'badge';
      if (!ordinaryAfter.test(cased.slice(m.index + m[0].length))) return 'badge';
    }
  }
  let plain = false;
  const started = new RegExp(GETTING_STARTED.source, 'gi');
  for (let m = started.exec(cased); m !== null; m = started.exec(cased)) {
    if (m[0][0] === 'G' && !opensSentence(cased, m.index)) return 'badge';
    if (BADGE_WORD_AFTER.test(cased.slice(m.index + m[0].length))) return 'badge';
    if (!GETTING_STARTED_PLAIN_BEFORE.test(cased.slice(Math.max(0, m.index - 40), m.index))) return 'badge';
    plain = true;
  }
  return plain ? 'plain' : 'none';
}

/**
 * §5.4's note, which names a domain without giving advice in it ("Not a
 * substitute for professional advice.", "Not financial advice."). Removed
 * before the advice check, so only the note itself is let through.
 */
const DISCLAIMERS =
  /\b(?:not|isn't|aren't|never)\s+(?:a\s+substitute\s+for\s+)?(?:(?:professional|personal|individual)\s+)?(?:(?:legal|financial|investment|medical|tax|clinical|health)\s+)?advice\b/g;

/**
 * Out-of-domain direction the Coach must never give (§5.3, §5.4): medical,
 * financial or legal advice, numeric diet, sleep or exercise targets,
 * referrals and helplines (the app makes no referrals either, D73),
 * product names, and claims about the person's mind. A prompt is a request; a
 * validator is a guarantee: "move 40% into bonds" cites a real number whenever
 * 40 appears in the context. These only ever drop a card. Read on the
 * lowercased text with apostrophes and dashes made plain.
 */
const DOMAIN_ADVICE: readonly RegExp[] = [
  // Financial direction: a product or money as the object. Never a bare
  // percentage ("move your number toward 58%" is calibration advice), and
  // "short" only as a trade ("fell short: you said 81%" is a lean).
  /\b(?:invest|buy|sell|allocate|move|shift|put|transfer|deposit|withdraw)\b[^.]*\b(?:stocks?|bonds?|crypto|portfolio|savings|your money|funds?|cash|assets?|equit(?:y|ies)|securities|retirement|pension|(?:some|your|the|more|\d+)\s+shares)\b/,
  /\bshort(?:ing|ed)?\s+(?:the\s+)?(?:stocks?|shares|bonds?|crypto|market|positions?)\b/,
  /\b(?:financial advisor|investment advice)\b/,
  /\b\d+\s?%\s*(?:of\s+)?(?:your\s+)?(?:income|salary|pay|paycheck|earnings|budget|savings|portfolio)\b/,
  /\b\d+\s?%\s+(?:aside|away)\b/,
  /\bsave\s+(?:\$|£|€|\d)/,
  /\b(?:index funds?|etfs?|mutual funds?|stocks?|bonds?|crypto(?:currency)?|bitcoin|401\s?\(?k\)?|ira|roth|annuit(?:y|ies)|mortgages?|refinanc\w*|credit cards?|loans?|insurance|savings accounts?|high-yield|brokerage)\b/,
  // Medical / clinical
  /\b(dose|dosage|medication|prescri(be|ption)|diagnos(e|is|ed)|symptoms? of|you (may|might) have)\b/,
  // Legal
  /\b(sue|lawsuit|legal advice|liable|breach of contract)\b/,
  // Numeric health targets, out of scope entirely (§5.4)
  /\b\d+\s?(calories|kcal|lbs?|pounds|kg|kilos|reps|miles|km)\b/,
  /\b(lose|gain|cut|burn)\b[^.]*\b\d+\s?(lbs?|pounds|kg|kilos|calories|kcal)\b/,
  /\bbmi\b/,
  /\b\d[\d,.]*\s?k?\s?(?:steps|minutes?|mins?|hours?|hrs?|h|grams?|g|mg|servings?|portions?|cals?|calories|kcals?|cups?|glass(?:es)?|litres?|liters?|ml|oz|ounces?|sets|laps|nights?|days? a week|times a week)\b/,
  /\b(?:diets?|dieting|fasting|carbs?|protein|sugar intake|weight loss|lose weight|losing weight|gain weight|your weight|workouts?|work out more|exercise (?:more|less|daily)|sleep (?:more|less|longer|earlier)|eat (?:less|more|fewer)|drink (?:less|more|fewer)|alcohol|supplements?|vitamins?)\b/,
  // Referrals and helplines
  /\b(?:see|consult|talk(?:ing)? to|speak(?:ing)? (?:to|with)|visit|ask|contact|call|book|get help from|reach out to|check with|hire|find|get|seek(?: out)?|look for)\s+(?:(?:a|an|your|the)\s+)?(?:doctor|physician|gp|nurse|therapist|psychologist|psychiatrist|counsell?or|lawyer|attorney|solicitor|accountant|dietitian|nutritionist|trainer|(?:financial|investment|tax|legal) (?:advisor|adviser|planner|professional)|advisor|adviser|planner|specialist|mental health professional)\b/,
  /\b(?:therapy|therapists?|psychiatrists?|psychologists?|counsell?ing|hotlines?|helplines?|lifelines?|crisis lines?)\b/,
  // 988 as a line to call, not as a count ("988 scored answers").
  /\b(?:call(?:ing)?|text(?:ing)?|dial(?:ing)?|phon(?:e|ing)|ring|contact(?:ing)?|reach(?:ing)?)\s+(?:the\s+)?988\b|\b988\s*-?\s*(?:suicide|crisis|lifeline|line|hotline|helpline)\b/,
  // Diagnosis, mental states and personality (§5.3)
  /\b(?:anxiety|anxious|depression|depressed|adhd|ocd|bipolar|trauma|traumati[sz]ed|ptsd|disorders?|narcissis\w*|neurotic|burnout|mental illness|mental health)\b/,
  /\b(?:you're|you are|you seem(?: to be)?|you sound|you appear(?: to be)?|you feel|you might be|you may be|you must be|you're probably|you are probably|you're likely|you are likely)\s+(?:a bit |very |quite |really |so |too |an? )?(?:anxious|depressed|stressed|afraid|scared|fearful|insecure|nervous|worried|impulsive|lazy|reckless|arrogant|neurotic|perfectionist|pessimist|pessimistic|optimist|burn(?:ed|t) out|overwhelmed|unhappy|sad|lonely|manic|obsessive|compulsive|avoidant|in denial|fragile)\b/,
];

// --- Leans. Read on the lowercased text, dashes made plain, after turnLeans.

/** The words for each lean, as turnLeans looks for them after a negation. */
const OVER_CORE = String.raw`(?:over[\s-]?confiden(?:t|ce|tly)|too (?:sure|confident|certain|optimistic|high|hopeful|bold|aggressive|generous|rosy)|over[\s-]?estimat\w*|over[\s-]?sure|overly (?:confident|sure|certain|optimistic|bold|hopeful|aggressive|generous|rosy))`;
const UNDER_CORE = String.raw`(?:under[\s-]?confiden(?:t|ce|tly)|too (?:cautious|unsure|careful|timid|conservative|pessimistic|modest|hesitant|low|humble)|under[\s-]?estimat\w*|under[\s-]?sell\w*)`;
const CLOSE_CORE = String.raw`(?:(?:well[\s-]|perfectly |nicely |closely |tightly )?calibrated|spot[\s-]on|(?:right )?on target|about right|accurate(?:ly)?|in line with|as often as)`;
/**
 * A negation that turns a lean word around ("isn't overconfident", "not too
 * sure"). Not "don't" or "never": "don't overestimate" is advice, and names
 * the lean it warns about.
 */
const NEGATION = String.raw`\b(?:not|no longer|hardly|barely|isn't|aren't|wasn't|weren't|doesn't|didn't|isnt|arent|wasnt|werent|doesnt|didnt)\s+(?:(?:really|very|that|so|quite|entirely|fully|always|exactly|totally|completely|overly|particularly|especially|systematically|consistently|clearly|obviously|actually)\s+)?`;

/**
 * Turned leans, replaced by a marker before the lean words are read:
 *   - "didn't come true as often as", "not as often as": the overconfident
 *     lean (~over~), never calibrated wording (round 6; "as often as" read
 *     as close wording until then);
 *   - "neither overconfident nor underconfident", "isn't overconfident",
 *     "not too sure", "no overconfidence", and (round 7) "no gap" or "not a
 *     big gap": calibrated wording (~close~), held to the same rule as "well
 *     calibrated" ("a gap" alone is a contrast, COMPARE_WORDS);
 *   - "not well calibrated", "isn't accurate", "poorly calibrated": a miss
 *     with no direction (~miss~), allowed only where the app names a lean;
 *   - "worst calibrated", "less calibrated", "a calibrated forecaster": a
 *     comparison or a reference, no verdict (removed).
 */
const TURNED_LEANS: ReadonlyArray<[RegExp, string]> = [
  [
    /\b(?:didn't|don't|doesn't|did not|do not|does not|never)\s+(?:(?:quite|always|really|actually)\s+)?(?:happen|come true|occur|pan out|turn out|land)\s+(?:(?:quite|nearly)\s+)?as often as\b|\b(?:wasn't|weren't|isn't|aren't|was not|were not|is not|are not)\s+(?:right|correct)\s+(?:(?:quite|nearly)\s+)?as often as\b|\bnot\s+(?:(?:quite|nearly)\s+)?as often as\b|\b(?:didn't|don't|doesn't|did not|do not|does not|never|not|failed to|fails to|fail to)\s+(?:(?:quite|always|really)\s+)?live up to\b/g,
    ' ~over~ ',
  ],
  [new RegExp(String.raw`\bneither\s+(?:${OVER_CORE}|${UNDER_CORE})\s+nor\s+(?:${OVER_CORE}|${UNDER_CORE})`, 'g'), ' ~close~ '],
  [new RegExp(`${NEGATION}(?:${OVER_CORE}|${UNDER_CORE})`, 'g'), ' ~close~ '],
  [/\bno\s+(?:clear\s+|real\s+|obvious\s+|sign\s+of\s+)?(?:over|under)[\s-]?confidence\b/g, ' ~close~ '],
  [
    /\b(?:no|(?:not|isn't|wasn't|aren't|weren't|without)\s+(?:a|any))\s+(?:(?:real|clear|big|large|meaningful|notable|obvious|visible)\s+)?(?:gaps?|mismatch(?:es)?)\b/g,
    ' ~close~ ',
  ],
  [new RegExp(`${NEGATION}${CLOSE_CORE}`, 'g'), ' ~miss~ '],
  [/\b(?:doesn't|didn't|don't|does not|did not|do not)\s+match\b/g, ' ~miss~ '],
  [/\b(?:less|least|more|most|better|best|worse|worst)\s+(?:well[\s-])?calibrated\b/g, ' '],
  [/\bcalibrated\s+(?:forecasters?|persons?|people|predictors?|guessers?|someone)\b/g, ' '],
  // Aims and comparisons, which claim nothing about now: "to become well
  // calibrated", "to be more accurate", "bring your numbers in line with".
  [/\b(?:to|toward|towards)\s+(?:be(?:ing)?\s+|become\s+|get(?:ting)?\s+|stay(?:ing)?\s+)?(?:better\s+|more\s+|well[\s-]|perfectly\s+)?calibrated\b/g, ' '],
  [/\b(?:more|less|most|least)\s+accurate(?:ly)?\b/g, ' '],
  [/\b(?:bring|get|keep|put|move|pull)\s+(?:\w+\s+){0,3}?in line with\b/g, ' '],
  [/\b(?:poorly|badly|loosely|weakly)\s+calibrated\b|\bmiscalibrat\w*|\b(?:poor|weak|bad|loose|shaky)\s+calibration\b/g, ' ~miss~ '],
];

/** The text the lean words are read on. */
function turnLeans(scan: string): string {
  let out = scan;
  for (const [pattern, marker] of TURNED_LEANS) out = out.replace(pattern, marker);
  return out;
}

/**
 * What was said, expected or thought, as a comparison ends ("than you said",
 * and since round 7 "than you hoped", "than you'd think", "than you would
 * have imagined").
 */
const SAID = String.raw`(?:the\s+)?(?:\d+(?:\.\d+)?\s?%\s+)?(?:what\s+)?(?:you(?:'d|\s+(?:would|might|could|may|had|did))?\s+(?:have\s+)?)?(?:said|say|stated|state|expected|expect|expects|thought|think|thinks|predicted|guessed|felt|believed|believe|believes|hoped|hope|hopes|imagined|imagine|imagines|claimed|estimated|figured|forecast)\b`;
/**
 * What was said, as a noun ("below your stated confidence", "than your
 * numbers"), round 6. Read only after the words of a comparison, never after
 * "over": "go over your numbers" is advice.
 */
const SAID_NOUN = String.raw`(?:your|the)\s+(?:(?:stated|average|expected)\s+)?(?:confidence|numbers?|estimates?|expectations?)\b`;
/**
 * What was said, as the object of "outpaced" or "trails" ("outpaced your
 * stated confidence", "trails what you said"), round 7: with it, the way the
 * lean goes is read; without it ("your confidence outpaced the outcomes",
 * "was outpaced by"), it can't be, and both leans are named.
 */
const SAID_OBJECT = String.raw`(?:what\s+you\s+(?:said|stated|expected|thought|predicted)\b|your\s+(?:stated|expected|predicted)\b|${SAID_NOUN}|${SAID})`;
/** "trails", "lagged": what happened behind what was said, when what was said is the object. */
const TRAIL = String.raw`\b(?:trail|trails|trailed|trailing|lag|lags|lagged|lagging)\b`;
/**
 * What happened, as a verb ("just 70% came true", "came true less often"),
 * and since round 7 "worked out", "succeeded", "went your way", "resolved
 * yes", "proved true", "paid off".
 */
const HAPPENED_VERB = String.raw`(?:happened|happen|happens|came true|come true|comes true|occurred|landed|panned out|turned out|work(?:s|ed)? out|succeed(?:s|ed)?|(?:went|go|goes) your way|resolved (?:as )?yes|prov(?:ed|en|es) (?:true|right|correct)|(?:paid|pays|pay) off)`;
/**
 * A bare "optimistic", "cautious", "conservative" or "pessimistic" names a
 * lean when it describes the calls or numbers ("your calls run cautious",
 * "on the cautious side"), not as advice: "be more cautious" is what an
 * overconfident card should say.
 */
const DESCRIBED = String.raw`\b(?:calls?|numbers?|predictions?|estimates?|forecasts?|confidence|guesses|you|they|it)\s+(?:are|were|was|is|run|runs|ran|running|look|looks|looked|seem|seems|seemed|sit|sits|tend to be|tends to be|lean|leans|leaned|skew|skews|skewed|come across as|read as|stay|stays)\s+(?:a bit |slightly |very |quite |rather |fairly |somewhat |consistently |systematically |a little )?`;
/** Before a noun only after "your" ("your cautious finance calls"): "try more conservative numbers" is advice. */
const DESCRIBED_BEFORE = String.raw`\byour\s+(?:\w+\s+)?`;
const DESCRIBED_NOUN = String.raw`\s+(?:\w+\s+)?(?:calls?|numbers?|estimates?|predictions?|forecasts?|guesses)\b`;

/** Words that name overconfidence. */
const OVER_WORDS = new RegExp(
  [
    '~over~',
    String.raw`\b${OVER_CORE}`,
    String.raw`\bmore (?:sure|confident|certain) than\b`,
    String.raw`\b(?:ran|runs|run|running) (?:a bit |slightly )?(?:hot|ahead)\b`,
    String.raw`\b(?:confidence|numbers?|estimates?) (?:ran|runs|run|running) (?:a bit |slightly )?high\b`,
    String.raw`\bless often than\b(?!\s+not\b)`,
    String.raw`\b(?:fewer|less|lower)\b[^.;:!?\n]{0,40}?\bthan\s+${SAID}`,
    String.raw`\bover[\s-]?(?:stat(?:e|ed|es|ing|ement|ements)|rat(?:e|ed|es|ing)|shoot(?:s|ing)?|shot)\b`,
    String.raw`\b(?:fell|falls|fall|falling|came|comes|coming) short\b`,
    String.raw`\b(?:below|under|beneath|behind|short of|shy of)\s+${SAID}`,
    String.raw`${DESCRIBED}optimistic\b`,
    String.raw`${DESCRIBED_BEFORE}optimistic${DESCRIBED_NOUN}`,
    String.raw`\bon the (?:optimistic|high) side\b`,
    // Round 6: what was said as a noun, and "came true less often" with no "than".
    String.raw`\b(?:fewer|less|lower)\b[^.;:!?\n]{0,40}?\bthan\s+${SAID_NOUN}`,
    String.raw`\b(?:below|under|beneath|behind|short of|shy of)\s+${SAID_NOUN}`,
    String.raw`\b${HAPPENED_VERB}\s+(?:(?:a lot|much|far|a little|slightly|somewhat|a bit)\s+)?less (?:often|frequently)\b(?!\s+than\s+not\b)`,
    // Round 7: "fewer than that came true" after what was said; "trails"
    // and "lags" always (what happened behind what was said, or, without
    // what was said as the object, either way: UNDER_WORDS names it too);
    // "outpaced" unless what was said is its object.
    String.raw`\b(?:fewer|less|lower)\b[^.;:!?\n]{0,40}?\bthan\s+that\b`,
    TRAIL,
    String.raw`\boutpac\w*\b(?!\s+${SAID_OBJECT})`,
  ].join('|'),
);
/** Words that name underconfidence. */
const UNDER_WORDS = new RegExp(
  [
    String.raw`\b${UNDER_CORE}`,
    String.raw`\bless (?:sure|confident|certain) than\b`,
    String.raw`\b(?:ran|runs|run|running) (?:a bit |slightly )?cold\b`,
    String.raw`\b(?:confidence|numbers?|estimates?) (?:ran|runs|run|running) (?:a bit |slightly )?low\b`,
    String.raw`\bmore often than\b(?!\s+not\b)`,
    String.raw`\b(?:more|higher|greater)\b(?!\s+(?:sure|confident|certain)\b)[^.;:!?\n]{0,40}?\bthan\s+${SAID}`,
    String.raw`\bunder[\s-]?(?:stat(?:e|ed|es|ing|ement|ements)|rat(?:e|ed|es|ing))\b`,
    String.raw`\bnot (?:confident|sure|certain|bold) enough\b`,
    String.raw`\b(?:beat|beats|exceeded|exceeds|outpac\w*|outran)\s+(?:what\s+you\s+(?:said|stated|expected|thought|predicted)|your\s+(?:stated|expected|predicted)|${SAID_NOUN})\b`,
    String.raw`\b(?:above|over|beyond|ahead of)\s+${SAID}`,
    String.raw`${DESCRIBED}(?:cautious|conservative|pessimistic)\b`,
    String.raw`${DESCRIBED_BEFORE}(?:cautious|conservative|pessimistic)${DESCRIBED_NOUN}`,
    String.raw`\bon the (?:cautious|conservative|careful|safe|low) side\b`,
    // Round 6: what was said as a noun, and "came true more often" with no "than".
    String.raw`\b(?:more|higher|greater)\b(?!\s+(?:sure|confident|certain)\b)[^.;:!?\n]{0,40}?\bthan\s+${SAID_NOUN}`,
    String.raw`\b(?:above|beyond|ahead of)\s+${SAID_NOUN}`,
    String.raw`\b${HAPPENED_VERB}\s+(?:(?:a lot|much|far|a little|slightly|somewhat|a bit)\s+)?more (?:often|frequently)\b(?!\s+than\s+not\b)`,
    // Round 7: "more than that came true" after what was said; "outpaced"
    // always (what happened ahead of what was said, or, without what was
    // said as the object, either way: OVER_WORDS names it too); "trails" and
    // "lags" unless what was said is their object.
    String.raw`\b(?:more|higher|greater)\b(?!\s+(?:sure|confident|certain)\b)[^.;:!?\n]{0,40}?\bthan\s+that\b`,
    String.raw`\boutpac\w*\b`,
    String.raw`${TRAIL}(?!(?:\s+behind)?\s+${SAID_OBJECT})`,
  ].join('|'),
);
/**
 * Any comparison with what was said, expected or thought: a lean, whichever
 * way it reads, so only in an over/under card the category's direction backs.
 * Contrast words too (round 6, record re-review R4): "but only 70% happened",
 * "just 70% came true", "often miss", "a gap", "against 80% stated" set what
 * happened against what was said as surely as "less often than you said".
 */
const COMPARE_WORDS = new RegExp(
  [
    String.raw`\bthan\s+${SAID}`,
    String.raw`\bthan\s+(?:your|the)\s+(?:stated|expected|predicted|forecast|estimated)\b`,
    String.raw`\b(?:compared|relative)\s+(?:to|with)\s+(?:what\s+you\s+(?:said|stated|expected|thought|predicted)|your\s+(?:stated|expected|predicted))\b`,
    String.raw`\b(?:versus|vs|against)\s+what\s+you\s+(?:said|stated|expected|thought|predicted)\b`,
    String.raw`\b(?:short|shy)\s+of\s+what\s+you\s+(?:said|stated|expected|thought|predicted)\b`,
    String.raw`\b(?:beat|beats|exceeded|exceeds|outpac\w*|missed|undershot|overshot)\s+(?:what\s+you\s+(?:said|stated|expected|thought|predicted)|your\s+(?:stated|expected|predicted)|${SAID_NOUN})\b`,
    String.raw`\b(?:below|under|beneath|behind|above|over|beyond|ahead of)\s+${SAID}`,
    String.raw`~over~\s+(?:${SAID}|${SAID_NOUN})`,
    String.raw`\bthan\s+${SAID_NOUN}`,
    String.raw`\b(?:compared|relative)\s+(?:to|with)\s+(?:${SAID}|${SAID_NOUN})`,
    String.raw`\b(?:below|under|beneath|behind|above|beyond|ahead of)\s+${SAID_NOUN}`,
    // Contrast words.
    String.raw`\bbut only\b`,
    String.raw`\b(?:just|only|merely)\b(?!\s+(?:as|about|like)\b)[^.;:!?\n,]{0,40}?\b${HAPPENED_VERB}\b`,
    String.raw`\b${HAPPENED_VERB}\s+(?:only|merely|just(?!\s+(?:as|about|like)\b))\b`,
    String.raw`\b(?:often|usually|frequently|mostly|regularly)\s+miss(?:es|ed)?\b`,
    String.raw`\bmiss(?:es|ed)?\s+(?:more|often|frequently|regularly|a lot|the mark)\b`,
    String.raw`\b(?:often|usually|frequently|mostly|regularly)\s+(?:didn't|don't|doesn't|did not|do not|does not|fail(?:ed|s)? to)\s+(?:happen|come true|pan out|land)\b`,
    String.raw`\bgaps?\b`,
    String.raw`\bmismatch\w*`,
    String.raw`\b(?:don't|do not|doesn't|does not|didn't|did not)\s+line up\b`,
    String.raw`\ba long way (?:from|off)\b`,
    String.raw`\b(?:stated|said|expected)\s+(?:against|versus|vs)\b`,
    String.raw`\b(?:against|versus|vs)\s+(?:(?:an?|the|your)\s+)?(?:\d+(?:\.\d+)?\s?(?:%|percent|per cent|pct)\s+)?(?:stated|said|expected|confidence)\b`,
    TRAIL,
    // Round 7: "than that" after what was said, and "outpaced" in any form.
    String.raw`\bthan\s+that\b`,
    String.raw`\boutpac\w*\b`,
  ].join('|'),
);
/** Words that say what was said matched what happened (rule: closeToSaid). */
const CLOSE_WORDS = new RegExp(
  [
    '~close~',
    String.raw`\bcalibrated\b`,
    String.raw`\bspot[\s-]on\b`,
    String.raw`\bon target\b`,
    String.raw`\babout right\b`,
    String.raw`\baccurate(?:ly)?\b`,
    String.raw`\bin line with\b`,
    String.raw`\bmatch(?:ed|es|ing)?\s+(?:what\s+(?:happened|you\s+(?:said|stated|expected))|(?:the\s+)?outcomes?|reality)\b`,
    String.raw`\bas often as (?:you )?(?:said|stated|expected|thought|predicted)\b`,
    String.raw`\bclose to\s+(?:what\s+you\s+(?:said|stated|expected)|your\s+(?:\d+(?:\.\d+)?\s?%\s+)?(?:stated|said|confidence))\b`,
    String.raw`\b(?:good|great|strong|excellent|solid|tight|close|accurate|precise)\s+calibration\b`,
    String.raw`\bcalibration\s+(?:is|was|looks|seems|stays)\s+(?:good|great|strong|excellent|solid|tight|spot-on|accurate|on point)\b`,
  ].join('|'),
);
/** "No clear lean": the app's words for a `calibrated` direction, close or not. */
const NO_LEAN_WORDS =
  /\bno (?:clear |real |obvious |strong |consistent |particular )?lean(?:s|ing)?\b|\b(?:doesn't|does not|don't|do not|didn't|did not)\s+(?:clearly\s+)?lean\b(?!\s+(?:on|into)\b)/;
/** A miss with no direction ("not well calibrated"): only where the app names a lean. */
const MISS_WORDS = /~miss~/;

// --- Categories.

/** The words for each built-in. Which uses count is decided by categoryMentions. */
const CATEGORY_WORDS: Readonly<Record<BuiltInCategory, RegExp>> = {
  work: /\bwork\b/g,
  health: /\bhealth\b/g,
  finance: /\b(?:finance|finances|financial|money)\b/g,
  social: /\bsocial\b/g,
  personal: /\bpersonal\b/g,
};
/** Right after the word, a use as the category, always: "work calls", "finance's", "health score". */
const CATEGORY_USE_AFTER =
  /^(?:'s\b|-related\b|\s+(?:calls?|predictions?|forecasts?|answers?|guesses|estimates?|categor(?:y|ies)|ones|scores?|ratings?|records?|numbers|figures|confidence|stats|results|outcomes|side|domain|area|bucket|items|entries|questions|picks|calibration|drift|track record)\b)/;
/** Right before the word, a use as the category, always: "your work". */
const CATEGORY_USE_BEFORE = /\b(?:your|my|their)\s+$/;
/**
 * Idioms that hold the word but aren't the category ("keep up the good work",
 * "personal best", "not financial advice"). Every other use counts, so a
 * phrasing nobody listed is read as naming the category: the safe direction.
 */
const NOT_THE_CATEGORY: Readonly<Record<BuiltInCategory, { before?: RegExp; after?: RegExp }>> = {
  work: {
    before:
      /\b(?:good|great|nice|fine|hard|excellent|solid|careful|honest|steady|consistent|amazing|awesome|terrific|brilliant|impressive|thoughtful|real|quality|detective|guess|leg|busy|home|team|field|paper|ground|patch|the|this|that|some|more|less|extra|further|might|may|could|would|should|will|can|does|do|did|doesn't|don't|didn't|won't|can't|cannot|which)\s+$/,
    after:
      /^\s+(?:on|at|out|through|towards?|with|it|hard|harder|well|best|for|in progress|wonders|against|around|together)\b/,
  },
  health: {
    before: /\b(?:mental|good|bad|poor|great|ill|physical|public|financial|sexual|reproductive)\s+$/,
    after:
      /^\s+(?:advice|professionals?|care|insurance|conditions?|issues?|problems?|concerns?|providers?|services?|records?|and safety|matters|benefits?|risks?)\b/,
  },
  finance: {
    before:
      /\b(?:make|making|made|save|saving|saved|spend|spending|spent|lose|losing|lost|earn|earning|earned|put|move|invest|bet|betting|borrow|borrowing|owe|time is|personal|real|extra|more|less|some)\s+$/,
    after:
      /^\s+(?:advice|advisors?|advisers?|planners?|planning|professionals?|products?|decisions?|situation|institutions?|markets?|literacy|services?|security|goals?|worries|worry|matters|management|aid|freedom|wellbeing|well-being)\b/,
  },
  social: {
    after:
      /^\s+(?:media|security|skills?|anxiety|norms?|pressure|proof|cues?|sciences?|networks?|networking|workers?|services?)\b/,
  },
  personal: {
    before: /\b(?:nothing|too|very|get|getting|so|more|less)\s+$/,
    after:
      /^\s+(?:bests?|record|records|note|notes|touch|opinions?|advice|growth|data|information|details|taste|preferences?|space|finances?|matters?|reasons?|reference)\b/,
  },
};

interface Mention {
  category: BuiltInCategory;
  index: number;
}

/** Where the words name a built-in category as a category. */
function categoryMentions(scan: string): Mention[] {
  const out: Mention[] = [];
  for (const category of CATEGORIES) {
    const re = new RegExp(CATEGORY_WORDS[category].source, 'g');
    for (let m = re.exec(scan); m !== null; m = re.exec(scan)) {
      const end = m.index + m[0].length;
      const before = scan.slice(Math.max(0, m.index - 40), m.index);
      const after = scan.slice(end, end + 40);
      if (!CATEGORY_USE_AFTER.test(after) && !CATEGORY_USE_BEFORE.test(before)) {
        const idiom = NOT_THE_CATEGORY[category];
        if (idiom.before?.test(before) || idiom.after?.test(after)) continue;
      }
      out.push({ category, index: m.index });
    }
  }
  return out;
}

/**
 * Curly apostrophes and the dash family made plain, in the text's own case
 * (the badge check reads capitals). One character for one, so its indices
 * are the scan form's.
 */
function casedForm(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[‐–—−]/g, '-');
}

/** Lowercased, curly apostrophes and the dash family made plain, for the word checks. */
function scanForm(text: string): string {
  return casedForm(text).toLowerCase();
}

/** Whether one field's own text is fit to show: characters, marks, links, lines. */
function fieldIsClean(text: string): boolean {
  if (!ALLOWED_CHARACTERS.test(text)) return false;
  if (FORBIDDEN_MARKS.test(text)) return false;
  if ((text.match(/\n/g) ?? []).length > MAX_LINE_BREAKS) return false;
  return true;
}

/** Whether the words (message and suggestion together) break a rule about content. */
function wordsBreakARule(text: string, scan: string): boolean {
  if (LINK_PATTERNS.some((p) => p.test(scan))) return true;
  if (PHONE_NUMBER.test(text)) return true;
  if (NUMBER_WORDS.test(scan.replace(NUMBER_WORD_IDIOMS, ' '))) return true;
  const advice = scan.replace(DISCLAIMERS, ' ');
  return DOMAIN_ADVICE.some((p) => p.test(advice));
}

// ---------------------------------------------------------------------------
// The numbers (§5.1)
// ---------------------------------------------------------------------------

/** The scale a figure is written on. */
type FigureKind = 'count' | 'score' | 'percent' | 'rate' | 'index';
/** What a figure is, as the words beside a number name it. */
type Role = 'count' | 'score' | 'drift' | 'stated' | 'hit' | 'index';

/**
 * A number the model was shown, with the figure it came from (so the card can
 * say what the number counts).
 *   citable  - past its gate: may ground a number
 *   withheld - under its gate: grounds nothing, and a number that matches it
 *              is dropped even if it also matches a citable figure
 *   neutral  - the weekday index and the floors' counts: never cited, never
 *              blocking
 */
interface Figure {
  value: number;
  tolerance: number;
  kind: FigureKind;
  role: Role;
  /** 'overall' or a built-in category. */
  scope: string;
  state: 'citable' | 'withheld' | 'neutral';
  source: CoachEvidenceSource;
}

function toleranceFor(value: number, kind: FigureKind): number {
  if (Number.isInteger(value)) return TOLERANCE_EXACT;
  return kind === 'rate' ? TOLERANCE_RATE : TOLERANCE_ABSOLUTE;
}

/**
 * The built-in categories the context carries, first entry wins. A category
 * the person added never reaches the Coach (roadmap D39); if one ever did, its
 * figures are ignored here, so nothing can be said about it.
 */
function statsByCategory(context: CoachContext): Map<string, CategoryEntry> {
  const stats = new Map<string, CategoryEntry>();
  for (const c of context.by_category) {
    if (isBuiltIn(c.category) && !stats.has(c.category)) stats.set(c.category, c);
  }
  return stats;
}

function figuresOf(context: CoachContext, stats: ReadonlyMap<string, CategoryEntry>): Figure[] {
  const figures: Figure[] = [];
  const add = (
    value: number,
    kind: FigureKind,
    role: Role,
    scope: string,
    state: Figure['state'],
    source: CoachEvidenceSource,
  ) => figures.push({ value, tolerance: toleranceFor(value, kind), kind, role, scope, state, source });

  const { calibration_rating, total_resolved } = context.overall;
  const overallOk = total_resolved >= MIN_N_OVERALL;
  add(calibration_rating, 'score', 'score', 'overall', overallOk ? 'citable' : 'withheld', {
    field: 'calibration_rating',
    scope: 'overall',
    value: calibration_rating,
  });
  add(total_resolved, 'count', 'count', 'overall', 'citable', {
    field: 'total_resolved',
    scope: 'overall',
    value: total_resolved,
  });

  for (const c of stats.values()) {
    const scope = c.category;
    const gate = c.resolved >= MIN_N_CATEGORY ? 'citable' : 'withheld';
    add(c.resolved, 'count', 'count', scope, 'citable', { field: 'resolved', scope, value: c.resolved });
    add(c.calibration_score, 'score', 'score', scope, gate, {
      field: 'calibration_score',
      scope,
      value: c.calibration_score,
    });
    add(c.mean_stated_confidence, 'percent', 'stated', scope, gate, {
      field: 'mean_stated_confidence',
      scope,
      value: c.mean_stated_confidence,
    });
    const hitRate: CoachEvidenceSource = { field: 'actual_rate', scope, value: c.actual_rate };
    add(c.actual_rate, 'rate', 'hit', scope, gate, hitRate);
    // Rates arrive as 0–1 and are written as percentages: the same fact.
    if (c.actual_rate >= 0 && c.actual_rate <= 1) add(c.actual_rate * 100, 'percent', 'hit', scope, gate, hitRate);
  }

  const answers = context.patterns.find((p) => p.kind === WEEKDAY_ANSWERS_KIND)?.value;
  const weekdayOk = overallOk && typeof answers === 'number' && answers >= WEEKDAY_MIN_N;
  const halves = new Map<string, number>();
  for (const p of context.patterns) {
    if (p.kind.startsWith(DRIFT_HALF_ANSWERS_PREFIX)) halves.set(p.kind.slice(DRIFT_HALF_ANSWERS_PREFIX.length), p.value);
  }
  for (const p of context.patterns) {
    const source: CoachEvidenceSource = { field: 'pattern', scope: 'overall', value: p.value, kind: p.kind };
    if (p.kind === WEEKDAY_KIND) {
      add(p.value, 'index', 'index', 'overall', 'neutral', source);
    } else if (p.kind === WEEKDAY_ANSWERS_KIND) {
      add(p.value, 'count', 'count', 'overall', 'neutral', source);
    } else if (p.kind === WEEKDAY_SCORE_KIND) {
      add(p.value, 'score', 'score', 'overall', weekdayOk ? 'citable' : 'withheld', source);
    } else if (p.kind.startsWith(DRIFT_HALF_ANSWERS_PREFIX)) {
      const category = p.kind.slice(DRIFT_HALF_ANSWERS_PREFIX.length);
      add(p.value, 'count', 'count', isBuiltIn(category) ? category : 'overall', 'neutral', source);
    } else if (p.kind.startsWith(DRIFT_PREFIX)) {
      // Each half it compares needs DRIFT_HALF_MIN_N answers. Without the
      // count (a build before 2026-11-19), or with one the category can't
      // hold, the drift is never cited.
      const category = p.kind.slice(DRIFT_PREFIX.length);
      const stat = stats.get(category);
      const half = halves.get(category);
      const ok =
        stat !== undefined &&
        stat.resolved >= MIN_N_CATEGORY &&
        half !== undefined &&
        half >= DRIFT_HALF_MIN_N &&
        2 * half <= stat.resolved;
      add(p.value, 'score', 'drift', isBuiltIn(category) ? category : 'overall', ok ? 'citable' : 'withheld', source);
    } else {
      add(p.value, 'score', 'score', 'overall', 'withheld', source);
    }
  }
  return figures;
}

/**
 * The figures a number may be, or null when it may not be cited: it is
 * (`grounds`) no citable figure that `allowed` lets it be, or it comes near
 * (`blocks`) a withheld one. `blocks` is never narrower than `grounds`.
 */
function judge(
  figures: readonly Figure[],
  inScope: (f: Figure) => boolean,
  blocks: (f: Figure) => boolean,
  grounds: (f: Figure) => boolean,
  allowed: (f: Figure) => boolean,
): Figure[] | null {
  const ok: Figure[] = [];
  for (const f of figures) {
    if (!inScope(f)) continue;
    if (f.state === 'withheld') {
      if (blocks(f)) return null;
    } else if (f.state === 'citable' && grounds(f) && allowed(f)) {
      ok.push(f);
    }
  }
  return ok.length > 0 ? ok : null;
}

interface NumberToken {
  value: number;
  percent: boolean;
  start: number;
  end: number;
  /** Where the number ends with its "%", "percent", "per cent" or "pct". */
  unitEnd: number;
}

/**
 * Every number written in the text: digits with an optional decimal ("0.55",
 * "61.4"), thousands separators ("1,234"), with or without "%" or "percent".
 * A range ("80–100%") is two numbers; an ordinal ("3rd") or "top 3" is a
 * number. Signs are dropped: a drift is matched by its size.
 */
function numbersIn(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const unit = /^\s?(?:%|percent\b|per cent\b|pct\b)/i.exec(text.slice(end));
    tokens.push({
      value: Number(m[0].replace(/,/g, '')),
      percent: unit !== null,
      start: m.index,
      end,
      unitEnd: end + (unit === null ? 0 : unit[0].length),
    });
  }
  return tokens;
}

/** Whether a written number is within a figure's tolerance: enough to block a withheld one. */
function nearFigure(f: Figure, token: NumberToken): boolean {
  return Math.abs(Math.abs(f.value) - token.value) <= f.tolerance + TOLERANCE_EPSILON;
}

/**
 * Whether a written number is this figure as the app shows it. A whole
 * number written for a score, a rating, a percentage or a drift is the app's
 * own rounding, Math.round, as every screen shows each of them
 * (ratingHeadline, CategoryBadge and the Coach card's receipt, coachReceipt,
 * which rounds the drift with its sign): 82 for a rating of 82.5, which the
 * screen shows as 83, is a point below it (round 6, R11/R12). A number with
 * decimals keeps the figure's tolerance, and a 0–1 rate or a count is
 * matched as before.
 */
function isFigure(f: Figure, token: NumberToken): boolean {
  if (Number.isInteger(token.value) && (f.kind === 'score' || f.kind === 'percent')) {
    return token.value === Math.abs(Math.round(f.value));
  }
  return nearFigure(f, token);
}

/**
 * The only numbers not taken from the context: a gate the prompt names, in
 * its own phrasing ("at 20 scored answers", "until 20 answers"), and the
 * scale ("72/100", "out of 100"). Nothing else: "20 points" or "you have 20
 * answers" must still match a figure.
 */
function allowedSpans(text: string): Array<[number, number]> {
  const gates = [...new Set([MIN_N_OVERALL, MIN_N_CATEGORY, WEEKDAY_MIN_N, DRIFT_HALF_MIN_N])].join('|');
  const patterns = [
    new RegExp(
      `\\b(?:at least|at|from|after|until|till|once|reach(?:es|ing)?|hit(?:s|ting)?|need(?:s|ed)?|takes?)\\s+` +
        `(?:you\\s+(?:have|reach|hit|get)\\s+)?(?:${gates})\\s+` +
        `(?:(?:scored|resolved|answered)\\s+)?(?:answers|predictions|calls|resolutions)\\b`,
      'gi',
    ),
    /\bout of 100\b|\/\s?100\b/gi,
  ];
  const spans: Array<[number, number]> = [];
  for (const re of patterns) {
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  return spans;
}

// --- Clauses and sentences: which words belong to which number.

type Span = [number, number];

/** Where a sentence ends: . ! ? before a space or the end, a semicolon, a line break. */
const SENTENCE_BREAKS = /[.!?](?=\s|$)|[;\n]/g;
/**
 * Where a clause ends: a sentence break, a colon, a bracket, a comma (not
 * inside "1,234"), a spaced dash, or a word that turns the sentence.
 */
const CLAUSE_BREAKS = /[.!?](?=\s|$)|[;:\n()]|,(?!\d)|\s-\s|\b(?:but|while|whereas|though|although)\b/g;
/**
 * Inside a clause, "and" also ends what a cue word can reach ("you said 60%
 * and 82% happened"), though not whose number it is ("finance and work both
 * sit at 80%" names two categories beside one number).
 */
const CUE_BREAKS = /\band\b/g;

function breaksIn(scan: string, pattern: RegExp): Span[] {
  const re = new RegExp(pattern.source, 'g');
  const out: Span[] = [];
  for (let m = re.exec(scan); m !== null; m = re.exec(scan)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** The stretch between the last break before [start, end) and the first after it. */
function segment(start: number, end: number, breaks: readonly Span[], length: number): Span {
  let from = 0;
  let to = length;
  for (const [s, e] of breaks) {
    if (e <= start) {
      if (e > from) from = e;
    } else if (s >= end && s < to) {
      to = s;
    }
  }
  return [from, to];
}

function categoriesWithin(mentions: readonly Mention[], [from, to]: Span): Set<BuiltInCategory> {
  const out = new Set<BuiltInCategory>();
  for (const m of mentions) if (m.index >= from && m.index < to) out.add(m.category);
  return out;
}

/** Words that put a number on the whole record, not one category. */
const OVERALL_WORDS =
  /\b(?:overall|in total|total|altogether|in all|all (?:of )?your|across (?:all|every)|every category|all categories|your (?:calibration )?rating|whole record|entire record|(?:mon|tues|wednes|thurs|fri|satur|sun)days?|weekdays?|day of the week)\b/;

/**
 * The words that put a number on the whole record even in a sentence that
 * names a category (round 6): "In finance, your rating is 72." is finance's
 * rating as a reader takes it, so "your rating" and a weekday don't switch
 * it; "overall", "in total" and "across all" do.
 */
const OVERALL_EVEN_BESIDE_A_CATEGORY = /\b(?:overall|in total|across all|across every category)\b/;

/**
 * Whose figure a number may be: 'overall', a category, or null when that is
 * ambiguous (two categories named beside it). The category named in its
 * clause; else, where its sentence names a category, that category, unless
 * its clause says overall in so many words (OVERALL_EVEN_BESIDE_A_CATEGORY);
 * else, with a word that says overall in its clause or sentence, the overall
 * figures; else the label's. A category's number is never an overall figure,
 * nor another category's.
 */
function bindingFor(
  token: NumberToken,
  clause: Span,
  sentenceBreaks: readonly Span[],
  mentions: readonly Mention[],
  scan: string,
  label: string | null,
): string | null {
  const inClause = categoriesWithin(mentions, clause);
  if (inClause.size > 1) return null;
  if (inClause.size === 1) return [...inClause][0];
  const sentence = segment(token.start, token.unitEnd, sentenceBreaks, scan.length);
  const inSentence = categoriesWithin(mentions, sentence);
  if (inSentence.size > 1) return null;
  const clauseText = scan.slice(clause[0], clause[1]);
  if (inSentence.size === 1) {
    return OVERALL_EVEN_BESIDE_A_CATEGORY.test(clauseText) ? 'overall' : [...inSentence][0];
  }
  if (OVERALL_WORDS.test(clauseText) || OVERALL_WORDS.test(scan.slice(sentence[0], sentence[1]))) return 'overall';
  return label ?? 'overall';
}

// --- Cues: the words that say what a number is.

type Side = 'left' | 'right';

interface Cue {
  pattern: RegExp;
  /**
   * The roles a number may have with this word beside it, at `distance`
   * words on `side`, with `between` the text between the two: null when the
   * word says nothing about such a number, an empty list when no figure fits
   * ("88% score").
   */
  roles: (percent: boolean, side: Side, distance: number, word: string, between: string) => readonly Role[] | null;
  /**
   * A unit: right after a plain number it is that number's ("81 answers 72"
   * gives "answers" to 81), and it narrows what an equally near word on the
   * other side says ("improved by 88 points": "by" makes it a drift). Where
   * the two can't both hold ("score 7.3 points better", "came true 25
   * times"), the unit says what the number counts. Until round 6 a unit
   * decided alone, and "Work improved by 88 points" passed as work's score.
   */
  unit?: true;
}

/**
 * Between a change word and the number, "to" (and at most a word of
 * approximation): "fell to 61", "rose to about 88". The number is the level
 * reached, not the change (round 7).
 */
const LEVEL_AFTER_CHANGE = /^\s+to\s+(?:(?:about|around|roughly|nearly|almost|just|approximately|a|an)\s+)?$/;

/** Between a percentage and "calls", a built-in's word only: "your 80% finance calls". */
const CATEGORY_WORD_ONLY = /^\s*(?:work|health|finance|finances|financial|money|social|personal)\s*$/;

const CUES: readonly Cue[] = [
  // Phrases that hold a cue word but say nothing of a number beside them.
  {
    pattern: /\b(?:about|all|just)\s+right\b|\bright\s+(?:on|now|away|there|here)\b|\bmake\s+sure\b|\bfor\s+sure\b/,
    roles: () => null,
  },
  // A count: "25 answers", "81 scored answers". After a percentage, "80% calls"
  // and "80% finance calls" are what was said.
  {
    pattern:
      /\b(?:(?:scored|resolved|answered)\s+)?(?:answers?|predictions?|calls?|forecasts?|resolutions?|entries|guesses|questions|items)\b/,
    roles: (percent, side, distance, word, between) => {
      if (!percent) return ['count'];
      const said =
        side === 'right' &&
        /^(?:calls?|predictions?|forecasts?|guesses)$/.test(word) &&
        (distance === 0 || (distance === 1 && CATEGORY_WORD_ONLY.test(between)));
      return said ? ['stated'] : null;
    },
    unit: true,
  },
  // "resolved 25"; beside a percentage, a share the context doesn't hold ("resolved 80%").
  { pattern: /\b(?:resolved|answered|logged)\b/, roles: (percent) => (percent ? [] : ['count']) },
  // "8 times", "12 of 21", "12 out of 21": right after the number.
  { pattern: /\btimes\b/, roles: (percent, side) => (!percent && side === 'right' ? ['count'] : null), unit: true },
  {
    pattern: /\b(?:out\s+)?of\b/,
    roles: (percent, side, distance) => (!percent && side === 'right' && distance === 0 ? ['count'] : null),
  },
  // A score, never a percentage: "a score of 88".
  { pattern: /\b(?:scores?|ratings?)\b/, roles: (percent) => (percent ? [] : ['score']) },
  // The scale: "72/100", "72 out of 100".
  { pattern: /\/\s?100\b|\bout\s+of\s+100\b/, roles: (percent) => (percent ? [] : ['score']), unit: true },
  // "rated 88" is a score; "calls you rated 80%" is what was said.
  { pattern: /\brated\b/, roles: (percent) => (percent ? ['stated'] : ['score']) },
  // A score or a drift: "scored 61", "calibrate worst".
  {
    pattern: /\b(?:scored|scoring|calibration|calibrates?|calibrated)\b/,
    roles: (percent) => (percent ? [] : ['score', 'drift']),
  },
  // Points: "88 points" is a score or a drift, "7.3 points better" a drift.
  {
    pattern: /\bpoints?\s+(?:better|worse|higher|lower|up|down)\b/,
    roles: (percent) => (percent ? [] : ['drift']),
    unit: true,
  },
  { pattern: /\b(?:points?|pts)\b/, roles: (percent) => (percent ? [] : ['score', 'drift']), unit: true },
  // A change: "slipped by 6.5", "improved 7.3 points". Within a number's
  // reach, with no other number between, it makes a number that could be a
  // drift one (rolesFor). Right before "to" and the number ("fell to 61")
  // the number is the level reached, a score (round 7); a score beside a
  // change word needs a drift that backs it (claimsChange).
  {
    pattern:
      /\b(?:slipped|slips?|fell|falls?|fallen|dropped|drops?|rose|rises?|risen|improved|improves?|improving|climbed|climbs?|gained|gains?|declined|declines?|worsened|worsens?|increased|increases?|decreased|decreases?|dipped|dips?|jumped|jumps?|grew|grows?|sank|slid|changed|changes?|shifted|moved|drift(?:ed|s)?|trend(?:ed|ing|s)?)\b/,
    roles: (percent, side, _distance, _word, between) =>
      percent ? null : side === 'left' && LEVEL_AFTER_CHANGE.test(between) ? ['score'] : ['drift'],
  },
  { pattern: /\bby\b/, roles: (percent, side, distance) => (!percent && side === 'left' && distance === 0 ? ['drift'] : null) },
  // What was said: "you said 80%", "80% sure", and since round 7 "you hoped
  // for 80%", "you think", "you believed", "you imagined".
  {
    pattern:
      /\b(?:average\s+confidence|said|say|says|saying|stated|state|states|stating|sure|confident|confidence|certain|felt|feel|feels|feeling|expected|expect|expects|expecting|thought|think|thinks|thinking|hoped|hope|hopes|hoping|believed|believe|believes|believing|imagined|imagine|imagines|imagining|gave|give|giving|called|likely)\b/,
    roles: () => ['stated'],
  },
  // What happened: "55% happened", "a 0.55 hit rate" (a plain number takes
  // only the 0–1 rate), and since round 7 "worked out", "succeeded", "went
  // your way", "resolved yes", "proved true", "paid off".
  {
    pattern:
      /\b(?:hit\s+rate|rate|happened|happen|happens|happening|came\s+true|come\s+true|comes\s+true|coming\s+true|right|correct|hits?|of\s+the\s+time|occurred|occurs?|turned\s+out|actually|actual|landed|panned\s+out|work(?:s|ed|ing)?\s+out|succeed(?:s|ed|ing)?|(?:went|go|goes|going|gone)\s+your\s+way|resolved\s+(?:as\s+)?yes|prov(?:ed|en|es|ing)\s+(?:true|right|correct)|(?:paid|pays|pay|paying)\s+off)\b/,
    roles: () => ['hit'],
  },
];

interface CueHit {
  start: number;
  end: number;
  word: string;
  cue: Cue;
  order: number;
}

/** Every cue in the text. Where two overlap, the longer (then the one listed first) is the one read. */
function cuesIn(scan: string): CueHit[] {
  const hits: CueHit[] = [];
  CUES.forEach((cue, order) => {
    const re = new RegExp(cue.pattern.source, 'g');
    for (let m = re.exec(scan); m !== null; m = re.exec(scan)) {
      hits.push({ start: m.index, end: m.index + m[0].length, word: m[0], cue, order });
    }
  });
  const length = (h: CueHit) => h.end - h.start;
  return hits.filter(
    (h) =>
      !hits.some(
        (o) =>
          o !== h &&
          o.start < h.end &&
          h.start < o.end &&
          (length(o) > length(h) || (length(o) === length(h) && o.order < h.order)),
      ),
  );
}

const WORD = /[a-z]+(?:'[a-z]+)?/g;

/**
 * What a number may be, from the nearest cue words within its reach (no
 * nearer number between): their roles, or null when two cues equally near
 * disagree. A unit right after a plain number is as near as a word gets: it
 * narrows what an equally near word on the other side says, and where the
 * two can't both hold it is what the number counts (it decided alone until
 * round 6). A change word within reach, with no other number between, makes
 * a number that could be a drift one ("Work improved by about 88 points").
 * A cue word pressed between this number and another, with no word on
 * either side ("rated 80% came true 55%", "at 60% happened 82%"), can belong
 * to either, so it is read for neither. With no cue, a percentage may be
 * what was said or what happened (said, after "at": "overconfident at 80%"),
 * and a plain number reads as a score, or as a count in an encouragement. A
 * count beside a word that says something happened is dropped
 * (countCameTrue).
 */
function rolesFor(
  token: NumberToken,
  tokens: readonly NumberToken[],
  cues: readonly CueHit[],
  reach: Span,
  scan: string,
  encouragement: boolean,
): ReadonlySet<Role> | null {
  const noWord = (from: number, to: number) => (scan.slice(from, to).match(WORD) ?? []).length === 0;
  const others = tokens.filter((t) => t !== token && t.start >= reach[0] && t.unitEnd <= reach[1]);
  let best = Number.POSITIVE_INFINITY;
  let roles: Set<Role> | null = null;
  let unit: readonly Role[] | null = null;
  let change = false;
  for (const hit of cues) {
    if (hit.start < reach[0] || hit.end > reach[1]) continue;
    let side: Side;
    let from: number;
    let to: number;
    if (hit.end <= token.start) {
      side = 'left';
      from = hit.end;
      to = token.start;
    } else if (hit.start >= token.unitEnd) {
      side = 'right';
      from = token.unitEnd;
      to = hit.start;
    } else {
      continue;
    }
    if (tokens.some((t) => t !== token && t.start >= from && t.end <= to)) continue;
    const between = scan.slice(from, to);
    const distance = (between.match(WORD) ?? []).length;
    const said = hit.cue.roles(token.percent, side, distance, hit.word, between);
    if (said === null) continue;
    if (hit.cue.unit && side === 'right' && distance === 0 && !token.percent) {
      unit = said;
      continue;
    }
    if (
      distance === 0 &&
      others.some((t) => (side === 'left' ? t.unitEnd <= hit.start && noWord(t.unitEnd, hit.start) : t.start >= hit.end && noWord(hit.end, t.start)))
    ) {
      continue;
    }
    if (said.length === 1 && said[0] === 'drift') change = true;
    if (distance < best) {
      best = distance;
      roles = new Set(said);
    } else if (distance === best && roles !== null) {
      const current: Set<Role> = roles;
      roles = new Set([...current].filter((r) => said.includes(r)));
    }
  }
  if (unit !== null) {
    if (unit.length === 0) return null;
    const own = unit;
    if (roles === null || best > 0) {
      roles = new Set(own);
    } else {
      const both = [...roles].filter((r) => own.includes(r));
      roles = new Set(both.length > 0 ? both : own);
    }
  }
  if (roles === null) {
    if (token.percent) {
      return new Set<Role>(/\bat\s+$/.test(scan.slice(reach[0], token.start)) ? ['stated'] : ['stated', 'hit']);
    }
    roles = new Set<Role>(encouragement ? ['count'] : ['score', 'drift']);
  }
  if (roles.size === 0) return null;
  if (change && roles.has('drift')) roles = new Set<Role>(['drift']);
  if (roles.has('count') && countCameTrue(token, tokens, cues, reach, scan)) return null;
  return roles;
}

/**
 * A cue word that says something happened (not "hit rate", nor "about
 * right"); since round 7 "worked out", "succeeded", "went your way",
 * "resolved yes", "proved true" and "paid off" too.
 */
const HAPPENED_CUE =
  /^(?:happened|happen|happens|happening|came\s+true|come\s+true|comes\s+true|coming\s+true|right|correct|hits?|occurred|occurs?|turned\s+out|landed|panned\s+out|work(?:s|ed|ing)?\s+out|succeed(?:s|ed|ing)?|(?:went|go|goes|going|gone)\s+your\s+way|resolved\s+(?:as\s+)?yes|prov(?:ed|en|es|ing)\s+(?:true|right|correct)|(?:paid|pays|pay|paying)\s+off)$/;
/** "55% of your 25 …": the count right after it is what a share is of. */
const SHARE_OF = /\d+(?:\.\d+)?\s?(?:%|percent\b|per cent\b|pct\b)\s+of\s+(?:all\s+(?:of\s+)?)?(?:(?:your|the|those|these)\s+)?$/;

/**
 * Whether a count has, within its reach, a word that says something
 * happened, so it would read as the number that came true ("In finance, 25
 * predictions came true.", "81 of your predictions came true.", "Finance
 * came true 25 times."): the context holds no such count, only how many were
 * answered (round 6, R12). Not where every such word is pressed against a
 * percentage instead and not against the count ("your 25 finance calls came
 * true 55% of the time"), nor where the count is what a share is of ("55% of
 * your 25 finance answers came true").
 */
function countCameTrue(
  token: NumberToken,
  tokens: readonly NumberToken[],
  cues: readonly CueHit[],
  reach: Span,
  scan: string,
): boolean {
  if (SHARE_OF.test(scan.slice(reach[0], token.start))) return false;
  const noWord = (from: number, to: number) => (scan.slice(from, to).match(WORD) ?? []).length === 0;
  const noNumber = (from: number, to: number) => !tokens.some((o) => o.start >= from && o.end <= to);
  const pressed = (t: NumberToken, h: CueHit) =>
    (t.unitEnd <= h.start && noWord(t.unitEnd, h.start) && noNumber(t.unitEnd, h.start)) ||
    (h.end <= t.start && noWord(h.end, t.start) && noNumber(h.end, t.start));
  return cues.some(
    (h) =>
      h.start >= reach[0] &&
      h.end <= reach[1] &&
      HAPPENED_CUE.test(h.word) &&
      (pressed(token, h) ||
        !tokens.some(
          (p) => p !== token && p.percent && p.start >= reach[0] && p.unitEnd <= reach[1] && pressed(p, h),
        )),
  );
}

/**
 * The way a drift went, in words: up for a positive one, down for a negative
 * one. The verbs apart from the rest, since a negation turns a verb the
 * other way ("didn't improve") but leaves a comparison or a noun unsure
 * ("never been better" is the best yet; "no improvement" may be flat).
 */
const UP_VERB = String.raw`(?:improved|improves|improve|improving|rose|rises|rise|risen|rising|gained|gains|gain|gaining|climbed|climbs|climb|climbing|increased|increases|increase|increasing|grew|grows|grow|growing|jumped|jumps|jump)`;
const UP_OTHER = String.raw`(?:improvement|up(?!\s+(?:to|until|till)\b)|upward|upwards|better|higher|above)`;
const DOWN_VERB = String.raw`(?:slipped|slips|slip|slipping|fell|falls|fall|fallen|falling|dropped|drops|drop|dropping|declined|declines|decline|declining|decreased|decreases|decrease|decreasing|dipped|dips|dip|dipping|sank|sunk|slid|worsened|worsens|worsen|worsening)`;
const DOWN_OTHER = String.raw`(?:down|downward|downwards|worse|lower|below)`;
const UP_WORDS = new RegExp(String.raw`\b(?:${UP_VERB}|${UP_OTHER})\b`);
const DOWN_WORDS = new RegExp(String.raw`\b(?:${DOWN_VERB}|${DOWN_OTHER})\b`);
/**
 * A negation right before a direction word, a word or two of filler allowed
 * ("didn't improve", "hasn't really risen", "isn't getting better", "failed
 * to rise", "without slipping"). Round 7: until then "Work didn't improve by
 * 7.3 points" read as an improvement.
 */
const DIRECTION_NEGATION = String.raw`\b(?:not|never|no longer|didn't|doesn't|don't|hasn't|haven't|hadn't|isn't|aren't|wasn't|weren't|won't|wouldn't|can't|cannot|couldn't|shouldn't|didnt|doesnt|dont|hasnt|havent|hadnt|isnt|arent|wasnt|werent|wouldnt|cant|couldnt|shouldnt|fail(?:s|ed)?\s+to|without)\s+(?:(?:really|actually|yet|quite|much|any|been|be|go|gone|going|goes|went|move|moved|moving|moves|come|came|coming|comes|get|got|gotten|getting|gets)\s+){0,2}`;
/** A negated verb, read the other way: "didn't improve" says down, "hasn't slipped" up. */
const TURNED_UP = new RegExp(String.raw`${DIRECTION_NEGATION}${UP_VERB}\b`, 'g');
const TURNED_DOWN = new RegExp(String.raw`${DIRECTION_NEGATION}${DOWN_VERB}\b`, 'g');
/** A negated comparison or noun, and "no rise", "nor fell": either way. */
const EITHER_WAY = new RegExp(
  String.raw`(?:${DIRECTION_NEGATION}|\b(?:no|nor|neither)\s+(?:(?:real|clear|big|much|any|further|more)\s+)?)(?:${UP_VERB}|${UP_OTHER}|${DOWN_VERB}|${DOWN_OTHER})\b`,
  'g',
);

/** Which ways the words say something went, negations read (round 7). */
function directionsIn(words: string): { up: boolean; down: boolean } {
  let up = false;
  let down = false;
  const rest = words
    .replace(TURNED_UP, () => {
      down = true;
      return ' ';
    })
    .replace(TURNED_DOWN, () => {
      up = true;
      return ' ';
    })
    .replace(EITHER_WAY, () => {
      up = true;
      down = true;
      return ' ';
    });
  return { up: up || UP_WORDS.test(rest), down: down || DOWN_WORDS.test(rest) };
}

/**
 * Whether the words in a drift's reach say the way it went, and that way is
 * its sign (round 6, R12): "improved", "rose", "up", "higher" for a
 * positive drift; "slipped", "fell", "down", "lower" for a negative one.
 * None, both, or the wrong one: dropped. A drift of 0 went neither way.
 * Negations are read (directionsIn).
 */
function saysDirection(words: string, value: number): boolean {
  const { up, down } = directionsIn(words);
  if (up === down) return false;
  return value > 0 ? up : value < 0 ? down : false;
}

/**
 * The words that say a figure moved: the change cue's (CUES), with their
 * -ing forms ("slipping", "rising"), which the cue doesn't read. Not
 * "improvement": "room for improvement" claims no move.
 */
const CHANGE_WORD =
  /\b(?:slipped|slips?|slipping|fell|falls?|fallen|falling|dropped|drops?|dropping|rose|rises?|risen|rising|improved|improves?|improving|climbed|climbs?|climbing|gained|gains?|gaining|declined|declines?|declining|worsened|worsens?|worsening|increased|increases?|increasing|decreased|decreases?|decreasing|dipped|dips?|dipping|jumped|jumps?|jumping|grew|grows?|growing|sank|sinking|slid|sliding|changed|changes?|changing|shifted|shifting|moved|moving|drift(?:ed|s|ing)?|trend(?:ed|ing|s)?)\b/g;
/** "is down to 61", "is up to 88": the words say a figure moved to the number after them. */
const MOVED_TO = /\b(?:up|down)\s+to\s+(?:(?:about|around|roughly|nearly|almost|just|approximately|a|an)\s+)?$/;

/**
 * Whether the words in a number's reach say a figure moved (round 7): a
 * change word on either side with no other number between ("Your finance
 * score fell to 61", "Finance scores 61 after slipping"), or "down to" / "up
 * to" right before it. Said of a score, that needs a drift to back it.
 */
function claimsChange(token: NumberToken, tokens: readonly NumberToken[], reach: Span, scan: string): boolean {
  const noNumber = (from: number, to: number) => !tokens.some((o) => o !== token && o.start >= from && o.end <= to);
  const re = new RegExp(CHANGE_WORD.source, 'g');
  for (let m = re.exec(scan); m !== null; m = re.exec(scan)) {
    const start = m.index;
    const end = start + m[0].length;
    if (start < reach[0] || end > reach[1]) continue;
    if (end <= token.start ? noNumber(end, token.start) : start >= token.unitEnd && noNumber(token.unitEnd, start)) {
      return true;
    }
  }
  return MOVED_TO.test(scan.slice(reach[0], token.start));
}

/**
 * A score, rating or calibration said to have moved, a number beside it or
 * not ("Your finance calibration has been improving lately", "your work
 * score hasn't improved"), round 7: until then a trend said with no number
 * was checked only when the drift was the evidence. A subject comes first,
 * so advice about the numbers ("try increasing your social numbers") isn't
 * one.
 */
const TREND_CLAIM = new RegExp(
  String.raw`\b(?:scores?|ratings?|calibration|accuracy)\s+(?:(?:has|have|had|is|was|were|are|keeps|kept|did|does|hasn't|haven't|hadn't|isn't|wasn't|weren't|aren't|didn't|doesn't|not|never|really|actually|been|also|still|recently|lately)\s+){0,3}${CHANGE_WORD.source}`,
  'g',
);

/** Whether a figure is one a number with these roles may be. */
function fits(f: Figure, token: NumberToken, roles: ReadonlySet<Role>): boolean {
  if (!roles.has(f.role)) return false;
  if (token.percent) return f.kind === 'percent';
  // A plain number is a hit rate only as its 0–1 fraction: "55 happened" reads as a count.
  return f.role === 'hit' ? f.kind === 'rate' : true;
}

/**
 * The one figure a grounded number refers to, or undefined when that can't be
 * told. A match in the insight's own category (or overall) wins over matches
 * elsewhere; if what's left is still more than one figure — 20 answered and a
 * score of 20, say — no source is claimed. This labels; it never decides
 * whether an insight is grounded.
 */
function sourceFor(
  matches: readonly Figure[],
  scope: CoachInsight['category'],
): CoachEvidenceSource | undefined {
  const inScope = matches.filter((m) => m.source.scope === scope);
  const pool = inScope.length > 0 ? inScope : matches;
  const key = (s: CoachEvidenceSource) => `${s.field}|${s.scope}|${s.kind ?? ''}`;
  const distinct = new Map(pool.map((m) => [key(m.source), m.source]));
  return distinct.size === 1 ? [...distinct.values()][0] : undefined;
}

// ---------------------------------------------------------------------------
// One insight
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

/** A normalised field, or null when it can't be shown. */
function cleanField(raw: string, max: number): string | null {
  const text = normalise(raw);
  if (text === null || text.trim().length === 0 || text.length > max) return null;
  return fieldIsClean(text) ? text : null;
}

function judgeInsight(
  raw: unknown,
  context: CoachContext,
  stats: Map<string, CategoryEntry>,
  figures: Figure[],
): CoachInsight | null {
  if (!isObject(raw)) return null;

  const type = raw.type;
  if (typeof type !== 'string' || !(INSIGHT_TYPES as readonly string[]).includes(type)) return null;
  const category = raw.category;
  // Built-ins only (roadmap D39), or 'overall'.
  if (category !== 'overall' && !isBuiltIn(category)) return null;
  if (!isNonEmptyString(raw.message, MAX_MESSAGE_LENGTH)) return null;
  if (!isNum(raw.evidence)) return null;
  const evidence = raw.evidence;

  const message = cleanField(raw.message, MAX_MESSAGE_LENGTH);
  if (message === null) return null;

  // Optional. Not a usable string (missing, empty, too long, not a string):
  // dropped and the insight kept — a bad suggestion shouldn't cost the user a
  // good observation. A usable string is held to every rule the message is,
  // and breaking one drops the insight.
  let suggestion: string | undefined;
  if (isNonEmptyString(raw.suggestion, MAX_SUGGESTION_LENGTH)) {
    const cleaned = cleanField(raw.suggestion, MAX_SUGGESTION_LENGTH);
    if (cleaned === null) return null;
    suggestion = cleaned;
  }

  const text = suggestion === undefined ? message : `${message}\n${suggestion}`;
  const scan = scanForm(text);
  if (wordsBreakARule(text, scan)) return null;
  const badges = badgeUse(casedForm(text));
  if (badges === 'badge') return null;

  const mentions = categoryMentions(scan);
  const named = new Set<BuiltInCategory>(mentions.map((m) => m.category));
  const label = category === 'overall' ? null : category;
  const pastGate = (c: string) => {
    const s = stats.get(c);
    return s !== undefined && s.resolved >= MIN_N_CATEGORY;
  };

  // No verdict on thin data (§5.1). Encouragement ("keep logging") is what
  // thin data should produce, so only it may be about a thin category; every
  // other type, by its label and by every category its words name, needs the
  // gate.
  if (type !== 'encouragement') {
    if (label === null ? context.overall.total_resolved < MIN_N_OVERALL : !pastGate(label)) return null;
    for (const c of named) if (!pastGate(c)) return null;
  }

  // One lean rule (D35): an over- or underconfidence insight is about a
  // category the app itself calls that, never 'overall' (the context carries
  // no overall lean).
  const want =
    type === 'overconfidence' ? 'overconfident' : type === 'underconfidence' ? 'underconfident' : null;
  if (want !== null) {
    if (label === null || !pastGate(label) || stats.get(label)?.direction !== want) return null;
  }
  // And whatever the type, words naming a lean are about categories whose
  // direction says exactly that.
  const about = new Set<string>(named);
  if (label !== null) about.add(label);
  // "just getting started" is the plain phrase, and the first tier's name
  // too: said only where that tier is true, every category it is about under
  // MIN_N_CATEGORY (about none, the whole record under MIN_N_OVERALL).
  if (badges === 'plain') {
    const thin =
      about.size > 0
        ? [...about].every((c) => (stats.get(c)?.resolved ?? 0) < MIN_N_CATEGORY)
        : context.overall.total_resolved < MIN_N_OVERALL;
    if (!thin) return null;
  }
  const every = (test: (c: string, s: CategoryEntry) => boolean) =>
    about.size > 0 &&
    [...about].every((c) => {
      const s = stats.get(c);
      return s !== undefined && pastGate(c) && test(c, s);
    });
  const allAre = (direction: string) => every((_c, s) => s.direction === direction);
  const leans = turnLeans(scan);
  if (OVER_WORDS.test(leans) && !allAre('overconfident')) return null;
  if (UNDER_WORDS.test(leans) && !allAre('underconfident')) return null;
  // A comparison with what was said only in an over/under card it backs.
  if (COMPARE_WORDS.test(leans) && (want === null || !allAre(want))) return null;
  const close = CLOSE_WORDS.test(leans);
  if ((close || NO_LEAN_WORDS.test(leans)) && !allAre('calibrated')) return null;
  // "Well calibrated" only within the chart's 5 points (D57); else "no clear lean".
  if (close && !every((_c, s) => closeToSaid(s.mean_stated_confidence, s.actual_rate * 100))) return null;
  if (
    MISS_WORDS.test(leans) &&
    !every((_c, s) => s.direction === 'overconfident' || s.direction === 'underconfident')
  ) {
    return null;
  }

  // The evidence: a figure of the categories the words name, or the label's
  // when they name none, or an overall one.
  const evidenceScope = named.size > 0 ? named : new Set<string>(label === null ? [] : [label]);
  const evidenceNear = (f: Figure) => Math.abs(f.value - evidence) <= f.tolerance + TOLERANCE_EPSILON;
  const evidenceHits = judge(
    figures,
    (f) => f.scope === 'overall' || evidenceScope.has(f.scope),
    evidenceNear,
    evidenceNear,
    (f) => (type === 'encouragement' ? f.role === 'count' : f.role !== 'index'),
  );
  if (evidenceHits === null) return null;

  // Which categories' stated confidence and hit rate the insight cites, the
  // evidence included (its receipt shows on the card).
  const statedOf = new Set<string>();
  const hitOf = new Set<string>();
  const cite = (f: Figure) => {
    if (f.role === 'stated') statedOf.add(f.scope);
    if (f.role === 'hit') hitOf.add(f.scope);
  };
  evidenceHits.forEach(cite);
  /** The drifts a number in the words was checked as, with its direction. */
  const writtenDrifts = new Set<Figure>();

  // Every number in the words: the kind its words name, of the category its
  // clause or sentence names, as the app rounds it.
  const spans = allowedSpans(scan);
  const tokens = numbersIn(scan);
  const cues = cuesIn(scan);
  const sentenceBreaks = breaksIn(scan, SENTENCE_BREAKS);
  const clauseBreaks = breaksIn(scan, CLAUSE_BREAKS);
  const cueBreaks = [...clauseBreaks, ...breaksIn(scan, CUE_BREAKS)];
  for (const token of tokens) {
    if (spans.some(([s, e]) => token.start >= s && token.end <= e)) continue;
    const clause = segment(token.start, token.unitEnd, clauseBreaks, scan.length);
    const reach = segment(token.start, token.unitEnd, cueBreaks, scan.length);
    const roles = rolesFor(token, tokens, cues, reach, scan, type === 'encouragement');
    if (roles === null) return null;
    const allowed = type === 'encouragement' ? new Set([...roles].filter((r) => r === 'count')) : roles;
    if (allowed.size === 0) return null;
    const bound = bindingFor(token, clause, sentenceBreaks, mentions, scan, label);
    if (bound === null) return null;
    const hits = judge(
      figures,
      (f) => f.scope === bound,
      (f) => nearFigure(f, token),
      (f) => isFigure(f, token),
      (f) => fits(f, token, allowed),
    );
    if (hits === null) return null;
    // A drift is written by its size, so the words say which way it went.
    const words = scan.slice(reach[0], reach[1]);
    const drift = hits.find((f) => f.role === 'drift');
    if (drift !== undefined && !saysDirection(words, drift.value)) return null;
    if (drift !== undefined) writtenDrifts.add(drift);
    // A score the words say moved ("Your finance score fell to 61") claims
    // a change only a drift can back (round 7): a citable drift of the same
    // scope, said the way it went. None (the rating, a weekday, a drift
    // under its gate) or the wrong way: dropped.
    if (drift === undefined && hits.some((f) => f.role === 'score') && claimsChange(token, tokens, reach, scan)) {
      const backing = figures.filter((f) => f.role === 'drift' && f.state === 'citable' && f.scope === bound);
      if (backing.length === 0 || !backing.every((f) => saysDirection(words, f.value))) return null;
    }
    hits.forEach(cite);
  }

  // A drift as the evidence, not written in the words: its receipt shows it
  // with its sign ("−6"), so words that say the other way ("improved
  // recently" beside a negative drift), in the message or (round 7) the
  // suggestion, contradict the card. Negations are read (directionsIn).
  const evidenceDrift = evidenceHits.find((f) => f.role === 'drift');
  if (evidenceDrift !== undefined && !writtenDrifts.has(evidenceDrift)) {
    const { up, down } = directionsIn(scan);
    const wrong = evidenceDrift.value > 0 ? down : evidenceDrift.value < 0 ? up : up || down;
    if (wrong) return null;
  }

  // A score said to have moved, with or without a number (TREND_CLAIM):
  // only where every category the card is about has a citable drift, and the
  // claim's clause says the way each went. About none: the context holds no
  // overall drift, so never.
  const trendScopes = about.size > 0 ? [...about] : ['overall'];
  const trends = new RegExp(TREND_CLAIM.source, 'g');
  for (let m = trends.exec(scan); m !== null; m = trends.exec(scan)) {
    const [from, to] = segment(m.index, m.index + m[0].length, clauseBreaks, scan.length);
    const backing = figures.filter((f) => f.role === 'drift' && f.state === 'citable' && trendScopes.includes(f.scope));
    if (trendScopes.some((s) => !backing.some((f) => f.scope === s))) return null;
    if (!backing.every((f) => saysDirection(scan.slice(from, to), f.value))) return null;
  }

  // What was said set beside what happened names a lean whatever the words
  // around it (record re-review R4: "you said 80%, but 70% happened" where
  // the app says "no clear lean"). Only in an over/under card the category's
  // direction backs, or where the two are within the chart's 5 points, where
  // the app itself says "well calibrated".
  for (const c of statedOf) {
    if (!hitOf.has(c)) continue;
    const s = stats.get(c);
    if (s === undefined) return null;
    const backed = want !== null && s.direction === want;
    if (!backed && !closeToSaid(s.mean_stated_confidence, s.actual_rate * 100)) return null;
  }

  const insight: CoachInsight = {
    type: type as CoachInsightType,
    category: label ?? 'overall',
    message,
    evidence,
  };
  if (suggestion !== undefined) insight.suggestion = suggestion;
  const source = sourceFor(evidenceHits, insight.category);
  if (source) insight.evidence_source = source;
  return insight;
}

/**
 * Validate a raw Coach response against the context it was given.
 *
 * Returns at most three insights. Anything unparseable, ungrounded, under a
 * gate, off-lean or unsafe is dropped; if that leaves nothing, the surface
 * renders nothing, which is the intended fail-safe (§5.8). Messages and
 * suggestions come back NFKC-normalised, as they were checked.
 *
 * A response marked `safe: false` returns no insights at all, regardless of
 * what else it contains; the app shows it as an answer with nothing to say
 * (D73).
 */
export function validateCoachOutput(raw: unknown, context: CoachContext): CoachOutput {
  if (!isObject(raw)) return empty();
  if (raw.safe === false) return { insights: [], safe: false };
  if (!Array.isArray(raw.insights)) return empty();

  const stats = statsByCategory(context);
  const figures = figuresOf(context, stats);
  const insights: CoachInsight[] = [];
  for (const item of raw.insights) {
    const insight = judgeInsight(item, context, stats, figures);
    if (!insight) continue;
    insights.push(insight);
    if (insights.length === MAX_INSIGHTS) break;
  }
  return { insights, safe: true };
}
