// Text limits by character as a person sees it (playtest 2026-11-08b,
// finding 6), for every field that has one. A store-level module so that
// components reach the engine's helpers without importing the engine
// (src/components/layering.test.ts) or a store they don't otherwise need.

export { fitEdit, fitGraphemes, graphemeLength, unitBackstop } from '@/engine/graphemes';
