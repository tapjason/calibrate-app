import type { PlusPlan } from '@/billing/revenuecat';

import {
  ctaLabel,
  defaultPlan,
  monthlyEquivalentLine,
  noPlansText,
  noTrialLine,
  noticeText,
  planAccessibilityLabel,
  planBadge,
  priceLine,
  sortPlans,
  termsLine,
  trialLabel,
  trialTermsLine,
  trialTimeline,
} from './paywallCopy';

const annual: PlusPlan = {
  packageId: 'pkg_annual',
  plan: 'annual',
  priceString: '$29.99',
  trialDays: 21,
  trialPeriod: null,
};

/** The shipped offer: one calendar month free on annual. */
const annualMonthTrial: PlusPlan = {
  packageId: 'pkg_annual',
  plan: 'annual',
  priceString: '$29.99',
  trialDays: 30,
  trialPeriod: { count: 1, unit: 'MONTH' },
};
const monthly: PlusPlan = {
  packageId: 'pkg_monthly',
  plan: 'monthly',
  priceString: '$4.99',
  trialDays: null,
  trialPeriod: null,
};
const lifetime: PlusPlan = {
  packageId: 'pkg_lifetime',
  plan: 'lifetime',
  priceString: '$59.99',
  trialDays: null,
  trialPeriod: null,
};

describe('trialLabel', () => {
  it('says a one-month trial in months, not days', () => {
    // The whole point: 30 days is not a calendar month, and this is a
    // billing screen.
    expect(trialLabel(annualMonthTrial)).toBe('1 month');
  });

  it('pluralizes multi-unit periods', () => {
    expect(
      trialLabel({ ...annualMonthTrial, trialPeriod: { count: 2, unit: 'WEEK' } }),
    ).toBe('2 weeks');
  });

  it('falls back to the day count when the store reports no period', () => {
    expect(trialLabel(annual)).toBe('21 days');
  });

  it('is null with no trial at all', () => {
    expect(trialLabel(monthly)).toBeNull();
  });
});

describe('trialTermsLine', () => {
  it('warns that the trial converts, and names the 24-hour deadline', () => {
    const line = trialTermsLine([annualMonthTrial, monthly]);
    expect(line).toContain('turns into a paid subscription');
    // Apple only stops the charge if you cancel a day early. Saying "before
    // it ends" would be a promise the platform does not keep.
    expect(line).toContain('24 hours');
  });

  it('is empty when nothing on offer has a trial', () => {
    expect(trialTermsLine([monthly, lifetime])).toBe('');
    expect(trialTermsLine([])).toBe('');
  });
});

// Owner, TestFlight 2026-11-17: "1 month free, then $34.99 a year" buried the
// trial mid-sentence. The billed price leads (App Review 3.1.2), the trial
// follows, and the badge beside the name carries it.
describe('priceLine', () => {
  it('leads a trial plan with the billed price, then the trial', () => {
    expect(priceLine(annualMonthTrial)).toBe('$29.99\u00A0a\u00A0year after 1 month free');
  });

  it('says a day-count trial in days', () => {
    expect(priceLine(annual)).toBe('$29.99\u00A0a\u00A0year after 21 days free');
  });

  it('singularizes a one-day trial', () => {
    expect(priceLine({ ...annual, trialDays: 1 })).toBe('$29.99\u00A0a\u00A0year after 1 day free');
  });

  it('is the store price and its period with no trial', () => {
    expect(priceLine(monthly)).toBe('$4.99\u00A0a\u00A0month');
    expect(priceLine(lifetime)).toBe('$59.99');
    expect(priceLine({ ...annual, trialDays: 0 })).toBe('$29.99\u00A0a\u00A0year');
  });
});

