// T689 cv04-chc: node make-candidates.mjs — candidate configs on `B` (cv04-sym's `sp70bx40s10rc20`)
// and on cv04-att's entry candidate, for scripts/scoring-candidate-patch.ts (T689_PATCH_FILE).
// New default-off switches: `shot.revision9.narrow.ref`/`cap` (the reference keeper set `ref` m off his
// line toward the shot, MATCH-11/35 r51) and `decide.candidate.past.flag` (a pass to a receiver past the
// line weighed by the carrier's 판단력 as a ball the flag may stop, MATCH-16 r51).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const att = 'artifacts/benchmarks/scoring-261104-cv04-att/candidates/';
const out = 'artifacts/benchmarks/scoring-261104-cv04-chc/candidates/';
mkdirSync(out, { recursive: true });
const load = (n) => JSON.parse(readFileSync(att + n + '.json', 'utf8'));
const merge = (a, b) => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b))
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return o;
};
const B = load('B');
const E = load('e8p8pp03r5w30a085fa');
const nar = (x) => ({ shot: { revision9: { narrow: x } } });
const flag = (f, base) => merge({ decide: { candidate: { past: { flag: f } } } }, base ? { restart: { offside: { candidate: { base } } } } : {});
const C = {
  Bid: B,
  r2: merge(B, nar({ ref: 2 })),
  r2c1: merge(B, nar({ ref: 2, cap: 1 })),
  r3c15: merge(B, nar({ ref: 3, cap: 1.5 })),
  r2rc15: merge(B, nar({ ref: 2, reach: 1.5 })),
  fl05: merge(B, flag(0.5, 0.1)),
  Eid: E,
  // Round 2 (`floor`: the narrowing's least factor).
  r3c15f3: merge(B, nar({ ref: 3, cap: 1.5, floor: 0.3 })),
  r3c15f5: merge(B, nar({ ref: 3, cap: 1.5, floor: 0.5 })),
  r3c1f4a115: merge(merge(B, nar({ ref: 3, cap: 1, floor: 0.4 })), { shot: { a: -1.15 } }),
  f4: merge(B, nar({ floor: 0.4 })),
  Er3c15: merge(E, nar({ ref: 3, cap: 1.5 })),
  Er3c15f4: merge(E, nar({ ref: 3, cap: 1.5, floor: 0.4 })),
  // Round 3 (goals held by the shot model's `a`).
  Er3c15f4a100: merge(merge(E, nar({ ref: 3, cap: 1.5, floor: 0.4 })), { shot: { a: -1 } }),
  Er3c15f5a110: merge(merge(E, nar({ ref: 3, cap: 1.5, floor: 0.5 })), { shot: { a: -1.1 } }),
  Er3c1f5a110: merge(merge(E, nar({ ref: 3, cap: 1, floor: 0.5 })), { shot: { a: -1.1 } }),
  r3c15f5a120: merge(merge(B, nar({ ref: 3, cap: 1.5, floor: 0.5 })), { shot: { a: -1.2 } }),
  r3c15f6a130: merge(merge(B, nar({ ref: 3, cap: 1.5, floor: 0.6 })), { shot: { a: -1.3 } }),
};
for (const [n, c] of Object.entries(C)) writeFileSync(out + n + '.json', JSON.stringify(c) + '\n');
console.log(Object.keys(C).join(' '));
