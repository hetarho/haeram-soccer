/** The last season played before the war and the season league football restarts with. */
export const WARTIME = { last: 1938, restart: 1946 } as const;

/** The season after `year`'s: 1946/47 after 1938/39, otherwise the next one. */
export function seasonAfter(year: number) {
  return year === WARTIME.last ? WARTIME.restart : year + 1;
}
/** The first season played from `year` on: the restart for a season the war skips. */
export function seasonFrom(year: number) {
  return year > WARTIME.last && year < WARTIME.restart ? WARTIME.restart : year;
}
