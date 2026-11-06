// T689 cv04-cha: node make-candidates.mjs — candidate configs on `B` (cv04-sym's `sp70bx40s10rc20`)
// for scripts/scoring-candidate-patch.ts (T689_PATCH_FILE). New default-off switches (→MATCH-16/35 r53):
// `decide.candidate.chased` (a clear chance's chased carrier against a keeper already out to him goes
// round him, squares it or carries on to an open angle instead of striking into him; before the keeper
// is out he strikes at once) and `shot.candidate.oneTake` 2 (r52's one take extended to that chance:
// the keeper's narrowing and the chaser's block are its only takes, the chaser never again as pressure).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const att = 'artifacts/benchmarks/scoring-261104-cv04-att/candidates/';
const out = 'artifacts/benchmarks/scoring-261106-cv04-cha/candidates/';
mkdirSync(out, { recursive: true });
const load = (n) => JSON.parse(readFileSync(att + n + '.json', 'utf8'));
const merge = (a, b) => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b))
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return o;
};
const B = load('B');
const ch = (x) => ({ decide: { candidate: { chased: x } } });
const t2 = { shot: { candidate: { oneTake: 2 } } };
const t3 = { shot: { candidate: { oneTake: 3 } } };
const C = {
  Bid: B,
  ctl: load('ctl'),
  // Round 1 (with this window's switches in the source, all off): `Bid0` is `B` again, the
  // default-off identity read against round 0's `Bid` (the cv04-blk patch alone).
  Bid0: B,
  c6: merge(B, ch({ give: 0.6 })),
  c9: merge(B, ch({ give: 0.9 })),
  c9e9: merge(B, ch({ give: 0.9, early: 0.9 })),
  t2: merge(B, t2),
  c9t2: merge(merge(B, ch({ give: 0.9 })), t2),
  // Round 2: `oneTake` 3 — r53's one take for a shot with no outfielder goal-side between (the
  // narrowing's corridor and `ahead`), a chaser in its path included; `Bid1` the identity again.
  Bid1: B,
  t3: merge(B, t3),
  c9t3: merge(merge(B, ch({ give: 0.9 })), t3),
  c10t3: merge(merge(B, ch({ give: 1 })), t3),
  c9t3a12: merge(merge(merge(B, ch({ give: 0.9 })), t3), { shot: { a: -1.2 } }),
  // Round 3: `c9` with MATCH-11/35 r51's reference keeper set for the shot (cv04-chc's `ref` 3,
  // `cap` 1.5), now that the chances against a keeper already out are fewer.
  c9r3c15: merge(merge(B, ch({ give: 0.9 })), { shot: { revision9: { narrow: { ref: 3, cap: 1.5 } } } }),
  c9r3c15a11: merge(merge(B, ch({ give: 0.9 })), {
    shot: { a: -1.1, revision9: { narrow: { ref: 3, cap: 1.5 } } },
  }),
};
for (const [n, c] of Object.entries(C)) writeFileSync(out + n + '.json', JSON.stringify(c) + '\n');
console.log(Object.keys(C).join(' '));
export { merge, B };
