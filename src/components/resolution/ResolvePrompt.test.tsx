import { AccessibilityInfo, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { haptics } from '@/components/ui/haptics';
import { holdRanges } from '@/components/ui/holdRanges';
import { localDayKey } from '@/components/ui/useLocalDay';
import { setDbForTests } from '@/db/client';
import { getPrediction, insertPrediction, resolvePrediction } from '@/db/predictions';
import { getUserStat } from '@/db/stats';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useRatingStore } from '@/store/ratingStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction } from '@/types';

import {
  bucketLine,
  firstAnswerLine,
  meaningLine,
  ratingChangeLine,
  ResolvePrompt,
  SAME_DAY_LINE,
  SAME_DAY_REWORDED_LINE,
  tierDropLine,
} from './ResolvePrompt';

const USER = 'local-user-v1';

const samplePending = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
  user_id: USER,
  title: 'Ship the prototype',
  category: 'work',
  confidence: 80,
  created_at: '2026-05-01T00:00:00.000Z',
  due_date: '2026-06-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  usePredictionStore.setState({
    pending: [],
    resolved: [],
    streakCheckpoint: null,
    streakCheckpointFrom: null,
  });
  useRatingStore.setState({ moment: false });
  useStatsStore.setState({
    userStat: null,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
  });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
});

describe('ResolvePrompt', () => {
  it('resolves a prediction Yes with reflection, persists, and triggers stats recompute', async () => {
    await insertPrediction(samplePending());

    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);

    // Wait for the load to finish — the title only renders after getPrediction resolves.
    await waitFor(() => {
      expect(screen.getByText('Ship the prototype')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-yes'));

    // The reflection comes after the answer, on the acknowledgement step.
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded')).toBeTruthy();
    });
    expect(onResolved).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('reflection-field'), 'shipped on time');
    fireEvent.press(screen.getByTestId('resolve-done'));

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });

    const updated = await getPrediction('p1');
    expect(updated?.status).toBe('resolved_yes');
    expect(updated?.reflection).toBe('shipped on time');

    const userStat = await getUserStat(USER);
    expect(userStat?.total_resolved).toBe(1);
    expect(userStat?.calibration_rating).toBeGreaterThan(0);
  });

  // DESIGN_SYSTEM rule 0.4: Yes and No look identical; No is never red.
  it('styles Yes and No identically', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);

    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });

    const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
    expect(flat('resolve-no')).toEqual(flat('resolve-yes'));
  });

  it('shows "not found" when the prediction id is unknown', async () => {
    render(<ResolvePrompt predictionId="missing" />);
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeTruthy();
    });
  });

  it('refuses to render a prediction owned by a different user (deep-link safety)', async () => {
    await insertPrediction(samplePending({ user_id: 'someone-else' }));
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeTruthy();
    });
  });

  it('shows the answer details if the prediction is no longer pending', async () => {
    await insertPrediction(samplePending({ status: 'resolved_yes' }));
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('answered-details')).toBeTruthy();
    });
  });
});

// Roadmap D41: an answer the day it was logged isn't scored, and Resolve says so.
describe('ResolvePrompt on a same-day answer', () => {
  // Blind playtest 2026-11-04: finding out only after Yes read as a trick.
  it('says before the answer that an answer today is not scored', async () => {
    await insertPrediction(samplePending({ created_at: new Date().toISOString() }));
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() =>
      expect(screen.getByTestId('resolve-same-day')).toHaveTextContent(/isn’t scored/),
    );
  });

  it('says nothing of the kind for one logged on an earlier day', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByText('Ship the prototype')).toBeTruthy());
    expect(screen.queryByTestId('resolve-same-day')).toBeNull();
  });

  it('says it is not scored instead of the range line, and keeps saying so after a change', async () => {
    await insertPrediction(samplePending({ created_at: new Date().toISOString() }));
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByText('Ship the prototype')).toBeTruthy());

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() =>
      expect(screen.getByTestId('resolve-bucket-line')).toHaveTextContent(SAME_DAY_LINE),
    );
    expect(await getUserStat(USER)).toMatchObject({ total_resolved: 0 });

    fireEvent.press(screen.getByTestId('resolve-change'));
    await waitFor(() =>
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(/didn’t happen/),
    );
    expect(screen.getByTestId('resolve-bucket-line')).toHaveTextContent(SAME_DAY_LINE);
  });
});

// A Can't tell given and answered on the day it was logged is a same-day
// answer like any other (record audit, 2026-11-08).
describe('ResolvePrompt on a skip answered the day it was logged', () => {
  it('is not scored', async () => {
    const now = new Date().toISOString();
    await insertPrediction(
      samplePending({ created_at: now, due_date: now, status: 'skipped', resolved_at: now }),
    );
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-unskip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-unskip'));
    await waitFor(() => expect(screen.getByTestId('resolve-same-day')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() =>
      expect(screen.getByTestId('resolve-bucket-line')).toHaveTextContent(SAME_DAY_LINE),
    );
    expect(await getUserStat(USER)).toMatchObject({ total_resolved: 0 });
  });
});

// Playtest 2026-11-08, finding 38: the screen changed under the finger and
// VoiceOver heard nothing. Yes and No are said the same way.
describe('ResolvePrompt announcements', () => {
  it.each([
    ['resolve-yes', 'Recorded: it happened'],
    ['resolve-no', 'Recorded: it didn’t happen'],
  ])('says what %s recorded', async (button, said) => {
    await insertPrediction(samplePending());
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId(button)).toBeTruthy());
    fireEvent.press(screen.getByTestId(button));
    await waitFor(() => expect(announce).toHaveBeenCalledWith(said));
    announce.mockRestore();
  });

  it("says a Can't tell", async () => {
    await insertPrediction(samplePending());
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<ResolvePrompt predictionId="p1" onResolved={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('resolve-skip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-skip'));
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Recorded: can’t tell.'));
    announce.mockRestore();
  });

  it('says a change of answer', async () => {
    await insertPrediction(samplePending());
    await usePredictionStore.getState().resolve('p1', 'resolved_yes');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_yes" />);
    await waitFor(() => expect(screen.getByTestId('resolve-change')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-change'));
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith('Changed to: it didn’t happen.'),
    );
    announce.mockRestore();
  });

  // Finding 39: the note was only the hint.
  it("reads Can't tell's note in its label", async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-skip')).toBeTruthy());
    expect(screen.getByTestId('resolve-skip').props.accessibilityLabel).toMatch(
      /^Can't tell \/ doesn't apply\. It won't count toward your score\. You can still answer it until the end of \w{3}, \w{3} \d{1,2}\.$/,
    );
  });
});

