/**
 * Host-portable transcendental functions for the candidate grid engine (→ARCH-5, ARCH-9, T358).
 *
 * The host's `Math.exp`, `Math.log`, `Math.tanh`, `Math.sin`, `Math.cos`, `Math.atan2` and `**` are
 * its C library compiled per CPU (on arm64 with fused multiply-adds), and `Math.hypot` differs
 * between JavaScript engines, so the same match gave other last bits, and once other facts, on
 * linux-x64 than on darwin-arm64, and another recorded scene in Firefox and WebKit than in Node.
 * These are built only from IEEE-754 basic operations (`+ − × ÷`, `Math.sqrt`), exact sign
 * operations (`Math.abs`, negation) and exact integer and bit operations, in a fixed order:
 * JavaScript (and Dart) round every one of them correctly and never fuse two, so they give the
 * same bits on every host, engine and port.
 *
 * The algorithms are fdlibm's as FreeBSD's msun carries them (Sun Microsystems, 1993; the
 * polynomial and reduction constants are fdlibm's, written as their bit patterns): `exp` from
 * e_exp.c, `log` from e_log.c, `tanh` from s_tanh.c with s_expm1.c; `sin` and `cos` from s_sin.c
 * and s_cos.c with k_sin.c, k_cos.c and the medium Cody–Waite reduction of e_rem_pio2.c, larger
 * arguments reduced exactly with `BigInt` against 1,280 bits of 2/π; `atan2` from e_atan2.c and
 * s_atan.c. `hypot` is V8's own two-argument algorithm (normalised by the larger magnitude, one
 * Kahan step that is exact for two terms, the root times the larger), so on V8 it gives
 * `Math.hypot`'s bits, and the same bits elsewhere, without the argument array V8's builtin
 * allocates. `powInt` multiplies a whole power out left to right.
 *
 * Accuracy: the largest error against the exact value, measured for T358 against references
 * computed exactly in `BigInt` (400 fraction bits, π to 1,700) on 200,000 random arguments a range,
 * is 0.87 ulp for `exp` on [−745, 709.7] (0.84 on the grid's [−200, 50]); 0.81 ulp for `log` on
 * the form draw's (10⁻⁶, 1] and 0.70 over 10^±307; 2.09 ulp for `tanh` (fdlibm's own, the host's
 * reached 2.02 on the same ranges) on the duels' [−4, 4], on [−25, 25] and on 10⁻¹²…1; 0.78 ulp
 * for `sin` and `cos` on [−2π, 2π], on (0, π/5], on [−10⁶, 10⁶] and up to 10³⁰⁰ (the grid's
 * carry headings lie within ±π, its turns within (0, π/5]); 1.42 ulp for `atan2` on pitch
 * offsets (both coordinates within ±110 m) and 1.26 over magnitudes 10^±20; 1.91 ulp for `hypot`
 * (V8's algorithm; its error analysis bounds it by 3.25). The documented bounds are 1 ulp for
 * `exp`, `log`, `sin` and `cos`, 2 for `atan2`, 2.5 for `tanh` and 3.25 for `hypot`;
 * `portable-math.test.ts` records the bits of a fixed vector and holds each function within its
 * bound plus one ulp (the host's own error) of `Math.*`.
 */

/** Big-endian bit access on every host: offset 0 is the high word. */
const BITS = new DataView(new ArrayBuffer(8));
function highWord(x: number): number {
  BITS.setFloat64(0, x);
  return BITS.getUint32(0);
}
function lowWord(x: number): number {
  BITS.setFloat64(0, x);
  return BITS.getUint32(4);
}
/** The double whose bit pattern is `hi`:`lo` (fdlibm's constants as it writes them). */
function fromWords(hi: number, lo: number): number {
  BITS.setUint32(0, hi);
  BITS.setUint32(4, lo);
  return BITS.getFloat64(0);
}

/** 2^k for every normal exponent k in [−1022, 1023], by exact doubling and halving. */
const POW2 = new Float64Array(2046);
POW2[1022] = 1;
for (let k = 1; k <= 1023; k++) POW2[1022 + k] = POW2[1021 + k]! * 2;
for (let k = 1; k <= 1022; k++) POW2[1022 - k] = POW2[1023 - k]! * 0.5;
const pow2 = (k: number) => POW2[k + 1022]!;

