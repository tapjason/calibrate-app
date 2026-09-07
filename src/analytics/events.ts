// The event catalogue (L5). A closed list, on purpose.
//
// GROWTH_AND_MONETIZATION.md §7 names four things worth measuring, and §8 says
// the freemium premise is a hypothesis that share rate decides. Until now
// nothing in the app could answer either — the validation checkpoint in
// BUILD_PLAN.md was unanswerable, not merely unanswered.
//
// The design rule is that this file is a *whitelist*, not a convenience. Every
// event and every property is declared here, so "what does this app send about
// me?" has a complete answer that fits on a screen. Adding an event means
// adding it here, which is the moment to ask whether it earns its place.
//
// What is never sent, and cannot be by construction:
//   - prediction titles, reflections, or any other freetext
//   - category names attached to a specific prediction's content
//   - anything identifying beyond the user_id the row is scoped to
// Properties are numbers, booleans, and values from declared enums. There is
// no string property type. A typo'd event name won't compile.

/** Every event the app may record. */
export const EVENT_NAMES = [
  // --- D0 aha (§7, metric 1) -----------------------------------------------
  /** The Warmup quiz was started. Denominator for aha completion. */
  'warmup_started',
  /** The Warmup was finished and the verdict rendered. Numerator. */
  'warmup_completed',

  // --- Share rate (§7, metric 2 — the number that justifies the free tier) --
  /** A share surface was opened (card, weekly, or yearly). */
  'share_opened',
  /** A card actually reached the OS share sheet. */
  'share_completed',

  // --- Core loop, the denominator for "per active user" --------------------
  'prediction_logged',
  'prediction_resolved',

  // --- Conversion (§7, metric 3) -------------------------------------------
  /** The paywall was shown, with where it was opened from. */
  'paywall_viewed',
  /** A purchase completed. `plan` says which. */
  'purchase_completed',
  /** A purchase was started and did not complete. */
  'purchase_abandoned',

  // --- Plus usage mix (§7, metric 4: AI-heavy vs analytics/cosmetic) --------
  'coach_requested',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Where a paywall view came from. Enum, so no free-form strings leak in. */
export const PAYWALL_SOURCES = ['stats_coach', 'settings', 'deep_link'] as const;
export type PaywallSource = (typeof PAYWALL_SOURCES)[number];

/** Which share surface produced the event. */
export const SHARE_SURFACES = ['card', 'weekly', 'yearly'] as const;
export type ShareSurface = (typeof SHARE_SURFACES)[number];

/**
 * Property values. Numbers, booleans, and the declared enums — deliberately no
 * open string type, so no freetext can reach this pipe by accident.
 */
export type EventPropValue = number | boolean | PaywallSource | ShareSurface;

/** The properties each event may carry. Anything else is dropped. */
export const EVENT_PROPS = {
  warmup_started: [],
  warmup_completed: ['score', 'question_count'],
  share_opened: ['surface'],
  share_completed: ['surface'],
  // `confidence` is the slider value, not the prediction. It is the one number
  // that tells us whether the integrity-bonus nudge is working.
  prediction_logged: ['confidence', 'integrity_bonus'],
  prediction_resolved: ['confidence', 'correct'],
  paywall_viewed: ['source'],
  purchase_completed: ['plan_annual', 'plan_monthly', 'plan_lifetime', 'trial'],
  purchase_abandoned: [],
  coach_requested: ['insight_count'],
} as const satisfies Record<EventName, readonly string[]>;

export type EventProps = Partial<Record<string, EventPropValue>>;

const ALLOWED_ENUM_VALUES: ReadonlySet<string> = new Set<string>([
  ...PAYWALL_SOURCES,
  ...SHARE_SURFACES,
]);

/**
 * Strip a property bag down to what the event declares, dropping anything
 * unexpected.
 *
 * Defensive rather than trusting: this is the last point before data leaves
 * the device, and the cost of a mistake here is a prediction title in an
 * analytics table. Non-finite numbers go too — they don't survive JSON
 * round-tripping intact anyway.
 */
export function sanitizeProps(name: EventName, props: EventProps | undefined): EventProps {
  if (!props) return {};
  const allowed = EVENT_PROPS[name] as readonly string[];
  const out: EventProps = {};
  for (const key of allowed) {
    const value = props[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && ALLOWED_ENUM_VALUES.has(value)) {
      out[key] = value as EventPropValue;
    }
  }
  return out;
}

/** Whether a name is one this app is allowed to record. */
export function isKnownEvent(name: string): name is EventName {
  return (EVENT_NAMES as readonly string[]).includes(name);
}
