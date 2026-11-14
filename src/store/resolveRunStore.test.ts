import {
  __setResolveRunPersistenceForTests,
  freshRun,
  type KeptRun,
  RUN_KEEP_HOURS,
  useResolveRunStore,
} from './resolveRunStore';

let stored: KeptRun | null = null;
beforeEach(() => {
  stored = null;
  __setResolveRunPersistenceForTests({
    load: async () => stored,
    save: async (run) => {
      stored = run;
    },
  });
});

describe('resolveRunStore (step 179)', () => {
  const now = new Date('2026-11-14T20:00:00.000Z');

  it('keeps a run and its answers, then forgets it when it ends', async () => {
    useResolveRunStore.getState().start(['a', 'b', 'c'], now);
    useResolveRunStore.getState().markAnswered('a');
    useResolveRunStore.getState().markAnswered('a');
    await Promise.resolve();
    expect(stored).toEqual({ queue: ['a', 'b', 'c'], answered: ['a'], startedAt: now.toISOString() });
    useResolveRunStore.getState().clear();
    await Promise.resolve();
    expect(stored).toBeNull();
    expect(useResolveRunStore.getState().run).toBeNull();
  });

  it('offers a run back for a couple of hours only', async () => {
    const run = { queue: ['a'], answered: ['a'], startedAt: now.toISOString() };
    expect(freshRun(run, new Date(now.getTime() + 60 * 60 * 1000))).toEqual(run);
    expect(freshRun(run, new Date(now.getTime() + (RUN_KEEP_HOURS + 1) * 60 * 60 * 1000))).toBeNull();
    expect(freshRun({ queue: 'a' }, now)).toBeNull();
    stored = { ...run, startedAt: '2026-11-13T10:00:00.000Z' };
    await useResolveRunStore.getState().hydrate(now);
    expect(useResolveRunStore.getState().run).toBeNull();
    expect(useResolveRunStore.getState().hydrated).toBe(true);
    expect(stored).toBeNull();
  });
});

describe('resolveRunStore, the edges (code review, step 179)', () => {
  const now = new Date('2026-11-14T20:00:00.000Z');

  it('drops an entry it can\'t read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    stored = { queue: ['a'], answered: [], startedAt: now.toISOString() };
    __setResolveRunPersistenceForTests({
      load: async () => {
        throw new SyntaxError('Unexpected token');
      },
      save: async (run) => {
        stored = run;
      },
    });
    await useResolveRunStore.getState().hydrate(now);
    expect(useResolveRunStore.getState().hydrated).toBe(true);
    expect(useResolveRunStore.getState().run).toBeNull();
    await Promise.resolve();
    expect(stored).toBeNull();
    warn.mockRestore();
  });

  it('keeps a resumed run\'s own start', () => {
    const earlier = new Date(now.getTime() - 60 * 60 * 1000);
    useResolveRunStore.getState().start(['a', 'b', 'c'], earlier);
    useResolveRunStore.getState().markAnswered('a');
    useResolveRunStore.getState().start(['a', 'b', 'c'], now, ['a']);
    expect(useResolveRunStore.getState().run).toEqual({
      queue: ['a', 'b', 'c'],
      answered: ['a'],
      startedAt: earlier.toISOString(),
    });
    useResolveRunStore.getState().start(['d', 'e', 'f'], now);
    expect(useResolveRunStore.getState().run?.startedAt).toBe(now.toISOString());
  });
});
