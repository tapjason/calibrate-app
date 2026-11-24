// Presentation helper: the key Answer it now's confirmation passes to Resolve
// when it has just said an answer today isn't scored (roadmap D56), and the
// check Resolve makes on it. Today only: a restored link on a later day shows
// Resolve's own note again.

/**
 * The warning itself, before a same-day answer (roadmap D41): Answer it now's
 * confirmation and Resolve's own note say it in the same words (D76, the voice
 * pass, 2026-11-23). A prediction reworded on a later day than it was logged
 * says so (D45).
 */
export function sameDayHeadsUp(reworded: boolean): string {
  return `Heads up: an answer today won't count, because you ${reworded ? 'reworded' : 'logged'} it today. Tomorrow it will.`;
}

/** "2026-11-10": the local calendar day, with no spaces to encode. */
export function warnedKey(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Whether a route's `warned` value is today's key (an array: its first). */
export function sameDayWarned(
  param: string | string[] | undefined,
  now: Date = new Date(),
): boolean {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== 'string' || value.length === 0) return false;
  let key: string;
  try {
    key = decodeURIComponent(value);
  } catch {
    return false;
  }
  return key === warnedKey(now);
}
