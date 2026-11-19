// Converts an exported save (the raw checkpoint text) into a v8 world bin for the drivers, and
// prints the facts that decide the codec path; with `encode` it first writes such a raw from a bin.
import v8 from 'node:v8';
import { readFileSync, writeFileSync } from 'node:fs';
import { decode, encode } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/adapters/persistence';
(async () => {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === 'encode') return writeFileSync(b!, await encode(v8.deserialize(readFileSync(a!)), 2, 1));
  const raw = readFileSync(a!, 'utf8');
  const { world, envelope } = await decode(raw);
  console.log('codec', envelope.codec, 'raw chars', raw.length, 'utf8 bytes', Buffer.byteLength(raw), 'year', world.year, 'own matches', world.ownMatches.length, 'events', world.events.length);
  writeFileSync(b!, v8.serialize(world));
})();
