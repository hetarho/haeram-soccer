import type { World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { clamp } from './primitives';
import { findClub } from './world';
export const REPUTATION_CONFIG = {
  pull: 0.2,
  finish: 3,
  cup: 2,
  continentalMatch: 0.2,
  continentalTitle: 8,
} as const;
export const divisionLevel = (tier: number, depth: number) =>
  tier >= depth ? 8 : Math.max(8, 75 - 15 * tier);
export const finishTerm = (rank: number, clubs: number) =>
  clubs <= 1 ? 0 : REPUTATION_CONFIG.finish * (1 - (2 * (rank - 1)) / (clubs - 1));
export function awardReputation(w: World, id: string, amount: number) {
  const club = findClub(w, id);
  if (!club || club.representative || club.id.startsWith('euro:')) return;
  club.reputation = clamp(club.reputation + amount, 0, 100);
}
/** Finishes belong to the old season; each club's tier is already its next division. */
export function settleReputation(w: World, finishes: ReadonlyMap<string, number>) {
  for (const club of w.clubs) {
    if (club.representative || club.id.startsWith('euro:')) continue;
    const level = divisionLevel(club.tier, country(club.country).groups.length);
    club.reputation = clamp(
      club.reputation +
        REPUTATION_CONFIG.pull * (level - club.reputation) +
        (finishes.get(club.id) ?? 0),
      0,
      100,
    );
  }
}