// exp (e_exp.c)
const EXP_OVER = fromWords(0x40862e42, 0xfefa39ef); // 709.78…: above it exp overflows
const EXP_UNDER = fromWords(0xc0874910, 0xd52d3051); // −745.13…: below it exp is 0
const EXP_BIG = fromWords(0x40862e42, 0); // |x| from here may overflow or underflow
const HALF_LN2 = fromWords(0x3fd62e43, 0); // the first |x| above 0.5·ln2's high word
const THREE_HALVES_LN2 = fromWords(0x3ff0a2b2, 0); // 1.5·ln2's high word
const EXP_TINY = fromWords(0x3e300000, 0); // 2^-28
const LN2_HI = fromWords(0x3fe62e42, 0xfee00000);
const LN2_LO = fromWords(0x3dea39ef, 0x35793c76);
const INV_LN2 = fromWords(0x3ff71547, 0x652b82fe);
const P1 = fromWords(0x3fc55555, 0x5555553e);
const P2 = fromWords(0xbf66c16c, 0x16bebd93);
const P3 = fromWords(0x3f11566a, 0xaf25de2c);
const P4 = fromWords(0xbebbbd41, 0xc5d26bf1);
const P5 = fromWords(0x3e663769, 0x72bea4d0);
const TWO_M1000 = pow2(-1000);

/** e^x: x = k·ln2 + r with |r| ≤ 0.5·ln2, a rational approximation of e^r, then 2^k exactly. */
export function exp(x: number): number {
  const ax = Math.abs(x);
  if (!(ax < EXP_BIG)) {
    if (x !== x) return x + x;
    if (ax === Infinity) return x > 0 ? x : 0;
    if (x > EXP_OVER) return Infinity;
    if (x < EXP_UNDER) return 0;
  }
  let hi = 0,
    lo = 0,
    k = 0,
    r = x;
  if (ax >= HALF_LN2) {
    if (ax < THREE_HALVES_LN2) {
      if (x < 0) {
        hi = x + LN2_HI;
        lo = -LN2_LO;
        k = -1;
      } else {
        hi = x - LN2_HI;
        lo = LN2_LO;
        k = 1;
      }
    } else {
      k = (INV_LN2 * x + (x < 0 ? -0.5 : 0.5)) | 0;
      hi = x - k * LN2_HI; // exact: k·LN2_HI has at most 53 bits
      lo = k * LN2_LO;
    }
    r = hi - lo;
  } else if (ax < EXP_TINY) return 1 + x;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((r * c) / (c - 2) - r);
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  if (k >= -1021) return k > 1023 ? y * 2 * pow2(1023) : y * pow2(k);
  // A subnormal result: one rounding, by 2^-1000 after the exact part of the scale.
  return y * pow2(k + 1000) * TWO_M1000;
}

// log (e_log.c)
const TWO54 = fromWords(0x43500000, 0);
const LG1 = fromWords(0x3fe55555, 0x55555593);
const LG2 = fromWords(0x3fd99999, 0x9997fa04);
const LG3 = fromWords(0x3fd24924, 0x94229359);
const LG4 = fromWords(0x3fcc71c5, 0x1d8e78af);
const LG5 = fromWords(0x3fc74664, 0x96cb03de);
const LG6 = fromWords(0x3fc39a09, 0xd078c69f);
const LG7 = fromWords(0x3fc2f112, 0xdf3e5244);

