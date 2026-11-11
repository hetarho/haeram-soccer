/** Small hand-written incident scripts. No world, aggregate draw or match corpus. */
import { describe, expect, it } from 'vitest';
import type { MatchScript, ScriptBeat, StagingSide } from '../../../contracts/src/match-script';
import { STAGING_CONFIG } from './config';
import { advance, createStaging, type StageFrame } from './staging';
import { formationSides } from './tactics.testkit';
import { toAttack } from './pitch';
import { speedAt } from './motion';
import { dist } from './vec';
import { stagingMetrics } from './measure';

const SCENE = STAGING_CONFIG.stage.scene;
const sidesWithSub = (slot = 6): [StagingSide, StagingSide] => {
  const sides = formationSides('possession');
  sides[0].players.push({ ...sides[0].players[slot], line: 11 });
  return sides;
};
const beat = (b: Partial<ScriptBeat>): ScriptBeat => ({
  index: 0,
  possession: 1,
  side: 0,
  phase: 'buildUp',
  move: 'test',
  kind: 'carry',
  actor: 5,
  from: [52.5, 34],
  to: [55, 34],
  loft: false,
  through: false,
  header: false,
  outcome: 'complete',
  hold: 1,
  clock: 0,
  period: 1,
  ...b,
});
const kickoff = beat({ kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] });
const script = (bs: Partial<ScriptBeat>[]): MatchScript => ({
  version: 1,
  bound: true,
  seed: 'scenes-830',
  beats: bs.map((b, index) => beat({ ...b, index })),
});
const stop = (incidents: ScriptBeat['incidents']): Partial<ScriptBeat> => ({
  kind: 'stoppage',
  actor: 0,
  clock: 3540,
  period: 2,
  incidents,
});
const position = (f: StageFrame, side: 0 | 1, line: number) =>
  f.p.find((p) => p.player.side === side && p.player.line === line);
const at = (fs: StageFrame[], t: number) => fs.find((f) => Math.abs(f.t - t) < 1e-9)!;
const play = (bs: Partial<ScriptBeat>[], sides = formationSides('possession')) => {
  const s = script(bs);
  const staging = createStaging(s, sides);
  const staged = advance(staging, Infinity);
  const metrics = stagingMetrics(staged.frames, staged.events, s, sides);
  for (const id of [
    'kinematics.maxStep',
    'kinematics.outside',
    'ball.maxSpeed',
    'ball.ownerDistance',
    'events.reception',
  ])
    expect(
      metrics.find((m) => m.id === id),
      id,
    ).toMatchObject({ pass: true });
  return { ...staged, staging };
};

