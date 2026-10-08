export const WATCH_SPEEDS = [1, 2, 4, 8] as const;
export const WATCH_MINUTE_MS = 4000;
/** Rendering time never advances the engine calendar. */
export function presentationAdvance(
  elapsedMs: number,
  speed: number,
  samples: number,
  minutes = 90,
) {
  return minutes > 0 ? (elapsedMs * speed * samples) / (minutes * WATCH_MINUTE_MS) : 0;
}
