import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { setDbForTests } from '@/db/client';
import {
  countPostponements,
  getPrediction,
  insertPrediction,
  listPendingDeletions,
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction } from '@/types';

import { REFILE_COUNTED_HINT } from './AnsweredDetails';
import {
  CATEGORY_COUNTED_IF_ANSWERED,
  categoryCountedNote,
  EDIT_NUMBER_FIX,
  EDIT_NUMBER_NOTE,
  PredictionDetails,
  REWORD_COUNTED,
} from './PredictionDetails';

const USER = 'local-user-v1';

const open = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
  user_id: USER,
  title: 'Ship the beta',
  category: 'work',
  confidence: 70,
  created_at: '2026-10-04T12:00:00.000Z',
  due_date: '2099-10-16T12:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  usePredictionStore.setState({ pending: [], resolved: [], streakCheckpoint: null, categoryOrigins: {} });
  useStatsStore.setState({ userStat: null, categoryStats: [], calibration: { rating: 0, buckets: [] } });
  useSettingsStore.setState({ notificationsEnabled: true });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
});

const renderDetails = (props: Partial<React.ComponentProps<typeof PredictionDetails>> = {}) =>
  render(
    <PredictionDetails predictionId="p1" onClose={jest.fn()} onAnswer={jest.fn()} {...props} />,
  );

