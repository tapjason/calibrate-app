// App Store links for shares (GROWTH_AND_MONETIZATION.md §0, step 1).
//
// A shared card is how a new person meets the app, and the name alone doesn't
// find it: two App Store apps already call themselves "Calibrate". A link goes
// straight to the product page. With a campaign token on it, App Store Connect
// counts first-time downloads per campaign (Analytics → Acquisition →
// Campaigns, once a campaign reaches five), which is how the share loop gets
// measured: no SDK, no install id, and nothing that identifies the person who
// shared or the one who installed (APP_PRIVACY.md is unchanged).
//
// Only text shares can carry a link today. An image goes to the share sheet
// as a bare PNG (expo-sharing takes a file and nothing else).

import type { ShareSurface } from '@/analytics/events';
import { APP_STORE_ID, APP_STORE_PROVIDER_TOKEN } from '@/constants/app';

export type ShareForm = 'text' | 'image';

interface StoreIds {
  id: string | null;
  providerToken: string | null;
}

const CONFIGURED: StoreIds = { id: APP_STORE_ID, providerToken: APP_STORE_PROVIDER_TOKEN };

/** "share-card-text": one campaign per surface and form, so the counts say which one travels. */
export function shareCampaign(surface: ShareSurface, form: ShareForm): string {
  return `share-${surface}-${form}`;
}

/**
 * The product page, with the campaign when there's a provider token to count
 * it under. Null while the app has no App Store id.
 */
export function appStoreLink(campaign: string, ids: StoreIds = CONFIGURED): string | null {
  if (!ids.id) return null;
  const page = `https://apps.apple.com/app/apple-store/id${encodeURIComponent(ids.id)}`;
  if (!ids.providerToken) return page;
  const query = [
    `pt=${encodeURIComponent(ids.providerToken)}`,
    `ct=${encodeURIComponent(campaign)}`,
    'mt=8',
  ].join('&');
  return `${page}?${query}`;
}
