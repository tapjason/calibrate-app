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
// What is enforced (security review, 2026-11-18; every check fails closed):
//   - Numbers: the overall rating only from MIN_N_OVERALL scored answers; a
//     category's score, mean stated confidence, hit rate and drift only from
//     MIN_N_CATEGORY in that category; the weekday score only with the
//     overall gate and WEEKDAY_MIN_N answers on that day; the weekday index
//     never. A number that also matches a figure still under its gate is
//     dropped. Encouragement cites counts only. Which figure a number may be
//     is decided by the categories the words name (or the label when they
//     name none), never by the model's label alone.
//   - Leans: over / under / well calibrated only about categories whose
//     `direction` says exactly that, past MIN_N_CATEGORY; never overall.
//   - Words: no links, addresses, phone numbers, markup, invisible or unusual
//     characters, spelled-out numbers, badge names, numeric health targets,
//     domain advice, referrals or mental-state claims.

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

// ---------------------------------------------------------------------------
// The words (§5.2, §5.3, §5.4)
// ---------------------------------------------------------------------------

/**
 * NFKC, so look-alike and compatibility characters (fullwidth digits, the
 * mathematical alphabets, ligatures, superscripts) are checked as the plain
 * characters they render as, and line endings as \n. Null when the runtime
 * can't normalise: the insight is then dropped, never checked unnormalised.
 * (Hermes implements String.prototype.normalize, NFKC included.)
 */
function normalise(text: string): string | null {
  try {
    if (typeof text.normalize !== 'function') return null;
    return text.normalize('NFKC').replace(/\r\n?/g, '\n');
  } catch {
    return null;
  }
}

/**
 * Every character a message may hold, after NFKC: printable ASCII, one kind
 * of line break, and the typographic punctuation a model writes in English
 * (hyphen, en and em dashes, curly quotes, bullet, middle dot, minus, approx,
 * the two inequalities, plus-minus, arrow). Anything else is dropped: bidi
 * and zero-width characters, controls, other scripts (homoglyphs), digits
 * from other scripts (which the number check can't read), emoji, currency.
 */
const ALLOWED_CHARACTERS =
  /^[\x20-\x7E\n‐–—‘’“”•·−≈≤≥±→]*$/;

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
 * asks for digits.
 */
const NUMBER_WORDS =
  /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|dozens?|half|halves|halved|thirds?|quarters?|twice|double[sd]?|doubling|triple[sd]?|tripling|(?:two|three|four|five|ten)fold)\b/;
/** Idioms that hold a number word but claim no number; removed before the check. */
const NUMBER_WORD_IDIOMS =
  /\b(?:(?:older|newer|earlier|recent|later|latest|first|second) half|both halves|think(?:ing)? twice|double[\s-]check\w*|zero(?:ing)? in on)\b/g;

/** Badge tiers: the context has none, so any tier named is a guess. */
const BADGE_NAMES = /\b(?:oracles?|forecasters?|trackers?)\b/;

/**
 * Out-of-domain direction the Coach must never give (§5.3, §5.4): medical,
 * financial or legal advice, numeric diet, sleep or exercise targets,
 * referrals and helplines (the support surface does that, never the model),
 * product names, and claims about the person's mind. A prompt is a request; a
 * validator is a guarantee: "move 40% into bonds" cites a real number whenever
 * 40 appears in the context. These only ever drop a card. Read on the
 * lowercased text with apostrophes and dashes made plain.
 */
