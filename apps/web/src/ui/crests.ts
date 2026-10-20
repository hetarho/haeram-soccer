import type { World } from '../../../../packages/contracts/src/types';
import {
  colourDistance,
  contrast,
  legacyCrestMap,
  type LegacyCrest,
} from '../../../../packages/engine/src/identity-legacy';

/**
 * WEB-49: every club wears a crest built from a shape, a field pattern, two colours and an emblem.
 * The catalog lives in the identity contract and the crest generator in the engine's legacy leaf
 * (KIT-15); these re-exports keep the names the UI already uses.
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
export type Crest = LegacyCrest;

/**
 * Assign every club a crest from the world seed and its stable ID; see `legacyCrestMap`, which
 * owns the algorithm and its cache.
 */
export function crestMap(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>) {
  return legacyCrestMap(w);
}

const FALLBACK: Crest = {
  primary: '#455a64',
  secondary: '#f3e3c3',
  shape: 'shield',
  pattern: 'plain',
  emblem: 'ball',
};
export function crestOf(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>, id: string | undefined) {
  return (id && crestMap(w).get(id)) || FALLBACK;
}

/** The grass the pitch canvas draws; shirts must stand out from it. */
const GRASS = '#1c543e';
const onGrass = (crest: Crest) =>
  contrast(crest.primary, GRASS) >= 1.5 ||
  contrast(crest.secondary, GRASS) < contrast(crest.primary, GRASS)
    ? crest.primary
    : crest.secondary;
/**
 * Shirt colours for both sides. A shirt that disappears into the grass switches to its secondary,
 * and the away side changes to its secondary when the two shirts clash.
 */
export function kits(home: Crest, away: Crest): [string, string] {
  const homeKit = onGrass(home);
  const awayKit = onGrass(away);
  const clash = colourDistance(homeKit, awayKit) < 150;
  return [homeKit, clash ? (awayKit === away.primary ? away.secondary : away.primary) : awayKit];
}
