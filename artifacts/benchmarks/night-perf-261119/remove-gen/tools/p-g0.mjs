// G0 (noise floor, not a lever): the same rules, only the market's tie-break draws reseeded.
export default [
  { file: 'packages/engine/src/npc-market.ts',
    from: "random(`${w.seed}:npc-market:${w.year}:${day}:${id}`)",
    to: "random(`${w.seed}:npc-market-x:${w.year}:${day}:${id}`)" },
];
