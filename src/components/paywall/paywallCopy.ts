// Paywall copy, kept out of the component so it can be unit-tested and read
// as one piece. Every claim here has to be true of the shipped app — this is
// the screen where an over-promise turns into a refund.

import type { PlanId, PlusPlan, TrialUnit } from '@/billing/revenuecat';
import type { PaywallNotice } from '@/store/paywallStore';

/** Plan names, as the user sees them. */
export const PLAN_LABELS: Record<PlanId, string> = {
  annual: 'Annual',
  monthly: 'Monthly',
  lifetime: 'Lifetime',
};

/**
 * The one-line pitch per plan, beside its name. Annual carries the anchor
 * (GROWTH_AND_MONETIZATION.md §4) and is the only plan we recommend.
 *
 * A plan with a free trial shows the trial badge there instead ("1 month
 * free", `planBadge`): with "Best value" beside Annual, the free month sat
 * mid-sentence in its price line and the three cards didn't say which one
 * had it (owner, TestFlight 2026-11-17). Annual's tagline shows only when
 * the store offers this person no trial.
 */
export const PLAN_TAGLINES: Record<PlanId, string> = {
  annual: 'Best value',
  // Not "Cancel any time": every plan that renews can be cancelled, and on
  // Monthly alone it read as if Annual couldn't (playtest 2026-11-04b, run 4).
  monthly: 'Month to month',
  lifetime: 'Pay once, keep it',
};

/**
 * What Plus actually buys, one line per benefit row on the paywall
 * (DESIGN_SYSTEM §7.6). Deliberately short, and deliberately led by the
 * Coach — §5.3 makes the insight tier the conversion hook.
 *
 * All three exist as of 2026-09-07 — Coach (`src/ai/coach.ts`), Trends
 * (`src/engine/trends.ts`; the CSV export is free since D31), and the card themes
 * (`src/constants/cardThemes.ts`). Keep it that way: a bullet here that the
 * app doesn't do is a refund request with extra steps.
 */
