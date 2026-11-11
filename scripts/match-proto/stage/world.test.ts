import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE, ownGoal, toAttack } from '../core/pitch.ts';
import { nominalSpot } from '../core/shape.ts';
import { demoFixture } from '../core/squads.ts';
import type { Beat, Phase, TeamId, Vec } from '../core/types.ts';
import { lineOf } from '../core/types.ts';
import { add, dist, lerp, norm, scale, sub } from '../core/vec.ts';
import { assignMarks } from './mark.ts';
import { performScript } from './perform.ts';
import { posOf, scriptOf } from './script.testkit.ts';
import {
  createStage,
  defaultTarget,
  positionsOf,
  separated,
  step,
  type StageState,
} from './world.ts';

const fixture = demoFixture();
const PRESS = PROTO_CONFIG.shape.press;
const MARK = PROTO_CONFIG.shape.mark;
const MOTION = PROTO_CONFIG.motion;
const LIMITS = PROTO_CONFIG.limits.motion;

const beatOf = (team: TeamId): Beat => ({
  index: 0,
  possession: 1,
  team,
  phase: 'buildUp',
  move: 'test',
  kind: 'kickOff',
  actor: team * 11 + 9,
  receiver: team * 11 + 5,
  from: CENTRE,
  to: CENTRE,
  loft: false,
  through: false,
  header: false,
  outcome: 'complete',
  hold: 1,
});

/** A stage with `team` in possession of a loose ball at `ball` (world frame). */
const stageWith = (team: TeamId, ball: Vec, phase: Phase = 'buildUp'): StageState => {
  const state = createStage({
    seed: 'world-test',
    fixture,
    beats: [beatOf(team)],
    times: [0],
    nominalSeconds: 10,
  });
  state.team = team;
  state.phase = phase;
  state.ball.mode = 'loose';
  state.ball.owner = -1;
  state.ball.pos = [ball[0], ball[1]];
  return state;
};
const place = (state: StageState, index: number, pos: Vec): void => {
  state.bodies[index].pos = [pos[0], pos[1]];
};
/** Every outfield player of `team` far down the pitch near world x = `x`. */
const sendAway = (state: StageState, team: TeamId, x: number): void => {
  for (let slot = 1; slot <= 10; slot++) place(state, team * 11 + slot, [x, 5 + slot * 5]);
};
const baseOf = (state: StageState, index: number, snapshot: readonly Vec[]): Vec =>
  nominalSpot(
    { fixture, ball: state.ball.pos, team: state.team, phase: state.phase, positions: snapshot },
    index,
  );
const pressTarget = (team: TeamId, ref: Vec, gap: number): Vec =>
  add(ref, scale(norm(sub(ownGoal(team), ref)), gap));

