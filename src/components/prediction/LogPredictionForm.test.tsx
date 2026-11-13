import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';

import { holdRanges } from '@/components/ui/holdRanges';
import { space } from '@/constants/theme';
import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import {
  __setPersistenceForTests,
  useSettingsStore,
} from '@/store/settingsStore';
import { __setLogDraftPersistenceForTests, useLogDraftStore, type LogDraft } from '@/store/logDraftStore';
import { useStatsStore } from '@/store/statsStore';
import type { CoverageGap } from '@/engine/coverageNudge';
import type { Prediction } from '@/types';

import { LogPredictionForm } from './LogPredictionForm';

// Refine is CUT from the release (`REFINE_ENABLED = false`), so these tests
// force the flag on. The behavior stays covered while the feature is dormant,
// which is the point of keeping the code rather than deleting it. That the cut
// itself holds is asserted in the companion `*.refineCut.test.tsx` file.
jest.mock('@/constants/app', () => ({
  ...jest.requireActual('@/constants/app'),
  REFINE_ENABLED: true,
}));

// Default mock: refine returns null (Supabase isn't configured under tests).
// Individual tests override this via mockResolvedValueOnce.
jest.mock('@/ai/refine', () => ({
  refinePrediction: jest.fn(async () => null),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { refinePrediction } = require('@/ai/refine') as {
  refinePrediction: jest.Mock;
};

/** A user with no history — never eligible for the coverage nudge. */
let draftStored: LogDraft | null = null;

const NO_GAP: CoverageGap = { logged: 0, buckets_used: 0, low_end_empty: true };

/** A user clustered high for long enough to be nudged. */
const CLUSTERED_HIGH: CoverageGap = {
  logged: 12,
  buckets_used: 1,
  low_end_empty: true,
};

beforeEach(async () => {
  setDbForTests(await createTestDb());
  // In-memory persistence: AsyncStorage isn't available under jest, and the
  // store would otherwise warn on every write it swallows.
  __setPersistenceForTests({
    load: async () => null,
    save: async () => {},
  });
  useAuthStore.getState().reset();
  usePredictionStore.setState({ pending: [], resolved: [] });
  useStatsStore.setState({
    userStat: null,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
    categoryCalibration: {},
    coverageGap: NO_GAP,
  });
  useSettingsStore.setState({
    notificationsEnabled: true,
    aiRefineEnabled: true,
    coverageNudgeLastShownAt: null,
    hydrated: false,
  });
  // Step 173: Log keeps a draft; in memory here.
  draftStored = null;
  __setLogDraftPersistenceForTests({
    load: async () => draftStored,
    save: async (d) => {
      draftStored = d;
    },
  });
  await useAuthStore.getState().initialize();
  refinePrediction.mockReset();
  refinePrediction.mockResolvedValue(null);
});

afterEach(() => {
  setDbForTests(null);
  __setPersistenceForTests(null);
  __setLogDraftPersistenceForTests(null);
});

describe('LogPredictionForm', () => {
  it('creates a prediction with the entered title, category, and confidence', async () => {
    const onSubmitted = jest.fn();
    render(<LogPredictionForm onSubmitted={onSubmitted} />);

    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship the prototype');
    fireEvent.press(screen.getByTestId('category-health'));
    // Unset → 55, a step from the coin flip where the thumb rests (roadmap D49).
    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });

    const p = usePredictionStore.getState().pending[0];
    expect(p.title).toBe('Ship the prototype');
    expect(p.category).toBe('health');
    expect(p.confidence).toBe(55);
    expect(p.integrity_bonus).toBe(true); // 55 is in [35, 65]
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  // Roadmap step 46: the web build answered an empty Save with "title is
  // required" in red, far below the field. Save now waits for a title, and
  // (D13) for a confidence, which starts empty.
  // Roadmap D29: no category is preset, and Save waits for one.
  it('starts with no category and keeps Save disabled until one is chosen', () => {
    render(<LogPredictionForm />);
    const save = () => screen.getByTestId('submit-button');
    for (const c of ['work', 'health', 'finance', 'social', 'personal']) {
      expect(screen.getByTestId(`category-${c}`).props.accessibilityState).toEqual({
        selected: false,
      });
    }
    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship it');
    fireEvent.press(screen.getByTestId('confidence-increment'));
    expect(save().props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('category-work'));
    expect(save().props.accessibilityState).toMatchObject({ disabled: false });
  });

  // Blind playtest 2026-11-01 (run 4): a disabled Save said nothing about why.
  it('says what Save is waiting for once the form is started', () => {
    render(<LogPredictionForm />);
    // An empty form needs no list.
    expect(screen.queryByTestId('log-needs')).toBeNull();

    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship it');
    expect(screen.getByTestId('log-needs')).toHaveTextContent(
      'To save, add a category and a confidence.',
    );
    fireEvent.press(screen.getByTestId('category-work'));
    expect(screen.getByTestId('log-needs')).toHaveTextContent('To save, add a confidence.');
    fireEvent.press(screen.getByTestId('confidence-increment'));
    expect(screen.queryByTestId('log-needs')).toBeNull();
  });

  it('keeps Save disabled until there is a title and a confidence', async () => {
    render(<LogPredictionForm />);
    fireEvent.press(screen.getByTestId('category-work'));
    const save = () => screen.getByTestId('submit-button');
    expect(save().props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(screen.getByTestId('title-field'), '   ');
    expect(save().props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(save());
    expect(screen.queryByTestId('log-error')).toBeNull();
    expect(usePredictionStore.getState().pending).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship it');
    expect(save().props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('confidence-readout')).toHaveTextContent('—%');

    fireEvent.press(screen.getByTestId('confidence-decrement'));
    expect(screen.getByTestId('confidence-readout')).toHaveTextContent('45%');
    expect(save().props.accessibilityState).toMatchObject({ disabled: false });
  });

  // Playtest 2026-11-08b, finding 1: three taps in one frame saved three.
  it('saves once when Save is tapped three times before a render', async () => {
    render(<LogPredictionForm />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship it');
    fireEvent.press(screen.getByTestId('category-work'));
    fireEvent.press(screen.getByTestId('confidence-increment'));
    const save = screen.getByTestId('submit-button');
    await act(async () => {
      fireEvent.press(save);
      fireEvent.press(save);
      fireEvent.press(save);
    });
    await waitFor(() => expect(usePredictionStore.getState().pending).toHaveLength(1));
    await act(async () => {});
    expect(usePredictionStore.getState().pending).toHaveLength(1);
  });

  // Playtest 2026-11-08b, finding 25: a double tap on +5 moved once.
  it('steps twice for two +5 taps before a render', async () => {
    render(<LogPredictionForm />);
    const plus = screen.getByTestId('confidence-increment');
    await act(async () => {
      fireEvent.press(plus);
      fireEvent.press(plus);
    });
    expect(screen.getByTestId('confidence-readout')).toHaveTextContent('60%');
  });

  // Roadmap D23: no chip for any number, before or after one is set.
  it('shows no integrity bonus at any confidence', () => {
    render(<LogPredictionForm />);
    expect(screen.queryByTestId('integrity-bonus')).toBeNull();
    fireEvent.press(screen.getByTestId('confidence-increment')); // 55
    expect(screen.queryByTestId('integrity-bonus')).toBeNull();
    expect(screen.queryByText(/integrity/i)).toBeNull();
  });

  it('says a failed save in words, not the store message', async () => {
    const create = jest
      .spyOn(usePredictionStore.getState(), 'create')
      .mockRejectedValueOnce(new Error('confidence must be an integer between 0 and 100'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<LogPredictionForm />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship it');
    fireEvent.press(screen.getByTestId('category-work'));
    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('log-error')).toHaveTextContent("Couldn't save that. Try again.");
    });
    create.mockRestore();
    warn.mockRestore();
  });

  it('hides the refine button when AI refine is disabled in settings', () => {
    useSettingsStore.setState({ aiRefineEnabled: false });
    render(<LogPredictionForm />);
    expect(screen.queryByTestId('refine-button')).toBeNull();
  });

  it('still saves normally with AI refine disabled', async () => {
    useSettingsStore.setState({ aiRefineEnabled: false });
    render(<LogPredictionForm />);

    fireEvent.changeText(screen.getByTestId('title-field'), 'no refine here');
    fireEvent.press(screen.getByTestId('category-work'));
    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].title).toBe('no refine here');
    expect(refinePrediction).not.toHaveBeenCalled();
  });

  it('hides the refine button until the title has text', () => {
    render(<LogPredictionForm />);
    // No orphaned, disabled pill on the empty default form.
    expect(screen.queryByTestId('refine-button')).toBeNull();
    fireEvent.changeText(screen.getByTestId('title-field'), 'something to refine');
    expect(screen.getByTestId('refine-button')).toBeTruthy();
  });

  it('shows the suggestion when refine returns a rewrite, replaces title on Accept', async () => {
    refinePrediction.mockResolvedValueOnce('Ship 3 priority tasks by Friday');
    render(<LogPredictionForm />);

    fireEvent.changeText(screen.getByTestId('title-field'), "do better at work");
    fireEvent.press(screen.getByTestId('category-work'));
    fireEvent.press(screen.getByTestId('refine-button'));

    await waitFor(() => {
      expect(screen.getByTestId('refine-suggestion')).toBeTruthy();
    });
    expect(screen.getByText('Ship 3 priority tasks by Friday')).toBeTruthy();

    fireEvent.press(screen.getByTestId('refine-accept'));

    // Submit and verify the saved title is the accepted suggestion
    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].title).toBe(
      'Ship 3 priority tasks by Friday',
    );
  });

  it('Dismiss hides the suggestion without changing the title', async () => {
    refinePrediction.mockResolvedValueOnce('Suggested rewrite');
    render(<LogPredictionForm />);

    fireEvent.changeText(screen.getByTestId('title-field'), 'original');
    fireEvent.press(screen.getByTestId('category-work'));
    fireEvent.press(screen.getByTestId('refine-button'));

    await waitFor(() => {
      expect(screen.getByTestId('refine-suggestion')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('refine-dismiss'));

    expect(screen.queryByTestId('refine-suggestion')).toBeNull();

    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].title).toBe('original');
  });

  it('save flow is unaffected when refine returns null', async () => {
    refinePrediction.mockResolvedValueOnce(null);
    render(<LogPredictionForm />);

    fireEvent.changeText(screen.getByTestId('title-field'), 'plain prediction');
    fireEvent.press(screen.getByTestId('category-work'));
    fireEvent.press(screen.getByTestId('refine-button'));

    // wait for refine to settle, then save normally
    await waitFor(() => {
      expect(refinePrediction).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('refine-suggestion')).toBeNull();

    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].title).toBe('plain prediction');
  });

  it('clamps confidence steppers at 0 and 100', async () => {
    render(<LogPredictionForm />);
    // Decrement 11 times from the middle → should clamp at 0, not go negative
    for (let i = 0; i < 11; i++) {
      fireEvent.press(screen.getByTestId('confidence-decrement'));
    }
    // Just verify the slider didn't crash; details checked via store after submit
    fireEvent.changeText(screen.getByTestId('title-field'), 't');
    fireEvent.press(screen.getByTestId('category-work'));
    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].confidence).toBe(0);
  });

  describe('range-coverage nudge', () => {
    it('stays hidden for a user with no history', () => {
      render(<LogPredictionForm />);
      expect(screen.queryByTestId('coverage-nudge')).toBeNull();
    });

    it('appears for a user whose recent logs never touch the low end', async () => {
      useStatsStore.setState({ coverageGap: CLUSTERED_HIGH });
      render(<LogPredictionForm />);

      await waitFor(() => {
        expect(screen.getByTestId('coverage-nudge')).toBeTruthy();
      });
    });

    it('starts the cooldown as soon as it is shown', async () => {
      useStatsStore.setState({ coverageGap: CLUSTERED_HIGH });
      render(<LogPredictionForm />);

      await waitFor(() => {
        expect(
          useSettingsStore.getState().coverageNudgeLastShownAt,
        ).not.toBeNull();
      });
      // Still on screen: marking it shown must not re-hide it mid-session.
      expect(screen.getByTestId('coverage-nudge')).toBeTruthy();
    });

    it('stays hidden while the cooldown is running', () => {
      useStatsStore.setState({ coverageGap: CLUSTERED_HIGH });
      useSettingsStore.setState({
        coverageNudgeLastShownAt: new Date().toISOString(),
      });
      render(<LogPredictionForm />);
      expect(screen.queryByTestId('coverage-nudge')).toBeNull();
    });

    it('pre-sets a low confidence when accepted, and saves it', async () => {
      useStatsStore.setState({ coverageGap: CLUSTERED_HIGH });
      render(<LogPredictionForm />);

      await waitFor(() => {
        expect(screen.getByTestId('coverage-nudge')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('coverage-nudge-accept'));

      expect(screen.queryByTestId('coverage-nudge')).toBeNull();
      fireEvent.changeText(
        screen.getByTestId('title-field'),
        'It will rain on Saturday',
      );
      fireEvent.press(screen.getByTestId('category-personal'));
      fireEvent.press(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(usePredictionStore.getState().pending).toHaveLength(1);
      });
      expect(usePredictionStore.getState().pending[0].confidence).toBe(25);
    });

    it('dismisses without setting a confidence', async () => {
      useStatsStore.setState({ coverageGap: CLUSTERED_HIGH });
      render(<LogPredictionForm />);

      await waitFor(() => {
        expect(screen.getByTestId('coverage-nudge')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('coverage-nudge-dismiss'));

      expect(screen.queryByTestId('coverage-nudge')).toBeNull();
      expect(screen.getByTestId('confidence-readout')).toHaveTextContent('—%');
    });
  });
});

describe('LogPredictionForm - accessibility', () => {
  // VoiceOver users adjust the whole control with a swipe and hear the value,
  // instead of hunting for two buttons called "-5" and "+5".
  it('exposes confidence as one adjustable control', () => {
    render(<LogPredictionForm />);
    const control = screen.getByTestId('confidence-adjustable');
    expect(control.props.accessibilityRole).toBe('adjustable');
    // Nothing preset (roadmap D13); the first swipe steps from the middle.
    expect(control.props.accessibilityValue).toEqual({ min: 0, max: 100, text: 'not set' });

    fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.now).toBe(55);

    fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.now).toBe(45);
  });

  it('announces which category is selected', () => {
    render(<LogPredictionForm />);
    fireEvent.press(screen.getByTestId('category-health'));
    expect(screen.getByTestId('category-health').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('category-work').props.accessibilityState).toEqual({
      selected: false,
    });
  });
});


