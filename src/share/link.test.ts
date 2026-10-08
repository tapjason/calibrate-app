import { appStoreLink, shareCampaign } from './link';

describe('share links (GROWTH §0, step 1)', () => {
  it('names one campaign per surface and form', () => {
    expect(shareCampaign('card', 'text')).toBe('share-card-text');
    expect(shareCampaign('warmup', 'image')).toBe('share-warmup-image');
  });

  // App Store Connect's limit for a campaign token.
  it('keeps every campaign within 30 characters', () => {
    for (const surface of ['card', 'weekly', 'yearly', 'warmup'] as const) {
      for (const form of ['text', 'image'] as const) {
        expect(shareCampaign(surface, form).length).toBeLessThanOrEqual(30);
      }
    }
  });

  it('is null until the app has an App Store id', () => {
    expect(appStoreLink('share-card-text')).toBeNull();
    expect(appStoreLink('share-card-text', { id: null, providerToken: '123' })).toBeNull();
  });

  it('links to the product page without a campaign until there is a provider token', () => {
    expect(appStoreLink('share-card-text', { id: '6740000000', providerToken: null })).toBe(
      'https://apps.apple.com/app/apple-store/id6740000000',
    );
  });

  it("builds Apple's campaign link: pt, ct, mt=8", () => {
    expect(appStoreLink('share-card-text', { id: '6740000000', providerToken: '118000' })).toBe(
      'https://apps.apple.com/app/apple-store/id6740000000?pt=118000&ct=share-card-text&mt=8',
    );
  });
});
