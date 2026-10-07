import type { Fixture, World } from '../../contracts/src/types';

export const SEASON_ROUNDS = 46;
export const ROUND_INTERVAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The clock is part of the world; browser wall time never affects outcomes. */
export function currentDay(w: World) {
  return w.calendar?.day ?? w.round * ROUND_INTERVAL_DAYS;
}
export function seasonLength(w: World) {
  return (Date.UTC(w.year + 1, 7, 1) - Date.UTC(w.year, 7, 1)) / DAY_MS;
}
export function fixtureDay(f: Fixture) {
  return f.round * ROUND_INTERVAL_DAYS - (f.kind === 'europe' ? 3 : 0);
}
function dateLabel(year: number, day: number) {
  const date = new Date(Date.UTC(year, 7, 1) + day * DAY_MS);
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}
export function seasonDate(w: World) {
  return dateLabel(w.year, currentDay(w));
}
export function fixtureDate(_w: World, f: Fixture) {
  return dateLabel(f.year, fixtureDay(f));
}
export function nextOwnFixture(w: World) {
  return [...w.fixtures, ...w.europe.flatMap((t) => t.fixtures)]
    .filter(
      (f) =>
        !f.score &&
        f.year === w.year &&
        f.round <= SEASON_ROUNDS &&
        (f.home === w.playerClub || f.away === w.playerClub),
    )
    .sort((a, b) => fixtureDay(a) - fixtureDay(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}
export function daysUntilNextMatch(w: World) {
  const next = nextOwnFixture(w);
  return next ? Math.max(0, fixtureDay(next) - currentDay(w)) : undefined;
}
