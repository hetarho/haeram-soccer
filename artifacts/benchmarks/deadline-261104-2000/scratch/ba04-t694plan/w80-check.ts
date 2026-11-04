// Read-only check of CLUB-48's W80 boundary: the released formula (potential lowered alike) against
// W80 at the same absolute potential. Run: pnpm exec tsx .tmp/ba04-t694plan/w80-check.ts
import { marketWageUnits } from '../../packages/engine/src/market-prices';

const released = (d: number, a: number, age: number, pot: number, s: number) =>
  marketWageUnits(d, a, age, pot, s);
const absolute = (d: number, a: number, age: number, pot: number, s: number) => {
  const full = marketWageUnits(d, a, age, pot, 1);
  if (s === 1 || a <= 80) return full;
  const w80 = marketWageUnits(d, 80, age, pot, 1);
  return w80 * (full / w80) ** s;
};

console.log('repro', released(0, 80, 18, 99, 0), released(0, 81, 18, 99, 0), released(0, 81, 18, 99, 0.1));
console.log('absolute', absolute(0, 80, 18, 99, 0), absolute(0, 81, 18, 99, 0), absolute(0, 81, 18, 99, 0.1));

const spreads = [0, 0.1, 0.23, 0.4, 0.57, 0.81, 0.99, 1];
const divisions = [0, 0.5, 1, 2, 4];
for (const [name, f] of [
  ['released', released],
  ['absolute', absolute],
] as const) {
  let pot = 0,
    gap = 0,
    potential = 0,
    worst = 0,
    example = '';
  for (const s of spreads)
    for (const d of divisions)
      for (let age = 15; age <= 36; age++)
        for (let a = 60; a < 99; a++) {
          for (let p = 60; p <= 99; p++) {
            // fixed potential, ability + 1 (ability may reach potential)
            {
              const lo = f(d, a, age, p, s),
                hi = f(d, a + 1, age, p, s);
              if (hi < lo * (1 - 1e-12)) {
                pot++;
                if (lo / hi > worst) {
                  worst = lo / hi;
                  example = `fixed pot d${d} a${a}->${a + 1} age${age} pot${p} s${s}: ${lo} > ${hi}`;
                }
              }
            }
            // fixed promise gap
            if (p + 1 <= 99) {
              const lo = f(d, a, age, p, s),
                hi = f(d, a + 1, age, p + 1, s);
              if (hi < lo * (1 - 1e-12)) gap++;
            }
            // potential at fixed ability
            if (p + 1 <= 99) {
              const lo = f(d, a, age, p, s),
                hi = f(d, a, age, p + 1, s);
              if (hi < lo * (1 - 1e-12)) potential++;
            }
          }
        }
  console.log(name, { pot, gap, potential, worst, example });
}

// How far W80 moves for adult and young stars (the books' exposure), at s = 0.23 and 0.57.
for (const s of [0.23, 0.57, 0.81])
  for (const [age, a, p] of [
    [19, 86, 95],
    [21, 90, 97],
    [23, 92, 96],
    [24, 92, 96],
    [27, 92, 92],
  ])
    console.log(
      `s${s} age${age} a${a} pot${p}`,
      (absolute(0, a, age, p, s) / released(0, a, age, p, s)).toFixed(4),
    );
