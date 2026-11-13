// Warmup store (L4). Drives the onboarding quiz: which question we're on,
// what the user has answered, and — once finished — the scored verdict.
//
// Layer notes:
//   • The scoring lives in the engine (L3, `scoreWarmup`). This store holds no
//     calibration math; it collects answers and asks the engine what they mean.
//   • Persistence goes through src/db/warmup.ts (L2), which stores raw answers
//     only. `result` is re-derived on hydrate, so it can never be stale.
//   • An unfinished quiz keeps its answers after each one (blind playtest
//     2026-11-09b: a reload at question 5 started it over), and hydrate
//     reopens it at the next question. The ten are the same for everyone.
//     The pick on the current question is kept too (blind playtest
//     2026-11-12c, finding 19: a reload lost it).
//   • Warmup data is NEVER written to UserStat / CategoryStat. This store has
//     no path to those tables at all (CLAUDE.md Warmup Module).
//
// The quiz is offline and instant: nothing here touches the network, and a
// persistence failure still leaves the user with their verdict on screen.

import { create } from 'zustand';

import { track } from '@/analytics/track';

import { PRACTICE_FACTS } from '@/constants/practiceFacts';
import {
  clearWarmupRecord,
  getWarmupProgress,
  getWarmupRecord,
  saveWarmupProgress,
  saveWarmupRecord,
} from '@/db/warmup';
import { warmupQuestions } from '@/engine/practice';
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
  /** What's chosen so far on the current question, or null with nothing. */
  pick: { option: 0 | 1 | null; confidence: number | null } | null;

  /** Load any past Warmup from SQLite and re-derive its verdict, or the answers so far. */
  hydrate: () => Promise<void>;
  /** Answer the current question and advance; scores + persists on the last one. */
  answer: (optionIndex: number, confidence: number) => Promise<void>;
  /** Keep the current question's option and number as they're chosen. */
  setPick: (option: 0 | 1 | null, confidence: number | null) => Promise<void>;
  /** Discard progress and start the quiz over (keeps any persisted record). */
  restart: () => void;
  /** Wipe the stored Warmup entirely and reset — "retake" in Settings. */
  retake: () => Promise<void>;
}

const initialProgress = {
  questions: warmupQuestions(PRACTICE_FACTS),
  index: 0,
  answers: [] as WarmupAnswer[],
  pick: null,
};

/**
 * The ten in the order a finished Warm-up's answers belong to: by the ids
 * stored with it, else the pre-step-173 order (record audit 2026-11-12).
 */
function questionsFor(ids: readonly string[] | undefined): readonly WarmupQuestion[] {
  const current = warmupQuestions(PRACTICE_FACTS);
  if (!ids) return warmupQuestions(PRACTICE_FACTS, false);
  const byId = new Map<string, WarmupQuestion>(current.map((q) => [q.id, q]));
  const ordered: WarmupQuestion[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) return current;
    ordered.push(q);
  }
  return ordered;
}

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
          // The questions in the order these answers were given (step 173):
          // by their stored ids, or, for a result saved before the ten were
          // reordered, the order asked then.
          questions: questionsFor(record.question_ids),
          answers: record.answers,
          completedAt: record.completed_at,
          result: scoreWarmup(record.answers),
          index: record.answers.length,
        });
      } else {
        const sofar = await getWarmupProgress();
        // Only answers to these same questions, in order, and not all of
        // them: kept from an older set of questions, the quiz starts over.
        const { questions } = get();
        if (
          sofar &&
          sofar.answers.length < questions.length &&
          sofar.question_ids.every((id, i) => questions[i]?.id === id)
        ) {
          const at = sofar.answers.length;
          const pick =
            sofar.pick && sofar.pick.question_id === questions[at]?.id
              ? { option: sofar.pick.option, confidence: sofar.pick.confidence }
              : null;
          set({ answers: sofar.answers, index: at, pick });
        }
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
    set({ answers: next, index: index + 1, pick: null });

    if (next.length < questions.length) {
      try {
        await saveWarmupProgress({
          question_ids: questions.slice(0, next.length).map((q) => q.id),
          answers: next,
        });
      } catch (e) {
        // A reload would start the quiz over, as it always did; not worth more.
        // eslint-disable-next-line no-console
        console.warn('[warmup] progress save failed:', e);
      }
      return;
    }

    // Last question: score it, show the verdict, then persist. Scoring first
    // means a storage failure still leaves the user with their Day-0 result.
    const completedAt = new Date().toISOString();
    const result = scoreWarmup(next);
    set({ result, completedAt });
    // Numerator of D0 aha completion (GROWTH §7). The denominator is
    // warmup_started, fired when the quiz screen mounts.
    void track('warmup_completed', {
      score: result.mini_score,
      question_count: next.length,
    });
    try {
      await saveWarmupRecord({
        completed_at: completedAt,
        answers: next,
        question_ids: questions.map((q) => q.id),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[warmup] save failed; result is session-only:', e);
    }
  },

  setPick: async (option, confidence) => {
    const { questions, index, answers } = get();
    const question = questions[index];
    if (!question) return;
    const sure = confidence === null ? null : clampConfidence(confidence);
    const pick = option === null && sure === null ? null : { option, confidence: sure };
    set({ pick });
    try {
      await saveWarmupProgress({
        question_ids: questions.slice(0, answers.length).map((q) => q.id),
        answers,
        ...(pick ? { pick: { question_id: question.id, ...pick } } : {}),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[warmup] pick save failed:', e);
    }
  },

  restart: () => {
    set({ ...initialProgress, result: null });
    void saveWarmupProgress({ question_ids: [], answers: [] }).catch(() => undefined);
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
