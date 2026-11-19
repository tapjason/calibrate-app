// A category's own picture (roadmap D40, decided 2026-11-03): pick one from
// the photo library, crop it square, shrink it to ICON_IMAGE_PX and keep it as
// a PNG data URI in the local `categories` table. It never leaves the phone:
// not synced, and not on a share card.
//
// The picker and the manipulator each write a file on the way: the picker
// its full-size crop in `Caches/ImagePicker/`, the manipulator its PNG in
// `Caches/ImageManipulator/`. Both are deleted once the flow has returned,
// picked, cancelled or failed (security review, 2026-11-18: a copy of a
// personal photo stayed in the cache), and Erase and account deletion sweep
// those two folders (`sweepIconImageFiles`). Nothing else in the app uses
// either library.
//
// Layer rule: L5. Fails silently: any error reads as 'failed', and the
// category keeps the icon it had.

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** Three times the largest size a category icon shows at (about 40 points). */
export const ICON_IMAGE_PX = 120;

export type PickIconImageResult =
  { status: 'picked'; uri: string } | { status: 'cancelled' } | { status: 'failed' };

interface PickedAsset {
  uri: string;
  width: number;
  height: number;
}

/** The squared picture: its base64 PNG data, and the file the manipulator saved. */
export interface SquarePng {
  base64: string | null;
  /** Null where nothing was written (or nothing is known). */
  uri: string | null;
}

export interface IconImageDeps {
  /** Opens the library with a square crop; null when the person cancels. */
  pick: () => Promise<PickedAsset | null>;
  /**
   * Crops to the centred square, resizes, and returns the PNG and its file. A
   * bare string is the base64 alone, with no file to delete (the shape fakes
   * elsewhere in the tests still use).
   */
  squarePng: (asset: PickedAsset, px: number) => Promise<SquarePng | string>;
  /** Delete a file the picker or the manipulator wrote. Optional so older fakes still fit. */
  discard?: (uri: string) => Promise<void>;
  /** The files in the picker's and the manipulator's cache folders. Optional, as above. */
  listCached?: () => Promise<Array<{ name: string; uri: string }>>;
}

/** The cache folders the two libraries write in (expo-image-picker, expo-image-manipulator, iOS). */
export const ICON_CACHE_FOLDERS = ['ImagePicker', 'ImageManipulator'] as const;

/** The names they give: a fresh UUID and an image extension. The sweep deletes only these. */
export const ICON_CACHE_FILE_NAME =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\.[A-Za-z0-9]{2,5}$/i;

/**
 * Whether `uri` is a file in one of the two folders under the app's cache
 * directory, so a delete can never reach anything else (the person's own
 * photo library is never a file URI here, but nothing is left to chance).
 */
export function inIconCacheFolder(uri: string, cacheUri: string): boolean {
  if (!uri.startsWith('file:///') || !cacheUri.startsWith('file:///')) return false;
  if (uri.split('/').some((part) => part === '..' || part === '.')) return false;
  const base = cacheUri.endsWith('/') ? cacheUri : `${cacheUri}/`;
  return ICON_CACHE_FOLDERS.some((folder) => {
    const prefix = `${base}${folder}/`;
    return uri.startsWith(prefix) && uri.length > prefix.length && !uri.slice(prefix.length).includes('/');
  });
}

const realDeps: IconImageDeps = {
  pick: async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return null;
    const { uri, width, height } = result.assets[0];
    return { uri, width, height };
  },
  squarePng: async ({ uri, width, height }, px) => {
    const context = ImageManipulator.ImageManipulator.manipulate(uri);
    // The web picker has no crop step, so a picture may arrive unsquared.
    if (width > 0 && height > 0 && width !== height) {
      const side = Math.min(width, height);
      context.crop({
        originX: Math.floor((width - side) / 2),
        originY: Math.floor((height - side) / 2),
        width: side,
        height: side,
      });
    }
    context.resize({ width: px, height: px });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({
      base64: true,
      format: ImageManipulator.SaveFormat.PNG,
    });
    return { base64: saved.base64 ?? null, uri: saved.uri ?? null };
  },
  discard: async (uri) => {
    // The web picker hands back an in-memory URL: there is no file.
    if (Platform.OS === 'web') return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    if (!inIconCacheFolder(uri, Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  listCached: async () => {
    if (Platform.OS === 'web') return [];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const found: Array<{ name: string; uri: string }> = [];
    for (const folder of ICON_CACHE_FOLDERS) {
      const dir = new Directory(Paths.cache, folder);
      if (!dir.exists) continue;
      for (const entry of dir.list()) {
        if (entry instanceof File) found.push({ name: entry.name, uri: entry.uri });
      }
    }
    return found;
  },
};

let deps: IconImageDeps = realDeps;

/** Tests only: swap the picker and the image work for fakes, or null to restore. */
export function __setIconImageDepsForTests(next: IconImageDeps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setIconImageDepsForTests is only allowed when NODE_ENV=test');
  }
  deps = next ?? realDeps;
}

/** Let the person pick a picture for a category icon. Never throws. */
export async function pickIconImage(): Promise<PickIconImageResult> {
  // Every file the flow wrote, deleted below however it ends. The picture
  // itself lives on as the data URI returned.
  const written: string[] = [];
  try {
    const asset = await deps.pick();
    if (!asset) return { status: 'cancelled' };
    written.push(asset.uri);
    const made = await deps.squarePng(asset, ICON_IMAGE_PX);
    const png: SquarePng = typeof made === 'string' ? { base64: made, uri: null } : made;
    if (png.uri) written.push(png.uri);
    if (!png.base64) throw new Error('no image data');
    return { status: 'picked', uri: `data:image/png;base64,${png.base64}` };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[iconImage] pick failed:', messageOf(e));
    return { status: 'failed' };
  } finally {
    for (const uri of written) await discardQuietly(uri);
  }
}

/**
 * Delete what the picker and the manipulator left in their cache folders
 * (`ICON_CACHE_FOLDERS`): files named as `ICON_CACHE_FILE_NAME` says, nothing
 * else. For Erase and account deletion. Never throws.
 */
export async function sweepIconImageFiles(): Promise<void> {
  let files: Array<{ name: string; uri: string }>;
  try {
    files = (await deps.listCached?.()) ?? [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[iconImage] could not list the cache:', messageOf(e));
    return;
  }
  for (const file of files) {
    if (ICON_CACHE_FILE_NAME.test(file.name)) await discardQuietly(file.uri);
  }
}

async function discardQuietly(uri: string): Promise<void> {
  try {
    await deps.discard?.(uri);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[iconImage] could not delete a cached picture:', messageOf(e));
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'unknown error';
}
