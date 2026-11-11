/** Release metadata is a leaf: importing flags never loads simulation. */
import { MATCH_MODEL_REVISION, type MatchModelRevision } from '../../contracts/src/match-model';

/** Which model a release activates and whether it activates at all. */
export interface MatchModelRelease {
  readonly revision: MatchModelRevision;
  readonly enabled: boolean;
}
/**
 * The internal release switch, on since T286 measured the combined model's throughput, capacity
 * and continuity gates passing (→ARCH-31, SAVE-23; its accuracy is reported beside it, →MATCH-28):
 * a new career is tracked from its founding or takeover and a supported career (→SAVE-10) activates
 * at its next writer load. Its revision ships inside a game version. Tests and
 * measurements of the pre-feature path pass a disabled release explicitly, and no player control
 * or timing ever selects it.
 */
export const MATCH_MODEL_RELEASE: MatchModelRelease = {
  revision: MATCH_MODEL_REVISION,
  enabled: true,
};
/**
 * The scripted model (revision 11, →MATCH-1, MATCH-16, MATCH-38), for tests and tools only until
 * T838 releases it: a world created or activated with it settles other clubs' fixtures on the
 * aggregate path with the place rule (T824); its own fixtures still play the grid until T833.
 */
export const SCRIPTED_RELEASE: MatchModelRelease = {
  revision: 'scripted-aggregate-11',
  enabled: true,
};
