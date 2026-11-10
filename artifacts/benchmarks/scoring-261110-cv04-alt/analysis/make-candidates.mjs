// T689 cv04-alt: node make-candidates.mjs [NAME=BASE+JSON …] — writes this window's candidates
// (scripts/scoring-candidate-patch.ts JSON). Bases copied unchanged from cv04-clr: `Bid` (`B`), `Perf`, `Pab` and
// `c50` (`Pab` with `decide.candidate.clear.keeper` 0.5). Each NAME=BASE+JSON spec merges JSON onto BASE (a base
// above or an earlier candidate file of this window); a SPECS.json argument holds {NAME: [BASE, JSON…]}.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const here = new URL('../candidates/', import.meta.url);
const clr = new URL('../../scoring-261109-cv04-clr/candidates/', import.meta.url);
mkdirSync(here, { recursive: true });
const read = (n) => JSON.parse(readFileSync(new URL(n + '.json', clr), 'utf8'));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : structuredClone(v);
  return out;
};
const all = { Bid: read('Bid'), Perf: read('Perf'), Pab: read('Pab'), c50: read('c50') };
const base = (name) => all[name] ?? JSON.parse(readFileSync(new URL(name + '.json', here), 'utf8'));
for (const spec of process.argv.slice(2)) {
  if (spec.endsWith('.json')) {
    // A specs file: {NAME: [BASE, JSON…]}, each JSON merged onto BASE in order.
    for (const [name, [b, ...adds]] of Object.entries(JSON.parse(readFileSync(spec, 'utf8'))))
      all[name] = adds.reduce((c, a) => merge(c, a), base(b));
    continue;
  }
  // NAME=BASE+JSON
  const [name, rest] = [spec.slice(0, spec.indexOf('=')), spec.slice(spec.indexOf('=') + 1)];
  const [b, json] = [rest.slice(0, rest.indexOf('+')), rest.slice(rest.indexOf('+') + 1)];
  all[name] = merge(base(b), JSON.parse(json));
}
for (const [n, c] of Object.entries(all)) writeFileSync(new URL(n + '.json', here), JSON.stringify(c));
console.log(Object.keys(all).join(' '));
