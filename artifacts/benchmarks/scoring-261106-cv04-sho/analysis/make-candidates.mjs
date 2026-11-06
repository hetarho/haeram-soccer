// T689 cv04-sho: node make-candidates.mjs — candidate configs on `B` (cv04-sym's `sp70bx40s10rc20`) and
// `c9` (`B` with cv04-cha's `chased` `give` 0.9) for scripts/scoring-candidate-patch.ts (T689_PATCH_FILE).
// Copied unchanged from cv04-cha: `Bid` (`B`), `ctl`, `c9`. New switches are added below as the
// diagnostic points (→MATCH-35 r54).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const cha = 'artifacts/benchmarks/scoring-261106-cv04-cha/candidates/';
const out = 'artifacts/benchmarks/scoring-261106-cv04-sho/candidates/';
mkdirSync(out, { recursive: true });
const load = (n) => JSON.parse(readFileSync(cha + n + '.json', 'utf8'));
const merge = (a, b) => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b))
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return o;
};
const B = load('Bid');
const c9 = load('c9');
// (a) `shot.candidate.touch` (→MATCH-35 r54): a closer more than `level` 0.75 m behind the ball along the
// shot's line blocks only from within `touch` m. (b) `shot.revision9.narrow.only` with r51's `ref`/`cap`:
// the set reference for a keeper within `only` m of his line alone, no narrowing beyond a set keeper's
// (`cap` 1), a keeper further out keeping `B`'s narrowing. (c) `decide.candidate.chased.reach` past the
// pitch: r53's choice against a keeper out to him for a carrier with nobody chasing too (MATCH-12: facing
// the keeper he shoots, takes him on or carries past him), `near` 10 for the keeper out within reach.
const ta = (t) => ({ shot: { candidate: { touch: t } } });
const sb = { shot: { revision9: { narrow: { ref: 3, cap: 1, only: 3 } } } };
const free = { decide: { candidate: { chased: { reach: 99, near: 10 } } } };
const C = {
  Bid: B,
  ctl: load('ctl'),
  c9,
  // Round 1.
  t10: merge(B, ta(1)),
  t15: merge(B, ta(1.5)),
  c9t10: merge(c9, ta(1)),
  c9t15: merge(c9, ta(1.5)),
  s3: merge(B, sb),
  c9s3: merge(c9, sb),
  t15s3: merge(merge(B, ta(1.5)), sb),
  c9t15s3: merge(merge(c9, ta(1.5)), sb),
  c9f: merge(c9, free),
};
for (const [n, c] of Object.entries(C)) writeFileSync(out + n + '.json', JSON.stringify(c) + '\n');
console.log(Object.keys(C).join(' '));
export { merge, B, c9 };