describe('PredictionDetails (roadmap D25)', () => {
  it('says what you said first, then the title and the due date', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details')).toBeTruthy());
    expect(screen.getByTestId('details-stated')).toHaveTextContent(/you said 70%/);
    expect(screen.getByTestId('details-title')).toHaveTextContent('Ship the beta');
    // The screen's heading (playtest 2026-11-09b, finding 18).
    expect(screen.getByRole('header', { name: 'Ship the beta' })).toBeTruthy();
    expect(screen.getByTestId('details-due')).toHaveTextContent(/^Due .+, with a reminder at 7:00\sPM$/);
  });

  it('says reminders are off when they are', async () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-due')).toHaveTextContent(/reminders off$/));
  });

  it('edits the title and category, never the confidence', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));

    expect(screen.queryByTestId('confidence-readout')).toBeNull();
    // Made days ago: the number is the record, and nothing points at
    // swapping it (record audit 2026-11-13).
    expect(screen.getByText(EDIT_NUMBER_NOTE)).toBeTruthy();
    expect(screen.queryByText(new RegExp(EDIT_NUMBER_FIX.slice(0, 20)))).toBeNull();
    fireEvent.changeText(screen.getByTestId('details-title-field'), 'Ship the beta to ten people');
    fireEvent.press(screen.getByTestId('category-personal'));
    fireEvent.press(screen.getByTestId('details-save'));

    await waitFor(() => expect(screen.getByTestId('details')).toBeTruthy());
    expect(screen.getByTestId('details-title')).toHaveTextContent('Ship the beta to ten people');
    const saved = await getPrediction('p1');
    expect(saved).toMatchObject({ category: 'personal', confidence: 70 });
  });

  // Blind playtest 2026-11-13c, finding 24: on the day it was made, Edit
  // says how to use another number.
  it('offers another number on the day it was made (D62)', async () => {
    await insertPrediction(open({ created_at: new Date().toISOString() }));
    const onRenumber = jest.fn();
    renderDetails({ onRenumber });
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    // One message on the day it was made (step 179), not a no and a yes.
    expect(screen.getByTestId('details-number-note')).toHaveTextContent(EDIT_NUMBER_FIX);
    expect(screen.queryByText(EDIT_NUMBER_NOTE)).toBeNull();
    // Words typed in Edit go with it (step 179; blind playtest 2026-11-13e, run 2).
    fireEvent.changeText(screen.getByTestId('details-title-field'), 'Ship the beta to ten people');
    fireEvent.press(screen.getByTestId('details-renumber'));
    expect(onRenumber).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
      expect.objectContaining({ title: 'Ship the beta to ten people', category: 'work' }),
    );
  });

  it('keeps the number as the record from the next day', async () => {
    await insertPrediction(open());
    renderDetails({ onRenumber: jest.fn() });
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    expect(screen.getByText(EDIT_NUMBER_NOTE)).toBeTruthy();
    expect(screen.queryByTestId('details-renumber')).toBeNull();
  });

  // Playtest 2026-11-08b, finding 20: the sheet's draft guard needs to know.
  it('reports unsaved changes while editing, and none once they are undone', async () => {
    await insertPrediction(open());
    const onDirtyChange = jest.fn();
    renderDetails({ onDirtyChange });
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.changeText(screen.getByTestId('details-title-field'), 'Ship the beta to ten people');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.press(screen.getByTestId('details-cancel-edit'));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  // Blind playtest 2026-11-01: a picked due date showed "Pick a date" chosen
  // and no date field until a second tap.
  it('shows the date field at once for a picked due date', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    expect(screen.getByTestId('due-pick').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('due-picker')).toBeTruthy();
  });

  it('keeps Save changes waiting for a title', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    expect(screen.queryByTestId('details-needs')).toBeNull();
    fireEvent.changeText(screen.getByTestId('details-title-field'), '   ');
    expect(screen.getByTestId('details-save').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    // And says so (blind playtest 2026-11-01).
    expect(screen.getByTestId('details-needs')).toHaveTextContent('To save, add the prediction.');
  });

  it('deletes only after a confirmation, and closes', async () => {
    await insertPrediction(open());
    const onClose = jest.fn();
    renderDetails({ onClose });
    await waitFor(() => expect(screen.getByTestId('details-delete')).toBeTruthy());

    fireEvent.press(screen.getByTestId('details-delete'));
    expect(screen.getByTestId('details-delete-confirm')).toHaveTextContent(/can't be undone/);
    expect(await getPrediction('p1')).not.toBeNull();

    fireEvent.press(screen.getByTestId('details-delete-yes'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await getPrediction('p1')).toBeNull();
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
  });

  // Step 181 (blind playtest 2026-11-14, finding 15): on the day it was logged
  // new words change nothing it could be told, and the note read as a mistake.
  it('says nothing about new words on the day it was logged', async () => {
    await insertPrediction(open({ created_at: new Date().toISOString() }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    fireEvent.changeText(screen.getByTestId('details-title-field'), "Don't ship the beta");
    expect(screen.queryByTestId('details-reword-note')).toBeNull();

    fireEvent.press(screen.getByTestId('details-save'));
    await waitFor(() => expect(screen.getByText("Don't ship the beta")).toBeTruthy());
    expect((await getPrediction('p1'))?.title_edited_at).toBeTruthy();
    expect(screen.queryByTestId('details-reworded')).toBeNull();
  });

  // Record audit, round 2: an answer given the day it was logged isn't scored,
  // so switching it moves nothing, rating unlocked or not.
  it('says nothing about ratings after switching a same-day answer', async () => {
    const at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await insertPrediction(
      open({ created_at: at, status: 'resolved_no', resolved_at: at, due_date: at }),
    );
    const real = useStatsStore.getState().recomputeForUser;
    const unlocked = {
      user_id: USER,
      calibration_rating: 88,
      total_predictions: 30,
      total_resolved: 30,
      current_streak: 1,
      rating_is_provisional: false,
    };
    useStatsStore.setState({
      userStat: unlocked,
      recomputeForUser: async (userId: string) => {
        await real(userId);
        useStatsStore.setState({ userStat: unlocked });
      },
    });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    try {
      renderDetails();
      await waitFor(() => expect(screen.getByTestId('answered-same-day')).toBeTruthy());
      // Moving one that was never scored isn't counted (step 184).
      expect(screen.queryByTestId('answered-refile-hint')).toBeNull();
      fireEvent.press(screen.getByTestId('answered-switch'));
      await waitFor(() =>
        expect(screen.getByTestId('answered-outcome')).toHaveTextContent(/^It happened/),
      );
      await waitFor(() => expect(announce).toHaveBeenCalledWith('Changed to: it happened.'));
      expect(screen.queryByTestId('answered-corrected')).toBeNull();
    } finally {
      announce.mockRestore();
      useStatsStore.setState({ recomputeForUser: real, userStat: null });
    }
  });

  // Record audit, round 2: moving a scored answer to another category takes
  // it out of one score and into another, and said nothing.
  it('says each category follows where an answer is filed, after a move', async () => {
    const at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await insertPrediction(open({ status: 'resolved_no', resolved_at: at, due_date: at }));
    const real = useStatsStore.getState().recomputeForUser;
    const unlocked = {
      user_id: USER,
      calibration_rating: 88,
      total_predictions: 30,
      total_resolved: 30,
      current_streak: 1,
      rating_is_provisional: false,
    };
    useStatsStore.setState({
      userStat: unlocked,
      recomputeForUser: async (userId: string) => {
        await real(userId);
        useStatsStore.setState({ userStat: unlocked });
      },
    });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const moved = 'Each category’s score and badge now follow where this is filed, so they may have moved.';
    try {
      renderDetails();
      await waitFor(() => expect(screen.getByTestId('answered-window')).toBeTruthy());
      expect(screen.queryByTestId('answered-refiled')).toBeNull();
      // Said before the move (step 184, D65), and still there after it.
      expect(screen.getByTestId('answered-refile-hint')).toHaveTextContent(REFILE_COUNTED_HINT);
      expect(REFILE_COUNTED_HINT).toBe(
        'Insights counts a scored answer that ends up in a different category from the one it had at the end of the day it was made.',
      );
      fireEvent.press(screen.getByTestId('category-health'));
      await waitFor(() => expect(screen.getByTestId('answered-category')).toHaveTextContent('Health'));
      await waitFor(() => expect(screen.getByTestId('answered-refiled')).toHaveTextContent(moved));
      expect(announce).toHaveBeenCalledWith(`Moved to Health. ${moved}`);
      expect(screen.getByTestId('answered-refile-hint')).toBeTruthy();
      // A move isn't a change of answer.
      expect(screen.queryByTestId('answered-corrected')).toBeNull();
    } finally {
      announce.mockRestore();
      useStatsStore.setState({ recomputeForUser: real, userStat: null });
    }
  });

  // Review round 6: the hint says what Insights counts for an answer moved
  // before it was answered too. Made days ago in work, moved to personal
  // early (work remembered), answered in personal: counted at once. Back in
  // work, the category it had at the end of the day it was made, it comes
  // off; in personal again, where it was answered, it's counted again.
  it('says what Insights counts for an answer moved before it was answered', async () => {
    await insertPrediction(open());
    await usePredictionStore.getState().update('p1', {
      title: 'Ship the beta',
      category: 'personal',
      due_date: '2099-10-16T12:00:00.000Z',
    });
    await usePredictionStore.getState().resolve('p1', 'resolved_no');
    expect(usePredictionStore.getState().refiledCount).toBe(1);

    renderDetails();
    await waitFor(() =>
      expect(screen.getByTestId('answered-refile-hint')).toHaveTextContent(REFILE_COUNTED_HINT),
    );

    fireEvent.press(screen.getByTestId('category-work'));
    await waitFor(() => expect(screen.getByTestId('answered-category')).toHaveTextContent('Work'));
    await waitFor(() => expect(usePredictionStore.getState().refiledCount).toBe(0));

    fireEvent.press(screen.getByTestId('category-personal'));
    await waitFor(() =>
      expect(screen.getByTestId('answered-category')).toHaveTextContent('Personal'),
    );
    await waitFor(() => expect(usePredictionStore.getState().refiledCount).toBe(1));
  });

  // Record audit of step 181: before the rating unlocks nothing on screen can
  // move, so the line isn't shown or spoken.
  it('says nothing about ratings after a switch while the rating is locked', async () => {
    const at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await insertPrediction(open({ status: 'resolved_no', resolved_at: at, due_date: at }));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-switch')).toBeTruthy());
    fireEvent.press(screen.getByTestId('answered-switch'));
    await waitFor(() =>
      expect(screen.getByTestId('answered-outcome')).toHaveTextContent(/^It happened/),
    );
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Changed to: it happened.'));
    expect(screen.queryByTestId('answered-corrected')).toBeNull();
    announce.mockRestore();
  });

  // Roadmap D45: new words make a new prediction from today, said before Save.
  it('warns that new words make it a new prediction, not a fixed full stop', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    expect(screen.queryByTestId('details-reword-note')).toBeNull();
    fireEvent.changeText(screen.getByTestId('details-title-field'), 'ship the beta.');
    expect(screen.queryByTestId('details-reword-note')).toBeNull();
    fireEvent.changeText(screen.getByTestId('details-title-field'), "Don't ship the beta");
    expect(screen.getByTestId('details-reword-note')).toHaveTextContent(/new prediction from today/);

    fireEvent.press(screen.getByTestId('details-save'));
    await waitFor(() => expect(screen.getByTestId('details-reworded')).toBeTruthy());
    expect((await getPrediction('p1'))?.title_edited_at).toBeTruthy();
  });

  // Step 173 (aggregate B1): a move later on the eve or after is counted.
  it('says a move later is counted when it is due tomorrow, and not when far off', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await insertPrediction(open({ due_date: tomorrow }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    expect(screen.queryByTestId('details-late-move')).toBeNull();
    fireEvent.press(screen.getByTestId('due-week'));
    expect(screen.getByTestId('details-late-move')).toHaveTextContent(
      'It’s due tomorrow, so moving it later is counted on Insights: the outcome may already be known. It doesn’t change your score.',
    );
  });

  // D69 (e): another category from the eve of its due day is counted, said
  // before Save under the chips, in the late move's words.
  describe('a category change close to its due day', () => {
    const DUE_TOMORROW =
      'It’s due tomorrow, so changing its category is counted on Insights: the outcome may already be known. It doesn’t change your score.';

    it('is said under the chips when it is due tomorrow, aloud too, and counted on Save', async () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      await insertPrediction(open({ due_date: tomorrow }));
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      // The setup's mock keeps calls from earlier tests: only this one's count.
      announce.mockClear();
      try {
        renderDetails();
        await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
        fireEvent.press(screen.getByTestId('details-edit-button'));
        expect(screen.queryByTestId('details-category-counted')).toBeNull();

        fireEvent.press(screen.getByTestId('category-personal'));
        expect(screen.getByTestId('details-category-counted')).toHaveTextContent(DUE_TOMORROW);
        expect(categoryCountedNote(1)).toBe(DUE_TOMORROW);
        await waitFor(() =>
          expect(announce).toHaveBeenCalledWith(
            'Changing its category is counted on Insights: the outcome may already be known. It doesn’t change your score.',
          ),
        );
        // Counted now, so never the note for a move counted at the answer
        // (review round 6), on screen or aloud.
        expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
        expect(announce).not.toHaveBeenCalledWith(CATEGORY_COUNTED_IF_ANSWERED);
        // Back to its own category: nothing to count, nothing said.
        fireEvent.press(screen.getByTestId('category-work'));
        expect(screen.queryByTestId('details-category-counted')).toBeNull();

        // What it says is what Save records (the store's own rule).
        fireEvent.press(screen.getByTestId('category-personal'));
        await waitFor(() => expect(screen.getByTestId('details-save')).toBeEnabled());
        fireEvent.press(screen.getByTestId('details-save'));
        await waitFor(() => expect(screen.getByTestId('details')).toBeTruthy());
        expect(usePredictionStore.getState().postponedCount).toBe(1);
        expect((await getPrediction('p1'))?.category).toBe('personal');
      } finally {
        announce.mockRestore();
      }
    });

    // Further off, the move isn't counted now; since review round 6 it is
    // counted if a scored answer comes in the new category, which the other
    // note says (below).
    it('has no eve note when it is further off', async () => {
      await insertPrediction(open());
      renderDetails();
      await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('details-edit-button'));
      fireEvent.press(screen.getByTestId('category-personal'));
      expect(screen.queryByTestId('details-category-counted')).toBeNull();
      expect(screen.getByTestId('details-category-counted-if-answered')).toBeTruthy();
    });

    // A change on the day it was made is a slip fixed (D62), even due tomorrow.
    it('says nothing on the day it was made', async () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      await insertPrediction(open({ created_at: new Date().toISOString(), due_date: tomorrow }));
      renderDetails();
      await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('details-edit-button'));
      fireEvent.press(screen.getByTestId('category-personal'));
      expect(screen.queryByTestId('details-category-counted')).toBeNull();
      expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
    });

    it('names the day as the late move does', () => {
      expect(categoryCountedNote(0)).toBe(
        'It’s due today, so changing its category is counted on Insights: the outcome may already be known. It doesn’t change your score.',
      );
      expect(categoryCountedNote(-3)).toBe(
        'It’s past its due day, so changing its category is counted on Insights: the outcome may already be known. It doesn’t change your score.',
      );
    });
  });

  // Review round 6, widening D69 (e): a move after the day it was made and
  // before the eve is counted with the moved answers if a scored answer comes
  // in the new category. Edit says so before Save, under the chips, in the
  // eve note's style, and never beside it.
  describe('an earlier category change, counted if answered there', () => {
    const origin = (from: Prediction['category'], countedLate = false) => ({
      p1: {
        prediction_id: 'p1',
        user_id: USER,
        from_category: from,
        changed_at: '2026-10-06T12:00:00.000Z',
        counted_late: countedLate,
      },
    });

    it('is the eve note’s kind of sentence, and says a scored answer', () => {
      expect(CATEGORY_COUNTED_IF_ANSWERED).toBe(
        'If it gets a scored answer in this category, the move is counted on Insights. It doesn’t change your score.',
      );
    });

    it('is said under the chips, aloud too, and goes when the category goes back', async () => {
      await insertPrediction(open());
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announce.mockClear();
      try {
        renderDetails();
        await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
        fireEvent.press(screen.getByTestId('details-edit-button'));
        expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
        expect(announce).not.toHaveBeenCalledWith(CATEGORY_COUNTED_IF_ANSWERED);

        fireEvent.press(screen.getByTestId('category-personal'));
        const note = screen.getByTestId('details-category-counted-if-answered');
        expect(note).toHaveTextContent(CATEGORY_COUNTED_IF_ANSWERED);
        // Announced as the eve note is, and set as a live region like it.
        expect(note.props.accessibilityLiveRegion).toBe('polite');
        await waitFor(() => expect(announce).toHaveBeenCalledWith(CATEGORY_COUNTED_IF_ANSWERED));
        expect(screen.queryByTestId('details-category-counted')).toBeNull();

        // Back to its own category: not a move, nothing to say.
        fireEvent.press(screen.getByTestId('category-work'));
        expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
      } finally {
        announce.mockRestore();
      }
    });

    it('is said against the category Save remembers, and not for a move back to it', async () => {
      await insertPrediction(open());
      renderDetails();
      await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('details-edit-button'));
      fireEvent.press(screen.getByTestId('category-personal'));
      await waitFor(() => expect(screen.getByTestId('details-save')).toBeEnabled());
      fireEvent.press(screen.getByTestId('details-save'));
      await waitFor(() => expect(screen.getByTestId('details')).toBeTruthy());
      // Not counted at Save: further off than the eve.
      expect(await countPostponements(USER)).toBe(0);
      expect(usePredictionStore.getState().categoryOrigins.p1).toMatchObject({
        from_category: 'work',
        counted_late: false,
      });

      fireEvent.press(screen.getByTestId('details-edit-button'));
      // Now in personal: back to work, where it was, is nothing to count.
      fireEvent.press(screen.getByTestId('category-work'));
      expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
      // Anywhere else still is.
      fireEvent.press(screen.getByTestId('category-health'));
      expect(screen.getByTestId('details-category-counted-if-answered')).toHaveTextContent(
        CATEGORY_COUNTED_IF_ANSWERED,
      );
    });

    it('reads the remembered category from the store', async () => {
      await insertPrediction(open());
      usePredictionStore.setState({ categoryOrigins: origin('health') });
      renderDetails();
      await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('details-edit-button'));
      // Filed in work now, remembered from health: health is a move back.
      fireEvent.press(screen.getByTestId('category-health'));
      expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
      fireEvent.press(screen.getByTestId('category-personal'));
      expect(screen.getByTestId('details-category-counted-if-answered')).toBeTruthy();
    });

    it('is not said when a category change on it was already counted as late', async () => {
      await insertPrediction(open());
      usePredictionStore.setState({ categoryOrigins: origin('health', true) });
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announce.mockClear();
      try {
        renderDetails();
        await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
        fireEvent.press(screen.getByTestId('details-edit-button'));
        fireEvent.press(screen.getByTestId('category-personal'));
        expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
        expect(screen.queryByTestId('details-category-counted')).toBeNull();
        expect(announce).not.toHaveBeenCalledWith(CATEGORY_COUNTED_IF_ANSWERED);
      } finally {
        announce.mockRestore();
      }
    });

    // From the eve the move is counted at once, which the eve note says; a
    // remembered category doesn't bring the other note beside it.
    it('gives way to the eve note, even with a category remembered', async () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      await insertPrediction(open({ due_date: tomorrow }));
      usePredictionStore.setState({ categoryOrigins: origin('health') });
      renderDetails();
      await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('details-edit-button'));
      for (const id of ['category-personal', 'category-health', 'category-finance']) {
        fireEvent.press(screen.getByTestId(id));
        expect(screen.getByTestId('details-category-counted')).toBeTruthy();
        expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
      }
    });

    it('is not said outside Edit', async () => {
      await insertPrediction(open());
      usePredictionStore.setState({ categoryOrigins: origin('health') });
      renderDetails();
      await waitFor(() => expect(screen.getByTestId('details')).toBeTruthy());
      expect(screen.queryByTestId('details-category-counted-if-answered')).toBeNull();
    });
  });

  it('says a delete is counted once the prediction is due', async () => {
    await insertPrediction(open({ due_date: new Date().toISOString() }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-delete')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-delete'));
    expect(screen.getByTestId('details-delete-text')).toHaveTextContent(/Insights will count it/);
  });

  it('cancels a delete', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-delete')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-delete'));
    fireEvent.press(screen.getByTestId('details-delete-cancel'));
    expect(screen.queryByTestId('details-delete-confirm')).toBeNull();
    expect(await getPrediction('p1')).not.toBeNull();
  });

  // Roadmap D41: logged today, an answer today isn't scored; it says so first.
  it('warns that an answer the day it was logged is not scored', async () => {
    await insertPrediction(open({ created_at: new Date().toISOString() }));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-answer')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-answer'));
    // Roadmap D56: said once, here, with what to do, and without "answering
    // early is fine" beside it.
    expect(screen.getByTestId('details-early')).toHaveTextContent(
      /^It's due .+\. You logged it today, so an answer today isn’t scored\. From tomorrow it is\./,
    );
    // The habit tip only on a repeat (D62): this one is a one-off.
    expect(screen.getByTestId('details-early')).not.toHaveTextContent(/evening before/);
    // Said aloud too: it appears in place of the button (playtest 2026-11-04b, run 2).
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/From tomorrow it is\.$/));
    announce.mockRestore();
  });

  it('gives the habit tip when the same words were answered before (D62)', async () => {
    await insertPrediction(open({ created_at: new Date().toISOString() }));
    usePredictionStore.setState({
      resolved: [
        open({ id: 'old', status: 'resolved_yes', resolved_at: '2026-10-05T18:00:00.000Z' }),
      ],
    });
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-answer')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-answer'));
    expect(screen.getByTestId('details-early')).toHaveTextContent(
      /For something you do every day, log the next one the evening before\./,
    );
  });

  // Roadmap D56: Resolve doesn't repeat the warning when opened from here.
  it('tells Resolve the warning was given, only when it was', async () => {
    await insertPrediction(open({ created_at: new Date().toISOString() }));
    const onAnswer = jest.fn();
    renderDetails({ onAnswer });
    await waitFor(() => expect(screen.getByTestId('details-answer')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-answer'));
    fireEvent.press(screen.getByTestId('details-answer-now'));
    expect(onAnswer).toHaveBeenCalledWith('p1', { warned: true });
  });

  it('says it is early before answering, then hands over to Resolve', async () => {
    await insertPrediction(open());
    const onAnswer = jest.fn();
    renderDetails({ onAnswer });
    await waitFor(() => expect(screen.getByTestId('details-answer')).toBeTruthy());

    fireEvent.press(screen.getByTestId('details-answer'));
    expect(screen.getByTestId('details-early')).toHaveTextContent(/It's due .+\. Answering early is fine/);
    expect(screen.getByTestId('details-early')).not.toHaveTextContent(/isn’t scored/);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('details-answer-now'));
    expect(onAnswer).toHaveBeenCalledWith('p1', { warned: false });
  });

  it('goes straight to Resolve once it is due, as after an edit to today', async () => {
    const noonToday = new Date();
    noonToday.setHours(12, 0, 0, 0);
    await insertPrediction(open({ due_date: noonToday.toISOString() }));
    const onAnswer = jest.fn();
    renderDetails({ onAnswer });
    await waitFor(() => expect(screen.getByTestId('details-due')).toHaveTextContent(/^Due today/));

    fireEvent.press(screen.getByTestId('details-answer'));
    expect(screen.queryByTestId('details-early')).toBeNull();
    expect(onAnswer).toHaveBeenCalledWith('p1');
  });

  it('promises no reminder for a due day that has passed', async () => {
    await insertPrediction(open({ due_date: '2020-10-16T12:00:00.000Z' }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-due')).toHaveTextContent(/^Due [^·]+$/));
  });

  // A Yes or No has its own details since D34; a skip is answered in Resolve.
  it('says so when the prediction is no longer open', async () => {
    await insertPrediction(open({ status: 'skipped', resolved_at: '2026-10-09T12:00:00.000Z' }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-missing')).toBeTruthy());
  });
});

// Roadmap D34: an answered prediction opens its details from History, and for
// a day can be switched, moved or deleted; after that it's the record.
describe('PredictionDetails, answered (roadmap D34)', () => {
  const answered = (hoursAgo: number, over: Partial<Prediction> = {}) => {
    const at = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    return open({ status: 'resolved_no', resolved_at: at, due_date: at, ...over });
  };

  it('switches the answer, moves it and keeps when it was answered', async () => {
    const p = answered(1);
    await insertPrediction(p);
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    // With a rating on screen, there is something for the answer to move.
    const real = useStatsStore.getState().recomputeForUser;
    const unlocked = {
      user_id: USER,
      calibration_rating: 88,
      total_predictions: 30,
      total_resolved: 30,
      current_streak: 1,
      rating_is_provisional: false,
    };
    useStatsStore.setState({
      userStat: unlocked,
      recomputeForUser: async (userId: string) => {
        await real(userId);
        useStatsStore.setState({ userStat: unlocked });
      },
    });
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-window')).toBeTruthy());
    expect(screen.getByTestId('answered-outcome')).toHaveTextContent(/^It didn’t happen/);
    expect(screen.queryByTestId('answered-corrected')).toBeNull();

    fireEvent.press(screen.getByTestId('answered-switch'));
    await waitFor(() =>
      expect(screen.getByTestId('answered-outcome')).toHaveTextContent(/^It happened/),
    );
    // Step 181: what follows a correction is said, with no figures (D50).
    await waitFor(() =>
      expect(screen.getByTestId('answered-corrected')).toHaveTextContent(
        'Your rating and badges now follow this answer, so they may have moved.',
      ),
    );
    expect(announce).toHaveBeenCalledWith(
      'Changed to: it happened. Your rating and badges now follow this answer, so they may have moved.',
    );
    announce.mockRestore();
    useStatsStore.setState({ recomputeForUser: real, userStat: null });
    fireEvent.press(screen.getByTestId('category-health'));
    await waitFor(() => expect(screen.getByTestId('answered-category')).toHaveTextContent('Health'));

    const saved = await getPrediction('p1');
    expect(saved).toMatchObject({ status: 'resolved_yes', category: 'health', confidence: 70 });
    expect(saved?.resolved_at).toBe(p.resolved_at);
  });

  it('deletes one only after a confirmation', async () => {
    await insertPrediction(answered(2));
    const onClose = jest.fn();
    renderDetails({ onClose });
    await waitFor(() => expect(screen.getByTestId('answered-delete')).toBeTruthy());
    fireEvent.press(screen.getByTestId('answered-delete'));
    fireEvent.press(screen.getByTestId('answered-delete-yes'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await getPrediction('p1')).toBeNull();
  });

  it('says an answer older than a day is the record, and offers nothing to change', async () => {
    await insertPrediction(answered(30));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-locked')).toBeTruthy());
    expect(screen.queryByTestId('answered-switch')).toBeNull();
    expect(screen.queryByTestId('answered-delete')).toBeNull();
    expect(screen.queryByTestId('category-health')).toBeNull();
  });

  // Blind playtest 2026-11-04, second round, run 3: after a switch the note
  // read as the opposite of the answer, with no way to take it off.
  it('removes a note at any time, the record locked or not', async () => {
    await insertPrediction(answered(30, { reflection: 'Holiday helps.' }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-reflection')).toBeTruthy());
    expect(screen.getByTestId('answered-locked')).toBeTruthy();
    fireEvent.press(screen.getByTestId('answered-remove-note'));
    await waitFor(async () => expect((await getPrediction('p1'))?.reflection).toBeNull());
    await waitFor(() => expect(screen.queryByTestId('answered-reflection')).toBeNull());
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
  });
});

// Review 2026-11-01: a window that closes while the sheet is open says so in
// the store's words, and the controls go.
describe('PredictionDetails, answered, window closed while open', () => {
  it('shows the record sentence and drops the controls', async () => {
    const at = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const p = open({ status: 'resolved_no', resolved_at: at, due_date: at });
    await insertPrediction(p);
    const { AnsweredDetails } = jest.requireActual('./AnsweredDetails');
    // The sheet believes it's an hour after the answer; the store knows better.
    const onePastAnswer = new Date(Date.parse(at) + 60 * 60 * 1000);
    const { rerender } = render(
      <AnsweredDetails prediction={p} onChanged={jest.fn()} onClose={jest.fn()} now={onePastAnswer} />,
    );
    fireEvent.press(screen.getByTestId('answered-switch'));
    await waitFor(() => expect(screen.getByText(/part of the record now/)).toBeTruthy());
    rerender(<AnsweredDetails prediction={p} onChanged={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByTestId('answered-switch')).toBeNull();
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
  });
});

// Roadmap D56 (blind playtest 2026-11-10, run 2): repeating a daily walk meant
// retyping it, since "Log it again" was only on Resolve right after an answer.
describe('PredictionDetails, answered: Log it again (roadmap D56)', () => {
  const answeredDaysAgo = (days: number, over: Partial<Prediction> = {}) => {
    const at = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const made = new Date(at.getTime() - 24 * 60 * 60 * 1000);
    return open({
      status: 'resolved_yes',
      created_at: made.toISOString(),
      due_date: at.toISOString(),
      resolved_at: at.toISOString(),
      ...over,
    });
  };

  it('offers it at any time, naming its date, and hands the prediction over', async () => {
    await insertPrediction(answeredDaysAgo(5)); // past the correction window
    const onPredictAgain = jest.fn();
    renderDetails({ onPredictAgain });
    await waitFor(() => expect(screen.getByTestId('answered-locked')).toBeTruthy());
    // Logged a day before it was due, so it comes back due tomorrow.
    expect(screen.getByTestId('answered-again')).toHaveTextContent('Log it again, due tomorrow');
    fireEvent.press(screen.getByTestId('answered-again'));
    expect(onPredictAgain).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('says it is logged again instead while the same words are open', async () => {
    await insertPrediction(answeredDaysAgo(1));
    const later = new Date();
    later.setDate(later.getDate() + 3);
    later.setHours(12, 0, 0, 0);
    usePredictionStore.setState({
      pending: [open({ id: 'p2', title: 'ship the beta.', due_date: later.toISOString() })],
      resolved: [],
    });
    renderDetails({ onPredictAgain: jest.fn() });
    await waitFor(() => expect(screen.getByTestId('answered-logged-again')).toBeTruthy());
    expect(screen.getByTestId('answered-logged-again')).toHaveTextContent(/^Logged again, due \w+\.$/);
    expect(screen.queryByTestId('answered-again')).toBeNull();
  });

  it('is not offered where the screen gives no way to log', async () => {
    await insertPrediction(answeredDaysAgo(1));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-outcome')).toBeTruthy());
    expect(screen.queryByTestId('answered-again')).toBeNull();
  });

  it('says the words changed that day for a reworded one answered the same day', async () => {
    const now = new Date().toISOString();
    await insertPrediction(
      open({
        status: 'resolved_yes',
        title_edited_at: now,
        resolved_at: now,
        due_date: now,
      }),
    );
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-same-day')).toBeTruthy());
    expect(screen.getByTestId('answered-same-day')).toHaveTextContent(
      'Answered the day its words changed, so it isn’t scored: new words count as a new prediction, and a call made and settled in one day says little.',
    );
  });

  // Blind playtest 2026-11-12c, finding 17: the what without the why.
  it('says why a same-day answer is not scored, and what to do', async () => {
    const now = new Date().toISOString();
    await insertPrediction(
      open({ status: 'resolved_yes', created_at: now, resolved_at: now, due_date: now }),
    );
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-same-day')).toBeTruthy());
    // A one-off: no habit tip (D62).
    expect(screen.getByTestId('answered-same-day')).toHaveTextContent(
      'Answered the day it was logged, so it isn’t scored: a call made and settled in one day says little. From the next day, an answer is scored.',
    );
  });

  it('adds the habit tip to a same-day answer when the words repeat (D62)', async () => {
    const now = new Date().toISOString();
    await insertPrediction(
      open({ status: 'resolved_yes', created_at: now, resolved_at: now, due_date: now }),
    );
    usePredictionStore.setState({
      resolved: [
        open({ id: 'old', status: 'resolved_no', resolved_at: '2026-10-05T18:00:00.000Z' }),
      ],
    });
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-same-day')).toBeTruthy());
    expect(screen.getByTestId('answered-same-day')).toHaveTextContent(
      /log the next one the evening before\.$/,
    );
  });
});

describe('PredictionDetails, D56 edges (code review 2026-11-10)', () => {
  it('says a repeat due today is ready to answer, not a bare date', async () => {
    const at = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await insertPrediction(
      open({
        status: 'resolved_yes',
        created_at: new Date(at.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        due_date: at.toISOString(),
        resolved_at: at.toISOString(),
      }),
    );
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    usePredictionStore.setState({
      pending: [open({ id: 'p2', due_date: noon.toISOString() })],
      resolved: [],
    });
    renderDetails({ onPredictAgain: jest.fn() });
    await waitFor(() => expect(screen.getByTestId('answered-logged-again')).toBeTruthy());
    expect(screen.getByTestId('answered-logged-again')).toHaveTextContent(
      'Logged again, ready to answer.',
    );
  });

  it('says the words changed today, without the evening advice, for a reworded one', async () => {
    await insertPrediction(open({ title_edited_at: new Date().toISOString() }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-answer')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-answer'));
    expect(screen.getByTestId('details-early')).toHaveTextContent(
      /You changed its words today, so an answer today isn’t scored\. From tomorrow it is\./,
    );
    expect(screen.getByTestId('details-early')).not.toHaveTextContent(/evening before/);
  });
});

// D62: a note added or changed after the answer; new words on the eve counted.
describe('PredictionDetails, D62', () => {
  it('adds a note to an answered prediction', async () => {
    await insertPrediction(
      open({ status: 'resolved_no', resolved_at: '2026-10-05T18:00:00.000Z', due_date: '2026-10-05T12:00:00.000Z' }),
    );
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-add-note')).toBeTruthy());
    fireEvent.press(screen.getByTestId('answered-add-note'));
    fireEvent.changeText(screen.getByTestId('answered-note-field'), 'Rain came early');
    fireEvent.press(screen.getByTestId('answered-note-save'));
    await waitFor(() => expect(screen.getByTestId('answered-reflection')).toHaveTextContent(/Rain came early/));
    expect((await getPrediction('p1'))?.reflection).toBe('Rain came early');
  });

  it('says new words on the eve are counted', async () => {
    const day = 24 * 60 * 60 * 1000;
    await insertPrediction(
      open({
        created_at: new Date(Date.now() - day).toISOString(),
        due_date: new Date(Date.now() + day).toISOString(),
      }),
    );
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    fireEvent.changeText(screen.getByTestId('details-title-field'), 'Not ship the beta');
    expect(screen.getByTestId('details-reword-note')).toHaveTextContent(/changing its words is counted on Insights/);
    expect(REWORD_COUNTED).toMatch(/as moving it later would be/);
  });
});
