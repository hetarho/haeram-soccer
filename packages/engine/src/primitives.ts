export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function random(seed: string) {
  let state = hash(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
export function integer(r: () => number, min: number, max: number) {
  return Math.floor(r() * (max - min + 1)) + min;
}
export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
export function ratio(value: string, numerator: bigint, denominator: bigint): string {
  if (denominator <= 0n) throw new Error('Invalid denominator');
  const n = BigInt(value) * numerator;
  const sign = n < 0n ? -1n : 1n;
  const abs = n * sign;
  let q = abs / denominator;
  const rem = abs % denominator;
  if (rem * 2n > denominator || (rem * 2n === denominator && q % 2n === 1n)) q++;
  return (q * sign).toString();
}
export const zeroMetrics = () => Array<number>(12).fill(0);
export function addMetrics(a: number[], b: number[]) {
  return a.map((v, i) => v + (b[i] || 0));
}

export function compareIds(a: string, b: string) {
  return a === b ? 0 : a < b ? -1 : 1;
}
