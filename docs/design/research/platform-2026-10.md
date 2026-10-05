> **Raw research, 2026-10-05.** Newer, partly unstable platform features that could
> appeal to Calibrate's users. Decisions drawn from it live in
> [`../FUTURE_UI.md`](../FUTURE_UI.md) §D and [`../UI_ROADMAP.md`](../UI_ROADMAP.md) §2;
> where they differ, those files win. Nothing here has run on a device: this project is
> on Expo SDK 55, has no development build yet, and none of these work in Expo Go or on
> the web build.

# Calibrate: platform features worth a look (October 2026)

## 1. What exists now

| Capability | Package / API | Status | Needs |
|---|---|---|---|
| Home Screen and Lock Screen widgets, Live Activities | `expo-widgets`, layouts from `@expo/ui/swift-ui` | Alpha in SDK 55, **stable in SDK 56**; SDK 58 adds Live Activity `staleDate` and runtime widget configuration | Development build; iOS only; app group for shared data |
| Siri, Shortcuts, Spotlight, Apple Intelligence actions | `expo-app-intents` (intents declared in inline Swift modules, handled in JS) | **Alpha in SDK 58 beta** ("frequently experience breaking changes") | SDK 58; development build |
| Native SwiftUI controls (Gauge, Slider, pickers, navigation) | `@expo/ui` | Stable from SDK 56; SDK 58 adds NavigationStack, Toolbar and more | No web parity |
| Native tabs with Liquid Glass | `expo-router/native-tabs` | Stable in SDK 58 (`unstable-native-tabs` before) | SDK 58 (roadmap D3, D5) |
| On-device language model | Apple Foundation Models (iOS 26+, Apple Intelligence devices). WWDC 2026: routing between on-device and Private Cloud Compute, image input, a second larger on-device model on high-end devices, Core AI for custom models | Apple side stable on iOS 26; the React Native bridges are community packages | iOS 26+, an Apple Intelligence device; a native module |
| React Native access to Foundation Models | `@react-native-ai/apple` (Vercel AI SDK provider: `apple.isAvailable()`, structured output through `Output.object` with a zod schema; tools must be pre-registered); also `expo-local-llm`, `expo-foundation-models` | Community; Callstack says the WWDC 2026 additions are still being brought in | Development build |

## 2. Ideas, ranked by likely appeal

1. **Widgets** (P1). A small "2 ready to resolve · next due Tue" widget that opens Home,
   and an identity widget ("Sharp in health") for the Home or Lock Screen. A
   prediction app's problem is coming back when something is due; a glance at the
   Home Screen does that without a notification. `expo-widgets` is stable on SDK 56,
   so it lands naturally after the SDK upgrade (NEXT_STEPS item j).
2. **Private on-device Coach** (P2). Run the Coach on Apple's Foundation Models where
   available: nothing leaves the phone (no OpenAI, no Guideline 5.1.2(i) disclosure,
   works offline, no per-request cost), with the server Coach as the fallback. The
   existing grounding validator (`src/ai/coachValidate.ts`) applies unchanged, since it
   checks the output against the same `CoachContext`. Coverage is limited to Apple
   Intelligence devices, and whether it stays Plus is a product call (D11).
3. **"Log a prediction" from Siri and Shortcuts** (P3). An App Intent that opens Log
   with the spoken title filled in (the confidence still set by hand), and a "What's
   my calibration?" answer. Alpha on SDK 58, so not before the upgrade settles.
4. **A native Gauge for the rating** (P4). `@expo/ui`'s SwiftUI Gauge would look native
   on iOS, but the web build (screenshots, the A8 web Warmup) would need the current
   bar kept as a fallback. Low priority.

Considered and not recommended:
- **Live Activities.** They suit events measured in minutes or hours (a delivery, a
  game). Predictions resolve on a day scale, so a Live Activity would sit on the Lock
  Screen for days, which Apple discourages and users dislike.
- **Resolving from an interactive widget.** Tempting, but Resolve shows the stated
  confidence before asking (DESIGN_SYSTEM §7.10), and writing a resolution from the
  widget extension needs shared database access the app doesn't have. A deep link into
  Resolve gets most of the benefit.

## Sources

- Expo: [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta) · [iOS widgets and Live Activities are stable in SDK 56](https://expo.dev/blog/ios-widgets-and-live-activities-in-expo) · [Widgets (latest)](https://docs.expo.dev/versions/latest/sdk/widgets/) · [Widgets (SDK 55, alpha)](https://docs.expo.dev/versions/v55.0.0/sdk/widgets/) · [AppIntents (SDK 58)](https://docs.expo.dev/versions/v58.0.0/sdk/app-intents/)
- On-device AI: [Callstack, On-device AI after WWDC 2026](https://www.callstack.com/blog/on-device-ai-after-wwdc-2026-whats-new) · [AI SDK, React Native Apple provider](https://ai-sdk.dev/providers/community-providers/react-native-apple) · [callstackincubator/ai](https://github.com/callstackincubator/ai) · [expo-local-llm](https://github.com/GijungKim/expo-local-llm)
