import { Platform } from 'react-native';

import {
  ICON_IMAGE_PX,
  __setIconImageDepsForTests,
  inIconCacheFolder,
  pickIconImage,
  sweepIconImageFiles,
} from './iconImage';

afterEach(() => {
  __setIconImageDepsForTests(null);
  jest.restoreAllMocks();
});

// Roadmap D40: a category's own picture, square and small, or nothing.
describe('pickIconImage', () => {
  it('returns a PNG data URI of the squared, shrunk picture', async () => {
    const squarePng = jest.fn(async () => 'AAAA');
    __setIconImageDepsForTests({
      pick: async () => ({ uri: 'file:///p.jpg', width: 1200, height: 900 }),
      squarePng,
    });
    await expect(pickIconImage()).resolves.toEqual({
      status: 'picked',
      uri: 'data:image/png;base64,AAAA',
    });
    expect(squarePng).toHaveBeenCalledWith(
      { uri: 'file:///p.jpg', width: 1200, height: 900 },
      ICON_IMAGE_PX,
    );
  });

  it('says cancelled when the person closes the library', async () => {
    const squarePng = jest.fn(async () => 'AAAA');
    __setIconImageDepsForTests({ pick: async () => null, squarePng });
    await expect(pickIconImage()).resolves.toEqual({ status: 'cancelled' });
    expect(squarePng).not.toHaveBeenCalled();
  });

  it('fails silently when the picker or the image work throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setIconImageDepsForTests({
      pick: async () => {
        throw new Error('no permission');
      },
      squarePng: async () => 'AAAA',
    });
    await expect(pickIconImage()).resolves.toEqual({ status: 'failed' });
  });
});

// Security review, 2026-11-18: the picker's full-size crop and the
// manipulator's PNG, copies of a personal photo, stayed in the cache.
describe('pickIconImage: the files it wrote go', () => {
  const CACHE = 'file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/';
  const PICKED = `${CACHE}ImagePicker/0F8FAD5B-D9CB-469F-A165-70867728950E.jpeg`;
  const SAVED = `${CACHE}ImageManipulator/7C9E6679-7425-40DE-944B-E07FC1F90AE7.png`;

  it("deletes the picker's crop and the manipulator's PNG once it has the picture", async () => {
    const discard = jest.fn(async (_uri: string) => {});
    __setIconImageDepsForTests({
      pick: async () => ({ uri: PICKED, width: 900, height: 900 }),
      squarePng: async () => ({ base64: 'AAAA', uri: SAVED }),
      discard,
    });
    await expect(pickIconImage()).resolves.toEqual({
      status: 'picked',
      uri: 'data:image/png;base64,AAAA',
    });
    expect(discard.mock.calls.map(([uri]) => uri)).toEqual([PICKED, SAVED]);
  });

  it("deletes the picker's crop when the image work fails", async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const discard = jest.fn(async (_uri: string) => {});
    __setIconImageDepsForTests({
      pick: async () => ({ uri: PICKED, width: 900, height: 900 }),
      squarePng: async () => {
        throw new Error('decode');
      },
      discard,
    });
    await expect(pickIconImage()).resolves.toEqual({ status: 'failed' });
    expect(discard.mock.calls.map(([uri]) => uri)).toEqual([PICKED]);
  });

  it('deletes both when the PNG came back without data', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const discard = jest.fn(async (_uri: string) => {});
    __setIconImageDepsForTests({
      pick: async () => ({ uri: PICKED, width: 900, height: 900 }),
      squarePng: async () => ({ base64: null, uri: SAVED }),
      discard,
    });
    await expect(pickIconImage()).resolves.toEqual({ status: 'failed' });
    expect(discard.mock.calls.map(([uri]) => uri)).toEqual([PICKED, SAVED]);
  });

  it('deletes nothing when the person cancels', async () => {
    const discard = jest.fn(async (_uri: string) => {});
    __setIconImageDepsForTests({ pick: async () => null, squarePng: async () => 'AAAA', discard });
    await expect(pickIconImage()).resolves.toEqual({ status: 'cancelled' });
    expect(discard).not.toHaveBeenCalled();
  });

  it('still returns the picture when a delete fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setIconImageDepsForTests({
      pick: async () => ({ uri: PICKED, width: 900, height: 900 }),
      squarePng: async () => ({ base64: 'AAAA', uri: SAVED }),
      discard: async () => {
        throw new Error('busy');
      },
    });
    await expect(pickIconImage()).resolves.toEqual({
      status: 'picked',
      uri: 'data:image/png;base64,AAAA',
    });
  });
});