export const PLUS_FEATURES: readonly string[] = [
  // Coach runs on the server for a signed-in person; say so before the
  // purchase, not after (playtest 2026-11-04b, run 4).
  'Coach: an AI read of what your calibration numbers mean, once you sign in',
  'Trends: month by month, by category, and what your 80% really means',
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
  'Logging, answering, your score, the curve, badges, streaks, full history, ' +
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

/**
 * How often a plan bills, as the price row says it. Every recurring price
 * names its period (roadmap step 50): "then $29.99" left the reader to work
 * out from the plan name what the $29.99 was for, and App Review asks for the
 * billing length beside the price (Guideline 3.1.2(c)).
 */
const PERIOD: Record<PlanId, string> = {
  annual: 'a year',
  monthly: 'a month',
  lifetime: 'once',
};

/**
 * "$29.99 a year"; lifetime stays the bare price under "Pay once, keep it".
 * Held together with no-break spaces: at 320pt the line ended "$29.90 a" and
 * put "year" alone under it (roadmap step 70), and a price should never be
 * read apart from what it pays for.
 */
function pricePerPeriod(plan: PlusPlan): string {
  if (plan.plan === 'lifetime') return plan.priceString;
  return `${plan.priceString} ${PERIOD[plan.plan]}`.replace(/ /g, '\u00A0');
}

/**
 * The price row for a plan: the price and its period, then the trial when
 * there is one ("$34.99 a year after 1 month free"). The billed price leads
 * so it stays the most prominent price on the card (App Review 3.1.2); the
 * trial itself is the badge beside the plan's name (`planBadge`). It read
 * "1 month free, then $34.99 a year" until 2026-11-17, which buried the free
 * month mid-sentence.
 */
export function priceLine(plan: PlusPlan): string {
  const trial = trialLabel(plan);
  if (!trial) return pricePerPeriod(plan);
  return `${pricePerPeriod(plan)} after ${trial} free`;
}

export interface PlanBadge {
  text: string;
  /** True for a trial badge, drawn as a filled pill; false for the plain tagline. */
  trial: boolean;
}

/**
 * What sits beside a plan's name: "1 month free" when the store offers this
 * person a trial on it (DESIGN_SYSTEM §7.6's badge), otherwise the plan's
 * plain tagline. The length is the store's, in its own unit.
 */
export function planBadge(plan: PlusPlan): PlanBadge {
  const trial = trialLabel(plan);
  if (trial) return { text: `${trial} free`, trial: true };
  return { text: PLAN_TAGLINES[plan.plan], trial: false };
}

const NO_TRIAL_LINE = 'No free trial';

/**
 * "No free trial" under a renewing plan without one, but only when another
 * plan on offer has a trial: beside "1 month free" on Annual, Monthly's
 * silence read as if it might have one too. Lifetime never says it (it
 * doesn't renew, so a trial isn't a question there), and with no trial on
 * offer nobody does.
 */
export function noTrialLine(plan: PlusPlan, plans: readonly PlusPlan[]): string | null {
  if (plan.plan === 'lifetime' || trialLabel(plan) !== null) return null;
  return plans.some((p) => trialLabel(p) !== null) ? NO_TRIAL_LINE : null;
}

/**
 * What VoiceOver reads for a plan card, in the order the card shows it: the
 * name, the trial badge, the price, the monthly figure and "No free trial";
 * a plain tagline comes last, as it's the least of it. The monthly figure is
 * the spoken sentence, not the visible "$2.50 / month": the card is one
 * element with this label, so its lines aren't read on their own.
 */
export function planAccessibilityLabel(plan: PlusPlan, plans: readonly PlusPlan[]): string {
  const badge = planBadge(plan);
  const noTrial = noTrialLine(plan, plans);
  return [
    badge.trial ? `${PLAN_LABELS[plan.plan]}, ${badge.text}.` : `${PLAN_LABELS[plan.plan]},`,
    `${priceLine(plan)}.`,
    monthlyEquivalentSpoken(plan),
    noTrial ? `${noTrial}.` : null,
    badge.trial ? null : badge.text,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Annual's monthly equivalent, under its price and smaller (DESIGN_SYSTEM
 * §7.6): "$2.50 / month", held together with no-break spaces so it never
 * wraps mid-line. It read "Works out to $2.50 a month." until the owner asked
 * for it shorter (2026-11-21); VoiceOver still hears that sentence
 * (`monthlyEquivalentSpoken`), not a slash. The figure is the store's, never
 * our division. Null for other plans, or when the store gives none.
 */
export function monthlyEquivalentLine(plan: PlusPlan): string | null {
  if (plan.plan !== 'annual' || !plan.pricePerMonthString) return null;
  return `${plan.pricePerMonthString} / month`.replace(/ /g, '\u00A0');
}

/**
 * The monthly equivalent as the plan card's VoiceOver label says it: "Works
 * out to $2.50 a month." A screen reader would read the visible line's slash
 * aloud. Null whenever `monthlyEquivalentLine` is.
 */
export function monthlyEquivalentSpoken(plan: PlusPlan): string | null {
  if (plan.plan !== 'annual' || !plan.pricePerMonthString) return null;
  return `Works out to ${plan.pricePerMonthString} a month.`;
}

/**
 * Renewal terms. Required by App Review, and honest besides.
 *
 * Apple's rule on every subscription plan, trial or not: it renews unless
 * cancelled at least 24 hours before the period ends (policy review
 * 2026-11-25: "until cancelled" and "any time" left the 24 hours out of the
 * plans with no trial). A trial is that period too, so with a trial chosen
 * this sentence carries the 24 hours, and the trial's own line only says it
 * converts (`trialTermsLine`).
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
    'Subscriptions renew automatically unless cancelled at least 24 hours before ' +
    'the end of the current period. Manage or cancel in your App Store account settings.'
  );
}

/**
 * What a free trial actually costs you if you forget — stated plainly.
 *
 * Empty when no plan on offer has a trial. It says the trial converts, and
 * says it once: the 24-hour clause sits right under it in `termsLine`, which
 * carries it for every subscription since the policy review of 2026-11-25,
 * and in the timeline's last step ("Cancel at least 24 hours before to pay
 * nothing."). The clause is not hedging: Apple stops a trial converting only
 * if it is cancelled at least a day before it ends, so "cancel any time
 * before it ends" is a promise the platform doesn't keep.
 */
export function trialTermsLine(plans: readonly PlusPlan[]): string {
  const hasTrial = plans.some((p) => trialLabel(p) !== null);
  if (!hasTrial) return '';
  return 'Your free trial turns into a paid subscription when it ends.';
}

/** The message shown after an action, or null when there is nothing to say. */
export function noticeText(notice: PaywallNotice): string | null {
  switch (notice) {
    case 'purchased':
      return "You're on Plus. Coach is under You when you want it.";
    // Apple charged, but the purchase went to the account signed in when it
    // started: the one on the phone changed while it finished (review round
    // 1, item 1). Decided copy.
    case 'purchased_elsewhere':
      return (
        'Your purchase went through, but the account on this phone changed while it finished. ' +
        "Sign in to the account you were using to get Plus. If it doesn't show, tap Restore purchases."
      );
    case 'restored':
      return 'Your purchase is restored.';
    case 'nothing_to_restore':
      return 'No previous purchase found on this account.';
    case 'unavailable':
      return "Plus isn't available on this build yet.";
    case 'failed':
      return "That didn't go through. Nothing was charged.";
    // No default: a notice added without words here fails to compile
    // (review round 2, item 6).
    case null:
      return null;
  }
}

/**
 * What the paywall says when it has no plans to show. "This build" only for a
 * build with no billing at all (web, Expo Go, no API key); a build that has
 * billing but couldn't load the store's plans is almost always offline, and
 * "Plus isn't available on this build yet" read as Plus not existing to a
 * tester with no signal (blind playtest 2026-11-10, run 4).
 */
export function noPlansText(billingAvailable: boolean): string {
  return billingAvailable
    ? "Plus plans couldn't load. Check your connection, then open this again."
    : noticeText('unavailable') ?? '';
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

/**
 * The single purchase button's label, for whichever plan is selected
 * (DESIGN_SYSTEM §7.6). It says exactly what the tap does: a trial starts a
 * trial, a subscription names its price and period, lifetime is one payment.
 */
export function ctaLabel(plan: PlusPlan): string {
  const trial = trialLabel(plan);
  // What follows, on the button itself (D62): "A free month that turns into
  // a bill is the frightening kind" (blind playtest 2026-11-13d, run 7).
  if (trial) return `Start ${trial} free, then ${pricePerPeriod(plan)}`;
  if (plan.plan === 'lifetime') return `Buy once for ${plan.priceString}`;
  return `Subscribe for ${plan.priceString} ${PERIOD[plan.plan]}`;
}

export interface TimelineStep {
  when: string;
  what: string;
}

/**
 * The honest trial timeline (DESIGN_SYSTEM §7.6), or null when the selected
 * plan has no trial. The middle step, the reminder two days before it renews
 * (roadmap D16), shows only while the app would send it: the caller passes
 * `reminder` only with the Notifications switch on and iOS permission granted
 * (PaywallView). Otherwise nothing is sent, so the screen doesn't promise it.
 */
export function trialTimeline(
  plan: PlusPlan,
  { reminder = false }: { reminder?: boolean } = {},
): TimelineStep[] | null {
  const trial = trialLabel(plan);
  if (!trial) return null;
  return [
    { when: 'Today', what: 'Full Plus: Coach, Trends and every card theme.' },
    ...(reminder
      ? [
          {
            when: 'Two days before',
            what: 'A notification with the date it renews and the price.',
          },
        ]
      : []),
    {
      when: `In ${trial}`,
      what: `Your ${PLAN_LABELS[plan.plan].toLowerCase()} plan starts at ${pricePerPeriod(plan)}. Cancel at least 24 hours before to pay nothing.`,
    },
  ];
}
