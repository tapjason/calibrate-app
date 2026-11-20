import * as copy from './localOnlyCopy';

// The words the screens show under the under-13 rule (roadmap D70;
// docs/design/research/under-13-2026-11.md, "The words").

/** Every string the module exports, by name. */
const strings: Array<[string, string]> = Object.entries(copy as Record<string, unknown>).flatMap(
  ([name, value]) => (typeof value === 'string' ? [[name, value] as [string, string]] : []),
);

describe('localOnlyCopy', () => {
  it('exports every string the spec lists', () => {
    expect(strings.map(([name]) => name).sort()).toEqual(
      [
        'LOCAL_ONLY_ACCOUNT_BODY',
        'LOCAL_ONLY_ACCOUNT_TITLE',
        'LOCAL_ONLY_CLOSE',
        'LOCAL_ONLY_COACH',
        'LOCAL_ONLY_FROZEN_ACCOUNT_TITLE',
        'LOCAL_ONLY_FROZEN_FOOTER',
        'LOCAL_ONLY_GUEST_FOOTER',
        'LOCAL_ONLY_GUEST_ROW',
        'LOCAL_ONLY_GUEST_WHERE',
        'LOCAL_ONLY_PAYWALL_BODY',
        'LOCAL_ONLY_PAYWALL_TITLE',
        'LOCAL_ONLY_SIGN_IN',
      ].sort(),
    );
  });

  // The app never says an age more precisely than "the age range": no number,
  // and no word for a child, on any of these screens.
  it.each(strings)('%s names no age', (_name, text) => {
    expect(text).not.toMatch(/\d|under|child|kid|young/i);
    expect(text.length).toBeGreaterThan(0);
  });

  // DESIGN_SYSTEM: no "→" in text.
  it.each(strings)('%s has no arrow', (_name, text) => {
    expect(text).not.toMatch(/→/);
  });

  it('says the spec’s words, word for word', () => {
    expect(copy.LOCAL_ONLY_GUEST_ROW).toBe('Kept on this phone');
    expect(copy.LOCAL_ONLY_GUEST_FOOTER).toBe(
      'Because of the age range this iPhone shares with Fairly Sure, everything you log stays on this phone. Accounts, backup, usage counts, Coach and Plus are off. Your predictions, score, badges and cards work as usual, and Export predictions keeps a copy.',
    );
    // In words, as Delete account gives Sign in with Apple's path: no "→" in
    // the app's text (review 2026-11-19).
    expect(copy.LOCAL_ONLY_GUEST_WHERE).toBe(
      "The age range comes from this iPhone's Apple Account. To see it, open Settings, tap your name, then Personal Information, then Age Range for Apps.",
    );
    expect(copy.LOCAL_ONLY_FROZEN_FOOTER).toBe(
      'Backup is off on this phone because of the age range it shares with Fairly Sure, so new changes stay here. What was backed up before stays on our server until you delete the account. Signing out removes your predictions from this phone, so export them first if you want a copy.',
    );
    expect(copy.LOCAL_ONLY_COACH).toBe(
      'Coach is off on this phone because of the age range it shares with Fairly Sure.',
    );
    expect(copy.LOCAL_ONLY_PAYWALL_TITLE).toBe("Plus isn't offered on this phone");
    expect(copy.LOCAL_ONLY_PAYWALL_BODY).toBe(
      'Because of the age range this iPhone shares with Fairly Sure, purchases are off here. Your score, chart, badges and cards are free.',
    );
    expect(copy.LOCAL_ONLY_ACCOUNT_TITLE).toBe('No account on this phone');
    expect(copy.LOCAL_ONLY_ACCOUNT_BODY).toBe(
      'Because of the age range this iPhone shares with Fairly Sure, your predictions stay on this phone. To keep a copy, use Export predictions in You.',
    );
    // A frozen account on the account route (review 2026-11-19); its body is
    // LOCAL_ONLY_FROZEN_FOOTER, above.
    expect(copy.LOCAL_ONLY_FROZEN_ACCOUNT_TITLE).toBe('Backup is off on this phone');
    expect(copy.LOCAL_ONLY_CLOSE).toBe('Close');
    expect(copy.LOCAL_ONLY_SIGN_IN).toBe(
      'Accounts are off on this phone because of the age range it shares with Fairly Sure.',
    );
  });
});
