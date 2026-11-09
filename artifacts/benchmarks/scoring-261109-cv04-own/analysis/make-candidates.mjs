// T689 cv04-own: node make-candidates.mjs [NAME=BASE+JSON …] — writes this window's candidates
// (scripts/scoring-candidate-patch.ts JSON). Bases copied unchanged from cv04-ent: `Perf`, `Perf10`, `Bid` (`B`)
// and `ctl`. The levers are this window's default-off `decide.candidate.boxShot` switches (→MATCH-16 r56):
// `a` — `read` 1, the in-box shot weight reads the chance as `resolveShot` records it (keeper's narrowing and
// closing blocks too); `b` — `against`, the shot weighed against the best chance a pass to a free teammate in
// the box or at its edge or a further carry leads to, with `pass` (the in-box pass valuing such a receiver by it).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const here = new URL('../candidates/', import.meta.url);
const ent = new URL('../../scoring-261106-cv04-ent/candidates/', import.meta.url);
mkdirSync(here, { recursive: true });
const read = (n) => JSON.parse(readFileSync(new URL(n + '.json', ent), 'utf8'));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : structuredClone(v);
  return out;
};
const box = (o) => ({ decide: { candidate: { boxShot: o } } });
const Perf = read('Perf');
const all = {
  Perf,
  Perf10: read('Perf10'),
  Bid: read('Bid'),
  ctl: read('ctl'),
  // (a) the recorded chance.
  Pa: merge(Perf, box({ read: 1 })),
  // (b) against the alternative, with and without the pass valuing the receiver.
  Pb: merge(Perf, box({ against: 1 })),
  Pbp: merge(Perf, box({ against: 1, pass: 8 })),
  // (a) with (b).
  Pab: merge(Perf, box({ read: 1, against: 1 })),
  Pabp: merge(Perf, box({ read: 1, against: 1, pass: 8 })),
  // Where the diagnostic points (the box's carried shots with nobody between are clear chances, whose floor
  // neither switch reaches): cv04-cha's chased carrier (`decide.candidate.chased.give` 0.9, its `c9`), a setting
  // of a switch already in the patch, on `Perf` and on `Pab`.
  Pc9: merge(Perf, { decide: { candidate: { chased: { give: 0.9 } } } }),
  Pabc9: merge(merge(Perf, box({ read: 1, against: 1 })), { decide: { candidate: { chased: { give: 0.9 } } } }),
};
for (const spec of process.argv.slice(2)) {
  // NAME=BASE+JSON
  const [name, rest] = [spec.slice(0, spec.indexOf('=')), spec.slice(spec.indexOf('=') + 1)];
  const [base, json] = [rest.slice(0, rest.indexOf('+')), rest.slice(rest.indexOf('+') + 1)];
  all[name] = merge(all[base] ?? JSON.parse(readFileSync(new URL(base + '.json', here), 'utf8')), JSON.parse(json));
}
for (const [n, c] of Object.entries(all)) writeFileSync(new URL(n + '.json', here), JSON.stringify(c));
console.log(Object.keys(all).join(' '));
