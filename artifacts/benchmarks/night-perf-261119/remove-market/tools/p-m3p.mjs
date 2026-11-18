// M3 probe (results unchanged): phase marks inside a settlement day, pushed to globalThis.__mk.
const F = 'packages/engine/src/npc-market.ts';
const mark = (l) => `    __m.push(['${l}', performance.now()]);\n`;
export default [
  { file: F, from: "  withSlotRatings(settlement.ratings, () => {\n",
    to: "  const __m: [string, number][] = [['start', performance.now()]];\n  withSlotRatings(settlement.ratings, () => {\n" },
  { file: F, from: "    const { buys, sales } = windowMoves(w, days);\n", to: mark('returns') + "    const { buys, sales } = windowMoves(w, days);\n" + mark('windowMoves') },
  { file: F, from: "    const listed = listings(w, clubs, settlement);\n", to: "    const listed = listings(w, clubs, settlement);\n" + mark('listings') },
  { file: F, from: "    for (const list of index.values())\n      list.sort((a, b) => b.ovr - a.ovr || compareIds(a.player.id, b.player.id));\n",
    to: "    for (const list of index.values())\n      list.sort((a, b) => b.ovr - a.ovr || compareIds(a.player.id, b.player.id));\n" + mark('index') },
  { file: F, from: "    const wanted = new Map(clubs.map((c) => [c.id, needs(w, c, settlement)]));\n", to: "    const wanted = new Map(clubs.map((c) => [c.id, needs(w, c, settlement)]));\n" + mark('needs') },
  { file: F, from: "    for (const buyer of buyers) {\n      for (;;) {", to: mark('defs') + "    for (const buyer of buyers) {\n      for (;;) {" },
  { file: F, from: "  });\n}\n\n/** The summer's final safety net",
    to: "  });\n  __m.push(['loop', performance.now()]);\n  ((globalThis as any).__mk ??= []).push({ day, clubs: clubs.length, marks: __m });\n}\n\n/** The summer's final safety net" },
];
