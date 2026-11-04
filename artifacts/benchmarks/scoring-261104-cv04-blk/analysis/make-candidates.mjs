// T689 cv04-blk: node make-candidates.mjs — candidate configs on `B` (cv04-sym's `sp70bx40s10rc20`)
// for scripts/scoring-candidate-patch.ts (T689_PATCH_FILE). New default-off switches (→MATCH-35 r52):
// `shot.candidate.oneTake` (a foot shot's pressure reads only opponents neither in its path nor
// closing it) and `shot.candidate.usual` (with a body in the shot's path, the chance before the
// blocks divided by `usual`, an unsourced screen setting). The keeper's narrowing and the 1v1 stay as `B`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const att = 'artifacts/benchmarks/scoring-261104-cv04-att/candidates/';
const out = 'artifacts/benchmarks/scoring-261104-cv04-blk/candidates/';
mkdirSync(out, { recursive: true });
const load = (n) => JSON.parse(readFileSync(att + n + '.json', 'utf8'));
const merge = (a, b) => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b))
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return o;
};
const B = load('B');
const blk = (x) => ({ shot: { candidate: x } });
const C = {
  Bid: B,
  t1: merge(B, blk({ oneTake: 1 })),
  u75: merge(B, blk({ usual: 0.75 })),
  u70: merge(B, blk({ usual: 0.7 })),
  t1u75: merge(B, blk({ oneTake: 1, usual: 0.75 })),
  t1u80: merge(B, blk({ oneTake: 1, usual: 0.8 })),
  // Round 2: goals held by the shot model's `a` (`B` −1).
  t1u75a135: merge(merge(B, blk({ oneTake: 1, usual: 0.75 })), { shot: { a: -1.35 } }),
  u75a110: merge(merge(B, blk({ usual: 0.75 })), { shot: { a: -1.1 } }),
};
for (const [n, c] of Object.entries(C)) writeFileSync(out + n + '.json', JSON.stringify(c) + '\n');
console.log(Object.keys(C).join(' '));