describe('ResolvePrompt opened from a reminder action', () => {
  // Review 2026-11-09: the answer is recorded before the screen opens, so the
  // rating before it is kept by the reminder's handler (noteRatingBefore).
  it('says how far the rating moved for an answer a reminder recorded', async () => {
    for (let i = 0; i < 24; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 5 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await insertPrediction(samplePending());
    const userId = useAuthStore.getState().userId!;
    await useStatsStore.getState().recomputeForUser(userId);
    const before = Math.round(useStatsStore.getState().userStat!.calibration_rating);
    useStatsStore.getState().noteRatingBefore('p1');
    await usePredictionStore.getState().resolve('p1', 'resolved_no');
    const after = Math.round(useStatsStore.getState().userStat!.calibration_rating);

    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_no" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-answer-note')).toHaveTextContent(ratingChangeLine(before, after));
    });
    expect(useStatsStore.getState().ratingBeforeAnswer).toBeNull();
  });

  it('opens on the recorded answer and does not write again', async () => {
    await insertPrediction(samplePending());
    await usePredictionStore.getState().resolve('p1', 'resolved_yes');
    const recorded = await getPrediction('p1');

    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_yes" />);

    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(
        'Recorded: it happened',
      );
    });
    expect(screen.getByTestId('resolve-bucket-line')).toHaveTextContent(/That's your first/);
    expect(screen.getByTestId('reflection-field')).toBeTruthy();
    expect(screen.queryByText('Did it happen?')).toBeNull();
    expect((await getPrediction('p1'))?.resolved_at).toBe(recorded?.resolved_at);
  });

  it("opens on Didn't the same way", async () => {
    await insertPrediction(samplePending());
    await usePredictionStore.getState().resolve('p1', 'resolved_no');

    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_no" />);

    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(
        'Recorded: it didn’t happen',
      );
    });
  });

  it('does not celebrate an answer the reminder did not record', async () => {
    await insertPrediction(
      samplePending({ status: 'resolved_yes', resolved_at: '2026-06-01T00:00:00.000Z' }),
    );
    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_no" />);
    await waitFor(() => {
      expect(screen.getByTestId('answered-details')).toBeTruthy();
    });
    expect((await getPrediction('p1'))?.status).toBe('resolved_yes');
    expect((await getPrediction('p1'))?.resolved_at).toBe('2026-06-01T00:00:00.000Z');
  });

  it('shows the question when the answer was not actually recorded', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_yes" />);
    await waitFor(() => {
      expect(screen.getByText('Did it happen?')).toBeTruthy();
    });
    expect((await getPrediction('p1'))?.status).toBe('pending');
  });

  it('does not overwrite an answer a reminder recorded while the question was open', async () => {
    await insertPrediction(samplePending());
    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });

    await usePredictionStore.getState().resolve('p1', 'resolved_yes');
    fireEvent.press(screen.getByTestId('resolve-no'));

    await waitFor(() => {
      expect(screen.getByTestId('answered-details')).toBeTruthy();
    });
    expect((await getPrediction('p1'))?.status).toBe('resolved_yes');
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.queryByText('Recorded: it didn’t happen')).toBeNull();
  });

  it('still lets a mis-tap be switched', async () => {
    await insertPrediction(samplePending());
    await usePredictionStore.getState().resolve('p1', 'resolved_yes');
    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_yes" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-change')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-change'));

    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(
        'Recorded: it didn’t happen',
      );
    });
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
    expect(screen.queryByTestId('resolve-skip')).toBeNull();
  });

  it('celebrates a milestone the reminder answer reached', async () => {
    for (let i = 0; i < 19; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 2 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await insertPrediction(samplePending());
    await useStatsStore.getState().recomputeForUser(useAuthStore.getState().userId!);
    useStatsStore.getState().clearMilestone();
    await usePredictionStore.getState().resolve('p1', 'resolved_yes');

    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_yes" />);

    await waitFor(() => {
      expect(screen.getByTestId('milestone-rating_unlocked')).toBeTruthy();
    });
    expect(useStatsStore.getState().milestone).toBeNull();
    expect(useRatingStore.getState().moment).toBe(true);
  });
});

describe('ResolvePrompt layout', () => {
  // Hindsight bias: the stated number is read before the outcome is asked for.
  it('leads with what the user said, then asks the question', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);

    await waitFor(() => {
      expect(screen.getByTestId('resolve-stated')).toBeTruthy();
    });
    expect(screen.getByTestId('resolve-stated')).toHaveTextContent(/you said 80%/);
    expect(screen.getByText('Did it happen?')).toBeTruthy();
  });
});

