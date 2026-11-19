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
// closed (security review, 2026-11-18). One can still be left behind: the app
// killed with the sheet open, or a sheet that ends in a way expo-sharing never
// reports, so `shareAsync` never settles and the `finally` never runs (client
// re-review, round 5, 2026-11-19). So `sweepExportFiles` deletes any left
// behind: before each new export (here), at Erase and account deletion
// (authStore), and meant for launch too, once the layout calls it there.

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

/**
 * The names of exports whose share sheet is open now, with how many: the
 * sweep before a new export leaves their files for the app they're going to.
 */
const inFlight = new Map<string, number>();

/** Test-only: swap the platform deps. */
export function __setFileExportDepsForTests(next: FileExportDeps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setFileExportDepsForTests is only allowed when NODE_ENV=test');
  }
  deps = next;
  inFlight.clear();
}

/**
 * Write text to a cache file and open the share sheet on it, then delete the
 * file.
 *
 * Availability is checked *before* writing: no point leaving a file on disk on
 * a platform that can't share it. Then any export an earlier one left behind
 * is deleted, all but those whose sheet is still open. The file goes in a
 * `finally`, once the sheet has closed, sent, cancelled or failed:
 * expo-sharing resolves `shareAsync` from the sheet's completion handler on
 * iOS, so the app the person chose has the file by then.
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
    // Never throws, and a sweep that can't list the cache doesn't stop this
    // export.
    await sweep(d, (n) => inFlight.has(n));
    written = true;
    inFlight.set(name, (inFlight.get(name) ?? 0) + 1);
    const uri = await d.writeCacheFile(name, content);
    await d.share(uri, mimeType, dialogTitle);
    return 'shared';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[export] file share failed:', messageOf(e));
    return 'failed';
  } finally {
    if (written) {
      await discard(d, name);
      const left = (inFlight.get(name) ?? 1) - 1;
      if (left > 0) inFlight.set(name, left);
      else inFlight.delete(name);
    }
  }
}

/**
 * Delete every export left in the cache directory: files directly in it named
 * as `EXPORT_FILE_NAME` says, nothing else. For Erase, account deletion and
 * launch. Never throws.
 */
export async function sweepExportFiles(): Promise<void> {
  await sweep(getDeps(), () => false);
}

/** Delete the exports in the cache, all but those `keep` names. Never throws. */
async function sweep(d: FileExportDeps, keep: (name: string) => boolean): Promise<void> {
  let names: string[];
  try {
    names = (await d.listCacheFiles?.()) ?? [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[export] could not list the cache:', messageOf(e));
    return;
  }
  for (const name of names) {
    if (EXPORT_FILE_NAME.test(name) && !keep(name)) await discard(d, name);
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