describe('scripted incident scenes', () => {
  it('a substitute enters from halfway as the man off leaves, and play waits for both', () => {
    const sides = sidesWithSub();
    const p = play(
      [
        kickoff,
        stop([{ kind: 'sub', side: 0, line: 6, other: 11 }]),
        {
          kind: 'freeKick',
          actor: 11,
          receiver: 5,
          from: [50, 30],
          to: [45, 30],
          period: 2,
          clock: 3545,
        },
      ],
      sides,
    );
    expect(p.frames[0].p).toHaveLength(22);
    expect(position(p.frames[0], 0, 11)).toBeUndefined();
    const sub = p.events.find((e) => e.kind === 'sub')!;
    expect(sub.actor).toEqual({ side: 0, line: 6 });
    expect(sub.other).toEqual({ side: 0, line: 11 });
    const entry = at(p.frames, sub.t);
    expect(position(entry, 0, 6)).toBeUndefined();
    expect(dist(position(entry, 0, 11)!.at, SCENE.gate)).toBeLessThanOrEqual(SCENE.ready);
    const before = p.frames.filter((f) => f.beat === 1 && f.t < sub.t);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((f) => !f.live && !position(f, 0, 11))).toBe(true);
    const restart = p.events.find((e) => e.kind === 'restart' && e.beat === 2)!;
    expect(restart.t - before[0].t).toBeGreaterThanOrEqual(SCENE.substitution);
    expect(p.frames.filter((f) => f.t >= sub.t).every((f) => !position(f, 0, 6))).toBe(true);
    expect(p.staging.state.enteredAt![11]).toBe(3540);
    const state = p.staging.state;
    state.clock = 3600;
    expect(speedAt(state, 11, 'run')).toBeGreaterThan(speedAt(state, 5, 'run'));
    expect(sides[0].players[6].slot).toBe(6);
  });

  it.each(['red', 'secondYellow'] as const)(
    'a %s player walks off and never returns; the ten re-form',
    (card) => {
      const p = play([
        kickoff,
        stop([{ kind: card, side: 0, line: 6, reason: 'reckless' }]),
        { kind: 'carry', actor: 5, to: [65, 45], period: 2, clock: 3550 },
        { kind: 'carry', actor: 5, to: [78, 15], period: 2, clock: 3560 },
      ]);
      const e = p.events.find((e) => e.kind === 'card')!;
      expect(e.card).toBe(card);
      const leaving = p.frames.filter((f) => f.t >= e.t && position(f, 0, 6));
      expect(leaving.length).toBeGreaterThan(0);
      expect(dist(position(leaving.at(-1)!, 0, 6)!.at, SCENE.gate)).toBeLessThan(0.5);
      const after = p.frames.filter((f) => f.beat >= 2);
      expect(
        after.every(
          (f) => f.p.filter((p) => p.player.side === 0).length === 10 && !position(f, 0, 6),
        ),
      ).toBe(true);
      const last = after.at(-1)!;
      const ten = last.p.filter((p) => p.player.side === 0);
      expect(new Set(ten.map((p) => p.slot)).size).toBe(10);
      for (const a of ten) {
        expect(after.some((f) => dist(position(f, 0, a.player.line)!.at, a.at) > 0.5)).toBe(true);
        for (const b of ten) if (a !== b) expect(dist(a.at, b.at)).toBeGreaterThan(0.1);
      }
    },
  );

  it('a goalkeeper sent off is replaced by the outfielder the script names', () => {
    const p = play([
      kickoff,
      stop([{ kind: 'red', side: 0, line: 0, reason: 'dogso' }]),
      {
        kind: 'penalty',
        side: 1,
        actor: 9,
        opponent: 3,
        keeper: 3,
        from: [11, 34],
        to: [1, 34],
        outcome: 'saved',
        period: 2,
        clock: 3550,
      },
    ]);
    const save = p.events.find((e) => e.kind === 'save')!;
    expect(save.other).toEqual({ side: 0, line: 3 });
    const f = at(p.frames, save.t);
    expect(position(f, 0, 0)).toBeUndefined();
    expect(position(f, 0, 3)?.slot).toBe(0);
    expect(f.p.filter((p) => p.player.side === 0)).toHaveLength(10);
    expect(f.p.filter((p) => p.player.side === 0 && p.slot === 0)).toHaveLength(1);
  });

  it('an injured player goes down where he is and leaves before the restart', () => {
    const p = play([
      kickoff,
      stop([{ kind: 'injury', side: 0, line: 1 }]),
      {
        kind: 'freeKick',
        actor: 5,
        receiver: 6,
        from: [50, 30],
        to: [60, 30],
        period: 2,
        clock: 3550,
      },
    ]);
    const injury = p.events.find((e) => e.kind === 'injury')!;
    const down = p.frames.filter((f) => f.t > injury.t && f.t < injury.t + SCENE.injuryDown);
    expect(down.length).toBeGreaterThan(0);
    expect(down.every((f) => dist(position(f, 0, 1)!.at, injury.at) < 0.02)).toBe(true);
    const restart = p.events.find((e) => e.kind === 'restart' && e.beat === 2)!;
    expect(restart.t - injury.t).toBeGreaterThanOrEqual(SCENE.injury);
    expect(position(at(p.frames, restart.t), 0, 1)).toBeUndefined();
  });

  it('injury and replacement in one stop remove only one slot', () => {
    const p = play(
      [
        kickoff,
        stop([
          { kind: 'injury', side: 0, line: 6 },
          { kind: 'sub', side: 0, line: 6, other: 11 },
        ]),
        { kind: 'carry', actor: 11, to: [60, 30], period: 2, clock: 3550 },
      ],
      sidesWithSub(),
    );
    expect(p.events.filter((e) => ['injury', 'sub'].includes(e.kind)).map((e) => e.kind)).toEqual([
      'injury',
      'sub',
    ]);
    expect(p.frames.at(-1)!.p).toHaveLength(22);
    expect(position(p.frames.at(-1)!, 0, 11)?.slot).toBe(6);
  });

  it.each([1, 2, 3, 4] as const)(
    'a period %i penalty holds everyone but taker and keeper outside the box/arc',
    (period) => {
      const clock = [0, 0, 2700, 5400, 6300][period];
      const p = play([
        kickoff,
        {
          kind: 'penalty',
          actor: 9,
          keeper: 0,
          from: [94, 34],
          to: [105, 32],
          outcome: 'goal',
          period,
          clock: clock + 10,
        },
      ]);
      const shot = p.events.find((e) => e.kind === 'shot')!;
      expect(shot.penalty).toBe(true);
      expect(dist(toAttack(0, shot.at, period), [94, 34])).toBeLessThan(0.02);
      const f = at(p.frames, shot.t);
      expect(Math.abs(toAttack(0, position(f, 1, 0)!.at, period)[0] - 105)).toBeLessThan(0.2);
      for (const player of f.p) {
        if (
          (player.player.side === 0 && player.player.line === 9) ||
          (player.player.side === 1 && player.slot === 0)
        )
          continue;
        const point = toAttack(0, player.at, period);
        expect(point[0]).toBeLessThan(88.5);
        expect(dist(point, [94, 34])).toBeGreaterThanOrEqual(9.15);
      }
      expect(p.staging.state.score).toEqual([1, 0]);
    },
  );

  it('a shoot-out uses one end, squads at halfway and kicks separate from the score', () => {
    const p = play([
      kickoff,
      {
        kind: 'shootoutKick',
        period: 5,
        clock: 7200,
        side: 0,
        actor: 9,
        from: [94, 34],
        to: [105, 33],
        outcome: 'goal',
      },
      {
        kind: 'shootoutKick',
        period: 5,
        clock: 7225,
        side: 1,
        actor: 9,
        opponent: 0,
        from: [11, 34],
        to: [1, 34],
        outcome: 'saved',
      },
    ]);
    const shots = p.events.filter((e) => e.kind === 'shot');
    expect(shots).toHaveLength(2);
    for (const shot of shots) {
      expect(shot.shootout).toBe(true);
      expect(dist(shot.at, [11, 34])).toBeLessThan(0.02);
      const f = at(p.frames, shot.t);
      for (const player of f.p)
        if (player.slot !== 0 && !(player.player.side === shot.team && player.player.line === 9))
          expect(Math.abs(player.at[0] - 52.5)).toBeLessThan(1.2);
    }
    expect(p.events.find((e) => e.kind === 'goal')?.shootout).toBe(true);
    expect(p.staging.state.score).toEqual([0, 0]);
  });

  it('the sides change ends at half-time and every extra-time period', () => {
    const p = play(
      [1, 2, 3, 4].map((period) => ({
        ...kickoff,
        period: period as 1 | 2 | 3 | 4,
        clock: [0, 0, 2700, 5400, 6300][period],
      })),
    );
    const kicks = p.events.filter((e) => e.kind === 'kick');
    expect(kicks).toHaveLength(4);
    kicks.forEach((e, i) => {
      const f = at(p.frames, e.t);
      expect(f.period).toBe(i + 1);
      expect(position(f, 0, 0)!.at[0] < 52.5).toBe(i % 2 === 0);
      expect(position(f, 1, 0)!.at[0] > 52.5).toBe(i % 2 === 0);
    });
    expect(p.events.filter((e) => e.kind === 'whistle')).toHaveLength(4);
  });

  it('a corner leaves 2–3 attackers back and 1–2 defenders up', () => {
    const p = play([
      kickoff,
      {
        kind: 'corner',
        actor: 10,
        receiver: 9,
        from: [104.5, 0.5],
        to: [98, 34],
        loft: true,
        phase: 'setPiece',
        clock: 20,
      },
    ]);
    const restart = p.events.find((e) => e.kind === 'restart')!;
    const f = at(p.frames, restart.t);
    const back = f.p.filter((p) => p.player.side === 0 && p.slot !== 0 && p.at[0] < 65);
    const up = f.p.filter((p) => p.player.side === 1 && p.slot !== 0 && p.at[0] < 70);
    expect(back.length).toBeGreaterThanOrEqual(2);
    expect(back.length).toBeLessThanOrEqual(3);
    expect(up.length).toBeGreaterThanOrEqual(1);
    expect(up.length).toBeLessThanOrEqual(2);
  });

  it('incident chunks equal one uninterrupted performance', () => {
    const bs = [
      kickoff,
      stop([{ kind: 'sub' as const, side: 0 as const, line: 6, other: 11 }]),
      { kind: 'carry' as const, actor: 11, to: [60, 30] as const, clock: 3550, period: 2 as const },
    ];
    const whole = play(bs, sidesWithSub());
    const staging = createStaging(script(bs), sidesWithSub());
    const frames = [],
      events = [];
    for (const bound of [0, 20, 40, 60, 80, 100, Infinity]) {
      const chunk = advance(staging, bound);
      frames.push(...chunk.frames);
      events.push(...chunk.events);
    }
    expect(frames).toEqual(whole.frames);
    expect(events).toEqual(whole.events);
  });
});
