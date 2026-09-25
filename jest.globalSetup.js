// Pin Jest to UTC so date tests read the same on every machine.
//
// The engine keys days, weekdays, months and years in the device's local
// time — that is what a user means by "Monday" or "a streak". Without a
// pinned zone those tests would pass in CI and fail on a laptop in Chicago.
//
// This has to be globalSetup, not setupFiles: test files run in a sandbox
// whose process.env is a copy, so setting TZ there never reaches Date. Here
// it is set on the real process before any worker is spawned, and workers
// inherit it. Tests that need another zone use __setTimeZoneForTests in
// src/engine/localTime.ts.
module.exports = async () => {
  process.env.TZ = 'UTC';
};
