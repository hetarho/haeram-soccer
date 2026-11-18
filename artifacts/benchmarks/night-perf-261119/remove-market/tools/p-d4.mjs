// D4: an unwatched own match settles from the aggregate record without writing its script or material.
export default [
  { file: 'packages/engine/src/match.ts',
    from: "  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));\n  const trace: AggregateAttributionTrace",
    to: "  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));\n  if (!observe) {\n    const plain = playAggregate(w, f, prepared, rosters, decide);\n    return { record: aggregateRecord(f, rosters, plain, model), frames: [], squads: rosters as any };\n  }\n  const trace: AggregateAttributionTrace" },
];
