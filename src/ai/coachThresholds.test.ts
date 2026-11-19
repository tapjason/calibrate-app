import { closeToSaid as chartCloseToSaid } from '@/components/stats/chartTakeaway';
import { CATEGORIES, MIN_N_CATEGORY, MIN_N_OVERALL } from '@/types';

import * as server from '../../supabase/functions/coach/contract';

import * as patterns from './coachPatterns';
import * as client from './coachValidate';

// The Coach's Edge Function (Deno) keeps its own copies of the gates, the
// limits and the pattern keys; the phone re-checks with these. Copied by
// hand, so a change to one (roadmap D46 moved the category gate to 20) must
// reach the other. The server module is plain TypeScript, so its constants
// are read directly rather than out of its source text.
describe('the Coach function gates on the same counts as the app', () => {
  it('uses the app’s MIN_N_CATEGORY and MIN_N_OVERALL', () => {
    expect(server.MIN_N_CATEGORY).toBe(MIN_N_CATEGORY);
    expect(server.MIN_N_OVERALL).toBe(MIN_N_OVERALL);
  });

  // No figure from fewer than 20 answers (2026-11-19): the weekday held to
  // MIN_N_BAND (10) until then, a drift to 20 answers in all (halves of 10).
  it('holds the weekday and each half of a drift to MIN_N_CATEGORY, on both sides', () => {
    expect(patterns.WEEKDAY_MIN_N).toBe(MIN_N_CATEGORY);
    expect(server.WEEKDAY_MIN_N).toBe(MIN_N_CATEGORY);
    expect(patterns.DRIFT_HALF_MIN_N).toBe(MIN_N_CATEGORY);
    expect(server.DRIFT_HALF_MIN_N).toBe(MIN_N_CATEGORY);
  });

  it('accepts the same categories, in the same order', () => {
    expect([...server.CATEGORIES]).toEqual([...CATEGORIES]);
  });

  it('names the same pattern kinds', () => {
    expect(server.WEEKDAY_KIND).toBe(patterns.WEEKDAY_KIND);
    expect(server.WEEKDAY_SCORE_KIND).toBe(patterns.WEEKDAY_SCORE_KIND);
    expect(server.WEEKDAY_ANSWERS_KIND).toBe(patterns.WEEKDAY_ANSWERS_KIND);
    expect(server.DRIFT_PREFIX).toBe(patterns.DRIFT_PREFIX);
    expect(server.DRIFT_HALF_ANSWERS_PREFIX).toBe(patterns.DRIFT_HALF_ANSWERS_PREFIX);
    // Every check reads the halves' kind before the drift's, which it starts with.
    expect(patterns.DRIFT_HALF_ANSWERS_PREFIX.startsWith(patterns.DRIFT_PREFIX)).toBe(true);
  });

  it('caps and rounds the same way', () => {
    expect(server.MAX_INSIGHTS).toBe(client.MAX_INSIGHTS);
    expect(server.MAX_MESSAGE_LENGTH).toBe(client.MAX_MESSAGE_LENGTH);
    expect(server.MAX_SUGGESTION_LENGTH).toBe(client.MAX_SUGGESTION_LENGTH);
    expect(server.MAX_LINE_BREAKS).toBe(client.MAX_LINE_BREAKS);
    expect(server.TOLERANCE_ABSOLUTE).toBe(client.TOLERANCE_ABSOLUTE);
    expect(server.TOLERANCE_RATE).toBe(client.TOLERANCE_RATE);
    expect(server.TOLERANCE_EXACT).toBe(client.TOLERANCE_EXACT);
    expect(server.TOLERANCE_EPSILON).toBe(client.TOLERANCE_EPSILON);
    expect(server.CLOSE_TO_SAID_POINTS).toBe(client.CLOSE_TO_SAID_POINTS);
  });

  // The weekday's three and, per built-in, a drift and its halves' count:
  // everything the app sends (it was 3 + one drift each until 2026-11-19).
  it('lets the server take as many patterns as the app can send', () => {
    expect(server.MAX_PATTERNS).toBe(3 + 2 * CATEGORIES.length);
    expect(server.MAX_CATEGORIES).toBe(CATEGORIES.length);
  });
});

// Item 2 (2026-11-19): the Coach says "well calibrated" only where the chart
// and the recaps would, by their own helper's rule (roadmap D57). The
// validators can't import it (the server can't, and the app's validator sits
// below the components), so their copies are pinned to it here, rounding
// edges included.
describe('"well calibrated" follows the chart’s closeToSaid', () => {
  const stated = [0, 50, 59.5, 60, 60.4, 60.5, 64.49, 64.5, 75, 80, 100];
  const rates = [0, 0.5, 0.545, 0.55, 0.555, 0.575, 0.6, 0.645, 0.65, 0.7, 0.795, 0.8, 0.85, 1];

  it.each(stated)('agrees with the chart at %p stated, for every rate', (s) => {
    for (const r of rates) {
      const want = chartCloseToSaid(s, r * 100);
      expect([s, r, client.closeToSaid(s, r * 100)]).toEqual([s, r, want]);
      expect([s, r, server.closeToSaid(s, r * 100)]).toEqual([s, r, want]);
    }
  });

  it('is 5 whole points, each side rounded first', () => {
    expect(chartCloseToSaid(75, 79.4)).toBe(true);
    expect(chartCloseToSaid(75, 79.5)).toBe(false);
    expect(client.closeToSaid(75, 0.795 * 100)).toBe(false);
    expect(client.closeToSaid(75, 0.794 * 100)).toBe(true);
  });
});

// Round 6, item 8: without NFKC, both validators check the raw text against
// ALLOWED_CHARACTERS, which is only as strict as NFKC if NFKC leaves every
// allowed character as it is. Every UTF-16 unit the class takes is checked
// (no character outside the Basic Multilingual Plane can match: its two
// surrogates are outside the class).
describe('the characters a Coach card may hold', () => {
  it('are the same on both sides', () => {
    expect(server.ALLOWED_CHARACTERS.source).toBe(client.ALLOWED_CHARACTERS.source);
    expect(server.ALLOWED_CHARACTERS.flags).toBe(client.ALLOWED_CHARACTERS.flags);
  });

  it('are each left unchanged by NFKC, so the check without it is no looser', () => {
    const allowed: string[] = [];
    for (let unit = 0; unit <= 0xffff; unit += 1) {
      const ch = String.fromCharCode(unit);
      if (client.ALLOWED_CHARACTERS.test(ch)) allowed.push(ch);
    }
    // Printable ASCII, the line break, and the 15 typographic marks.
    expect(allowed).toHaveLength(95 + 1 + 15);
    for (const ch of allowed) expect([ch, ch.normalize('NFKC')]).toEqual([ch, ch]);
    // And as a run, so nothing composes with its neighbour.
    const all = allowed.join('');
    expect(all.normalize('NFKC')).toBe(all);
  });
});
