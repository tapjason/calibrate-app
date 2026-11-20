import { Platform } from 'react-native';

import { csvFileName } from './csv';
import {
  EXPORT_FILE_NAME,
  __setFileExportDepsForTests,
  shareTextFile,
  sweepExportFiles,
  type FileExportDeps,
} from './file';

function deps(overrides: Partial<FileExportDeps> = {}): FileExportDeps {
  return {
    writeCacheFile: jest.fn(async () => 'file:///cache/calibrate.csv'),
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => {}),
    ...overrides,
  };
}

afterEach(() => {
  __setFileExportDepsForTests(null);
  jest.restoreAllMocks();
});

describe('shareTextFile', () => {
  it('writes the file and hands its uri to the share sheet', async () => {
    const d = deps();
    __setFileExportDepsForTests(d);

    await expect(
      shareTextFile('calibrate.csv', 'a,b\r\n1,2', 'text/csv', 'Export'),
    ).resolves.toBe('shared');

    expect(d.writeCacheFile).toHaveBeenCalledWith('calibrate.csv', 'a,b\r\n1,2');
    expect(d.share).toHaveBeenCalledWith(
      'file:///cache/calibrate.csv',
      'text/csv',
      'Export',
    );
  });

  // No point leaving a copy of someone's whole history on disk on a platform
  // that can't share it.
  it('checks availability before writing anything', async () => {
    const d = deps({ isAvailable: jest.fn(async () => false) });
    __setFileExportDepsForTests(d);

    await expect(
      shareTextFile('calibrate.csv', 'x', 'text/csv', 'Export'),
    ).resolves.toBe('unavailable');

    expect(d.writeCacheFile).not.toHaveBeenCalled();
  });

  it.each([
    ['the write', { writeCacheFile: jest.fn(async () => { throw new Error('disk'); }) }],
    ['the share', { share: jest.fn(async () => { throw new Error('sheet'); }) }],
  ])('reports failure rather than throwing when %s fails', async (_label, override) => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setFileExportDepsForTests(deps(override as Partial<FileExportDeps>));

    await expect(
      shareTextFile('calibrate.csv', 'x', 'text/csv', 'Export'),
    ).resolves.toBe('failed');
  });
});

// Security review, 2026-11-18: the CSV holds every title and reflection, and
// stayed in the cache after the share.
describe('shareTextFile: the file goes once the sheet has closed', () => {
  it('deletes the file after a share, and only after the sheet has finished', async () => {
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
      deleteCacheFile: jest.fn(async (name: string) => {
        order.push(`delete ${name}`);
      }),
    });
    __setFileExportDepsForTests(d);

    const sharing = shareTextFile('fairly-sure-2026-11-18.csv', 'x', 'text/csv', 'Export');
    await new Promise((r) => setImmediate(r));
    // The sheet is up: the file must still be there for the app it goes to.
    expect(d.deleteCacheFile).not.toHaveBeenCalled();

    close();
    await expect(sharing).resolves.toBe('shared');
    expect(order).toEqual(['sheet open', 'sheet closed', 'delete fairly-sure-2026-11-18.csv']);
  });

  it.each([
    ['the share sheet fails or is cancelled', { share: jest.fn(async () => { throw new Error('dismissed'); }) }],
    ['the write fails part-way', { writeCacheFile: jest.fn(async () => { throw new Error('disk'); }) }],
  ])('deletes the file when %s', async (_label, override) => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const deleteCacheFile = jest.fn(async (_name: string) => {});
    __setFileExportDepsForTests(deps({ ...(override as Partial<FileExportDeps>), deleteCacheFile }));

    await expect(shareTextFile('fairly-sure-2026-11-18.csv', 'x', 'text/csv', 'Export')).resolves.toBe(
      'failed',
    );
    expect(deleteCacheFile).toHaveBeenCalledWith('fairly-sure-2026-11-18.csv');
  });

  it('deletes nothing where nothing was written', async () => {
    const deleteCacheFile = jest.fn(async (_name: string) => {});
    __setFileExportDepsForTests(deps({ isAvailable: jest.fn(async () => false), deleteCacheFile }));

    await shareTextFile('fairly-sure-2026-11-18.csv', 'x', 'text/csv', 'Export');
    expect(deleteCacheFile).not.toHaveBeenCalled();
  });

  it('still reports the share when the delete fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setFileExportDepsForTests(
      deps({ deleteCacheFile: jest.fn(async () => { throw new Error('busy'); }) }),
    );

    await expect(shareTextFile('fairly-sure-2026-11-18.csv', 'x', 'text/csv', 'Export')).resolves.toBe(
      'shared',
    );
  });
});