describe('LogPredictionForm due date', () => {
  it('offers a date picker beyond the three presets', () => {
    render(<LogPredictionForm />);
    expect(screen.queryByTestId('due-picker')).toBeNull();
    fireEvent.press(screen.getByTestId('due-pick'));
    expect(screen.getByTestId('due-picker')).toBeTruthy();
    expect(screen.getByTestId('due-pick').props.accessibilityState.selected).toBe(true);
  });

  it('closes the picker when a preset is chosen', () => {
    render(<LogPredictionForm />);
    fireEvent.press(screen.getByTestId('due-pick'));
    fireEvent.press(screen.getByTestId('due-tomorrow'));
    expect(screen.queryByTestId('due-picker')).toBeNull();
  });

  // Roadmap step 93: "Pick a date" opened with the week's date still in it,
  // and both chips read as chosen.
  it('chooses one chip at a time', () => {
    render(<LogPredictionForm />);
    const chosen = () =>
      ['due-tomorrow', 'due-week', 'due-month', 'due-pick'].filter(
        (id) => screen.getByTestId(id).props.accessibilityState.selected,
      );
    expect(chosen()).toEqual(['due-tomorrow']);
    fireEvent.press(screen.getByTestId('due-pick'));
    expect(chosen()).toEqual(['due-pick']);
    fireEvent.press(screen.getByTestId('due-month'));
    expect(chosen()).toEqual(['due-month']);
  });

  // The tab stays mounted overnight: "Tomorrow" has to follow the calendar.
  it('moves the presets on at midnight, keeping the chosen one chosen', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 6, 23, 59, 0) });
    try {
      render(<LogPredictionForm />);
      fireEvent.press(screen.getByTestId('due-tomorrow'));
      expect(screen.getByTestId('due-sentence')).toHaveTextContent(/Oct 7|7 Oct/);

      act(() => {
        jest.advanceTimersByTime(61_000);
      });
      expect(screen.getByTestId('due-sentence')).toHaveTextContent(/Oct 8|8 Oct/);
      expect(screen.getByTestId('due-tomorrow').props.accessibilityState.selected).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('LogPredictionForm track record (roadmap step 19)', () => {
  const band = (n: number, yes: number) => ({
    low: 60,
    high: 80,
    total_resolved: n,
    resolved_yes: yes,
    stated_confidence_mean: 70,
    actual_rate: yes / n,
    bucket_error: 0,
    direction: 'calibrated' as const,
    chance_low: 0,
    chance_high: 1,
    expected_yes: 0,
  });

  const raise = (steps: number) => {
    for (let i = 0; i < steps; i++) {
      fireEvent(screen.getByTestId('confidence-adjustable'), 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      });
    }
  };

  it("shows the chosen category's record for the chosen band, and follows both", () => {
    useStatsStore.setState({
      calibration: { rating: 80, buckets: [band(52, 30)] },
      categoryCalibration: { finance: { rating: 70, buckets: [band(12, 7)] } },
    });
    render(<LogPredictionForm />);
    // Nothing to say before a confidence is set.
    expect(screen.queryByTestId('track-record')).toBeNull();
    raise(1); // 55%: the 40–60% band, which has no history
    expect(screen.queryByTestId('track-record')).toBeNull();

    raise(3); // 70%
    expect(screen.getByTestId('track-record').props.children).toBe(
      holdRanges('Of your 52 scored calls at 60–80%, 30 happened.'),
    );

    fireEvent.press(screen.getByTestId('category-finance'));
    expect(screen.getByTestId('track-record').props.children).toBe(
      holdRanges('Of your 12 scored finance calls at 60–80%, 7 happened.'),
    );
  });

  it('stays quiet for a new user', () => {
    render(<LogPredictionForm />);
    raise(4);
    expect(screen.queryByTestId('track-record')).toBeNull();
    expect(screen.queryByTestId('track-record-room')).toBeNull();
  });

  // Blind playtest 2026-11-12, finding 9: the line appeared at the first
  // number and pushed the date chips down under the finger.
  it("keeps the line's room once some range could show it", () => {
    useStatsStore.setState({
      calibration: { rating: 80, buckets: [band(52, 30)] },
      categoryCalibration: {},
    });
    render(<LogPredictionForm />);
    const room = screen.getByTestId('track-record-room');
    const height = StyleSheet.flatten(room.props.style).minHeight;
    expect(height).toBeGreaterThan(0);
    raise(4); // 70%: the line takes the room
    expect(screen.queryByTestId('track-record-room')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('track-record').props.style).minHeight).toBe(height);
  });
});

