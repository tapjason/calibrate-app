import { digestBody, REMINDER_ACTIONS, reminderBodyWithoutWords } from './copy';

describe('reminder actions', () => {
  it('offers Happened and Didn\'t, in the foreground, and no skip', () => {
    expect(REMINDER_ACTIONS.map((action) => action.buttonTitle)).toEqual(['Happened', "Didn't"]);
    expect(REMINDER_ACTIONS.map((action) => action.identifier)).toEqual(['happened', 'didnt']);
    expect(REMINDER_ACTIONS.every((action) => action.options.opensAppToForeground)).toBe(true);
  });
});

describe('digestBody', () => {
  it('never mentions the streak or tells the user what to tap', () => {
    for (const n of [0, 1, 5]) {
      expect(digestBody(n)).not.toMatch(/streak|tap/i);
    }
  });

  it('counts open predictions in plain sentences', () => {
    expect(digestBody(1)).toBe('1 prediction is open.');
    expect(digestBody(3)).toBe('3 predictions are open.');
  });
});

// Roadmap D60 (b), every reminder since 2026-11-25: nothing written on the
// lock screen. The stated confidence rides along so a resolve from the
// notification still sees what was said before the outcome (§7.10).
describe('reminderBodyWithoutWords', () => {
  it('names the day it was made and the number, nothing written', () => {
    const made = new Date(2026, 10, 6, 9);
    expect(reminderBodyWithoutWords(made.toISOString(), 70)).toBe(
      `Your prediction from ${made.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · You said 70%`,
    );
  });

  it('falls back without a readable date', () => {
    expect(reminderBodyWithoutWords('nonsense', 55)).toBe('Your prediction · You said 55%');
  });
});
