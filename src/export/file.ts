// Writing an export to disk and handing it to the OS share sheet (L5).
//
// Same seam and same temperament as src/share/export.ts: the native modules
// are lazily required and injectable, and a failure returns an outcome the
// caller can render rather than an exception. Nothing here can take down the
// Stats screen.
//
// The file lands in the cache directory on purpose. It is a hand-off artifact,
// not a document, and it holds the person's whole history, every title and
// reflection: it is deleted as soon as the share sheet closes, however it
// closed (security review, 2026-11-18), and Erase and account deletion sweep
// any left behind (`sweepExportFiles`), say by the app being killed with the
// sheet open.

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
  /** Delete the named file from the cache directory, if it is there. Optional so older fakes still fit. */
  deleteCacheFile?(name: string): Promise<void>;
  /** The names of the files directly in the cache directory (not folders). Optional, as above. */
  listCacheFiles?(): Promise<string[]>;
}

/**
 * The names an export has had, today's (`csvFileName`, src/export/csv.ts:
 * `fairly-sure-2026-11-18.csv`) and the one before the rename
 * (`calibrate-2026-09-07.csv`). The sweep deletes only files directly in the
 * cache directory with one of these names.
 */
export const EXPORT_FILE_NAME = /^(?:fairly-sure|calibrate)-\d{4}-\d{2}-\d{2}\.csv$/;

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
    async deleteCacheFile(name) {
      // The web build writes no file.
      if (Platform.OS === 'web') return;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
    },
    async listCacheFiles() {
      if (Platform.OS === 'web') return [];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const cache = Paths.cache;
      if (!cache.exists) return [];
      return cache
        .list()
        .filter((entry): entry is InstanceType<typeof File> => entry instanceof File)
        .map((file) => file.name);
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
 * Write text to a cache file and open the share sheet on it, then delete the
 * file.
 *
 * Availability is checked *before* writing: no point leaving a file on disk on
 * a platform that can't share it. The file goes in a `finally`, once the
 * sheet has closed, sent, cancelled or failed: expo-sharing resolves
 * `shareAsync` from the sheet's completion handler on iOS, so the app the
 * person chose has the file by then.
 */
export async function shareTextFile(
  name: string,
  content: string,
  mimeType: string,
  dialogTitle: string,
): Promise<ExportOutcome> {
  const d = getDeps();
  // Set before the write: one that fails part-way can still leave a file.
  let written = false;
  try {
    if (!(await d.isAvailable())) return 'unavailable';
    written = true;
    const uri = await d.writeCacheFile(name, content);
    await d.share(uri, mimeType, dialogTitle);
    return 'shared';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[export] file share failed:', messageOf(e));
    return 'failed';
  } finally {
    if (written) await discard(d, name);
  }
}

/**
 * Delete every export left in the cache directory: files directly in it named
 * as `EXPORT_FILE_NAME` says, nothing else. For Erase and account deletion.
 * Never throws.
 */
export async function sweepExportFiles(): Promise<void> {
  const d = getDeps();
  let names: string[];
  try {
    names = (await d.listCacheFiles?.()) ?? [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[export] could not list the cache:', messageOf(e));
    return;
  }
  for (const name of names) {
    if (EXPORT_FILE_NAME.test(name)) await discard(d, name);
  }
}

/** Delete one export file. Never throws: one that won't go doesn't stop the rest. */
async function discard(d: FileExportDeps, name: string): Promise<void> {
  try {
    await d.deleteCacheFile?.(name);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[export] could not delete an export file:', messageOf(e));
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'unknown error';
}
