// M3b (changes results): five settlement days a window instead of three, the window's bid cap spread over them.
export default [
  { file: 'packages/engine/src/npc-market.ts', from: "  days: [0, 0.5, 1],", to: "  days: [0, 0.25, 0.5, 0.75, 1]," },
];
