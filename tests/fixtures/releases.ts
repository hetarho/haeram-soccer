/** Explicit release values without importing a world builder or cache. */
import {
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
} from '../../packages/engine/src/match-model-release';
export { MATCH_MODEL_RELEASE };

/**
 * The released model, as a copy a test passes explicitly so a world it builds names its release
 * (→SAVE-23); there is no switch to turn off and no earlier model to play.
 */
export const ENABLED_RELEASE: MatchModelRelease = { ...MATCH_MODEL_RELEASE };
