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