describe('ResolvePrompt acknowledgement', () => {
  it('teaches what the number means on the first answer ever, Yes or No alike', async () => {
    for (const choice of ['resolve-no', 'resolve-yes']) {
      setDbForTests(await createTestDb());
      usePredictionStore.setState({ pending: [], resolved: [], streakCheckpoint: null });
      useStatsStore.setState({ userStat: null, categoryStats: [], calibration: { rating: 0, buckets: [] } });
      await insertPrediction(samplePending());
      const view = render(<ResolvePrompt predictionId="p1" />);
      await waitFor(() => {
        expect(screen.getByTestId(choice)).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId(choice));

      await waitFor(() => {
        expect(screen.getByTestId('resolve-bucket-line')).toBeTruthy();
      });
      expect(screen.getByText(holdRanges(firstAnswerLine(80)))).toBeTruthy();
      view.unmount();
    }
  });

  it('states the bucket in counts from the second answer on', async () => {
    await insertPrediction(samplePending({ id: 'p0', status: 'resolved_yes', resolved_at: '2026-06-01T00:00:00.000Z', confidence: 40 }));
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-no'));

    await waitFor(() => {
      expect(screen.getByTestId('resolve-bucket-line')).toBeTruthy();
    });
    expect(screen.getByText(holdRanges("That's your first call in the 80–100% range."))).toBeTruthy();
  });

  // Roadmap D50 (blind playtest 2026-11-09b, finding 6).
  it('says what the number means under the range line until the rating unlocks', async () => {
    await insertPrediction(samplePending({ id: 'p0', status: 'resolved_yes', resolved_at: '2026-06-01T00:00:00.000Z', confidence: 40 }));
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-answer-note')).toHaveTextContent(meaningLine(80)!);
    });
  });

  it('says how far the rating moved once it is unlocked, Yes or No alike', async () => {
    for (let i = 0; i < 24; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 5 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await insertPrediction(samplePending());
    const userId = useAuthStore.getState().userId!;
    await useStatsStore.getState().recomputeForUser(userId);
    const before = Math.round(useStatsStore.getState().userStat!.calibration_rating);

    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-answer-note')).toBeTruthy();
    });
    const after = Math.round(useStatsStore.getState().userStat!.calibration_rating);
    expect(screen.getByTestId('resolve-answer-note')).toHaveTextContent(ratingChangeLine(before, after));
  });

  it('finishes without a reflection, leaving it empty', async () => {
    await insertPrediction(samplePending());
    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-done')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-done'));

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
    expect((await getPrediction('p1'))?.reflection).toBeNull();
  });

  it('skips straight through, with no acknowledgement step', async () => {
    await insertPrediction(samplePending());
    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-skip')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-skip'));

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('resolve-recorded')).toBeNull();
  });

  // D10: Skip says what it is and what it costs, so it isn't a free "No".
  it('labels Skip as not counting toward the score', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("Can't tell / doesn't apply")).toBeTruthy();
    });
    // And that it isn't final (D60 (f)): the last day it could be answered.
    expect(screen.getByTestId('resolve-skip-note').props.children).toMatch(
      /^It won't count toward your score\. You can still answer it until /,
    );
  });
});

describe('ResolvePrompt — Log it again (roadmap step 22)', () => {
  it('is offered after an answer when the screen supports it, and saves the reflection first', async () => {
    await insertPrediction(samplePending());
    const onPredictAgain = jest.fn();
    render(<ResolvePrompt predictionId="p1" onPredictAgain={onPredictAgain} />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    // Not before the answer: the question comes first.
    expect(screen.queryByTestId('resolve-again')).toBeNull();

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => expect(screen.getByTestId('resolve-again')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('reflection-field'), 'easier than it looked');
    fireEvent.press(screen.getByTestId('resolve-again'));

    await waitFor(() => expect(onPredictAgain).toHaveBeenCalledTimes(1));
    expect(onPredictAgain.mock.calls[0][0]).toMatchObject({ id: 'p1', title: 'Ship the prototype' });
    expect((await getPrediction('p1'))?.reflection).toBe('easier than it looked');
  });

  it('is not offered without a handler (as inside a run)', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-no')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => expect(screen.getByTestId('resolve-recorded')).toBeTruthy());
    expect(screen.queryByTestId('resolve-again')).toBeNull();
  });
});

// Roadmap step 39: a skip never counted, so it can be taken back.
describe('ResolvePrompt — answering a skipped prediction later', () => {
  it('offers to answer it, and then it counts like any other', async () => {
    // Due yesterday, so inside the week a skip stays open (roadmap D45).
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await insertPrediction(
      samplePending({ status: 'skipped', due_date: yesterday, resolved_at: yesterday }),
    );
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-skipped')).toBeTruthy());
    expect(screen.getByTestId('resolve-skip-open')).toHaveTextContent(/answer it until the end of/);

    fireEvent.press(screen.getByTestId('resolve-unskip'));
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    // Nothing is written until an answer (playtest 2026-11-08b, finding 2).
    expect((await getPrediction('p1'))?.status).toBe('skipped');
    expect(screen.queryByTestId('resolve-skip')).toBeNull();

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => expect(screen.getByTestId('resolve-recorded')).toBeTruthy());
    const answered = await getPrediction('p1');
    expect(answered?.status).toBe('resolved_yes');
    // The answer's own time, not the skip's.
    expect(answered?.resolved_at).not.toBe(yesterday);
  });

  it('leaves the skip as it was when the question is left unanswered', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await insertPrediction(
      samplePending({ status: 'skipped', due_date: yesterday, resolved_at: yesterday }),
    );
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-unskip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-unskip'));
    await waitFor(() => expect(screen.getByTestId('resolve-keep-skip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-keep-skip'));
    await waitFor(() => expect(screen.getByTestId('resolve-skipped')).toBeTruthy());
    const kept = await getPrediction('p1');
    expect(kept?.status).toBe('skipped');
    expect(kept?.resolved_at).toBe(yesterday);
  });

  it('answers a skip in one step only when asked to', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await insertPrediction(
      samplePending({ status: 'skipped', due_date: yesterday, resolved_at: yesterday }),
    );
    // A plain resolve (a reminder's action) leaves a skip alone.
    await usePredictionStore.getState().resolve('p1', 'resolved_no');
    expect((await getPrediction('p1'))?.status).toBe('skipped');
    await usePredictionStore
      .getState()
      .resolve('p1', 'resolved_no', undefined, { answeringSkip: true });
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
  });

  // Roadmap D45: open forever, a bad-looking call could be parked as a skip
  // and only the good ones answered (blind playtest 2026-11-05).
  it('stays Can’t tell more than a week past its due day', async () => {
    await insertPrediction(
      samplePending({
        status: 'skipped',
        due_date: '2026-05-01T12:00:00.000Z',
        resolved_at: '2026-05-20T00:00:00.000Z',
      }),
    );
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-skip-closed')).toBeTruthy());
    expect(screen.queryByTestId('resolve-unskip')).toBeNull();
    // The store holds the line too.
    await expect(
      usePredictionStore.getState().resolve('p1', 'resolved_yes', undefined, { answeringSkip: true }),
    ).rejects.toThrow(/more than a week/);
    expect((await getPrediction('p1'))?.status).toBe('skipped');
  });

  it('still refuses to reopen a Yes or No from here', async () => {
    await insertPrediction(
      samplePending({ status: 'resolved_no', resolved_at: '2026-05-20T00:00:00.000Z' }),
    );
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('answered-details')).toBeTruthy());
    expect(screen.queryByTestId('resolve-unskip')).toBeNull();
    expect(screen.queryByTestId('resolve-yes')).toBeNull();
  });

  // Blind playtest 2026-11-04, third round, run 5: a reload after a mis-tap
  // showed a bare "Already resolved", with no answer named and no way to fix it.
  it('opened again within the day, says what was recorded and can change it', async () => {
    await insertPrediction(
      samplePending({ status: 'resolved_yes', resolved_at: new Date().toISOString() }),
    );
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('answered-details')).toBeTruthy());
    expect(screen.queryByText('Already answered')).toBeNull();
    expect(screen.getByTestId('answered-outcome')).toHaveTextContent(/^It happened/);
    fireEvent.press(screen.getByTestId('answered-switch'));
    await waitFor(async () => expect((await getPrediction('p1'))?.status).toBe('resolved_no'));
  });
});