const DOMAIN_ADVICE: readonly RegExp[] = [
  // Financial direction
  /\b(invest|buy|sell|short|allocate|move|shift|put)\b[^.]*\b(stocks?|bonds?|crypto|shares?|portfolio|savings|your money|\d+\s?%)/,
  /\b(financial advisor|investment advice)\b/,
  /\b\d+\s?%\s*(?:of\s+)?(?:your\s+)?(?:income|salary|pay|paycheck|earnings|budget|savings|portfolio)\b/,
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
  /\b(?:see|consult|talk(?:ing)? to|speak(?:ing)? (?:to|with)|visit|ask|contact|call|book|get help from|reach out to|check with)\s+(?:(?:a|an|your|the)\s+)?(?:doctor|physician|gp|nurse|therapist|psychologist|psychiatrist|counsell?or|lawyer|attorney|solicitor|accountant|dietitian|nutritionist|trainer|(?:financial|investment|tax|legal) (?:advisor|adviser|planner|professional)|advisor|adviser|planner|specialist|mental health professional)\b/,
  /\b(?:therapy|therapists?|psychiatrists?|psychologists?|counsell?ing|hotlines?|helplines?|lifelines?|crisis lines?|988)\b/,
  // Diagnosis, mental states and personality (§5.3)
  /\b(?:anxiety|anxious|depression|depressed|adhd|ocd|bipolar|trauma|traumati[sz]ed|ptsd|disorders?|narcissis\w*|neurotic|burnout|mental illness|mental health)\b/,
  /\b(?:you're|you are|you seem(?: to be)?|you sound|you appear(?: to be)?|you feel|you might be|you may be|you must be|you're probably|you are probably|you're likely|you are likely)\s+(?:a bit |very |quite |really |so |too |an? )?(?:anxious|depressed|stressed|afraid|scared|fearful|insecure|nervous|worried|impulsive|lazy|reckless|arrogant|neurotic|perfectionist|pessimist|pessimistic|optimist|burn(?:ed|t) out|overwhelmed|unhappy|sad|lonely|manic|obsessive|compulsive|avoidant|in denial|fragile)\b/,
];

/** Words that name a lean. Read on the lowercased text, dashes made plain. */
const OVER_WORDS =
  /\bover[\s-]?confiden(?:t|ce)\b|\btoo (?:sure|confident|certain|optimistic|high)\b|\bover[\s-]?estimat\w*|\bover[\s-]?sure\b|\bmore (?:sure|confident|certain) than\b|\b(?:ran|runs|run|running) (?:a bit |slightly )?(?:hot|high|ahead)\b/;
const UNDER_WORDS =
  /\bunder[\s-]?confiden(?:t|ce)\b|\btoo (?:cautious|unsure|careful|timid|conservative|pessimistic|modest|hesitant|low|humble)\b|\bunder[\s-]?estimat\w*|\bunder[\s-]?sell\w*|\bless (?:sure|confident|certain) than\b|\b(?:ran|runs|run|running) (?:a bit |slightly )?(?:cold|low)\b/;
const CALIBRATED_WORDS =
  /\bwell[\s-]calibrated\b|\b(?:perfectly|nicely|highly|very|really|quite|fairly|pretty|closely|tightly) calibrated\b|\bno (?:clear |real |obvious )?lean\b|\bspot[\s-]on\b|\bright on target\b/;

/** How the text names each built-in ("work on" is advice, not the category). */
const CATEGORY_WORDS: Readonly<Record<BuiltInCategory, RegExp>> = {
  work: /\bwork\b(?!\s+(?:on|at|out|through|towards?|with)\b)/,
  health: /\bhealth\b/,
  finance: /\b(?:finance|finances|financial|money)\b/,
  social: /\bsocial\b/,
  personal: /\bpersonal\b/,
};

/** Lowercased, curly apostrophes and the dash family made plain, for the word checks. */
function scanForm(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[‐–—−]/g, '-')
    .toLowerCase();
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
  if (BADGE_NAMES.test(scan)) return true;
  return DOMAIN_ADVICE.some((p) => p.test(scan));
}

function categoriesNamedIn(scan: string): Set<BuiltInCategory> {
  const named = new Set<BuiltInCategory>();
  for (const c of CATEGORIES) if (CATEGORY_WORDS[c].test(scan)) named.add(c);
  return named;
}

// ---------------------------------------------------------------------------
// The numbers (§5.1)
// ---------------------------------------------------------------------------

type FigureKind = 'count' | 'score' | 'percent' | 'rate' | 'index';

/**
 * A number the model was shown, with the figure it came from (so the card can
 * say what the number counts).
 *   citable  - past its gate: may ground a number
 *   withheld - under its gate: grounds nothing, and a number that matches it
 *              is dropped even if it also matches a citable figure
 *   neutral  - the weekday index and its answer count: never cited, never
 *              blocking
 */
interface Figure {
  value: number;
  tolerance: number;
  kind: FigureKind;
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
    scope: string,
    state: Figure['state'],
    source: CoachEvidenceSource,
  ) => figures.push({ value, tolerance: toleranceFor(value, kind), kind, scope, state, source });

  const { calibration_rating, total_resolved } = context.overall;
  const overallOk = total_resolved >= MIN_N_OVERALL;
  add(calibration_rating, 'score', 'overall', overallOk ? 'citable' : 'withheld', {
    field: 'calibration_rating',
    scope: 'overall',
    value: calibration_rating,
  });
  add(total_resolved, 'count', 'overall', 'citable', {
    field: 'total_resolved',
    scope: 'overall',
    value: total_resolved,
  });

  for (const c of stats.values()) {
    const scope = c.category;
    const gate = c.resolved >= MIN_N_CATEGORY ? 'citable' : 'withheld';
    add(c.resolved, 'count', scope, 'citable', { field: 'resolved', scope, value: c.resolved });
    add(c.calibration_score, 'score', scope, gate, {
      field: 'calibration_score',
      scope,
      value: c.calibration_score,
    });
    add(c.mean_stated_confidence, 'percent', scope, gate, {
      field: 'mean_stated_confidence',
      scope,
      value: c.mean_stated_confidence,
    });
    const hitRate: CoachEvidenceSource = { field: 'actual_rate', scope, value: c.actual_rate };
    add(c.actual_rate, 'rate', scope, gate, hitRate);
    // Rates arrive as 0–1 and are written as percentages: the same fact.
    if (c.actual_rate >= 0 && c.actual_rate <= 1) add(c.actual_rate * 100, 'percent', scope, gate, hitRate);
  }

  const answers = context.patterns.find((p) => p.kind === WEEKDAY_ANSWERS_KIND)?.value;
  const weekdayOk = overallOk && typeof answers === 'number' && answers >= WEEKDAY_MIN_N;
  for (const p of context.patterns) {
    const source: CoachEvidenceSource = { field: 'pattern', scope: 'overall', value: p.value, kind: p.kind };
    if (p.kind === WEEKDAY_KIND || p.kind === WEEKDAY_ANSWERS_KIND) {
      add(p.value, p.kind === WEEKDAY_KIND ? 'index' : 'count', 'overall', 'neutral', source);
    } else if (p.kind === WEEKDAY_SCORE_KIND) {
      add(p.value, 'score', 'overall', weekdayOk ? 'citable' : 'withheld', source);
    } else if (p.kind.startsWith(DRIFT_PREFIX)) {
      const category = p.kind.slice(DRIFT_PREFIX.length);
      const stat = stats.get(category);
      const ok = stat !== undefined && stat.resolved >= MIN_N_CATEGORY;
      add(p.value, 'score', isBuiltIn(category) ? category : 'overall', ok ? 'citable' : 'withheld', source);
    } else {
      add(p.value, 'score', 'overall', 'withheld', source);
    }
  }
  return figures;
}

