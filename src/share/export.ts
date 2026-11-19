// Share-card export (L5). Rasterizes a rendered card to PNG and hands it to
// the OS share sheet.
//
// Sharing is the growth engine and it is free forever (CLAUDE.md) — nothing
// here consults entitlements. It is also, like every L5 service, optional to
// the core loop: a failure returns an outcome the caller can render as a
// message, never an exception that takes down the Stats screen.
//
// Deps are injectable so tests exercise the real control flow without the
// native modules, matching the pattern in notifications/scheduler.ts.
//
// The PNG is deleted once the share sheet has closed, however it closed
// (security review, 2026-11-18): a recap card can carry a prediction's words
// ("Surest call that happened"). Erase and account deletion sweep any left
// behind (`sweepShareCaptures`).

import type { RefObject } from 'react';
import { Platform, Share } from 'react-native';

/** What the caller should tell the user. */
export type ShareOutcome =
  | 'shared' // handed to the OS share sheet
  | 'unavailable' // no share sheet on this platform (e.g. web)
  | 'failed'; // capture or share threw

/** The subset of react-native-view-shot + expo-sharing this module needs. */
export interface ShareDeps {
  /** Rasterize the referenced view to a PNG file, returning its URI. */
  capture(ref: RefObject<unknown>): Promise<string>;
  /** Whether the OS exposes a share sheet at all. */
  isAvailable(): Promise<boolean>;
  share(uri: string): Promise<void>;
  /** Open the share sheet on plain text. Optional so older fakes still fit. */
  shareText?(message: string): Promise<void>;
  /** Delete a captured PNG (react-native-view-shot's releaseCapture). Optional, as above. */
  release?(uri: string): Promise<void>;
  /** The files in react-native-view-shot's capture folder. Optional, as above. */
  listCaptures?(): Promise<Array<{ name: string; uri: string }>>;
  /** Delete one file `listCaptures` returned. Optional, as above. */
  deleteCapture?(uri: string): Promise<void>;
}

/**
 * The name react-native-view-shot gives a capture on iOS (`result:
 * 'tmpfile'`): React Native's RCTTempFilePath, a fresh UUID plus the format's
 * extension, in `tmp/ReactNative/`. The sweep deletes only these.
 */
export const CAPTURE_FILE_NAME =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\.png$/i;

/**
 * Where react-native-view-shot writes a capture on iOS, from the app's cache
 * directory: NSTemporaryDirectory() is the container's `tmp/`, beside
 * `Library/Caches/`, and RCTTempFilePath writes in its `ReactNative/` folder.
 * Null for any other layout, and then nothing is swept.
 */
export function captureDirectoryUri(cacheUri: string): string | null {
  const match = /^(file:\/\/\/.+\/)Library\/Caches\/?$/.exec(cacheUri);
  return match ? `${match[1]}tmp/ReactNative/` : null;
}

let deps: ShareDeps | null = null;

// A card is a screenshot-native artifact. 3x turns the identity card's fixed
// 360pt canvas into the 1080px-wide Post and Story images DESIGN_SYSTEM §7.5
// specifies (roadmap step 53); flat colour keeps the PNG small at that size.
const CAPTURE_OPTIONS = { format: 'png', quality: 1, result: 'tmpfile' } as const;
const CAPTURE_PIXEL_RATIO = 3;

function defaultDeps(): ShareDeps {
  return {
    async capture(ref) {
      // Lazy require: keeps the native module out of Jest and off the web
      // bundle's critical path.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { captureRef } = require('react-native-view-shot') as {
        captureRef: (ref: unknown, options: unknown) => Promise<string>;
      };
      return await captureRef(ref, {
        ...CAPTURE_OPTIONS,
        pixelRatio: CAPTURE_PIXEL_RATIO,
      });
    },
    async isAvailable() {
      if (Platform.OS === 'web') return false;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      return await Sharing.isAvailableAsync();
    },
    async share(uri) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Share your calibration',
      });
    },
    async release(uri) {
      // The web build has no capture file.
      if (Platform.OS === 'web') return;
      // The library's own delete: it removes only a file inside its capture
      // folder (RNViewShot.mm checks the path).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { releaseCapture } = require('react-native-view-shot') as {
        releaseCapture: (uri: string) => void;
      };
      releaseCapture(uri);
    },
    async listCaptures() {
      if (Platform.OS === 'web') return [];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const dirUri = captureDirectoryUri(Paths.cache.uri);
      if (!dirUri) return [];
      const dir = new Directory(dirUri);
      if (!dir.exists) return [];
      return dir
        .list()
        .filter((entry): entry is InstanceType<typeof File> => entry instanceof File)
        .map((file) => ({ name: file.name, uri: file.uri }));
    },
    async deleteCapture(uri) {
      if (Platform.OS === 'web') return;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { File } = require('expo-file-system') as typeof import('expo-file-system');
      const file = new File(uri);
      if (file.exists) file.delete();
    },
  };
}

