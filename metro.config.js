// Web target needs to resolve `.wasm` imports from expo-sqlite's wa-sqlite
// worker. Without this, `expo start --web` fails to bundle on the first
// require of expo-sqlite. iOS/Android targets are unaffected.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