// DESIGN_SYSTEM \u00A77.6: a "1 month free" badge beside Annual's name.
describe('planBadge', () => {
  it('names the trial on a plan that has one', () => {
    expect(planBadge(annualMonthTrial)).toEqual({ text: '1 month free', trial: true });
  });

  it("says the trial in the store's own unit", () => {
    expect(
      planBadge({ ...annualMonthTrial, trialPeriod: { count: 2, unit: 'WEEK' } }),
    ).toEqual({ text: '2 weeks free', trial: true });
  });

  it('keeps the plain tagline with no trial', () => {
    // Not eligible for the trial: the store reports none, and Annual is
    // "Best value" again.
    expect(planBadge({ ...annualMonthTrial, trialDays: null, trialPeriod: null })).toEqual({
      text: 'Best value',
      trial: false,
    });
    expect(planBadge(monthly)).toEqual({ text: 'Month to month', trial: false });
    expect(planBadge(lifetime)).toEqual({ text: 'Pay once, keep it', trial: false });
  });
});

describe('noTrialLine', () => {
  it('says a renewing plan has no trial when another plan on offer does', () => {
    expect(noTrialLine(monthly, [annualMonthTrial, monthly, lifetime])).toBe('No free trial');
  });

  it('never says it on Lifetime, which does not renew', () => {
    expect(noTrialLine(lifetime, [annualMonthTrial, monthly, lifetime])).toBeNull();
  });

  it('never says it on the plan that has the trial', () => {
    expect(noTrialLine(annualMonthTrial, [annualMonthTrial, monthly, lifetime])).toBeNull();
  });

  it('says nothing when no plan on offer has a trial', () => {
    const noTrialAnnual = { ...annualMonthTrial, trialDays: null, trialPeriod: null };
    expect(noTrialLine(monthly, [noTrialAnnual, monthly, lifetime])).toBeNull();
    expect(noTrialLine(noTrialAnnual, [noTrialAnnual, monthly, lifetime])).toBeNull();
  });
});

describe('planAccessibilityLabel', () => {
  const offer = [annualMonthTrial, monthly, lifetime];

  it('reads the name, the trial badge, the price and the monthly figure, in that order', () => {
    expect(
      planAccessibilityLabel({ ...annualMonthTrial, pricePerMonthString: '$2.50' }, offer),
    ).toBe('Annual, 1 month free. $29.99\u00A0a\u00A0year after 1 month free. Works out to $2.50 a month.');
  });

  it('says "No free trial" before a plain tagline', () => {
    expect(planAccessibilityLabel(monthly, offer)).toBe(
      'Monthly, $4.99\u00A0a\u00A0month. No free trial. Month to month',
    );
    expect(planAccessibilityLabel(lifetime, offer)).toBe('Lifetime, $59.99. Pay once, keep it');
  });

  it('ends on the tagline when nothing on offer has a trial', () => {
    const noTrialAnnual = { ...annualMonthTrial, trialDays: null, trialPeriod: null };
    expect(planAccessibilityLabel(noTrialAnnual, [noTrialAnnual, monthly])).toBe(
      'Annual, $29.99\u00A0a\u00A0year. Best value',
    );
    expect(planAccessibilityLabel(monthly, [noTrialAnnual, monthly])).toBe(
      'Monthly, $4.99\u00A0a\u00A0month. Month to month',
    );
  });
});

describe('termsLine', () => {
  it('discloses auto-renewal when a subscription is offered', () => {
    expect(termsLine([annual, monthly])).toMatch(/renew automatically/);
  });

  // Telling a one-time buyer their purchase auto-renews is the kind of copy
  // that generates refund requests.
  it('does not claim renewal for a lifetime-only offering', () => {
    expect(termsLine([lifetime])).toMatch(/One-time purchase/);
  });

  // With no plans loaded there is nothing to state terms about, and the
  // lifetime branch would assert "no subscription" on the very screen that
  // just said Plus is unavailable.
  it('states nothing at all for an empty offering', () => {
    expect(termsLine([])).toBe('');
  });
});

// Blind playtest 2026-11-10, run 4: offline, "Plus isn't available on this
// build yet" read as Plus not existing.
describe('noPlansText', () => {
  it('says "this build" only for a build with no billing', () => {
    expect(noPlansText(false)).toBe("Plus isn't available on this build yet.");
  });

  it('points at the connection when billing exists but the plans did not load', () => {
    expect(noPlansText(true)).toBe(
      "Plus plans couldn't load. Check your connection, then open this again.",
    );
  });
});

