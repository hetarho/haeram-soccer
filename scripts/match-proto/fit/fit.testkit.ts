// Small settled matches for the fitted script's tests (T820): synthetic, hand-made rows over the
// first exported match's two sides, so each rule can be read on a few dozen events.
import { readFileSync } from 'node:fs';
import { PLAYER_ROW, readSettled, type Settled, TEAM_ROW } from '../core/settled.ts';

const DIR = new URL('../fixtures/settled/', import.meta.url);
/** An exported settled match by id (`s01` …). */
export const loadSettled = (id: string): Settled =>
  readSettled(JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8')));

// [side, group, kind, setPiece, from, to, actor, result, lineBreaking, other]; kinds: 0 short,
// 1 long, 2 through, 3 cross, 4 cutBack, 5 carry, 6 takeOn; results: 0 complete, 1 offside,
// 2 intercepted, 3 outTouch, 4 outByline, 5 cornerWon, 6 looseKept, 7 looseRecovered, 8 tackled.
const HOME: number[][] = [
  [0, 0, 0, 0, 7, 12, 1, 0, 0, -1],
  [0, 0, 0, 0, 12, 17, 5, 0, 0, -1],
  [0, 0, 1, 0, 17, 32, 6, 0, 0, -1],
  [0, 0, 5, 0, 32, 33, 10, 0, 0, -1],
  [0, 1, 0, 0, 22, 27, 4, 2, 0, 13],
  [0, 2, 0, 0, 27, 29, 7, 3, 0, -1],
  [0, 3, 3, 0, 33, 38, 9, 4, 0, -1],
  [0, 4, 3, 0, 34, 38, 9, 5, 0, -1],
  [0, 5, 2, 0, 22, 32, 8, 1, 0, 10],
  [0, 6, 6, 0, 27, 32, 9, 8, 0, 14],
  [0, 7, 0, 0, 17, 22, 3, 6, 0, -1],
  [0, 8, 3, 1, 35, 37, 9, 0, 0, -1],
  [0, 9, 0, 0, 12, 13, 2, 0, 0, -1],
  [0, 9, 0, 0, 13, 18, 6, 0, 0, -1],
  [0, 10, 0, 0, 22, 23, 5, 0, 0, -1],
  [0, 11, 4, 0, 38, 32, 7, 0, 0, -1],
];
const AWAY: number[][] = [
  [1, 0, 0, 0, 7, 12, 12, 0, 0, -1],
  [1, 0, 0, 0, 12, 17, 15, 0, 0, -1],
  [1, 0, 1, 0, 17, 27, 16, 2, 0, 4],
  [1, 1, 0, 0, 22, 27, 17, 0, 0, -1],
  [1, 1, 3, 0, 29, 33, 19, 3, 0, -1],
  [1, 2, 5, 0, 22, 27, 20, 8, 0, 6],
  [1, 3, 0, 0, 27, 32, 18, 0, 0, -1],
  [1, 4, 0, 0, 12, 17, 13, 7, 0, 7],
  [1, 5, 0, 0, 13, 18, 14, 0, 0, -1],
  [1, 5, 0, 0, 18, 23, 16, 0, 0, -1],
  [1, 6, 0, 0, 23, 28, 17, 0, 0, -1],
  [1, 7, 6, 0, 28, 33, 19, 0, 0, -1],
  [1, 7, 0, 0, 33, 37, 19, 0, 0, -1],
  [1, 8, 2, 0, 22, 32, 18, 1, 0, 20],
];

/** A hand-made settled match of thirty attempts, five shots (two goals, a direct free kick) and three fouls. */
export function smallSettled(): Settled {
  const base = loadSettled('s01');
  const events = [...HOME, ...AWAY];
  const pass = (side: number, actor: number) =>
    events.findIndex((e) => e[0] === side && e[6] === actor && e[2]! <= 4 && e[7] === 0);
  return readSettled({
    version: 1,
    id: 'x01',
    source: { seed: 'synthetic', fixture: 'synthetic', year: 2000, revision: 1 },
    sides: base.sides,
    score: [1, 1],
    added: [1, 3],
    events,
    // [side, minute, cell, kind, header, xg, outcome, corner, shooter, passer, source, keeper]
    shots: [
      [0, 20, 33, 0, 0, 30, 0, 0, 10, 6, pass(0, 6), 11],
      [1, 30, 32, 0, 1, 10, 1, 0, 21, 18, pass(1, 18), 0],
      [0, 60, 32, 0, 0, 5, 3, 0, 9, -1, -1, 11],
      [1, 70, 37, 0, 0, 40, 0, 0, 20, -1, -1, 0],
      [0, 80, 27, 2, 0, 4, 2, 1, 7, -1, -1, 11],
    ],
    // [fouledSide, cell, fouler, fouled, cardMinute]
    fouls: [
      [0, 22, 14, 5, 40],
      [1, 17, 3, 15, -1],
      [0, 27, 16, 7, -1],
    ],
    cards: [[40, 1, 14]],
    record: {
      team: [Array<number>(TEAM_ROW.length).fill(0), Array<number>(TEAM_ROW.length).fill(0)],
      players: Array.from({ length: 22 }, () => Array<number>(PLAYER_ROW.length).fill(0)),
    },
  });
}
