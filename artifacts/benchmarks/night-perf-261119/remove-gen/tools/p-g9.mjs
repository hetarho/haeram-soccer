// G9 (extra): no NPC market before the war restart (1946) while nobody owns a club; the last four
// pre-takeover seasons of a 1950 world keep the full market.
export default [
  { file: 'packages/engine/src/npc-market.ts',
    from: "export function npcMarket(w: World) {\n  const day = currentDay(w);\n",
    to: "export function npcMarket(w: World) {\n  if (w.playerClub === '' && w.year < 1946) return;\n  const day = currentDay(w);\n" },
];
