import { MATCH_MODEL_RELEASE, type MatchModelRelease } from '../../packages/engine/src/match-model';

/**
 * The release-on probe (`vitest.release-on.config.ts`): runs before every test file and turns the
 * internal release switch on, so a file shows it passes once the switch flips (→SAVE-23). Only
 * this setup file writes the switch: `createWorld`'s default and the host's
 * `options.release ?? MATCH_MODEL_RELEASE` read the same object at call time and follow it, and
 * production code never reads the probe. The release the source declares is kept first, for the
 * one case that guards it (`declaredRelease` in tests/fixtures/worlds.ts).
 */
(globalThis as { declaredMatchModelRelease?: MatchModelRelease }).declaredMatchModelRelease = {
  ...MATCH_MODEL_RELEASE,
};
(MATCH_MODEL_RELEASE as { enabled: boolean }).enabled = true;
