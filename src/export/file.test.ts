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

  it('never throws, and goes on past a file that will not go', async () => {
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
    await expect(sweepExportFiles()).resolves.toBeUndefined();
    expect(deleteCacheFile).toHaveBeenCalledTimes(2);

    __setFileExportDepsForTests(deps({ listCacheFiles: jest.fn(async () => { throw new Error('no dir'); }) }));
    await expect(sweepExportFiles()).resolves.toBeUndefined();
  });

  // The web build writes no file: the real deps touch no file system there.
  it('does nothing on web', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
    try {
      __setFileExportDepsForTests(null);
      await expect(sweepExportFiles()).resolves.toBeUndefined();
      await expect(shareTextFile('fairly-sure-2026-11-18.csv', 'x', 'text/csv', 'Export')).resolves.toBe(
        'unavailable',
      );
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });
});
