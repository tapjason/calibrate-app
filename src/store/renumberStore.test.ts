import { useRenumberStore } from './renumberStore';

describe('renumberStore (step 179)', () => {
  const edits = { title: 'Swim 50 lengths', category: 'health' as const, dueIso: '2026-11-16T12:00:00.000Z' };

  it('hands Edit\'s values to Log once', () => {
    useRenumberStore.getState().hand('p1', edits);
    expect(useRenumberStore.getState().take('p1')).toEqual(edits);
    expect(useRenumberStore.getState().take('p1')).toBeNull();
  });

  it('gives nothing for another prediction, and forgets them', () => {
    useRenumberStore.getState().hand('p1', edits);
    expect(useRenumberStore.getState().take('p2')).toBeNull();
    expect(useRenumberStore.getState().take('p1')).toBeNull();
  });
});
