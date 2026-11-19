// Measurement hook only: globalThis.__onClose(w) at closeSeason's start (a no-op unless a driver sets it).
export default [
  { file: 'packages/engine/src/season.ts',
    from: "export function closeSeason(w: World, finishEurope?: (w: World) => void) {\n",
    to: "export function closeSeason(w: World, finishEurope?: (w: World) => void) {\n  (globalThis as any).__onClose?.(w);\n" },
];
