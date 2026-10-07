// Inter on web (roadmap D1). iOS embeds the same five files at build time
// under the family "Inter" (app.json, expo-font plugin); here they are
// registered under that same family with weight descriptors, so the theme's
// `fontFamily: 'Inter'` plus a `fontWeight` picks the right face on both.
// expo-font's own web loader names each file as its own family, which would
// make every weight a separate family name.

import { Asset } from 'expo-asset';

/* eslint-disable @typescript-eslint/no-var-requires */
const FACES: ReadonlyArray<[weight: number, source: number]> = [
  [400, require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf')],
  [500, require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf')],
  [600, require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf')],
  [700, require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf')],
  [800, require('@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf')],
];
/* eslint-enable @typescript-eslint/no-var-requires */

let loaded: Promise<void> | null = null;

/**
 * Register Inter's weights and wait (briefly) for them, so the first screen
 * doesn't paint in the fallback and then jump. Never rejects: on any failure
 * the stack in FONT_FAMILY falls back to the system face.
 */
export function loadFonts(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    if (typeof document === 'undefined') return;
    const css = FACES.map(
      ([weight, source]) =>
        `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};` +
        `font-display:swap;src:url('${Asset.fromModule(source).uri}') format('truetype');}`,
    ).join('\n');
    const style = document.createElement('style');
    style.setAttribute('data-calibrate-fonts', '');
    style.textContent = css;
    document.head.appendChild(style);
    const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fontSet) return;
    const ready = Promise.all(FACES.map(([weight]) => fontSet.load(`${weight} 16px Inter`)));
    // Don't hold the first screen for long on a slow connection.
    await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
  })().catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[fonts] Inter failed to load; using the system face:', e);
  });
  return loaded;
}
