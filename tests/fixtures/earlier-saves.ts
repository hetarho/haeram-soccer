/**
 * Careers as earlier games saved them (→SAVE-23), made from today's engine by what those games
 * left out or named differently: nothing an earlier model played is replayed, so settled facts are
 * today's and only the model's labels and data differ.
 */
import { MATCH_MODEL_REVISIONS } from '../../packages/contracts/src/match-model';
import type { World } from '../../packages/contracts/src/types';

/** The revision before today's: what the game before this one recorded. */
export const PREVIOUS_REVISION = MATCH_MODEL_REVISIONS[MATCH_MODEL_REVISIONS.length - 2]!;

/**
 * `w` as the game before this one saved it: its model metadata, open season ledger and own records
 * name the revision before today's, which a writer load moves on at the safe boundary.
 */
export function onPreviousRevision<T extends World>(w: T): T {
  w.matchModel!.revision = PREVIOUS_REVISION;
  w.npcSeason!.model = PREVIOUS_REVISION;
  for (const m of w.ownMatches) m.model = PREVIOUS_REVISION;
  return w;
}

/**
 * `w` as a writer before the full model's release saved it: no model metadata, season ledger or
 * record label, so a writer load records the model from its next unplayed day.
 */
export function withoutMatchModel<T extends World>(w: T): T {
  delete w.matchModel;
  delete w.npcSeason;
  for (const m of w.ownMatches) delete m.model;
  return w;
}
