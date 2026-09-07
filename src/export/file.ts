// Writing an export to disk and handing it to the OS share sheet (L5).
//
// Same seam and same temperament as src/share/export.ts: the native modules
// are lazily required and injectable, and a failure returns an outcome the
// caller can render rather than an exception. Nothing here can take down the
// Stats screen.
//
// The file lands in the cache directory on purpose. It is a hand-off artifact,
// not a document — the OS is free to reclaim it, and a copy of the user's full
// prediction history should not sit in app storage forever after they mailed
// it to themselves.

import { Platform } from 'react-native';

/** What the caller should tell the user. */
export type ExportOutcome =
  | 'shared' // handed to the OS share sheet
  | 'unavailable' // no share sheet on this platform (e.g. web)
  | 'failed'; // write or share threw

/** The subset of expo-file-system + expo-sharing this module needs. */
export interface FileExportDeps {
  /** Write `content` to a cache file named `name`; returns its URI. */
  writeCacheFile(name: string, content: string): Promise<string>;
  isAvailable(): Promise<boolean>;
  share(uri: string, mimeType: string, dialogTitle: string): Promise<void>;
}

let deps: FileExportDeps | null = null;

function defaultDeps(): FileExportDeps {
  return {
    async writeCacheFile(name, content) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const file = new File(Paths.cache, name);
      // Overwrite rather than append: two exports on the same day are two
      // snapshots, not one file with the history twice.
      if (file.exists) file.delete();
      file.create();
      file.write(content);
      return file.uri;
    },
    async isAvailable() {
      if (Platform.OS === 'web') return false;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      return await Sharing.isAvailableAsync();
    },
    async share(uri, mimeType, dialogTitle) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      await Sharing.shareAsync(uri, { mimeType, dialogTitle });
    },
  };
}

function getDeps(): FileExportDeps {
  if (!deps) deps = defaultDeps();
  return deps;
}

/** Test-only: swap the platform deps. */
export function __setFileExportDepsForTests(next: FileExportDeps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setFileExportDepsForTests is only allowed when NODE_ENV=test');
  }
  deps = next;
}

/**
 * Write text to a cache file and open the share sheet on it.
 *
 * Availability is checked *before* writing: no point leaving a file on disk on
 * a platform that can't share it.
 */
export async function shareTextFile(
  name: string,
  content: string,
  mimeType: string,
  dialogTitle: string,
): Promise<ExportOutcome> {
  const d = getDeps();
  try {
    if (!(await d.isAvailable())) return 'unavailable';
    const uri = await d.writeCacheFile(name, content);
    await d.share(uri, mimeType, dialogTitle);
    return 'shared';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[export] file share failed:', e);
    return 'failed';
  }
}
