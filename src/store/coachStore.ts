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
//
// "Back to Coach" never sets aside words whose card the person hasn't seen
// (review, 2026-11-19). The card stays in memory while words come and go
// under it (a note saved or pulled, a note removed, a delete), so the tap
// scans the list again first (`backToCoach`): nothing trips any more, and the
// card simply goes; something trips whose topic's card hasn't been shown
// since this card came up, and that card replaces it, nothing set aside;
// only when every topic that trips has been shown is anything set aside.
// Every topic, one prediction's included (re-review round two, 2026-11-19):
// one note can match two ("he hits me when he drinks and I can't go on"),
// and each of its topics' cards is shown before that note is set aside.
// And no key outlives its words: each request and each tap keeps only the
// keys that still match the loaded list (`retainSupportAsideKeys`).

import { create } from 'zustand';

import { fetchCoachInsights, type CoachDeps, type CoachFailure } from '@/ai/coach';
import { track } from '@/analytics/track';
import { buildCoachContext } from '@/ai/coachContext';
import { crisisTopicsIn, scanForCrisis, type CrisisTopic } from '@/ai/crisisFilter';
import { supportAsideKey, supportAsideKeysStandingWith } from '@/engine/supportAside';
import type { CoachInsight, Prediction, UserStat } from '@/types';

import { useSettingsStore } from './settingsStore';

export interface CoachRequest {
  userStat: UserStat | null;
  resolved: readonly Prediction[];
  isPlus: boolean;
  /** The Settings toggle. Off by default — §5.6. */
  enabled: boolean;
}

/**
 * What "Back to Coach" did (`backToCoach`), for the screen: 'aside' and
 * 'cleared' leave the Coach's ask button; 'updated' leaves a support card up,
 * for another topic; 'failed' leaves the card as it was.
 */