describe('bucketLine', () => {
  it('counts what has happened in the range', () => {
    expect(
      bucketLine({
        low: 60,
        high: 80,
        total_resolved: 9,
        resolved_yes: 6,
        stated_confidence_mean: 70,
        actual_rate: 6 / 9,
        bucket_error: 0.03,
        direction: 'calibrated',
        chance_low: 0,
        chance_high: 1,
        expected_yes: 0,
      }),
    ).toBe('In your 60–80% range, 6 of 9 have happened.');
  });

  it('agrees with a single one that happened', () => {
    expect(
      bucketLine({
        low: 60,
        high: 80,
        total_resolved: 2,
        resolved_yes: 1,
        stated_confidence_mean: 65,
        actual_rate: 0.5,
        bucket_error: 0.15,
        direction: 'overconfident',
        chance_low: 0,
        chance_high: 1,
        expected_yes: 0,
      }),
    ).toBe('In your 60–80% range, 1 of 2 has happened.');
  });

  // Roadmap step 58: from 10 answered, the range's said-against-happened.
  it('sets what happened against what was said once the range holds 10', () => {
    expect(
      bucketLine({
        low: 40,
        high: 60,
        total_resolved: 25,
        resolved_yes: 13,
        stated_confidence_mean: 47.6,
        actual_rate: 13 / 25,
        bucket_error: 0.044,
        direction: 'calibrated',
        chance_low: 0,
        chance_high: 1,
        expected_yes: 0,
      }),
    ).toBe(
      "In your 40–60% range, 13 of 25 have happened. That's 52%, against the 48% you said on average.",
    );
  });
});

describe('ResolvePrompt milestones', () => {
  it('celebrates the resolution that unlocks the score, once', async () => {
    // 19 already resolved: the next answer is the 20th.
    for (let i = 0; i < 19; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 2 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await insertPrediction(samplePending());
    const userId = useAuthStore.getState().userId!;
    await useStatsStore.getState().recomputeForUser(userId);

    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-yes'));

    await waitFor(() => {
      expect(screen.getByTestId('milestone-rating_unlocked')).toBeTruthy();
    });
    // The unlock is spoken with its number, a moment after "Recorded" (the
    // number is drawn on the card, not written in its title).
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Recorded: it happened\. Your calibration score is unlocked: \d+ out of 100\./,
        ),
      ),
    );
    expect(screen.getByTestId('milestone-rating_unlocked').props.accessibilityLabel).toMatch(
      /^Your calibration score is unlocked: \d+ out of 100\. 20 scored answers\./,
    );
    // Answered while provisional, so it keeps what the number means (blind
    // playtest 2026-11-12e, run 5: a miss here had neither D50 line).
    expect(screen.getByTestId('resolve-answer-note')).toHaveTextContent(
      meaningLine(samplePending().confidence)!,
    );
    // Consumed: nothing left for the next screen to replay.
    expect(useStatsStore.getState().milestone).toBeNull();
    // The unlock may earn a rating ask, on Today after the sheet closes (D15).
    expect(useRatingStore.getState().moment).toBe(true);

    // A correction keeps the line: it says nothing about the outcome (code
    // review 2026-11-12). And it says the rating follows the answer: the
    // card, with the rating on it, has just gone (D63; both round-2 reviews).
    await waitFor(() => expect(screen.getByTestId('resolve-change')).toBeEnabled());
    fireEvent.press(screen.getByTestId('resolve-change'));
    const corrected = 'Your rating and badges now follow this answer, so they may have moved.';
    await waitFor(() => {
      expect(screen.getByTestId('resolve-answer-note')).toHaveTextContent(
        `${meaningLine(samplePending().confidence)!} ${corrected}`,
      );
    });
    expect(screen.queryByTestId('milestone-rating_unlocked')).toBeNull();
    expect(announce).toHaveBeenCalledWith(`Changed to: it didn’t happen. ${corrected}`);

    // Switched back, the line is there once, not twice.
    await waitFor(() => expect(screen.getByTestId('resolve-change')).toBeEnabled());
    fireEvent.press(screen.getByTestId('resolve-change'));
    await waitFor(() =>
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent('Recorded: it happened'),
    );
    expect(screen.getByTestId('resolve-answer-note')).toHaveTextContent(
      `${meaningLine(samplePending().confidence)!} ${corrected}`,
    );
    announce.mockRestore();
  });

  // Code review, round 2: the badge news is spoken 600 ms after the answer.
  // Leaving the card first (Next in a run, the sheet closing) must drop it.
  it('does not speak badge news after the card has gone', async () => {
    for (let i = 0; i < 19; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 2 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await insertPrediction(samplePending());
    await useStatsStore.getState().recomputeForUser(useAuthStore.getState().userId!);

    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const view = render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => expect(screen.getByTestId('milestone-rating_unlocked')).toBeTruthy());
    view.unmount();
    await new Promise((r) => setTimeout(r, 800));
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('is unlocked'));
    announce.mockRestore();
  });

  it('shows no celebration for an ordinary answer', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded')).toBeTruthy();
    });
    expect(screen.queryByTestId(/^milestone-/)).toBeNull();
  });
});

