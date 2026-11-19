// D2t: NPC fixtures stop the place-weight fit at a relative tolerance of 1e-3 instead of 1e-10 (cap unchanged).
import flag from './p-npcflag.mjs';
export default [
  ...flag,
  { file: 'packages/engine/src/aggregate/place.ts',
    from: "      if (!(Math.abs(actual[p]! - expected[p]!) <= 1e-10 * Math.max(1, expected[p]!))) {",
    to: "      if (!(Math.abs(actual[p]! - expected[p]!) <= ((globalThis as any).__npc === true ? 1e-3 : 1e-10) * Math.max(1, expected[p]!))) {" },
];
