import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { datePresets, DueDateChips } from './DueDateChips';

// Blind playtest 2026-11-05, run 1: a typed date of today was moved to
// tomorrow without a word. The picker says why today isn't offered (D41).
describe('DueDateChips — the earliest day', () => {
  const presets = datePresets();
  const renderChips = (earliest: Date) =>
    render(
      <DueDateChips
        presets={presets}
        value={presets[0].iso}
        picking
        onChange={jest.fn()}
        onPickingChange={jest.fn()}
        earliest={earliest}
      />,
    );

  it('says why today can\'t be picked, when tomorrow is the earliest', () => {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    renderChips(tomorrow);
    expect(screen.getByTestId('due-floor-note')).toHaveTextContent(
      "Tomorrow at the earliest: an answer on the day it's logged isn't scored.",
    );
  });

  it('says nothing when editing one logged earlier, whose earliest day is past', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    renderChips(today);
    expect(screen.queryByTestId('due-floor-note')).toBeNull();
  });
});

// The owner, 2026-11-24: "Pick a date" shows the full calendar at once, not
// the compact picker's small date button that took a second tap.
describe('DueDateChips — the calendar', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DateTimePicker = require('@react-native-community/datetimepicker').default;
  const presets = datePresets();

  it('shows the inline calendar on the iPhone, within the earliest and latest days', () => {
    const earliest = new Date();
    earliest.setHours(0, 0, 0, 0);
    earliest.setDate(earliest.getDate() + 1);
    const view = render(
      <DueDateChips
        presets={presets}
        value={presets[0].iso}
        picking
        onChange={jest.fn()}
        onPickingChange={jest.fn()}
        earliest={earliest}
      />,
    );
    const picker = view.UNSAFE_getByType(DateTimePicker);
    expect(picker.props.display).toBe('inline');
    expect(picker.props.mode).toBe('date');
    expect(picker.props.minimumDate).toBe(earliest);
    expect(picker.props.maximumDate.getTime()).toBeGreaterThan(earliest.getTime());
    expect(picker.props.accentColor).toBeDefined();
    // It follows the phone's appearance.
    expect(picker.props.themeVariant).toBeUndefined();
  });

  it('asks for the reveal only when a tap brings the calendar in', () => {
    const onPickerReveal = jest.fn();
    const onPickingChange = jest.fn();
    const chips = (picking: boolean, value = presets[0].iso) => (
      <DueDateChips
        presets={presets}
        value={value}
        picking={picking}
        onChange={jest.fn()}
        onPickingChange={onPickingChange}
        onPickerReveal={onPickerReveal}
      />
    );
    const view = render(chips(false));
    fireEvent.press(screen.getByTestId('due-pick'));
    expect(onPickerReveal).toHaveBeenCalledTimes(1);
    expect(onPickingChange).toHaveBeenLastCalledWith(true);
    // Open already: nothing to bring in.
    view.rerender(chips(true));
    fireEvent.press(screen.getByTestId('due-pick'));
    expect(onPickerReveal).toHaveBeenCalledTimes(1);
    // A picked date shows folded (review 2026-11-25), so a tap on its chosen
    // chip brings the calendar in.
    view.rerender(chips(false, new Date(2027, 0, 5, 12).toISOString()));
    fireEvent.press(screen.getByTestId('due-pick'));
    expect(onPickerReveal).toHaveBeenCalledTimes(2);
    expect(onPickingChange).toHaveBeenLastCalledWith(true);
  });

  // Review 2026-11-25: Edit opened on a picked date with the whole month grid
  // showing, and Save changes went off the sheet. D78's calendar shows at
  // once when "Pick a date" is tapped, not before.
  it('keeps a picked date folded: Pick a date chosen, the sentence, no calendar', () => {
    const picked = new Date();
    picked.setDate(picked.getDate() + 3);
    picked.setHours(12, 0, 0, 0);
    const later = new Date();
    later.setHours(0, 0, 0, 0);
    later.setDate(later.getDate() + 1);
    render(
      <DueDateChips
        presets={presets}
        value={picked.toISOString()}
        picking={false}
        onChange={jest.fn()}
        onPickingChange={jest.fn()}
        earliest={later}
      />,
    );
    expect(screen.getByTestId('due-pick').props.accessibilityState.selected).toBe(true);
    for (const id of ['due-tomorrow', 'due-week', 'due-month']) {
      expect(screen.getByTestId(id).props.accessibilityState.selected).toBe(false);
    }
    expect(screen.queryByTestId('due-picker')).toBeNull();
    // The floor note goes with the calendar.
    expect(screen.queryByTestId('due-floor-note')).toBeNull();
    expect(screen.getByTestId('due-sentence')).toHaveTextContent(/^Due in\s3\sdays$/);
  });

  it('puts the keyboard away when Pick a date is tapped', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    try {
      render(
        <DueDateChips
          presets={presets}
          value={presets[0].iso}
          picking={false}
          onChange={jest.fn()}
          onPickingChange={jest.fn()}
        />,
      );
      fireEvent.press(screen.getByTestId('due-pick'));
      expect(dismiss).toHaveBeenCalledTimes(1);
    } finally {
      dismiss.mockRestore();
    }
  });

  it('names the due day in words under the chips', () => {
    render(
      <DueDateChips
        presets={presets}
        value={presets[1].iso}
        picking={false}
        onChange={jest.fn()}
        onPickingChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId('due-sentence')).toHaveTextContent(/^Due in 7 days$/);
  });
});
