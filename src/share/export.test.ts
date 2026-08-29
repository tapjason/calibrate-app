import type { RefObject } from 'react';

import {
  __setShareDepsForTests,
  captureCard,
  shareCard,
  type ShareDeps,
} from './export';

const REF = { current: {} } as RefObject<unknown>;

function deps(over: Partial<ShareDeps> = {}): ShareDeps {
  return {
    capture: jest.fn(async () => 'file:///tmp/card.png'),
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => undefined),
    ...over,
  };
}

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __setShareDepsForTests(null);
  warn.mockRestore();
});

describe('captureCard', () => {
  it('returns the rasterized PNG uri', async () => {
    __setShareDepsForTests(deps());
    expect(await captureCard(REF)).toBe('file:///tmp/card.png');
  });

  it('returns null instead of throwing when capture fails', async () => {
    __setShareDepsForTests(
      deps({
        capture: jest.fn(async () => {
          throw new Error('view not mounted');
        }),
      }),
    );
    await expect(captureCard(REF)).resolves.toBeNull();
  });
});

describe('shareCard', () => {
  it('captures then opens the share sheet on the PNG', async () => {
    const d = deps();
    __setShareDepsForTests(d);

    expect(await shareCard(REF)).toBe('shared');
    expect(d.capture).toHaveBeenCalledWith(REF);
    expect(d.share).toHaveBeenCalledWith('file:///tmp/card.png');
  });

  it('reports unavailable without capturing when there is no share sheet', async () => {
    const d = deps({ isAvailable: jest.fn(async () => false) });
    __setShareDepsForTests(d);

    expect(await shareCard(REF)).toBe('unavailable');
    // The point of checking first: no wasted rasterization.
    expect(d.capture).not.toHaveBeenCalled();
  });

  it('treats a thrown availability check as unavailable', async () => {
    const d = deps({
      isAvailable: jest.fn(async () => {
        throw new Error('module missing');
      }),
    });
    __setShareDepsForTests(d);

    expect(await shareCard(REF)).toBe('unavailable');
    expect(d.capture).not.toHaveBeenCalled();
  });

  it('reports failure when capture fails', async () => {
    const d = deps({
      capture: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    __setShareDepsForTests(d);

    expect(await shareCard(REF)).toBe('failed');
    expect(d.share).not.toHaveBeenCalled();
  });

  it('reports failure when the share sheet throws', async () => {
    __setShareDepsForTests(
      deps({
        share: jest.fn(async () => {
          throw new Error('dismissed');
        }),
      }),
    );
    expect(await shareCard(REF)).toBe('failed');
  });

  it('never throws — the core loop must survive a share failure', async () => {
    __setShareDepsForTests(
      deps({
        capture: jest.fn(async () => {
          throw new Error('boom');
        }),
        share: jest.fn(async () => {
          throw new Error('boom');
        }),
      }),
    );
    await expect(shareCard(REF)).resolves.toBe('failed');
  });
});
