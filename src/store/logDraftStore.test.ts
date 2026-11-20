import {
  __setLogDraftPersistenceForTests,
  freshDraft,
  LOG_DRAFT_HOURS,
  useLogDraftStore,
  type LogDraft,
  type LogDraftPersistence,
} from './logDraftStore';

// Step 173 (aggregate B11): a half-typed prediction survives an interruption
// for a day.
const memory = () => {
  let stored: LogDraft | null = null;
  const persistence: LogDraftPersistence = {
    load: async () => stored,
    save: async (d) => {
      stored = d;
    },
  };
  return { persistence, read: () => stored };
};

const now = new Date('2026-11-12T10:00:00.000Z');
const draft = (over: Partial<LogDraft> = {}): LogDraft => ({
  title: 'Rain by Friday',
  category: 'work',
  confidence: 60,
  dueIso: '2026-11-13T12:00:00.000Z',
  savedAt: '2026-11-12T09:00:00.000Z',
  ...over,
});

describe('freshDraft', () => {
  it('offers a draft from within the day', () => {
    expect(freshDraft(draft(), now)).toEqual(draft());
    expect(LOG_DRAFT_HOURS).toBe(24);
  });
  it('drops one past its day, with no words, or of the wrong shape', () => {
    expect(freshDraft(draft({ savedAt: '2026-11-11T09:59:00.000Z' }), now)).toBeNull();
    expect(freshDraft(draft({ title: '  ' }), now)).toBeNull();
    expect(freshDraft({ title: 'x' }, now)).toBeNull();
    expect(freshDraft(null, now)).toBeNull();
  });
  it('keeps the words but not a number that could never be saved', () => {
    expect(freshDraft(draft({ confidence: 101 }), now)?.confidence).toBeNull();
    expect(freshDraft(draft({ confidence: 62.5 }), now)?.confidence).toBeNull();
  });
});

describe('useLogDraftStore', () => {
  afterEach(() => __setLogDraftPersistenceForTests(null));

  it('keeps a draft, offers it back, and clears it', async () => {
    const m = memory();
    __setLogDraftPersistenceForTests(m.persistence);
    const { savedAt: _s, ...rest } = draft();
    await useLogDraftStore.getState().save(rest, now);
    expect(m.read()?.title).toBe('Rain by Friday');
    useLogDraftStore.setState({ draft: null });
    await useLogDraftStore.getState().hydrate(now);
    expect(useLogDraftStore.getState().draft?.title).toBe('Rain by Friday');
    await expect(useLogDraftStore.getState().clear()).resolves.toBe(true);
    expect(m.read()).toBeNull();
  });

  // Re-review round two, 2026-11-19: Erase reads whether the words left the
  // phone; `clear` swallowed a failed removal and said nothing.
  it('says when the stored draft could not be removed, leaving it for the next launch', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const kept = draft();
    __setLogDraftPersistenceForTests({
      load: async () => kept,
      save: async () => {
        throw new Error('storage');
      },
    });
    useLogDraftStore.setState({ draft: kept });

    await expect(useLogDraftStore.getState().clear()).resolves.toBe(false);
    expect(useLogDraftStore.getState().draft).toBeNull();
    await useLogDraftStore.getState().hydrate(now);
    expect(useLogDraftStore.getState().draft?.title).toBe('Rain by Friday');
    warn.mockRestore();
  });

  it('a blank title clears it, and a stale one is dropped on load', async () => {
    const m = memory();
    __setLogDraftPersistenceForTests(m.persistence);
    await useLogDraftStore.getState().save({ ...draft(), title: '' }, now);
    expect(m.read()).toBeNull();
    await m.persistence.save(draft({ savedAt: '2026-11-10T09:00:00.000Z' }));
    await useLogDraftStore.getState().hydrate(now);
    expect(useLogDraftStore.getState().draft).toBeNull();
    expect(m.read()).toBeNull();
  });
});
