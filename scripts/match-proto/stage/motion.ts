// Bounded movement: a body moves toward a target at a speed it is given, accelerating and braking
// within `PROTO_CONFIG.motion`, so no player ever teleports or outruns his pace (ARCH-7: movement
// presents settled beats, it never decides them). Pure apart from `advanceBody`'s documented
// mutation of the body it moves.
import { PROTO_CONFIG } from '../core/config.ts';
import type { PlayerSpec, Vec } from '../core/types.ts';
import { dist, len, norm, sub } from '../core/vec.ts';

export type Pace = 'walk' | 'jog' | 'run' | 'sprint';
export interface Body {
  pos: [number, number];
  vel: [number, number];
  face: [number, number];
}

const MOTION = PROTO_CONFIG.motion;

/** The speed in m/s a pace means for this player; only the sprint reads his pace attribute. */
export function paceSpeed(pace: Pace, spec: PlayerSpec): number {
  if (pace === 'sprint') return MOTION.sprintBase + (MOTION.sprintPerPace * spec.attrs.pace) / 100;
  return MOTION[pace];
}

/** One tick toward `target` at up to `speed` m/s; mutates `body`. */
export function advanceBody(body: Body, target: Vec, speed: number, dt: number): void {
  const d = dist(body.pos, target);
  const wantedSpeed = d < MOTION.arriveRadius ? 0 : Math.min(speed, d / MOTION.arriveTime);
  const dir = norm(sub(target, body.pos));
  const wanted: Vec = [dir[0] * wantedSpeed, dir[1] * wantedSpeed];
  const dv: Vec = sub(wanted, body.vel);
  const cap = (len(wanted) >= len(body.vel) ? MOTION.accel : MOTION.decel) * dt;
  const dvLen = len(dv);
  const k = dvLen > cap ? cap / dvLen : 1;
  body.vel = [body.vel[0] + dv[0] * k, body.vel[1] + dv[1] * k];
  body.pos = [body.pos[0] + body.vel[0] * dt, body.pos[1] + body.vel[1] * dt];
  if (len(body.vel) > 0.5) {
    const f = norm(body.vel);
    body.face = [f[0], f[1]];
  }
}

/** Seconds to reach `target` at `speed`, the reaction time included. */
export function timeToReach(body: Body, target: Vec, speed: number): number {
  return dist(body.pos, target) / speed + MOTION.reactTime;
}
