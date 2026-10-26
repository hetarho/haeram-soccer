/** Match-time stamps, independent of playback generation. */
export const OFFSET = [0, 45, 90, 105] as const;
export const LENGTH = [45, 45, 15, 15] as const;

export function stampAt(
  period: 1 | 2 | 3 | 4,
  t: number,
  added = Infinity,
): { minute: number; added?: number } {
  const length = LENGTH[period - 1]!;
  const m = Math.max(0, Math.min(Math.floor(t / 60), length + added - 1)) + 1;
  return {
    minute: OFFSET[period - 1]! + Math.min(m, length),
    ...(m > length ? { added: m - length } : {}),
  };
}
