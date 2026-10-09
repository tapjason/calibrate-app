// Daily practice (roadmap step 88): which three questions a day asks, and
// what the answers so far come to.
//
// Layer rule: L3 engine — imports only from @/types and sibling engine files.
// The reference tables are passed in (constants/practiceFacts.ts in the app,
// small fixtures in tests), so this file holds the rules and no trivia.
//
// The same three for everyone on the same local day: the day number decides
// them, so every phone (and every reinstall) asks the same questions with no
// server. "It's one puzzle, and everybody is solving it" (Wordle's creator,
// research/retention-2026-10.md §2.5).
//
// Random pairs, not picked ones: Gigerenzer, Hoffrage & Kleinbölting (1991)
// found overconfidence disappears when questions are sampled from a natural
// class and appears when they are selected for trickiness. Each pair must
// differ clearly (MIN_GAP), so no answer rests on which source a number came
// from, and not wildly (MAX_GAP), so few are giveaways.
//
// Practice is scored with the same bucketing as real predictions, so its
// chart means what the real one means, and never touches the real one.

import {
  PRACTICE_KINDS,
  PRACTICE_MIN_N,
  PRACTICE_PER_DAY,
  type PracticeAnswer,
  type PracticeDayTally,
  type PracticeFacts,
  type PracticeKind,
  type PracticeQuestion,
  type PracticeRecord,
} from '@/types';

import { computeCalibrationPoints } from './calibration';
import { classifyDirection } from './direction';

export { PRACTICE_KINDS };

/**
 * How far apart two entries must be to make a fair question: more than the
 * sources disagree by (Mont Blanc's 4,806 or 4,808 m; an area with or
 * without inland water), so no answer rests on which source was used.
 */
export const MIN_GAP = {
  /** Degrees of latitude. */
  north: 1,
  /** Degrees of longitude. */
  east: 2,
  /** Ratio of the larger area to the smaller. */
  area: 1.25,
  /** Ratio of heights. */
  height: 1.05,
  /** Ratio of diameters. */
  size: 1.05,
  /** Years. */
  first: 3,
  born: 3,
  /** Atomic numbers are exact. */
  element: 1,
} as const;

/**
 * How far apart two entries may be. Random pairs from the whole table were
 * half giveaways ("Auckland or San Francisco, farther north?"), and a practice
 * that's mostly obvious teaches nothing and isn't worth opening. So pairs are
 * drawn at random from those within a band of closeness: chosen for how near
 * they are, never for whether the obvious answer is wrong (the Warmup's
 * selection, D14). Longitude's cap also keeps "east" to one answer: past 180°
 * apart, either way round is shorter.
 */
export const MAX_GAP = {
  north: 12,
  east: 30,
  area: 4,
  height: 1.6,
  size: 4,
  first: 100,
  born: 60,
  element: 30,
} as const;

/**
 * The entries one kind compares, reduced to the option's label, the name used
 * mid-sentence, and a value where larger wins (latitude, longitude, area,
 * height, diameter, atomic number, or a year negated so earlier wins).
 */
interface Entry {
  label: string;
  name: string;
  value: number;
  /** For `first`: the answer key's sentence. */
  said?: string;
}

function entriesFor(facts: PracticeFacts, kind: PracticeKind): Entry[] {
  switch (kind) {
    case 'north':
      return facts.places.map((p) => ({ label: p.name, name: p.name, value: p.lat }));
    case 'east':
      return facts.places.map((p) => ({ label: p.name, name: p.name, value: p.lon }));
    case 'area':
      return facts.countries.map(measure);
    case 'height':
      return facts.mountains.map(measure);
    case 'size':
      return facts.bodies.map(measure);
    case 'first':
      // Earlier wins, so the value is the year negated: larger still wins below.
      return facts.events.map((e) => ({ label: e.name, name: e.name, value: -e.year, said: e.said }));
    case 'born':
      return facts.people.map((p) => ({ label: p.name, name: p.name, value: -p.born }));
    case 'element':
      return facts.elements.map((e) => ({ label: e.name, name: e.name.toLowerCase(), value: e.z }));
  }
}

function measure(m: { name: string; value: number; label?: string }): Entry {
  return { label: m.label ?? capitalise(m.name), name: m.name, value: m.value };
}

/** Whether two entries differ enough to ask about. Values are compared as "larger wins". */
function fair(kind: PracticeKind, a: Entry, b: Entry): boolean {
  const hi = Math.max(a.value, b.value);
  const lo = Math.min(a.value, b.value);
  switch (kind) {
    case 'north':
    case 'east':
    case 'first':
    case 'born':
    case 'element':
      return hi - lo >= MIN_GAP[kind] && hi - lo <= MAX_GAP[kind];
    case 'area':
    case 'height':
    case 'size':
      return lo > 0 && hi / lo >= MIN_GAP[kind] && hi / lo <= MAX_GAP[kind];
  }
}

