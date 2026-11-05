import { render, screen } from '@testing-library/react-native';

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