describe('LogPredictionForm — Log it again (roadmap step 22)', () => {
  it('starts from the repeated title, category and date, with no confidence', () => {
    render(
      <LogPredictionForm
        again={{
          sourceId: 'p1',
          title: 'Swim twice this week',
          category: 'health',
          dueIso: '2026-10-11T17:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByTestId('title-field').props.value).toBe('Swim twice this week');
    expect(screen.getByTestId('category-health').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.text).toBe(
      'not set',
    );
  });
});

describe('LogPredictionForm — its own record (roadmap D32)', () => {
  const NBSP = String.fromCharCode(0xa0);
  /** The line as heard: its no-break spaces read as spaces. */
  const pastLine = () =>
    String(screen.getByTestId('past-outcomes').props.children).split(NBSP).join(' ');

  const answered = (
    id: string,
    title: string,
    status: Prediction['status'],
    confidence: number,
  ): Prediction => ({
    id,
    user_id: 'u1',
    title,
    category: 'health',
    confidence,
    created_at: '2026-09-28T10:00:00.000Z',
    due_date: '2026-10-05T12:00:00.000Z',
    status,
    resolved_at: '2026-10-05T19:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
  });

  beforeEach(() => {
    usePredictionStore.setState({
      pending: [],
      resolved: [
        answered('a1', 'Swim twice this week', 'resolved_yes', 90),
        answered('a2', 'Swim twice this week', 'resolved_no', 85),
        answered('a3', 'swim twice this week.', 'resolved_no', 80),
        answered('a4', 'Swim twice this week', 'skipped', 75),
        answered('a5', 'Run three times this week', 'resolved_yes', 70),
      ],
    });
  });

  it('gives the outcomes once the typed title matches answered ones', () => {
    render(<LogPredictionForm />);
    expect(screen.queryByTestId('past-outcomes')).toBeNull();

    // Only the same words: a title on its way there says nothing yet.
    fireEvent.changeText(screen.getByTestId('title-field'), 'Swim twice');
    expect(screen.queryByTestId('past-outcomes')).toBeNull();

    // Case, spaces and end punctuation aside; the skip doesn't count.
    fireEvent.changeText(screen.getByTestId('title-field'), '  SWIM twice  this week! ');
    expect(pastLine()).toBe('Answered 3 times before: happened 1 of 3.');

    fireEvent.changeText(screen.getByTestId('title-field'), 'Swim twice this month');
    expect(screen.queryByTestId('past-outcomes')).toBeNull();
  });

  // The earlier numbers would anchor the new one (step 22's reason too).
  it('never shows an earlier confidence or sets one', () => {
    render(<LogPredictionForm />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'Swim twice this week');
    expect(pastLine()).not.toMatch(/%|90|85|80/);
    expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.text).toBe(
      'not set',
    );
  });

  it('is there from the start when a prediction is logged again', () => {
    render(
      <LogPredictionForm
        again={{
          sourceId: 'a5',
          title: 'Run three times this week',
          category: 'health',
          dueIso: '2026-10-19T17:00:00.000Z',
        }}
      />,
    );
    expect(pastLine()).toBe('Answered once before: it happened.');
  });

  // Through the real store: an answer while Log is open moves the line.
  it('follows the answered list', async () => {
    usePredictionStore.setState({ pending: [], resolved: [] });
    const store = usePredictionStore.getState();
    const first = await store.create({
      title: 'Call Grandma this week',
      category: 'personal',
      confidence: 70,
      due_date: '2026-10-05T12:00:00.000Z',
    });
    const second = await store.create({
      title: 'Call Grandma this week',
      category: 'personal',
      confidence: 70,
      due_date: '2026-10-06T12:00:00.000Z',
    });
    await store.resolve(first.id, 'resolved_no');

    render(<LogPredictionForm />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'Call Grandma this week');
    expect(pastLine()).toBe("Answered once before: it didn't happen.");

    await act(async () => {
      await usePredictionStore.getState().resolve(second.id, 'resolved_yes');
    });
    expect(pastLine()).toBe('Answered twice before: happened 1 of 2.');
  });
});

describe('LogPredictionForm — starter ideas (roadmap step 40)', () => {
  it('offers them for a first prediction, and fills title and category, not confidence', () => {
    render(<LogPredictionForm />);
    fireEvent.press(screen.getByTestId('starter-health'));
    expect(screen.getByTestId('title-field').props.value).toBe(
      "I'll get outside for a walk tomorrow",
    );
    expect(screen.getByTestId('category-health').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.text).toBe(
      'not set',
    );
    // Once there's a title, they step aside.
    expect(screen.queryByTestId('starter-ideas')).toBeNull();
  });

  // Roadmap step 94: a reply "the same day" was due in a week.
  it('sets the due date its title implies', () => {
    render(<LogPredictionForm />);
    fireEvent.press(screen.getByTestId('due-month'));
    fireEvent.press(screen.getByTestId('starter-social'));
    expect(screen.getByTestId('due-tomorrow').props.accessibilityState.selected).toBe(true);
  });

  // D18 (4): the first prediction's result lands on Day 1.
  it('defaults a first prediction to tomorrow', () => {
    render(<LogPredictionForm />);
    expect(screen.getByTestId('due-tomorrow').props.accessibilityState.selected).toBe(true);
  });

  it('never shows them to someone who has logged before', () => {
    usePredictionStore.setState({
      pending: [
        {
          id: 'p0',
          user_id: 'u1',
          title: 'Earlier call',
          category: 'work',
          confidence: 70,
          created_at: '2026-10-01T10:00:00.000Z',
          due_date: '2099-01-01T12:00:00.000Z',
          status: 'pending',
          resolved_at: null,
          reflection: null,
          integrity_bonus: false,
        },
      ],
      resolved: [],
    });
    render(<LogPredictionForm />);
    expect(screen.queryByTestId('starter-ideas')).toBeNull();
  });
});

// Roadmap D55 (blind playtest 2026-11-10, finding 2): "In a week" caught five
// of eight testers who meant tomorrow or a weekday, and at 320 the chips sat
// under the Save bar.
describe('LogPredictionForm due date (roadmap D55)', () => {
  const earlier: Prediction = {
    id: 'p0',
    user_id: 'u1',
    title: 'Earlier call',
    category: 'work',
    confidence: 70,
    created_at: '2026-10-01T10:00:00.000Z',
    due_date: '2099-01-01T12:00:00.000Z',
    status: 'pending',
    resolved_at: null,
    reflection: null,
    integrity_bonus: false,
  };
  const save = () => screen.getByTestId('submit-button');

  it('starts on Tomorrow for someone who has logged before, too', () => {
    usePredictionStore.setState({ pending: [earlier], resolved: [] });
    render(<LogPredictionForm />);
    expect(screen.getByTestId('due-tomorrow').props.accessibilityState.selected).toBe(true);
  });

  it('names the date on Save, in full to VoiceOver', () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 9, 21, 0, 0) }); // Monday
    try {
      render(<LogPredictionForm />);
      expect(save()).toHaveTextContent('Save, due tomorrow');
      expect(save().props.accessibilityLabel).toBe('Save prediction, due tomorrow');

      fireEvent.press(screen.getByTestId('due-week'));
      // The matcher folds the date's no-break spaces into plain ones (dueWords.test checks them).
      expect(save()).toHaveTextContent(/^Save, due Mon,? (Nov 16|16 Nov)$/);
      expect(save().props.accessibilityLabel).toMatch(
        /^Save prediction, due Monday,? (November 16|16 November)$/,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps naming tomorrow after midnight, as the chips move on', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 6, 23, 59, 0) });
    try {
      render(<LogPredictionForm />);
      expect(save()).toHaveTextContent('Save, due tomorrow');
      expect(screen.getByTestId('due-sentence')).toHaveTextContent(/Oct 7|7 Oct/);
      act(() => {
        jest.advanceTimersByTime(61_000);
      });
      expect(save()).toHaveTextContent('Save, due tomorrow');
      // The chips moved on too, not only the store's clamp.
      expect(screen.getByTestId('due-tomorrow').props.accessibilityState.selected).toBe(true);
      expect(screen.getByTestId('due-sentence')).toHaveTextContent(/Oct 8|8 Oct/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts the next one on Tomorrow after a save', async () => {
    usePredictionStore.setState({ pending: [earlier], resolved: [] });
    render(<LogPredictionForm />);
    fireEvent.press(screen.getByTestId('due-month'));
    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship the prototype');
    fireEvent.press(screen.getByTestId('category-health'));
    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(save());
    // Saving reloads the open list from the database, which holds only this one.
    await waitFor(() => {
      expect(usePredictionStore.getState().pending.map((x) => x.title)).toContain('Ship the prototype');
    });
    expect(screen.getByTestId('due-tomorrow').props.accessibilityState.selected).toBe(true);
  });

  it('keeps the date "Log it again" brings', () => {
    const inAWeek = new Date();
    inAWeek.setDate(inAWeek.getDate() + 7);
    inAWeek.setHours(12, 0, 0, 0);
    render(
      <LogPredictionForm
        again={{ sourceId: 'a1', title: 'Swim twice', category: 'health', dueIso: inAWeek.toISOString() }}
      />,
    );
    expect(screen.getByTestId('due-week').props.accessibilityState.selected).toBe(true);
    expect(save()).not.toHaveTextContent('tomorrow');
  });
});

// Blind playtest 2026-11-12e, finding 3: at 320 the slider sat under the
// pinned Save after a category was picked; only "—% not set yet" showed.
describe('bringing the confidence control into view after a category', () => {
  const layOut = (viewport: number) => {
    const scroll = screen.UNSAFE_getByType(ScrollView);
    const scrollTo = jest.fn();
    scroll.instance.scrollTo = scrollTo;
    fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: viewport } } });
    fireEvent(screen.getByTestId('log-confidence-block'), 'layout', {
      nativeEvent: { layout: { y: 400, height: 150 } },
    });
    return scrollTo;
  };

  it('scrolls just far enough when it is under Save', () => {
    render(<LogPredictionForm />);
    const scrollTo = layOut(450);
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('category-health'));
    // Its bottom is at 550; a 450-high view shows 0–450.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 550 - 450 + space.lg }));
  });

  it('checks again when the room changes just after', () => {
    render(<LogPredictionForm />);
    const scrollTo = layOut(600);
    fireEvent.press(screen.getByTestId('category-health'));
    expect(scrollTo).not.toHaveBeenCalled();
    // The still-needed line grows the pinned bar and shortens the view.
    fireEvent(screen.UNSAFE_getByType(ScrollView), 'layout', {
      nativeEvent: { layout: { height: 520 } },
    });
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 550 - 520 + space.lg }));
  });

  it('leaves the scroll alone when it already shows', () => {
    render(<LogPredictionForm />);
    const scrollTo = layOut(700);
    fireEvent.press(screen.getByTestId('category-health'));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves it alone when the person scrolled further down already', () => {
    render(<LogPredictionForm />);
    const scrollTo = layOut(450);
    fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
      nativeEvent: { contentOffset: { y: 200 } },
    });
    fireEvent.press(screen.getByTestId('category-health'));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});


