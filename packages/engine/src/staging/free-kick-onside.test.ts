import { describe, expect, it } from 'vitest';
import { receiverHold } from './pass';
import { computeMetrics } from './metrics';
import { HALFWAY, toAttack } from './pitch';
import { offsideLineX } from './places';
import { demoFixture } from './squads.testkit';
import { beats, performScript, posOf, scriptOf } from './script.testkit';
import { formationSides, formedStage } from './tactics.testkit';
import { positionsOf } from './world';
import type { Beat, Playback, TeamId, Vec } from './types';

function waiting(team: TeamId, period: 1 | 2 = 1) {
  const state = formedStage(formationSides('balanced', 'balanced'));
  state.fixture.period = period;
  state.team = team;
  const actor = team * 11 + 5;
  const receiver = team * 11 + 9;
  const point = (x: number, y = 34): [number, number] => [...toAttack(team, [x, y], period)];
  state.ball.pos = point(35);
  state.fixture.teams[team === 0 ? 1 : 0].players.forEach((p, i) => {
    state.bodies[p.index].pos = point(p.slot === 0 ? 100 : 65 - i, 4 + i * 5);
  });
  state.bodies[receiver].pos = point(80);
  const beat = beats(state.fixture, [
    { team, kind: 'freeKick', actor, receiver, to: point(90) },
  ])[0];
  const held = receiverHold(state, beat, receiver, beat.to);
  const target = (): Vec => {
    const at = held.order!.target;
    return typeof at === 'function' ? at() : at;
  };
  const rx = (p: Vec) => toAttack(team, p, period)[0];
  return { state, beat, held, receiver, point, target, rx };
}

const consistency = (p: Playback) => computeMetrics(p).find((m) => m.id === 'offside.consistency')!;

function delivery(team: TeamId, kind: 'freeKick' | 'pass' = 'freeKick'): Playback {
  const actor = team * 11 + 5;
  const receiver = team * 11 + 9;
  const p = (x: number, y = 34): Vec => toAttack(team, [x, y]);
  return performScript(
    scriptOf(demoFixture(), [
      { team, kind: 'kickOff', actor: team * 11 + 8, receiver: actor, to: p(35) },
      { team, kind, actor, receiver, to: p(92, 28), hold: 3, possession: 2 },
    ]),
  );
}

/** Corrupt only the receiver's kick-instant position to check the observer, without changing facts. */
function illegalKick(source: Playback, kind: Beat['kind']): Playback {
  const p = structuredClone(source);
  const beat = p.beats[1];
  beat.kind = kind;
  const kick = p.events.find((e) => e.kind === 'kick' && e.beat === beat.index)!;
  const frame = p.frames.find((f) => Math.abs(f.t - kick.t) < 1e-9)!;
  const line = offsideLineX(
    p.fixture,
    Array.from({ length: 22 }, (_, i) => posOf(frame, i)),
    beat.team,
  );
  const receiver = toAttack(beat.team, [Math.max(HALFWAY + 5, line + 5), 28]);
  const ball = toAttack(beat.team, [35, 34]);
  frame.p[beat.receiver! * 2] = receiver[0];
  frame.p[beat.receiver! * 2 + 1] = receiver[1];
  frame.ball = [ball[0], ball[1], 0];
  return p;
}

