// The shape `expo-age-range` answers with, pinned at the level
// src/age/ageRange.ts reads it (review 2026-11-19, round 2, item 3).
//
// `bucketFromResponse` reads `lowerBound` and `upperBound` straight off the
// object `requestAgeRangeAsync` resolves with, each a whole number or null,
// and treats anything else as no band, which `askApple` handles like a
// decline. So an upgrade that moved or renamed those fields, or wrapped the
// answer, would fail open: every fresh install would run with no rule, and
// nothing would say so.
//
// How it fails: the first block below is types only. `tsc --noEmit`, the
// first step of `bash scripts/check.sh`, stops on this file when the
// installed package's types change shape: "Type 'false' does not satisfy the
// constraint 'true'" at the `pin` that no longer holds, or "Property
// 'lowerBound' does not exist" / "does not satisfy the constraint" for a
// field that is gone. Jest alone (Babel) doesn't check types, so the second
// block reads the package's native iOS record, which the TypeScript types
// only describe, for the same two fields.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { AgeRangeRequest, AgeRangeResponse, requestAgeRangeAsync } from 'expo-age-range';

/** True only when A and B are the same type (optional and readonly flags included). */
type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Compiles only when its type argument is `true`. */
function pin<T extends true>(): T | undefined {
  return undefined;
}

describe('the installed expo-age-range answers in the shape ageRange.ts reads', () => {
  it('its types: lowerBound and upperBound are required, each a number or null, on the resolved value itself', () => {
    // The two fields, required, with exactly these types.
    pin<
      Exactly<
        Pick<AgeRangeResponse, 'lowerBound' | 'upperBound'>,
        { lowerBound: number | null; upperBound: number | null }
      >
    >();
    // The function resolves with that object, not a wrapper around it.
    pin<Exactly<Awaited<ReturnType<typeof requestAgeRangeAsync>>, AgeRangeResponse>>();
    // It takes one options object with the three gates ageRange.ts passes.
    pin<Exactly<Parameters<typeof requestAgeRangeAsync>, [options: AgeRangeRequest]>>();
    pin<Exactly<AgeRangeRequest['threshold1'], number>>();
    pin<Exactly<AgeRangeRequest['threshold2'], number | undefined>>();
    pin<Exactly<AgeRangeRequest['threshold3'], number | undefined>>();

    // Something for Jest to run: the pins above are checked by tsc.
    const sample: AgeRangeResponse = { lowerBound: null, upperBound: 12 };
    expect(sample).toEqual({ lowerBound: null, upperBound: 12 });
  });

  it('its native iOS record still carries lowerBound and upperBound as optional whole numbers', () => {
    const pkg = require.resolve('expo-age-range/package.json');
    const swift = readFileSync(join(dirname(pkg), 'ios', 'AgeRangeRecords.swift'), 'utf8');
    const record = /struct\s+AgeRangeResponse\s*:\s*Record\s*\{([\s\S]*?)\n\}/.exec(swift)?.[1] ?? '';

    expect(record).toMatch(/@Field\s+var\s+lowerBound\s*:\s*Int\?/);
    expect(record).toMatch(/@Field\s+var\s+upperBound\s*:\s*Int\?/);
    // Filled from Apple's own bounds on iOS 26.
    expect(record).toMatch(/self\.lowerBound\s*=\s*range\.lowerBound/);
    expect(record).toMatch(/self\.upperBound\s*=\s*range\.upperBound/);
  });
});
