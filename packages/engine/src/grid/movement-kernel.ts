import { hypot } from '../portable-math';

/**
 * The scalar stepToward expressions on a numeric slab (T618), preserving their grouping and
 * branch order. Targets are already fixed; no orchestration, callbacks, RNG or live objects.
 * x,y,vx,vy,target-x,target-y,hold-x,hold-y,vmax,hold-until; one bounded 64 KiB slab per realm.
 */
export const MOVEMENT_KERNEL_STRIDE = 10;
export const MOVEMENT_KERNEL_VALUES = 8192;
export function createMovementKernel() {
  const data = new Float64Array(MOVEMENT_KERNEL_VALUES);
  return {
    data,
    step(
      count: number,
      h: number,
      t: number,
      c: number,
      s: number,
      acceleration: number,
      braking: number,
      arrive: number,
      length: number,
      width: number,
      step: number,
    ) {
      for (let i = 0; i < count; i++) {
        const at = i * MOVEMENT_KERNEL_STRIDE;
        let x = data[at]!,
          y = data[at + 1]!,
          vx = data[at + 2]!,
          vy = data[at + 3]!;
        const hold = t + 1e-9 < data[at + 9]!;
        const tx = data[at + (hold ? 6 : 4)]!,
          ty = data[at + (hold ? 7 : 5)]!;
        if (vx === 0 && vy === 0 && x === tx && y === ty) continue;
        const dx = tx - x,
          dy = ty - y;
        const dist = hypot(dx, dy);
        const speed = vx === 0 && vy === 0 ? 0 : hypot(vx, vy);
        if (dist <= arrive && speed <= braking * step + 1e-9) {
          x = tx;
          y = ty;
          vx = vy = 0;
        } else {
          const ux = dist > 0 ? dx / dist : speed > 0 ? vx / speed : 1;
          const uy = dist > 0 ? dy / dist : speed > 0 ? vy / speed : 0;
          let hx = ux,
            hy = uy,
            aligned = true;
          if (speed > 1e-9) {
            const cx = vx / speed,
              cy = vy / speed;
            if (cx * ux + cy * uy < c) {
              aligned = false;
              const ss = (cx * uy - cy * ux >= 0 ? 1 : -1) * s;
              hx = cx * c - cy * ss;
              hy = cx * ss + cy * c;
            }
          }
          const facing = aligned ? 1 : Math.max(0, hx * ux + hy * uy);
          const stop = braking * (Math.sqrt((h * h) / 4 + (2 * dist) / braking) - h / 2);
          const want = Math.min(data[at + 8]!, stop) * facing;
          const next =
            want > speed
              ? Math.min(want, speed + acceleration * h)
              : Math.max(want, speed - braking * h);
          vx = hx * next;
          vy = hy * next;
          if (dist > 0 && aligned && next * h >= dist) {
            x = tx;
            y = ty;
          } else {
            x = Math.max(0, Math.min(length, x + vx * h));
            y = Math.max(0, Math.min(width, y + vy * h));
          }
        }
        data[at] = x;
        data[at + 1] = y;
        data[at + 2] = vx;
        data[at + 3] = vy;
      }
    },
  };
}
