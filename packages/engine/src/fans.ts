import type { Club, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { clubOf, stature } from './world';

/**
 * Supporters follow a club's standing, not its stadium (→ECON-23). Every league round they move
 * 3% of the way toward the following its reputation commands (about 2,000 at reputation 12,
 * 47,000 at 50, 360,000 at 75 and 1.2 million at 90); a win adds 0.4% on top, a defeat costs
 * 0.1%, and 해외 마케팅 and campaigns started before rules 1.19 add their own. There is no ceiling, and the following itself
 * pays nothing: only the local supporters within the club's catchment come to the gate.
 */
export const FAN_CONFIG = {
  base: 800,
  growth: 1.085,
  drift: 0.03,
  win: 0.004,
  loss: 0.001,
};
export const MIN_FANS = 200;
/** The following a reputation commands, which supporters drift toward. */
export function fanFollowing(reputation: number) {
  return Math.round(FAN_CONFIG.base * FAN_CONFIG.growth ** reputation);
}
/**
 * One league round of supporters drifting toward the following; 글로벌 인지도 scales it (→ECON-34).
 */
export function driftFans(fans: number, reputation: number, scale = 1) {
  return Math.max(
    MIN_FANS,
    Math.round(fans + (fanFollowing(reputation) * scale - fans) * FAN_CONFIG.drift),
  );
}
/** Supporters after one of our matches: a win draws a few more, a defeat loses a few. */
export function fansAfterMatch(fans: number, win: boolean, winFans = 1) {
  return Math.max(
    MIN_FANS,
    Math.round(fans * (win ? 1 + FAN_CONFIG.win * winFans : 1 - FAN_CONFIG.loss)),
  );
}

/**
 * How many local supporters a club can draw on (→ECON-9): an ordinary club's catchment in its
 * division, scaled by the town its country's clubs stand for and by its stature (→LEAGUE-10).
 * Aimed at ENG average league gates of 20–45k in the top flight, 8–20k in the second tier, 4–10k
 * in the third and 0.3–2k in the amateur league (→ECON-9); spec/ssot/ECON.md has what was measured.
 */
export const CATCHMENT_CONFIG = {
  /** An ordinary club's catchment by professional division, from the top flight down. */
  division: [60000, 28000, 14000, 8000] as readonly number[],
  /** An ordinary amateur club's catchment. */
  amateur: 2500,
  /** The town behind a club, against England's, following each country's football index. */
  city: {
    ENG: 1,
    ESP: 0.8,
    GER: 0.8,
    ITA: 0.8,
    FRA: 0.7,
    NED: 0.6,
    POR: 0.6,
    BEL: 0.55,
  } as Record<string, number>,
  /** Catchment per point of stature: giants (+13) draw half again, small clubs (−4) a sixth less. */
  stature: 0.04,
};
/** The most local supporters a club can draw on, whatever its following. */
export function catchment(w: World, club: Club = clubOf(w)) {
  const amateur = club.tier >= country(club.country).groups.length,
    division = CATCHMENT_CONFIG.division;
  const base = amateur
    ? CATCHMENT_CONFIG.amateur
    : division[Math.min(club.tier, division.length - 1)];
  const size = Math.max(0.5, 1 + stature(w.seed, club.id) * CATCHMENT_CONFIG.stature);
  return Math.round(base * (CATCHMENT_CONFIG.city[club.country] ?? 1) * size);
}
/** Supporters who live close enough to come on match day: the following, up to the catchment. */
export function localSupporters(w: World, club: Club = clubOf(w)) {
  return Math.min(club.fans, catchment(w, club));
}