// Client re-review, round 5 (2026-11-19): a sheet that ends in a way
// expo-sharing never reports leaves `shareAsync` unsettled, so its `finally`
// never deletes the file. Each new export sweeps what earlier ones left.
describe('shareTextFile: what earlier exports left behind', () => {
  /** A cache folder in memory, logging every call in order. */
  function cache(initial: string[]) {
    const files = new Set(initial);
    const log: string[] = [];
    const share = jest.fn(async (_uri: string) => {
      log.push('share');
    });
    const d = deps({
      listCacheFiles: jest.fn(async () => {
        log.push('list');
        return [...files];
      }),
      deleteCacheFile: jest.fn(async (name: string) => {
        log.push(`delete ${name}`);
        files.delete(name);
      }),
      writeCacheFile: jest.fn(async (name: string) => {
        log.push(`write ${name}`);
        files.add(name);
        return `file:///cache/${name}`;
      }),
      share,
    });
    return { d, files, log, share };
  }

  it('deletes them before writing the new one, and leaves other files alone', async () => {
    const { d, files, log } = cache(['fairly-sure-2026-11-17.csv', 'calibrate-2026-09-07.csv', 'notes.csv']);
    __setFileExportDepsForTests(d);

    await expect(shareTextFile('fairly-sure-2026-11-19.csv', 'x', 'text/csv', 'Export')).resolves.toBe('shared');

    expect(log).toEqual([
      'list',
      'delete fairly-sure-2026-11-17.csv',
      'delete calibrate-2026-09-07.csv',
      'write fairly-sure-2026-11-19.csv',
      'share',
      'delete fairly-sure-2026-11-19.csv',
    ]);
    expect([...files]).toEqual(['notes.csv']);
  });

  it("replaces a same-day copy left behind with the new export's file", async () => {
    const { d, log } = cache(['fairly-sure-2026-11-19.csv']);
    __setFileExportDepsForTests(d);

    await shareTextFile('fairly-sure-2026-11-19.csv', 'x', 'text/csv', 'Export');
    expect(log.slice(0, 3)).toEqual(['list', 'delete fairly-sure-2026-11-19.csv', 'write fairly-sure-2026-11-19.csv']);
  });

  it('still exports when the cache cannot be listed', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const writeCacheFile = jest.fn(async () => 'file:///cache/fairly-sure-2026-11-19.csv');
    __setFileExportDepsForTests(
      deps({
        listCacheFiles: jest.fn(async () => {
          throw new Error('no dir');
        }),
        writeCacheFile,
      }),
    );

    await expect(shareTextFile('fairly-sure-2026-11-19.csv', 'x', 'text/csv', 'Export')).resolves.toBe('shared');
    expect(writeCacheFile).toHaveBeenCalled();
  });

  it('sweeps nothing where nothing is written', async () => {
    const listCacheFiles = jest.fn(async () => ['fairly-sure-2026-11-17.csv']);
    __setFileExportDepsForTests(deps({ isAvailable: jest.fn(async () => false), listCacheFiles }));

    await expect(shareTextFile('fairly-sure-2026-11-19.csv', 'x', 'text/csv', 'Export')).resolves.toBe(
      'unavailable',
    );
    expect(listCacheFiles).not.toHaveBeenCalled();
  });

  // Two exports at once can't come from the app's one button, but a sweep
  // must never take the file from under a sheet that is still open.
  it('leaves the file of an export whose sheet is still open, and its own finally deletes it', async () => {
    const { d, files } = cache([]);
    let closeFirst: () => void = () => {};
    let calls = 0;
    d.share = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          calls += 1;
          if (calls === 1) closeFirst = resolve;
          else resolve();
        }),
    );
    __setFileExportDepsForTests(d);

    const first = shareTextFile('fairly-sure-2026-11-18.csv', 'x', 'text/csv', 'Export');
    await new Promise((r) => setImmediate(r));
    expect(files.has('fairly-sure-2026-11-18.csv')).toBe(true);

    await expect(shareTextFile('fairly-sure-2026-11-19.csv', 'y', 'text/csv', 'Export')).resolves.toBe('shared');
    // The second export's sweep kept the first one's file.
    expect(files.has('fairly-sure-2026-11-18.csv')).toBe(true);

    closeFirst();
    await expect(first).resolves.toBe('shared');
    expect(files.size).toBe(0);

    // Once its sheet has closed, it is an ordinary leftover to the next sweep.
    files.add('fairly-sure-2026-11-18.csv');
    await shareTextFile('fairly-sure-2026-11-20.csv', 'z', 'text/csv', 'Export');
    expect(files.size).toBe(0);
  });
});

