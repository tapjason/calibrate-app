// When to ask for an App Store rating (roadmap D15, decided 2026-10-07).
//
// Two moments earn an ask: a run of answers that ends on "All caught up", and
// the answer that unlocks the score. Either one only *notes* the moment; the
// ask itself waits until Today has focus again, after the sheet has closed,
// because HIG says not to interrupt a task. The rules (7 days, 10 answers,
// 90 days between asks) live in src/review/ratingPrompt.ts.

import { create } from 'zustand';

import { ratingContextFor, requestRating, shouldAskForRating } from '@/review/ratingPrompt';

import { usePredictionStore } from './predictionStore';
import { useSettingsStore } from './settingsStore';

interface RatingState {
  /** A moment worth an ask has happened and not yet been considered. */
  moment: boolean;
  /** Note a moment: a finished run, or the score's unlock. */
  noteMoment: () => void;
  /**
   * On Today's focus: if a moment is waiting and the rules allow, request the
   * system prompt and start the cooldown. The moment is spent either way, so
   * a no doesn't come back on the next focus. Never throws.
   */
  askIfDue: (now?: Date) => Promise<boolean>;
}

export const useRatingStore = create<RatingState>((set, get) => ({
  moment: false,

  noteMoment: () => set({ moment: true }),

  askIfDue: async (now = new Date()) => {
    if (!get().moment) return false;
    set({ moment: false });
    const { pending, resolved } = usePredictionStore.getState();
    const settings = useSettingsStore.getState();
    const context = ratingContextFor([...pending, ...resolved], now, settings.ratingAskedAt);
    if (!shouldAskForRating(context)) return false;
    const asked = await requestRating();
    if (asked) await settings.markRatingAsked();
    return asked;
  },
}));