/** ln x: x = 2^k·(1 + f) with √2/2 < 1 + f < √2, then ln(1 + f) from s = f/(2 + f). */
export function log(x: number): number {
  let hx = highWord(x) | 0;
  let k = 0;
  if (hx < 0x00100000) {
    // Zero, negative or subnormal.
    if (((hx & 0x7fffffff) | lowWord(x)) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = highWord(x) | 0;
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  // x or x/2 brought into [√2/2, √2).
  const f = fromWords(hx | (i ^ 0x3ff00000), lowWord(x)) - 1;
  k += i >> 20;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : k * LN2_HI + k * LN2_LO;
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    return k === 0 ? f - R : k * LN2_HI - (R - k * LN2_LO - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1;
  if (((hx - 0x6147a) | (0x6b851 - hx)) > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return k * LN2_HI - (hfsq - (s * (hfsq + R) + k * LN2_LO) - f);
  }
  if (k === 0) return f - s * (f - R);
  return k * LN2_HI - (s * (f - R) - k * LN2_LO - f);
}

// expm1 (s_expm1.c), for tanh
const EXPM1_BIG = fromWords(0x4043687a, 0); // 56·ln2: below −56·ln2 e^x − 1 rounds to −1
const EXPM1_TINY = fromWords(0x3c900000, 0); // 2^-54
const Q1 = fromWords(0xbfa11111, 0x111110f4);
const Q2 = fromWords(0x3f5a01a0, 0x19fe5585);
const Q3 = fromWords(0xbf14ce19, 0x9eaadbb7);
const Q4 = fromWords(0x3ed0cfca, 0x86e65239);
const Q5 = fromWords(0xbe8afdb7, 0x6e09c32d);

/** e^x − 1 without cancellation near 0: the reduction of `exp`, a rational kernel, then 2^k. */
function expm1(x: number): number {
  const ax = Math.abs(x);
  const negative = x < 0;
  if (!(ax < EXPM1_BIG)) {
    if (!(ax < EXP_BIG)) {
      if (x !== x) return x + x;
      if (ax === Infinity) return negative ? -1 : x;
      if (x > EXP_OVER) return Infinity;
    }
    if (negative) return -1;
  }
  let hi = 0,
    lo = 0,
    k = 0,
    c = 0,
    r = x;
  if (ax >= HALF_LN2) {
    if (ax < THREE_HALVES_LN2) {
      if (negative) {
        hi = x + LN2_HI;
        lo = -LN2_LO;
        k = -1;
      } else {
        hi = x - LN2_HI;
        lo = LN2_LO;
        k = 1;
      }
    } else {
      k = (INV_LN2 * x + (negative ? -0.5 : 0.5)) | 0;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    r = hi - lo;
    c = hi - r - lo;
  } else if (ax < EXPM1_TINY) return x;
  const hfx = 0.5 * r;
  const hxs = r * hfx;
  const r1 = 1 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  const t = 3 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6 - r * t));
  if (k === 0) return r - (r * e - hxs);
  e = r * (e - c) - c;
  e -= hxs;
  if (k === -1) return 0.5 * (r - e) - 0.5;
  if (k === 1) return r < -0.25 ? -2 * (e - (r + 0.5)) : 1 + 2 * (r - e);
  if (k <= -2 || k > 56) {
    const y = 1 - (e - r);
    return (k > 1023 ? y * 2 * pow2(1023) : y * pow2(k)) - 1;
  }
  if (k < 20) return (1 - pow2(-k) - (e - r)) * pow2(k);
  return (r - (e + pow2(-k)) + 1) * pow2(k);
}

const TANH_BIG = fromWords(0x40360000, 0); // 22: from here tanh rounds to ±1
const TANH_TINY = fromWords(0x3c800000, 0); // 2^-55

/** tanh x from e^{2|x|} − 1 (s_tanh.c). */
export function tanh(x: number): number {
  const ax = Math.abs(x);
  if (!(ax < Infinity)) return x !== x ? x + x : x > 0 ? 1 : -1;
  let z: number;
  if (ax < TANH_BIG) {
    if (ax < TANH_TINY) return x * (1 + x);
    if (ax >= 1) z = 1 - 2 / (expm1(2 * ax) + 2);
    else {
      const t = expm1(-2 * ax);
      z = -t / (t + 2);
    }
  } else z = 1;
  return x < 0 ? -z : z;
}

// sin and cos kernels on [−π/4, π/4] (k_sin.c, k_cos.c)
const S1 = fromWords(0xbfc55555, 0x55555549);
const S2 = fromWords(0x3f811111, 0x1110f8a6);
const S3 = fromWords(0xbf2a01a0, 0x19c161d5);
const S4 = fromWords(0x3ec71de3, 0x57b1fe7d);
const S5 = fromWords(0xbe5ae5e6, 0x8a2b9ceb);
const S6 = fromWords(0x3de5d93a, 0x5acfd57c);
const C1 = fromWords(0x3fa55555, 0x5555554c);
const C2 = fromWords(0xbf56c16c, 0x16c15177);
const C3 = fromWords(0x3efa01a0, 0x19cb1590);
const C4 = fromWords(0xbe927e4f, 0x809c52ad);
const C5 = fromWords(0x3e21ee9e, 0xbdb4b1c4);
const C6 = fromWords(0xbda8fae9, 0xbe8838d4);

/** sin(x) for |x| ≤ π/4 given exactly. */
function sinPoly(x: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  return x + v * (S1 + z * r);
}
/** sin(x + y) for a reduced |x + y| ≤ π/4, y the tail of x. */
function sinKernel(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}
/** cos(x + y) for |x + y| ≤ π/4, y the tail of x (0 when x is exact). */
function cosKernel(x: number, y: number): number {
  const z = x * x;
  let w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  w = 1 - hz;
  return w + (1 - w - hz + (z * r - x * y));
}

// Reduction by π/2 (e_rem_pio2.c): x = n·π/2 + (Y0 + Y1), the reduced part as a head and a tail.
const INV_PIO2 = fromWords(0x3fe45f30, 0x6dc9c883);
const PIO2_1 = fromWords(0x3ff921fb, 0x54400000); // the first 33 bits of π/2
const PIO2_1T = fromWords(0x3dd0b461, 0x1a626331); // π/2 − PIO2_1
const PIO2_2 = fromWords(0x3dd0b461, 0x1a600000); // the next 33 bits
const PIO2_2T = fromWords(0x3ba3198a, 0x2e037073);
const PIO2_3 = fromWords(0x3ba3198a, 0x2e000000); // and the 33 after them
const PIO2_3T = fromWords(0x397b839a, 0x252049c1);
const TO_INT = 6755399441055744; // 1.5·2^52: adding and subtracting it rounds to an integer
/** floor(2^1280 · 2/π), computed by Machin's formula; it starts as fdlibm's `two_over_pi`. */
const TWO_OVER_PI = BigInt(
  '0xa2f9836e4e441529fc2757d1f534ddc0db6295993c439041fe5163abdebbc561b7246e3a424dd2e006492eea09d1921cfe1deb1cb129a73ee88235f52ebb4484e99c7026b45f7e413991d639835339f49c845f8bbdf9283b1ff897ffde05980fef2f118b5a0a6d1f6d367ecf27cb09b74f463f669e5fea2d7527bac7ebe5f17b3d0739f78a5292ea6bfb5fb11f8d5d0856033046fc7b6babf0cfbc209af4361d',
);
/** floor(2^192 · π/2). */
const PIO2_BIG = BigInt('0x1921fb54442d18469898cc51701b839a252049c1114cf98e8');
const ONE_192 = 1n << 192n;
const HALF_192 = 1n << 191n;
const TWO_M384 = pow2(-384);

let Y0 = 0,
  Y1 = 0;

/** n with x − n·π/2 in Y0 + Y1; `ix` is |x|'s high word, above π/4's and finite. */
function remPio2(x: number, ix: number): number {
  if (ix >= 0x413921fb) return remPio2Large(x);
  // |x| < 2^20·π/2: n·PIO2_1 and n·PIO2_2 are exact, three steps cover every cancellation.
  const fn = x * INV_PIO2 + TO_INT - TO_INT;
  const n = fn | 0;
  let r = x - fn * PIO2_1;
  let w = fn * PIO2_1T;
  const j = ix >>> 20;
  let y0 = r - w;
  if (j - ((highWord(y0) >>> 20) & 0x7ff) > 16) {
    let t = r;
    w = fn * PIO2_2;
    r = t - w;
    w = fn * PIO2_2T - (t - r - w);
    y0 = r - w;
    if (j - ((highWord(y0) >>> 20) & 0x7ff) > 49) {
      t = r;
      w = fn * PIO2_3;
      r = t - w;
      w = fn * PIO2_3T - (t - r - w);
      y0 = r - w;
    }
  }
  Y0 = y0;
  Y1 = r - y0 - w;
  return n;
}

/**
 * The exact reduction of a large |x| (at least 2^20·π/2): x = m·2^e with an integer m, so x·2/π
 * is m times the bits of 2/π from the right place, to 192 bits past the point; the nearest
 * quadrant leaves at least 2^-62 (the worst case of all doubles), so the reduced part keeps more
 * than 120 correct bits before it is rounded to a head and a tail.
 */
function remPio2Large(x: number): number {
  const hi = highWord(x);
  const m = (BigInt((hi & 0xfffff) | 0x100000) << 32n) | BigInt(lowWord(x));
  const e = ((hi >>> 20) & 0x7ff) - 1075;
  const q = (m * TWO_OVER_PI) >> BigInt(1280 - 192 - e);
  let n = Number((q >> 192n) & 7n);
  let f = q & (ONE_192 - 1n);
  if (f >= HALF_192) {
    f -= ONE_192;
    n = (n + 1) & 7;
  }
  const y = f * PIO2_BIG; // the reduced part times 2^384
  const head = Number(y);
  const tail = Number(y - BigInt(head));
  const sign = x < 0 ? -1 : 1;
  Y0 = sign * head * TWO_M384;
  Y1 = sign * tail * TWO_M384;
  return sign * n;
}

/** sin x. */
export function sin(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e500000) return x; // |x| < 2^-26
    return sinPoly(x);
  }
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x, ix);
  switch (n & 3) {
    case 0:
      return sinKernel(Y0, Y1);
    case 1:
      return cosKernel(Y0, Y1);
    case 2:
      return -sinKernel(Y0, Y1);
    default:
      return -cosKernel(Y0, Y1);
  }
}

