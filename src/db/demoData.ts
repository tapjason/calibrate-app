// Demo data for store screenshots and the App Review demo account
// (APP_STORE_LISTING.md §4–5). Never part of a real user's data path: the only
// callers are the __DEV__-gated `app/dev/seed` route and
// `scripts/seed-demo-sql.mjs`, which writes SQL for the demo account.
//
// Deterministic and pure: the same `now` always yields the same rows. Keep its
// imports type-only: the SQL script strips the types and loads this file on its
// own, with no path-alias resolution.
//
// The shape is chosen to exercise every unlocked surface honestly: real
// miscalibration rather than a flattering curve. Health is well calibrated
// with ≥ 50 resolved (Sharp), work is a little overconfident (Forecaster),
// finance is badly overconfident on 17 resolved (score unlocked, still
// Guesser), personal runs underconfident, and social is unlocked but young.
// Together: "Sharp in health · Guesser in finance".

import type { Category, Prediction } from '@/types';

interface Cell {
  confidence: number;
  count: number;
  yes: number;
}

const PLAN: Record<Category, Cell[]> = {
  health: [
    { confidence: 25, count: 8, yes: 2 },
    { confidence: 50, count: 10, yes: 5 },
    { confidence: 70, count: 17, yes: 13 },
    { confidence: 90, count: 20, yes: 16 },
  ],
  work: [
    { confidence: 60, count: 10, yes: 6 },
    { confidence: 80, count: 12, yes: 8 },
    { confidence: 95, count: 8, yes: 6 },
  ],
  finance: [
    { confidence: 80, count: 9, yes: 4 },
    { confidence: 90, count: 8, yes: 4 },
  ],
  personal: [
    { confidence: 15, count: 5, yes: 1 },
    { confidence: 40, count: 6, yes: 4 },
    { confidence: 70, count: 16, yes: 13 },
  ],
  social: [
    { confidence: 50, count: 8, yes: 4 },
    { confidence: 75, count: 8, yes: 7 },
  ],
};

// No weekday or calendar date in a title: due dates are relative to the
// seeding day, so "by Friday" would show as due on a Tuesday in screenshots.
const TITLES: Record<Category, string[]> = {
  health: [
    'Run three times this week',
    'In bed by 11 every night this week',
    'Hit 8,000 steps today',
    'No caffeine after 2pm all week',
    'Make it to yoga class twice this week',
    'Cook dinner at home four nights',
    'Finish the 5k under 30 minutes',
    'Drink water before coffee every morning',
    'Stretch after every run this week',
    'Skip dessert on weekdays',
  ],
  work: [
    'Ship the onboarding redesign on schedule',
    'Inbox to zero by the end of the week',
    'The client signs off on round one',
    'Finish the quarterly report a day early',
    'Standup stays under 15 minutes all week',
    'Close out the bug backlog for the sprint',
    'Get the conference talk accepted',
    'Review every open pull request this week',
  ],
  finance: [
    'Stay under the grocery budget this month',
    'No takeout this week',
    'The refund arrives within ten days',
    'Move $200 into savings on payday',
    'Cancel two unused subscriptions',
    'Index fund ends the month up',
    'Sell the old bike for at least $150',
  ],
  personal: [
    'Finish the novel before the library due date',
    'Call Grandma this week',
    'Practice guitar four days this week',
    'Clear out the hall closet',
    'Fix the leaky tap myself',
    'Plant the tomatoes before the frost date',
    'Write in the journal five days running',
  ],
  social: [
    'Sam says yes to the hiking trip',
    'Book club picks my suggestion',
    'Dinner with the old team happens this month',
    'Get a reply from Alex within two days',
    'The barbecue gets at least ten people',
    'Make one new friend at the meetup',
  ],
};

/**
 * Open predictions for the Today list: three ready to resolve (enough for Home
 * to offer "Resolve all", roadmap step 18), the rest coming up.
 */
const PENDING: Array<{ category: Category; confidence: number; title: string; dueInDays: number }> =
  [
    { category: 'health', confidence: 40, title: 'Sleep eight hours three nights running', dueInDays: -2 },
    { category: 'work', confidence: 70, title: 'The client demo goes smoothly', dueInDays: -1 },
    { category: 'health', confidence: 55, title: 'Swim twice this week', dueInDays: 0 },
    { category: 'finance', confidence: 85, title: 'Stay under budget on the trip', dueInDays: 2 },
    { category: 'social', confidence: 20, title: 'Jordan comes to the party', dueInDays: 5 },
    { category: 'personal', confidence: 60, title: 'Finish the 1,000-piece puzzle', dueInDays: 9 },
    { category: 'work', confidence: 90, title: 'Promotion review lands this month', dueInDays: 20 },
  ];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Resolved predictions spread over this many days, ending yesterday. */
