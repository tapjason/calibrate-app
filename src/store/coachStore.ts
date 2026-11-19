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
//
// The support card can be set aside (main session decision 2026-11-19): an
// answered prediction can't be deleted after its 24 hours, so one false
// positive of the crisis pre-filter would replace the Coach for good. The
// person's set-asides are kept on this phone by the settings store, one key
// per prediction (src/engine/supportAside.ts), and the scan leaves those out
// until their words change.

import { create } from 'zustand';

import { fetchCoachInsights, type CoachDeps, type CoachFailure } from '@/ai/coach';
import { track } from '@/analytics/track';
import { buildCoachContext } from '@/ai/coachContext';
import { scanForCrisis, type CrisisTopic } from '@/ai/crisisFilter';
import { supportAsideKey } from '@/engine/supportAside';
import type { CoachInsight, Prediction, UserStat } from '@/types';

import { useSettingsStore } from './settingsStore';

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
  /**
   * True when the last answer had insights and lost every one to validation
   * (CoachResult.droppedAll, item 12, 2026-11-19), so the panel can say
   * nothing could be backed by the numbers rather than "nothing worth
   * flagging". False on an answer with none, on the crisis path and after a
   * reset; a failed request leaves it as it was, like the cached insights.
   */
  lastDroppedAll: boolean;

  requestInsights: (request: CoachRequest, deps?: CoachDeps) => Promise<void>;
  /**
   * The person sets the support card aside (main session decision
   * 2026-11-19). Every prediction in `resolved` (the list the request
   * scanned) whose title or note trips the crisis pre-filter on its own is
   * remembered by its key (`supportAsideKey`: its id and a hash of those
   * words), on this phone only, and left out of the scan from then on; the
   * store goes back to its first idle state, so the panel shows its ask
   * button, and a request still running writes nothing. The card comes back
   * for new matching words: another prediction, or a changed title or note.
   * When nothing in `resolved` trips, nothing changes and the card stays.
   * True when something was set aside. Never throws. No analytics and no log
   * line: the words are the person's.
   */
  setSupportAside: (resolved: readonly Prediction[]) => Promise<boolean>;
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
  lastDroppedAll: false,
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

/**
 * The keys of the predictions whose support card was set aside, as the
 * settings store holds them. Not yet read, or a record that couldn't be
 * read, is none: the card shows, the safe way to be wrong. Never throws.
 */
function setAsideKeys(): ReadonlySet<string> {
  try {
    const keys = useSettingsStore.getState().supportAsideKeys;
    return new Set(Array.isArray(keys) ? keys : []);
  } catch {
    return new Set();
  }
}

/**
 * The words the crisis pre-filter screens: the title and note of every
 * answered prediction, but those set aside with these very words. None of
 * it is sent: buildCoachContext has no freetext channel.
 */
function freetextToScreen(resolved: readonly Prediction[]): Array<string | null> {
  const aside = setAsideKeys();
  const screened = aside.size === 0 ? resolved : resolved.filter((p) => !aside.has(supportAsideKey(p)));
  return screened.flatMap((p) => [p.title, p.reflection]);
}

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
        // A prediction whose card the person set aside, with the same words
        // still, is left out (setSupportAside); words passed in are screened
        // whole.
        freetext: deps?.freetext ?? freetextToScreen(resolved),
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
          lastDroppedAll: false,
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
        lastDroppedAll: result.droppedAll === true,
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

  setSupportAside: async (resolved) => {
    let keys: string[];
    try {
      // Each prediction on its own, as the request's scan reads each text on
      // its own: exactly the ones that put the card up.
      keys = resolved
        .filter((p) => !scanForCrisis([p.title, p.reflection]).safe)
        .map((p) => supportAsideKey(p));
    } catch {
      return false;
    }
    // The card came from somewhere else (words passed in): it stays.
    if (keys.length === 0) return false;
    // Into memory at once (the store's write is applied before its first
    // await), so a request made from here on leaves them out.
    const saving = useSettingsStore.getState().addSupportAsideKeys(keys);
    // A request still running can't write the card back; the panel shows its
    // ask button again, not "nothing worth flagging".
    generation += 1;
    set({ ...INITIAL });
    try {
      await saving;
    } catch {
      // The settings store swallows its own failures; kept for this run.
    }
    return true;
  },

  reset: () => {
    // First, so a request still running can't write after the wipe.
    generation += 1;
    set({ ...INITIAL });
  },
}));
