import {
  __setPracticeReminderApiForTests,
  cancelPracticeReminders,
  isPracticeReminder,
  type PracticeReminderApi,
  type ScheduledPracticeRequest,
} from './practiceReminder';

// The practice reminder is gone (2026-11-25, the owner). What an earlier build
// scheduled is cancelled at launch, and nothing else is touched.

function fakeApi(scheduled: ScheduledPracticeRequest[]) {
  const pending = [...scheduled];
  const cancelled: string[] = [];
  const api: PracticeReminderApi = {
    getAllScheduledNotificationsAsync: jest.fn(async () => [...pending]),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      cancelled.push(id);
      const i = pending.findIndex((r) => r.identifier === id);
      if (i >= 0) pending.splice(i, 1);
    }),
  };
  return { api, cancelled, pending };
}

// What an older build left with iOS: three practice reminders (stable ids,
// `kind: 'practice'`), a due-day reminder, the digest and the trial notice.
const OLDER_BUILD: ScheduledPracticeRequest[] = [
  { identifier: 'calibrate-practice-20416', content: { data: { kind: 'practice' } } },
  { identifier: 'calibrate-practice-20417', content: { data: { kind: 'practice' } } },
  { identifier: 'calibrate-practice-20418', content: { data: { kind: 'practice' } } },
  { identifier: 'os-id-1', content: { data: { predictionId: 'p1', fireAt: '2026-11-26T19:00:00.000Z' } } },
  { identifier: 'os-id-2', content: { data: { kind: 'digest' } } },
  { identifier: 'os-id-3', content: { data: { kind: 'trial' } } },
];

afterEach(() => {
  __setPracticeReminderApiForTests(undefined);
});

describe('cancelPracticeReminders (first launch after the update)', () => {
  it("cancels every practice reminder an older build scheduled, and nothing else", async () => {
    const fake = fakeApi(OLDER_BUILD);
    __setPracticeReminderApiForTests(fake.api);
    await expect(cancelPracticeReminders()).resolves.toBe(3);
    expect(fake.cancelled.sort()).toEqual([
      'calibrate-practice-20416',
      'calibrate-practice-20417',
      'calibrate-practice-20418',
    ]);
    expect(fake.pending.map((r) => r.identifier)).toEqual(['os-id-1', 'os-id-2', 'os-id-3']);
  });

  it('finds one by its kind even under an identifier iOS gave it', async () => {
    const fake = fakeApi([{ identifier: 'ABC-123', content: { data: { kind: 'practice' } } }]);
    __setPracticeReminderApiForTests(fake.api);
    await expect(cancelPracticeReminders()).resolves.toBe(1);
    expect(fake.cancelled).toEqual(['ABC-123']);
  });

  it('does nothing on a later launch, with none left', async () => {
    const fake = fakeApi(OLDER_BUILD);
    __setPracticeReminderApiForTests(fake.api);
    await cancelPracticeReminders();
    await expect(cancelPracticeReminders()).resolves.toBe(0);
    expect(fake.cancelled).toHaveLength(3);
  });

  it('never throws: a read that fails cancels nothing, a cancel that fails keeps going', async () => {
    __setPracticeReminderApiForTests({
      getAllScheduledNotificationsAsync: jest.fn(async () => {
        throw new Error('no');
      }),
      cancelScheduledNotificationAsync: jest.fn(async () => {}),
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(cancelPracticeReminders()).resolves.toBe(0);

    const fake = fakeApi(OLDER_BUILD);
    let first = true;
    fake.api.cancelScheduledNotificationAsync = jest.fn(async (id: string) => {
      if (first) {
        first = false;
        throw new Error('stuck');
      }
      fake.cancelled.push(id);
    });
    __setPracticeReminderApiForTests(fake.api);
    await expect(cancelPracticeReminders()).resolves.toBe(2);
    warn.mockRestore();
  });

  it('is a no-op where there are no local notifications (web)', async () => {
    __setPracticeReminderApiForTests(null);
    await expect(cancelPracticeReminders()).resolves.toBe(0);
  });
});

describe('isPracticeReminder', () => {
  it('knows an older build’s practice reminder and nothing else', () => {
    expect(isPracticeReminder({ identifier: 'calibrate-practice-1', content: {} })).toBe(true);
    expect(isPracticeReminder({ identifier: 'x', content: { data: { kind: 'practice' } } })).toBe(true);
    expect(isPracticeReminder({ identifier: 'x', content: { data: { kind: 'digest' } } })).toBe(false);
    expect(isPracticeReminder({ identifier: 'x', content: { data: { predictionId: 'p' } } })).toBe(false);
    expect(isPracticeReminder({ identifier: 'x', content: { data: null } })).toBe(false);
  });
});