/** cos x. */
export function cos(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e46a09e) return 1; // |x| < 2^-27·√2
    return cosKernel(x, 0);
  }
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x, ix);
  switch (n & 3) {
    case 0:
      return cosKernel(Y0, Y1);
    case 1:
      return -sinKernel(Y0, Y1);
    case 2:
      return -cosKernel(Y0, Y1);
    default:
      return sinKernel(Y0, Y1);
  }
}

// atan (s_atan.c) and atan2 (e_atan2.c)
const ATAN_HI = Float64Array.of(
  fromWords(0x3fddac67, 0x0561bb4f), // atan(0.5)
  fromWords(0x3fe921fb, 0x54442d18), // atan(1)
  fromWords(0x3fef730b, 0xd281f69b), // atan(1.5)
  fromWords(0x3ff921fb, 0x54442d18), // atan(∞)
);
const ATAN_LO = Float64Array.of(
  fromWords(0x3c7a2b7f, 0x222f65e2),
  fromWords(0x3c81a626, 0x33145c07),
  fromWords(0x3c700788, 0x7af0cbbd),
  fromWords(0x3c91a626, 0x33145c07),
);
const AT0 = fromWords(0x3fd55555, 0x5555550d);
const AT1 = fromWords(0xbfc99999, 0x9998ebc4);
const AT2 = fromWords(0x3fc24924, 0x920083ff);
const AT3 = fromWords(0xbfbc71c6, 0xfe231671);
const AT4 = fromWords(0x3fb745cd, 0xc54c206e);
const AT5 = fromWords(0xbfb3b0f2, 0xaf749a6d);
const AT6 = fromWords(0x3fb10d66, 0xa0d03d51);
const AT7 = fromWords(0xbfadde2d, 0x52defd9a);
const AT8 = fromWords(0x3fa97b4b, 0x24760deb);
const AT9 = fromWords(0xbfa2b444, 0x2c6a6c2f);
const AT10 = fromWords(0x3f90ad3a, 0xe322da11);
const PI_O_4 = fromWords(0x3fe921fb, 0x54442d18);
const PI_O_2 = fromWords(0x3ff921fb, 0x54442d18);
const PI = fromWords(0x400921fb, 0x54442d18);
const PI_LO = fromWords(0x3ca1a626, 0x33145c07); // π − PI