const PROMPTS: Record<PracticeKind, string> = {
  north: 'Which is farther north?',
  east: 'Which is farther east?',
  area: 'Which country is larger?',
  height: 'Which mountain is taller?',
  size: 'Which has the larger diameter?',
  first: 'Which happened first?',
  born: 'Who was born first?',
  element: 'Which element has the higher atomic number?',
};

const grouped = (n: number) => Math.round(n).toLocaleString('en-US');

/** Three significant figures, never in exponent form: 1.96, 506,000, 0.49. */
function sig3(n: number): string {
  const digits = Math.floor(Math.log10(Math.abs(n))) + 1;
  const places = Math.max(0, 3 - digits);
  const rounded = Number(n.toFixed(places));
  return places > 0 ? String(rounded) : grouped(Number(rounded.toPrecision(3)));
}

const latitude = (v: number) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
const longitude = (v: number) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'E' : 'W'}`;
const area = (km2: number) =>
  km2 >= 1_000_000 ? `${sig3(km2 / 1_000_000)} million km²` : `${sig3(km2)} km²`;

/** The answer key's sentence: the winner first, then the other. */
function factFor(kind: PracticeKind, win: Entry, other: Entry): string {
  const gap = Math.round(Math.abs(win.value - other.value));
  switch (kind) {
    case 'north':
      return `${win.name} is about ${gap}° farther north than ${other.name} (${latitude(win.value)} against ${latitude(other.value)}).`;
    case 'east':
      return `${win.name} is about ${gap}° farther east than ${other.name} (${longitude(win.value)} against ${longitude(other.value)}).`;
    case 'area':
      return `${win.name} covers about ${area(win.value)}, ${other.name} about ${area(other.value)}.`;
    case 'height':
      return `${win.name} is ${grouped(win.value)} m high, ${other.name} ${grouped(other.value)} m.`;
    case 'size':
      return `${win.name} is ${grouped(win.value)} km across, ${other.name} ${grouped(other.value)} km.`;
    case 'first':
      return `${win.said}; ${lowerThe(other.said ?? other.name)}.`;
    case 'born':
      return `${win.name} was born in ${-win.value}, ${other.name} in ${-other.value}.`;
    case 'element':
      return `${win.name} is element ${win.value}, ${other.name} element ${other.value}.`;
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "The Bastille…" mid-sentence reads "the Bastille…"; names stay as they are. */
function lowerThe(s: string): string {
  return s.startsWith('The ') ? `the ${s.slice(4)}` : s;
}

/** mulberry32: small, fast, and the same sequence on every JS engine. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Spread neighbouring days far apart in seed space. */
function seedFor(day: number): number {
  return (Math.imul(day | 0, 0x9e3779b1) ^ 0x5eed_ca1b) >>> 0;
}

/**
 * The order kinds take their turns in. Each day asks the next three, so a kind
 * comes round three days in eight, and the two that both use the city table
 * (north, east) sit four apart and never share a day.
 */
const ROTATION: readonly PracticeKind[] = [
  'north',
  'first',
  'area',
  'element',
  'east',
  'born',
  'height',
  'size',
];

/** A fixed seed per kind, so each kind's deck is shuffled the same way everywhere. */
function seedForKind(kind: PracticeKind): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < kind.length; i += 1) h = Math.imul(h ^ kind.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const decks = new WeakMap<PracticeFacts, Map<PracticeKind, readonly [Entry, Entry][]>>();

/**
 * Every fair pair a kind's table holds, in one shuffled order: the kind's
 * deck. Dealt in turn, so a pair comes back only after every other one has
 * been asked (about a year for the smallest table), and the sequence is a
 * uniform random draw from the whole class (Gigerenzer et al.'s
 * representative sampling).
 */
function deckFor(facts: PracticeFacts, kind: PracticeKind): readonly [Entry, Entry][] {
  let byKind = decks.get(facts);
  if (!byKind) {
    byKind = new Map();
    decks.set(facts, byKind);
  }
  const cached = byKind.get(kind);
  if (cached) return cached;
  const entries = entriesFor(facts, kind);
  const pairs: [Entry, Entry][] = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (fair(kind, entries[i]!, entries[j]!)) pairs.push([entries[i]!, entries[j]!]);
    }
  }
  const next = prng(seedForKind(kind));
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }
  byKind.set(kind, pairs);
  return pairs;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * The questions for one local day: `count` of them, each of a different kind,
 * the same on every device. Turn `t = day × count + slot` picks the kind from
 * ROTATION and the card from that kind's deck; the correct option lands first
 * or second at random, so position says nothing. A kind whose table has no
 * fair pair (only in tests) passes its turn to the next.
 */
export function practiceQuestions(
  facts: PracticeFacts,
  day: number,
  count: number = PRACTICE_PER_DAY,
): PracticeQuestion[] {
  const order = prng(seedFor(day));
  const questions: PracticeQuestion[] = [];
  const used = new Set<PracticeKind>();
  for (let slot = 0; slot < count; slot += 1) {
    const turn = day * count + slot;
    for (let step = 0; step < ROTATION.length; step += 1) {
      const kind = ROTATION[mod(turn + step, ROTATION.length)]!;
      if (used.has(kind)) continue;
      const deck = deckFor(facts, kind);
      if (deck.length === 0) continue;
      used.add(kind);
      const [a, b] = deck[mod(Math.floor(turn / ROTATION.length), deck.length)]!;
      const win = a.value > b.value ? a : b;
      const other = win === a ? b : a;
      const winFirst = order() < 0.5;
      const options: [string, string] = winFirst ? [win.label, other.label] : [other.label, win.label];
      questions.push({
        id: `${kind}:${options[0]}|${options[1]}`,
        kind,
        prompt: PROMPTS[kind],
        options,
        correctIndex: winFirst ? 0 : 1,
        fact: capitalise(factFor(kind, win, other)),
      });
      break;
    }
  }
  return questions;
}

/**
 * Day numbers the Warmup draws from. Negative, so they sit before every real
 * local day (day 0 is 1970-01-01) and never repeat a day's practice.
 */
const WARMUP_DAYS = [-1, -2] as const;

/**
 * Where the right answer sits, question by question: five first, five second,
 * in no pattern a person would guess. The draw alone put eight of ten second,
 * and with one fixed set, "always pick the second" would score 80% for all.
 */
const WARMUP_CORRECT_AT = [0, 1, 1, 0, 0, 1, 0, 1, 1, 0] as const;

/**
 * The Warmup's ten (roadmap D18 (1)): drawn from the practice tables like a
 * day's practice, not picked to be tricky. Two draws of five, so a kind may
 * appear twice, each time with a different pair. The same ten for everyone,
 * which lets the answer key be re-derived without storing the questions.
 */
export function warmupQuestions(facts: PracticeFacts): PracticeQuestion[] {
  const seen = new Set<string>();
  const questions: PracticeQuestion[] = [];
  for (const day of WARMUP_DAYS) {
    for (const q of practiceQuestions(facts, day, 5)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      questions.push(q);
    }
  }
  return questions.map((q, i) => {
    const want = WARMUP_CORRECT_AT[i % WARMUP_CORRECT_AT.length]!;
    if (q.correctIndex === want) return q;
    const options: [string, string] = [q.options[1], q.options[0]];
    return { ...q, id: `${q.kind}:${options[0]}|${options[1]}`, options, correctIndex: want };
  });
}

/** One day's answers in counts. */
export function practiceDayTally(answers: readonly PracticeAnswer[]): PracticeDayTally {
  return {
    answered: answers.length,
    correct: answers.filter((a) => a.correct).length,
    expected: answers.reduce((sum, a) => sum + a.confidence / 100, 0),
  };
}

/**
 * Everything practised so far. Which way it leans, and the chart's bands,
 * only from PRACTICE_MIN_N answers: below that a lean is noise, the same rule
 * as the real rating's.
 */
export function scorePractice(answers: readonly PracticeAnswer[]): PracticeRecord {
  const answered = answers.length;
  if (answered === 0) {
    return {
      answered: 0,
      correct: 0,
      days: 0,
      mean_confidence: 0,
      accuracy: 0,
      direction: null,
      buckets: [],
    };
  }
  const correct = answers.filter((a) => a.correct).length;
  const meanConfidence = answers.reduce((sum, a) => sum + a.confidence, 0) / answered;
  const accuracy = correct / answered;
  const enough = answered >= PRACTICE_MIN_N;
  return {
    answered,
    correct,
    days: new Set(answers.map((a) => a.day)).size,
    mean_confidence: meanConfidence,
    accuracy,
    direction: enough ? classifyDirection(meanConfidence, accuracy) : null,
    buckets: enough
      ? computeCalibrationPoints(answers.map((a) => ({ confidence: a.confidence, yes: a.correct })))
          .buckets
      : [],
  };
}
