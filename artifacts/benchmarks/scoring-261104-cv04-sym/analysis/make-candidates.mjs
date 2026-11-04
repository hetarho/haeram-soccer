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
const box = (v) => ({ decide: { candidate: { shotBox: v } } });
const scale = (v) => ({ decide: { candidate: { revision4: { shotScale: v } } } });
const longShot = (v) => ({ decide: { candidate: { longShotScale: v } } });
const mf = (v) => ({ decide: { candidate: { revision4: { shotLine: { GK: 0, DF: 0.5, MF: v, FW: 1 } } } } });
const all = (...xs) => xs.reduce((o, x) => merge(o, x), {});
const B = all(sp(0.7), box(0.4), scale(0.1), reach(2));
const variants = {
  sp55: sp(0.55),
  sp70: sp(0.7),
  sp90: sp(0.9),
  ah15: ahead(1.5),
  rc12: reach(1.2),
  hp06: hp(0.6),
  // s2: the set-piece header with the symmetric narrowing levers, or with a smaller `shot.a` step
  sp70rc12ah15: all(sp(0.7), reach(1.2), ahead(1.5)),
  sp55rc12ah15: all(sp(0.55), reach(1.2), ahead(1.5)),
  sp70rc12: all(sp(0.7), reach(1.2)),
  sp70ah15: all(sp(0.7), ahead(1.5)),
  sp70a085: all(sp(0.7), a(-0.85)),
  sp55a080: all(sp(0.55), a(-0.8)),
  // s5: press's chances against a deep block from distance (the box band's shot weight, the long-shot
  // fall-off) and the midfield line's shot weight (MATCH-16: a forward ≥ a midfielder), on sp70
  sp70bx40: all(sp(0.7), box(0.4)),
  sp70bx40s085: all(sp(0.7), box(0.4), scale(0.085)),
  sp70ls6: all(sp(0.7), longShot(6)),
  sp70m10: all(sp(0.7), mf(1)),
  // s6: the set-piece header with the volume scale only (MATCH-29-neutral levers)
  sp70s085: all(sp(0.7), scale(0.085)),
  sp80bx40s085: all(sp(0.8), box(0.4), scale(0.085)),
  // s7: a stronger narrowing against a shooter through on goal (the striker's 1v1 edge), goals back
  // through the MATCH-29-neutral levers
  rc18: reach(1.8),
  rc20: reach(2),
  sp70bx40s10: all(sp(0.7), box(0.4), scale(0.1)),
  sp70bx40s10rc18: all(sp(0.7), box(0.4), scale(0.1), reach(1.8)),
  sp70bx40s10rc20: all(sp(0.7), box(0.4), scale(0.1), reach(2)),
  sp80bx40s10rc20: all(sp(0.8), box(0.4), scale(0.1), reach(2)),
  // s9: more volume with the stronger narrowing
  sp70bx40s12rc20: all(sp(0.7), box(0.4), scale(0.12), reach(2)),
  sp70bx40s12rc25: all(sp(0.7), box(0.4), scale(0.12), reach(2.5)),
  sp70bx40s10rc25: all(sp(0.7), box(0.4), scale(0.1), reach(2.5)),
  sp75bx40s12rc20: all(sp(0.75), box(0.4), scale(0.12), reach(2)),
  // s10: who gets the chances (the striker slot's ~40% of goals), on sp70bx40s10rc20 (`B`)
  Bss8: all(B, { shape: { candidate: { secondStriker: { drop: 8 } } } }),
  Bho18: all(B, { shape: { candidate: { hold: { out: 18 } } } }),
  Bar8: all(B, { shape: { candidate: { arrive: { out: 8 } } } }),
  Bbo6: all(B, { shape: { candidate: { boxRun: { odds: 6 } } } }),
  Baf40: all(B, { shape: { candidate: { arrive: { from: 40 } } } }),
};
for (const [name, v] of Object.entries(variants))
  writeFileSync(new URL(name + '.json', dir), JSON.stringify(merge(base, v)) + '\n');
console.log(Object.keys(variants).join(' '));
export { all, a };
