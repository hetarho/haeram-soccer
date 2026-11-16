import { describe, expect, it } from 'vitest';
import { STAGING_CONFIG } from './config';
import { giveBall } from './ball';
import { PITCH, toAttack } from './pitch';
import { openSupportAngle, supportClearance, supportTarget } from './support';
import { formationSides, formedStage } from './tactics.testkit';
import { defaultTarget, positionsOf, unmarked, type StageState } from './world';
import type { TeamId, Vec } from './types';

const BALL: Vec = [40, 34];
const TARGET: Vec = [60, 34];
const SCREEN: Vec = [50, 34];

function situation(team: TeamId = 0, period: 1 | 2 = 1) {
  const state = formedStage(formationSides('possession', 'possession'), BALL, team, 'buildUp');
  state.fixture.period = period;
  const owner = team * 11 + 5;
  const index = team * 11 + 6;
  const point = (p: Vec): [number, number] => [...toAttack(team, p, period)];
  state.bodies[owner].pos = point(BALL);
  giveBall(state, owner);
  state.orders.clear();
  state.cues.clear();
  for (const p of state.fixture.teams[team === 0 ? 1 : 0].players)
    state.bodies[p.index].pos = point([3, 4 + p.slot * 5]);
  state.bodies[(team === 0 ? 1 : 0) * 11 + 6].pos = point(SCREEN);
  const target = point(TARGET);
  const snapshot = positionsOf(state);
  return { state, index, owner, target, snapshot };
}

describe('supporting passing angles', () => {
  it('opens the fixed central screen sideways, preserving depth and the movement budget', () => {
    const next = openSupportAngle(BALL, TARGET, [SCREEN]);
    expect(next[0]).toBe(TARGET[0]);
    expect(Math.abs(next[1] - TARGET[1])).toBeLessThanOrEqual(STAGING_CONFIG.shape.unmark.step);
    expect(supportClearance(BALL, next, [SCREEN])).toBeGreaterThan(
      supportClearance(BALL, TARGET, [SCREEN]),
    );
  });

  it('keeps an open lane and empty/zero/out-of-range lanes exactly', () => {
    expect(openSupportAngle(BALL, TARGET, [[50, 40]])).toBe(TARGET);
    expect(openSupportAngle(BALL, TARGET, [])).toBe(TARGET);
    expect(openSupportAngle(BALL, BALL, [SCREEN])).toBe(BALL);
    expect(openSupportAngle([0, 34], TARGET, [SCREEN])).toBe(TARGET);
  });

  it('keeps nearby-marker avoidance and rejects another opponent that blocks a proposed lane', () => {
    const nearby: Vec = [60, 35];
    expect(openSupportAngle(BALL, TARGET, [SCREEN, nearby])).toBe(TARGET);
    const opponents: Vec[] = [SCREEN, [50, 32.75]];
    const next = openSupportAngle(BALL, TARGET, opponents);
    expect(next[1]).toBeGreaterThan(TARGET[1]);
    expect(supportClearance(BALL, next, opponents)).toBeGreaterThanOrEqual(
      supportClearance(BALL, TARGET, opponents),
    );
    expect(openSupportAngle(BALL, TARGET, [SCREEN, [50, 32.75], [50, 35.25]])).toBe(TARGET);
  });

  it('keeps the range and interior-projection boundaries explicit', () => {
    expect(openSupportAngle(BALL, TARGET, [[43, 34]])).toBe(TARGET);
    expect(openSupportAngle(BALL, [47.99, 34], [[44, 34]])).toEqual([47.99, 34]);
    const far: Vec = [65.01, 34];
    expect(openSupportAngle(BALL, far, [[52, 34]])).toBe(far);
    expect(
      supportClearance(BALL, TARGET, [
        [43, 34],
        [57, 34],
      ]),
    ).toBe(Infinity);
  });

  it('keeps touchline bounds without changing x or the lateral step limit', () => {
    for (const y of [STAGING_CONFIG.margin, PITCH.width - STAGING_CONFIG.margin]) {
      const base: Vec = [60, y];
      const next = openSupportAngle([40, y], base, [[50, y]]);
      expect(next[0]).toBe(60);
      expect(next[1]).toBeGreaterThanOrEqual(STAGING_CONFIG.margin);
      expect(next[1]).toBeLessThanOrEqual(PITCH.width - STAGING_CONFIG.margin);
      expect(Math.abs(next[1] - y)).toBeLessThanOrEqual(STAGING_CONFIG.shape.unmark.step);
    }
  });

  it.each([
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
  ] as const)('side %s period %s uses the same bounded geometry', (team, period) => {
    const { state, index, target, snapshot } = situation(team, period);
    const next = supportTarget(state, index, target, snapshot);
    expect(next[0]).toBe(target[0]);
    expect(next[1]).not.toBe(target[1]);
    expect(Math.abs(next[1] - target[1])).toBeLessThanOrEqual(STAGING_CONFIG.shape.unmark.step);
  });

  const excluded: [string, (s: StageState, index: number, owner: number) => void][] = [
    [
      'live restart action',
      (s) => {
        s.action = 'freeKick';
      },
    ],
    [
      'dead time',
      (s) => {
        s.live = false;
      },
    ],
    [
      'free ball',
      (s) => {
        s.ball.mode = 'loose';
        s.ball.owner = -1;
      },
    ],
    [
      'flight',
      (s) => {
        s.ball.mode = 'flight';
      },
    ],
    [
      'set piece',
      (s) => {
        s.phase = 'setPiece';
      },
    ],
    [
      'final third',
      (s) => {
        s.phase = 'finalThird';
      },
    ],
    [
      'opposing side',
      (s) => {
        s.team = 1;
      },
    ],
    [
      'other side owner',
      (s, _i, owner) => {
        s.fixture.players[owner].team = 1;
      },
    ],
    [
      'absent supporter',
      (s, index) => {
        s.fixture.present = s.fixture.players.map((p) => p.index !== index);
      },
    ],
    [
      'absent owner',
      (s, _i, owner) => {
        s.fixture.present = s.fixture.players.map((p) => p.index !== owner);
      },
    ],
    [
      'explicit order',
      (s, index) => {
        s.orders.set(index, { target: [70, 20], pace: 'run' });
      },
    ],
    [
      'explicit cue',
      (s, index) => {
        s.cues.set(index, { target: [70, 20], pace: 'run' });
      },
    ],
  ];
  it.each(excluded)('%s retains the original target', (_name, change) => {
    const { state, index, owner, target, snapshot } = situation();
    change(state, index, owner);
    expect(supportTarget(state, index, target, snapshot)).toBe(target);
  });

  it('the owner and goalkeeper retain their exact targets', () => {
    const { state, owner, target, snapshot } = situation();
    expect(supportTarget(state, owner, target, snapshot)).toBe(target);
    expect(supportTarget(state, 0, target, snapshot)).toBe(target);
  });

  it('integrates once after marker avoidance, preserving that avoidance exactly', () => {
    const { state, index, target, snapshot } = situation();
    const fixed = (): Vec => target;
    expect(defaultTarget(state, index, snapshot, undefined, fixed).target).toEqual(
      supportTarget(state, index, target, snapshot),
    );
    state.bodies[17].pos = [60, 35];
    const marked = positionsOf(state);
    const before = unmarked(state, index, target, marked);
    expect(defaultTarget(state, index, marked, undefined, fixed).target).toEqual(before);
  });
});