/**
 * The figures a number may be, or null when it may not be cited: it matches
 * no citable figure of an allowed kind, or it matches a withheld one.
 */
function judge(
  figures: readonly Figure[],
  inScope: (f: Figure) => boolean,
  matches: (f: Figure) => boolean,
  kinds: ReadonlySet<FigureKind>,
): Figure[] | null {
  const ok: Figure[] = [];
  for (const f of figures) {
    if (!inScope(f) || !matches(f)) continue;
    if (f.state === 'withheld') return null;
    if (f.state === 'citable' && kinds.has(f.kind)) ok.push(f);
  }
  return ok.length > 0 ? ok : null;
}

interface NumberToken {
  value: number;
  percent: boolean;
  start: number;
  end: number;
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
    tokens.push({
      value: Number(m[0].replace(/,/g, '')),
      percent: /^\s?(?:%|percent\b|per cent\b|pct\b)/i.test(text.slice(end)),
      start: m.index,
      end,
    });
  }
  return tokens;
}

/**
 * The only numbers not taken from the context: a gate the prompt names, in
 * its own phrasing ("at 20 scored answers", "until 10 answers"), and the
 * scale ("72/100", "out of 100"). Nothing else: "20 points" or "you have 20
 * answers" must still match a figure.
 */
function allowedSpans(text: string): Array<[number, number]> {
  const gates = [...new Set([MIN_N_OVERALL, MIN_N_CATEGORY, WEEKDAY_MIN_N])].join('|');
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

const ALL_KINDS: ReadonlySet<FigureKind> = new Set<FigureKind>(['count', 'score', 'percent', 'rate']);
const COUNT_KINDS: ReadonlySet<FigureKind> = new Set<FigureKind>(['count']);
const PERCENT_KINDS: ReadonlySet<FigureKind> = new Set<FigureKind>(['percent']);

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

  const named = categoriesNamedIn(scan);
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
  if (type === 'overconfidence' || type === 'underconfidence') {
    const want = type === 'overconfidence' ? 'overconfident' : 'underconfident';
    if (label === null || !pastGate(label) || stats.get(label)?.direction !== want) return null;
  }
  // And whatever the type, words naming a lean are about categories whose
  // direction says exactly that.
  const about = new Set<string>(named);
  if (label !== null) about.add(label);
  const allAre = (direction: string) =>
    about.size > 0 && [...about].every((c) => pastGate(c) && stats.get(c)?.direction === direction);
  if (OVER_WORDS.test(scan) && !allAre('overconfident')) return null;
  if (UNDER_WORDS.test(scan) && !allAre('underconfident')) return null;
  if (CALIBRATED_WORDS.test(scan) && !allAre('calibrated')) return null;

  // Which figures a number may be: those of the categories the words name,
  // or the label's when they name none, and the overall ones.
  const scope = named.size > 0 ? named : new Set<string>(label === null ? [] : [label]);
  const inScope = (f: Figure) => f.scope === 'overall' || scope.has(f.scope);
  const kinds = type === 'encouragement' ? COUNT_KINDS : ALL_KINDS;

  const evidenceHits = judge(figures, inScope, (f) => Math.abs(f.value - evidence) <= f.tolerance, kinds);
  if (evidenceHits === null) return null;

  const spans = allowedSpans(text);
  for (const token of numbersIn(text)) {
    if (spans.some(([s, e]) => token.start >= s && token.end <= e)) continue;
    const tokenKinds = token.percent
      ? new Set([...kinds].filter((k) => PERCENT_KINDS.has(k)))
      : kinds;
    const hits = judge(
      figures,
      inScope,
      (f) => Math.abs(Math.abs(f.value) - token.value) <= f.tolerance,
      tokenKinds,
    );
    if (hits === null) return null;
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
 * A response marked `safe: false` — the crisis path — returns no insights at
 * all, regardless of what else it contains.
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
