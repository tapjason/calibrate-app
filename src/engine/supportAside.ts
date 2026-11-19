// Setting the Coach's support card aside (main session decision 2026-11-19).
//
// The Coach's crisis pre-filter (src/ai/crisisFilter.ts) scans the title and
// note of every answered prediction on each request, and a match replaces the
// Coach with a support card. An answered prediction can't be deleted after
// its 24 hours, so one false positive would lock a paying customer out of the
// Coach for good. The person can set the card aside: each answered
// prediction that tripped the filter is remembered by a key, and left out of
// the scan from then on. The card comes back when new matching words appear:
// another prediction, or a change to that one's title or note (its key no
// longer matches). No free text is sent to the Coach either way.
//
// A key is the prediction's id and a small non-cryptographic hash of its
// title and note. Not a secret and not a check against tampering: it only
// tells whether those words have changed since they were set aside. Two
// 32-bit FNV-1a lanes with different offsets give 64 bits, so a changed note
// keeps its old key about once in 2^64 changes. The words themselves are
// never stored; the keys stay on the phone (settingsStore).
//
// Layer rule: L3. Pure; imports @/types only.

import { SUPPORT_ASIDE_MAX_KEYS, type Prediction } from '@/types';

/** What a key is made from: the id, the title and the note. */
export type SupportAsideSource = Pick<Prediction, 'id' | 'title' | 'reflection'>;

const FNV_PRIME = 0x01000193;
/** FNV-1a's standard offset basis, and a second one for the other lane. */
const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x050c5d1f;

function fnv1a(text: string, offset: number): number {
  let hash = offset >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

const hex8 = (n: number) => n.toString(16).padStart(8, '0');

/** A key as `supportAsideKey` writes it: anything, then `#` and 16 hex digits. */
const KEY_SHAPE = /^[\s\S]{1,200}#[0-9a-f]{16}$/;

/**
 * The key a set-aside is kept under: `<id>#<16 hex digits>`, the hash over
 * the title and the note together (JSON, so no two different pairs read
 * alike). A note that is empty reads as none, so clearing a note to "" or
 * removing it gives the same key.
 */
export function supportAsideKey(prediction: SupportAsideSource): string {
  const note = prediction.reflection ? prediction.reflection : null;
  const words = JSON.stringify([prediction.title ?? '', note]);
  return `${prediction.id}#${hex8(fnv1a(words, OFFSET_A))}${hex8(fnv1a(words, OFFSET_B))}`;
}

/** Whether `value` reads as a key `supportAsideKey` could have written. */
export function isSupportAsideKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_SHAPE.test(value);
}

/**
 * `existing` with `added` after it, each key once, oldest first; at most
 * `max` (SUPPORT_ASIDE_MAX_KEYS, 200), the oldest dropped first. A key added
 * again moves to the newest end. Anything that isn't a key is left out.
 */
export function withSupportAsideKeys(
  existing: readonly unknown[],
  added: readonly unknown[] = [],
  max: number = SUPPORT_ASIDE_MAX_KEYS,
): string[] {
  const order = new Map<string, true>();
  for (const key of [...existing, ...added]) {
    if (!isSupportAsideKey(key)) continue;
    order.delete(key);
    order.set(key, true);
  }
  const keys = [...order.keys()];
  const limit = Math.max(0, Math.floor(max));
  return keys.length > limit ? keys.slice(keys.length - limit) : keys;
}
