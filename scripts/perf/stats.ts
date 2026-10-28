/** The statistics of the paired A/B bench (`ab.mjs`, →ARCH-34). */

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
}

export function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * A trimmed mean (an eighth off each end once there are 8 values): one process whose copies drew an
 * unlucky layout must not decide the call (seen 261028: one grid process at ×1.09 among ±2%).
 */
export function trimmed(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 8);
  return mean(s.slice(k, s.length - k));
}

export interface Verdict {
  ratio: number;
  lo: number;
  hi: number;
  call: 'faster' | 'slower' | 'no difference';
}

/**
 * The call on per-process log-ratios (candidate over baseline): their trimmed mean with a 95%
 * percentile bootstrap, from a fixed seed so a rerun on the same numbers agrees. "faster" needs the
 * whole interval below 1.
 */
export function verdict(logs: readonly number[]): Verdict {
  let s = 0x9e3779b9;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const boots: number[] = [];
  for (let i = 0; i < 10000; i++)
    boots.push(trimmed(logs.map(() => logs[Math.floor(rnd() * logs.length)]!)));
  boots.sort((a, b) => a - b);
  const r = (x: number) => Number(x.toFixed(4));
  const lo = Math.exp(boots[249]!),
    hi = Math.exp(boots[9749]!);
  return {
    ratio: r(Math.exp(trimmed(logs))),
    lo: r(lo),
    hi: r(hi),
    call: hi < 1 ? 'faster' : lo > 1 ? 'slower' : 'no difference',
  };
}
