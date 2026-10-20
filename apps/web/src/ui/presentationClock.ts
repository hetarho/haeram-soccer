export const WATCH_SPEEDS = [1, 2, 4, 8, 16] as const;
export const WATCH_MINUTE_MS = 4000;

/**
 * Where each minute starts on the 1x presentation clock, in ms, then where the last one ends: a
 * minute takes 4000 ms × its pace (→WEB-32), so busy minutes last longer and quiet ones less.
 */
export function paceStarts(paces: number[]) {
  const starts = [0];
  for (const pace of paces) starts.push(starts.at(-1)! + Math.max(0, pace) * WATCH_MINUTE_MS);
  return starts;
}

/** The minute position (index plus the share of it played) `ms` into the 1x clock. */
export function presentationAt(starts: number[], ms: number) {
  const minutes = starts.length - 1;
  if (minutes <= 0 || ms <= 0) return 0;
  if (ms >= starts[minutes]!) return minutes;
  let low = 0,
    high = minutes - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid]! <= ms) low = mid;
    else high = mid - 1;
  }
  const span = starts[low + 1]! - starts[low]!;
  return low + (span > 0 ? (ms - starts[low]!) / span : 1);
}

/** The 1x clock time of a minute position: the inverse of `presentationAt`, used by seeking. */
export function presentationTime(starts: number[], position: number) {
  const minutes = starts.length - 1;
  if (minutes <= 0 || position <= 0) return 0;
  if (position >= minutes) return starts[minutes]!;
  const i = Math.floor(position);
  return starts[i]! + (position - i) * (starts[i + 1]! - starts[i]!);
}

/**
 * The minute position after `elapsedMs` of real time at `speed`: a minute takes
 * 4000 ms × pace / speed. Rendering time never advances the engine calendar.
 */
export function presentationAdvance(elapsedMs: number, speed: number, paces: number[]) {
  return presentationAt(paceStarts(paces), elapsedMs * speed);
}
