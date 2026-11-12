import { dropsJustSaved } from './justSavedMark';

// Roadmap D48: only Today keeps the mark; You included, since a reminder's
// Resolve can open over it and "Log it again" closes onto it.
describe('dropsJustSaved', () => {
  it('keeps the mark for Today and drops it on every other tab', () => {
    expect(dropsJustSaved('index')).toBe(false);
    for (const tab of ['insights', 'history', 'you']) expect(dropsJustSaved(tab)).toBe(true);
  });
});

