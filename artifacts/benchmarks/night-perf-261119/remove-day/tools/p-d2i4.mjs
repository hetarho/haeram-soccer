// d2i4: NPC fixtures fit the place weights with at most 4 proportional-fitting iterations.
import flag from './p-npcflag.mjs';
export default [
  ...flag,
  { file: 'packages/engine/src/aggregate/place.ts',
    from: "  for (let iteration = 0; iteration < AC.place.iterations; iteration++) {",
    to: "  const cap = (globalThis as any).__npc === true ? 4 : AC.place.iterations;\n  for (let iteration = 0; iteration < cap; iteration++) {" },
];
