/** Explicit release flags without importing a world builder or cache. */
import {
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
} from '../../packages/engine/src/match-model-release';
export { MATCH_MODEL_RELEASE };

/**
 * The release switch turned on, whatever the default: for tests and measurements of what a new
 * career plays.
 */
export const ENABLED_RELEASE: MatchModelRelease = { ...MATCH_MODEL_RELEASE, enabled: true };

/**
 * The release switch turned off, whatever the default: for tests whose subject is the pre-feature
 * path, which careers whose rules never activate the model keep playing (→SAVE-23). A test about
 * what a new career plays uses `ENABLED_RELEASE` or `withCandidateModel`.
 */
export const DISABLED_RELEASE: MatchModelRelease = { ...MATCH_MODEL_RELEASE, enabled: false };

/**
 * The release production declares, also under the release-on probe, which keeps it before turning
 * the switch on (tests/setup/release-on.ts). Only the case guarding production's switch reads it.
 */
export function declaredRelease(): MatchModelRelease {
  return (
    (globalThis as { declaredMatchModelRelease?: MatchModelRelease }).declaredMatchModelRelease ?? {
      ...MATCH_MODEL_RELEASE,
    }
  );
}
