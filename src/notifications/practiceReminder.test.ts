import type { PracticeQuestion } from '@/types';

import {
  __setPracticeReminderApiForTests,
  PRACTICE_REMINDER_DAYS_AHEAD,
  PRACTICE_REMINDER_MOMENTS,
  PRACTICE_REMINDER_PLACEHOLDER,
  PRACTICE_REMINDER_TITLES,
  practiceReminderBody,
  practiceReminderPlan,
  reminderTimeLabel,
  syncPracticeReminders,
  type PracticeReminderApi,
} from './practiceReminder';

const question = (day: number): PracticeQuestion => ({
  id: `north:${day}`,
  kind: 'north',
  prompt: 'Which is farther north?',
  options: [`City ${day}`, 'Moscow'],
  correctIndex: 1,
  fact: 'f',
});
const questionsFor = (day: number) => [question(day)];

const TODAY = 20_733;
// Wednesday 2026-10-07 at 10:00 local (Jest pins TZ to UTC).
const MORNING = new Date(2026, 9, 7, 10, 0);

function fakeApi(granted = true) {
  const scheduled = new Map<string, { title: string; body: string; date: Date; data?: unknown }>();
  const cancelled: string[] = [];
  const categories: { id: string; placeholder: string }[] = [];
  const api: PracticeReminderApi = {
    async getPermissionsAsync() {
      return { granted };
    },
    async scheduleNotificationAsync(req) {
      scheduled.set(req.identifier, { ...req.content, date: req.trigger.date });
      return req.identifier;
    },
    async cancelScheduledNotificationAsync(id) {
      cancelled.push(id);
      scheduled.delete(id);
    },
    async setNotificationCategoryAsync(id, _actions, options) {
      categories.push({ id, placeholder: options.previewPlaceholder });
    },
  };
  return { api, scheduled, cancelled, categories };
}

afterEach(() => __setPracticeReminderApiForTests(undefined));

describe('practice reminder copy (roadmap step 89)', () => {
  it('offers moments in a day, not bare times', () => {
    expect(PRACTICE_REMINDER_MOMENTS.map((m) => m.label)).toEqual(['With coffee', 'At lunch', 'After dinner']);
    expect(reminderTimeLabel({ hour: 8, minute: 0 }).replace(/\s/g, ' ')).toBe('8:00 AM');
    expect(reminderTimeLabel({ hour: 20, minute: 30 }).replace(/\s/g, ' ')).toBe('8:30 PM');
  });

  it("asks the day's first question in the body", () => {
    expect(practiceReminderBody(question(1))).toBe('Which is farther north: City 1 or Moscow?');
    expect(practiceReminderBody(undefined)).toBe('Three questions, about 30 seconds.');
    const long = { ...question(1), options: ['A'.repeat(60), 'B'.repeat(30)] as [string, string] };
    expect(practiceReminderBody(long)).toBe('Three questions, about 30 seconds.');
  });

  it('follows the notification rules: title-style, no streak, no loss, no instructions', () => {
    for (const title of PRACTICE_REMINDER_TITLES) {
      expect(title).not.toMatch(/[.!?]$/);
      expect(title).not.toMatch(/streak|lose|lost|miss|tap|don.t/i);
    }
    expect(PRACTICE_REMINDER_PLACEHOLDER).toBe('Daily practice');
  });
});

