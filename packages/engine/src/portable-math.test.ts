/**
 * The portable functions give the same bits on every host (→ARCH-5, ARCH-9, T358): a fixed vector
 * of arguments, edge values and the grid's pitch extremes among them, is asserted against recorded
 * bit patterns (hex of the float64) on any host. A host that gives other bits fails and prints its
 * name and every value it got, for the session that reads the CI log. Beside the bits: accuracy
 * against the host's `Math.*` within each function's documented bound plus the host's own ulp
 * (`portable-math.ts`), a few exact properties, and the match binding its table once.
 */
import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../contracts/src/match-model';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { buildGridSetup } from './grid/setup';
import { createState } from './grid/state';
import { gridKit } from './grid/testkit';
import {
  atan2,
  cos,
  exp,
  HOST_MATH,
  hypot,
  log,
  PORTABLE_MATH,
  powInt,
  sin,
  tanh,
  type MatchMath,
} from './portable-math';
import { random } from './primitives';

const HOST = `${process.platform}-${process.arch}`;
const BITS = new DataView(new ArrayBuffer(8));
/** The float64's bit pattern as 16 hex digits; any NaN as 'NaN' (payloads are not portable). */
function hex(x: number): string {
  if (Number.isNaN(x)) return 'NaN';
  BITS.setFloat64(0, x);
  return BITS.getBigUint64(0).toString(16).padStart(16, '0');
}
/** The doubles between `a` and `b`: 0 when equal (±0 count as equal), 1 for neighbours. */
function ulpsApart(a: number, b: number): number {
  if (a === b) return 0;
  const order = (x: number) => {
    BITS.setFloat64(0, x);
    const v = BITS.getBigInt64(0);
    // Doubles as integers in their numeric order: negative ones mirrored below zero.
    return v < 0n ? -(v & 0x7fffffffffffffffn) : v;
  };
  const d = order(a) - order(b);
  return Number(d < 0n ? -d : d);
}

const PI = Math.PI;

