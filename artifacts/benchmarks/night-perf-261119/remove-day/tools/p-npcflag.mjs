// Shared: mark the NPC aggregate path (simulateAggregate) with globalThis.__npc and its records in __lean.
export default [
  { file: 'packages/engine/src/aggregate/engine.ts',
    from: "  const match = playAggregate(w, f, prepared, rosters, decide);\n  return {\n    record: aggregateRecord(f, rosters, match, MATCH_MODEL_REVISION),\n    frames: [],\n    squads: rosters,\n  };",
    to: "  (globalThis as any).__npc = true;\n  let match: AggregateMatch;\n  try {\n    match = playAggregate(w, f, prepared, rosters, decide);\n  } finally {\n    (globalThis as any).__npc = false;\n  }\n  const record = aggregateRecord(f, rosters, match, MATCH_MODEL_REVISION);\n  ((globalThis as any).__lean ??= new WeakSet()).add(record);\n  return {\n    record,\n    frames: [],\n    squads: rosters,\n  };" },
];