/** atan x: x reduced against 0.5, 1, 1.5 or ∞ by the matching identity, then a polynomial. */
function atan(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  let id: number;
  let v = x;
  if (ix >= 0x44100000) {
    // |x| ≥ 2^66
    if (x !== x) return x + x;
    return hx >>> 31 ? -ATAN_HI[3]! - ATAN_LO[3]! : ATAN_HI[3]! + ATAN_LO[3]!;
  }
  if (ix < 0x3fdc0000) {
    // |x| < 0.4375
    if (ix < 0x3e200000) return x; // |x| < 2^-29
    id = -1;
  } else {
    v = Math.abs(x);
    if (ix < 0x3ff30000) {
      // |x| < 1.1875
      if (ix < 0x3fe60000) {
        // 7/16 ≤ |x| < 11/16
        id = 0;
        v = (2 * v - 1) / (2 + v);
      } else {
        id = 1;
        v = (v - 1) / (v + 1);
      }
    } else if (ix < 0x40038000) {
      // |x| < 2.4375
      id = 2;
      v = (v - 1.5) / (1 + 1.5 * v);
    } else {
      id = 3;
      v = -1 / v;
    }
  }
  const z = v * v;
  const w = z * z;
  // The odd and even halves of the polynomial in z.
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) return v - v * (s1 + s2);
  const r = ATAN_HI[id]! - (v * (s1 + s2) - ATAN_LO[id]! - v);
  return hx >>> 31 ? -r : r;
}

