import { CURRENT_ENGINE_VERSION } from '../../../../packages/contracts/src/versions';

/** The mark every screen carries until 1.0 (→WEB-101). Like the game's name, it is not translated. */
export const BETA_MARK = 'BETA';

/** The game is a beta until its version reaches 1.0 (→SAVE-10). */
export function isBetaVersion(version: string = CURRENT_ENGINE_VERSION) {
  return Number(version.split('.')[0]) < 1;
}

/** The major.minor of the game's one version, as the player reads it: `0.7`. */
export function shortVersion(version: string = CURRENT_ENGINE_VERSION) {
  const [major = '0', minor = '0'] = version.split('.');
  return `${major}.${minor}`;
}

/** What the start and save-slot screens print: `v0.7 BETA` (→WEB-101). */
export function versionLabel(version: string = CURRENT_ENGINE_VERSION) {
  return `v${shortVersion(version)} ${BETA_MARK}`;
}
