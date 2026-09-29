import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

interface CountUpProps {
  value: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
  /** Milliseconds for a change to play out. DESIGN_SYSTEM §6.1 `reveal`: 700. */
  duration?: number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * A number that rolls to its new value when it changes — "animate the number
 * in sync with the moment" (DESIGN_SYSTEM §6.2). It does *not* count up on
 * first render: a score you already had shouldn't re-perform every time you
 * open the screen, only when a resolution actually moves it.
 *
 * Screen readers get the final value straight away; the roll is visual only.
 * Reduce Motion jumps to the value.
 */
export function CountUp({ value, style, testID, duration = 700 }: CountUpProps) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    if (reduceMotion) {
      setShown(value);
      return;
    }
    const t0 = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / duration);
      setShown(Math.round(start + (value - start) * easeOutCubic(t)));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, duration, reduceMotion]);

  return (
    <Text style={style} testID={testID} accessibilityLabel={String(value)}>
      {shown}
    </Text>
  );
}