const SPAN_DAYS = 150;
/** The most recent ones land a day apart, so the demo has a live streak. */
const STREAK_DAYS = 6;

const isIntegrityBonus = (confidence: number) => confidence >= 35 && confidence <= 65;

/** Spread `yes` outcomes evenly through `count` items (no runs of misses). */
function outcomes(count: number, yes: number): boolean[] {
  return Array.from(
    { length: count },
    (_, i) => Math.floor(((i + 1) * yes) / count) > Math.floor((i * yes) / count),
  );
}

/** A small deterministic shuffle so categories interleave across the timeline. */
function mix(i: number): number {
  return (i * 2654435761) % 4294967296;
}

/** An evening time on the day `daysAgo` before `now`, in the device's zone. */
/**
 * How far ahead each demo call was logged, cycled. Spread across every Trends
 * horizon (next day, week, month, further out) so "By how far ahead" has rows.
 */
const LEAD_DAYS: readonly number[] = [1, 3, 5, 7, 1, 10, 14, 4, 30, 6, 45, 2];

function eveningOf(now: Date, daysAgo: number): Date {
  const d = new Date(now.getTime() - daysAgo * DAY_MS);
  d.setHours(19, 0, 0, 0);
  return d;
}

export function buildDemoPredictions(userId: string, now: Date): Prediction[] {
  // Prediction ids are global primary keys on the server, so they carry the user.
  const tag = `demo-${userId.replace(/[^a-z0-9]/gi, '').slice(0, 8)}`;
  const resolved: Array<Omit<Prediction, 'created_at' | 'due_date' | 'resolved_at'>> = [];
  for (const category of Object.keys(PLAN) as Category[]) {
    const titles = TITLES[category];
    let n = 0;
    for (const cell of PLAN[category]) {
      for (const happened of outcomes(cell.count, cell.yes)) {
        resolved.push({
          id: `${tag}-${category}-${n}`,
          user_id: userId,
          title: titles[n % titles.length],
          category,
          confidence: cell.confidence,
          status: happened ? 'resolved_yes' : 'resolved_no',
          reflection: null,
          integrity_bonus: isIntegrityBonus(cell.confidence),
        });
        n += 1;
      }
    }
  }

  const ordered = resolved
    .map((p, i) => ({ p, key: mix(i + 1) }))
    .sort((a, b) => a.key - b.key)
    .map(({ p }) => p);

  const rows: Prediction[] = ordered.map((p, i) => {
    // Oldest first: the bulk spread across SPAN_DAYS, then one a day up to yesterday.
    const fromEnd = ordered.length - i; // 1 for the newest
    const older = ordered.length - STREAK_DAYS;
    const daysAgo =
      fromEnd <= STREAK_DAYS
        ? fromEnd
        : STREAK_DAYS + 1 + Math.round(((older - 1 - i) * (SPAN_DAYS - STREAK_DAYS)) / older);
    const due = eveningOf(now, daysAgo);
    const created = new Date(due.getTime() - LEAD_DAYS[i % LEAD_DAYS.length] * DAY_MS);
    const resolvedAt = new Date(
      Math.min(due.getTime() + (i % 3) * 60 * 60 * 1000, now.getTime()),
    );
    return {
      ...p,
      created_at: created.toISOString(),
      due_date: due.toISOString(),
      resolved_at: resolvedAt.toISOString(),
    };
  });

  PENDING.forEach((item, i) => {
    const due = eveningOf(now, -item.dueInDays);
    rows.push({
      id: `${tag}-pending-${i}`,
      user_id: userId,
      title: item.title,
      category: item.category,
      confidence: item.confidence,
      created_at: new Date(Math.min(due.getTime(), now.getTime()) - 4 * DAY_MS).toISOString(),
      due_date: due.toISOString(),
      status: 'pending',
      resolved_at: null,
      reflection: null,
      integrity_bonus: isIntegrityBonus(item.confidence),
    });
  });

  return rows;
}