// Decided 2026-10-06: streak checkpoints at 7, 30, 100 and 365 days. Since
// step 194 the card plays the checkpoint's moment, once.
describe('ResolvePrompt streak checkpoints', () => {
  // The day the moment last played lives in the settings: in memory here.
  beforeEach(() => {
    let stored: object | null = null;
    __setPersistenceForTests({
      load: async () => stored,
      save: async (s) => {
        stored = s;
      },
    });
  });
  afterEach(() => {
    __setPersistenceForTests(null);
    jest.restoreAllMocks();
  });

  /**
   * Local noon `back` calendar days ago, or now for today. Subtracting 24h
   * steps could skip or merge a local day near midnight or across DST.
   */
  const daysAgo = (back: number): string => {
    if (back === 0) return new Date().toISOString();
    const d = new Date();
    d.setDate(d.getDate() - back);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };
  /**
   * Six counted days before today and nothing yet today: the next answer
   * makes seven (one a day since D17; it was two logged today and a third).
   */
  const sixDaysThenToday = async () => {
    for (let back = 6; back >= 1; back -= 1) {
      for (let i = 0; i < 1; i += 1) {
        await insertPrediction(
          samplePending({
            id: `d${back}-${i}`,
            created_at: daysAgo(back),
          }),
        );
      }
    }
    await insertPrediction(samplePending());
    await usePredictionStore.getState().loadPending();
  };

  it('names the checkpoint the answer reached, and plays its moment once', async () => {
    const checkpoint = jest.spyOn(haptics, 'checkpoint');
    await sixDaysThenToday();
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-no')).toBeEnabled());
    fireEvent.press(screen.getByTestId('resolve-no'));

    await waitFor(() => {
      expect(screen.getByTestId('streak-checkpoint')).toBeTruthy();
    });
    expect(screen.getByTestId('streak-checkpoint').props.accessibilityLabel).toBe(
      '7-day streak. A full week. Next milestone: 30\u00A0days.',
    );
    expect(screen.queryByTestId(/^milestone-/)).toBeNull();
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
    // The Rigid tap at 7 (not a major one), as the card lands; marked played today.
    await waitFor(() => {
      expect(checkpoint).toHaveBeenCalledTimes(1);
    });
    expect(checkpoint).toHaveBeenCalledWith(false);
    expect(useSettingsStore.getState().streakMomentDay).toBe(localDayKey(new Date()));
  });

  it('shows it still once the moment has played today, as after a relaunch', async () => {
    useSettingsStore.setState({ streakMomentDay: localDayKey(new Date()) });
    const checkpoint = jest.spyOn(haptics, 'checkpoint');
    await sixDaysThenToday();
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-no')).toBeEnabled());
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('streak-checkpoint')).toBeTruthy();
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it('plays nothing, and shows no card, while the streak is hidden in You', async () => {
    useSettingsStore.setState({ streakShown: false });
    const checkpoint = jest.spyOn(haptics, 'checkpoint');
    await sixDaysThenToday();
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeEnabled());
    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded')).toBeTruthy();
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByTestId('streak-checkpoint')).toBeNull();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
  });

  // A log's checkpoint is Today's to show, not this answer's.
  it('leaves a checkpoint a log reached for Today', async () => {
    await insertPrediction(samplePending());
    usePredictionStore.setState({ streakCheckpoint: 7, streakCheckpointFrom: 'log' });
    await useStatsStore.getState().recomputeForUser(useAuthStore.getState().userId!);
    await usePredictionStore.getState().resolve('p1', 'resolved_no');
    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_no" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded')).toBeTruthy();
    });
    expect(screen.queryByTestId('streak-checkpoint')).toBeNull();
    // Still there for Today.
    expect(usePredictionStore.getState()).toMatchObject({
      streakCheckpoint: 7,
      streakCheckpointFrom: 'log',
    });
  });

  it('names the checkpoint when the reminder action earned it', async () => {
    await sixDaysThenToday();
    await usePredictionStore.getState().resolve('p1', 'resolved_no');
    render(<ResolvePrompt predictionId="p1" recordedAnswer="resolved_no" />);

    await waitFor(() => {
      expect(screen.getByTestId('streak-checkpoint')).toBeTruthy();
    });
    expect(screen.getByTestId('streak-checkpoint').props.accessibilityLabel).toBe(
      '7-day streak. A full week. Next milestone: 30\u00A0days.',
    );
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
  });

  // CLAUDE.md: the day a streak reaches a checkpoint is named on the answer
  // that earned it. It used to give way to a score or badge milestone.
  it('names the checkpoint beside a milestone the same answer reached', async () => {
    await sixDaysThenToday();
    // 19 answered long ago: this answer is also the 20th, which unlocks the score.
    for (let i = 0; i < 19; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 2 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await useStatsStore.getState().recomputeForUser(useAuthStore.getState().userId!);

    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-yes'));

    await waitFor(() => {
      expect(screen.getByTestId('milestone-rating_unlocked')).toBeTruthy();
    });
    expect(screen.getByTestId('streak-checkpoint')).toBeTruthy();
  });

  // Step 194: one full moment per answer. The unlock plays; the checkpoint
  // shows still, with no haptic or confetti of its own.
  it('shows the checkpoint still when the same answer unlocks the rating', async () => {
    const unlock = jest.spyOn(haptics, 'unlock');
    const checkpoint = jest.spyOn(haptics, 'checkpoint');
    await sixDaysThenToday();
    for (let i = 0; i < 19; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 2 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await useStatsStore.getState().recomputeForUser(useAuthStore.getState().userId!);

    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeEnabled());
    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('milestone-rating_unlocked')).toBeTruthy();
    });
    await waitFor(() => {
      expect(unlock).toHaveBeenCalledTimes(1);
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(checkpoint).not.toHaveBeenCalled();
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId('streak-checkpoint-confetti', { includeHiddenElements: true }),
    ).toBeNull();
    // Not marked: the checkpoint's own moment hasn't played.
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
  });

  it('shows nothing for an answer that reached no checkpoint', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded')).toBeTruthy();
    });
    expect(screen.queryByTestId('streak-checkpoint')).toBeNull();
  });
});

