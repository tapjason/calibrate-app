import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { DISPLAY_MAX_SCALE } from '@/constants/theme';

interface CountUpProps {
  value: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
  /** Milliseconds for a change to play out. DESIGN_SYSTEM §6.1 `reveal`: 700. */
  duration?: number;
  /**
   * Roll up from this number on first render. Only for a reveal moment (the
   * Warmup verdict, a streak checkpoint), where the number is new; leave it
   * out everywhere else.
   */
  from?: number;
  /** How each number is written: `localCount` groups a streak's "1,095". Plain digits by default. */
  format?: (n: number) => string;
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
export function CountUp({
  value,
  style,
  testID,
  duration = 700,
  from: initial,
  format,
}: CountUpProps) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? value : (initial ?? value));
  // What's on screen, so a roll starts there: from a roll cut short, or from
  // `from` when an effect runs twice before the first frame (React's
  // development double run would otherwise skip a reveal).
  const showing = useRef(shown);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = showing.current;
    if (start === value) return;
    if (reduceMotion) {
      showing.current = value;
      setShown(value);
      return;
    }
    const t0 = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / duration);
      const next = Math.round(start + (value - start) * easeOutCubic(t));
      showing.current = next;
      setShown(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, duration, reduceMotion]);

  return (
    <Text
      style={style}
      testID={testID}
      accessibilityLabel={format ? format(value) : String(value)}
      maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
    >
      {format ? format(shown) : shown}
    </Text>
  );
}
