// Waits that hold under the full suite's load.
//
// Testing Library's `waitFor` and `findBy` give up after 1 s by default. Tests
// that run the real stores (a recompute bootstraps the record) take about
// that long once all 180-odd suites share the machine, so one or another
// failed in roughly one full run in five and passed alone ("a badge taken
// back", "moves straight on after a skip", 2026-11-14). A passing wait returns
// as soon as it passes, so this costs nothing; a failing one takes 5 s to say so.
const { configure } = require('@testing-library/react-native');

configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(20000);