// Step 173 (blind playtest 2026-11-12f, finding 12): a batch stays in the sheet.
describe('LogPredictionForm — Save and log another', () => {
  it('saves, stays open, says so at the top and starts the form over', async () => {
    const onSubmitted = jest.fn();
    render(<LogPredictionForm onSubmitted={onSubmitted} />);
    // Not offered until there's something to save.
    expect(screen.queryByTestId('submit-another')).toBeNull();
    fireEvent.changeText(screen.getByTestId('title-field'), 'Gym tonight');
    fireEvent.press(screen.getByTestId('category-health'));
    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-another'));
    await waitFor(() => expect(usePredictionStore.getState().pending).toHaveLength(1));
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.getByTestId('log-saved-note')).toHaveTextContent('Saved, due tomorrow.');
    expect(screen.getByTestId('title-field').props.value).toBe('');
    expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.text).toBe(
      'not set',
    );
    expect(screen.queryByTestId('submit-another')).toBeNull();
  });
});

// Step 173 (aggregate B11): a half-typed prediction survives an interruption.
describe('LogPredictionForm — the kept draft', () => {
  const kept: LogDraft = {
    title: 'Rain by Friday',
    category: 'work',
    confidence: 60,
    dueIso: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    savedAt: new Date().toISOString(),
  };

  it('keeps what is typed, a moment later', async () => {
    jest.useFakeTimers();
    try {
      render(<LogPredictionForm />);
      fireEvent.changeText(screen.getByTestId('title-field'), 'Call Mum');
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(useLogDraftStore.getState().draft?.title).toBe('Call Mum');
    } finally {
      jest.useRealTimers();
    }
  });

  // Code review 2026-11-12: a write at mount wiped a kept draft, or replaced
  // it with "Log it again"'s words.
  it('writes nothing until something is changed', async () => {
    jest.useFakeTimers();
    try {
      draftStored = kept;
      useLogDraftStore.setState({ draft: kept });
      render(<LogPredictionForm again={{ sourceId: 'p0', title: 'Walk 30 minutes', category: 'health', dueIso: kept.dueIso }} />);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(draftStored).toEqual(kept);
    } finally {
      jest.useRealTimers();
    }
  });

  it('restores it whole, says so, and Start over clears it', async () => {
    render(<LogPredictionForm kept={kept} />);
    expect(screen.getByTestId('title-field').props.value).toBe('Rain by Friday');
    expect(screen.getByTestId('category-work').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.now).toBe(60);
    expect(screen.getByTestId('log-kept')).toHaveTextContent(/^Kept from before you left./);
    fireEvent.press(screen.getByTestId('log-kept-clear'));
    expect(screen.getByTestId('title-field').props.value).toBe('');
    expect(screen.queryByTestId('log-kept')).toBeNull();
    await waitFor(() => expect(draftStored).toBeNull());
  });

  it('clears it on save', async () => {
    const onSubmitted = jest.fn();
    render(<LogPredictionForm kept={kept} onSubmitted={onSubmitted} />);
    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(useLogDraftStore.getState().draft).toBeNull();
  });

  it('drops a category that can no longer be chosen', () => {
    render(<LogPredictionForm kept={{ ...kept, category: 'c-gone' }} />);
    expect(screen.getByTestId('title-field').props.value).toBe('Rain by Friday');
    expect(screen.getByTestId('category-work').props.accessibilityState).toEqual({
      selected: false,
    });
  });
});

