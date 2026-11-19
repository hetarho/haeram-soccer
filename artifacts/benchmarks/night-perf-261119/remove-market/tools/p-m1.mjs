// M1: after the takeover the NPC market settles once a window, on its close day, with the window's
// whole bid cap, bidding blind (it is the window's first and only settlement day).
const F = 'packages/engine/src/npc-market.ts';
export default [
  { file: F,
    from: "  if (!days || (w.npcMarketAt?.year === w.year && w.npcMarketAt.day >= day)) return;\n",
    to: "  if (!days || (w.npcMarketAt?.year === w.year && w.npcMarketAt.day >= day)) return;\n  const once = w.playerClub !== '';\n  if (once && day !== days.at(-1)) return;\n" },
  { file: F,
    from: "    later = dayAt > 0;\n  const bidsToday = bidsOnDay(caps.bids, dayAt, days.length);",
    to: "    later = !once && dayAt > 0;\n  const bidsToday = once ? caps.bids : bidsOnDay(caps.bids, dayAt, days.length);" },
];
