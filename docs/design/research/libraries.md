> **Raw research, 2026-09-25.** Kept for its sources and reasoning. The decisions drawn
> from it live in [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) and
> [`../UI_ROADMAP.md`](../UI_ROADMAP.md); where they differ, those files win. References to
> `design-baseline/0N-*.png` mean [`../baseline/`](../baseline/) (web-build captures).

# Calibrate: UI library research (premium look and feel)

Researched 2026-09-25. Research only; nothing in the repo was changed.
npm weekly downloads are for 2026-09-18 to 2026-09-24 (api.npmjs.org). GitHub stars and
last push are from api.github.com on the same day. "SDK 55 pin" means the version in
`node_modules/expo/bundledNativeModules.json` for expo 55.0.26, which is what
`npx expo install` would pick.

---

## 0. Ground truth (as of 2026-09-28; the migration it fed is done)

Expo SDK 55 (RN 0.83, React 19.2, expo-router 55), New Architecture only (SDK 55 removed the legacy one). A development build is already the way this app runs (`expo-dev-client`, native `react-native-purchases`), and Expo Go supports only the SDK 54 builds. `expo-router` 55 already ships `expo-glass-effect` and `expo-symbols`, so NativeTabs, glass and SF Symbols cost almost nothing to install. SDK 56 and 57 were stable and 58 in beta by 2026-09-15 (upgrade sequencing: `docs/NEXT_STEPS.md` item j). The card must still render on web for screenshots even though export is native-only (`src/share/export.ts` lazily requires `react-native-view-shot`). The confidence control keeps its `adjustable` accessibility role whatever it draws.

---

## 1. Styling and theming

### Candidates