describe('sweepExportFiles', () => {
  it('deletes the exports left in the cache, and nothing else', async () => {
    const deleteCacheFile = jest.fn(async (_name: string) => {});
    __setFileExportDepsForTests(
      deps({
        listCacheFiles: jest.fn(async () => [
          'fairly-sure-2026-11-18.csv',
          'calibrate-2026-09-07.csv',
          'fairly-sure-2026-11-18.csv.tmp',
          'notes.csv',
          'fairly-sure-latest.csv',
          'com.apple.dyld',
        ]),
        deleteCacheFile,
      }),
    );

    await sweepExportFiles();
    expect(deleteCacheFile.mock.calls.map(([name]) => name)).toEqual([
      'fairly-sure-2026-11-18.csv',
      'calibrate-2026-09-07.csv',
    ]);
  });

  it("matches the name today's export is written under", () => {
    expect(EXPORT_FILE_NAME.test(csvFileName(new Date('2026-11-18T10:00:00.000Z')))).toBe(true);
  });

  it('never throws, and goes on past a file that will not go, saying so', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const deleteCacheFile = jest.fn(async (name: string) => {
      if (name.startsWith('calibrate')) throw new Error('busy');
    });
    __setFileExportDepsForTests(
      deps({
        listCacheFiles: jest.fn(async () => ['calibrate-2026-09-07.csv', 'fairly-sure-2026-11-18.csv']),
        deleteCacheFile,
      }),
    );
    await expect(sweepExportFiles()).resolves.toBe(false);
    expect(deleteCacheFile).toHaveBeenCalledTimes(2);

    __setFileExportDepsForTests(deps({ listCacheFiles: jest.fn(async () => { throw new Error('no dir'); }) }));
    await expect(sweepExportFiles()).resolves.toBe(false);
  });

  // Round two, 2026-11-19: Erase awaits the sweep and reports a leftover, so
  // it says true only when no export is left.
  describe('what it resolves', () => {
    /** A cache folder in memory: `stuck` names a delete leaves in place without throwing. */
    function folder(initial: string[], stuck: readonly string[] = []) {
      const files = new Set(initial);
      return {
        files,
        d: deps({
          listCacheFiles: jest.fn(async () => [...files]),
          deleteCacheFile: jest.fn(async (name: string) => {
            if (!stuck.includes(name)) files.delete(name);
          }),
        }),
      };
    }

    it('true with nothing to remove, other files left alone', async () => {
      const { d, files } = folder(['notes.csv']);
      __setFileExportDepsForTests(d);

      await expect(sweepExportFiles()).resolves.toBe(true);
      expect(d.deleteCacheFile).not.toHaveBeenCalled();
      expect([...files]).toEqual(['notes.csv']);
    });

    it('true once every export is gone', async () => {
      const { d, files } = folder(['fairly-sure-2026-11-18.csv', 'calibrate-2026-09-07.csv', 'notes.csv']);
      __setFileExportDepsForTests(d);

      await expect(sweepExportFiles()).resolves.toBe(true);
      expect([...files]).toEqual(['notes.csv']);
    });

    it('false when a delete returns but the file is still there', async () => {
      const { d } = folder(['fairly-sure-2026-11-18.csv'], ['fairly-sure-2026-11-18.csv']);
      __setFileExportDepsForTests(d);

      await expect(sweepExportFiles()).resolves.toBe(false);
    });

    it('false when the seam cannot delete, or the second listing fails', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      __setFileExportDepsForTests(deps({ listCacheFiles: jest.fn(async () => ['fairly-sure-2026-11-18.csv']) }));
      await expect(sweepExportFiles()).resolves.toBe(false);

      const { d } = folder(['fairly-sure-2026-11-18.csv']);
      (d.listCacheFiles as jest.Mock)
        .mockImplementationOnce(async () => ['fairly-sure-2026-11-18.csv'])
        .mockImplementationOnce(async () => {
          throw new Error('no dir');
        });
      __setFileExportDepsForTests(d);
      await expect(sweepExportFiles()).resolves.toBe(false);
    });

    it('a failure, then a retry that works', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { d, files } = folder(['fairly-sure-2026-11-18.csv']);
      (d.deleteCacheFile as jest.Mock).mockImplementationOnce(async () => {
        throw new Error('busy');
      });
      __setFileExportDepsForTests(d);

      await expect(sweepExportFiles()).resolves.toBe(false);
      expect(files.size).toBe(1);
      await expect(sweepExportFiles()).resolves.toBe(true);
      expect(files.size).toBe(0);
    });
  });

  // The web build writes no file: the real deps touch no file system there.
  it('does nothing on web', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
    try {
      __setFileExportDepsForTests(null);
      await expect(sweepExportFiles()).resolves.toBe(true);
      await expect(shareTextFile('fairly-sure-2026-11-18.csv', 'x', 'text/csv', 'Export')).resolves.toBe(
        'unavailable',
      );
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });
});
