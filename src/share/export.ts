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

import type { RefObject } from 'react';
import { Platform } from 'react-native';

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
}

let deps: ShareDeps | null = null;

// A card is a screenshot-native artifact: 2x keeps it crisp when it lands in
// a story or a chat thread, without pushing the file size somewhere the share
// sheet starts to struggle.
const CAPTURE_OPTIONS = { format: 'png', quality: 1, result: 'tmpfile' } as const;
const CAPTURE_PIXEL_RATIO = 2;

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
  }
}
