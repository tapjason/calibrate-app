import { dropsJustSaved, showsSavedNotice } from './justSavedMark';

// Roadmap D48: only Today keeps the mark; You included, since a reminder's
// Resolve can open over it and "Log it again" closes onto it.
describe('dropsJustSaved', () => {
  it('keeps the mark for Today and drops it on every other tab', () => {
    expect(dropsJustSaved('index')).toBe(false);
    for (const tab of ['insights', 'history', 'you']) expect(dropsJustSaved(tab)).toBe(true);
  });
});

// Blind playtests 2026-11-12c and -12d: a save from Insights or History gave no
// sign it worked.
describe('showsSavedNotice', () => {
  it('shows on the two other tabs with a "+", not Today or You', () => {
    expect(showsSavedNotice('insights')).toBe(true);
    expect(showsSavedNotice('history')).toBe(true);
    expect(showsSavedNotice('index')).toBe(false);
    expect(showsSavedNotice('you')).toBe(false);
  });
});
