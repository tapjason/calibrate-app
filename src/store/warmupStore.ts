// Warmup store (L4). Drives the onboarding quiz: which question we're on,
// what the user has answered, and — once finished — the scored verdict.
//
// Layer notes:
//   • The scoring lives in the engine (L3, `scoreWarmup`). This store holds no
//     calibration math; it collects answers and asks the engine what they mean.
//   • Persistence goes through src/db/warmup.ts (L2), which stores raw answers
//     only. `result` is re-derived on hydrate, so it can never be stale.
//   • Warmup data is NEVER written to UserStat / CategoryStat. This store has
//     no path to those tables at all (CLAUDE.md Warmup Module).
//
// The quiz is offline and instant: nothing here touches the network, and a
// persistence failure still leaves the user with their verdict on screen.

import { create } from 'zustand';

import { WARMUP_QUESTIONS } from '@/constants/warmupQuestions';
import {
  clearWarmupRecord,
  getWarmupRecord,
  saveWarmupRecord,
} from '@/db/warmup';
import { scoreWarmup } from '@/engine/warmup';
import type { WarmupAnswer, WarmupQuestion, WarmupResult } from '@/types';

/** The slider floor. On a two-way question, 50% is a coin flip — you cannot
 *  honestly be less sure than that, so the scale starts there. */
export const MIN_WARMUP_CONFIDENCE = 50;
export const MAX_WARMUP_CONFIDENCE = 100;

interface WarmupState {
  questions: readonly WarmupQuestion[];
  /** Index of the question awaiting an answer. Equals questions.length when done. */
  index: number;
  answers: WarmupAnswer[];
  /** Scored verdict — set on completion, and on hydrate for a past Warmup. */
  result: WarmupResult | null;
  /** ISO timestamp of the completed Warmup, or null if never finished. */
  completedAt: string | null;
  /** True once hydrate() has run (whether or not a record existed). */
  hydrated: boolean;

  /** Load any past Warmup from SQLite and re-derive its verdict. */
  hydrate: () => Promise<void>;
  /** Answer the current question and advance; scores + persists on the last one. */
  answer: (optionIndex: number, confidence: number) => Promise<void>;
  /** Discard progress and start the quiz over (keeps any persisted record). */
  restart: () => void;
  /** Wipe the stored Warmup entirely and reset — "retake" in Settings. */
  retake: () => Promise<void>;
}

const initialProgress = {
  questions: WARMUP_QUESTIONS,
  index: 0,
  answers: [] as WarmupAnswer[],
};

/** Guard against a slider (or a future caller) handing us an out-of-range value. */
function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return MIN_WARMUP_CONFIDENCE;
  return Math.min(
    MAX_WARMUP_CONFIDENCE,
    Math.max(MIN_WARMUP_CONFIDENCE, Math.round(confidence)),
  );
}

export const useWarmupStore = create<WarmupState>((set, get) => ({
  ...initialProgress,
  result: null,
  completedAt: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const record = await getWarmupRecord();
      if (record) {
        set({
          answers: record.answers,
          completedAt: record.completed_at,
          result: scoreWarmup(record.answers),
          index: record.answers.length,
        });
      }
    } catch (e) {
      // Onboarding state is not worth blocking app start over. Treated as
      // "no Warmup taken", which at worst offers the quiz a second time.
      // eslint-disable-next-line no-console
      console.warn('[warmup] hydrate failed; treating as not taken:', e);
    } finally {
      set({ hydrated: true });
    }
  },

  answer: async (optionIndex, confidence) => {
    const { questions, index, answers } = get();
    const question = questions[index];
    if (!question) return; // already finished — ignore stray taps

    const next: WarmupAnswer[] = [
      ...answers,
      {
        confidence: clampConfidence(confidence),
        correct: optionIndex === question.correctIndex,
      },
    ];
    set({ answers: next, index: index + 1 });

    if (next.length < questions.length) return;

    // Last question: score it, show the verdict, then persist. Scoring first
    // means a storage failure still leaves the user with their Day-0 result.
    const completedAt = new Date().toISOString();
    set({ result: scoreWarmup(next), completedAt });
    try {
      await saveWarmupRecord({ completed_at: completedAt, answers: next });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[warmup] save failed; result is session-only:', e);
    }
  },

  restart: () => {
    set({ ...initialProgress, result: null });
  },

  retake: async () => {
    try {
      await clearWarmupRecord();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[warmup] clear failed:', e);
    }
    set({ ...initialProgress, result: null, completedAt: null });
  },
}));

/** Whether the user has finished the Warmup — the first-run routing gate. */
export function selectHasCompletedWarmup(state: WarmupState): boolean {
  return state.completedAt !== null;
}

/** The question awaiting an answer, or null once the quiz is done. */
export function selectCurrentQuestion(state: WarmupState): WarmupQuestion | null {
  return state.questions[state.index] ?? null;
}
