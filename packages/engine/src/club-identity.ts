import type { ClubIdentity, ShirtDesign, KitRole } from '../../contracts/src/identity';
import type { Club, World } from '../../contracts/src/types';
import { legacyCrestMap, type LegacyCrest } from './identity-legacy';

/**
 * KIT-1/11/15: seeded default identities, lookup and missing-only installation
 * (spec/ssot/KIT.md). Hash-only: no sporting PRNG stream, Math.random or world
 * mutation outside `installMissingIdentities`.
 */

/** The fixed default away and third shirt fields (§3). */
const AWAY_SHIRT = '#ffffff';
const THIRD_SHIRT = '#0b1f44';

/** Home stripes in the representative pair, a white away and a navy third trimmed with it (§3). */
function defaultKits([primary, secondary]: [string, string]): Record<KitRole, ShirtDesign> {
  return {
    home: { pattern: 'stripes', primary, secondary },
    away: { pattern: 'plain', primary: AWAY_SHIRT, trim: primary },
    third: { pattern: 'plain', primary: THIRD_SHIRT, trim: secondary },
  };
}
/** KIT-15: a club without an identity keeps its colour and the exact crest it wore before. */
function legacyIdentity(club: Club, crest: LegacyCrest): ClubIdentity {
  const colours: [string, string] = [club.color, crest.secondary];
  const { shape, pattern, emblem, primary, secondary } = crest;
  return {
    version: 1,
    colours,
    crest: { shape, pattern, emblem, primary, secondary },
    kits: defaultKits(colours),
  };
}
/**
 * The legacy crests of the clubs; `fresh` bypasses the shared cache, which keys on the clubs array
 * and would not see a club appended to it since.
 */
function legacyCrests(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>, fresh = false) {
  return legacyCrestMap(fresh ? { ...w, clubs: w.clubs.slice() } : w);
}

/**
 * A club's applied identity, or the legacy-preserving default it would adopt (KIT-15). Pure: it
 * installs nothing; an applied identity is returned as stored.
 */
export function identityOf(
  w: Pick<World, 'seed' | 'clubs' | 'playerClub'>,
  clubId: string,
): ClubIdentity {
  const club = w.clubs.find((c) => c.id === clubId);
  if (!club) throw new Error(`알 수 없는 클럽입니다: ${clubId}`);
  if (club.identity) return club.identity;
  const crest = legacyCrests(w).get(clubId) ?? legacyCrests(w, true).get(clubId)!;
  return legacyIdentity(club, crest);
}

/**
 * Gives every listed club without an identity its legacy-preserving default (all clubs unless
 * listed). The whole legacy map is computed before any club changes; existing identities, club
 * order and colours stay. Returns whether anything was installed; a second call is a no-op.
 */
export function installMissingIdentities(w: World, clubs: readonly Club[] = w.clubs) {
  const legacy = legacyCrests(w, true);
  let installed = false;
  for (const club of clubs) {
    if (club.identity) continue;
    const crest = legacy.get(club.id);
    if (!crest) throw new Error(`알 수 없는 클럽입니다: ${club.id}`);
    club.identity = legacyIdentity(club, crest);
    installed = true;
  }
  return installed;
}
