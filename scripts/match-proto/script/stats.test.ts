import { describe, expect, it } from 'vitest';
import type { Beat, Phase, TeamId } from '../core/types.ts';
import { scriptStats } from './stats.ts';

type Row = [
  team: TeamId,
  possession: number,
  move: string,
  kind: Beat['kind'],
  actor: number,
  outcome: Beat['outcome'],
  extra?: Partial<Beat>,
];

const beatsOf = (rows: readonly Row[]): Beat[] =>
  rows.map(([team, possession, move, kind, actor, outcome, extra], index) => ({
    index,
    possession,
    team,
    phase: 'progression' as Phase,
    move,
    kind,
    actor,
    from: [50, 34],
    to: [55, 34],
    loft: false,
    through: false,
    header: false,
    outcome,
    hold: 1,
    ...extra,
  }));

describe('scriptStats', () => {
  it('counts a hand-written list', () => {
    const beats = beatsOf([
      [0, 1, 'kickOff', 'kickOff', 9, 'complete', { receiver: 5 }],
      [0, 1, 'circulate', 'pass', 5, 'complete', { receiver: 6 }],
      [0, 1, 'throughBall', 'pass', 6, 'complete', { receiver: 9, through: true }],
      [0, 1, 'throughBall', 'pass', 9, 'offside', { receiver: 10, through: true }],
      [1, 2, 'freeKick', 'freeKick', 13, 'complete', { receiver: 14 }],
      [1, 2, 'carryForward', 'carry', 14, 'tackled', { opponent: 7 }],
      [0, 3, 'carryForward', 'carry', 7, 'complete', { phase: 'counter' }],
      [0, 3, 'cross', 'pass', 7, 'complete', { receiver: 8, phase: 'counter' }],
      [0, 3, 'shot', 'shot', 8, 'goal'],
      [1, 4, 'kickOff', 'kickOff', 20, 'intercepted', { receiver: 17, opponent: 6 }],
      [0, 5, 'carryForward', 'carry', 6, 'foul', { opponent: 16 }],
      [0, 6, 'freeKick', 'freeKick', 6, 'complete', { receiver: 5 }],
      [0, 6, 'shot', 'shot', 5, 'saved', { opponent: 11 }],
    ]);
    const s = scriptStats(beats);
    expect(s.teams[0]).toEqual({
      beats: 10,
      passes: 6,
      completed: 5,
      shots: 2,
      onTarget: 2,
      goals: 1,
      offsides: 1,
      crosses: 1,
      corners: 0,
      throwIns: 0,
      goalKicks: 0,
      freeKicks: 1,
      tackles: 1,
      interceptions: 1,
      fouls: 0,
      throughBalls: 2,
      takeOns: 0,
      possessions: 4,
      counters: 1,
    });
    expect(s.teams[1]).toMatchObject({
      beats: 3,
      passes: 2,
      completed: 1,
      shots: 0,
      freeKicks: 1,
      tackles: 0,
      interceptions: 0,
      fouls: 1,
      possessions: 2,
      counters: 0,
    });
    expect(s.moves).toEqual({
      kickOff: 2,
      circulate: 1,
      throughBall: 2,
      freeKick: 2,
      carryForward: 3,
      cross: 1,
      shot: 2,
    });
    expect(s.offsideBy).toEqual([10]);
    expect(s.throughTo).toEqual([9]);
    expect(s.receivedBy).toEqual({
      kickOff: [5],
      circulate: [6],
      throughBall: [9],
      freeKick: [14, 5],
      cross: [8],
    });
    expect(s.score).toEqual([1, 0]);
  });
});
