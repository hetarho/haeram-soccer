import { expect, it } from 'vitest';
import { cellDistance } from './cells';
import { TouchSearch } from './search';
import type { TeamId } from './types';

it('keeps row-ID ties across equal-distance cells and forgets the preceding pool', () => {
  const rows = [
    { side: 0 as const, cell: 4, group: 0 },
    { side: 0 as const, cell: 0, group: 0 },
  ];
  const search = new TouchSearch(rows, [0, 1]);
  const cost = (i: number) => cellDistance(rows[i]!.cell, 2);
  expect(cost(0)).toBe(cost(1));
  expect(search.pick(0, [0, 1], 2, [0], cost, () => false)).toBe(0);
  expect(search.pick(0, [1], 2, [0], cost, () => false)).toBe(1);
  expect(search.pick(0, [], 2, [0], cost, () => false)).toBe(-1);
});

it('matches a complete scan over sides, cells, subsets, negative costs and fixed rows', () => {
  const bounds = [-300, -1500, 200, -800];
  const rows = Array.from({ length: 80 }, (_, i) => ({
    side: (i % 2) as TeamId,
    cell: (i * 17) % 40,
    group: i % 4,
  }));
  const order = rows.map((_, i) => i).reverse();
  const search = new TouchSearch(rows, order);
  for (const side of [0, 1] as const)
    for (let cell = 0; cell < 40; cell++)
      for (let subset = 0; subset < 3; subset++) {
        const pool = order.filter((i) => rows[i]!.side === side && i % 3 !== subset);
        const fixed = (i: number) => i % 7 === 0;
        const cost = (i: number) =>
          cellDistance(rows[i]!.cell, cell) +
          (fixed(i) ? -30000 : bounds[rows[i]!.group]!) +
          (i % 3) * 100;
        let best = -1,
          price = Infinity;
        for (const i of pool)
          if (cost(i) < price) {
            best = i;
            price = cost(i);
          }
        expect(search.pick(side, pool, cell, bounds, cost, fixed)).toBe(best);
      }
});
