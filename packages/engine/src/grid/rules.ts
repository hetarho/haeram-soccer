import { matchModelNumber, type MatchModelRevision } from '../../../contracts/src/match-model';
export {
  ADDED_CONFIG,
  DEFAULT_SUB_POLICY,
  eraRules,
  isLevel,
  type DecideRule,
  type EraRules,
  type SubPolicy,
} from '../match/rules';

/** The revision `modelAtLeast` read last and its number: a match reads one revision throughout. */
let lastModel: MatchModelRevision | undefined;
let lastNumber = 0;
/** Whether a match plays `revision` of the candidate model or a later one; T431–T433 gate on 2. */
export function modelAtLeast(setup: { model?: MatchModelRevision }, revision: number): boolean {
  const model = setup.model;
  if (model === undefined) return false;
  if (model !== lastModel) {
    lastModel = model;
    lastNumber = matchModelNumber(model);
  }
  return lastNumber >= revision;
}
