// G5: lazy matchday re-selection: invalidateNpcSquad only marks the club; the selection runs when its
// squad is next read (a fixture, the market's XI reads), once however many moves happened since.
export default [
  { file: 'packages/engine/src/world.ts',
    from: "/** Only the club whose players changed chooses its matchday squad again. */\nexport function invalidateNpcSquad(w: World, club: string) {\n  const players = w.squads?.[club];\n",
    to: `const lazyDirty = new WeakMap<World, Set<string>>();
export function flushNpcSquads(w: World) {
  const d = lazyDirty.get(w);
  if (!d) return;
  for (const club of [...d]) chooseNpcSquad(w, club);
  d.clear();
}
function resolveLazy(w: World, club: string) {
  const d = lazyDirty.get(w);
  if (d?.delete(club)) chooseNpcSquad(w, club);
}
export function invalidateNpcSquad(w: World, club: string) {
  if (w.squads?.[club]) {
    let d = lazyDirty.get(w);
    if (!d) lazyDirty.set(w, (d = new Set()));
    d.add(club);
  }
  npcCaches.get(w)?.clubs.delete(club);
}
function chooseNpcSquad(w: World, club: string) {
  const players = w.squads?.[club];
` },
  { file: 'packages/engine/src/world.ts',
    from: "export function squad(w: World, c: Club): Player[] {\n  if (c.id === w.playerClub) return activePlayers(w);\n",
    to: "export function squad(w: World, c: Club): Player[] {\n  if (c.id === w.playerClub) return activePlayers(w);\n  resolveLazy(w, c.id);\n" },
  { file: 'packages/engine/src/history.ts',
    from: "    onProgress?.(w.year, w);\n  }\n  return w;\n",
    to: "    onProgress?.(w.year, w);\n  }\n  flushNpcSquads(w);\n  return w;\n" },
  { file: 'packages/engine/src/history.ts',
    from: "import { ENGINE_VERSION, generateClubs, makeManager } from './world';",
    to: "import { ENGINE_VERSION, flushNpcSquads, generateClubs, makeManager } from './world';" },
];
