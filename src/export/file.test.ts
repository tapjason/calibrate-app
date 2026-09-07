import {
  __setFileExportDepsForTests,
  shareTextFile,
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
