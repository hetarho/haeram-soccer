import { lineOf } from '../../../../packages/engine/src/player';
import { expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import {
  appearanceCounts,
  appearanceText,
  explorePlayers,
  per90,
  playsUnder,
  tallies,
} from './playerAnalysis';
it('uses minutes, scopes and role filters before sorting, without deleting inactive records', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Rates',
    color: '#24664f',
    seed: 'rates',
    level: 'easy' as const,
  });
  const [a, b, c] = w.players.filter((p) => lineOf(p.position) === 'FW');
  a.season[0] = 2;
  a.season[10] = 180;
  b.season[0] = 3;
  b.season[10] = 90;
  b.status = 'sold';
  b.career = [...b.season];
  c.season[10] = 0;
  expect(per90(a.season, 0)).toBe(1);
  expect(per90(c.season, 0)).toBeUndefined();
  const options = {
    scope: 'season' as const,
    role: 'FW' as const,
    query: '',
    minutes: 90,
    order: 'goals90' as const,
  };
  expect(explorePlayers([a, b, c], options).map((p) => p.id)).toEqual([a.id]);
  expect(explorePlayers([a, b, c], { ...options, scope: 'career' }).map((p) => p.id)).toEqual([
    b.id,
  ]);
  expect(explorePlayers([a, b, c], { ...options, minutes: 0 }).at(-1)!.id).toBe(c.id);
  expect(w.players).toContain(b);
});

it('position filter counts 준수+', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Positions',
    color: '#24664f',
    seed: 'positions',
    level: 'easy' as const,
  });
  const p = w.players.find((one) => one.position === 'CB')!;
  p.positions = { CB: 3, LB: 2, DM: 1 };
  // Under each position he plays at 준수 or better, and under the line of each.
  expect(playsUnder(p, 'CB')).toBe(true);
  expect(playsUnder(p, 'LB')).toBe(true);
  expect(playsUnder(p, 'DM')).toBe(false);
  expect(playsUnder(p, 'DF')).toBe(true);
  expect(playsUnder(p, 'MF')).toBe(false);
  expect(playsUnder(p, 'all')).toBe(true);
  // A centre back who plays defensive midfield at 준수 counts under midfield too.
  p.positions = { CB: 3, DM: 2 };
  expect(playsUnder(p, 'MF')).toBe(true);
  const options = { scope: 'season' as const, query: '', minutes: 0, order: 'roster' as const };
  expect(explorePlayers(w.players, { ...options, role: 'DM' }).map((one) => one.id)).toContain(
    p.id,
  );
  expect(
    explorePlayers(w.players, { ...options, role: 'RW' }).every(
      (one) => (one.positions.RW ?? 0) >= 2,
    ),
  ).toBe(true);
});

/** An own match whose only facts are who played how long and the substitutions. */
function played(
  w: World,
  year: number,
  lines: [string, number][],
  subs: [string, string][] = [],
): MatchRecord {
  const metrics = (minutes: number) => Object.assign(Array<number>(12).fill(0), { 10: minutes });
  return {
    id: `m${w.ownMatches.length}`,
    year,
    kind: 'league',
    players: lines.map(([id, minutes]) => ({ id, metrics: metrics(minutes) })),
    incidents: subs.map(([player, other]) => ({ minute: 60, side: 0, kind: 'sub', player, other })),
  } as unknown as MatchRecord;
}
const club = () =>
  createWorld({
    country: 'ENG',
    name: 'Appearances',
    color: '#24664f',
    seed: 'appearances',
    level: 'easy' as const,
  });

it('counts one appearance per own match with minutes, substitutes included', () => {
  const w = club();
  const [starter, sub, other] = w.players;
  // Added time: a 97-minute starter still played one match, a 9-minute substitute one too.
  w.ownMatches.push(
    played(w, w.year - 1, [
      [starter.id, 90],
      [other.id, 90],
    ]),
    played(
      w,
      w.year,
      [
        [starter.id, 97],
        [other.id, 88],
        [sub.id, 9],
      ],
      [[other.id, sub.id]],
    ),
    played(w, w.year, [[starter.id, 45]]),
  );
  const counts = appearanceCounts(w);
  expect(counts.get(starter.id)).toEqual({ season: 2, career: 3, seasonSub: 0, careerSub: 0 });
  expect(counts.get(sub.id)).toEqual({ season: 1, career: 1, seasonSub: 1, careerSub: 1 });
  expect(counts.get(other.id)).toEqual({ season: 1, career: 2, seasonSub: 0, careerSub: 0 });
  // Memoised: a day without a match keeps the map; an own match or a new season rebuilds it.
  w.revision++;
  expect(appearanceCounts(w)).toBe(counts);
  w.ownMatches.push(played(w, w.year, [[sub.id, 90]]));
  expect(appearanceCounts(w).get(sub.id)!.season).toBe(2);
  // The view's tally carries both scopes and the sheet says how many were from the bench.
  const tally = tallies(w).players[sub.id];
  expect(tally.apps).toEqual([2, 2]);
  expect(appearanceText(tally, 'season')).toBe('2경기 · 교체 1');
  expect(appearanceText(tallies(w).players[starter.id], 'career')).toBe('3경기');
});

it('gives no appearance for a line with 0 minutes', () => {
  const w = club();
  const [starter, unused] = w.players;
  w.ownMatches.push(
    played(
      w,
      w.year,
      [
        [starter.id, 90],
        [unused.id, 0],
      ],
      // A substitution named but never played does not count either.
      [[starter.id, unused.id]],
    ),
  );
  expect(appearanceCounts(w).get(unused.id)).toBeUndefined();
  expect(tallies(w).players[unused.id]).toBeUndefined();
  expect(appearanceText(tallies(w).players[unused.id], 'season')).toBe('0경기');
});
