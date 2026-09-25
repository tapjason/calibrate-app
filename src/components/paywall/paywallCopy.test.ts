import type { PlusPlan } from '@/billing/revenuecat';

import {
  noticeText,
  priceLine,
  termsLine,
  trialLabel,
  trialLine,
  trialTermsLine,
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

describe('trialLine', () => {
  it('leads a month-long trial with the month', () => {
    expect(trialLine(annualMonthTrial)).toBe('1 month free, then $29.99');
  });

  it('states the trial length and what happens after it', () => {
    expect(trialLine(annual)).toBe('21 days free, then $29.99');
  });

  it('singularizes a one-day trial', () => {
    expect(trialLine({ ...annual, trialDays: 1 })).toBe('1 day free, then $29.99');
  });

  it('is null for a plan with no trial', () => {
    expect(trialLine(monthly)).toBeNull();
    expect(trialLine({ ...annual, trialDays: 0 })).toBeNull();
  });
});

describe('priceLine', () => {
  it('leads with the trial when there is one', () => {
    expect(priceLine(annual)).toBe('21 days free, then $29.99');
  });

  it('falls back to the store price', () => {
    expect(priceLine(monthly)).toBe('$4.99');
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
