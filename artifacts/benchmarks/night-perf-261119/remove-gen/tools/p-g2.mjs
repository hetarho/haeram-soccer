// G2: one NPC market settlement per window, on its close day (was open, middle, close).
export default [
  { file: 'packages/engine/src/npc-market.ts', from: "  days: [0, 0.5, 1],\n", to: "  days: [1],\n" },
];