/** atan2(y, x): the angle of (x, y) in (−π, π], with `Math.atan2`'s signed zeros and infinities. */
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return x + y;
  if (x === 1) return atan(y);
  const hx = highWord(x);
  const hy = highWord(y);
  const ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  // 2·sign(x) + sign(y), the signs of zeros included.
  const m = (hy >>> 31) | ((hx >>> 30) & 2);
  if (y === 0) return m < 2 ? y : m === 2 ? PI : -PI;
  if (x === 0) return hy >>> 31 ? -PI_O_2 : PI_O_2;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000)
      return m === 0 ? PI_O_4 : m === 1 ? -PI_O_4 : m === 2 ? 3 * PI_O_4 : -3 * PI_O_4;
    return m === 0 ? 0 : m === 1 ? -0 : m === 2 ? PI : -PI;
  }
  if (iy === 0x7ff00000) return hy >>> 31 ? -PI_O_2 : PI_O_2;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60)
    z = PI_O_2 + 0.5 * PI_LO; // |y/x| > 2^60
  else if (hx >>> 31 && k < -60)
    z = 0; // |y|/x < −2^-60
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

/**
 * √(x² + y²) as V8 computes `Math.hypot(x, y)`: both magnitudes over the larger, whose square is
 * exactly 1, the sum's root times the larger; no overflow or underflow in between.
 */
export function hypot(x: number, y: number): number {
  const a = Math.abs(x);
  const b = Math.abs(y);
  if (a === Infinity || b === Infinity) return Infinity;
  if (a !== a || b !== b) return NaN;
  const max = a > b ? a : b;
  if (max === 0) return 0;
  const p = a / max;
  const q = b / max;
  return Math.sqrt(p * p + q * q) * max;
}

/** x^n for a small whole n ≥ 0, multiplied out left to right (1·x·x·…). */
export function powInt(x: number, n: number): number {
  let v = 1;
  for (let i = 0; i < n; i++) v *= x;
  return v;
}

/**
 * The functions a match's outcome-critical positions, distances and odds read (→ARCH-9), bound
 * once per match on its state, so a hot loop reads one table instead of branching per call.
 */
export interface MatchMath {
  readonly exp: (x: number) => number;
  readonly log: (x: number) => number;
  readonly tanh: (x: number) => number;
  readonly sin: (x: number) => number;
  readonly cos: (x: number) => number;
  readonly atan2: (y: number, x: number) => number;
  readonly hypot: (x: number, y: number) => number;
  /** `x ** n` for a small whole n ≥ 0. */
  readonly powInt: (x: number, n: number) => number;
}

/** The host's own `Math.*`: the pre-feature path, whose settled facts must not change. */
export const HOST_MATH: MatchMath = {
  exp: Math.exp,
  log: Math.log,
  tanh: Math.tanh,
  sin: Math.sin,
  cos: Math.cos,
  atan2: Math.atan2,
  hypot: Math.hypot,
  powInt: (x, n) => x ** n,
};

/** The portable functions above: the candidate path, the same bits on every host. */
export const PORTABLE_MATH: MatchMath = { exp, log, tanh, sin, cos, atan2, hypot, powInt };
