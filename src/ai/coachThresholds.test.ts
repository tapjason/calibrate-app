import { CATEGORIES, MIN_N_BAND, MIN_N_CATEGORY, MIN_N_OVERALL } from '@/types';

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

  it('holds the weekday to the app’s MIN_N_BAND, on both sides', () => {
    expect(patterns.WEEKDAY_MIN_N).toBe(MIN_N_BAND);
    expect(server.WEEKDAY_MIN_N).toBe(MIN_N_BAND);
  });

  it('accepts the same categories, in the same order', () => {
    expect([...server.CATEGORIES]).toEqual([...CATEGORIES]);
  });

  it('names the same pattern kinds', () => {
    expect(server.WEEKDAY_KIND).toBe(patterns.WEEKDAY_KIND);
    expect(server.WEEKDAY_SCORE_KIND).toBe(patterns.WEEKDAY_SCORE_KIND);
    expect(server.WEEKDAY_ANSWERS_KIND).toBe(patterns.WEEKDAY_ANSWERS_KIND);
    expect(server.DRIFT_PREFIX).toBe(patterns.DRIFT_PREFIX);
  });

  it('caps and rounds the same way', () => {
    expect(server.MAX_INSIGHTS).toBe(client.MAX_INSIGHTS);
    expect(server.MAX_MESSAGE_LENGTH).toBe(client.MAX_MESSAGE_LENGTH);
    expect(server.MAX_SUGGESTION_LENGTH).toBe(client.MAX_SUGGESTION_LENGTH);
    expect(server.MAX_LINE_BREAKS).toBe(client.MAX_LINE_BREAKS);
    expect(server.TOLERANCE_ABSOLUTE).toBe(client.TOLERANCE_ABSOLUTE);
    expect(server.TOLERANCE_RATE).toBe(client.TOLERANCE_RATE);
    expect(server.TOLERANCE_EXACT).toBe(client.TOLERANCE_EXACT);
  });

  // The weekday's three and a drift per built-in: everything the app sends.
  it('lets the server take as many patterns as the app can send', () => {
    expect(server.MAX_PATTERNS).toBe(3 + CATEGORIES.length);
    expect(server.MAX_CATEGORIES).toBe(CATEGORIES.length);
  });
});
