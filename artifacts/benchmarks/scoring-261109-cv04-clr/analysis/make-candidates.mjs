// T689 cv04-clr: node make-candidates.mjs [NAME=BASE+JSON …] — writes this window's candidates
// (scripts/scoring-candidate-patch.ts JSON). Bases copied unchanged from cv04-own: `Bid` (`B`), `Perf` and `Pab`
// (`Perf` with `boxShot.read` 1 and `against` 1). The lever is this window's default-off
// `decide.candidate.clear.keeper` (→MATCH-16 r58): the share of the chance the keeper's narrowing where the carrier
// decides must leave for the clear-chance floor to hold; below it the carrier weighs cv04-cha's chased options and
// `boxShot`'s alternatives. `c50` and `c25` set it to 0.5 and 0.25 on `Pab`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const here = new URL('../candidates/', import.meta.url);
const own = new URL('../../scoring-261109-cv04-own/candidates/', import.meta.url);
mkdirSync(here, { recursive: true });
const read = (n) => JSON.parse(readFileSync(new URL(n + '.json', own), 'utf8'));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : structuredClone(v);
  return out;
};
const clear = (keeper) => ({ decide: { candidate: { clear: { keeper } } } });
const Pab = read('Pab');
const all = {
  Bid: read('Bid'),
  Perf: read('Perf'),
  Pab,
  c50: merge(Pab, clear(0.5)),
  c25: merge(Pab, clear(0.25)),
};
for (const spec of process.argv.slice(2)) {
  // NAME=BASE+JSON
  const [name, rest] = [spec.slice(0, spec.indexOf('=')), spec.slice(spec.indexOf('=') + 1)];
  const [base, json] = [rest.slice(0, rest.indexOf('+')), rest.slice(rest.indexOf('+') + 1)];
  all[name] = merge(all[base] ?? JSON.parse(readFileSync(new URL(base + '.json', here), 'utf8')), JSON.parse(json));
}
for (const [n, c] of Object.entries(all)) writeFileSync(new URL(n + '.json', here), JSON.stringify(c));
console.log(Object.keys(all).join(' '));
