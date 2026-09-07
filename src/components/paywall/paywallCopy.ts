// Paywall copy, kept out of the component so it can be unit-tested and read
// as one piece. Every claim here has to be true of the shipped app — this is
// the screen where an over-promise turns into a refund.

import type { PlanId, PlusPlan } from '@/billing/revenuecat';

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
 * What Plus actually buys. Deliberately short, and deliberately led by the
 * Coach — §5.3 makes the insight tier the conversion hook.
 *
 * **Ship blocker.** Only the Coach bullet is built today. The analytics and
 * cosmetics bullets describe the intended tier, and they must either exist or
 * come out of this list before a build with a live paywall reaches anyone —
 * charging for two of three named features is a refund request with extra
 * steps. See BUILD_PLAN.md L6/L7.
 */
export const PLUS_FEATURES: readonly string[] = [
  'Coach — AI feedback that reads your calibration numbers and tells you what they mean',
  'Advanced analytics — long-range trends, cross-category drill-down, CSV export',
  'Extra card and badge themes for your share cards and Wrapped',
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

/** Trial line for a plan, or null when it has no free trial. */
export function trialLine(plan: PlusPlan): string | null {
  if (!plan.trialDays || plan.trialDays <= 0) return null;
  const unit = plan.trialDays === 1 ? 'day' : 'days';
  return `${plan.trialDays} ${unit} free, then ${plan.priceString}`;
}

/** The price row for a plan: trial if there is one, otherwise the raw price. */
export function priceLine(plan: PlusPlan): string {
  return trialLine(plan) ?? plan.priceString;
}

/** Renewal terms. Required by App Review, and honest besides. */
export function termsLine(plans: readonly PlusPlan[]): string {
  const hasSubscription = plans.some((p) => p.plan !== 'lifetime');
  if (!hasSubscription) return 'One-time purchase. No subscription, no renewal.';
  return (
    'Subscriptions renew automatically until cancelled. Manage or cancel any ' +
    'time in your App Store account settings.'
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
