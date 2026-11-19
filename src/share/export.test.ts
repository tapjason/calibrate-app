import type { RefObject } from 'react';
import { Platform } from 'react-native';

import {
  __setShareDepsForTests,
  captureCard,
  captureDirectoryUri,
  shareCard,
  sweepShareCaptures,
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

// Security review, 2026-11-18: card images stayed in the temp folder after
// the share, and a recap card can carry a prediction's words.
describe('shareCard: the image goes once the sheet has closed', () => {
  it('deletes the PNG after the share, and only after the sheet has finished', async () => {
    let close: () => void = () => {};
    const order: string[] = [];
    const d = deps({
      share: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            order.push('sheet open');
            close = () => {
              order.push('sheet closed');
              resolve();
            };
          }),
      ),
      release: jest.fn(async (uri: string) => {
        order.push(`release ${uri}`);
      }),
    });
    __setShareDepsForTests(d);

    const sharing = shareCard(REF);
    await new Promise((r) => setImmediate(r));
    expect(d.release).not.toHaveBeenCalled();

    close();
    await expect(sharing).resolves.toBe('shared');
    expect(order).toEqual(['sheet open', 'sheet closed', 'release file:///tmp/card.png']);
  });

  it('deletes the PNG when the sheet fails or is dismissed', async () => {
    const release = jest.fn(async (_uri: string) => {});
    __setShareDepsForTests(deps({ share: jest.fn(async () => { throw new Error('dismissed'); }), release }));

    expect(await shareCard(REF)).toBe('failed');
    expect(release).toHaveBeenCalledWith('file:///tmp/card.png');
  });

  it('deletes nothing when nothing was captured', async () => {
    const release = jest.fn(async (_uri: string) => {});
    __setShareDepsForTests(
      deps({ capture: jest.fn(async () => { throw new Error('boom'); }), release }),
    );
    expect(await shareCard(REF)).toBe('failed');
    __setShareDepsForTests(deps({ isAvailable: jest.fn(async () => false), release }));
    expect(await shareCard(REF)).toBe('unavailable');
    expect(release).not.toHaveBeenCalled();
  });

  it('still reports the share when the delete fails', async () => {
    __setShareDepsForTests(deps({ release: jest.fn(async () => { throw new Error('busy'); }) }));
    expect(await shareCard(REF)).toBe('shared');
  });
});

describe('sweepShareCaptures', () => {
  const UUID_PNG = '0F8FAD5B-D9CB-469F-A165-70867728950E.png';

  it('deletes the captures left in the folder, and nothing else', async () => {
    const deleteCapture = jest.fn(async (_uri: string) => {});
    __setShareDepsForTests(
      deps({
        listCaptures: jest.fn(async () => [
          { name: UUID_PNG, uri: `file:///c/tmp/ReactNative/${UUID_PNG}` },
          { name: '0f8fad5b-d9cb-469f-a165-70867728950e.png', uri: 'file:///c/tmp/ReactNative/lower.png' },
          { name: '0F8FAD5B-D9CB-469F-A165-70867728950E.jpg', uri: 'file:///c/tmp/ReactNative/x.jpg' },
          { name: 'card.png', uri: 'file:///c/tmp/ReactNative/card.png' },
          { name: `${UUID_PNG}.part`, uri: 'file:///c/tmp/ReactNative/part' },
        ]),
        deleteCapture,
      }),
    );

    await sweepShareCaptures();
    expect(deleteCapture.mock.calls.map(([uri]) => uri)).toEqual([
      `file:///c/tmp/ReactNative/${UUID_PNG}`,
      'file:///c/tmp/ReactNative/lower.png',
    ]);
  });

  it('never throws, and goes on past one that will not go', async () => {
    const deleteCapture = jest.fn(async (uri: string) => {
      if (uri.endsWith('a.png')) throw new Error('busy');
    });
    __setShareDepsForTests(
      deps({
        listCaptures: jest.fn(async () => [
          { name: UUID_PNG, uri: 'file:///c/tmp/ReactNative/a.png' },
          { name: UUID_PNG, uri: 'file:///c/tmp/ReactNative/b.png' },
        ]),
        deleteCapture,
      }),
    );
    await expect(sweepShareCaptures()).resolves.toBeUndefined();
    expect(deleteCapture).toHaveBeenCalledTimes(2);

    __setShareDepsForTests(deps({ listCaptures: jest.fn(async () => { throw new Error('no dir'); }) }));
    await expect(sweepShareCaptures()).resolves.toBeUndefined();
  });

  it('does nothing on web, where there is no capture file', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
    try {
      __setShareDepsForTests(null);
      await expect(sweepShareCaptures()).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });
});

describe('captureDirectoryUri', () => {
  it("is the container's tmp/ReactNative/, beside Library/Caches/", () => {
    expect(
      captureDirectoryUri('file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/'),
    ).toBe('file:///var/mobile/Containers/Data/Application/ABC/tmp/ReactNative/');
    expect(
      captureDirectoryUri('file:///var/mobile/Containers/Data/Application/ABC/Library/Caches'),
    ).toBe('file:///var/mobile/Containers/Data/Application/ABC/tmp/ReactNative/');
  });

  it('is null for any other layout, so nothing is swept', () => {
    expect(captureDirectoryUri('file:///data/user/0/app/cache/')).toBeNull();
    expect(captureDirectoryUri('')).toBeNull();
    expect(captureDirectoryUri('/var/mobile/Library/Caches/')).toBeNull();
  });
});
