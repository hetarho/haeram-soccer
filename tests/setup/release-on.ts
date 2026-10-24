import { MATCH_MODEL_RELEASE } from '../../packages/engine/src/match-model';

/**
 * The release-on probe (`vitest.release-on.config.ts`): runs before every test file and turns the
 * internal release switch on, so a file shows it passes once the switch flips (→SAVE-23). Only
 * this setup file writes the switch: `createWorld`'s default and the host's
 * `options.release ?? MATCH_MODEL_RELEASE` read the same object at call time and follow it, and
 * production code never reads the probe.
 */
(MATCH_MODEL_RELEASE as { enabled: boolean }).enabled = true;
