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

import { fetchCoachInsights, type CoachDeps } from '@/ai/coach';
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
};

export const useCoachStore = create<CoachState>((set) => ({
  ...INITIAL,

  requestInsights: async (request, deps) => {
    const { userStat, resolved, isPlus, enabled } = request;

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

      if (!result.ok) {
        // No answer. Keep the last-good insights rather than blanking the
        // surface on a dropped connection.
        set({ loading: false, lastRequestFailed: true });
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
        });
        return;
      }

      set({
        insights: result.insights,
        crisisTopic: null,
        loading: false,
        lastAnsweredAt: new Date().toISOString(),
        lastRequestFailed: false,
      });
    } catch (e) {
      // fetchCoachInsights already swallows its own errors; this is belt and
      // braces so a store action can never reject into a component.
      // eslint-disable-next-line no-console
      console.warn('[coach] request failed:', e);
      set({ loading: false, lastRequestFailed: true });
    }
  },

  reset: () => set({ ...INITIAL }),
}));

/** Whether there is anything for the Coach surface to render. */
export function selectHasCoachContent(state: CoachState): boolean {
  return state.insights.length > 0 || state.crisisTopic !== null;
}
