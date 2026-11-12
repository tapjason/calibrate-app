import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { SAVED_NOTICE_MS, SavedNotice } from './SavedNotice';

describe('SavedNotice', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is said once to VoiceOver and goes by itself', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const onDone = jest.fn();
    render(<SavedNotice text="Saved, due tomorrow." bottom={80} onDone={onDone} />);
    expect(screen.getByText('Saved, due tomorrow.', { includeHiddenElements: true })).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Saved, due tomorrow.');
    act(() => jest.advanceTimersByTime(SAVED_NOTICE_MS - 1));
    expect(onDone).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });
});
