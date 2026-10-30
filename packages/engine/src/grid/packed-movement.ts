import { cos, sin } from '../portable-math';
import type { GRID_MOVEMENT_CONFIG, Mover } from './movement';
import { createMovementKernel, MOVEMENT_KERNEL_STRIDE } from './movement-kernel';

/** Execution threshold only; not an outcome-changing match-lab tunable. */
const PACKED_MOVEMENT_CONFIG = { minimumSteps: 4 } as const;
export interface PackedMover {
  gp: Mover;
  to: readonly [number, number];
  hold: readonly [number, number];
  vmax: number;
  holdUntil: number;
}
type Config = typeof GRID_MOVEMENT_CONFIG;
let kernel: ReturnType<typeof createMovementKernel> | null | undefined;
let busy = false;

/** One bounded numeric slab per realm; failure disables it for this worker's lifetime. */
function getKernel() {
  return (kernel ??= createMovementKernel());
}

/**
 * Pack once after every target is fixed, move within a private numeric slab, then commit once.
 * No callback observes an intermediate step. Until all steps succeed, live positions/velocities
 * are untouched; a failed kernel can therefore replay the original scalar loop safely.
 * Layout: x,y,vx,vy,target-x,target-y,hold-x,hold-y,vmax,hold-until (shared stride).
 */
export function tryPackedMovement(
  movers: readonly PackedMover[],
  dt: number,
  C: Config,
  pitch: { length: number; width: number },
  fullCos: number,
  fullSin: number,
  onStep?: (seconds: number) => void,
): boolean {
  if (onStep || busy || kernel === null || !Number.isFinite(dt) || !(C.step > 0)) return false;
  const whole = Math.floor(dt / C.step + 1e-9);
  if (whole < PACKED_MOVEMENT_CONFIG.minimumSteps || !movers.length) return false;
  busy = true;
  try {
    const phase = getKernel();
    if (!phase || movers.length * MOVEMENT_KERNEL_STRIDE > phase.data.length) return false;
    const data = phase.data;
    for (let i = 0; i < movers.length; i++) {
      const m = movers[i]!,
        p = m.gp.pos,
        v = m.gp.vel;
      const at = i * MOVEMENT_KERNEL_STRIDE;
      data[at] = p[0];
      data[at + 1] = p[1];
      data[at + 2] = v?.[0] ?? 0;
      data[at + 3] = v?.[1] ?? 0;
      data[at + 4] = m.to[0];
      data[at + 5] = m.to[1];
      data[at + 6] = m.hold[0];
      data[at + 7] = m.hold[1];
      data[at + 8] = m.vmax;
      data[at + 9] = m.holdUntil;
      let magnitude = 0;
      for (let k = 0; k < MOVEMENT_KERNEL_STRIDE; k++) magnitude += Math.abs(data[at + k]!);
      if (!Number.isFinite(magnitude)) return false;
    }
    const rest = dt - whole * C.step;
    for (let i = 0; i <= whole; i++) {
      const h = i < whole ? C.step : rest;
      if (h <= 1e-9) break;
      const full = h === C.step,
        turn = C.turn * (Math.PI / 180) * h;
      phase.step(
        movers.length,
        h,
        i * C.step,
        full ? fullCos : cos(turn),
        full ? fullSin : sin(turn),
        C.acceleration,
        C.braking,
        C.arrive,
        pitch.length,
        pitch.width,
        C.step,
      );
    }
    for (let i = 0; i < movers.length; i++) {
      const gp = movers[i]!.gp,
        at = i * MOVEMENT_KERNEL_STRIDE;
      gp.pos[0] = data[at]!;
      gp.pos[1] = data[at + 1]!;
      const v = (gp.vel ??= [0, 0]);
      v[0] = data[at + 2]!;
      v[1] = data[at + 3]!;
    }
    return true;
  } catch {
    kernel = null;
    return false;
  } finally {
    busy = false;
  }
}
