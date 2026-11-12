/** Release metadata is a leaf: importing it never loads simulation. */
import { MATCH_MODEL_REVISION, type MatchModelRevision } from '../../contracts/src/match-model';

/** Which model a release activates. */
export interface MatchModelRelease {
  readonly revision: MatchModelRevision;
}
/**
 * The released model (→ARCH-31, SAVE-23; its accuracy is reported beside it, →MATCH-28): a new
 * career is tracked from its takeover and a supported career on an earlier revision or without a
 * model (→SAVE-10) moves to it at its next writer load. Its revision ships inside a game version;
 * there is no switch and no earlier model's code, so no player control or timing selects another.
 */
export const MATCH_MODEL_RELEASE: MatchModelRelease = { revision: MATCH_MODEL_REVISION };