// Step 173 (blind playtest 2026-11-12f, finding 13): the starter ideas stay
// while the first words are typed, so the chips don't jump under the thumb.
describe('LogPredictionForm — starter ideas step aside after a category is chosen', () => {
  it('keeps them while typing and on leaving the title, and the category tap takes', () => {
    render(<LogPredictionForm />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'I');
    expect(screen.getByTestId('starter-ideas')).toBeTruthy();
    // Blind playtest 2026-11-13, run 3: leaving the title is the category
    // tap itself, and the jump as they went swallowed it.
    fireEvent(screen.getByTestId('title-field'), 'blur');
    expect(screen.getByTestId('starter-ideas')).toBeTruthy();
    fireEvent.press(screen.getByTestId('category-health'));
    expect(screen.getByTestId('category-health').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.queryByTestId('starter-ideas')).toBeNull();
  });
});

// Blind playtests 2026-11-13 run 5 and 2026-11-13b run 1: opening "Pick a
// date" pushed the "Due …" line out of view behind Save.
describe('bringing the due line into view when Pick a date opens', () => {
  it('scrolls to the end once the date box is laid out, and only then', () => {
    render(<LogPredictionForm />);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    const scrollToEnd = jest.fn();
    scroll.instance.scrollToEnd = scrollToEnd;
    fireEvent(scroll, 'contentSizeChange', 375, 900);
    expect(scrollToEnd).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('due-pick'));
    fireEvent(scroll, 'contentSizeChange', 375, 1000);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    fireEvent(scroll, 'contentSizeChange', 375, 1010);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it("isn't left armed by a tap while the box is already showing (code review 2026-11-13)", () => {
    render(<LogPredictionForm />);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    const scrollToEnd = jest.fn();
    scroll.instance.scrollToEnd = scrollToEnd;
    fireEvent.press(screen.getByTestId('due-pick'));
    fireEvent(scroll, 'contentSizeChange', 375, 1000);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    // A second tap with the box open changes no size; a later, unrelated
    // change (the title growing) mustn't scroll the form to the end.
    fireEvent.press(screen.getByTestId('due-pick'));
    fireEvent(scroll, 'contentSizeChange', 375, 1030);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
  });
});
