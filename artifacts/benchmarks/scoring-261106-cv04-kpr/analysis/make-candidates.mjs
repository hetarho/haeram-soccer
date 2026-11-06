// T689 cv04-kpr: node make-candidates.mjs — candidate configs on `B` (cv04-sym's `sp70bx40s10rc20`), `c9`
// (`B` with cv04-cha's `chased` `give` 0.9) and cv04-sho's `t15s3` for scripts/scoring-candidate-patch.ts
// (T689_PATCH_FILE). Copied unchanged from cv04-sho: `Bid` (`B`), `ctl`, `c9`, `t15s3`. This window's two
// switches (→MATCH-35 r55): (a) `shape.candidate.revision9.keeperOut.flight` — while the ball travels to
// its receiver the keeper holds his set place, coming out only once he has it; (b)
// `shot.revision9.narrow.body`/`grow` — the keeper's reach `body` m against a shot struck close to him,
// growing to `B`'s `reach` 2 as the ball takes `grow` s to reach him, the reference keeper by the same rule.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const sho = 'artifacts/benchmarks/scoring-261106-cv04-sho/candidates/';
const out = 'artifacts/benchmarks/scoring-261106-cv04-kpr/candidates/';
mkdirSync(out, { recursive: true });
const load = (n) => JSON.parse(readFileSync(sho + n + '.json', 'utf8'));
const merge = (a, b) => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b))
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return o;
};
const B = load('Bid');
const c9 = load('c9');
const t15s3 = load('t15s3');
const fa = { shape: { candidate: { revision9: { keeperOut: { flight: 1 } } } } };
const bb = (body, grow) => ({ shot: { revision9: { narrow: { body, grow } } } });
const sc = { stride: { candidate: { chased: 1 } } };
const C = {
  Bid: B,
  ctl: load('ctl'),
  c9,
  t15s3,
  // Round 1: (a), (b) at three settings, (a) with (b), each on `c9` and `t15s3`.
  fa: merge(B, fa),
  b6g6: merge(B, bb(0.6, 0.6)),
  b75g45: merge(B, bb(0.75, 0.45)),
  b9g3: merge(B, bb(0.9, 0.3)),
  fab: merge(merge(B, fa), bb(0.75, 0.45)),
  fab6g6: merge(merge(B, fa), bb(0.6, 0.6)),
  c9fa: merge(c9, fa),
  c9b: merge(c9, bb(0.75, 0.45)),
  c9fab: merge(merge(c9, fa), bb(0.75, 0.45)),
  t15s3fa: merge(t15s3, fa),
  t15s3fab: merge(merge(t15s3, fa), bb(0.75, 0.45)),
  // Round 2, after (b) broke MATCH-29 (`b75g45` −0.289, `fab` −0.302) and the diagnostic found (a)'s
  // receivers chased and carrying the shot's whole action while the keeper comes out: (c)
  // `stride.candidate.chased` — a carrier through on goal (nobody between) strikes in a stride or two
  // with a man chasing him as with nobody close (→MATCH-16 r53), alone and with (a), on `B`, `c9` and
  // `t15s3`.
  fc: merge(B, sc),
  fac: merge(merge(B, fa), sc),
  t15s3c: merge(t15s3, sc),
  t15s3fac: merge(merge(t15s3, fa), sc),
  c9fac: merge(merge(c9, fa), sc),
  c9t15s3fac: merge(merge(merge(c9, t15s3), fa), sc),
  // Round 3: `c9t15s3fac` (goals 3.14) with the shot model's `a` lowered (`B` −1).
  c9t15s3fac110: merge(merge(merge(merge(c9, t15s3), fa), sc), { shot: { a: -1.1 } }),
};
for (const [n, c] of Object.entries(C)) writeFileSync(out + n + '.json', JSON.stringify(c) + '\n');
console.log(Object.keys(C).join(' '));
export { merge, B, c9, t15s3 };
