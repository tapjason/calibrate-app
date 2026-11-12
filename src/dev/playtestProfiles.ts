// Named start states for playtests and the owner's device checks
// (docs/app-profile.md §9). Development only: the one caller is the
// __DEV__-gated /dev/seed route, through loadProfile.ts.
//
// Deterministic and pure, like src/db/demoData.ts: the same profile, user and
// clock always give the same rows. Each one stands for where a persona is in
// the app (§10's "Where they are in the app" axis), so a round can start a run
// on the iPhone and on the web build from the same record.

import { buildDemoPredictions } from '@/db/demoData';
import type { Category, CategoryDef, Prediction } from '@/types';

export type ProfileId =
  | 'day1'
  | 'first-week'
  | 'habit'
  | 'return'
  | 'threshold'
  | 'long-time'
  | 'stress'
  | 'years';

export interface PlaytestProfile {
  id: ProfileId;
  /** The button on /dev/seed. */
  label: string;
  /** What the record holds, in a line. */
  summary: string;
  /** The §10 personas it suits, for the round's cast table. */
  personas: string[];
}

export interface ProfileData {
  predictions: Prediction[];
  categories: CategoryDef[];
}

export const PLAYTEST_PROFILES: readonly PlaytestProfile[] = [
  {
    id: 'day1',
    label: 'Day 1: the first answer is due',
    summary: 'Warm-up done; the first prediction is due tonight, one more next week.',
    personas: ['Maya', 'Grace', 'Destiny'],
  },
  {
    id: 'first-week',
    label: 'First week',
    summary:
      'Six days in: three answered (one Can’t tell, one same-day and not scored), two open, one due today; Social renamed.',
    personas: ['Mateus', 'Hiroshi', 'Rahel', 'Lucía'],
  },
  {
    id: 'habit',
    label: 'A daily habit, three weeks',
    summary:
      'The same walk logged each evening for the next day, a streak through yesterday, misses at 90%; Personal renamed Recovery.',
    personas: ['Marcus', 'Piotr', 'Kiri', 'Hannah'],
  },
  {
    id: 'return',
    label: 'Back after three weeks away',
    summary: 'Six weeks in bursts, then nothing for 22 days: six came due while away.',
    personas: ['Jun', 'Carol', 'Conceição', 'Bea'],
  },
  {
    id: 'threshold',
    label: 'One answer from unlocking',
    summary:
      '19 scored answers, all in health, so the next scored one unlocks the rating and the health score at once; two thin ranges.',
    personas: ['Tomás', 'Ravi', 'Kai', 'Noor'],
  },
  {
    id: 'long-time',
    label: 'Five months (the demo record)',
    summary: 'The demo data: about 153 answered over five months, 7 open, every category unlocked.',
    personas: ['Priya', 'Bex', 'Keisha', 'Seun'],
  },
  {
    id: 'stress',
    label: 'Stress: long text, many scripts, a crowded list',
    summary:
      '36 open (12 overdue), 200-character titles, Arabic, Japanese, Ge’ez and Hindi titles, unbroken words, 8 added categories at the 24-character limit, 500-character notes, 0% and 100%.',
    personas: ['Dana', 'Rosa', 'Amira', 'Farah', 'Hiroshi'],
  },
  {
    id: 'years',
    label: 'Three years, every day',
    summary: 'A 1,000-day streak, one a day answered the next evening: four-digit counts everywhere.',
    personas: ['Piotr', 'Keisha', 'Tomás'],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** A clock time on the day `daysAgo` before `now`, in the device's zone. */
function at(now: Date, daysAgo: number, hour: number, minute = 0): string {
  const d = new Date(now.getTime() - daysAgo * DAY_MS);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** A small seeded generator, so a profile is the same on every load. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

interface Row {
  title: string;
  category: Category;
  confidence: number;
  /** Days before now it was logged. */
  made: number;
  /** Days before now it was due (negative: still ahead). */
  due: number;
  status: Prediction['status'];
  reflection?: string | null;
  /** Answered on the day it was logged (D41), at 21:00 that day. */
  sameDay?: boolean;
}

function rows(tag: string, userId: string, now: Date, list: Row[]): Prediction[] {
  return list.map((r, i) => {
    const answeredDay = r.sameDay ? r.made : r.due;
    return {
      id: `${tag}-${i}`,
      user_id: userId,
      title: r.title,
      category: r.category,
      confidence: r.confidence,
      created_at: at(now, r.made, 8, 30),
      due_date: at(now, r.due, 12),
      status: r.status,
      resolved_at:
        r.status === 'pending' ? null : at(now, Math.max(answeredDay, 0), r.sameDay ? 21 : 20),
      reflection: r.reflection ?? null,
      integrity_bonus: r.confidence >= 35 && r.confidence <= 65,
    };
  });
}

function def(
  userId: string,
  now: Date,
  id: Category,
  name: string | null,
  extra: Partial<CategoryDef> = {},
): CategoryDef {
  return {
    id,
    user_id: userId,
    name,
    icon: null,
    hidden: false,
    position: 0,
    created_at: at(now, 30, 9),
    ...extra,
  };
}

function day1(tag: string, userId: string, now: Date): ProfileData {
  return {
    predictions: rows(tag, userId, now, [
      { title: 'I finish my most important task tomorrow', category: 'work', confidence: 70, made: 1, due: 0, status: 'pending' },
      { title: 'I cook at home four nights this week', category: 'health', confidence: 60, made: 1, due: -6, status: 'pending' },
    ]),
    categories: [],
  };
}

function firstWeek(tag: string, userId: string, now: Date): ProfileData {
  return {
    predictions: rows(tag, userId, now, [
      { title: 'The 08:12 tram is on time', category: 'personal', confidence: 80, made: 5, due: 4, status: 'resolved_no' },
      { title: 'I run 10 km under 55 minutes on Sunday', category: 'health', confidence: 60, made: 5, due: 3, status: 'resolved_yes' },
      { title: 'The sprint review moves to Thursday', category: 'work', confidence: 70, made: 4, due: 2, status: 'skipped' },
      { title: 'At least eight people come to the club run', category: 'social', confidence: 75, made: 3, due: 1, status: 'resolved_yes', sameDay: true },
      { title: 'The release ships before Friday', category: 'work', confidence: 85, made: 2, due: 0, status: 'pending' },
      { title: 'It rains during Saturday’s long run', category: 'health', confidence: 40, made: 1, due: -2, status: 'pending' },
    ]),
    categories: [def(userId, now, 'social', 'Running club')],
  };
}

function habit(tag: string, userId: string, now: Date): ProfileData {
  const list: Row[] = [];
  for (let d = 21; d >= 1; d--) {
    // Logged the evening before, answered the next evening: scored (D56).
    // Fixed misses (one day in four, 16 of 21 at 90%), so the lean shows.
    const walked = d % 4 !== 0;
    list.push({
      title: 'I walk 30 minutes today',
      category: 'health',
      confidence: 90,
      made: d + 1,
      due: d,
      status: walked ? 'resolved_yes' : 'resolved_no',
    });
    if (d % 3 === 0) {
      list.push({
        title: 'I make my 7pm meeting tonight',
        category: 'personal',
        confidence: 85,
        made: d + 1,
        due: d,
        status: d % 9 === 0 ? 'resolved_no' : 'resolved_yes',
      });
    }
  }
  list.push({ title: 'I walk 30 minutes today', category: 'health', confidence: 90, made: 1, due: 0, status: 'pending' });
  list.push({ title: 'I make my 7pm meeting tonight', category: 'personal', confidence: 85, made: 1, due: 0, status: 'pending' });
  return {
    predictions: rows(tag, userId, now, list),
    categories: [def(userId, now, 'personal', 'Recovery')],
  };
}

function returning(tag: string, userId: string, now: Date): ProfileData {
  const rnd = seeded(11);
  const ideas: Array<[string, Category]> = [
    ['I finish the chem problem set before midnight', 'work'],
    ['I go to the gym', 'health'],
    ['Ana replies to my message today', 'social'],
    ['I wake up before 9', 'personal'],
    ['I spend under 20 on food delivery this week', 'finance'],
    ['I sleep 7 hours', 'health'],
  ];
  const confs = [55, 70, 80, 90, 95, 60, 75];
  const list: Row[] = [];
  let n = 0;
  for (let d = 64; d >= 22; d--) {
    if (rnd() < 0.4) continue;
    const burst = 1 + Math.floor(rnd() * 3);
    for (let b = 0; b < burst; b++) {
      const [title, category] = ideas[n % ideas.length];
      const lead = 1 + (n % 4);
      const due = d - lead;
      // Due after he left: still open, now overdue.
      const open = due < 22;
      list.push({
        title,
        category,
        confidence: confs[n % confs.length],
        made: d,
        due,
        status: open ? 'pending' : rnd() < 0.6 ? 'resolved_yes' : 'resolved_no',
      });
      n += 1;
    }
  }
  return { predictions: rows(tag, userId, now, list), categories: [] };
}

function threshold(tag: string, userId: string, now: Date): ProfileData {
  const list: Row[] = [];
  // 19 scored in health: 14 at 60–80%, 5 at 80–100%; two thin ranges below.
  const plan: Array<[number, boolean]> = [
    ...Array.from({ length: 11 }, (_, i): [number, boolean] => [70, i < 8]),
    ...Array.from({ length: 5 }, (_, i): [number, boolean] => [90, i < 3]),
    [30, false],
    [30, true],
    [50, true],
  ];
  plan.forEach(([confidence, yes], i) => {
    list.push({
      title: ['I run before work', 'I sleep before 11', 'I drink no alcohol this week'][i % 3],
      category: 'health',
      confidence,
      made: 40 - i * 2,
      due: 38 - i * 2,
      status: yes ? 'resolved_yes' : 'resolved_no',
    });
  });
  // Not scored: answered the day it was logged (D41). And one Can't tell.
  list.push({ title: 'I stretch tonight', category: 'health', confidence: 95, made: 3, due: 2, status: 'resolved_yes', sameDay: true });
  list.push({ title: 'The physio slot opens up', category: 'health', confidence: 50, made: 6, due: 4, status: 'skipped' });
  // Due today: the answer that crosses both bars.
  list.push({ title: 'I run before work', category: 'health', confidence: 70, made: 1, due: 0, status: 'pending' });
  list.push({ title: 'The quarterly numbers beat the forecast', category: 'work', confidence: 65, made: 2, due: -5, status: 'pending' });
  return { predictions: rows(tag, userId, now, list), categories: [] };
}

/** At the title limit (200), the way someone pastes a paragraph in. */
const LONG_TITLE = (
  'I will ship the quarterly report before the board meeting, keep the garden alive through ' +
  'the heatwave, finish the half-marathon training block and still be home for dinner every ' +
  'night this week without fail'
).slice(0, 200);
/** At the reflection limit (500). */
const LONG_NOTE = (
  'Notes to self, written in a hurry: ' +
  'the plan slipped because the supplier called on Tuesday and the whole afternoon went on it; '.repeat(6)
).slice(0, 500);

const STRESS_TITLES: Array<[string, number]> = [
  [LONG_TITLE, 70],
  ['سأنهي تقرير المرضى قبل نهاية المناوبة', 80],
  ['ستتصل بي ليلى قبل يوم الجمعة لتأكيد موعد العشاء مع العائلة', 60],
  ['明日の朝、七時までに散歩を終える', 75],
  ['週末までに確定申告の書類をすべて揃えて税務署に提出する', 55],
  ['ሰኞ ቀጠሮው በሰዓቱ ይጀምራል', 65],
  ['मैं इस हफ़्ते तीन बार योग करूँगा', 50],
  ['Supercalifragilisticexpialidociousnessesqueextraordinarilylongword happens', 40],
  ['https://example.com/a/very/long/link/that/someone/pasted/into/the/title/field', 30],
  ['🏃‍♀️🏃‍♀️🏃‍♀️ 💯', 90],
  ['I', 85],
  ['Wir gewinnen am Samstag gegen den FC — endlich wieder drei Punkte!', 35],
  ['The 1,000,000th visitor arrives before 23:59 on 31/12', 0],
  ['The sun rises tomorrow', 100],
];

function stress(tag: string, userId: string, now: Date): ProfileData {
  const names = [
    'Weekend football bets ⚽',
    'العمل في المستشفى ليلاً',
    '家族と週末のこと',
    'Side hustle (Etsy shop)',
    'Kids: school & sport 🏫',
    'Long-distance cycling',
    'ማህበራዊ ጉዳዮች',
    'Supercalifragilisticexpi',
  ];
  const emoji = ['⚽', '🏥', '🏯', '🧶', '🎒', '🚴', '☕', '🌀'];
  const ids = names.map((_, i) => `c-stress${i}a1b2` as Category);
  const categories: CategoryDef[] = names.map((name, i) =>
    def(userId, now, ids[i], name, {
      icon: { kind: 'emoji', emoji: emoji[i] },
      position: i + 1,
    }),
  );
  // A built-in hidden from Log, and one renamed to the limit.
  categories.push(def(userId, now, 'finance', null, { hidden: true }));
  categories.push(def(userId, now, 'social', 'Friends, family & neighbours'.slice(0, 24)));

  const all: Category[] = ['work', 'health', 'social', 'personal', 'finance', ...ids];
  const rnd = seeded(5);
  const list: Row[] = [];
  // 72 answered over ten weeks, so the rating and several categories unlock.
  for (let i = 0; i < 72; i++) {
    const [title, confidence] = STRESS_TITLES[i % STRESS_TITLES.length];
    const due = 2 + i;
    list.push({
      title,
      category: all[i % all.length],
      confidence,
      made: due + 1 + (i % 5),
      due,
      status: rnd() < confidence / 100 ? 'resolved_yes' : 'resolved_no',
      reflection: i % 4 === 0 ? LONG_NOTE : null,
    });
  }
  // 36 open: 12 overdue, 6 due today, 18 ahead.
  for (let i = 0; i < 36; i++) {
    const [title, confidence] = STRESS_TITLES[(i + 3) % STRESS_TITLES.length];
    const due = i < 12 ? 1 + (i % 6) : i < 18 ? 0 : -(1 + (i - 18) * 3);
    list.push({
      title,
      category: all[(i * 3) % all.length],
      confidence,
      made: Math.max(due + 1, 1),
      due,
      status: 'pending',
    });
  }
  return { predictions: rows(tag, userId, now, list), categories };
}

function years(tag: string, userId: string, now: Date): ProfileData {
  const rnd = seeded(7);
  const cats: Category[] = ['work', 'health', 'finance', 'social', 'personal'];
  const confs = [15, 30, 50, 65, 75, 85, 95];
  const titles = [
    'I tick off today’s walk',
    'The 7:40 tram is on time',
    'I finish the crossword before lunch',
    'My daughter calls on Sunday',
    'I stay under the weekly shopping budget',
  ];
  const list: Row[] = [];
  for (let d = 1000; d >= 1; d--) {
    const confidence = confs[d % confs.length];
    list.push({
      title: titles[d % titles.length],
      category: cats[d % cats.length],
      confidence,
      made: d + 1,
      due: d,
      status: rnd() < confidence / 100 ? 'resolved_yes' : 'resolved_no',
    });
  }
  list.push({ title: 'I tick off today’s walk', category: 'health', confidence: 85, made: 1, due: 0, status: 'pending' });
  return { predictions: rows(tag, userId, now, list), categories: [] };
}

/**
 * Every row a profile puts on the device, for this user at this moment.
 * `nonce` makes the ids unique to one load: profiles are guest only, so the
 * user id is the same on every device, and ids are global primary keys on the
 * server should the rows ever be signed in and pushed (see /dev/seed).
 */
export function buildProfile(
  id: ProfileId,
  userId: string,
  now: Date,
  nonce = 'fixed',
): ProfileData {
  const tag = `pt-${id}-${nonce}`;
  switch (id) {
    case 'day1':
      return day1(tag, userId, now);
    case 'first-week':
      return firstWeek(tag, userId, now);
    case 'habit':
      return habit(tag, userId, now);
    case 'return':
      return returning(tag, userId, now);
    case 'threshold':
      return threshold(tag, userId, now);
    case 'long-time':
      return {
        predictions: buildDemoPredictions(userId, now).map((p) => ({
          ...p,
          id: `${tag}-${p.id}`,
        })),
        categories: [],
      };
    case 'stress':
      return stress(tag, userId, now);
    case 'years':
      return years(tag, userId, now);
  }
}
