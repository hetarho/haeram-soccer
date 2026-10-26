import { colourDistance, contrast } from '../../../../packages/engine/src/identity-legacy';
import type { Crest } from '../presentation/crests';

/**
 * WEB-49: every club wears a crest built from a shape, a field pattern, one to three colours and an
 * emblem (KIT-2/4). The catalog lives in the identity contract, the legacy generator in the
 * engine's legacy leaf (KIT-15) and the current crest lookup in the shared presentation crests;
 * these re-exports keep the names the UI already uses.
 */
export { crestMap, crestOf, type Crest } from '../presentation/crests';
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
