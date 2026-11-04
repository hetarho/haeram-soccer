// T689 cv04-ori: node make-candidates.mjs — writes `candidates/<name>.json`, each cv04-sym's
// `sp70bx40s10rc20` (copied here as `B`, beside cv04's control `ctl`) with a lever from this
// window's shot-origin decomposition: MATCH-16's clear-chance shot floor in the box (`f<v>`:
// `revision6.clear.shot` v/100, `sharp` raised with it), so a carrier through on goal strikes
// where the chance is instead of walking it into the goal area, with the keeper's `reach`
// (`rc<v>`, v/10 m) relieved for the shots that floor brings.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../candidates/', import.meta.url);
const base = JSON.parse(readFileSync(new URL('sp70bx40s10rc20.json', dir), 'utf8'));
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b))
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] ? merge(out[k], v) : v;
  return out;
};
const all = (...xs) => xs.reduce((o, x) => merge(o, x), {});
const floor = (shot, sharp) => ({ decide: { candidate: { revision6: { clear: { shot, sharp } } } } });
const reach = (m) => ({ shot: { revision9: { narrow: { reach: m } } } });
// o2: MATCH-33's delivery weight (`BOX_CONFIG.delivery`): `su<v>` how much the ball suiting the
// runner's attributes counts (`suit` v/10, 0.8), `fr<v>` how much his arriving free counts (`free`, 1).
const suit = (v) => ({ box: { delivery: { suit: v } } });
const free = (v) => ({ box: { delivery: { free: v } } });
// o3: this window's default-off switch `revision9.clear.far` (`fa`): beyond `shootFrom` (20 m) and
// outside the box only MATCH-16's nobody-ahead clause makes a clear chance, so a man alone in
// front of a set defence keeps his own choice; `s<v>` the revision-4 volume scale 0.v (0.1).
const far = { decide: { candidate: { revision9: { clear: { far: 1 } } } } };
const scale = (v) => ({ decide: { candidate: { revision4: { shotScale: v } } } });
const variants = {
  fa: far,
  fas12: all(far, scale(0.12)),
  farc17: all(far, reach(1.7)),
  B: {},
  f80: floor(0.8, 0.93),
  f95: floor(0.95, 0.99),
  f95rc17: all(floor(0.95, 0.99), reach(1.7)),
  f95rc15: all(floor(0.95, 0.99), reach(1.5)),
  rc17: reach(1.7),
  su4: suit(0.4),
  su0: suit(0),
  su0fr2: all(suit(0), free(2)),
};
for (const [name, v] of Object.entries(variants)) {
  writeFileSync(new URL(name + '.json', dir), JSON.stringify(merge(base, v)) + '\n');
  console.log(name);
}
