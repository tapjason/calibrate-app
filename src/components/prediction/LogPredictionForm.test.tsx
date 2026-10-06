import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import {
  __setPersistenceForTests,
  useSettingsStore,
} from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import type { CoverageGap } from '@/engine/coverageNudge';

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
  await useAuthStore.getState().initialize();
  refinePrediction.mockReset();
  refinePrediction.mockResolvedValue(null);
});

afterEach(() => {
  setDbForTests(null);
  __setPersistenceForTests(null);
});

describe('LogPredictionForm', () => {
  it('creates a prediction with the entered title, category, and confidence', async () => {
    const onSubmitted = jest.fn();
    render(<LogPredictionForm onSubmitted={onSubmitted} />);

    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship the prototype');
    fireEvent.press(screen.getByTestId('category-health'));
    fireEvent.press(screen.getByTestId('confidence-increment')); // unset → 55, from the middle
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
  it('keeps Save disabled until there is a title and a confidence', async () => {
    render(<LogPredictionForm />);
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

  // Roadmap D13: the preset 50% sat in the 35–65% band, so an untouched save
  // earned the integrity bonus. Nothing is shown, or earned, until it's set.
  it('shows no integrity bonus before a confidence is set', () => {
    render(<LogPredictionForm />);
    expect(screen.queryByTestId('integrity-bonus')).toBeNull();
    fireEvent.press(screen.getByTestId('confidence-increment')); // 55
    expect(screen.getByTestId('integrity-bonus')).toBeTruthy();
  });

  it('says a failed save in words, not the store message', async () => {
    const create = jest
      .spyOn(usePredictionStore.getState(), 'create')
      .mockRejectedValueOnce(new Error('confidence must be an integer between 0 and 100'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<LogPredictionForm />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship it');
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
      'Your 60–80% calls: 30 of 52 happened.',
    );

    fireEvent.press(screen.getByTestId('category-finance'));
    expect(screen.getByTestId('track-record').props.children).toBe(
      'Your 60–80% calls in finance: 7 of 12 happened.',
    );
  });

  it('stays quiet for a new user', () => {
    render(<LogPredictionForm />);
    raise(4);
    expect(screen.queryByTestId('track-record')).toBeNull();
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

describe('LogPredictionForm — starter ideas (roadmap step 40)', () => {
  it('offers them for a first prediction, and fills title and category, not confidence', () => {
    render(<LogPredictionForm />);
    fireEvent.press(screen.getByTestId('starter-health'));
    expect(screen.getByTestId('title-field').props.value).toBe(
      "I'll get to the gym twice this week",
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
