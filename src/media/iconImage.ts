// A category's own picture (roadmap D40, decided 2026-11-03): pick one from
// the photo library, crop it square, shrink it to ICON_IMAGE_PX and keep it as
// a PNG data URI in the local `categories` table. It never leaves the phone:
// not synced, and not on a share card.
//
// Layer rule: L5. Fails silently: any error reads as 'failed', and the
// category keeps the icon it had.

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Three times the largest size a category icon shows at (about 40 points). */
export const ICON_IMAGE_PX = 120;

export type PickIconImageResult =
  { status: 'picked'; uri: string } | { status: 'cancelled' } | { status: 'failed' };

interface PickedAsset {
  uri: string;
  width: number;
  height: number;
}

export interface IconImageDeps {
  /** Opens the library with a square crop; null when the person cancels. */
  pick: () => Promise<PickedAsset | null>;
  /** Crops to the centred square, resizes, and returns base64 PNG data. */
  squarePng: (asset: PickedAsset, px: number) => Promise<string>;
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
    if (!saved.base64) throw new Error('no image data');
    return saved.base64;
  },
};

let deps: IconImageDeps = realDeps;

/** Tests only: swap the picker and the image work for fakes, or null to restore. */
export function __setIconImageDepsForTests(next: IconImageDeps | null): void {
  deps = next ?? realDeps;
}

/** Let the person pick a picture for a category icon. Never throws. */
export async function pickIconImage(): Promise<PickIconImageResult> {
  try {
    const asset = await deps.pick();
    if (!asset) return { status: 'cancelled' };
    const base64 = await deps.squarePng(asset, ICON_IMAGE_PX);
    return { status: 'picked', uri: `data:image/png;base64,${base64}` };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[iconImage] pick failed:', e);
    return { status: 'failed' };
  }
}
