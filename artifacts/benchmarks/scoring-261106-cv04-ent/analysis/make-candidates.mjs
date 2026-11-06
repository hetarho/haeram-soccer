// T689 cv04-ent: node make-candidates.mjs — writes this window's candidates (scripts/scoring-candidate-patch.ts JSON).
// Bases copied unchanged: `P` (cv04-kpr's `t15s3fpc110`), `Bid` and `ctl` (cv04-kpr's). The levers are MATCH-16 r50/r51's
// switches already in the source (no new switch): cv04-att's entry (`decide.candidate.entry`, `e8p8` as
// `scoring-261104-cv04-att/candidates/e8p8pp03r5w30fa.json` sets it) with its `rest` part (`r5w30`), cv04-chc's offside
// receiver (`decide.candidate.past.flag`, with MATCH-18's call `base` raised so offsides hold) and cv04-att's blind
// `past.prior` 0.3, read beside only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const here = new URL('../candidates/', import.meta.url);
const kpr = new URL('../../scoring-261106-cv04-kpr/candidates/', import.meta.url);
mkdirSync(here, { recursive: true });
const read = (n) => JSON.parse(readFileSync(new URL(n + '.json', kpr), 'utf8'));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : structuredClone(v);
  return out;
};
const P = read('t15s3fpc110');
const entry = (rest) => ({
  decide: {
    candidate: {
      entry: {
        from: 70, reach: 8, pass: 8, carry: 1, ref: 0.1, through: 0,
        ...(rest ? { rest: { worth: 0.3, shot: 5, view: 0.5, pass: 1, carry: 1 } } : {}),
      },
    },
  },
});
const flag = (f, base) => ({
  decide: { candidate: { past: { flag: f } } },
  restart: { offside: { candidate: { base } } },
});
const prior = (p) => ({ decide: { candidate: { past: { prior: p } } } });
const all = {
  P,
  Bid: read('Bid'),
  ctl: read('ctl'),
  Pe: merge(P, entry(false)),
  Per: merge(P, entry(true)),
  Pf: merge(P, flag(0.7, 0.12)),
  Perf: merge(merge(P, entry(true)), flag(0.7, 0.12)),
  Perp: merge(merge(P, entry(true)), prior(0.3)),
  ...JSON.parse(process.env.EXTRA ?? '{}'),
};
const extra = process.argv.slice(2);
for (const spec of extra) {
  // NAME=BASE+JSON
  const [name, rest] = spec.split('=');
  const [base, json] = [rest.slice(0, rest.indexOf('+')), rest.slice(rest.indexOf('+') + 1)];
  all[name] = merge(all[base], JSON.parse(json));
}
for (const [n, c] of Object.entries(all)) writeFileSync(new URL(n + '.json', here), JSON.stringify(c));
console.log(Object.keys(all).join(' '));