describe('sweepIconImageFiles', () => {
  it('deletes what the two libraries left, by their names only', async () => {
    const discard = jest.fn(async (_uri: string) => {});
    __setIconImageDepsForTests({
      pick: async () => null,
      squarePng: async () => 'AAAA',
      listCached: async () => [
        { name: '0F8FAD5B-D9CB-469F-A165-70867728950E.jpeg', uri: 'file:///c/ImagePicker/a.jpeg' },
        { name: '7C9E6679-7425-40DE-944B-E07FC1F90AE7.png', uri: 'file:///c/ImageManipulator/b.png' },
        { name: 'keep-me.txt', uri: 'file:///c/ImagePicker/keep-me.txt' },
      ],
      discard,
    });
    await sweepIconImageFiles();
    expect(discard.mock.calls.map(([uri]) => uri)).toEqual([
      'file:///c/ImagePicker/a.jpeg',
      'file:///c/ImageManipulator/b.png',
    ]);
  });

  it('never throws: a cache it cannot list resolves false', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setIconImageDepsForTests({
      pick: async () => null,
      squarePng: async () => 'AAAA',
      listCached: async () => {
        throw new Error('no dir');
      },
    });
    await expect(sweepIconImageFiles()).resolves.toBe(false);
  });

  // Round two, 2026-11-19: Erase awaits the sweep and reports a leftover.
  describe('what it resolves', () => {
    const PICKED_NAME = '0F8FAD5B-D9CB-469F-A165-70867728950E.jpeg';
    const SAVED_NAME = '7C9E6679-7425-40DE-944B-E07FC1F90AE7.png';

    /** The two folders in memory: `stuck` uris a discard leaves in place without throwing (the real one refuses a file outside them so). */
    function folders(entries: Array<{ name: string; uri: string }>, stuck: readonly string[] = []) {
      const files = new Map(entries.map((entry) => [entry.uri, entry.name]));
      const discard = jest.fn(async (uri: string) => {
        if (!stuck.includes(uri)) files.delete(uri);
      });
      __setIconImageDepsForTests({
        pick: async () => null,
        squarePng: async () => 'AAAA',
        listCached: async () => [...files].map(([uri, name]) => ({ name, uri })),
        discard,
      });
      return { files, discard };
    }

    it('true with nothing to remove, other files left alone', async () => {
      const { files, discard } = folders([{ name: 'keep-me.txt', uri: 'file:///c/ImagePicker/keep-me.txt' }]);

      await expect(sweepIconImageFiles()).resolves.toBe(true);
      expect(discard).not.toHaveBeenCalled();
      expect(files.size).toBe(1);
    });

    it('true once every picture is gone', async () => {
      const { files } = folders([
        { name: PICKED_NAME, uri: 'file:///c/ImagePicker/a.jpeg' },
        { name: SAVED_NAME, uri: 'file:///c/ImageManipulator/b.png' },
      ]);

      await expect(sweepIconImageFiles()).resolves.toBe(true);
      expect(files.size).toBe(0);
    });

    it('false when a discard returns but the file is still there, or it throws; a retry that works is true', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      folders([{ name: PICKED_NAME, uri: 'file:///c/ImagePicker/a.jpeg' }], ['file:///c/ImagePicker/a.jpeg']);
      await expect(sweepIconImageFiles()).resolves.toBe(false);

      const { files, discard } = folders([{ name: PICKED_NAME, uri: 'file:///c/ImagePicker/a.jpeg' }]);
      discard.mockImplementationOnce(async () => {
        throw new Error('busy');
      });
      await expect(sweepIconImageFiles()).resolves.toBe(false);
      expect(files.size).toBe(1);
      await expect(sweepIconImageFiles()).resolves.toBe(true);
      expect(files.size).toBe(0);
    });

    it('false when the seam cannot discard', async () => {
      __setIconImageDepsForTests({
        pick: async () => null,
        squarePng: async () => 'AAAA',
        listCached: async () => [{ name: PICKED_NAME, uri: 'file:///c/ImagePicker/a.jpeg' }],
      });
      await expect(sweepIconImageFiles()).resolves.toBe(false);
    });
  });

  it('does nothing on web, where the picker writes no file', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
    try {
      __setIconImageDepsForTests(null);
      await expect(sweepIconImageFiles()).resolves.toBe(true);
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });
});

describe('inIconCacheFolder', () => {
  const CACHE = 'file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/';

  it('allows a file directly in one of the two folders', () => {
    expect(inIconCacheFolder(`${CACHE}ImagePicker/X.jpeg`, CACHE)).toBe(true);
    expect(inIconCacheFolder(`${CACHE}ImageManipulator/Y.png`, CACHE)).toBe(true);
    expect(inIconCacheFolder(`${CACHE}ImagePicker/X.jpeg`, CACHE.slice(0, -1))).toBe(true);
  });

  it('refuses anything else', () => {
    expect(inIconCacheFolder(`${CACHE}fairly-sure-2026-11-18.csv`, CACHE)).toBe(false);
    expect(inIconCacheFolder(`${CACHE}ImagePicker/`, CACHE)).toBe(false);
    expect(inIconCacheFolder(`${CACHE}ImagePicker/../secret.db`, CACHE)).toBe(false);
    expect(inIconCacheFolder(`${CACHE}ImagePicker/sub/X.jpeg`, CACHE)).toBe(false);
    expect(inIconCacheFolder('ph://0F8FAD5B-D9CB-469F-A165-70867728950E', CACHE)).toBe(false);
    expect(inIconCacheFolder('blob:http://localhost:8097/abc', CACHE)).toBe(false);
    expect(inIconCacheFolder('file:///var/mobile/Media/DCIM/IMG_0001.JPG', CACHE)).toBe(false);
  });
});

// Fix 11: like every other test seam, refused outside tests.
describe('__setIconImageDepsForTests', () => {
  it('throws outside a test run', () => {
    // NODE_ENV is typed read-only; the guard reads it at call time.
    const env = process.env as Record<string, string | undefined>;
    const before = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      expect(() => __setIconImageDepsForTests(null)).toThrow(/only allowed when NODE_ENV=test/);
    } finally {
      env.NODE_ENV = before;
    }
  });
});