/** Recorded on darwin-arm64 (Node 26.8.1) by T358; the same on every host by construction. */
const UNARY: Record<'exp' | 'log' | 'tanh' | 'sin' | 'cos', [number, string][]> = {
  exp: [
    [0, '3ff0000000000000'],
    [-0, '3ff0000000000000'],
    [5e-324, '3ff0000000000000'],
    [-5e-324, '3ff0000000000000'],
    [1e-300, '3ff0000000000000'],
    [2 ** -30, '3ff0000000400000'],
    [-(2 ** -30), '3fefffffff800000'],
    [2 ** -28, '3ff0000001000000'],
    // Either side of 0.5·ln2 and 1.5·ln2, where the reduction changes.
    [0.34657359027997264, '3ff6a09e667f3bcc'],
    [0.3465735902799727, '3ff6a09e667f3bcd'],
    [-0.3465735902799727, '3fe6a09e667f3bcc'],
    [0.5, '3ffa61298e1e069c'],
    [1, '4005bf0a8b14576a'],
    [-1, '3fd78b56362cef38'],
    [1.0397207708399179, '4006a09e667f3bcc'],
    [-1.0397207708399179, '3fd6a09e667f3bcd'],
    [2, '401d8e64b8d4ddae'],
    [-2, '3fc152aaa3bf81cc'],
    [10, '40d5829dcf950560'],
    [-10, '3f07cd79b5647c9a'],
    [15, '4148f0ccafad2a87'],
    [-15, '3e94875ca227ec38'],
    // A lane risk at the pitch's diagonal (exp(−d/2) with d ≈ 125 m).
    [-62.5, '3a4c7946d3c1f04a'],
    [50, '44719103e4080b45'],
    [-200, '2de6061812054cfa'],
    [100, '48f3494a9b171bf5'],
    [700, '7f0d945df4f8ec8e'],
    // Either side of overflow and of the last subnormal.
    [709.782712893384, '7fefffffffffff2a'],
    [709.7827128933841, '7ff0000000000000'],
    [-745.1332191019411, '0000000000000001'],
    [-745.1332191019412, '0000000000000000'],
    [-740, '0000000000000055'],
    [-1000, '0000000000000000'],
    [1000, '7ff0000000000000'],
    [Infinity, '7ff0000000000000'],
    [-Infinity, '0000000000000000'],
    [NaN, 'NaN'],
  ],
  log: [
    [0, 'fff0000000000000'],
    [-0, 'fff0000000000000'],
    [-1, 'NaN'],
    [5e-324, 'c0874385446d71c3'],
    [1e-310, 'c0864e69394d9508'],
    [1e-300, 'c085963447f87fb5'],
    // The form draw's floor.
    [1e-6, 'c02ba18a998fffa0'],
    [0.5, 'bfe62e42fefa39ef'],
    [0.9999999999999999, 'bca0000000000000'],
    [1, '0000000000000000'],
    [1.0000000000000002, '3cafffffffffffff'],
    [1.0000001, '3e7ad7f2847b6492'],
    // Either side of the reduction's interval [√2/2, √2).
    [0.7071067811865476, 'bfd62e42fefa39ee'],
    [1.4142135623730951, '3fd62e42fefa39f0'],
    [2, '3fe62e42fefa39ef'],
    [Math.E, '3ff0000000000000'],
    [10, '40026bb1bbb55516'],
    [105, '40129da7c8333aa5'],
    [1e300, '4085963447f87fb5'],
    [1.7976931348623157e308, '40862e42fefa39ef'],
    [Infinity, '7ff0000000000000'],
    [-Infinity, 'NaN'],
    [NaN, 'NaN'],
  ],
  tanh: [
    [0, '0000000000000000'],
    [-0, '8000000000000000'],
    [5e-324, '0000000000000001'],
    [1e-20, '3bc79ca10c924223'],
    [2 ** -55, '3c80000000000000'],
    [1e-8, '3e45798ee2308c3a'],
    [0.1, '3fb983d7795f413a'],
    [-0.1, 'bfb983d7795f413a'],
    [0.5, '3fdd9353d7568af3'],
    [0.9999999999999999, '3fe85efab514f394'],
    [1, '3fe85efab514f394'],
    [-1, 'bfe85efab514f394'],
    [2, '3feed9505e1bc3d4'],
    [-3, 'bfefd77d111a0b00'],
    // A duel margin of 100 points over the saturation's 30.
    [100 / 30, '3fefeb2cf8ade994'],
    [5, '3fefff419668df11'],
    [21.9, '3ff0000000000000'],
    [22, '3ff0000000000000'],
    [30, '3ff0000000000000'],
    [-30, 'bff0000000000000'],
    [Infinity, '3ff0000000000000'],
    [-Infinity, 'bff0000000000000'],
    [NaN, 'NaN'],
  ],
  sin: [
    [0, '0000000000000000'],
    [-0, '8000000000000000'],
    [5e-324, '0000000000000001'],
    [1e-300, '01a56e1fc2f8f359'],
    [2 ** -27, '3e40000000000000'],
    [-(2 ** -26), 'be50000000000000'],
    [1e-8, '3e45798ee2308c3a'],
    [0.1, '3fb98eaecb8bcb2c'],
    [-0.1, 'bfb98eaecb8bcb2c'],
    // A full turn step (180°/s for 0.2 s) and its neighbour.
    [PI / 5, '3fe2cf2304755a5e'],
    [0.6283185307179587, '3fe2cf2304755a5f'],
    [PI / 4, '3fe6a09e667f3bcc'],
    [-PI / 4, 'bfe6a09e667f3bcc'],
    [0.7853981633974484, '3fe6a09e667f3bcd'],
    [1, '3feaed548f090cee'],
    [-1, 'bfeaed548f090cee'],
    [PI / 2, '3ff0000000000000'],
    [-PI / 2, 'bff0000000000000'],
    [2, '3fed18f6ead1b446'],
    [2.5, '3fe326af0dcfcab0'],
    [3, '3fc210386db6d55b'],
    [PI, '3ca1a62633145c07'],
    [-PI, 'bca1a62633145c07'],
    [3.2, 'bfade33739e82d32'],
    [2 * PI, 'bcb1a62633145c07'],
    [-2 * PI, '3cb1a62633145c07'],
    [10, 'bfe1689ef5f34f52'],
    [-10, '3fe1689ef5f34f52'],
    [100, 'bfe03425b78c4db8'],
    [105, 'bfef0ea002cd0aee'],
    [1e5, '3fa24daa9c527e96'],
    // Either side of 2^20·π/2, where the exact reduction takes over.
    [1647099, 'bfd4b02e5be91e9e'],
    [1647100, '3fe3e479a61836eb'],
    [-1647100, 'bfe3e479a61836eb'],
    [1e10, 'bfdf334c7896a4e3'],
    [1e22, 'bfeb453ab76bf397'],
    [1e300, 'bfea2c16b010e385'],
    [1.7976931348623157e308, '3f7452fc98b34e97'],
    [Infinity, 'NaN'],
    [-Infinity, 'NaN'],
    [NaN, 'NaN'],
  ],
  cos: [
    [0, '3ff0000000000000'],
    [-0, '3ff0000000000000'],
    [5e-324, '3ff0000000000000'],
    [1e-300, '3ff0000000000000'],
    [2 ** -27, '3ff0000000000000'],
    [-(2 ** -26), '3fefffffffffffff'],
    [1e-8, '3ff0000000000000'],
    [0.1, '3fefd712f9a817c1'],
    [-0.1, '3fefd712f9a817c1'],
    [PI / 5, '3fe9e3779b97f4a8'],
    [0.6283185307179587, '3fe9e3779b97f4a7'],
    [PI / 4, '3fe6a09e667f3bcd'],
    [-PI / 4, '3fe6a09e667f3bcd'],
    [0.7853981633974484, '3fe6a09e667f3bcc'],
    [1, '3fe14a280fb5068c'],
    [-1, '3fe14a280fb5068c'],
    [PI / 2, '3c91a62633145c07'],
    [-PI / 2, '3c91a62633145c07'],
    [2, 'bfdaa22657537205'],
    [2.5, 'bfe9a2f7ef858b7d'],
    [3, 'bfefae04be85e5d2'],
    [PI, 'bff0000000000000'],
    [-PI, 'bff0000000000000'],
    [3.2, 'bfeff207e2b9cbb6'],
    [2 * PI, '3ff0000000000000'],
    [-2 * PI, '3ff0000000000000'],
    [10, 'bfead9ac890c6b1f'],
    [-10, 'bfead9ac890c6b1f'],
    [100, '3feb981dbf665fdf'],
    [105, 'bfced7bf021286ce'],
    [1e5, 'bfeffac3841b3da7'],
    [1647099, '3fee4831257a62da'],
    [1647100, '3fe910d18d26c0d4'],
    [-1647100, '3fe910d18d26c0d4'],
    [1e10, '3febf098901c931a'],
    [1e22, '3fe0be2cef01c8f4'],
    [1e300, 'bfe2699022adc4c1'],
    [1.7976931348623157e308, 'bfefffe62ecfab75'],
    [Infinity, 'NaN'],
    [-Infinity, 'NaN'],
    [NaN, 'NaN'],
  ],
};

