import type { CrestDesign } from '../../../../packages/contracts/src/identity';
import type { World } from '../../../../packages/contracts/src/types';
import {
  colourDistance,
  contrast,
  legacyCrestMap,
} from '../../../../packages/engine/src/identity-legacy';

/**
 * WEB-49: every club wears a crest built from a shape, a field pattern, one to three colours and an
 * emblem (KIT-2/4). The catalog lives in the identity contract and the legacy generator in the
 * engine's legacy leaf (KIT-15); these re-exports keep the names the UI already uses.
 */
export {
  CREST_EMBLEMS,
  CREST_PALETTE,
  CREST_PATTERNS,
  CREST_SHAPES,
  type CrestEmblem,
  type CrestPattern,
  type CrestShape,
} from '../../../../packages/contracts/src/identity';
export {
  CREST_COMBINATIONS,
  CREST_FIELDS,
  CREST_PAIRS,
  colourDistance,
  contrast,
  inkOn,
  luminance,
} from '../../../../packages/engine/src/identity-legacy';
/** A crest as drawn: its secondary and accent are optional, an absent one is negative space. */
export type Crest = CrestDesign;

const FALLBACK: Crest = {
  primary: '#455a64',
  secondary: '#f3e3c3',
  shape: 'shield',
  pattern: 'plain',
  emblem: 'ball',
};

/**
 * Every club's current crest: its applied identity's, else the exact legacy assignment of
 * `legacyCrestMap` (KIT-15). Built on each call and read from the identities first, so the legacy
 * cache — keyed on seed, clubs and the own colour — never hides a replaced identity. Current
 * identities only: a played match draws the crest it recorded (KIT-12).
 */
export function crestMap(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>) {
  const legacy = w.clubs.every((club) => club.identity) ? undefined : legacyCrestMap(w);
  return new Map<string, Crest>(
    w.clubs.map((club) => [club.id, club.identity?.crest ?? legacy?.get(club.id) ?? FALLBACK]),
  );
}
export function crestOf(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>, id: string | undefined) {
  const club = id ? w.clubs.find((c) => c.id === id) : undefined;
  if (!club) return FALLBACK;
  return club.identity?.crest ?? legacyCrestMap(w).get(club.id) ?? FALLBACK;
}

/** The grass the pitch canvas draws; shirts must stand out from it. */
const GRASS = '#1c543e';
/** A crest without a secondary has only its primary to offer; no colour is generated for it. */
const other = (crest: Crest) => crest.secondary ?? crest.primary;
const onGrass = (crest: Crest) =>
  contrast(crest.primary, GRASS) >= 1.5 ||
  contrast(other(crest), GRASS) < contrast(crest.primary, GRASS)
    ? crest.primary
    : other(crest);
/**
 * Shirt colours for both sides, from their current crests, until match observation draws the
 * recorded shirts (KIT-12). A shirt that disappears into the grass switches to its secondary, and
 * the away side changes to its secondary when the two shirts clash.
 */
export function kits(home: Crest, away: Crest): [string, string] {
  const homeKit = onGrass(home);
  const awayKit = onGrass(away);
  const clash = colourDistance(homeKit, awayKit) < 150;
  return [homeKit, clash ? (awayKit === away.primary ? other(away) : away.primary) : awayKit];
}