describe('practiceReminderPlan', () => {
  const time = { hour: 20, minute: 30 };

  it('plans three days, starting today while the time is still ahead', () => {
    const plan = practiceReminderPlan({ now: MORNING, today: TODAY, time, doneToday: false, questionsFor });
    expect(plan.map((r) => r.identifier)).toEqual([
      `calibrate-practice-${TODAY}`,
      `calibrate-practice-${TODAY + 1}`,
      `calibrate-practice-${TODAY + 2}`,
    ]);
    expect(plan[0]?.date).toEqual(new Date(2026, 9, 7, 20, 30));
    expect(plan[2]?.date).toEqual(new Date(2026, 9, 9, 20, 30));
    expect(plan).toHaveLength(PRACTICE_REMINDER_DAYS_AHEAD);
  });

  it("skips today once today's practice is done, or the time has passed", () => {
    const done = practiceReminderPlan({ now: MORNING, today: TODAY, time, doneToday: true, questionsFor });
    expect(done.map((r) => r.date.getDate())).toEqual([8, 9, 10]);
    const late = practiceReminderPlan({
      now: new Date(2026, 9, 7, 21, 0),
      today: TODAY,
      time,
      doneToday: false,
      questionsFor,
    });
    expect(late[0]?.date).toEqual(new Date(2026, 9, 8, 20, 30));
  });

  it('words each day differently, with that day’s question', () => {
    const plan = practiceReminderPlan({ now: MORNING, today: TODAY, time, doneToday: false, questionsFor });
    expect(new Set(plan.map((r) => r.title)).size).toBe(plan.length);
    expect(plan[1]?.body).toBe(`Which is farther north: City ${TODAY + 1} or Moscow?`);
  });
});

describe('syncPracticeReminders', () => {
  const base = { now: MORNING, today: TODAY, doneToday: false, questionsFor };

  it('schedules the plan with its category and the practice route', async () => {
    const fake = fakeApi();
    __setPracticeReminderApiForTests(fake.api);
    await expect(
      syncPracticeReminders({ ...base, time: { hour: 8, minute: 0 }, enabled: true }),
    ).resolves.toBe('scheduled');
    // 8:00 has passed at 10:00, so tomorrow, the day after, and the one after.
    expect([...fake.scheduled.keys()]).toEqual([
      `calibrate-practice-${TODAY + 1}`,
      `calibrate-practice-${TODAY + 2}`,
      `calibrate-practice-${TODAY + 3}`,
    ]);
    expect(fake.scheduled.get(`calibrate-practice-${TODAY + 1}`)?.data).toEqual({ kind: 'practice' });
    expect(fake.categories).toEqual([{ id: 'calibrate-practice-reminder', placeholder: 'Daily practice' }]);
  });

  it('cancels them all with no time chosen, or the switch off', async () => {
    const fake = fakeApi();
    __setPracticeReminderApiForTests(fake.api);
    await syncPracticeReminders({ ...base, time: { hour: 20, minute: 30 }, enabled: true });
    expect(fake.scheduled.size).toBe(3);
    await expect(syncPracticeReminders({ ...base, time: null, enabled: true })).resolves.toBe('cancelled');
    expect(fake.scheduled.size).toBe(0);

    await syncPracticeReminders({ ...base, time: { hour: 20, minute: 30 }, enabled: true });
    await syncPracticeReminders({ ...base, time: { hour: 20, minute: 30 }, enabled: false });
    expect(fake.scheduled.size).toBe(0);
  });

  it('replaces rather than piles up when synced again', async () => {
    const fake = fakeApi();
    __setPracticeReminderApiForTests(fake.api);
    const time = { hour: 20, minute: 30 };
    await syncPracticeReminders({ ...base, time, enabled: true });
    await syncPracticeReminders({ ...base, time, enabled: true, doneToday: true });
    expect([...fake.scheduled.keys()].sort()).toEqual([
      `calibrate-practice-${TODAY + 1}`,
      `calibrate-practice-${TODAY + 2}`,
      `calibrate-practice-${TODAY + 3}`,
    ]);
  });

  it('never asks for permission, and skips without it', async () => {
    const fake = fakeApi(false);
    __setPracticeReminderApiForTests(fake.api);
    await expect(
      syncPracticeReminders({ ...base, time: { hour: 20, minute: 30 }, enabled: true }),
    ).resolves.toBe('skipped');
    expect(fake.scheduled.size).toBe(0);
  });

  it('does nothing where notifications do not exist', async () => {
    __setPracticeReminderApiForTests(null);
    await expect(
      syncPracticeReminders({ ...base, time: { hour: 20, minute: 30 }, enabled: true }),
    ).resolves.toBe('skipped');
  });
});