describe('ResolvePrompt recorded label', () => {
  it('says which answer was recorded, in words', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(
        'Recorded: it didn’t happen',
      );
    });
  });
});

describe('ResolvePrompt change answer', () => {
  it('lets a mis-tap be undone and answered again', async () => {
    await insertPrediction(samplePending());
    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-change')).toBeTruthy();
    });
    // Roadmap D34: it switches in place, never back to open, where "Can't
    // tell" could park the miss.
    expect(screen.getByTestId('resolve-change')).toHaveTextContent('Change to: it happened');
    fireEvent.press(screen.getByTestId('resolve-change'));

    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(
        'Recorded: it happened',
      );
    });
    expect(screen.queryByTestId('resolve-skip')).toBeNull();
    const after = await getPrediction('p1');
    expect(after?.status).toBe('resolved_yes');
    expect(after?.resolved_at).not.toBeNull();
    expect(screen.getByTestId('resolve-change')).toHaveTextContent('Change to: it didn’t happen');
    expect(onResolved).not.toHaveBeenCalled();
  });

  // Record audit 2026-11-09: both answers' effect on one screen made a false
  // outcome a one-tap comparison, so a correction drops the rating line.
  it('drops the rating line after a correction', async () => {
    for (let i = 0; i < 24; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 5 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await insertPrediction(samplePending());
    const userId = useAuthStore.getState().userId!;
    await useStatsStore.getState().recomputeForUser(userId);
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-no')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => expect(screen.getByTestId('resolve-answer-note')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-change'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent('Recorded: it happened');
    });
    // No rating figures after a correction (D50), only that they follow it
    // (D63: a badge earned on a mis-tap went back with no word).
    expect(screen.getByTestId('resolve-answer-note')).toHaveTextContent(
      'Your rating and badges now follow this answer, so they may have moved.',
    );
    expect(screen.getByTestId('resolve-answer-note')).not.toHaveTextContent(/moved from/);
  });
});