describe('noticeText', () => {
  it('has a message for every outcome that needs one', () => {
    expect(noticeText('purchased')).toBeTruthy();
    expect(noticeText('restored')).toBeTruthy();
    expect(noticeText('nothing_to_restore')).toBeTruthy();
    expect(noticeText('unavailable')).toBeTruthy();
    expect(noticeText(null)).toBeNull();
  });

  // "Nothing was charged" is the sentence a user needs to see when a purchase
  // fails, and the one they will look for before contacting support.
  it('says nothing was charged when a purchase fails', () => {
    expect(noticeText('failed')).toMatch(/[Nn]othing was charged/);
  });
});

describe('plan selector copy', () => {
  const annual: PlusPlan = {
    packageId: 'a',
    plan: 'annual',
    priceString: '$29.99',
    trialDays: 30,
    trialPeriod: { count: 1, unit: 'MONTH' },
  };
  const monthly: PlusPlan = {
    packageId: 'm',
    plan: 'monthly',
    priceString: '$4.99',
    trialDays: null,
    trialPeriod: null,
  };
  const lifetime: PlusPlan = { ...monthly, packageId: 'l', plan: 'lifetime', priceString: '$59.99' };

  it('orders annual first and preselects it', () => {
    expect(sortPlans([lifetime, monthly, annual]).map((p) => p.plan)).toEqual([
      'annual',
      'monthly',
      'lifetime',
    ]);
    expect(defaultPlan([monthly, annual])?.plan).toBe('annual');
    expect(defaultPlan([])).toBeNull();
  });

  it('labels the one button by what the tap does', () => {
    // What follows, on the button (D62).
    expect(ctaLabel(annual)).toMatch(/^Start 1 month free, then \$29\.99\sa\syear$/);
    expect(ctaLabel(monthly)).toBe('Subscribe for $4.99 a month');
    expect(ctaLabel({ ...annual, trialDays: null, trialPeriod: null })).toBe(
      'Subscribe for $29.99 a year',
    );
    expect(ctaLabel(lifetime)).toBe('Buy once for $59.99');
  });

  it('lays out the trial honestly, with the 24-hour rule and no promised reminder', () => {
    const steps = trialTimeline(annual);
    expect(steps?.map((s) => s.when)).toEqual(['Today', 'In 1 month']);
    expect(steps?.[1].what).toContain('$29.99');
    expect(steps?.[1].what).toContain('24 hours');
    expect(JSON.stringify(steps)).not.toMatch(/notification/i);
    expect(trialTimeline(monthly)).toBeNull();
  });

  // Roadmap D16: the reminder is promised only while the app would send it.
  it('adds the reminder two days before, when notifications are on', () => {
    const steps = trialTimeline(annual, { reminder: true });
    expect(steps?.map((s) => s.when)).toEqual(['Today', 'Two days before', 'In 1 month']);
    expect(steps?.[1].what).toBe('A notification with the date it renews and the price.');
  });
});

// Roadmap step 50: the store's per-month figure, under annual only.
describe('monthlyEquivalentLine', () => {
  it("says annual's monthly figure in the store's own format", () => {
    expect(monthlyEquivalentLine({ ...annualMonthTrial, pricePerMonthString: '$2.50' })).toBe(
      'Works out to $2.50 a month.',
    );
  });

  it('says nothing for other plans, or when the store gives no figure', () => {
    expect(monthlyEquivalentLine({ ...monthly, pricePerMonthString: '$4.99' })).toBeNull();
    expect(monthlyEquivalentLine(lifetime)).toBeNull();
    expect(monthlyEquivalentLine(annualMonthTrial)).toBeNull();
    expect(monthlyEquivalentLine({ ...annualMonthTrial, pricePerMonthString: null })).toBeNull();
  });
});
