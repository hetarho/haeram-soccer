import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRID_MOVEMENT_CONFIG as C, stepToward } from './movement';
import { cos, sin } from '../portable-math';
import { random } from '../primitives';
import { PITCH } from './pitch';
import type { PackedMover } from './packed-movement';

const turn = C.turn * (Math.PI / 180) * C.step,
  fullCos = cos(turn),
  fullSin = sin(turn);
function mover(): PackedMover {
  return {
    gp: { pos: [10, 10], vel: [0, 0] },
    to: [40, 30],
    hold: [10, 10],
    holdUntil: 0,
    vmax: 6,
  };
}
function oracle(movers: PackedMover[], dt: number) {
  const whole = Math.floor(dt / C.step + 1e-9),
    rest = dt - whole * C.step;
  for (let i = 0; i <= whole; i++) {
    const h = i < whole ? C.step : rest;
    if (h <= 1e-9) break;
    for (const m of movers)
      stepToward(m.gp, i * C.step + 1e-9 < m.holdUntil ? m.hold : m.to, m.vmax, h);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('./movement-kernel');
  vi.resetModules();
});
describe('optional packed movement', () => {
  it('matches independent scalar substeps exactly across finite kinematics and hold boundaries', async () => {
    const { tryPackedMovement } = await import('./packed-movement');
    const r = random('packed-oracle-vectors');
    for (let group = 0; group < 128; group++) {
      const movers = Array.from({ length: 22 }, (_, i): PackedMover => {
        const pos: [number, number] = [r() * PITCH.length, r() * PITCH.width],
          vel: [number, number] = [(r() - 0.5) * 15, (r() - 0.5) * 15];
        const to: [number, number] = [r() * PITCH.length, r() * PITCH.width];
        if (i % 8 === 0) {
          to[0] = pos[0];
          to[1] = pos[1];
          vel[0] = vel[1] = -0;
        }
        if (i % 8 === 1) {
          to[0] = pos[0];
          to[1] = pos[1];
        }
        if (i % 8 === 2) {
          to[0] = Math.min(PITCH.length, pos[0] + 0.001);
          to[1] = pos[1];
          vel[0] = 0.001;
          vel[1] = 0;
        }
        if (i % 8 === 3) vel[0] = vel[1] = 0;
        return {
          gp: { pos, vel },
          to,
          hold: [...pos],
          holdUntil: i % 3 === 0 ? 0.4 : 0,
          vmax: 1 + r() * 8,
        };
      });
      for (const dt of [4, 4.06, 2.39999999, 1.8001]) {
        const expected = structuredClone(movers);
        oracle(expected, dt);
        expect(tryPackedMovement(movers, dt, C, PITCH, fullCos, fullSin)).toBe(true);
        expect(movers).toEqual(expected);
      }
    }
  });
  it('declines observers, short phases, non-finite inputs and capacity overflow without writes', async () => {
    const { tryPackedMovement } = await import('./packed-movement');
    const m = mover(),
      before = structuredClone(m);
    expect(tryPackedMovement([m], 4, C, PITCH, fullCos, fullSin, () => {})).toBe(false);
    expect(tryPackedMovement([m], 0.2, C, PITCH, fullCos, fullSin)).toBe(false);
    expect(m).toEqual(before);
    m.to = [Infinity, 0];
    const invalid = structuredClone(m);
    expect(tryPackedMovement([m], 4, C, PITCH, fullCos, fullSin)).toBe(false);
    expect(m).toEqual(invalid);
    expect(
      tryPackedMovement(Array.from({ length: 820 }, mover), 4, C, PITCH, fullCos, fullSin),
    ).toBe(false);
  });
  it('works without Wasm under the existing deployment policy', async () => {
    vi.stubGlobal('WebAssembly', undefined);
    const { tryPackedMovement } = await import('./packed-movement');
    const m = mover(),
      expected = structuredClone(m);
    oracle([expected], 4);
    expect(tryPackedMovement([m], 4, C, PITCH, fullCos, fullSin)).toBe(true);
    expect(m).toEqual(expected);
  });
  it('creates an absent velocity exactly as the scalar path does, including a standing mover', async () => {
    const { tryPackedMovement } = await import('./packed-movement');
    const movers = [mover(), mover()];
    for (const m of movers) delete m.gp.vel;
    movers[1]!.to = [...movers[1]!.gp.pos];
    const expected = structuredClone(movers);
    oracle(expected, 4.06);
    expect(tryPackedMovement(movers, 4.06, C, PITCH, fullCos, fullSin)).toBe(true);
    expect(movers).toEqual(expected);
  });
  it('caches a slab allocation failure rather than retrying every phase', async () => {
    let allocations = 0;
    vi.doMock('./movement-kernel', async (original) => {
      const leaf = await original<typeof import('./movement-kernel')>();
      return {
        ...leaf,
        createMovementKernel: () => {
          allocations++;
          throw new Error('allocation failed');
        },
      };
    });
    const { tryPackedMovement } = await import('./packed-movement');
    const m = mover(),
      before = structuredClone(m);
    expect(tryPackedMovement([m], 4, C, PITCH, fullCos, fullSin)).toBe(false);
    expect(m).toEqual(before);
    expect(tryPackedMovement([m], 4, C, PITCH, fullCos, fullSin)).toBe(false);
    expect(allocations).toBe(1);
  });
  it('can replay the scalar loop after a mid-phase failure, with no partial live mutation', async () => {
    let calls = 0;
    vi.doMock('./movement-kernel', async (original) => {
      const leaf = await original<typeof import('./movement-kernel')>();
      return {
        ...leaf,
        createMovementKernel: () => {
          const kernel = leaf.createMovementKernel();
          return {
            data: kernel.data,
            step: (...values: Parameters<typeof kernel.step>) => {
              if (++calls === 2) throw new Error('step failed');
              kernel.step(...values);
            },
          };
        },
      };
    });
    const { tryPackedMovement } = await import('./packed-movement');
    const m = mover(),
      before = structuredClone(m),
      expected = structuredClone(m);
    expect(tryPackedMovement([m], 4, C, PITCH, fullCos, fullSin)).toBe(false);
    expect(m).toEqual(before);
    oracle([m], 4);
    oracle([expected], 4);
    expect(m).toEqual(expected);
    expect(tryPackedMovement([mover()], 4, C, PITCH, fullCos, fullSin)).toBe(false);
    expect(calls).toBe(2);
  });
  it('declines reentrant packing without corrupting the outer scratch phase', async () => {
    const { tryPackedMovement } = await import('./packed-movement');
    const m = mover(),
      expected = structuredClone(m),
      point = m.gp.pos,
      inner: boolean[] = [];
    Object.defineProperty(m.gp, 'pos', {
      get() {
        inner.push(tryPackedMovement([mover()], 4, C, PITCH, fullCos, fullSin));
        return point;
      },
    });
    expect(tryPackedMovement([m], 4, C, PITCH, fullCos, fullSin)).toBe(true);
    oracle([expected], 4);
    expect(m.gp.pos).toEqual(expected.gp.pos);
    expect(inner.length).toBeGreaterThan(0);
    // Reading after completion can succeed; only reads made during the outer phase must decline.
    expect(inner.slice(0, -1).every((x) => x === false)).toBe(true);
  });
});
