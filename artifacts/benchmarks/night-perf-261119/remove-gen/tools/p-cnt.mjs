// Measurement only: count matchday selections (globalThis.__sel).
export default [
  { file: 'packages/engine/src/world.ts',
    from: "    if (c) {\n      const chosen = matchdaySquad(w, c, players),",
    to: "    if (c) {\n      (globalThis as any).__sel = ((globalThis as any).__sel ?? 0) + 1;\n      const chosen = matchdaySquad(w, c, players)," },
];