const BINARY: Record<'atan2' | 'hypot' | 'powInt', [number, number, string][]> = {
  atan2: [
    [0, 0, '0000000000000000'],
    [-0, 0, '8000000000000000'],
    [0, -0, '400921fb54442d18'],
    [-0, -0, 'c00921fb54442d18'],
    [1, 0, '3ff921fb54442d18'],
    [-1, 0, 'bff921fb54442d18'],
    [0, 1, '0000000000000000'],
    [0, -1, '400921fb54442d18'],
    [1, 1, '3fe921fb54442d18'],
    [-1, -1, 'c002d97c7f3321d2'],
    [1, -1, '4002d97c7f3321d2'],
    [-1, 1, 'bfe921fb54442d18'],
    [0.5, 1, '3fddac670561bb4f'],
    [-0.5, 1, 'bfddac670561bb4f'],
    // The goal posts from the penalty spot, and from the goal line itself.
    [3.66, 11, '3fd48e9f6b582261'],
    [-3.66, 11, 'bfd48e9f6b582261'],
    [3.66, 0, '3ff921fb54442d18'],
    [-3.66, 0, 'bff921fb54442d18'],
    [37.66 - 34, 105 - 94, '3fd48e9f6b58225b'],
    [30.34 - 34, 105 - 94, 'bfd48e9f6b582261'],
    // Corner to corner of the pitch, each quadrant.
    [68, 105, '3fe263f0748c2bf9'],
    [-68, -105, 'c00488ff3721221a'],
    [68, -105, '400488ff3721221a'],
    [-68, 105, 'bfe263f0748c2bf9'],
    [34, 105, '3fd40aba56102543'],
    [-34, 0.5, 'bff8e5c03490dfd7'],
    [1e-20, 105, '3b5cc8b0d25f6691'],
    [105, 1e-20, '3ff921fb54442d18'],
    [-105, 1e-20, 'bff921fb54442d18'],
    [1e-300, -1e300, '400921fb54442d18'],
    [-1e-300, -1e300, 'c00921fb54442d18'],
    [1e300, 1e-300, '3ff921fb54442d18'],
    [5e-324, 1, '0000000000000001'],
    [Infinity, Infinity, '3fe921fb54442d18'],
    [Infinity, -Infinity, '4002d97c7f3321d2'],
    [-Infinity, Infinity, 'bfe921fb54442d18'],
    [-Infinity, -Infinity, 'c002d97c7f3321d2'],
    [1, Infinity, '0000000000000000'],
    [-1, Infinity, '8000000000000000'],
    [1, -Infinity, '400921fb54442d18'],
    [-1, -Infinity, 'c00921fb54442d18'],
    [Infinity, 1, '3ff921fb54442d18'],
    [-Infinity, 1, 'bff921fb54442d18'],
    [NaN, 1, 'NaN'],
    [1, NaN, 'NaN'],
  ],
  hypot: [
    [0, 0, '0000000000000000'],
    [-0, 0, '0000000000000000'],
    [-0, -0, '0000000000000000'],
    [3, 4, '4014000000000000'],
    [-3, 4, '4014000000000000'],
    [4, 3, '4014000000000000'],
    [1, 1, '3ff6a09e667f3bcd'],
    [5e-324, 5e-324, '0000000000000001'],
    [5e-324, 0, '0000000000000001'],
    [1e-300, 1e-300, '01ae4e8d12762226'],
    [1e300, 1e300, '7e40e4d50f99b211'],
    [1.7976931348623157e308, 1.7976931348623157e308, '7ff0000000000000'],
    [1.7976931348623157e308, 1, '7fefffffffffffff'],
    // The pitch's diagonal and half of it.
    [105, 68, '405f462442af0e39'],
    [-105, -68, '405f462442af0e39'],
    [52.5, 34, '404f462442af0e39'],
    [1, 1e-20, '3ff0000000000000'],
    [1e-20, 1, '3ff0000000000000'],
    [0.05, 0, '3fa999999999999a'],
    [Infinity, NaN, '7ff0000000000000'],
    [NaN, -Infinity, '7ff0000000000000'],
    [NaN, 1, 'NaN'],
    [1, NaN, 'NaN'],
  ],
  powInt: [
    [1.6, 0, '3ff0000000000000'],
    [1.6, 1, '3ff999999999999a'],
    [1.6, 2, '40047ae147ae147c'],
    [1.6, 3, '4010624dd2f1a9fd'],
    [1.4, 2, '3fff5c28f5c28f5b'],
    [1.4, 3, '4005f3b645a1cabf'],
    [0.6, 3, '3fcba5e353f7ced9'],
    [0.5, 3, '3fc0000000000000'],
    [-2, 3, 'c020000000000000'],
    [0, 0, '3ff0000000000000'],
  ],
};

