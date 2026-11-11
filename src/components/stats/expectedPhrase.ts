// Presentation helper: an expected count in words, shared by Wrapped, practice
// and the chart's headline (roadmap D57).

/**
 * An expected count for reading: "about 2", "2 or 3", "about 14", "less than
 * 1". Below 10 a count near a half says both neighbours, as the confidence
 * readout does ("8 or 9 times in 10"): 2.45 read as "about 2" to one blind
 * tester, and "about 1.5" puzzled another (2026-10-09). From 10, whole numbers.
 * No-break spaces keep the number with its words.
 */
export function expectedPhrase(expected: number): string {
  const half = Math.round(expected * 2) / 2;
  if (half < 1) return 'less than\u00A01';
  if (expected < 10 && half % 1 !== 0) {
    const lo = Math.floor(half);
    return `${lo}\u00A0or\u00A0${lo + 1}`;
  }
  return `about\u00A0${Math.round(expected)}`;
}
