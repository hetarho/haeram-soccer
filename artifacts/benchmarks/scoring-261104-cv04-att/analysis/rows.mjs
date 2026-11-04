// T689 cv04-att: node rows.mjs PREFIX NAME… — one column per candidate of the box-entry
// diagnostic's rows under PREFIX (e.g. `how`, `start`, `first`), entries a team a match.
// `box:NAME` reads cv04-box's retained entries instead of this window's.
import { readdirSync, readFileSync } from 'node:fs';

const here = new URL('../entries/', import.meta.url);
const box = new URL('../../scoring-261104-cv04-box/entries/', import.meta.url);
const [prefix, ...names] = process.argv.slice(2);
const cols = names.map((spec) => {
  const [dir, name] = spec.startsWith('box:') ? [box, spec.slice(4)] : [here, spec];
  const acc = new Map();
  let matches = 0;
  for (const f of readdirSync(dir).filter((f) => f.startsWith(`entries-${name}-`) && f.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    if (r.matches < 100) continue;
    matches += r.matches;
    for (const row of r.rows) acc.set(row.key, (acc.get(row.key) ?? 0) + row.n);
  }
  return { spec, acc, tm: 2 * matches };
});
const keys = [...new Set(cols.flatMap((c) => [...c.acc.keys()]))]
  .filter((k) => k.split('|')[0] === prefix)
  .sort();
console.log(`| ${prefix} | ${names.join(' | ')} |`);
console.log(`|---|${names.map(() => '---:').join('|')}|`);
for (const k of keys)
  console.log(`| ${k.slice(prefix.length + 1)} | ${cols.map((c) => ((c.acc.get(k) ?? 0) / c.tm).toFixed(2)).join(' | ')} |`);