describe('free-kick receiver timing', () => {
  it.each([
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
  ] as const)(
    'side %s in period %s waits at the live line, then reacts to it moving',
    (team, period) => {
      const { state, held, receiver, point, target, rx } = waiting(team, period);
      const before = rx(target());
      const line = offsideLineX(state.fixture, positionsOf(state), team);
      expect(before).toBeLessThan(line);
      expect(held.onside()).toBe(false);
      for (const p of state.fixture.teams[team === 0 ? 1 : 0].players) {
        if (p.slot === 0) continue;
        const [x, y] = toAttack(team, state.bodies[p.index].pos, period);
        state.bodies[p.index].pos = point(x - 5, y);
      }
      expect(rx(target())).toBeCloseTo(before - 5, 6);
      state.bodies[receiver].pos = [...target()];
      expect(held.onside()).toBe(true);
    },
  );

  it('a receiver behind the ball or in his own half need not retreat behind defenders', () => {
    const { state, held, receiver, point, target, rx } = waiting(0);
    state.ball.pos = point(91);
    state.bodies[receiver].pos = point(89);
    expect(held.onside()).toBe(true);
    expect(rx(target())).toBeGreaterThan(80);
    state.ball.pos = point(35);
    state.bodies[receiver].pos = point(50);
    expect(held.onside()).toBe(true);
  });

  it.each(['corner', 'goalKick', 'throwIn'] as const)(
    '%s keeps its direct-reception exemption',
    (kind) => {
      const { state, beat, receiver, point } = waiting(0);
      const held = receiverHold(state, { ...beat, kind }, receiver, point(90));
      expect(held.order?.target).toEqual(point(90));
      expect(held.onside()).toBe(true);
      expect(consistency(illegalKick(delivery(0), kind))).toMatchObject({ value: 0, pass: true });
    },
  );

  it.each([0, 1] as const)(
    'side %s is onside at a real free-kick kick and runs after it',
    (team) => {
      const p = delivery(team);
      const beat = p.beats[1];
      const settled = p.events.find((e) => e.kind === 'settled' && e.beat === 1)!;
      const waiting = p.frames.find((f) => Math.abs(f.t - settled.t) < 1e-9)!;
      const waitingLine = offsideLineX(
        p.fixture,
        Array.from({ length: 22 }, (_, i) => posOf(waiting, i)),
        team,
      );
      expect(toAttack(team, posOf(waiting, beat.receiver!))[0]).toBeLessThanOrEqual(waitingLine);
      const kick = p.events.find((e) => e.kind === 'kick' && e.beat === 1)!;
      const receive = p.events.find((e) => e.kind === 'receive' && e.beat === 1)!;
      const frame = p.frames.find((f) => Math.abs(f.t - kick.t) < 1e-9)!;
      const last = p.frames.find((f) => Math.abs(f.t - receive.t) < 1e-9)!;
      const rx = toAttack(team, posOf(frame, beat.receiver!))[0];
      const bx = toAttack(team, [frame.ball[0], frame.ball[1]])[0];
      const line = offsideLineX(
        p.fixture,
        Array.from({ length: 22 }, (_, i) => posOf(frame, i)),
        team,
      );
      expect(rx <= Math.max(line, bx) + 0.05 || rx <= HALFWAY).toBe(true);
      expect(toAttack(team, posOf(last, beat.receiver!))[0]).toBeGreaterThan(rx);
      expect(consistency(p)).toMatchObject({ value: 0, pass: true });
      expect(delivery(team)).toEqual(p);
    },
  );

  it('the observer detects an illegal free-kick receiver at the kick', () => {
    expect(consistency(illegalKick(delivery(0), 'freeKick'))).toMatchObject({
      value: 1,
      pass: false,
    });
  });

  it('a recorded free-kick offside remains called', () => {
    const p = performScript(
      scriptOf(demoFixture(), [
        { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
        {
          kind: 'freeKick',
          actor: 5,
          receiver: 8,
          to: [84, 16],
          through: true,
          outcome: 'offside',
          hold: 1.4,
        },
      ]),
    );
    expect(p.events.filter((e) => e.kind === 'offside')).toHaveLength(1);
    expect(consistency(p)).toMatchObject({ value: 0, pass: true });
  });

  it('ordinary legal passes and recorded offside still follow their own outcomes', () => {
    expect(consistency(delivery(0, 'pass'))).toMatchObject({ value: 0, pass: true });
    const fixture = demoFixture();
    const p = performScript(
      scriptOf(fixture, [
        { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
        {
          kind: 'pass',
          actor: 5,
          receiver: 8,
          to: [84, 16],
          through: true,
          outcome: 'offside',
          hold: 1.4,
        },
      ]),
    );
    expect(p.events.filter((e) => e.kind === 'offside')).toHaveLength(1);
    expect(consistency(p)).toMatchObject({ value: 0, pass: true });
  });
});
