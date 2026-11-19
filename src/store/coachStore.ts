// Coach store (L4). Request state plus the cached last-good insight set
// (COACH_AGENT.md §8, §5.8).
//
// Layer note: this store calls the L5 Coach client, the same way authStore
// calls @/supabase. It holds no coaching logic of its own — the gating,
// grounding, and validation all live below it. What it owns is *when* to ask
// and *what to keep* between asks.
//
// Pull, not push (§10 open decision): insights are fetched when the user asks
// for them. Push is a retention lever but needs tighter cost and tone control
// than we have evidence for yet, and every automatic call spends money on
// someone who may not be looking.

import { create } from 'zustand';

import { fetchCoachInsights, type CoachDeps, type CoachFailure } from '@/ai/coach';
import { track } from '@/analytics/track';
import { buildCoachContext } from '@/ai/coachContext';
import type { CrisisTopic } from '@/ai/crisisFilter';
import type { CoachInsight, Prediction, UserStat } from '@/types';

export interface CoachRequest {
  userStat: UserStat | null;
  resolved: readonly Prediction[];
  isPlus: boolean;
  /** The Settings toggle. Off by default — §5.6. */
  enabled: boolean;
}

interface CoachState {
  /** Last-good insights. Survives a failed refresh, per §5.8. */
  insights: CoachInsight[];
  /** Non-null when the crisis pre-filter tripped; render support, not coaching. */
  crisisTopic: CrisisTopic | null;
  loading: boolean;
  /** ISO timestamp of the last answered request, or null if never answered. */
  lastAnsweredAt: string | null;
  /**
   * True when the last request produced no answer at all — offline, gated, or
   * erroring. Distinct from "answered with nothing to say", which is a
   * legitimate result and leaves this false.
   */
  lastRequestFailed: boolean;
  /**
   * Why the last request failed, when it has its own words (step 189):
   * 'not_entitled' when the server couldn't confirm Plus, 'nothing_scored'
   * when there was no scored answer and so no request. Null otherwise, and
   * whenever lastRequestFailed is false.
   */
  lastFailure: CoachFailure | null;

  requestInsights: (request: CoachRequest, deps?: CoachDeps) => Promise<void>;
  /** Drop everything — on sign-out, or when the user turns Coach off. */
  reset: () => void;
}

const INITIAL = {
  insights: [] as CoachInsight[],
  crisisTopic: null as CrisisTopic | null,
  loading: false,
  lastAnsweredAt: null as string | null,
  lastRequestFailed: false,
  lastFailure: null as CoachFailure | null,
};

/**
 * Which request may still write (security review, 2026-11-18). Each request
 * takes the next number when it starts; reset() (another account, Erase,
 * account deletion, Coach turned off in You) moves it on too. A request whose
 * number is no longer the latest when its answer comes back writes nothing:
 * its cards, or its support screen, were about an account or a choice that
 * no longer holds, and a newer request's answer is the one to show. Not
 * state: nothing renders it.
 */
let generation = 0;

export const useCoachStore = create<CoachState>((set) => ({
  ...INITIAL,

  requestInsights: async (request, deps) => {
    const { userStat, resolved, isPlus, enabled } = request;
    // Taken before anything else, so a request still running when this one
    // starts, gated or not, can no longer write.
    const mine = ++generation;
    const superseded = () => mine !== generation;

    // Gate before anything else. Turning Coach off must clear what is on
    // screen, not just stop future refreshes — leaving stale cards up after
    // the user opts out would make the toggle a lie.
    if (!enabled || !isPlus || !userStat) {
      set({ ...INITIAL });
      return;
    }

    set({ loading: true });
    try {
      const context = buildCoachContext(userStat, resolved);
      const result = await fetchCoachInsights(context, isPlus, {
        ...deps,
        // The crisis pre-filter screens the user's own words (§5.5). Derived
        // HERE, from the predictions the store already holds, rather than at
        // the call site: the panel previously passed no deps at all, which
        // left the filter scanning an empty array and made the whole
        // support-surface path unreachable in the shipped app. A safeguard
        // that depends on every future caller remembering to wire it is not a
        // safeguard.
        //
        // Titles as well as reflections: distress can be written into either.
        // None of this is sent — buildCoachContext has no freetext channel.
        freetext:
          deps?.freetext ?? resolved.flatMap((p) => [p.title, p.reflection]),
      });

      // The account changed, the Coach was turned off, or a newer request
      // started while this one ran: nothing of this answer is written, not
      // even `loading`, which the reset or the newer request owns now. No
      // analytics either: the event would go under whoever is signed in now.
      if (superseded()) return;

      if (!result.ok) {
        // No answer. Keep the last-good insights rather than blanking the
        // surface on a dropped connection.
        set({ loading: false, lastRequestFailed: true, lastFailure: result.failure ?? null });
        return;
      }

      if (!result.safe) {
        // Crisis path: suppress coaching entirely, including anything cached
        // from before. The support surface replaces it (§5.5).
        set({
          insights: [],
          crisisTopic: result.crisisTopic,
          loading: false,
          lastAnsweredAt: new Date().toISOString(),
          lastRequestFailed: false,
          lastFailure: null,
        });
        return;
      }

      set({
        insights: result.insights,
        crisisTopic: null,
        loading: false,
        lastAnsweredAt: new Date().toISOString(),
        lastRequestFailed: false,
        lastFailure: null,
      });
      // Plus churn is meant to be split by AI-heavy vs analytics/cosmetic use
      // (GROWTH §7). The count, not the content — no insight text is recorded.
      void track('coach_requested', { insight_count: result.insights.length });
    } catch (e) {
      // fetchCoachInsights already swallows its own errors; this is belt and
      // braces so a store action can never reject into a component.
      // eslint-disable-next-line no-console
      console.warn('[coach] request failed:', e instanceof Error ? e.message : 'unknown error');
      if (superseded()) return;
      set({ loading: false, lastRequestFailed: true, lastFailure: null });
    }
  },

  reset: () => {
    // First, so a request still running can't write after the wipe.
    generation += 1;
    set({ ...INITIAL });
  },
}));
