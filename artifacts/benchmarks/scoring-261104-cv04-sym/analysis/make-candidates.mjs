// T689 cv04-sym: node make-candidates.mjs — writes `candidates/<name>.json`, each cv04-rec's
// `w0a7ah3hb35` (copied here beside cv04's control `ctl`) with a goal lever set: this window's
// default-off `SHOT_CONFIG.candidate.setPieceHeader` (a set piece's header's own chance quality,
// `resolveCross`), the keeper narrowing's `ahead` and `reach`, or every contested header's pressure.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../candidates/', import.meta.url);
const base = JSON.parse(readFileSync(new URL('w0a7ah3hb35.json', dir), 'utf8'));
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b))
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] ? merge(out[k], v) : v;
  return out;
};
const sp = (v) => ({ shot: { candidate: { setPieceHeader: v } } });
const ahead = (m) => ({
  shot: { revision9: { narrow: { ahead: m } } },
  shape: { candidate: { revision9: { keeperOut: { ahead: m } } } },
});
const reach = (m) => ({ shot: { revision9: { narrow: { reach: m } } } });
const hp = (v) => ({ shot: { headerPressure: v } });
const a = (v) => ({ shot: { a: v } });
const all = (...xs) => xs.reduce((o, x) => merge(o, x), {});
const variants = {
  sp55: sp(0.55),
  sp70: sp(0.7),
  sp90: sp(0.9),
  ah15: ahead(1.5),
  rc12: reach(1.2),
  hp06: hp(0.6),
};
for (const [name, v] of Object.entries(variants))
  writeFileSync(new URL(name + '.json', dir), JSON.stringify(merge(base, v)) + '\n');
console.log(Object.keys(variants).join(' '));
export { all, a };