| Library | Version / date | Stars | npm/wk | New Arch / RN 0.83 | Expo Go | Web | Jest | Adoption cost here |
|---|---|---|---|---|---|---|---|---|
| **Plain StyleSheet + token file** | n/a | n/a | n/a | yes | yes | yes | nothing changes | **Lowest.** Mechanical swap of hex values for `colors.textMuted` etc. Can be done file by file. |
| NativeWind v4 | 4.2.7, 2026-09-14 | 8.1k | 1.66M | yes (needs Reanimated) | yes | yes | works under jest-expo but adds a babel `jsxImportSource`, metro wrapper, `global.css` and a Tailwind config | High. Rewrites every `style=` to `className`, touches babel and metro (metro already has a wasm tweak for expo-sqlite), and brings in Reanimated as a peer. v4 is on Tailwind v3 and is heading for replacement. |
| NativeWind v5 | 5.0.0-rc.0 (RC, Sept 2026) | same | n/a | yes | n/a | yes | undocumented | Avoid. The official docs say **"not intended for production use"** ([nativewind.dev/v5](https://www.nativewind.dev/v5)). |
| Uniwind | 1.12.0, 2026-09-04 | 1.7k | 714k | Fabric, RN >= 0.81 | yes | yes | not documented | Tailwind v4, compiled at build time, claims about 2x NativeWind ([docs](https://docs.uniwind.dev/)). From the Unistyles author; free core plus a Pro tier. Same full-rewrite cost as NativeWind. |
| Unistyles 3 | 3.3.0, 2026-07-10 | 3.0k | 223k | New Arch only, RN >= 0.78, needs `react-native-nitro-modules` | **no** | yes | `react-native-unistyles/mocks` in `setupFiles`, but the docs say not to test theme or breakpoint output in Jest ([testing](https://www.unistyl.es/v3/start/testing)) | Medium. It is a drop-in `StyleSheet` replacement (`StyleSheet.create((theme) => ...)`), so migration is incremental, but it adds a babel plugin and a nitro native module. Overkill for a light-mode-only app ([getting started](https://www.unistyl.es/v3/start/getting-started)). |
| Tamagui 2 | 2.7.7, 2026-08-15 (v3 beta already exists) | 14.2k | 201k | yes, React >= 19 | yes | first-class | needs a provider in every render | Very high. You adopt its primitives (`YStack`, `Text`), its config and its compiler. Used by Uniswap ([blog](https://tamagui.dev/blog/version-two)). Moving from v2 to v3 soon after 2.0 went stable is churn. |
| Gluestack UI v5 | core 5.0.15, 2026-06-25 | 5.3k | 84k | yes | yes | yes | ok | High. Copy-paste components on NativeWind v5 (itself an RC) or Uniwind ([v5 alpha discussion](https://github.com/gluestack/gluestack-ui/discussions/3366)). Went from v3 to v5 in 12 months. |
| react-native-reusables | rn-primitives 1.5.2, 2026-07-02 | 8.7k | 583k | yes | yes | yes | ok | High. shadcn-style copy-paste, needs NativeWind or Uniwind ([repo](https://github.com/founded-labs/react-native-reusables)). Would suit a new app, not a retrofit. |
| HeroUI Native | 1.0.10, 2026-09-21 | 3.7k | 158k | RN >= 0.81, Reanimated 4, gorhom sheet | yes | **not recommended for web: experimental and unmaintained** ([HeroUI docs](https://heroui.com/en/docs/native/getting-started)) | ? | Disqualified by the web requirement. |
| React Native Paper | 5.15.3, 2026-05-26 | 14.5k | 412k | yes | yes | yes | good | Low to medium, but it is **Material Design**, the opposite of an iOS-first premium feel. |
| Restyle (Shopify) | 2.4.5, **2025-03-19** | 3.4k | 126k | yes | yes | yes | good | Medium. Typed theme and variants. The last release was 18 months ago, so maintenance looks slow. |

### Pick: plain StyleSheet plus a hand-rolled token file
`src/constants/theme.ts` exporting `colors` (semantic names such as `bg`, `surface`,
`textPrimary`, `textMuted`, `accent`, `success`, `warning`, `danger`, plus badge-tier
colors), `space` (4-pt scale), `radius`, `type` (a font-family plus size/weight/lineHeight
ramp) and `shadow`.

- Why: zero new dependencies, and nothing changes for Jest, web or babel. You can migrate one
  file per PR. It fits the existing `@/constants` import. Most of the premium look comes
  from the palette, type, spacing, radius and elevation, not from the styling engine.
- RN 0.83 on the New Architecture already supports `boxShadow` and `filter` style props and
  experimental CSS gradients through `experimental_backgroundImage` (mentioned in the
  [linear-gradient docs](https://docs.expo.dev/versions/v55.0.0/sdk/linear-gradient/)). Soft,
  layered iOS-style shadows need no library.
- **Runner-up: Unistyles 3.** It is the only engine that keeps the `StyleSheet.create`
  shape, so you could adopt it later without rewriting. Choose it only if dark mode or
  runtime theming comes back; `app.json` currently pins `userInterfaceStyle: "light"`.
  If the team strongly wants Tailwind, choose **Uniwind** over NativeWind: it is on
  Tailwind v4 now, while NativeWind v5 is still an RC.

---

## 2. Motion

| Library | SDK 55 pin / latest | Stars | npm/wk | New Arch | Expo Go | Web | Jest | Notes |
|---|---|---|---|---|---|---|---|---|
| **Reanimated 4** (+ react-native-worklets) | 4.2.1 + worklets 0.7.4 / latest 4.7.0 (2026-09-18) | 11.0k | 7.8M | **required** | yes ([SDK 55 doc](https://docs.expo.dev/versions/v55.0.0/sdk/reanimated/)) | yes, all JS, "efficiency might be lower" ([web](https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support/)) | `require('react-native-reanimated').setUpTests()` in `setupFilesAfterEnv`, plus `jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))` ([reanimated testing](https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/), [worklets testing](https://docs.swmansion.com/react-native-worklets/docs/guides/testing/)) | Babel plugin auto-configured by `babel-preset-expo`. **CSS animations/transitions API** (`animationName` keyframes, `transitionProperty`) works on iOS, Android and web and supports react-native-svg components ([CSS animations](https://docs.swmansion.com/react-native-reanimated/docs/css-animations/animation-name/)). Layout animations (`entering={FadeInDown}`) cover list and card reveals. Used by 93.2% of respondents in the [State of RN 2025 survey](https://results.stateofreactnative.com/en-US/animations/). |
| Moti | 0.30.0, **2025-01-29** | 4.6k | 290k | built for Reanimated 3 | yes | yes | ok | **Avoid.** No release in 20 months, and there is an open Reanimated 4 / SDK 54 breakage issue ([moti#391](https://github.com/nandorojo/moti/issues/391)). Reanimated 4's CSS API covers the same ground. |
| react-native-ease | 0.8.0, 2026-08-03 | 1.0k | 32k | Fabric only | no (custom native code) | not documented | not documented | Runs animations on Core Animation, no JS thread. Pre-1.0, no layout or gesture animations, and web support is unclear ([repo](https://github.com/AppAndFlow/react-native-ease)). Not a fit, given the web requirement. |
| Lottie (`lottie-react-native`) | 7.3.4 pin / **7.4+ requires RN >= 0.84** | 17.2k | 1.35M | yes | yes | yes, needs the `@lottiefiles/dotlottie-react` peer | mock the native view | Good for a one-off celebration such as a badge unlock or Warmup verdict. Needs designer-made JSON. Pin 7.3.x on SDK 55. |
| Rive: `rive-react-native` 9.8.5 / new `@rive-app/react-native` 0.4.20 (Nitro, v0.5 beta) | none in SDK | 783 / 154 | 63k / 118k | yes | **no** | **no** (not in the new runtime's docs) ([repo](https://github.com/rive-app/rive-nitro-react-native)) | mock | **Avoid for now.** No web support, and the runtime is mid-rewrite. |
| expo-router zoom transition (`Link.AppleZoom`) | SDK 55+ | n/a | n/a | yes | n/a | renders normally without the effect | n/a | **Alpha**, iOS 18+ only. Known navigation delays and it doesn't work with header screens ([docs](https://docs.expo.dev/router/advanced/zoom-transition/)). Good fit for PredictionCard to Resolve later. Don't make it load-bearing. |

**Pick: Reanimated 4 (SDK 55 pin 4.2.1).** Use the CSS-transition API for most
micro-interactions (press scale, badge pop, count-up score, chart draw-in via animated
`strokeDashoffset` on the existing SVG polyline) and layout animations for list reveals.
**Runner-up: Lottie 7.3.x** for one or two hero moments. For shared-element transitions,
use expo-router's zoom transition as progressive enhancement on iOS only.

---

## 3. Charts and graphics

| Option | Version | Stars | npm/wk | Web | Expo Go | Jest | view-shot compatible | Notes |
|---|---|---|---|---|---|---|---|---|
| **Keep hand-rolled react-native-svg** | 15.15.3 pin (latest 15.15.5, 2026-05-11) | 8.0k | 7.1M | yes (DOM SVG) | yes | already works | **yes**, since it renders ordinary native views | A calibration curve is five points and a diagonal; no library beats about 150 lines. Reanimated animates SVG props (`useAnimatedProps`, CSS animations support RN-SVG). SVG `LinearGradient`/`RadialGradient` give share cards gradients that rasterize reliably. |
| `@shopify/react-native-skia` | 2.4.18 pin / latest 2.13.0 (2026-09-24) | 8.6k | 1.22M | **CanvasKit WASM, 2.9 MB gzipped**, loaded async via `WithSkiaWeb`/`LoadSkiaWeb`, and `setup-skia-web` must run on every upgrade ([web](https://shopify.github.io/react-native-skia/docs/getting-started/web/)) | yes (bundled in SDK) | needs `testEnvironment: '@shopify/react-native-skia/jestEnv.js'` and a `jestSetup` ([install](https://shopify.github.io/react-native-skia/docs/getting-started/installation/)) | **Not reliably.** view-shot "has no guaranteed support of special components like Video / GL views", and a failing part can blank the whole snapshot ([view-shot README](https://github.com/gre/react-native-view-shot)). Skia has its own path: `canvasRef.makeImageSnapshotAsync()` then `encodeToBytes()`, and `makeImageFromView(ref)` to rasterize RN views (needs `collapsable={false}`) ([canvas](https://shopify.github.io/react-native-skia/docs/canvas/overview/), [snapshot views](https://shopify.github.io/react-native-skia/docs/snapshotviews/)). | Adds about 6 MB on iOS and 4 MB on Android. You would have to rewrite the share export path and give up web parity (a 2.9 MB WASM download for one chart). Worth it only for shader effects, and only for 43.6% of apps does anyone reach for it (State of RN 2025). |
| Victory Native XL | latest 42.0.1 (2026-08-31) needs **Skia >= 2.6**; SDK 55 pins Skia 2.4.18, so you'd need **41.26.0** | 1.2k | 432k | **not supported** ([issue #223](https://github.com/FormidableLabs/victory-native-xl/issues/223)) | yes | Skia and Reanimated mocks | same Skia caveat | **Avoid.** No web, and it pulls in Skia, Reanimated and Gesture Handler for one chart. |
| react-native-gifted-charts | 1.4.78 (2026-08-10) | 1.4k | 225k | through a separate `react-gifted-charts` package, so not the same component | yes | ok (SVG) | yes (SVG) | Bar, line and pie presets. The calibration curve (scatter plus diagonal plus sized markers) is custom anyway. No benefit over the current code. |

**Pick: keep hand-rolled react-native-svg** and invest in design: gradient area under
the curve, a soft "perfect calibration" band, animated draw-in, and haptic scrubbing later.
**Runner-up: Skia**, but only if a specific shader effect earns it, and then export with Skia's
own `makeImageSnapshotAsync` rather than view-shot.

**view-shot version note:** SDK 55 pins 4.0.3 (2024-12-06). v5.0.0 (2026-05-01) added
Fabric/TurboModules support and v6.0.0 (2026-09-20) made `html2canvas-pro` an optional
web peer and requires RN >= 0.80 ([releases](https://github.com/gre/react-native-view-shot/releases)).
Stay on the pinned 4.0.3 until the SDK moves. v6 would make web capture possible if you
ever want share-card export on web.

---

## 4. Native iOS feel

| Library | SDK 55 pin | Web | Expo Go | Jest | Verdict |
|---|---|---|---|---|---|
| **expo-router NativeTabs** (`expo-router/unstable-native-tabs`) | ships in expo-router 55 | **falls back to a floating, text-only pill at the top** (Radix Tabs; checked in `node_modules/expo-router/build/native-tabs/NativeTabsView.web.js`: no icons) | n/a (dev build) | not documented; mock or keep out of tests | **Recommended, but keep JS `Tabs` on web.** It gives the real UITabBar and, on iOS 26, the **Liquid Glass tab bar** plus `minimizeBehavior` on scroll. `backgroundColor`/`blurEffect` have no effect on iOS 26; the glass takes its color from the content behind it. Icons via `sf` (SF Symbols), `md` or `src`. Distinct selected/unselected icons need SDK 56+. `bottomAccessory` needs SDK 55+. Tabs must be static. The API is **unstable until SDK 58**, where it moves to `expo-router/native-tabs` ([docs](https://docs.expo.dev/router/advanced/native-tabs/)). To keep web screenshots stable, keep the current `Tabs` in `app/(tabs)/_layout.web.tsx` and put NativeTabs in `_layout.tsx` (Expo Router platform extensions; verify with a web export). |
| **expo-symbols** (SF Symbols) | 55.0.8 (already installed transitively) | yes: renders Google **Material Symbols** via font (`name={{ ios, android, web }}`) or a `fallback` node | yes | plain component | **Recommended** for in-app icons. SF Symbols on iOS; on web pass `web:` names or `fallback={<Ionicons/>}`. Beta API ([docs](https://docs.expo.dev/versions/v55.0.0/sdk/symbols/)). |
| **expo-haptics** | 55.0.14 | Web Vibration API (a no-op on desktop Chrome, harmless) | yes | `jest-expo` ships Expo module mocks | **Recommended.** `selectionAsync` on slider detents, `impactAsync(Light)` on yes/no, `notificationAsync(Success)` on badge unlock ([docs](https://docs.expo.dev/versions/v55.0.0/sdk/haptics/)). |
| **@react-native-community/slider** | 5.1.2 | **yes** | yes | native view renders as a host component in Jest | **Recommended** to replace ±5. Keep the ±5 buttons (or `accessibilityActions`) alongside it for fine control and VoiceOver ([Expo doc](https://docs.expo.dev/versions/v55.0.0/sdk/slider/), [repo](https://github.com/callstack/react-native-slider)). `step={5}`, `StepMarker` for bucket ticks at 20/40/60/80. |
| expo-glass-effect | 55.0.11 (installed) | plain `View` fallback | yes | trivial | Use sparingly, for example a floating Save bar or a score chip. Needs iOS 26+; check with `isLiquidGlassAvailable()`. Known issues: `opacity: 0` breaks the glass, and `isInteractive` is fixed at mount ([docs](https://docs.expo.dev/versions/v55.0.0/sdk/glass-effect/)). |
| expo-blur | 55.0.14 | CSS backdrop-filter | yes | trivial | Optional (a sticky header over the Stats scroll). Android now needs `BlurTargetView`. Don't put it inside share cards. |
| expo-linear-gradient | 55.0.14 | yes | yes | trivial | Fine for screen backgrounds. For **share cards prefer SVG gradients**, which rasterize the same way as the chart. |
| expo-mesh-gradient | 55.0.14 | **no web** | yes | n/a | Skip because it has no web renderer. |
| expo-router `formSheet` (Stack presentation) | built in | **renders as a normal stack route on web** ([modals](https://docs.expo.dev/router/advanced/modals/)) | n/a | n/a | **Recommended** for Resolve, the category picker and the date picker. Detents, grabber, and on iOS 26+ it **adopts Liquid Glass automatically** ([SDK 55 changelog](https://expo.dev/changelog/sdk-55)). Watch the `fitToContents` sizing bugs ([#42066](https://github.com/expo/expo/issues/42066)). |
| @gorhom/bottom-sheet | not in SDK; 5.2.14, **2026-05-09** | partial | yes | needs mocks | **Avoid.** It pulls in Reanimated and Gesture Handler, and there was an SDK 55 crash report ([expo#42886](https://github.com/expo/expo/issues/42886)). formSheet is native and free. |
| @expo/ui (SwiftUI) | 55.0.17 | **no** (web APIs experimental even in SDK 56) | **no in SDK 55** (Expo Go gets it in SDK 56) | needs mocking | **Defer.** Beta in SDK 55 ("subject to breaking changes"); `Host` wrapper required; stable in SDK 56 ([SDK 55 SwiftUI](https://docs.expo.dev/versions/v55.0.0/sdk/ui/swift-ui/), [SDK 56](https://expo.dev/changelog/sdk-56)). A native SwiftUI `Slider`/`Gauge` would look great, but it breaks web parity. Revisit after upgrading the SDK. |

---

## 5. Typography

- **expo-font** 55.0.8, plus `@expo-google-fonts/*`. The config plugin (embedded at build
  time, no flash) is recommended for native but "doesn't work with Expo Go" and "only runs
  on native", so **web needs `useFonts`** ([fonts guide](https://docs.expo.dev/develop/user-interface/fonts/)).
  Practical setup: config plugin for iOS/Android plus `useFonts` in a `.web` root, or just
  `useFonts` everywhere behind the existing splash screen. Variable fonts are only supported
  from SDK 58, so use static weights on SDK 55. Font family names differ: iOS uses
  the PostScript name and Android the file name.
- **Tabular numerals:** RN's `fontVariant: ['tabular-nums']` is supported
  ([text style props](https://reactnative.dev/docs/text-style-props)) and maps to CSS
  `font-variant-numeric` on web. It only works if the font has a `tnum` feature. Inter
  ([rsms.me/inter](https://rsms.me/inter/)) and Geist ([vercel.com/font](https://vercel.com/font))
  both do. Check the specific Google-Fonts TTF once with a `1111` vs `8888` width test.
- **SF Pro Rounded:** `fontFamily: 'ui-rounded'` is supported on iOS
  ([text style props](https://reactnative.dev/docs/text-style-props)). On web, `ui-rounded` is
  Safari-only, so **Chromium web screenshots will fall back** to another face.

| Family | Package | npm/wk | tnum | Feel |
|---|---|---|---|---|
| **Inter** (+ Inter Display optical size) | `@expo-google-fonts/inter` 0.4.2 | 854k | yes | Closest to SF on web and native; neutral and data-forward |
| Geist | `@expo-google-fonts/geist` 0.4.2 (2026-05-15) | 119k | yes, and tabular by default at the OS/2 level | More distinctive and technical |
| DM Sans | 0.4.2 | 183k | check | Friendly geometric |
| Space Grotesk | 0.4.1 | 251k | check | Quirky display; risky for body text |
| SF Pro / SF Rounded (system) | none | n/a | yes | Most native on iOS, zero bytes, **but no web parity** |

**Pick: Inter** for UI and body text (it renders identically on iOS and in the web
screenshot pipeline), with `tabular-nums` on every score, percentage and count.
Use heavy weight plus tight letter-spacing for the big score. **Runner-up: Geist**
if you want more brand character. Optionally set the headline score in `ui-rounded` on iOS
only, via `Platform.select`, and accept that web screenshots won't show it.

---

## Recommended stack (summary)

| Category | Pick | Runner-up |
|---|---|---|
| Styling | StyleSheet + `src/constants/theme.ts` tokens | Unistyles 3 (same API shape) |
| Motion | Reanimated 4.2.x (CSS transitions + layout animations) | Lottie 7.3.x for 1–2 hero moments |
| Charts | Keep react-native-svg, animated with Reanimated | Skia + its own snapshot API (not view-shot) |
| Native feel | NativeTabs (iOS, Liquid Glass) + expo-symbols + expo-haptics + community slider + formSheet | expo-glass-effect accents; @expo/ui after an SDK upgrade |
| Type | Inter via expo-google-fonts, `tabular-nums` | Geist |

## Avoid
- **NativeWind v5 / Gluestack v5**: pre-release engine ("not intended for production use").
- **NativeWind v4, Tamagui, Gluestack, reusables**: full rewrite of about 37 screen and component files and babel/metro changes, for no visual gain over tokens.
- **HeroUI Native**: web not recommended by the vendor.
- **React Native Paper**: Material Design, wrong idiom for iOS-first.
- **Moti**: unmaintained since 2025-01 with a Reanimated 4 issue.
- **Victory Native XL**: no web support; v42 needs Skia >= 2.6 (SDK 55 has 2.4.18).
- **Skia inside share cards**: view-shot can't reliably capture GL surfaces.
- **Rive, react-native-ease, expo-mesh-gradient**: no web support.
- **@gorhom/bottom-sheet**: formSheet does it natively.
- **@expo/ui on SDK 55**: beta, and no web.

## Migration order (done; step 7 waits on the SDK upgrade)

Tokens, Inter and tabular numerals first; then expo-symbols and expo-haptics; the confidence slider (keeping ±5 and the accessibility actions); Reanimated 4.2.x with its Jest setup; the share-card redesign on SVG; NativeTabs on iOS with JS tabs kept on web, and formSheet for Resolve. **Still open:** after SDK 57 or 58, stable NativeTabs, `@expo/ui` SwiftUI controls, variable fonts and view-shot 6.

## Compatibility risks
- **npm `latest` no longer targets RN 0.83.** Reanimated 4.7+ supports RN 0.86+ only ([compat table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)); lottie-react-native 7.4+ needs RN >= 0.84; victory-native 42 needs Skia >= 2.6. **Always `npx expo install`**, never `npm i`.
- **Reanimated in Jest:** add `setupFilesAfterEnv` with `setUpTests()` plus the worklets mock, or component tests that import animated components will throw.
- **NativeTabs on web** changes the navigation to a top pill with no icons, which would break the screenshot baseline. Use a `.web` layout. On SDK 55 the API is `unstable-native-tabs`, so expect breaking changes (it is stable in 58).
- **Liquid Glass tab bar:** background props are ignored on iOS 26. Design the content behind it (for example, avoid a flat `#f2f2f2` ground under the tab bar).
- **Hermes V1 memory regression** with worklets/Reanimated on SDK 56 and early 57 (fixed in expo 57.0.9 / RN 0.86.2) ([SDK 56](https://expo.dev/changelog/sdk-56), [SDK 57](https://expo.dev/changelog/sdk-57)). When upgrading past 55, go straight to 57.0.9 or later.
- **SDK 56 breaks `@react-navigation/*` imports** (Expo Router forked it; a codemod exists) and deprecates `@expo/vector-icons` in favor of `@react-native-vector-icons/*`. That is another reason to move icons to expo-symbols now.
- **`ui-rounded` and SF Symbols won't show on web**, so web screenshots are not a faithful preview of iOS for those two elements.
- **formSheet `fitToContents`** has open sizing bugs ([#42066](https://github.com/expo/expo/issues/42066)); prefer fixed detents.

## Sources
- Expo changelogs: [SDK 55](https://expo.dev/changelog/sdk-55), [SDK 56](https://expo.dev/changelog/sdk-56), [SDK 57](https://expo.dev/changelog/sdk-57), [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)
- Expo docs: [Native tabs](https://docs.expo.dev/router/advanced/native-tabs/), [Zoom transition](https://docs.expo.dev/router/advanced/zoom-transition/), [Modals](https://docs.expo.dev/router/advanced/modals/), [Glass effect](https://docs.expo.dev/versions/v55.0.0/sdk/glass-effect/), [Symbols](https://docs.expo.dev/versions/v55.0.0/sdk/symbols/), [Haptics](https://docs.expo.dev/versions/v55.0.0/sdk/haptics/), [Blur](https://docs.expo.dev/versions/v55.0.0/sdk/blur-view/), [Linear gradient](https://docs.expo.dev/versions/v55.0.0/sdk/linear-gradient/), [Mesh gradient](https://docs.expo.dev/versions/v55.0.0/sdk/mesh-gradient/), [Slider](https://docs.expo.dev/versions/v55.0.0/sdk/slider/), [Reanimated](https://docs.expo.dev/versions/v55.0.0/sdk/reanimated/), [SwiftUI](https://docs.expo.dev/versions/v55.0.0/sdk/ui/swift-ui/), [Fonts](https://docs.expo.dev/develop/user-interface/fonts/), [Expo Go mismatch](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/)
- Reanimated: [compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/), [testing](https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/), [web](https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support/), [CSS animations](https://docs.swmansion.com/react-native-reanimated/docs/css-animations/animation-name/), [worklets testing](https://docs.swmansion.com/react-native-worklets/docs/guides/testing/)
- Skia: [install](https://shopify.github.io/react-native-skia/docs/getting-started/installation/), [web](https://shopify.github.io/react-native-skia/docs/getting-started/web/), [canvas snapshot](https://shopify.github.io/react-native-skia/docs/canvas/overview/), [snapshot views](https://shopify.github.io/react-native-skia/docs/snapshotviews/)
- [view-shot README](https://github.com/gre/react-native-view-shot), [view-shot releases](https://github.com/gre/react-native-view-shot/releases)
- [Victory Native XL](https://github.com/FormidableLabs/victory-native-xl), [web issue #223](https://github.com/FormidableLabs/victory-native-xl/issues/223), [gifted-charts](https://github.com/Abhinandan-Kushwaha/react-native-gifted-charts)
- [NativeWind v5](https://www.nativewind.dev/v5), [NativeWind install](https://www.nativewind.dev/docs/getting-started/installation), [Uniwind](https://docs.uniwind.dev/), [Unistyles start](https://www.unistyl.es/v3/start/getting-started), [Unistyles testing](https://www.unistyl.es/v3/start/testing), [Tamagui 2](https://tamagui.dev/blog/version-two), [gluestack v5](https://github.com/gluestack/gluestack-ui/discussions/3366), [reusables](https://github.com/founded-labs/react-native-reusables), [HeroUI Native](https://heroui.com/en/docs/native/getting-started)
- [Moti #391](https://github.com/nandorojo/moti/issues/391), [react-native-ease](https://github.com/AppAndFlow/react-native-ease), [Rive Nitro](https://github.com/rive-app/rive-nitro-react-native)
- [RN text style props](https://reactnative.dev/docs/text-style-props), [Inter](https://rsms.me/inter/), [Geist](https://vercel.com/font)
- [State of RN 2025: animations](https://results.stateofreactnative.com/en-US/animations/), [styling](https://results.stateofreactnative.com/en-US/styling/)
- [expo#42886 gorhom crash](https://github.com/expo/expo/issues/42886), [expo#42066 formSheet](https://github.com/expo/expo/issues/42066), [expo#44130 Expo Go](https://github.com/expo/expo/issues/44130)
- Live stats: api.npmjs.org and api.github.com, 2026-09-25.