describe('stage world', () => {
  it('players in possession stand on their nominal spots', () => {
    const state = stageWith(0, [60, 20], 'progression');
    // Nobody near them: a free attacker with a marker on his place steps off him (T817, mark.test.ts).
    sendAway(state, 1, 2);
    const snapshot = positionsOf(state);
    for (let i = 0; i < 11; i++) {
      expect(defaultTarget(state, i, snapshot).target).toEqual(baseOf(state, i, snapshot));
    }
    // Keepers stand on theirs too, out of possession included.
    expect(defaultTarget(state, 11, snapshot).target).toEqual(baseOf(state, 11, snapshot));
  });

  it('the nearest free defender presses and the next one covers', () => {
    const ref: Vec = [40, 34];
    const state = stageWith(1, ref);
    sendAway(state, 0, 5);
    place(state, 6, [42, 36]);
    place(state, 7, [36, 30]);
    let snapshot = positionsOf(state);
    const presser = defaultTarget(state, 6, snapshot);
    expect(presser.target[0]).toBeCloseTo(pressTarget(0, ref, PRESS.standoff)[0], 10);
    expect(presser.target[1]).toBeCloseTo(pressTarget(0, ref, PRESS.standoff)[1], 10);
    expect(presser.pace).toBe('run');
    const cover = defaultTarget(state, 7, snapshot);
    expect(cover.target[0]).toBeCloseTo(pressTarget(0, ref, PRESS.coverGap)[0], 10);
    expect(cover.pace).toBe('run');
    // A pressed beat brings the presser tight.
    state.tight = true;
    snapshot = positionsOf(state);
    expect(defaultTarget(state, 6, snapshot).target[0]).toBeCloseTo(
      pressTarget(0, ref, PRESS.tight)[0],
      10,
    );
    // A presser far from his spot sprints.
    state.tight = false;
    place(state, 6, [40, 50]);
    place(state, 7, [40, 51]);
    snapshot = positionsOf(state);
    expect(defaultTarget(state, 6, snapshot).pace).toBe('sprint');
    // A player under an order is not cast: the next free one presses.
    state.orders.set(6, { target: [0, 0], pace: 'walk' });
    snapshot = positionsOf(state);
    expect(defaultTarget(state, 7, snapshot).target[0]).toBeCloseTo(
      pressTarget(0, ref, PRESS.standoff)[0],
      10,
    );
  });

  it('a counter side does not press beyond shape.press.from', () => {
    // Team 1 (counter) defends; world x 30 is attack x 75 for it, beyond its 62.
    expect(fixture.teams[1].style).toBe('counter');
    const far = stageWith(0, [30, 34]);
    place(far, 16, [32, 34]);
    let snapshot = positionsOf(far);
    expect(
      dist(defaultTarget(far, 16, snapshot).target, pressTarget(1, [30, 34], PRESS.standoff)),
    ).toBeGreaterThan(1);
    // At attack x 55 it presses.
    const near = stageWith(0, [50, 34]);
    place(near, 16, [52, 34]);
    snapshot = positionsOf(near);
    const target = defaultTarget(near, 16, snapshot).target;
    expect(dist(target, pressTarget(1, [50, 34], PRESS.standoff))).toBeLessThan(1e-9);
  });

  it('a marker leans goal-side of a near opponent and the back line keeps its depth', () => {
    const goal = ownGoal(1);
    const markOf = (opp: Vec): Vec => add(opp, scale(norm(sub(goal, opp)), MARK.goalSide));
    /** One tick's assignment as `step` makes it, every outfield defender free to mark. */
    const assign = (state: StageState): void => {
      const snapshot = positionsOf(state);
      assignMarks(
        state,
        snapshot,
        (i) => baseOf(state, i, snapshot),
        (i) => fixture.players[i].team !== state.team && fixture.players[i].slot !== 0,
      );
    };
    // A centre-back (index 13) with an opponent 5 m from his place.
    const back = stageWith(0, [30, 34]);
    sendAway(back, 0, 5);
    const base13 = baseOf(back, 13, positionsOf(back));
    const opp9: Vec = [base13[0] - 4, base13[1] + 3];
    place(back, 9, opp9);
    assign(back);
    expect(back.marks.get(13)).toBe(9);
    let snapshot = positionsOf(back);
    const m9 = markOf(opp9);
    expect(dist(m9, goal)).toBeLessThan(dist(opp9, goal));
    const t13 = defaultTarget(back, 13, snapshot).target;
    expect(t13[0]).toBeCloseTo(base13[0], 10);
    expect(t13[1]).toBeCloseTo(base13[1] + (m9[1] - base13[1]) * MARK.blend.DF, 10);
    // A midfielder (index 17) leans in both directions.
    const mid = stageWith(0, [30, 34]);
    sendAway(mid, 0, 5);
    const base17 = baseOf(mid, 17, positionsOf(mid));
    const opp8: Vec = [base17[0] + 3, base17[1] - 2];
    place(mid, 8, opp8);
    assign(mid);
    expect(mid.marks.get(17)).toBe(8);
    snapshot = positionsOf(mid);
    const t17 = defaultTarget(mid, 17, snapshot).target;
    const want = lerp(base17, markOf(opp8), MARK.blend.MF);
    expect(t17[0]).toBeCloseTo(want[0], 10);
    expect(t17[1]).toBeCloseTo(want[1], 10);
    expect(dist(t17, goal)).toBeLessThan(dist(base17, goal));
    // Nobody within the radius: no man, his place.
    place(mid, 8, [5, 40]);
    assign(mid);
    expect(mid.marks.has(17)).toBe(false);
    snapshot = positionsOf(mid);
    expect(defaultTarget(mid, 17, snapshot).target).toEqual(baseOf(mid, 17, snapshot));
  });

  it('a ball flying out of play is pressed at the line, never beyond it', () => {
    // T800 (demo3): a cross out over the byline drew the presser to its landing point outside the
    // pitch, and braking from that sprint carried him 2.6 m past the line once play stopped.
    const state = stageWith(0, [86, 55], 'finalThird');
    state.ball.mode = 'flight';
    state.ball.flight = { from: [86, 55], to: [106.5, 28], t0: 0, t1: 2, apex: 3 };
    sendAway(state, 1, 90);
    const snapshot = positionsOf(state);
    for (let i = 12; i < 22; i++) {
      const target = defaultTarget(state, i, snapshot).target;
      expect(target[0], String(i)).toBeLessThanOrEqual(105);
    }
  });

  it('a player running at the line stops at the boards however fast he comes', () => {
    // T800 (demo): a defender sprinting after a shot into his own net braked past the line when
    // play stopped and his target flipped behind him, 2.5 m outside.
    const state = stageWith(0, [60, 34]);
    state.live = false;
    const body = state.bodies[14];
    body.pos = [104, 34];
    body.vel = [9, 0];
    state.orders.set(14, { target: [90, 34], pace: 'run' });
    for (let i = 0; i < 20; i++) {
      step(state);
      expect(body.pos[0]).toBeLessThanOrEqual(105 + PROTO_CONFIG.stage.boards + 1e-9);
    }
  });

  it('the shoulder role never jogs while his side has the ball', () => {
    // T800: jogging inside `motion.jogWithin` the poacher lagged a moving line by about 4 m.
    const state = stageWith(1, [50, 34], 'progression');
    state.t = 30;
    state.turnedAt = 0;
    const poacher = 20;
    expect(fixture.players[poacher].role).toBe('poacher');
    let snapshot = positionsOf(state);
    const spot = baseOf(state, poacher, snapshot);
    place(state, poacher, [spot[0] + 3, spot[1]]);
    snapshot = positionsOf(state);
    expect(defaultTarget(state, poacher, snapshot).pace).toBe('run');
    // Anyone else that close to his place jogs.
    const other = 18;
    const near = baseOf(state, other, snapshot);
    place(state, other, [near[0] + 3, near[1]]);
    snapshot = positionsOf(state);
    expect(defaultTarget(state, other, snapshot).pace).toBe('jog');
  });

  it('two free markers never walk onto each other', () => {
    // T800: markers picking the same attacker stood on top of each other (shape.spacing).
    const state = stageWith(1, [50, 34], 'progression');
    place(state, 6, [40, 30]);
    place(state, 7, [40.5, 30]);
    const snapshot = positionsOf(state);
    for (const [me, mate] of [
      [6, 7],
      [7, 6],
    ] as const) {
      const target = separated(state, me, snapshot[mate], snapshot);
      expect(dist(target, snapshot[mate])).toBeGreaterThanOrEqual(
        PROTO_CONFIG.stage.separation - 1e-9,
      );
    }
    // The ball's owner keeps his target.
    state.ball.owner = 6;
    expect(separated(state, 6, snapshot[7], snapshot)).toEqual(snapshot[7]);
  });

  it('free teammates leave stage.ownerRoom around the man on the ball', () => {
    const state = stageWith(0, [50, 34], 'progression');
    sendAway(state, 0, 90);
    place(state, 5, [50, 34]);
    state.ball.owner = 5;
    place(state, 6, [46, 34]);
    place(state, 7, [60, 20]);
    state.orders.set(7, { target: [60, 20], pace: 'walk' });
    place(state, 8, [64, 20]);
    const snapshot = positionsOf(state);
    const room = PROTO_CONFIG.stage.ownerRoom;
    // A target 1 m from the man on the ball.
    const target = separated(state, 6, [49, 34], snapshot);
    expect(dist(target, snapshot[5])).toBeGreaterThanOrEqual(room - 0.01);
    // A target 1 m from a teammate under an order.
    const beside = separated(state, 8, [61, 20], snapshot);
    expect(dist(beside, snapshot[7])).toBeGreaterThanOrEqual(room - 0.01);
  });

  it('a defender is not moved by the owner’s room', () => {
    const state = stageWith(1, [50, 34], 'progression');
    sendAway(state, 0, 90);
    place(state, 16, [50, 34]);
    state.ball.owner = 16;
    place(state, 6, [46, 34]);
    place(state, 7, [52, 34]);
    state.orders.set(7, { target: [52, 34], pace: 'walk' });
    const snapshot = positionsOf(state);
    // 3 m from a teammate under an order: beyond stage.separation, inside stage.ownerRoom.
    expect(separated(state, 6, [49, 34], snapshot)).toEqual([49, 34]);
    const near = separated(state, 6, [51, 34], snapshot);
    expect(dist(near, snapshot[7])).toBeCloseTo(PROTO_CONFIG.stage.separation, 9);
  });

  describe('after a long pass across the pitch (T816)', () => {
    // Kick-off, then the anchor switches play 33 m to the right-back in his own half, where the
    // counter side does not press, so every outfield player but the two in the pass is free. The
    // anchor plays it almost at once (hold 0.3 s): the man on the ball carries it while he holds
    // (`stage.holdMove`), and a longer carry would set the players near him moving before the kick.
    const LONG = scriptOf(fixture, [
      { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
      { kind: 'pass', actor: 5, receiver: 4, to: [38, 62], loft: true, hold: 0.3 },
      { kind: 'carry', actor: 4, to: [44, 62], hold: 3 },
    ]);
    const long = performScript(LONG, { duration: 20 });
    const kick = long.events.find((e) => e.kind === 'kick' && e.beat === 1);
    if (!kick) throw new Error('no kick of the long pass');
    const at = long.frames.findIndex((f) => Math.abs(f.t - kick.t) < 1e-9);
    const speedAt = (f: number, i: number): number =>
      dist(posOf(long.frames[f - 1], i), posOf(long.frames[f], i)) / PROTO_CONFIG.tick;
    /** Outfield players without an order during the flight (everyone but the passer and receiver). */
    const free = fixture.players.filter((p) => p.slot !== 0 && p.index !== 5 && p.index !== 4);

    it('the long pass is a long one', () => {
      expect(dist([45, 30], [38, 62])).toBeGreaterThanOrEqual(30);
      expect(at).toBeGreaterThan(0);
    });

    it('after a long pass the free players start at different moments', () => {
      const starts: number[] = [];
      for (const p of free) {
        if (lineOf(p.position) === 'DF') continue;
        for (let f = at + 1; f < long.frames.length; f++) {
          if (speedAt(f, p.index) > LIMITS.go) {
            starts.push(f);
            break;
          }
        }
      }
      expect(starts.length).toBeGreaterThanOrEqual(3);
      const span = (Math.max(...starts) - Math.min(...starts)) * PROTO_CONFIG.tick;
      expect(span).toBeGreaterThanOrEqual(0.3);
      expect(new Set(starts).size).toBeGreaterThanOrEqual(3);
    });

    it('the back four stay one line while the ball travels', () => {
      const defenders = fixture.players.filter((p) => p.team === 1 && lineOf(p.position) === 'DF');
      expect(defenders).toHaveLength(4);
      let read = 0;
      for (const frame of long.frames) {
        if (frame.t < 5 || !frame.live) continue;
        const xs = defenders.map((p) => toAttack(1, posOf(frame, p.index))[0]);
        expect(Math.max(...xs) - Math.min(...xs), String(frame.t)).toBeLessThanOrEqual(2);
        read += 1;
      }
      expect(read).toBeGreaterThan(20);
    });

    it('one second after a long pass some free players walk while others run', () => {
      const f = at + Math.round(1 / PROTO_CONFIG.tick);
      const moving = free.map((p) => speedAt(f, p.index)).filter((speed) => speed > LIMITS.go);
      expect(moving.some((speed) => speed < MOTION.jog - 0.5)).toBe(true);
      expect(moving.some((speed) => speed > MOTION.jog + 0.5)).toBe(true);
    });
  });

  it('a player under an order keeps his place on his body', () => {
    const state = stageWith(0, [50, 34], 'progression');
    state.ball.mode = 'held';
    state.ball.owner = 5;
    const i = 7;
    state.orders.set(i, { target: [70, 50], pace: 'run' });
    for (let k = 0; k < 3; k++) {
      step(state);
      expect(state.minds[i].place).toEqual(state.bodies[i].pos);
    }
  });

  it('nobody presses or marks while the ball is dead', () => {
    const state = stageWith(1, [40, 34]);
    place(state, 6, [42, 36]);
    place(state, 7, [36, 30]);
    state.live = false;
    const snapshot = positionsOf(state);
    for (let i = 0; i < 22; i++) {
      expect(defaultTarget(state, i, snapshot).target).toEqual(baseOf(state, i, snapshot));
    }
  });
});
