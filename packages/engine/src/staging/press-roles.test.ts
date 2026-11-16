import { describe, expect, it } from 'vitest';
import { STAGING_CONFIG } from './config';
import { pressCoverPoint, selectPressRoles } from './press-roles';
import { ownGoal, toAttack } from './pitch';
import { formationSides, formedStage } from './tactics.testkit';
import { defaultTarget, isPressRole, positionsOf, type StageState } from './world';
import { dist } from './vec';
import type { TeamId, Vec } from './types';

const GAP = STAGING_CONFIG.shape.press.coverGap;

function scene(defending: TeamId = 0, period: 1 | 2 = 1) {
  const attacking = (1 - defending) as TeamId;
  const world = (p: Vec): [number, number] => [...toAttack(defending, p, period)];
  const state = formedStage(
    formationSides('balanced', 'balanced'),
    world([40, 34]),
    attacking,
    'progression',
  );
  state.fixture.period = period;
  state.tight = true;
  for (const p of state.fixture.teams[defending].players)
    state.bodies[p.index].pos = world([3, 3 + p.slot * 6]);
  const presser = defending * 11 + 6;
  const oldCover = defending * 11 + 7;
  const cover = defending * 11 + 8;
  state.bodies[presser].pos = world([42, 34]);
  state.bodies[oldCover].pos = world([45, 34]);
  state.bodies[cover].pos = world([26, 34]);
  const point = pressCoverPoint(state.ball.pos, ownGoal(defending, period), GAP);
  return { state, defending, presser, oldCover, cover, point };
}

function actualCover(s: ReturnType<typeof scene>): number[] {
  const snapshot = positionsOf(s.state);
  return s.state.fixture.teams[s.defending].players
    .filter(
      (p) =>
        isPressRole(s.state, s.defending, p.index, snapshot) &&
        dist(defaultTarget(s.state, p.index, snapshot).target, s.point) < 1e-9,
    )
    .map((p) => p.index);
}

describe('goal-side cover selection', () => {
  it.each([
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
  ] as const)(
    'side %s period %s keeps the nearest presser and the defender already in cover',
    (defending, period) => {
      const s = scene(defending, period);
      const snapshot = positionsOf(s.state);
      expect(actualCover(s)).toEqual([s.cover]);
      expect(isPressRole(s.state, defending, s.presser, snapshot)).toBe(true);
      expect(isPressRole(s.state, defending, s.oldCover, snapshot)).toBe(false);
      const want = defaultTarget(s.state, s.cover, snapshot);
      expect(want).toMatchObject({ pace: 'run', direct: true });
      expect(want.target).toEqual(s.point);
      expect(dist(snapshot[s.oldCover], s.point)).toBe(19);
      expect(dist(snapshot[s.cover], s.point)).toBe(0);
    },
  );

  it('keeps original ball-distance and index tie order without changing the input', () => {
    const positions: Vec[] = [
      [42, 34],
      [26, 33],
      [26, 35],
    ];
    const candidates = [
      { index: 0, d: 2 },
      { index: 2, d: 15 },
      { index: 1, d: 14 },
    ];
    const before = structuredClone(candidates);
    expect(selectPressRoles(candidates, positions, [26, 34])).toEqual({ presser: 0, cover: 1 });
    expect(
      selectPressRoles(
        [
          { index: 0, d: 2 },
          { index: 2, d: 14 },
          { index: 1, d: 14 },
        ],
        positions,
        [26, 34],
      ),
    ).toEqual({ presser: 0, cover: 1 });
    expect(candidates).toEqual(before);
  });

  it('keeps zero/one-candidate and presser ties deterministic', () => {
    const positions: Vec[] = [
      [0, 0],
      [0, 0],
    ];
    expect(selectPressRoles([], positions, [0, 0])).toEqual({ presser: -1, cover: -1 });
    expect(selectPressRoles([{ index: 1, d: 2 }], positions, [0, 0])).toEqual({
      presser: 1,
      cover: -1,
    });
    expect(
      selectPressRoles(
        [
          { index: 1, d: 2 },
          { index: 0, d: 2 },
        ],
        positions,
        [0, 0],
      ),
    ).toEqual({ presser: 0, cover: 1 });
    expect(pressCoverPoint([0, 34], [0, 34], GAP)).toEqual([0, 34]);
  });

  const excluded: [string, (state: StageState, index: number) => void][] = [
    [
      'explicit order',
      (s, i) => {
        s.orders.set(i, { target: s.bodies[i].pos, pace: 'walk' });
      },
    ],
    [
      'explicit cue',
      (s, i) => {
        s.cues.set(i, { target: s.bodies[i].pos, pace: 'walk' });
      },
    ],
    [
      'beaten recovery',
      (s, i) => {
        s.beaten.set(i, s.t + 3);
      },
    ],
    [
      'absent player',
      (s, i) => {
        s.fixture.present = s.fixture.players.map((p) => p.index !== i);
      },
    ],
    [
      'keeper',
      (s, i) => {
        s.fixture.players[i].slot = 0;
      },
    ],
  ];
  it.each(excluded)('%s stays excluded even when standing exactly in cover', (_name, change) => {
    const s = scene();
    change(s.state, s.cover);
    expect(actualCover(s)).not.toContain(s.cover);
  });

  it('retains the existing reach gate and does not add cover outside the press zone', () => {
    const s = scene();
    s.state.tight = false;
    s.state.fixture.players[s.cover].pressing = 0;
    s.state.fixture.teams[0].style = 'counter';
    const snapshot = positionsOf(s.state);
    expect(isPressRole(s.state, 0, s.cover, snapshot)).toBe(false);
    s.state.live = false;
    expect(
      s.state.fixture.teams[0].players.every(
        (p) => !isPressRole(s.state, 0, p.index, positionsOf(s.state)),
      ),
    ).toBe(true);
  });
});
