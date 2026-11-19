import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { useWarmupStore } from '@/store/warmupStore';

import { usageCountsMayGoUp } from './usageNotice';

// D69 (b): no usage count goes up before the person has seen the line about
// them. Signed in, the sign-in screen said it; a guest, the line on the
// Warm-up's first screen, whose first showing the settings store keeps
// (`usageNoticeShownAt`). Nothing else stands in for it: a finished Warm-up
// from a build before the line doesn't.

const SHOWN = '2026-11-19T10:00:00.000Z';
const NO_WARMUP = { index: 0, answers: [], result: null, completedAt: null, pick: null };
const FINISHED_WARMUP = { ...NO_WARMUP, completedAt: '2026-11-10T10:00:00.000Z', index: 10 };

function guest({
  shownAt = null,
  warmup = NO_WARMUP,
}: { shownAt?: string | null; warmup?: Partial<ReturnType<typeof useWarmupStore.getState>> } = {}) {
  useAuthStore.setState({ status: 'guest', userId: 'local-user-v1' });
  useSettingsStore.setState({ usageNoticeShownAt: shownAt });
  useWarmupStore.setState({ ...NO_WARMUP, ...warmup });
}

beforeEach(() => {
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
});

afterEach(() => {
  __setPersistenceForTests(null);
  useWarmupStore.setState(NO_WARMUP);
});

describe('usageCountsMayGoUp', () => {
  it('holds a guest who has never been shown the line', () => {
    guest();
    expect(usageCountsMayGoUp()).toBe(false);
  });

  it('holds while auth is still loading, as for a guest', () => {
    guest();
    useAuthStore.setState({ status: 'loading', userId: null });
    expect(usageCountsMayGoUp()).toBe(false);
  });

  it('lets a signed-in account through, stamp or not: the sign-in screen said what goes up', () => {
    guest();
    useAuthStore.setState({ status: 'authenticated', userId: 'user-1' });
    expect(usageCountsMayGoUp()).toBe(true);
  });

  it.each([
    ['with no Warm-up', NO_WARMUP],
    ['with a finished Warm-up', FINISHED_WARMUP],
  ])('lets a guest through once the line has been shown, %s', (_label, warmup) => {
    guest({ shownAt: SHOWN, warmup });
    expect(usageCountsMayGoUp()).toBe(true);
  });

  // The Warm-up's own record no longer stands in for the stamp. A guest who
  // finished it on a build from before the line never saw the line, and
  // sends nothing; nor does one part-way through it, or with a choice kept.
  it.each([
    ['a finished Warm-up', FINISHED_WARMUP],
    ['a first question answered', { index: 1 }],
    ['a choice kept on the first question', { pick: { option: 0 as const, confidence: null } }],
  ])('holds a guest with %s and no stamp', (_label, warmup) => {
    guest({ warmup });
    expect(usageCountsMayGoUp()).toBe(false);
  });

  it('reads the stamp from memory: set this launch, it counts at once, and forgotten, it stops', async () => {
    guest();
    await useSettingsStore.getState().markUsageNoticeShown();
    expect(usageCountsMayGoUp()).toBe(true);

    await useSettingsStore.getState().forgetUsageNoticeShown();
    expect(usageCountsMayGoUp()).toBe(false);
  });
});

// The under-13 rule (roadmap D70): nothing goes up on a local-only phone, nor
// before Apple has answered on a launch that asks, whoever is signed in and
// whatever was shown.
describe('usageCountsMayGoUp under the under-13 rule', () => {
  afterEach(() => __resetAgeStoreForTests());

  it.each([
    ['a guest who was shown the line', () => guest({ shownAt: SHOWN })],
    [
      'a signed-in account',
      () => {
        guest();
        useAuthStore.setState({ status: 'authenticated', userId: 'user-1' });
      },
    ],
  ])('holds %s while the phone is local-only', (_label, arrange) => {
    arrange();
    useAgeStore.setState({ localOnly: true, settled: true });
    expect(usageCountsMayGoUp()).toBe(false);
  });

  it('holds until Apple has answered on a launch that asks, then lets through', () => {
    guest({ shownAt: SHOWN });
    useAgeStore.setState({ localOnly: false, settled: false });
    expect(usageCountsMayGoUp()).toBe(false);

    useAgeStore.getState().markSettled();
    expect(usageCountsMayGoUp()).toBe(true);
  });
});
