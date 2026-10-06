import * as Haptics from 'expo-haptics';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConfidenceControl, naturalFrequencyFor } from './ConfidenceControl';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

beforeEach(() => jest.clearAllMocks());

describe('naturalFrequencyFor', () => {
  it('pairs a percentage with a frequency people can picture', () => {
    expect(naturalFrequencyFor(70)).toBe('about 7 times in 10');
    expect(naturalFrequencyFor(10)).toBe('about 1 time in 10');
    expect(naturalFrequencyFor(50)).toBe('a coin flip');
    expect(naturalFrequencyFor(0)).toBe('never');
    expect(naturalFrequencyFor(100)).toBe('every time');
    expect(naturalFrequencyFor(95)).toBe('almost every time');
    expect(naturalFrequencyFor(5)).toBe('about 1 time in 10');
    expect(naturalFrequencyFor(75)).toBe('about 3 times in 4');
    expect(naturalFrequencyFor(25)).toBe('about 1 time in 4');
    // Halfway steps name both neighbours instead of rounding up.
    expect(naturalFrequencyFor(85)).toBe('8 or 9 times in 10');
    expect(naturalFrequencyFor(35)).toBe('3 or 4 times in 10');
  });
});

describe('ConfidenceControl', () => {
  it('shows the value large, with its frequency', () => {
    render(<ConfidenceControl value={70} onChange={jest.fn()} />);
    expect(screen.getByTestId('confidence-readout')).toHaveTextContent('70%');
    expect(screen.getByText('about 7 times in 10')).toBeTruthy();
  });

  it('snaps slider moves to 5% steps and plays a detent per change', () => {
    const onChange = jest.fn();
    render(<ConfidenceControl value={50} onChange={onChange} />);
    fireEvent(
      screen.getByTestId('confidence-slider', { includeHiddenElements: true }),
      'valueChange',
      63,
    );
    expect(onChange).toHaveBeenCalledWith(65);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('plays no detent when the value does not change', () => {
    const onChange = jest.fn();
    render(<ConfidenceControl value={100} onChange={onChange} />);
    fireEvent.press(screen.getByTestId('confidence-increment'));
    expect(onChange).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('respects a narrower range (the Warmup runs 50–100)', () => {
    const onChange = jest.fn();
    render(<ConfidenceControl value={50} onChange={onChange} min={50} />);
    fireEvent.press(screen.getByTestId('confidence-decrement'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the honest-uncertainty band only when asked', () => {
    const { rerender } = render(<ConfidenceControl value={50} onChange={jest.fn()} />);
    expect(screen.queryByTestId('integrity-zone', { includeHiddenElements: true })).toBeNull();
    rerender(<ConfidenceControl value={50} onChange={jest.fn()} showIntegrityZone />);
    expect(screen.getByTestId('integrity-zone', { includeHiddenElements: true })).toBeTruthy();
  });

  it('stays one adjustable element for VoiceOver', () => {
    render(<ConfidenceControl value={40} onChange={jest.fn()} />);
    const control = screen.getByTestId('confidence-adjustable');
    expect(control.props.accessibilityRole).toBe('adjustable');
    expect(control.props.accessibilityValue.text).toBe('40%');
  });

  // Roadmap D13: nothing preset, so "didn't touch it" can't pass for a choice.
  describe('before anything is set', () => {
    const slider = () => screen.getByTestId('confidence-slider', { includeHiddenElements: true });

    it('reads as empty, with the thumb resting grey mid-range', () => {
      render(<ConfidenceControl value={null} onChange={jest.fn()} min={50} />);
      expect(screen.getByTestId('confidence-readout')).toHaveTextContent('—%');
      expect(screen.getByText('not set yet')).toBeTruthy();
      expect(slider().props.value).toBe(75);
      expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.text).toBe(
        'not set',
      );
    });

    it('steps ±5 from the middle of the range', () => {
      const onChange = jest.fn();
      render(<ConfidenceControl value={null} onChange={onChange} />);
      fireEvent.press(screen.getByTestId('confidence-increment'));
      expect(onChange).toHaveBeenLastCalledWith(55);
      fireEvent.press(screen.getByTestId('confidence-decrement'));
      expect(onChange).toHaveBeenLastCalledWith(45);
    });

    it('takes a touch of the resting thumb as a choice, once', () => {
      const onChange = jest.fn();
      render(<ConfidenceControl value={null} onChange={onChange} />);
      fireEvent(slider(), 'slidingComplete', 50);
      expect(onChange).toHaveBeenCalledWith(50);
      expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    });

    it('counts a slide and its completion as one step', () => {
      const onChange = jest.fn();
      render(<ConfidenceControl value={null} onChange={onChange} />);
      fireEvent(slider(), 'valueChange', 70);
      fireEvent(slider(), 'slidingComplete', 70);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    });

    it('ignores completion once a value is set', () => {
      const onChange = jest.fn();
      render(<ConfidenceControl value={60} onChange={onChange} />);
      fireEvent(slider(), 'slidingComplete', 60);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
