// G1: no NPC transfer market before the takeover (nobody owns a club).
export default [
  { file: 'packages/engine/src/npc-market.ts',
    from: "export function npcMarket(w: World) {\n  const day = currentDay(w);\n",
    to: "export function npcMarket(w: World) {\n  if (w.playerClub === '') return;\n  const day = currentDay(w);\n" },
];
