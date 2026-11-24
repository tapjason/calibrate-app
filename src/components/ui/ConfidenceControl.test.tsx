import * as Haptics from 'expo-haptics';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CONFIDENCE_EMPTY_READOUT, ConfidenceControl, naturalFrequencyFor } from './ConfidenceControl';

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
    expect(naturalFrequencyFor(70)).toBe('about 7 times in\u00A010');
    expect(naturalFrequencyFor(10)).toBe('about 1 time in\u00A010');
    expect(naturalFrequencyFor(50)).toBe('a coin flip');
    expect(naturalFrequencyFor(0)).toBe('never');
    expect(naturalFrequencyFor(100)).toBe('every time');
    // In twenties, not "almost every time" and "1 in 10" (record audit, 2026-11-09).
    expect(naturalFrequencyFor(95)).toBe('about 19 times in\u00A020');
    expect(naturalFrequencyFor(5)).toBe('about 1 time in\u00A020');
    expect(naturalFrequencyFor(75)).toBe('about 3 times in\u00A04');
    expect(naturalFrequencyFor(25)).toBe('about 1 time in\u00A04');
    // Halfway steps name both neighbours instead of rounding up.
    expect(naturalFrequencyFor(85)).toBe('8 or 9 times in\u00A010');
    expect(naturalFrequencyFor(35)).toBe('3 or 4 times in\u00A010');
  });
});

