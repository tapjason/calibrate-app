// Paywall copy, kept out of the component so it can be unit-tested and read
// as one piece. Every claim here has to be true of the shipped app — this is
// the screen where an over-promise turns into a refund.

import type { PlanId, PlusPlan, TrialUnit } from '@/billing/revenuecat';

/** Plan names, as the user sees them. */
export const PLAN_LABELS: Record<PlanId, string> = {
  annual: 'Annual',
  monthly: 'Monthly',
  lifetime: 'Lifetime',
};

/**
 * The one-line pitch per plan. Annual carries the anchor
 * (GROWTH_AND_MONETIZATION.md §4) and is the only plan we recommend.
 */
export const PLAN_TAGLINES: Record<PlanId, string> = {
  annual: 'Best value',
  monthly: 'Cancel any time',
  lifetime: 'Pay once, keep it',
};

/**
 * What Plus actually buys, one line per benefit row on the paywall
 * (DESIGN_SYSTEM §7.6). Deliberately short, and deliberately led by the
 * Coach — §5.3 makes the insight tier the conversion hook.
 *
 * All three exist as of 2026-09-07 — Coach (`src/ai/coach.ts`), Trends
 * (`src/engine/trends.ts` + the CSV export), and the card themes
 * (`src/constants/cardThemes.ts`). Keep it that way: a bullet here that the
 * app doesn't do is a refund request with extra steps.
 */
export const PLUS_FEATURES: readonly string[] = [
  'Coach: an AI read of what your calibration numbers mean',
  'Trends: month by month, by category, what your 80% really means, and a CSV export',
  'Extra themes for your cards; the cards themselves stay free',
];

/**
 * What stays free, stated on the paywall itself. This is not modesty: the
 * whole model rests on the free tier being genuinely complete
 * (CLAUDE.md — "the free tier is the marketing budget"), and a user who
 * suspects the core loop is about to be capped is a user who doesn't log
 * tomorrow.
 */
export const FREE_FOREVER_NOTE =
  'Logging, resolving, your score, the curve, badges, streaks, full history, ' +
  'and every share card stay free forever. Plus adds interpretation, not access.';

const TRIAL_UNIT_NOUN: Record<TrialUnit, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

/**
 * The trial length as the user should read it — "1 month", not "30 days".
 *
 * Says it in the store's own unit because that is what the store actually
 * grants: a one-month trial started on 31 January ends on 28 February, and
 * promising "30 days" on a billing screen is a claim we'd be breaking by two
 * days. Falls back to the day count when a store reports no structured
 * period.
 */
export function trialLabel(plan: PlusPlan): string | null {
  const period = plan.trialPeriod;
  if (period && period.count > 0) {
    const noun = TRIAL_UNIT_NOUN[period.unit];
    return `${period.count} ${noun}${period.count === 1 ? '' : 's'}`;
  }
  if (!plan.trialDays || plan.trialDays <= 0) return null;
  return `${plan.trialDays} ${plan.trialDays === 1 ? 'day' : 'days'}`;
}

/** Trial line for a plan, or null when it has no free trial. */
export function trialLine(plan: PlusPlan): string | null {
  const label = trialLabel(plan);
  if (!label) return null;
  return `${label} free, then ${plan.priceString}`;
}

/** The price row for a plan: trial if there is one, otherwise the raw price. */
export function priceLine(plan: PlusPlan): string {
  return trialLine(plan) ?? plan.priceString;
}

/**
 * Renewal terms. Required by App Review, and honest besides.
 *
 * Empty string for an empty offering: with no plans loaded there are no terms
 * to state, and the lifetime-only branch would otherwise assert "no
 * subscription" on the very screen that just said Plus is unavailable.
 */
export function termsLine(plans: readonly PlusPlan[]): string {
  if (plans.length === 0) return '';
  const hasSubscription = plans.some((p) => p.plan !== 'lifetime');
  if (!hasSubscription) return 'One-time purchase. No subscription, no renewal.';
  return (
    'Subscriptions renew automatically until cancelled. Manage or cancel any ' +
    'time in your App Store account settings.'
  );
}

/**
 * What a free trial actually costs you if you forget — stated plainly.
 *
 * Empty when no plan on offer has a trial. The 24-hour clause is not
 * hedging: Apple stops a trial converting only if it is cancelled at least a
 * day before it ends, so "cancel any time before it ends" is a promise the
 * platform doesn't keep. Saying so here costs a little conversion and saves
 * the refund request and the one-star review that follow a surprise charge.
 */
export function trialTermsLine(plans: readonly PlusPlan[]): string {
  const hasTrial = plans.some((p) => trialLabel(p) !== null);
  if (!hasTrial) return '';
  return (
    'Your free trial turns into a paid subscription when it ends. Cancel at ' +
    'least 24 hours before then in your App Store account settings and you ' +
    "won't be charged."
  );
}

/** The message shown after an action, or null when there is nothing to say. */
export function noticeText(
  notice: 'purchased' | 'restored' | 'nothing_to_restore' | 'unavailable' | 'failed' | null,
): string | null {
  switch (notice) {
    case 'purchased':
      return "You're on Plus. Coach is in Settings when you want it.";
    case 'restored':
      return 'Your purchase is restored.';
    case 'nothing_to_restore':
      return 'No previous purchase found on this account.';
    case 'unavailable':
      return "Plus isn't available on this build yet.";
    case 'failed':
      return "That didn't go through. Nothing was charged.";
    default:
      return null;
  }
}

/** Annual first — it carries the anchor and the trial (GROWTH §4). */
const PLAN_ORDER: Record<PlanId, number> = { annual: 0, monthly: 1, lifetime: 2 };

export function sortPlans(plans: readonly PlusPlan[]): PlusPlan[] {
  return [...plans].sort((a, b) => PLAN_ORDER[a.plan] - PLAN_ORDER[b.plan]);
}

/** The plan preselected on open: annual when offered, else the first. */
export function defaultPlan(plans: readonly PlusPlan[]): PlusPlan | null {
  return sortPlans(plans)[0] ?? null;
}

const PERIOD: Record<PlanId, string> = {
  annual: 'a year',
  monthly: 'a month',
  lifetime: 'once',
};

/**
 * The single purchase button's label, for whichever plan is selected
 * (DESIGN_SYSTEM §7.6). It says exactly what the tap does: a trial starts a
 * trial, a subscription names its price and period, lifetime is one payment.
 */
export function ctaLabel(plan: PlusPlan): string {
  const trial = trialLabel(plan);
  if (trial) return `Start ${trial} free`;
  if (plan.plan === 'lifetime') return `Buy once for ${plan.priceString}`;
  return `Subscribe for ${plan.priceString} ${PERIOD[plan.plan]}`;
}

export interface TimelineStep {
  when: string;
  what: string;
}

/**
 * The honest trial timeline (DESIGN_SYSTEM §7.6), or null when the selected
 * plan has no trial. Two steps, not three: there is no reminder notification
 * before the trial ends, so the screen doesn't promise one.
 */
export function trialTimeline(plan: PlusPlan): TimelineStep[] | null {
  const trial = trialLabel(plan);
  if (!trial) return null;
  return [
    { when: 'Today', what: 'Full Plus: Coach, Trends and every card theme.' },
    {
      when: `In ${trial}`,
      what: `Your ${PLAN_LABELS[plan.plan].toLowerCase()} plan starts at ${plan.priceString}. Cancel at least 24 hours before to pay nothing.`,
    },
  ];
}