const UNARY_FNS = { exp, log, tanh, sin, cos };
const BINARY_FNS = { atan2, hypot, powInt };

/** Each function's documented bound in ulps of the exact value (`portable-math.ts`). */
const BOUND: Record<'exp' | 'log' | 'tanh' | 'sin' | 'cos' | 'atan2' | 'hypot', number> = {
  exp: 1,
  log: 1,
  tanh: 2.5,
  sin: 1,
  cos: 1,
  atan2: 2,
  hypot: 3.25,
};

describe('portable math (T358)', () => {
  it('gives the recorded bits for every argument of the vector', () => {
    const got: Record<string, string[]> = {};
    const mismatches: string[] = [];
    for (const [name, rows] of Object.entries(UNARY) as [keyof typeof UNARY, [number, string][]][])
      got[name] = rows.map(([x, want]) => {
        const value = hex(UNARY_FNS[name](x));
        if (value !== want) mismatches.push(`${name}(${x}) = ${value}, recorded ${want}`);
        return value;
      });
    for (const [name, rows] of Object.entries(BINARY) as [
      keyof typeof BINARY,
      [number, number, string][],
    ][])
      got[name] = rows.map(([a, b, want]) => {
        const value = hex(BINARY_FNS[name](a, b));
        if (value !== want) mismatches.push(`${name}(${a}, ${b}) = ${value}, recorded ${want}`);
        return value;
      });
    if (mismatches.length)
      console.log(
        `portable math on ${HOST} (Node ${process.version}) gave other bits:\n${mismatches.join('\n')}\nevery value it gave: ${JSON.stringify(got)}`,
      );
    expect(mismatches, `portable math bits on ${HOST}`).toEqual([]);
  });

  it(`stays within its bound plus one ulp of the host's Math.* over the grid's ranges`, () => {
    const r = random('t358:portable-math');
    const uniform = (lo: number, hi: number) => lo + (hi - lo) * r();
    const worst: Record<string, number> = {};
    const check = (name: keyof typeof BOUND, mine: number, host: number) => {
      worst[name] = Math.max(worst[name] ?? 0, ulpsApart(mine, host));
    };
    for (let i = 0; i < 4000; i++) {
      const x = uniform(-200, 50);
      check('exp', exp(x), Math.exp(x));
      const wide = uniform(-745, 709.7);
      check('exp', exp(wide), Math.exp(wide));
      const form = uniform(1e-6, 1);
      check('log', log(form), Math.log(form));
      const magnitude = 10 ** uniform(-300, 300);
      check('log', log(magnitude), Math.log(magnitude));
      const margin = uniform(-4, 4);
      check('tanh', tanh(margin), Math.tanh(margin));
      const heading = uniform(-PI, PI);
      check('sin', sin(heading), Math.sin(heading));
      check('cos', cos(heading), Math.cos(heading));
      const turn = uniform(0, PI / 5);
      check('sin', sin(turn), Math.sin(turn));
      check('cos', cos(turn), Math.cos(turn));
      const far = uniform(-1e6, 1e6);
      check('sin', sin(far), Math.sin(far));
      check('cos', cos(far), Math.cos(far));
      const [dx, dy] = [uniform(-110, 110), uniform(-110, 110)];
      check('atan2', atan2(dy, dx), Math.atan2(dy, dx));
      check('hypot', hypot(dx, dy), Math.hypot(dx, dy));
      const [big, small] = [10 ** uniform(-150, 150), 10 ** uniform(-150, 150)];
      check('hypot', hypot(big, small), Math.hypot(big, small));
    }
    for (const [name, bound] of Object.entries(BOUND))
      expect(worst[name], `${name} on ${HOST}`).toBeLessThanOrEqual(Math.floor(bound) + 1);
  });

  it('keeps the symmetries, quadrants and order of the exact functions', () => {
    const r = random('t358:properties');
    let last = -Infinity,
      previous = 0;
    const sorted = Array.from({ length: 2000 }, () => -745 + 1455 * r()).sort((a, b) => a - b);
    for (const x of sorted) {
      // exp never decreases along increasing arguments, and log undoes it within a few ulp.
      const e = exp(x);
      expect(e >= previous, `exp(${x}) after exp(${last})`).toBe(true);
      if (e > 1e-300 && e < 1e300)
        expect(Math.abs(log(e) - x)).toBeLessThan(1e-12 * Math.max(1, Math.abs(x)));
      [last, previous] = [x, e];
    }
    for (let i = 0; i < 2000; i++) {
      const x = (r() - 0.5) * 4 * PI;
      expect(sin(-x)).toBe(-sin(x));
      expect(tanh(-x)).toBe(-tanh(x));
      expect(Math.abs(tanh(x))).toBeLessThanOrEqual(1);
      expect(cos(-x)).toBe(cos(x));
      expect(Math.abs(sin(x) ** 2 + cos(x) ** 2 - 1)).toBeLessThan(4 * Number.EPSILON);
      const y = (r() - 0.5) * 220,
        z = (r() - 0.5) * 220;
      const a = atan2(y, z);
      expect(atan2(-y, z)).toBe(-a);
      // The quadrant follows the signs: y ≥ 0 gives [0, π], x ≥ 0 gives [−π/2, π/2].
      expect(a >= 0).toBe(y >= 0);
      expect(Math.abs(a) <= PI / 2).toBe(z >= 0);
      expect(Math.abs(a)).toBeLessThanOrEqual(PI);
      const h = hypot(y, z);
      expect(hypot(z, y)).toBe(h);
      expect(hypot(-y, z)).toBe(h);
      expect(h).toBeGreaterThanOrEqual(Math.max(Math.abs(y), Math.abs(z)));
    }
    expect(atan2(0, -0)).toBe(PI);
    expect(Object.is(atan2(-0, 0), -0)).toBe(true);
    expect(powInt(1.6, 3)).toBe(1.6 * 1.6 * 1.6);
  });

  it('is bound once per match: portable on the candidate model, the host Math.* before it', () => {
    const keys = (m: MatchMath) => Object.keys(m);
    expect(keys(PORTABLE_MATH)).toEqual(keys(HOST_MATH));
    expect(HOST_MATH.exp).toBe(Math.exp);
    expect(HOST_MATH.log).toBe(Math.log);
    expect(HOST_MATH.tanh).toBe(Math.tanh);
    expect(HOST_MATH.hypot).toBe(Math.hypot);
    expect(HOST_MATH.powInt(1.6, 3)).toBe(1.6 ** 3);
    expect(PORTABLE_MATH.atan2).toBe(atan2);
    const kit = gridKit(undefined, undefined, DISABLED_RELEASE);
    expect(kit.state.math).toBe(HOST_MATH);
    const candidate = buildGridSetup(kit.w, kit.f, {
      observe: false,
      recordPlayers: false,
      model: MATCH_MODEL_REVISION,
    });
    expect(createState(candidate).math).toBe(PORTABLE_MATH);
  });
});
