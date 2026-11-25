import { fireEvent, render, screen } from '@testing-library/react-native';

import { holdRanges } from '@/components/ui/holdRanges';
import {
  DAILY_GOAL,
  MIN_N_BAND,
  MIN_N_CATEGORY,
  MIN_N_OVERALL,
  REST_DAY_EVERY,
  REST_DAYS_MAX,
  STREAK_CHECKPOINTS,
  STREAK_DAY_MIN,
} from '@/types';

import { badgeRows, scoringSections } from './scoringCopy';
import { ScoringExplainer } from './ScoringExplainer';

const allText = () =>
  scoringSections()
    .flatMap((s) => [s.title, ...s.paragraphs])
    .join('\n');

describe('scoringCopy (roadmap step 29)', () => {
  // The page explains the engine, so it must quote the engine's own numbers.
  it('states the minimums from the shared constants', () => {
    const text = allText();
    expect(text).toContain(`Why it waits for ${MIN_N_OVERALL}`);
    expect(text).toContain(`until ${MIN_N_OVERALL} answers are scored`);
    expect(text).toContain(`until ${MIN_N_CATEGORY} have in that category`);
    expect(text).toContain(`until it holds ${MIN_N_BAND}`);
  });

  // D69 (e): another category close to the due day is counted on Insights,
  // beside a late move and new words, so the page names all three. Round 7:
  // "that close" pointed back at the delete's old window, which is gone, so
  // the window is named.
  it('names every late change Insights counts', () => {
    expect(allText()).toContain(
      'The same goes for a due date moved later, new words or another category, from the day before the due day.',
    );
  });

  // Review round 7 (owner decision 2026-11-19): an open prediction deleted on
  // any day after the day it was logged is counted, not only from the eve;
  // and, on the day it was logged too, one already due (`deletionCounts`). A
  // Can't tell is counted the same way (the owner's list item 20).
  it('says which deletions Insights counts, by the round 7 rule', () => {
    const text = allText();
    expect(text).toContain(
      "If it had a scored answer, or was still open or Can't tell and either logged before the day it was deleted or already due, Insights says how many were, so a deleted miss is still counted.",
    );
    expect(text).not.toContain('was due that day or the next');
  });

  // Review 2026-11-19 (D71 (a)): Erase clears the integrity counts now, so
  // the page no longer claims a miss can never disappear, and says what
  // clears them. Account deletion clears them too (re-review 2026-11-19).
  it('says what clears the counts, and claims no more than it keeps', () => {
    const text = allText();
    expect(text).not.toContain("can't disappear without a trace");
    expect(text).toContain(
      'Only this phone keeps these counts; erasing your data here, deleting your account or deleting the app clears them.',
    );
    expect(text).not.toContain('or deleting the app, clears them');
  });

  // Step 184 (D65), widened in review rounds 6 and 7: the store's rule, in
  // the answered hint's words. Said before the day-logged sentence, which
  // exempts a category fixed on the day a prediction was logged from this
  // count too. "Logged", not "made": new words don't move that day (round 7).
  it('names the moved answers Insights counts, before the slip the day it was logged', () => {
    const sentence =
      'Insights also counts a scored answer that ends up in a different category from the one it had at the end of the day it was logged; a category change made while it was open, that close to the due day, is counted once, as a late change.';
    const slip = "A change on the day a prediction was logged isn't counted while it isn't due yet: that's fixing a slip.";
    const counted = scoringSections()
      .find((s) => s.title === "What doesn't count")
      ?.paragraphs.find((p) => p.includes(sentence));
    expect(counted).toBeDefined();
    expect(counted).toContain(
      `from the day before the due day. ${sentence} ${slip} Only this phone keeps these counts; erasing your data here, deleting your account or deleting the app clears them.`,
    );
    expect(allText()).not.toMatch(/day a prediction was made/);
  });

  // D76: the Warm-up's bridge no longer gives the study's figures, so the
  // page does, where it says what the score measures.
  it('gives the planning study’s figures', () => {
    const measures = scoringSections().find((s) => s.title === 'What the score measures');
    expect(measures?.paragraphs).toContain(
      'People are most overconfident about their own plans. In one study, students who expected to finish a big school project in 34 days took 56.',
    );
  });

  // D76: an answer's details now say only that a category move is counted;
  // the whole rule, as the details said it until then, is here.
  it('keeps the whole category-move rule the answered details used to give', () => {
    const text = allText();
    // A scored answer that ends up elsewhere than at the end of its logged day.
    expect(text).toContain(
      'Insights also counts a scored answer that ends up in a different category from the one it had at the end of the day it was logged',
    );
    // A change while open, from the eve of the due day, counted once as late.
    expect(text).toContain('another category, from the day before the due day');
    expect(text).toContain('a category change made while it was open, that close to the due day, is counted once, as a late change');
    // Never on the day it was logged while it isn't due yet.
    expect(text).toContain("A change on the day a prediction was logged isn't counted while it isn't due yet");
  });

  // Rest days are said under Your streak, where the voice pass sends the
  // streak row's rest-day words (D76).
  it('explains rest days under Your streak', () => {
    const streak = scoringSections().find((s) => s.title === 'Your streak');
    expect(streak?.paragraphs.join(' ')).toMatch(/save a rest day, up to \d+\. A day that doesn't count uses one/);
  });

  // Roadmap D60: badges follow the record both ways, and the page says so
  // (blind playtest 2026-11-13c, finding 16: two testers had to guess).
  it('says a badge can go back', () => {
    expect(allText()).toContain('A badge follows the record both ways');
  });

  // Roadmap D2 and D17: what makes a day count, and the day's goal, from the
  // engine's own constants.
  it('says what a streak day takes, and the goal beside it', () => {
    expect(STREAK_DAY_MIN).toBe(1);
    expect(allText()).toContain('A day counts when you log or answer at least one prediction in it');
    expect(DAILY_GOAL).toBe(3);
    // Spelled out: it starts the sentence (roadmap step 95).
    expect(allText()).toContain('Three a day is the daily goal.');
    expect(allText()).toContain("the streak doesn't need it");
  });

  // Decided 2026-10-07 (roadmap step 87): rest days, from the engine's constants.
  it('says how rest days are saved and spent', () => {
    expect(allText()).toContain(
      `Every ${REST_DAY_EVERY} days that count save a rest day, up to ${REST_DAYS_MAX}.`,
    );
    expect(allText()).toContain('Every 7 days that count save a rest day, up to 2.');
  });

  // Decided 2026-10-06: the checkpoints, from the engine's own list.
  it('names the streak milestones', () => {
    expect(allText()).toContain(
      `The milestones are ${STREAK_CHECKPOINTS.slice(0, -1).join(', ')} and ${STREAK_CHECKPOINTS[STREAK_CHECKPOINTS.length - 1]} days, then every year after that.`,
    );
    expect(allText()).toContain('The milestones are 7, 30, 100 and 365 days');
  });

  // CLAUDE.md §9: practice stays out of the score like the Warmup (step 95).
  it('names the daily practice among what does not count', () => {
    expect(allText()).toContain(
      'And the Warmup and the daily trivia, which are kept apart from your real record.',
    );
  });

  // CLAUDE.md's bucket convention: lower bound inclusive, top band closed.
  it('describes the five bands and their edges as the engine draws them', () => {
    const text = allText();
    expect(text).toContain('0–20%, 20–40%, 40–60%, 60–80% and 80–100%');
    expect(text).toContain('exactly 20% goes in 20–40%, and 100% goes in 80–100%');
  });

  // CLAUDE.md's worked examples: 0.90 vs 0.50 → 60; misses 5, 20, 35 in
  // bands of 20, 10, 20 → a count-weighted 20 → 80 (roadmap D24).
  it("uses CLAUDE.md's worked examples", () => {
    const text = allText();
    expect(text).toContain('a 40-point miss, and a score of 60');
    expect(text).toContain(
      'misses of 5, 20 and 35 points in ranges of 20, 10 and 20 calls, the average miss is 20, so the score is 80',
    );
    expect(text).toContain('with each range counting in proportion to the calls in it');
  });

  // Roadmap D24: one paragraph on the Brier score, with what good looks like.
  it('explains the Brier score in one paragraph', () => {
    const brier = scoringSections().find((s) => s.title === 'The Brier score');
    expect(brier?.paragraphs).toHaveLength(1);
    // Roadmap D35: against the person's own base rate, not always saying 50%.
    expect(brier?.paragraphs[0]).toContain('how often your calls came true');
  });

  // Roadmap D23: no bonus for a number, anywhere in the explanation.
  it('no longer mentions the integrity bonus', () => {
    expect(allText()).not.toMatch(/integrity|bonus|35%/i);
  });

  it('lists the five badges in ladder order with their criteria', () => {
    expect(badgeRows().map((r) => r.label)).toEqual([
      'Getting started',
      'Tracker',
      'Forecaster',
      'Sharp',
      'Oracle',
    ]);
    expect(badgeRows()[2].criteria).toBe('Above 70 at its low end, with 20 or more scored answers');
    expect(badgeRows()[0].criteria).toBe('Fewer than 20 scored here');
  });
});

describe('ScoringExplainer', () => {
  // The way out is ScoringSheet's pinned bar (blind playtest 2026-11-12e,
  // finding 1), tested there.
  it('renders every section and the badge legend, with no × in the scroll', () => {
    render(<ScoringExplainer />);
    for (const section of scoringSections()) {
      expect(screen.getByText(section.title)).toBeTruthy();
    }
    expect(screen.getByTestId('scoring-badge-oracle').props.accessibilityLabel).toBe(
      'Oracle: Above 90 at its low end, with 100 or more scored answers',
    );
    expect(screen.queryByTestId('scoring-close')).toBeNull();
  });

  // Roadmap D27: from Today's identity line the sheet opens at Badges.
  it('reports where the Badges section starts', () => {
    const onSectionLayout = jest.fn();
    render(<ScoringExplainer onSectionLayout={onSectionLayout} />);
    fireEvent(screen.getByTestId('scoring-section-badges'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 840, width: 375, height: 300 } },
    });
    expect(onSectionLayout).toHaveBeenCalledWith('Badges', 840);
  });

  // At 320 and 375pt the list of bands broke "0–" / "20%" (DESIGN_SYSTEM §7.9).
  it('holds every range in the bands paragraph together', () => {
    render(<ScoringExplainer />);
    expect(
      screen.getByText(holdRanges('0–20%, 20–40%, 40–60%, 60–80% and 80–100%'), { exact: false }),
    ).toBeTruthy();
  });

  // Roadmap D60 (c): a tester from a friend's 🟩🟧 read them as Wordle (blind
  // playtest 2026-11-13b, run 5). Their meaning, in the key's own words.
  it('says what the shared squares and the strip mean, and when they come', () => {
    const squares = scoringSections().find((s) => s.title === 'The squares on a shared card');
    const text = squares?.paragraphs.join(' ') ?? '';
    for (const part of ['🟩 no clear lean', '🟧 too sure', '🟦 too cautious', `⬜ a range with fewer than ${MIN_N_BAND}`, "They aren't right and wrong", '▼ too sure', '▲ too cautious']) {
      expect(text).toContain(part);
    }
  });
});
