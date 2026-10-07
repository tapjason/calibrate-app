// Inter (roadmap D1). On iOS and Android the five weights are embedded at
// build time by the expo-font plugin in app.json, so there is nothing to load
// at runtime; web registers them itself (fonts.web.ts).

/** Resolves at once off the web: the fonts ship inside the build. */
export function loadFonts(): Promise<void> {
  return Promise.resolve();
}
