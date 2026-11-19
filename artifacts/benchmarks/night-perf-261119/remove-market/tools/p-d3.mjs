// D3: after the takeover NPC fixtures (league, cups, Europe) take the results-only path history uses.
export default [
  { file: 'packages/engine/src/match.ts',
    from: "  if (f.home !== w.playerClub && f.away !== w.playerClub) return simulateAggregate(w, f, decide);",
    to: "  if (f.home !== w.playerClub && f.away !== w.playerClub) return resultsOnlyMatch(w, f, decide);" },
  { file: 'packages/engine/src/season.ts',
    from: "  if (hasOwner(w)) settleNpcSeason(w, playback);",
    to: "  if (hasOwner(w) && m.model !== undefined) settleNpcSeason(w, playback);" },
];
