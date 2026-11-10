import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { demoFixture } from '../core/squads.ts';
import type { Vec } from '../core/types.ts';
import { dist, len, sub } from '../core/vec.ts';
import { advanceBody, paceSpeed, timeToReach, type Body } from './motion.ts';

const MOTION = PROTO_CONFIG.motion;
const DT = PROTO_CONFIG.tick;
const still = (pos: Vec): Body => ({ pos: [pos[0], pos[1]], vel: [0, 0], face: [1, 0] });

describe('stage motion', () => {
  it('advanceBody never exceeds the speed it is given', () => {
    for (const speed of [1.8, 3.8, 6, 8.5]) {
      const body = still([10, 10]);
      const targets: Vec[] = [
        [40, 30],
        [5, 60],
        [90, 2],
      ];
      for (const target of targets) {
        for (let i = 0; i < 60; i++) {
          const before: Vec = [body.pos[0], body.pos[1]];
          advanceBody(body, target, speed, DT);
          expect(len(body.vel)).toBeLessThanOrEqual(speed + 1e-9);
          expect(dist(before, body.pos)).toBeLessThanOrEqual(speed * DT + 1e-9);
        }
      }
    }
  });

  it('it settles on the target', () => {
    const body = still([0, 0]);
    const target: Vec = [20, 0];
    for (let i = 0; i < 5 / DT; i++) advanceBody(body, target, 6, DT);
    expect(dist(body.pos, target)).toBeLessThan(0.3);
    expect(len(body.vel)).toBeLessThan(0.3);
  });

  it('acceleration and braking stay inside motion.accel and motion.decel', () => {
    const body = still([0, 0]);
    const plan: { target: Vec; speed: number; ticks: number }[] = [
      { target: [30, 0], speed: 8, ticks: 25 },
      { target: [0, 0], speed: 8, ticks: 25 },
      { target: [10, 20], speed: 3.8, ticks: 30 },
      { target: [10, 20], speed: 0, ticks: 20 },
    ];
    for (const { target, speed, ticks } of plan) {
      for (let i = 0; i < ticks; i++) {
        const v0: Vec = [body.vel[0], body.vel[1]];
        advanceBody(body, target, speed, DT);
        const dv = len(sub(body.vel, v0));
        expect(dv).toBeLessThanOrEqual(Math.max(MOTION.accel, MOTION.decel) * DT + 1e-9);
        if (len(body.vel) > len(v0) + 1e-9) {
          expect(dv).toBeLessThanOrEqual(MOTION.accel * DT + 1e-9);
        }
      }
    }
  });

  it('timeToReach adds the reaction time', () => {
    const body = still([0, 0]);
    expect(timeToReach(body, [12, 0], 6)).toBeCloseTo(2 + MOTION.reactTime, 10);
    expect(timeToReach(body, [0, 0], 6)).toBeCloseTo(MOTION.reactTime, 10);
  });

  it('a sprint reads the pace attribute, the other paces do not', () => {
    const fixture = demoFixture();
    const fast = fixture.players[10];
    expect(paceSpeed('sprint', fast)).toBeCloseTo(
      MOTION.sprintBase + (MOTION.sprintPerPace * fast.attrs.pace) / 100,
      10,
    );
    expect(paceSpeed('jog', fast)).toBe(MOTION.jog);
  });
});
