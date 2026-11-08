import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { colors, space, tabularNums, type } from '@/constants/theme';

/**
 * Whether a field's count is shown: in its last fifth, and never fewer than
 * the last ten characters. Exported for tests.
 */
export function showLength(length: number, max: number): boolean {
  return length >= max - Math.max(10, Math.round(max / 5));
}

/** "180 of 200", or at the limit, that it is one. Exported for tests. */
export function lengthText(length: number, max: number): string {
  return length >= max ? `${max} of ${max}, the most it takes` : `${length} of ${max}`;
}

interface LengthCounterProps {
  length: number;
  max: number;
  testID?: string;
}

/**
 * A field's character count, shown only near its limit. Typing past a limit
 * did nothing and said nothing: a 200-character prediction ended
 * "…chargebacks, and", a reflection stopped at 500, and a category name lost
 * the emoji that would have been its 25th character (playtest 2026-11-08,
 * finding 20).
 */
export function LengthCounter({ length, max, testID }: LengthCounterProps) {
  // Said once as the field fills, so a VoiceOver user doesn't type on into
  // silence either.
  const wasFull = useRef(length >= max);
  useEffect(() => {
    const full = length >= max;
    if (full && !wasFull.current) {
      AccessibilityInfo.announceForAccessibility(`${max} characters, the most it takes.`);
    }
    wasFull.current = full;
  }, [length, max]);
  if (!showLength(length, max)) return null;
  return (
    <Text style={[styles.count, length >= max && styles.full]} testID={testID}>
      {lengthText(length, max)}
    </Text>
  );
}

const styles = StyleSheet.create({
  count: {
    ...type.footnote,
    ...tabularNums,
    alignSelf: 'flex-end',
    color: colors.textSecondary,
    marginTop: space.xs,
  },
  full: { color: colors.textPrimary, fontWeight: '600' },
});
