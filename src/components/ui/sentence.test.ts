import { endSentence } from './sentence';

describe('endSentence', () => {
  it('adds one full stop, never a second', () => {
    expect(endSentence('due Fri, Nov 13')).toBe('due Fri, Nov 13.');
    expect(endSentence('due sáb, 14 nov.')).toBe('due sáb, 14 nov.');
    expect(endSentence('at 7:00 p. m.')).toBe('at 7:00 p. m.');
    expect(endSentence('at 7:00 PM ')).toBe('at 7:00 PM.');
  });
});