export type SupportAsideOutcome = 'aside' | 'cleared' | 'updated' | 'failed';

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
   * "Back to Coach" on the support card (main session decision 2026-11-19;
   * review, 2026-11-19). `resolved` is the list as it is at the tap (the
   * panel's live list). The keys that no longer match it are dropped first
   * (as `requestInsights` does). Then the request's own scan runs again over
   * it, set-asides already stored left out:
   *
   *   'cleared'  nothing trips any more (the words were removed, or
   *              deleted): the card goes, back to the first idle state where
   *              the ask button shows, and nothing is set aside.
   *   'updated'  something trips whose topic's card hasn't been shown since
   *              this card came up (new words of a higher-ranked topic, or of
   *              any topic not yet shown, a second topic of the very words
   *              on screen included): that card replaces the one shown, the
   *              highest-ranked unshown topic first, and nothing is set
   *              aside, so the person sees it before they can set it aside.
   *   'aside'    every topic that trips has been shown, every topic of every
   *              prediction that trips (`crisisTopicsIn`), a second topic in
   *              one note as much as one in another prediction: every
   *              prediction in `resolved` whose title or note trips the filter
   *              on its own is remembered by its key (its id and a hash of
   *              those words, `supportAsideKey`), on this phone only, and left
   *              out of the scan from then on; back to the first idle state.
   *   'failed'   the scan or the set-aside couldn't be made: the card stays
   *              as it was, and nothing is stored.
   *
   * A topic counts as shown per topic, never per set of words: once a
   * topic's card has been on screen since this card came up, any words of
   * that topic are set aside with the rest, words that arrived after it was
   * shown included (a second note of the same topic, or more words of it in
   * a note already there). Only a topic not yet shown holds the set-aside
   * back.
   *
   * On every outcome but 'failed', a request still running writes nothing.
   * The card comes back for new matching words: another prediction, or a
   * changed title or note. Never throws. No analytics and no log line: the
   * words are the person's.
   */
  backToCoach: (resolved: readonly Prediction[]) => Promise<SupportAsideOutcome>;
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
 * The support-card topics shown since the card on screen came up (review,
 * 2026-11-19), and the topic the store itself last put on it. A topic is
 * shown once its card has been on screen: "Back to Coach" sets aside only
 * words of topics in here (`backToCoach`). Started afresh whenever a request
 * puts a card up, added to when a tap replaces it, and dropped whenever the
 * card goes. Read only while `crisisTopic` is still the topic it names, so a
 * card put up any other way counts only itself. Not state: nothing renders it.
 */
let shown: { topics: Set<CrisisTopic>; current: CrisisTopic } | null = null;

/** The card on screen goes (or none was up): nothing has been shown since. */
function forgetShown(): void {
  shown = null;
}

/** A request has put up a card for `topic`: the only one shown so far. */
function markShown(topic: CrisisTopic): void {
  shown = { topics: new Set<CrisisTopic>([topic]), current: topic };
}

/** The topics shown since the card on screen came up, the one on screen included. */
function topicsShown(onScreen: CrisisTopic | null): Set<CrisisTopic> {
  const topics = new Set<CrisisTopic>(shown && shown.current === onScreen ? shown.topics : []);
  if (onScreen) topics.add(onScreen);
  return topics;
}

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
 * The predictions the crisis pre-filter screens: every answered one, but
 * those set aside with these very words.
 */
function toScreen(resolved: readonly Prediction[]): readonly Prediction[] {
  const aside = setAsideKeys();
  return aside.size === 0 ? resolved : resolved.filter((p) => !aside.has(supportAsideKey(p)));
}

/**
 * The words the crisis pre-filter screens: the title and note of every
 * answered prediction, but those set aside with these very words. None of
 * it is sent: buildCoachContext has no freetext channel.
 */
function freetextToScreen(resolved: readonly Prediction[]): Array<string | null> {
  return toScreen(resolved).flatMap((p) => [p.title, p.reflection]);
}

/**
 * Every topic one prediction's own title and note trip, in the filter's rank
 * order (`crisisTopicsIn`); empty when they trip none.
 */
function topicsOf(p: Prediction): CrisisTopic[] {
  return crisisTopicsIn([p.title, p.reflection]);
}

/**
 * Keep only the set-asides that still match a prediction in `resolved`, words
 * and all (2026-11-19): a key whose prediction is gone, or whose title or note
 * changed, goes. Not with an empty list, which can't be told apart from one
 * not loaded yet: the keys are left as they are (they silence nothing an
 * empty list could hold; a delete drops its own, and a load of the list that
 * worked, an empty one included, drops every key not in it, predictionStore).
 * Either way the safe direction holds: dropping a key can only bring the card
 * back.
 * The settings store applies it in memory at once; its write isn't waited
 * for. Never throws.
 */
function keepStandingSetAsides(resolved: readonly Prediction[]): void {
  if (resolved.length === 0) return;
  try {
    void useSettingsStore.getState().retainSupportAsideKeys(supportAsideKeysStandingWith(resolved));
  } catch {
    // The settings store swallows its own failures; the keys stay as they were.
  }
}

export const useCoachStore = create<CoachState>((set, get) => ({
  ...INITIAL,

  requestInsights: async (request, deps) => {
    const { userStat, resolved, isPlus, enabled } = request;
    // Taken before anything else, so a request still running when this one
    // starts, gated or not, can no longer write.
    const mine = ++generation;
    const superseded = () => mine !== generation;

    // Set-asides whose words are no longer in the list go (2026-11-19). It
    // can only bring a card back, so it doesn't wait for the gate.
    keepStandingSetAsides(resolved);

    // Gate before anything else. Turning Coach off must clear what is on
    // screen, not just stop future refreshes — leaving stale cards up after
    // the user opts out would make the toggle a lie.
    if (!enabled || !isPlus || !userStat) {
      forgetShown();
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
        // still, is left out (backToCoach); words passed in are screened
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
        // from before. The support surface replaces it (§5.5), and only its
        // topic has been shown so far.
        if (result.crisisTopic) markShown(result.crisisTopic);
        else forgetShown();
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

      forgetShown();
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

  backToCoach: async (resolved) => {
    // Keys whose words are gone first, as a request does: it can only bring a
    // card back.
    keepStandingSetAsides(resolved);

    // The request's own scan, over the list as it is at the tap, set-asides
    // already stored left out; then what trips, one entry for each topic of
    // each prediction that trips on its own (as the scan reads each text on
    // its own), so a note that matches two topics is two entries.
    let anyTrips: boolean;
    let tripping: Array<{ prediction: Prediction; topic: CrisisTopic }>;
    try {
      const screened = toScreen(resolved);
      anyTrips = !scanForCrisis(screened.flatMap((p) => [p.title, p.reflection])).safe;
      tripping = [];
      for (const prediction of screened) {
        for (const topic of topicsOf(prediction)) tripping.push({ prediction, topic });
      }
    } catch {
      return 'failed';
    }

    if (!anyTrips) {
      // The words that put the card up are gone (a note removed, a delete):
      // nothing to set aside, and nothing to keep the card up for. A request
      // still running can't write it back.
      generation += 1;
      forgetShown();
      set({ ...INITIAL });
      return 'cleared';
    }
    // Every text that trips belongs to a prediction that trips on its own:
    // with none, something is wrong with the scan, and the card stays.
    if (tripping.length === 0) return 'failed';

    // Words of a topic whose card hasn't been on screen since this one came
    // up, a second topic of the words on screen included: that card first,
    // the highest-ranked unshown topic by the filter's own order, and nothing
    // set aside.
    const seen = topicsShown(get().crisisTopic);
    const unseen = tripping.filter((t) => !seen.has(t.topic));
    if (unseen.length > 0) {
      let topic: CrisisTopic | null;
      try {
        // In rank order over the words those entries come from; the topics
        // already shown that the same words also trip are passed over.
        topic =
          crisisTopicsIn(unseen.flatMap((t) => [t.prediction.title, t.prediction.reflection])).find(
            (candidate) => !seen.has(candidate),
          ) ?? null;
      } catch {
        return 'failed';
      }
      if (!topic) return 'failed';
      generation += 1;
      seen.add(topic);
      shown = { topics: seen, current: topic };
      // What a request finding these words would write (the crisis path).
      set({
        insights: [],
        crisisTopic: topic,
        loading: false,
        lastAnsweredAt: new Date().toISOString(),
        lastRequestFailed: false,
        lastFailure: null,
        lastDroppedAll: false,
      });
      return 'updated';
    }

    // Every topic of every prediction that trips has been shown: every
    // prediction in the list that trips on its own is set aside, those
    // already set aside included (moved to the newest end), as before.
    let keys: string[];
    let saving: Promise<void>;
    try {
      keys = resolved.filter((p) => topicsOf(p).length > 0).map((p) => supportAsideKey(p));
      if (keys.length === 0) return 'failed';
      // Into memory at once (the store's write is applied before its first
      // await), so a request made from here on leaves them out.
      saving = useSettingsStore.getState().addSupportAsideKeys(keys);
    } catch {
      return 'failed';
    }
    // Not in memory: the set-aside wasn't made, and the card stays.
    if (!setAsideKeys().has(keys[keys.length - 1]!)) {
      void saving.catch(() => {});
      return 'failed';
    }
    // A request still running can't write the card back; the panel shows its
    // ask button again, not "nothing worth flagging".
    generation += 1;
    forgetShown();
    set({ ...INITIAL });
    try {
      await saving;
    } catch {
      // The settings store swallows its own failures; kept for this run.
    }
    return 'aside';
  },

  reset: () => {
    // First, so a request still running can't write after the wipe.
    generation += 1;
    forgetShown();
    set({ ...INITIAL });
  },
}));
