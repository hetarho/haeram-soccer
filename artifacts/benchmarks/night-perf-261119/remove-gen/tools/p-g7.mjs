// G7: free agents refreshed at the window closes (and the season boundary) instead of every 4 rounds.
export default [
  { file: 'packages/engine/src/season.ts',
    from: "    refreshStaffMarket(w);\n    refreshFreeAgents(w);\n    refreshCoachingMarket(w);\n",
    to: "    refreshStaffMarket(w);\n    refreshCoachingMarket(w);\n" },
  { file: 'packages/engine/src/npc-careers.ts',
    from: "  if (day === dates.summerClose || day === dates.winterClose) refreshNpcSquads(w);\n",
    to: "  if (day === dates.summerClose || day === dates.winterClose) refreshNpcSquads(w);\n  if (day === dates.summerClose || day === dates.winterClose) refreshFreeAgents(w);\n" },
];
