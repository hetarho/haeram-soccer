// G4: no in-season NPC growth every 4 rounds; the season close settles all the season's rounds at once.
export default [
  { file: 'packages/engine/src/season.ts',
    from: "  if (w.round % MARKET_REFRESH_ROUNDS === 0) {\n    settleNpcGrowth(w);\n",
    to: "  if (w.round % MARKET_REFRESH_ROUNDS === 0) {\n" },
];
