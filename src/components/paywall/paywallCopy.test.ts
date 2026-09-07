import type { PlusPlan } from '@/billing/revenuecat';

import { noticeText, priceLine, termsLine, trialLine } from './paywallCopy';

const annual: PlusPlan = {
  packageId: 'pkg_annual',
  plan: 'annual',
  priceString: '$29.99',
  trialDays: 21,
};
const monthly: PlusPlan = {
  packageId: 'pkg_monthly',
  plan: 'monthly',
  priceString: '$4.99',
  trialDays: null,
};
const lifetime: PlusPlan = {
  packageId: 'pkg_lifetime',
  plan: 'lifetime',
  priceString: '$59.99',
  trialDays: null,
};

describe('trialLine', () => {
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
