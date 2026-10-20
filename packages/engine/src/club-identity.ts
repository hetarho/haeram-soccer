import {
  CREST_PRESETS,
  type ClubIdentity,
  type CrestDesign,
  type IdentityColours,
  type ShirtDesign,
  type KitRole,
} from '../../contracts/src/identity';
import type { Club, Founding, World } from '../../contracts/src/types';
import { legacyCrestMap, type LegacyCrest } from './identity-legacy';
import { hash } from './primitives';

/**
 * KIT-1/11/14/15: seeded default identities, lookup and missing-only installation
 * (docs/CLUB-IDENTITY-CONTRACT.md §3). Hash-only: no sporting PRNG stream, Math.random or world
 * mutation outside `installMissingIdentities`.
 */

/** The fixed default away and third shirt fields (§3). */
const AWAY_SHIRT = '#ffffff';
const THIRD_SHIRT = '#0b1f44';
const HEX = /^#[0-9a-fA-F]{6}$/;

/** KIT-14: the six ready-made crests in their order, one per outer shape, in the given colours. */
export function presetCrests(colours: IdentityColours): CrestDesign[] {
  const [primary, secondary, accent] = colours;
  return CREST_PRESETS.map((parts) => ({
    ...parts,
    primary,
    ...(secondary !== undefined ? { secondary } : {}),
    ...(accent !== undefined ? { accent } : {}),
  }));
}
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
 * KIT-14: the founding draft — one of the six ready-made crests chosen by seed and country, the
 * requested primary with the secondary the legacy crest would give the own club, and the three
 * default shirts. It depends only on country, seed and colour.
 */
export function createIdentityDraft(input: Pick<Founding, 'country' | 'seed' | 'color'>) {
  if (!HEX.test(input.color)) throw new Error('창단 정보를 확인해 주세요.');
  const id = `${input.country}:club`;
  // The own club claims its legacy crest first, so its secondary needs no other club.
  const own = { id, color: input.color } as Club;
  const legacy = legacyCrests({ seed: input.seed, clubs: [own], playerClub: id }, true).get(id)!;
  const colours: [string, string] = [input.color, legacy.secondary];
  const template = hash(`${input.seed}:identity-template:${input.country}`) % CREST_PRESETS.length;
  const identity: ClubIdentity = {
    version: 1,
    colours,
    crest: presetCrests(colours)[template],
    kits: defaultKits(colours),
  };
  return identity;
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
