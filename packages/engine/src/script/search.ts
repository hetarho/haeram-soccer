import { CELL_CENTIMETRES, cellDistance } from './cells';
import type { TeamId } from './types';

const cellsByDistance = CELL_CENTIMETRES.map((row) =>
  row.map((_, cell) => cell).sort((a, b) => row[a]! - row[b]! || a - b),
);

/** Per-writer index. A group has one valid lower bound on its non-distance cost. */
export class TouchSearch {
  private readonly buckets = [0, 1].map(() =>
    Array.from({ length: 4 }, () => Array.from({ length: 40 }, () => [] as number[])),
  );
  private readonly rank: number[];
  private readonly marked: Uint32Array;
  private serial = 0;

  constructor(
    rows: readonly { side: TeamId; cell: number; group: number }[],
    order: readonly number[],
  ) {
    this.marked = new Uint32Array(rows.length);
    this.rank = Array<number>(rows.length);
    order.forEach((i, rank) => {
      this.rank[i] = rank;
      const r = rows[i]!;
      this.buckets[r.side]![r.group]![r.cell]!.push(i);
    });
  }

  /**
   * Costs are safe integers, bounded below by cell distance + bounds[group]. Fixed/due rows
   * bypass that bound. Equal costs retain row-ID order even when equal-distance cells differ.
   */
  pick(
    team: TeamId,
    pool: readonly number[],
    cell: number,
    bounds: readonly number[],
    cost: (index: number) => number,
    fixed: (index: number) => boolean,
  ): number {
    this.serial = (this.serial + 1) >>> 0;
    if (this.serial === 0) {
      this.marked.fill(0);
      this.serial = 1;
    }
    let best = -1;
    let bestCost = Infinity;
    const visit = (i: number) => {
      const value = cost(i);
      if (value < bestCost || (value === bestCost && this.rank[i]! < this.rank[best]!)) {
        best = i;
        bestCost = value;
      }
    };
    for (const i of pool) {
      if (fixed(i)) visit(i);
      else this.marked[i] = this.serial;
    }
    for (let group = 0; group < bounds.length; group++) {
      for (const near of cellsByDistance[cell]!) {
        if (cellDistance(near, cell) + bounds[group]! > bestCost) break;
        for (const i of this.buckets[team]![group]![near]!)
          if (this.marked[i] === this.serial) visit(i);
      }
    }
    return best;
  }
}
