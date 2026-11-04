// T689 cv04-att: node make-candidates.mjs — writes `candidates/<name>.json`, each cv04-sym's
// `sp70bx40s10rc20` (`B`, read from cv04-box's candidates beside cv04's control `ctl`) with this
// window's default-off `DECISION_CONFIG.candidate.entry` (→MATCH-16 r50).
// `e<reach>[p<pass>][c<carry>]`: from 70 m up, outside the box and not in a clear chance, a carry
// heading or a pass ending in the box is worth the chance at its arrival (`chanceXg`, 0 with an
// opposing outfielder goal-side of it within <reach> m), a carry heading at `carry` times
// (chance − the carrier's cell xT) × 100, a pass the same at the pass gain's weight less
// <pass> × (1 − chance / 0.1, at least 0); `r<shot>[v<view>][w<worth>]`: with no entry worth
// <worth> (0.08 by default) his shot weight × <shot> with at least <view> (0.5) of its path open.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../candidates/', import.meta.url);
mkdirSync(dir, { recursive: true });
const from = new URL('../../scoring-261104-cv04-box/candidates/', import.meta.url);
const base = JSON.parse(readFileSync(new URL('B.json', from), 'utf8'));
const ctl = JSON.parse(readFileSync(new URL('ctl.json', from), 'utf8'));
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b))
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] ? merge(out[k], v) : v;
  return out;
};
const all = (...xs) => xs.reduce((o, x) => merge(o, x), {});
const entry = (reach, pass = 0, carry = 1, through = 0) => ({
  decide: { candidate: { entry: { from: 70, reach, pass, carry, ref: 0.1, through } } },
});
const rest = (shot, view = 0.5, worth = 0.08, pass = 1, carry = 1) => ({
  decide: { candidate: { entry: { rest: { worth, shot, view, pass, carry } } } },
});
// `t`: `entry.through` 1, a ball in behind read where it lands (`throughPoint`), not at the runner.
// `fa`: cv04-ori's default-off `revision9.clear.far` 1 — beyond 20 m and outside the box only the
// nobody-ahead clause makes a clear chance, so a man alone out there is no longer sent at goal
// (MATCH-16's clear-chance carry skips the entry switch).
const far = { decide: { candidate: { revision9: { clear: { far: 1 } } } } };
const lead = (seconds) => ({ decide: { candidate: { entry: { lead: seconds } } } });
const past = (prior) => ({ decide: { candidate: { past: { prior } } } });
const path = (stop, near = 2, from = 0) => ({ duel: { candidate: { carryPath: { stop, near, from } } } });
const sph = (q) => ({ shot: { candidate: { setPieceHeader: q } } });
const shotA = (a) => ({ shot: { a } });
const off = (base) => ({ restart: { offside: { candidate: { base } } } });
// cv04-box's default-off `SHAPE_CONFIG.candidate.block` (its `bk<from>e<edge>`).
const block = (from, edge, mid = 0, wide = 20.2) => ({
  shape: { candidate: { block: { from, edge, mid, wide } } },
});
const variants = {
  // `Bid`: `B` unchanged, for the default-off identity re-read on this window's source.
  Bid: {},
  e4: entry(4),
  e4p2: entry(4, 2),
  e4p4: entry(4, 4),
  e6p2: entry(6, 2),
  e4p2c2: entry(4, 2, 2),
  e4p2r2: all(entry(4, 2), rest(2)),
  e4p2r3: all(entry(4, 2), rest(3)),
  fa: far,
  e4p2fa: all(entry(4, 2), far),
  e6p4fa: all(entry(6, 4), far),
  e6p4t: entry(6, 4, 1, 1),
  e6p4tfa: all(entry(6, 4, 1, 1), far),
  e8p4tfa: all(entry(8, 4, 1, 1), far),
  e6p4tfar3w15: all(entry(6, 4, 1, 1), far, rest(3, 0.5, 0.15)),
  // Screen 3: the entry weighing on cv04-box's `block` (`bk<from>e<edge>`: with the ball within
  // <from> m of his goal and within 20.2 m of the centre line, the back line's shape place at most
  // <edge> m out), which puts defenders goal-side in the box so fewer arrivals are free.
  bk35e16e6p4fa: all(block(35, 16), entry(6, 4), far),
  bk35e16e8p4fa: all(block(35, 16), entry(8, 4), far),
  bk35e13e6p4fa: all(block(35, 13), entry(6, 4), far),
  bk45e16e8p4fa: all(block(45, 16), entry(8, 4), far),
  bk35e16e8p4c2fa: all(block(35, 16), entry(8, 4, 2), far),
  bk35e16e8p8fa: all(block(35, 16), entry(8, 8), far),
  e8p8fa: all(entry(8, 8), far),
  // Screen 4 (`l<s>`: `entry.lead` <s>, a moving receiver read <s> s along his velocity, where he
  // takes the ball, so a man running into the box from its edge is weighed at his arrival).
  e8p8l1fa: all(entry(8, 8), lead(1), far),
  e8p8l2fa: all(entry(8, 8), lead(2), far),
  bk35e16e8p8l1fa: all(block(35, 16), entry(8, 8), lead(1), far),
  // Screen 5, the entries beyond the deepest defender on `e8p8fa`: `pp<x>` the prior of a pass to
  // a receiver already past the offside line as it is played (`DECISION_CONFIG.candidate.past.prior`,
  // 1 in `B`) ×0.<x>; `cp2n<m>` cv04-box's default-off `DUEL_CONFIG.candidate.carryPath` (an
  // unpressed carry stops 2 m short of the first opposing outfielder within <m> m of its path).
  e8p8pp03fa: all(entry(8, 8), far, past(0.3)),
  e8p8pp01fa: all(entry(8, 8), far, past(0.1)),
  e8p8cp2n4fa: all(entry(8, 8), far, path(2, 4)),
  e8p8cp2n5fa: all(entry(8, 8), far, path(2, 5)),
  e8p8pp03cp2n4fa: all(entry(8, 8), far, past(0.3), path(2, 4)),
  // Screen 6: `e8p8pp03fa` with the shot from distance when no entry is worth `w`/100 (`r<shot>`).
  e8p8pp03r3w15fa: all(entry(8, 8), far, past(0.3), rest(3, 0.5, 0.15)),
  e8p8pp03r5w15fa: all(entry(8, 8), far, past(0.3), rest(5, 0.5, 0.15)),
  e8p8pp03r3w30fa: all(entry(8, 8), far, past(0.3), rest(3, 0.5, 0.3)),
  e8p8pp03r5w30fa: all(entry(8, 8), far, past(0.3), rest(5, 0.5, 0.3)),
  // Screen 7: goals back on the fewer entries — `sp90` a set piece's header quality 0.9 (cv04-sym's
  // `setPieceHeader`, 0.7 in `B`), `a085` the shot model's `a` −0.85 (−1 in `B`), `o12` MATCH-18's
  // offside call `base` 0.12 (0.08 in `B`), `pp05` the past-the-line prior ×0.5.
  e8p8pp03r5w30sp90fa: all(entry(8, 8), far, past(0.3), rest(5, 0.5, 0.3), sph(0.9)),
  e8p8pp03r5w30a085fa: all(entry(8, 8), far, past(0.3), rest(5, 0.5, 0.3), shotA(-0.85)),
  e8p8pp03r5w30a085o12fa: all(entry(8, 8), far, past(0.3), rest(5, 0.5, 0.3), shotA(-0.85), off(0.12)),
  e8p8pp05r5w30sp90fa: all(entry(8, 8), far, past(0.5), rest(5, 0.5, 0.3), sph(0.9)),
};
writeFileSync(new URL('B.json', dir), JSON.stringify(base) + '\n');
writeFileSync(new URL('ctl.json', dir), JSON.stringify(ctl) + '\n');
for (const [name, v] of Object.entries(variants)) {
  writeFileSync(new URL(name + '.json', dir), JSON.stringify(all(base, v)) + '\n');
  console.log(name);
}
