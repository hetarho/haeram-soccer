import { expect, it } from 'vitest';
import type { MatchRecord, Player } from '../../../../packages/contracts/src/types';
import { MATERIAL_LAYOUT } from '../../../../packages/engine/src/material';
import { tallies } from './playerTallies';

const OWN = 'own';
const YEAR = 1950;
/** Minutes in a line's metrics (index 10); nothing else of a line is read. */
const line = (id: string, minutes: number) => ({
  id,
  metrics: Object.assign(Array<number>(11).fill(0), { 10: minutes }),
});
/** An own home match against `rival`: its lines, incidents and optional heat material. */
const match = (
  year: number,
  kind: string,
  lines: [string, number][],
  incidents: object[] = [],
  heat?: number[][],
) =>
  ({
    id: `${kind}:${year}:${lines.length}:${incidents.length}`,
    year,
    kind,
    home: OWN,
    away: 'rival',
    players: lines.map(([id, minutes]) => line(id, minutes)),
    incidents,
    ...(heat
      ? {
          // Each own line's 40 cells, then the own side's total and the opponent's.
          material: {
            shots: [],
            network: [],
            report: [],
            heat: [...heat, [], []].flatMap((cells) =>
              Array.from({ length: MATERIAL_LAYOUT.cells }, (_, i) => cells[i] ?? 0),
            ),
          },
        }
      : {}),
  }) as unknown as MatchRecord;
const players = (...ids: string[]) => ids.map((id) => ({ id }) as Player);

it('tallies appearances, substitutes, cards and season heat of own players', () => {
  const w = {
    year: YEAR,
    playerClub: OWN,
    players: players('starter', 'sub', 'former', 'unused'),
    ownMatches: [
      match(YEAR - 1, 'league', [['former', 90]], [{ kind: 'yellow', player: 'former' }]),
      match(
        YEAR,
        'league',
        [
          ['starter', 90],
          ['sub', 20],
          ['unused', 0],
        ],
        [
          { kind: 'yellow', player: 'starter' },
          { kind: 'secondYellow', player: 'starter' },
          { kind: 'sub', player: 'former', other: 'sub' },
          { kind: 'red', player: 'theirs' },
        ],
        [[3, 0, 0, 0, 0, 1]],
      ),
      match(YEAR, 'cup', [['sub', 90]], [{ kind: 'red', player: 'sub' }]),
    ],
  };
  const heat = Array<number>(MATERIAL_LAYOUT.cells).fill(0);
  heat[0] = 3;
  heat[5] = 1;
  expect(tallies(w)).toEqual({
    players: {
      starter: { apps: [1, 1], sub: [0, 0], yellow: [2, 2], red: [1, 1], heat },
      sub: { apps: [2, 2], sub: [1, 1], yellow: [0, 0], red: [1, 1] },
      former: { apps: [0, 1], sub: [0, 0], yellow: [0, 1], red: [0, 0] },
    },
    // Either side of a league match; the cup's red is not the league's.
    leagueReds: { starter: 1, theirs: 1 },
  });
});

it('reuses the tallies until an own match is added or the season turns', () => {
  const w = {
    year: YEAR,
    playerClub: OWN,
    players: players('a'),
    ownMatches: [match(YEAR, 'league', [['a', 90]], [{ kind: 'red', player: 'a' }], [[2]])],
  };
  const first = tallies(w);
  // A later revision of the same world, with no match played, keeps the read.
  expect(tallies({ ...w })).toBe(first);
  // A world whose own matches were read anew (a load or an import) builds its own.
  const reloaded = tallies({ ...w, ownMatches: [...w.ownMatches] });
  expect(reloaded).not.toBe(first);
  expect(reloaded).toEqual(first);
  // An own match played rescans.
  w.ownMatches.push(match(YEAR, 'cup', [['a', 45]]));
  const played = tallies(w);
  expect(played).not.toBe(first);
  expect(played.players.a!.apps).toEqual([2, 2]);
  // The season turning keeps the career and empties the new season, its heat and league reds.
  const turned = tallies({ ...w, year: YEAR + 1 });
  expect(turned).not.toBe(played);
  expect(turned).toEqual({
    players: { a: { apps: [0, 2], sub: [0, 0], yellow: [0, 0], red: [0, 1] } },
    leagueReds: {},
  });
});
