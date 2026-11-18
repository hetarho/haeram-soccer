// G3b: as G3 with the cap at NPC_SQUAD.size (22) itself.
// least able (OVR + potential) outside the matchday 18 are released to the free agents, keeping line minimums.
const trim = `
export function trimNpcSquads(w: World, since: number) {
  const cap = NPC_SQUAD.size;
  for (const c of w.clubs) {
    if (c.id === w.playerClub || c.representative) continue;
    const players = w.squads?.[c.id];
    if (!players || players.length <= cap) continue;
    const keep = new Set(players.slice(0, 18).map((p) => p.id));
    const order = players
      .filter((p) => !keep.has(p.id) && !p.loanUntil && p.retiring === undefined)
      .sort((a, b) => mainOvr(a) + (a.potential ?? 0) - mainOvr(b) - (b.potential ?? 0) || compareIds(a.id, b.id));
    for (const p of order) {
      const current = w.squads![c.id]!;
      if (current.length <= cap) break;
      const line = lineOf(p.position);
      if (current.filter((q) => lineOf(q.position) === line).length <= LINE_MINIMUM[line]) continue;
      joinFreeAgents(w, p, since, c.id);
    }
    invalidateNpcSquad(w, c.id);
  }
}
`;
export default [
  { file: 'packages/engine/src/npc-careers.ts',
    from: "/** Both worlds close the same windows; the summer safety net uses the existing youth intake. */\n",
    to: trim + "/** Both worlds close the same windows; the summer safety net uses the existing youth intake. */\n" },
  { file: 'packages/engine/src/npc-careers.ts',
    from: "  if (day === dates.summerClose || day === dates.winterClose) refreshNpcSquads(w);\n",
    to: "  if (day === dates.summerClose || day === dates.winterClose) trimNpcSquads(w, w.year + 1);\n  if (day === dates.summerClose || day === dates.winterClose) refreshNpcSquads(w);\n" },
  { file: 'packages/engine/src/npc-careers.ts',
    from: "  drawProdigies(w);\n  if (matches) capFreeAgents(w);\n",
    to: "  drawProdigies(w);\n  trimNpcSquads(w, w.year + 1);\n  if (matches) capFreeAgents(w);\n" },
];
