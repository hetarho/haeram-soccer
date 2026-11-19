// node pairday.mjs <A bundle> <B bundle> <world.bin> <days> <skip> <AB|BA> <host 0|1> <out.json>
// Both sides open the same cached world and step the same calendar days in lockstep; the order
// within each day alternates, so load swings hit both sides of a pair alike.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [aFile, bFile, world, daysArg, skipArg, first, hostArg, out] = process.argv.slice(2);
const host = hostArg === '1';
const files = [aFile, bFile];
const order = first === 'AB' ? [0, 1] : [1, 0];
const mods = [];
for (const i of order) mods[i] = await import(pathToFileURL(files[i]).href);
const sides = [];
for (const i of order) sides[i] = mods[i].open(world, host);
const rows = [];
const total = Number(skipArg) + Number(daysArg);
for (let n = 0; n < total; n++) {
  const o = (n % 2 === 0) === (first === 'AB') ? [0, 1] : [1, 0];
  const r = [];
  for (const i of o) r[i] = sides[i].step();
  if (n >= Number(skipArg)) rows.push({ n, a: r[0], b: r[1] });
  if (r[0].day !== r[1].day) console.error(`day mismatch at ${n}: ${r[0].day} vs ${r[1].day}`);
}
writeFileSync(out, JSON.stringify({ first, host, world, rows }));
console.error('done', out);
