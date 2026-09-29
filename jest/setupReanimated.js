// Reanimated 4 under Jest (DESIGN_SYSTEM §9). Worklets have no native runtime
// here, so the package's own mock stands in, and Reanimated's test helpers
// make animations resolve synchronously.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();
