import { expect, it } from 'vitest';
import type { MatchFrame, MatchMotionSample } from '../../packages/contracts/src/types';
import { pressureDiagnostics } from './diagnostics';

const sample = (elapsedSeconds: number, near = true): MatchMotionSample => ({
  elapsedSeconds,
  ball: [50, 50],
  phase: 'possession',
  ownerId: 'a',
  players: [
    [{ id: 'a', position: [50, 50], velocity: [0, 0], state: 'carry', intent: [50, 50] }],
    [
      {
        id: 'b',
        position: [near ? 51 : 60, 50],
        velocity: [0, 0],
        state: 'press',
        intent: [50, 50],
      },
    ],
  ],
});
it('counts the longest consecutive run once per possession interval, with no gap bridged', () => {
  const frame = {
    startSeconds: 0,
    holders: [
      [0, 'a'],
      [8, ''],
    ],
    motion: [
      sample(0),
      sample(1),
      sample(2),
      sample(3, false),
      sample(4),
      sample(5),
      sample(6),
      sample(7),
    ],
    stoppages: [],
  } as unknown as MatchFrame;
  expect(pressureDiagnostics([frame])).toEqual({
    pressureSeconds: 5,
    pressureSpells2: 1,
    pressureSpells5: 0,
  });
});
it('excludes a hold starting while the ball is dead', () => {
  const frame = {
    startSeconds: 0,
    holders: [
      [0, 'a'],
      [8, ''],
    ],
    motion: [sample(0), sample(3), sample(6)],
    stoppages: [{ kind: 'freeKick', dead: 0, settled: 4, kick: 7 }],
  } as unknown as MatchFrame;
  expect(pressureDiagnostics([frame])).toEqual({
    pressureSeconds: 0,
    pressureSpells2: 0,
    pressureSpells5: 0,
  });
});
