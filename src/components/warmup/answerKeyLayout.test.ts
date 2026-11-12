import { answerKeyStacks } from './answerKeyLayout';

// Blind playtest 2026-11-12e, finding 12: at double text size the answer
// key's text kept a third of the row, one word a line.
describe('answerKeyStacks', () => {
  it('never stacks at the default text size, however narrow', () => {
    expect(answerKeyStacks(0, 1)).toBe(false);
    expect(answerKeyStacks(240, 1)).toBe(false);
    expect(answerKeyStacks(335, 1)).toBe(false);
  });

  it('always stacks at the large sizes', () => {
    expect(answerKeyStacks(0, 1.35)).toBe(true);
    expect(answerKeyStacks(800, 2)).toBe(true);
  });

  it('stacks a little larger only when the text would be narrow', () => {
    // 320 wide, the Warm-up's 280 pt row: 280 − (18 + 20 + 44) leaves 198.
    expect(answerKeyStacks(280, 1.235)).toBe(true);
    // 375 wide, a 335 pt row leaves 253.
    expect(answerKeyStacks(335, 1.235)).toBe(false);
    // Before the row is laid out, side by side.
    expect(answerKeyStacks(0, 1.235)).toBe(false);
  });
});
