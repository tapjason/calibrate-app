/**
 * What a disabled Save is waiting for, in the form's own words ("To save, add
 * a category and a confidence."), or null when nothing is. A greyed-out Save
 * said nothing about why (blind playtest 2026-11-01, run 4). Pass only the
 * fields the form has: Edit has no confidence to set.
 */
export function stillNeeded(has: {
  title: boolean;
  category?: boolean;
  confidence?: boolean;
}): string | null {
  const parts = [
    has.title ? null : 'the prediction',
    has.category === false ? 'a category' : null,
    has.confidence === false ? 'a confidence' : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `To save, add ${list}.`;
}
