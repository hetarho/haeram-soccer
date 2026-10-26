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
 * a new career is tracked from its founding and a supported rules-4.0.0 career activates at its
 * next writer load. Tests and measurements of the pre-feature path pass a disabled release
 * explicitly, and no player control or timing ever selects it.
 */
export const MATCH_MODEL_RELEASE: MatchModelRelease = {
  revision: MATCH_MODEL_REVISION,
  enabled: true,
};
