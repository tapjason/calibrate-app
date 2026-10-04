import { act, render, screen } from '@testing-library/react-native';

import { CountUp } from './CountUp';

describe('CountUp', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the value at once on first render — no re-performing on every visit', () => {
    render(<CountUp value={83} testID="n" />);
    expect(screen.getByTestId('n').props.children).toBe(83);
  });

  it('rolls to a new value and lands exactly on it', () => {
    const { rerender } = render(<CountUp value={70} testID="n" duration={700} />);
    rerender(<CountUp value={80} testID="n" duration={700} />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('n').props.children).toBe(80);
  });

  it('gives screen readers the final value straight away', () => {
    const { rerender } = render(<CountUp value={70} testID="n" />);
    rerender(<CountUp value={80} testID="n" />);
    expect(screen.getByTestId('n').props.accessibilityLabel).toBe('80');
  });
});

describe('CountUp from', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rolls up from the starting number on first render, for a reveal', () => {
    render(<CountUp value={64} from={0} testID="n" duration={700} />);
    expect(screen.getByTestId('n').props.children).toBe(0);
    expect(screen.getByTestId('n').props.accessibilityLabel).toBe('64');
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('n').props.children).toBe(64);
  });
});
