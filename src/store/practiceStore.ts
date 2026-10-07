// Daily practice store (L4, roadmap step 88). Today's three questions, every
// answer so far, and what they come to.
//
// Layer notes:
//   • Which questions a day asks, and what the answers add up to, are the
//     engine's (src/engine/practice.ts). This store holds no math: it asks.
//   • Persistence goes through src/db/practice.ts, which keeps raw answers
//     with the question asked. Nothing here has a path to UserStat,
//     CategoryStat or the streak: practice is practice (CLAUDE.md, Daily
//     practice), like the Warmup.
//   • Screens get the local day from here (`today()`), so they never import
//     the engine's clock helpers themselves.
//
// Offline and instant, like the Warmup: a failed write still leaves the
// answer on screen for this session.

import { create } from 'zustand';

import { track } from '@/analytics/track';

import { PRACTICE_FACTS } from '@/constants/practiceFacts';
import { clearPracticeAnswers, listPracticeAnswers, savePracticeAnswer } from '@/db/practice';
import { localDayNumber } from '@/engine/localTime';
import { practiceDayTally, practiceQuestions, scorePractice } from '@/engine/practice';
import {
  PRACTICE_PER_DAY,
  type PracticeAnswer,
  type PracticeDayTally,
  type PracticeFacts,
  type PracticeQuestion,
  type PracticeRecord,
} from '@/types';

/** Two options: 50% is a coin flip, so the scale starts there, as in the Warmup. */
export const MIN_PRACTICE_CONFIDENCE = 50;
export const MAX_PRACTICE_CONFIDENCE = 100;

interface PracticeState {
  /** The reference tables questions come from. Swappable in tests. */
  facts: PracticeFacts;
  /** Every answer on this device, oldest day first. */
  answers: PracticeAnswer[];
  /** True once hydrate() has run (whether or not anything was stored). */
  hydrated: boolean;

  /** The local day number for `now`, the key every other call takes. */
  today: (now?: Date) => number;
  /** The day's questions, the same on every device. */
  questionsFor: (day: number) => PracticeQuestion[];
  /** The day's answers, by slot. */
  answersFor: (day: number) => PracticeAnswer[];
  /** The first unanswered slot on the day, or null once all are answered. */
  nextSlot: (day: number) => number | null;
  /** The day in counts. */
  dayTally: (day: number) => PracticeDayTally;
  /** Everything practised so far. */
  record: () => PracticeRecord;

  /** Load stored answers. Safe to call once at startup. */
  hydrate: () => Promise<void>;
  /** Answer one of the day's questions; answering a slot again replaces it. */
  answer: (day: number, slot: number, picked: 0 | 1, confidence: number) => Promise<void>;
  /** Forget every practice answer (erasing the device). */
  clear: () => Promise<void>;
}

function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return MIN_PRACTICE_CONFIDENCE;
  return Math.min(MAX_PRACTICE_CONFIDENCE, Math.max(MIN_PRACTICE_CONFIDENCE, Math.round(confidence)));
}

const byDayAndSlot = (a: PracticeAnswer, b: PracticeAnswer) => a.day - b.day || a.slot - b.slot;

export const usePracticeStore = create<PracticeState>((set, get) => ({
  facts: PRACTICE_FACTS,
  answers: [],
  hydrated: false,

  today: (now = new Date()) => localDayNumber(now),
  questionsFor: (day) => practiceQuestions(get().facts, day, PRACTICE_PER_DAY),
  answersFor: (day) => get().answers.filter((a) => a.day === day),
  nextSlot: (day) => {
    const answered = new Set(get().answersFor(day).map((a) => a.slot));
    const count = get().questionsFor(day).length;
    for (let slot = 0; slot < count; slot += 1) if (!answered.has(slot)) return slot;
    return null;
  },
  dayTally: (day) => practiceDayTally(get().answersFor(day)),
  record: () => scorePractice(get().answers),

  hydrate: async () => {
    try {
      set({ answers: await listPracticeAnswers() });
    } catch (e) {
      // Practice is never worth blocking app start over: an unreadable table
      // reads as nothing practised yet.
      // eslint-disable-next-line no-console
      console.warn('[practice] hydrate failed; starting empty:', e);
    } finally {
      set({ hydrated: true });
    }
  },

  answer: async (day, slot, picked, confidence) => {
    const question = get().questionsFor(day)[slot];
    if (!question) return;
    const answer: PracticeAnswer = {
      day,
      slot,
      question,
      picked,
      correct: picked === question.correctIndex,
      confidence: clampConfidence(confidence),
      answered_at: new Date().toISOString(),
    };
    const rest = get().answers.filter((a) => a.day !== day || a.slot !== slot);
    set({ answers: [...rest, answer].sort(byDayAndSlot) });

    if (get().nextSlot(day) === null) {
      const tally = get().dayTally(day);
      void track('practice_completed', { correct: tally.correct, question_count: tally.answered });
    }

    try {
      await savePracticeAnswer(answer);
    } catch (e) {
      // The answer stays on screen for this session; it just won't survive a
      // restart. Practice data is never worth an error in the user's face.
      // eslint-disable-next-line no-console
      console.warn('[practice] save failed:', e);
    }
  },

  clear: async () => {
    await clearPracticeAnswers();
    set({ answers: [] });
  },
}));
