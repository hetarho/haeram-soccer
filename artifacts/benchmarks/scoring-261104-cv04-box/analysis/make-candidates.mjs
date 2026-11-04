// T689 cv04-box: node make-candidates.mjs — writes `candidates/<name>.json`, each cv04-sym's
// `sp70bx40s10rc20` (`B`, copied from cv04-ori beside cv04's control `ctl`) with a structural
// lever from this window's box-entry diagnostic (`scripts/scoring-box-entries.ts`).
// `bk<from>e<edge>[m<mid>][w<wide>]`: this window's default-off `SHAPE_CONFIG.candidate.block` —
// with the ball within `from` m of his goal and within `wide` m of the centre line (20.2: the
// central lane and both half-spaces; `w10`: the central lane only), the back line's shape place at
// most `edge` m out and a midfielder's at most `mid` m.
// `sd<set>[x]`: this window's default-off `DECISION_CONFIG.candidate.setDefence` (the carrier in
// front of a set defence): with `set` or more opposing outfielders in their box a carrier outside
// it at least 70 m up carries into it 10 xT points less and passes into it to a receiver with an
// opponent within 4 m 1.5 less (`x`: 20 and 3).
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../candidates/', import.meta.url);
const base = JSON.parse(readFileSync(new URL('B.json', dir), 'utf8'));
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b))
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] ? merge(out[k], v) : v;
  return out;
};
const all = (...xs) => xs.reduce((o, x) => merge(o, x), {});
const block = (from, edge, mid = 0, wide = 20.2) => ({
  shape: { candidate: { block: { from, edge, mid, wide } } },
});
const set = (n, carry = 10, pass = 1.5) => ({
  decide: { candidate: { setDefence: { set: n, from: 70, carry, pass, free: 4 } } },
});
// `cp<stop>[n<near>][f<from>]`: this window's default-off `DUEL_CONFIG.candidate.carryPath` — an
// unpressed carry ending at least `from` m up stops `stop` m short of the first opposing
// outfielder within `near` m (2) of its path.
const path = (stop, near = 2, from = 0) => ({ duel: { candidate: { carryPath: { stop, near, from } } } });
// `ao<m>` / `ho<m>`: where `B`'s attackers wait in possession (nx04's `arrive.out`, 10 in `B`, and
// `hold.out`, 14): at least / no deeper than <m> m from goal, so a man waiting at the box's edge
// (16.5 m) is reached by a front-of-box entry and enters the box on his run.
const arrive = (out) => ({ shape: { candidate: { arrive: { out } } } });
const hold = (out) => ({ shape: { candidate: { hold: { out } } } });
// `gs10`: `B`'s goal-side marking (revision 10's `goalSide` near 60, zone 45, pick 30, blend 1, room 0
// and revision 9's `markRadius` 24) back at revision 10's released values (40, 30, 12, 0.8, 8; 14),
// a read of how much of the open box comes from markers following men out of it.
const marks = {
  shape: {
    candidate: {
      revision9: { markRadius: 14 },
      revision10: { goalSide: { near: 40, zone: 30, pick: 12, blend: 0.8, room: 8 } },
    },
  },
};
const variants = {
  // `Bid`: `B` unchanged, for the default-off identity re-read on this window's source.
  Bid: {},
  gs10: marks,
  ao17: arrive(17),
  ho17ao17: all(hold(17), arrive(17)),
  ho20ao20: all(hold(20), arrive(20)),
  cp2: path(2),
  cp2f70: path(2, 2, 70),
  cp1n3: path(1, 3),
  cp2bk: all(path(2), block(35, 16)),
  bk35e16sd4: all(block(35, 16), set(4)),
  bk35e16sd4x: all(block(35, 16), set(4, 20, 3)),
  sd4: set(4),
  sd5: set(5),
  sd6: set(6),
  sd4x: set(4, 20, 3),
  bk35e16: block(35, 16),
  bk35e13: block(35, 13),
  bk45e16: block(45, 16),
  bk35e16m24: block(35, 16, 24),
  bk35e16w10: block(35, 16, 0, 10),
};
for (const [name, v] of Object.entries(variants)) {
  writeFileSync(new URL(name + '.json', dir), JSON.stringify(all(base, v)) + '\n');
  console.log(name);
}