describe('ResolvePrompt reflection draft', () => {
  it('reports the unsaved reflection, and keeps it when the answer is changed', async () => {
    await insertPrediction(samplePending());
    const onDraftChange = jest.fn();
    render(<ResolvePrompt predictionId="p1" onDraftChange={onDraftChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('reflection-field')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('reflection-field'), 'lucky timing');
    expect(onDraftChange).toHaveBeenLastCalledWith('lucky timing');

    fireEvent.press(screen.getByTestId('resolve-change'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(/^Recorded: it didn/);
    });
    expect(onDraftChange).toHaveBeenLastCalledWith('lucky timing');
  });
});

// Roadmap D18, refined 2026-10-09: the first answer ever teaches what the
// number means, the same for Yes and No.
describe('firstAnswerLine', () => {
  it('says what the stated number means in tens', () => {
    expect(firstAnswerLine(70)).toBe(
      "That's your first. A 70% call should come true about 7 times in\u00A010, so one answer can't say much; 20 can.",
    );
    expect(firstAnswerLine(10)).toMatch(/about 1 time in\s10/);
  });

  it('handles the ends of the scale', () => {
    expect(firstAnswerLine(100)).toMatch(/A 100% call should always come true/);
    expect(firstAnswerLine(0)).toMatch(/A 0% call should never come true/);
    expect(firstAnswerLine(97)).toMatch(/almost every time/);
    expect(firstAnswerLine(3)).toMatch(/less than once in\s10/);
    // The slider's words, and the article said aloud (playtest 2026-11-04, third round).
    expect(firstAnswerLine(85)).toMatch(/^That's your first\. An 85% call should come true 8 or 9 times in\s10,/);
    expect(firstAnswerLine(8)).toMatch(/An 8% call/);
    expect(firstAnswerLine(18)).toMatch(/An 18% call/);
    expect(firstAnswerLine(80)).toMatch(/An 80% call should come true about 8 times in\s10/);
    expect(firstAnswerLine(70)).toMatch(/A 70% call/);
    expect(firstAnswerLine(50)).toMatch(/A 50% call should come true half the time/);
  });
});

describe('meaningLine and ratingChangeLine (roadmap D50)', () => {
  it('says what the number means, both ways at once', () => {
    expect(meaningLine(70)).toBe(
      "A 70% call should come true about 7 times in\u00A010: one that doesn't isn't a mistake, and one that does isn't proof.",
    );
    expect(meaningLine(80)).toMatch(/^An 80% call/);
    expect(meaningLine(100)).toBeNull();
    expect(meaningLine(0)).toBeNull();
  });

  it('names the move, or that there was none', () => {
    expect(ratingChangeLine(91, 89)).toMatch(/^Your rating moved from 91 to 89\. /);
    expect(ratingChangeLine(88, 89)).toMatch(/^Your rating moved from 88 to 89\. /);
    expect(ratingChangeLine(89, 89)).toMatch(/^Your rating stays at 89\. /);
  });

  // Blind playtest 2026-11-13b, run 3: in Answer all the why came three times.
  it('gives the move alone once a run has said why', () => {
    expect(ratingChangeLine(87, 88, false)).toBe('Your rating moved from 87 to 88.');
    expect(ratingChangeLine(88, 88, false)).toBe('Your rating stays at 88.');
  });
});

// Roadmap D56 (blind playtest 2026-11-10, run 2): a daily walk logged in the
// morning was "not scored" three times per tick, and "Log it again" sat under
// the after-answer line with nothing tying the two together.
describe('ResolvePrompt — the same-day rule said once (roadmap D56)', () => {
  const today = () => new Date().toISOString();
  const tomorrowNoon = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };
  type Drawn = { type: unknown; props: Record<string, unknown> };
  /** testIDs in the order they're drawn. */
  const order = (...ids: string[]) =>
    screen.UNSAFE_root
      .findAll((n: Drawn) => typeof n.type === 'string' && ids.includes(n.props.testID as string))
      .map((n: Drawn) => n.props.testID as string);

  it('skips the note before Yes and No only when Answer it now just said it', async () => {
    await insertPrediction(samplePending({ created_at: today(), due_date: tomorrowNoon() }));
    const first = render(<ResolvePrompt predictionId="p1" sameDayWarned />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    expect(screen.queryByTestId('resolve-same-day')).toBeNull();
    first.unmount();

    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    expect(screen.getByTestId('resolve-same-day')).toBeTruthy();
  });

  it.each(['resolve-yes', 'resolve-no'])(
    'after %s, puts the advice and "Log it again" with its date together, the same either way',
    async (button) => {
      await insertPrediction(samplePending({ created_at: today(), due_date: tomorrowNoon() }));
      render(<ResolvePrompt predictionId="p1" onPredictAgain={jest.fn()} sameDayWarned />);
      await waitFor(() => expect(screen.getByTestId(button)).toBeTruthy());
      fireEvent.press(screen.getByTestId(button));
      await waitFor(() =>
        expect(screen.getByTestId('resolve-bucket-line')).toHaveTextContent(SAME_DAY_LINE),
      );
      expect(SAME_DAY_LINE).toBe(
        'Not scored: you logged it today. Log the next one now, and its answer is scored from tomorrow.',
      );
      expect(screen.getByTestId('resolve-again')).toHaveTextContent('Log it again, due tomorrow');
      expect(screen.getByTestId('resolve-again').props.accessibilityLabel).toBe(
        'Log it again, due tomorrow',
      );
      // Right under the advice, above Done.
      expect(order('resolve-bucket-line', 'resolve-again', 'resolve-done')).toEqual([
        'resolve-bucket-line',
        'resolve-again',
        'resolve-done',
      ]);
    },
  );

  it('keeps "Log it again" under Done after an answer on a later day', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" onPredictAgain={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => expect(screen.getByTestId('resolve-again')).toBeTruthy());
    expect(order('resolve-again', 'resolve-done')).toEqual(['resolve-done', 'resolve-again']);
  });

  it('says the words changed today, not that it was logged, after a rewording', async () => {
    await insertPrediction(
      samplePending({ title_edited_at: today(), due_date: tomorrowNoon() }),
    );
    render(<ResolvePrompt predictionId="p1" onPredictAgain={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() =>
      expect(screen.getByTestId('resolve-bucket-line')).toHaveTextContent(SAME_DAY_REWORDED_LINE),
    );
  });
});

// Roadmap D56 / CLAUDE.md: with the same words already open, Resolve says so
// instead of offering a second copy, as History does (code and record review
// 2026-11-10: a habit could be stacked twice for one day).
describe('ResolvePrompt — Logged again', () => {
  it('names the open repeat in place of the button', async () => {
    await insertPrediction(samplePending());
    const due = new Date();
    due.setDate(due.getDate() + 2);
    due.setHours(12, 0, 0, 0);
    // In the database too: answering reloads the open list from it.
    await insertPrediction(
      samplePending({ id: 'p2', title: 'ship the prototype', due_date: due.toISOString() }),
    );
    await usePredictionStore.getState().loadPending();
    render(<ResolvePrompt predictionId="p1" onPredictAgain={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => expect(screen.getByTestId('resolve-logged-again')).toBeTruthy());
    expect(screen.getByTestId('resolve-logged-again')).toHaveTextContent(/^Logged again, due \w+\.$/);
    expect(screen.queryByTestId('resolve-again')).toBeNull();
  });
});

// Roadmap D60 (a): an answer that takes a badge back says so, the same after
// Yes and No (blind playtest 2026-11-13b, run 7).
describe('ResolvePrompt — a badge taken back', () => {
  const drop = { category: 'health' as const, from: 'forecaster' as const, to: 'tracker' as const };

  it('words the drop by the bar its low end fell under', () => {
    expect(tierDropLine(drop)).toBe(
      "Back to Tracker in health: after this answer its score's low end is no longer above Forecaster's 70. A badge follows the record both ways.",
    );
  });

  it.each(['resolve-yes', 'resolve-no'])('shows it after %s, and not after a correction', async (button) => {
    await insertPrediction(samplePending({ category: 'health' }));
    const real = useStatsStore.getState().recomputeForUser;
    useStatsStore.setState({
      recomputeForUser: async (userId: string) => {
        await real(userId);
        useStatsStore.setState({ tierDrop: drop });
      },
    });
    try {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      render(<ResolvePrompt predictionId="p1" />);
      // Generous waits: the real recompute bootstraps the record, and under
      // the full suite's load it ran past the 1 s default (a flake noted in
      // HANDOFF since step 179; it failed twice running in round 23's check).
      await waitFor(() => expect(screen.getByTestId(button)).toBeTruthy(), { timeout: 5000 });
      fireEvent.press(screen.getByTestId(button));
      await waitFor(() => expect(screen.getByTestId('resolve-tier-drop')).toBeTruthy(), {
        timeout: 5000,
      });
      expect(screen.getByTestId('resolve-tier-drop')).toHaveTextContent(tierDropLine(drop));
      // Spoken with "Recorded", as a badge gained is (step 181): iOS ignores
      // live regions, so VoiceOver heard neither.
      // A moment after the answer, once the focus has moved.
      await waitFor(() =>
        expect(announce).toHaveBeenCalledWith(
          expect.stringMatching(/^Recorded: it (happened|didn’t happen)\. Back to Tracker in health: /),
        ),
      );
      announce.mockRestore();
      // The other answer's effect on one screen would be a one-tap comparison.
      // Once the button takes a press: it's disabled until the answer has
      // finished saving, and a press before that was ignored under the full
      // suite's load, which is what made this test fail one run in five.
      await waitFor(() => expect(screen.getByTestId('resolve-change')).toBeEnabled());
      fireEvent.press(screen.getByTestId('resolve-change'));
      await waitFor(() => expect(screen.queryByTestId('resolve-tier-drop')).toBeNull(), {
        timeout: 5000,
      });
    } finally {
      useStatsStore.setState({ recomputeForUser: real, tierDrop: null });
    }
  }, 20000);
});

// Roadmap D60 (f): answered after its due day, the day it was about (blind
// playtest 2026-11-13b, run 7).
describe('ResolvePrompt — answered late', () => {
  it('says when it was due once that day has passed', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-stated')).toBeTruthy());
    expect(screen.getByTestId('resolve-stated')).toHaveTextContent(/you said 80%\. It was due /);
  });

  it('says nothing more on the due day itself', async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    await insertPrediction(samplePending({ due_date: today.toISOString() }));
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-stated')).toBeTruthy());
    expect(screen.getByTestId('resolve-stated')).not.toHaveTextContent(/was due/);
  });
});

// Security review, 2026-11-18: once `resolve` has saved the answer, a read of
// the row after it that fails showed an error, which invited answering again.
// The answer is shown from what is known, and nothing that read would back.
describe('ResolvePrompt — the read after a saved answer fails', () => {
  // The store's own read, put back after each test: setState keeps a
  // replaced action across tests.
  const realGetById = usePredictionStore.getState().getById;
  afterEach(() => usePredictionStore.setState({ getById: realGetById }));

  /** Load as usual, then make every later read of the row fail. */
  function failReadsAfterLoad() {
    const real = realGetById;
    const getById = jest.fn(async (id: string) => {
      if (getById.mock.calls.length === 1) return real(id);
      throw new Error('disk I/O error');
    });
    usePredictionStore.setState({ getById });
    return getById;
  }

  it.each([
    ['resolve-yes', 'resolved_yes', 'Recorded: it happened'],
    ['resolve-no', 'resolved_no', 'Recorded: it didn’t happen'],
  ] as const)(
    'shows %s as recorded, never the error, and claims nothing the read would back',
    async (button, status, label) => {
      await insertPrediction(samplePending());
      const getById = failReadsAfterLoad();
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      const resolveHaptic = jest.spyOn(haptics, 'resolve');
      const onAnswered = jest.fn();
      try {
        render(<ResolvePrompt predictionId="p1" onAnswered={onAnswered} />);
        await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeEnabled());

        fireEvent.press(screen.getByTestId(button));

        expect(await screen.findByTestId('resolve-recorded')).toBeTruthy();
        expect(getById).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(label);
        expect(screen.queryByText('disk I/O error')).toBeNull();
        // Nothing from the read that failed: no range line, no rating move.
        expect(screen.queryByTestId('resolve-bucket-line')).toBeNull();
        expect(screen.queryByTestId('resolve-answer-note')).toBeNull();
        expect(screen.queryByTestId('resolve-tier-drop')).toBeNull();
        // The same acknowledgement as any answer: the haptic, and it is said.
        expect(resolveHaptic).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledWith(label);
        expect(onAnswered).toHaveBeenCalledTimes(1);
        // And the answer is saved.
        expect((await getPrediction('p1'))?.status).toBe(status);
        // Done still finishes, and a reflection still saves.
        expect(screen.getByTestId('resolve-done')).toBeEnabled();
      } finally {
        announce.mockRestore();
        resolveHaptic.mockRestore();
      }
    },
  );

  it('shows Yes and No the same way', async () => {
    const shown: string[] = [];
    for (const button of ['resolve-yes', 'resolve-no'] as const) {
      setDbForTests(await createTestDb());
      await insertPrediction(samplePending());
      failReadsAfterLoad();
      const view = render(<ResolvePrompt predictionId="p1" />);
      await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeEnabled());
      fireEvent.press(screen.getByTestId(button));
      await screen.findByTestId('resolve-recorded');
      // Every testID on the acknowledgement, which differ only in the label's words.
      shown.push(
        JSON.stringify(
          screen
            .UNSAFE_queryAllByProps({})
            .map((n) => n.props.testID)
            .filter((id): id is string => typeof id === 'string'),
        ),
      );
      view.unmount();
    }
    expect(shown[0]).toBe(shown[1]);
  });

  it('shows no badge or checkpoint the answer may have left, and clears them', async () => {
    await insertPrediction(samplePending());
    const real = realGetById;
    const getById = jest.fn(async (id: string) => {
      if (getById.mock.calls.length === 1) return real(id);
      // As if this answer had left a badge and a checkpoint to show.
      useStatsStore.setState({
        milestone: { kind: 'tier_up', category: 'work', badge: 'forecaster', from: 'tracker' },
      });
      usePredictionStore.setState({ streakCheckpoint: 7, streakCheckpointFrom: 'answer' });
      throw new Error('disk I/O error');
    });
    usePredictionStore.setState({ getById });
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeEnabled());

    fireEvent.press(screen.getByTestId('resolve-yes'));

    expect(await screen.findByTestId('resolve-recorded')).toBeTruthy();
    expect(screen.queryByText(/New badge/)).toBeNull();
    expect(screen.queryByText(/Forecaster/)).toBeNull();
    expect(screen.queryByText(/A full week/)).toBeNull();
    expect(useStatsStore.getState().milestone).toBeNull();
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
  });

  it('says an answer given the day it was logged is not scored, as ever', async () => {
    await insertPrediction(samplePending({ created_at: new Date().toISOString() }));
    failReadsAfterLoad();
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeEnabled());

    fireEvent.press(screen.getByTestId('resolve-yes'));

    expect(await screen.findByTestId('resolve-bucket-line')).toHaveTextContent(SAME_DAY_LINE);
    expect(screen.queryByTestId('resolve-answer-note')).toBeNull();
  });

  // A reminder or another phone answered it first, so `resolve` left the row
  // as it was: the lists reloaded after it say so, and that is shown.
  it('never shows an answer the row does not hold', async () => {
    await insertPrediction(samplePending());
    failReadsAfterLoad();
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeEnabled());
    // Answered "No" elsewhere while this screen showed it open.
    await resolvePrediction('p1', 'resolved_no');

    fireEvent.press(screen.getByTestId('resolve-yes'));

    expect(await screen.findByTestId('answered-details')).toBeTruthy();
    expect(screen.queryByTestId('resolve-recorded')).toBeNull();
    expect(screen.queryByText('disk I/O error')).toBeNull();
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
  });
});