function getDeps(): ShareDeps {
  if (!deps) deps = defaultDeps();
  return deps;
}

/** Test-only: swap the platform deps. */
export function __setShareDepsForTests(next: ShareDeps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setShareDepsForTests is only allowed when NODE_ENV=test');
  }
  deps = next;
}

/**
 * Rasterize a card to a PNG file. Returns the file URI, or null if capture
 * failed — callers decide whether that is worth surfacing.
 */
export async function captureCard(
  ref: RefObject<unknown>,
): Promise<string | null> {
  try {
    return await getDeps().capture(ref);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[share] capture failed:', e);
    return null;
  }
}

/**
 * Share a plain-text version of the card (DESIGN_SYSTEM §7.5): it pastes into
 * any chat, needs no image permission, and carries no prediction titles.
 * React Native's Share uses the Web Share API in a browser that has one.
 */
export async function shareText(message: string): Promise<ShareOutcome> {
  const d = getDeps();
  const send =
    d.shareText ??
    (async (m: string) => {
      await Share.share({ message: m });
    });
  try {
    await send(message);
    return 'shared';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[share] text share failed:', e);
    return Platform.OS === 'web' ? 'unavailable' : 'failed';
  }
}

/**
 * Capture the referenced card and open the OS share sheet on it.
 *
 * Availability is checked before capture: on a platform with no share sheet,
 * rasterizing first would burn the work and then throw it away.
 */
export async function shareCard(ref: RefObject<unknown>): Promise<ShareOutcome> {
  const d = getDeps();

  try {
    if (!(await d.isAvailable())) return 'unavailable';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[share] availability check failed:', e);
    return 'unavailable';
  }

  const uri = await captureCard(ref);
  if (!uri) return 'failed';

  try {
    await d.share(uri);
    return 'shared';
  } catch (e) {
    // Includes the user dismissing the sheet on some platforms. Reported as a
    // failure rather than a success — the caller only ever uses it to decide
    // whether to show a retry hint.
    // eslint-disable-next-line no-console
    console.warn('[share] share sheet failed:', e);
    return 'failed';
  } finally {
    // Once the sheet has closed, sent, cancelled or failed: expo-sharing
    // resolves `shareAsync` from the sheet's completion handler on iOS, so
    // the app the person chose has the image by then.
    await releaseQuietly(d, uri);
  }
}

/**
 * Delete every capture left in react-native-view-shot's folder
 * (`captureDirectoryUri`): files named as `CAPTURE_FILE_NAME` says, nothing
 * else. For Erase and account deletion. Never throws.
 */
export async function sweepShareCaptures(): Promise<void> {
  const d = getDeps();
  let files: Array<{ name: string; uri: string }>;
  try {
    files = (await d.listCaptures?.()) ?? [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[share] could not list captures:', messageOf(e));
    return;
  }
  for (const file of files) {
    if (!CAPTURE_FILE_NAME.test(file.name)) continue;
    try {
      await d.deleteCapture?.(file.uri);
    } catch (e) {
      // One that won't go doesn't keep the rest.
      // eslint-disable-next-line no-console
      console.warn('[share] could not delete a capture:', messageOf(e));
    }
  }
}

async function releaseQuietly(d: ShareDeps, uri: string): Promise<void> {
  try {
    await d.release?.(uri);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[share] could not delete the card image:', messageOf(e));
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'unknown error';
}
