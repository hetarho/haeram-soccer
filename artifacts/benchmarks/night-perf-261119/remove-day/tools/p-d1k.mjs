// D1k: as D1, but a period with a penalty still attributes its fouls first (they fix the kick minute, hence the taker).
import flag from './p-npcflag.mjs';
export default [
  ...flag,
  { file: 'packages/engine/src/aggregate/players.ts',
    from: "  if (earlyFouls) attributeFouls(causalDraw);",
    to: "  const lean = (globalThis as any).__npc === true;\n  if (earlyFouls) attributeFouls(causalDraw);" },
  { file: 'packages/engine/src/aggregate/players.ts',
    from: "  // Every move group of the period: pinned completions, then the rest by weight.\n",
    to: "  if (lean) return;\n  // Every move group of the period: pinned completions, then the rest by weight.\n" },
  { file: 'packages/engine/src/match-model.ts',
    from: "    ...participationIssues(full),",
    to: "    ...((globalThis as any).__lean?.has(r) ? [] : participationIssues(full))," },
];
