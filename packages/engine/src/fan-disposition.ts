/** The takeover's own named draw: no world stream or recorded facts are mutated (→OWNER-19). */
import type { FanDisposition } from '../../contracts/src/owner';
import type { Club, World } from '../../contracts/src/types';
import { FAN_DISPOSITION } from './owner-config';
import { clamp, integer, random } from './primitives';
import { stature } from './world';

/** The latest available closed seasons, including across the wartime gap. */
export function takeoverFanDisposition(w: World, club: Club): FanDisposition {
  const config = FAN_DISPOSITION,
    recent = [...w.history]
      .filter((season) => season.year < w.year)
      .sort((a, b) => b.year - a.year)
      .slice(0, config.recentSeasons),
    champion = recent.some((season) => season.champions.some((title) => title.club === club.id)),
    size = stature(w.seed, club.id),
    lean = champion
      ? config.lean
      : config.lean * clamp(size / (size >= 0 ? config.giantStature : -config.smallStature), -1, 1),
    centres = [
      config.neutral + lean,
      config.neutral - lean,
      config.neutral - lean,
      config.neutral + lean,
    ],
    draw = random(`${w.seed}:fan-disposition:${club.id}`),
    weights = centres.map((centre) =>
      Math.max(1, centre - config.min + integer(draw, -config.jitter, config.jitter)),
    ),
    shares = centres.map(() => config.min);
  // Allocate whole points with bounded weights: stored and displayed shares sum to exactly 100.
  for (let point = shares.reduce((sum, share) => sum + share, 0); point < 100; point++) {
    const available = weights.map((weight, i) => (shares[i]! < config.max ? weight : 0));
    let choice = draw() * available.reduce((sum, weight) => sum + weight, 0);
    const index = available.findIndex((weight) => (choice -= weight) < 0);
    shares[index]!++;
  }
  return { results: shares[0]!, identity: shares[1]!, finance: shares[2]!, stars: shares[3]! };
}
