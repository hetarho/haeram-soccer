/** Cup keys and names, knockout round labels, tie IDs and aggregates: a leaf the UI may read (→ARCH-4). */
import type { Fixture, KnockoutTie, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';

export const cupKey = (code: string) => `cup:${code}`;
export const domesticCupName = (code: string) => `${country(code).name} 컵`;

/** Media name of a knockout round from the clubs it starts with: 결승, 4강, 8강 … or N라운드. */
export function roundLabel(clubs: number, index: number) {
  if (clubs === 2) return '결승';
  if (clubs <= 64 && (clubs & (clubs - 1)) === 0) return `${clubs}강`;
  return `${index + 1}라운드`;
}

/** A tie's fixture ID; `year` reaches the fixtures of a season already closed. */
export function tieId(
  w: Pick<World, 'year'>,
  key: string,
  round: number,
  tie: number,
  year = w.year,
) {
  return `${year}:${key}:k${round}:${tie}`;
}

/** Aggregate score of a tie from the first-leg home side's view, for display. */
export function tieAggregate(tie: KnockoutTie, legs: readonly Fixture[]): [number, number] {
  return legs.reduce<[number, number]>(
    (sum, f) =>
      f.score
        ? f.home === tie.home
          ? [sum[0] + f.score.home, sum[1] + f.score.away]
          : [sum[0] + f.score.away, sum[1] + f.score.home]
        : sum,
    [0, 0],
  );
}