describe('ConfidenceControl', () => {
  it('shows the value large, with its frequency', () => {
    render(<ConfidenceControl value={70} onChange={jest.fn()} />);
    expect(screen.getByTestId('confidence-readout')).toHaveTextContent('70%');
    expect(screen.getByText('about 7 times in\u00A010')).toBeTruthy();
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

  it('respects a narrower range when one is given', () => {
    const onChange = jest.fn();
    render(<ConfidenceControl value={50} onChange={onChange} min={50} />);
    fireEvent.press(screen.getByTestId('confidence-decrement'));
    expect(onChange).not.toHaveBeenCalled();
  });

  // The owner, 2026-11-23: "the minimum should never be 50%". The two-choice
  // questions run 0–100 like Log, so a number under 50 can be said.
  it('goes below 50 on the full range', () => {
    const onChange = jest.fn();
    render(<ConfidenceControl value={10} onChange={onChange} />);
    fireEvent.press(screen.getByTestId('confidence-decrement'));
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  // Roadmap D23: no confidence is marked or rewarded for being a number.
  it('draws no honest-uncertainty band', () => {
    render(<ConfidenceControl value={50} onChange={jest.fn()} />);
    expect(screen.queryByTestId('integrity-zone', { includeHiddenElements: true })).toBeNull();
  });

  // Blind playtest 2026-11-12, finding 2: Voice Control users say what they
  // see, so the steppers are named "+5" and "−5", the wording in the hint.
  it('names the steppers with their visible text', () => {
    render(<ConfidenceControl value={50} onChange={jest.fn()} />);
    const up = screen.getByTestId('confidence-increment');
    const down = screen.getByTestId('confidence-decrement');
    expect(up.props.accessibilityLabel).toBe('+5');
    expect(down.props.accessibilityLabel).toBe('−5');
    expect(up.props.accessibilityHint).toBe('Raises the confidence by 5');
    expect(down.props.accessibilityHint).toBe('Lowers the confidence by 5');
  });

  it('stays one adjustable element for VoiceOver', () => {
    render(<ConfidenceControl value={40} onChange={jest.fn()} />);
    const control = screen.getByTestId('confidence-adjustable');
    expect(control.props.accessibilityRole).toBe('adjustable');
    expect(control.props.accessibilityValue.text).toBe('40%');
  });

  // react-native-web drops accessibilityValue: on web the slider had no value.
  it('carries its value in aria props too, for the web build', () => {
    render(<ConfidenceControl value={40} onChange={jest.fn()} min={50} />);
    const control = screen.getByTestId('confidence-adjustable');
    expect(control.props).toMatchObject({
      'aria-valuemin': 50,
      'aria-valuemax': 100,
      'aria-valuenow': 40,
      'aria-valuetext': '40%',
    });
  });

  // Roadmap D13: nothing preset, so "didn't touch it" can't pass for a choice.
  describe('before anything is set', () => {
    const slider = () => screen.getByTestId('confidence-slider', { includeHiddenElements: true });

    // The owner, 2026-11-23: no "—%" and no "not set yet". The readout asks
    // instead; the spoken value still says nothing is set.
    it('reads "Slide to set" in the number\'s place, with the thumb resting grey at the coin flip', () => {
      render(<ConfidenceControl value={null} onChange={jest.fn()} />);
      expect(screen.getByTestId('confidence-readout')).toHaveTextContent(CONFIDENCE_EMPTY_READOUT);
      expect(CONFIDENCE_EMPTY_READOUT).toBe('Slide to set');
      expect(screen.queryByText('—%')).toBeNull();
      expect(screen.queryByText('not set yet')).toBeNull();
      expect(slider().props.value).toBe(50);
      expect(screen.getByTestId('confidence-adjustable').props.accessibilityValue.text).toBe(
        'not set',
      );
    });

    // The readout's slot keeps the number's height, so the row doesn't jump
    // when the first number arrives.
    it("holds the number's height while empty", () => {
      // The nearest holder above the readout that sets a minimum height.
      const slotHeight = () => {
        type Node = { props: { style?: unknown }; parent: Node | null };
        let node = (screen.getByTestId('confidence-readout') as unknown as Node).parent;
        while (node) {
          const flat = [node.props.style].flat(Infinity) as Array<Record<string, unknown> | undefined>;
          const merged = Object.assign({}, ...flat.filter(Boolean)) as Record<string, unknown>;
          if (typeof merged.height === 'number') return merged.height;
          node = node.parent;
        }
        return undefined;
      };
      // Normal text: the number's line is type.readout's 56.
      const dims = jest
        .spyOn(require('react-native/Libraries/Utilities/useWindowDimensions'), 'default')
        .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
      try {
        const { rerender } = render(<ConfidenceControl value={null} onChange={jest.fn()} />);
        const empty = slotHeight();
        expect(empty).toBe(56);
        rerender(<ConfidenceControl value={70} onChange={jest.fn()} />);
        expect(slotHeight()).toBe(empty);
      } finally {
        dims.mockRestore();
      }
    });

    // Owner, 2026-11-23: the gloss always on its own line, so the whole block
    // is one height, empty or set, at every number and width.
    it('keeps one block height, gloss line included, at every number and width', () => {
      const heightOf = () => {
        const flat = [screen.getByTestId('confidence-readout-block').props.style].flat(Infinity) as Array<
          Record<string, unknown> | undefined
        >;
        return Object.assign({}, ...flat.filter(Boolean)).height as number;
      };
      for (const width of [320, 375]) {
        const dims = jest
          .spyOn(require('react-native/Libraries/Utilities/useWindowDimensions'), 'default')
          .mockReturnValue({ width, height: 844, scale: 3, fontScale: 1 });
        try {
          const { rerender, unmount } = render(<ConfidenceControl value={null} onChange={jest.fn()} />);
          const empty = heightOf();
          expect(empty).toBe(56 + 20);
          expect(screen.queryByTestId('confidence-gloss')).toBeNull();
          for (const v of [0, 5, 25, 45, 50, 75, 95, 100]) {
            rerender(<ConfidenceControl value={v} onChange={jest.fn()} />);
            expect(heightOf()).toBe(empty);
            expect(screen.getByTestId('confidence-gloss')).toBeTruthy();
          }
          unmount();
        } finally {
          dims.mockRestore();
        }
      }
    });

    // Roadmap D49 (blind playtest 2026-11-09b): the first ±5 steps from the
    // coin flip on every screen, as VoiceOver's first swipe does.
    it('steps from the coin flip on the first ±5', () => {
      const onChange = jest.fn();
      const { rerender } = render(<ConfidenceControl value={null} onChange={onChange} />);
      fireEvent.press(screen.getByTestId('confidence-decrement'));
      expect(onChange).toHaveBeenLastCalledWith(45);
      rerender(<ConfidenceControl value={null} onChange={onChange} />);
      fireEvent.press(screen.getByTestId('confidence-increment'));
      expect(onChange).toHaveBeenLastCalledWith(55);
      // A narrower range that starts at the coin flip still rests there: +5 is
      // 55, and −5 sets 50.
      rerender(<ConfidenceControl value={null} onChange={onChange} min={50} />);
      fireEvent.press(screen.getByTestId('confidence-increment'));
      expect(onChange).toHaveBeenLastCalledWith(55);
      rerender(<ConfidenceControl value={null} onChange={onChange} min={50} />);
      fireEvent.press(screen.getByTestId('confidence-decrement'));
      expect(onChange).toHaveBeenLastCalledWith(50);
    });

    it("VoiceOver's first swipe down from empty says 45, as the ±5 does", () => {
      const onChange = jest.fn();
      render(<ConfidenceControl value={null} onChange={onChange} />);
      fireEvent(screen.getByTestId('confidence-adjustable'), 'accessibilityAction', {
        nativeEvent: { actionName: 'decrement' },
      });
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

  it('keeps the inline ±5 level with the number when the frequency wraps (playtest 2026-11-13b, run 8)', () => {
    // A 390pt phone at normal text, where the steppers share the number's row.
    const dims = jest
      .spyOn(require('react-native/Libraries/Utilities/useWindowDimensions'), 'default')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    render(<ConfidenceControl value={80} onChange={jest.fn()} />);
    dims.mockRestore();
    // Walk up from +5 to the holder that pins it to the readout's first line.
    type Node = { props: { style?: unknown }; parent: Node | null };
    let node = screen.getByTestId('confidence-increment') as unknown as Node | null;
    let pinned = false;
    while (node) {
      const flat = [node.props.style].flat(Infinity) as Array<Record<string, unknown> | undefined>;
      const merged = Object.assign({}, ...flat.filter(Boolean)) as Record<string, unknown>;
      if (merged.minHeight === 56 && merged.justifyContent === 'center') pinned = true;
      node = node.parent;
    }
    expect(pinned).toBe(true);
  });
});

describe('ConfidenceControl steps, said aloud (D62)', () => {
  it('announces the new number after each step', () => {
    const { AccessibilityInfo } = jest.requireActual('react-native') as typeof import('react-native');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<ConfidenceControl value={70} onChange={jest.fn()} />);
    fireEvent.press(screen.getByTestId('confidence-increment'));
    expect(announce).toHaveBeenCalledWith('75%, about 3 times in\u00A04');
    announce.mockRestore();
  });

  it('says nothing when the step changes nothing', () => {
    const { AccessibilityInfo } = jest.requireActual('react-native') as typeof import('react-native');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<ConfidenceControl value={100} onChange={jest.fn()} />);
    fireEvent.press(screen.getByTestId('confidence-increment'));
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });
});
