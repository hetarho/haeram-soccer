/** Captures a game database for the validation bench: the 1930 e2e start after N stops, or a prepared world. */
import { writeFileSync, readFileSync } from 'node:fs';
import v8 from 'node:v8';
import { Host } from '../../../apps/web/src/runtime/host';
import { memoryGames } from '../../../tests/fixtures/save-file';
import { RESPONSIBILITY_KEYS } from '../../../packages/engine/src/responsibilities';
import { daysUntilNextMatch } from '../../../packages/engine/src/calendar';
import { initializeReadModels } from '../../../packages/engine/src/read-models';

const args = process.argv.slice(2);
const flag = (n: string, f?: string) => (args.indexOf(n) < 0 ? f : args[args.indexOf(n) + 1]);
const games = memoryGames();
const host = new Host(() => {}, {
  openStore: games.open,
  gameFiles: { list: games.list, remove: games.remove },
  databaseBytes: games.bytes,
});
let n = 0;
const req = (body: unknown) => ({
  protocol: 1, session: 'c', requestId: `c${n++}`,
  expectedRevision: (host as any).world?.revision ?? -1, body,
});
const ok = (r: any) => { if (!r.ok) throw new Error(r.error); return r; };
const worldFile = flag('--world');
if (worldFile) {
  const fixture: any = v8.deserialize(readFileSync(worldFile));
  if (!fixture.newsJournal || !fixture.careerReads) initializeReadModels(fixture);
  (host as any).world = fixture;
} else {
  const g = ok(await host.handle(req({ type: 'generate', choice: { tier: 'oil', traits: [], decade: 1930, seed: 'records-room-journey' } })));
  const club = g.start.listings.find((l: any) => l.affordable);
  ok(await host.handle(req({ type: 'take-over', clubId: club.clubId })));
}
const w: any = (host as any).world;
w.settings.mode = 'manual';
for (const key of RESPONSIBILITY_KEYS) w.settings.responsibilities[key] = 'delegated';
w.settings.observations.matchEve = true;
w.settings.observations.windowOpen = false;
ok(await host.handle(req({ type: 'create-game', gameId: 'g' })));
const steps = Number(flag('--steps', '20'));
for (let s = 0; s < steps; s++) {
  const command = daysUntilNextMatch((host as any).world) === 1 ? { type: 'advance-days', days: 1 } : { type: 'next-event' };
  ok(await host.handle(req({ type: 'command', command })));
  ok(await host.handle(req({ type: 'save' })));
}
const bytes = games.bytes.read('g')!;
writeFileSync(flag('--out')!, bytes);
const exported = ok(await host.handle(req({ type: 'export-game', gameId: 'g' })));
writeFileSync(flag('--out')! + '.haeram-save', exported.file);
console.log('db bytes', bytes.length, 'export', exported.file.length);
process.exit(0);
