import { MATCH_MODEL_REVISION } from '../../packages/contracts/src/match-model';
import type { Founding, World } from '../../packages/contracts/src/types';
import {
  activateMatchModel,
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
} from '../../packages/engine/src/index';

/**
 * Marked synthetic full-model workload for the storage benchmark and the continuity journey (T286;
 * →SAVE-4/23, HIST-17, MATCH-26/27). The century profiles of `scripts/benchmark.ts` found with the
 * release switch as it stands, so a released switch tracks them from their first day; this module
 * reads what their checkpoints hold of the model (`modelEvidence`, `assertCompleteModel`) and
 * describes the supported career the release activates mid-season at a writer load
 * (`ACTIVATION_FOUNDING`, `writerActivation`). Every world comes from the real engine paths.
 */

/** The mid-season activation profile's founding: a supported career founded before the release. */
export const ACTIVATION_FOUNDING: Founding = {
  country: 'ENG',
  name: 'Century Activation',
  color: '#284e35',
  seed: 'release-activation',
  level: 'easy',
};

/**
 * The writer load's activation of `w` (`Host.adoptModel`, →SAVE-23): a copy one revision on with
 * `release`'s model recorded at the next unplayed day. A career whose identities and manager
 * history are already there gets nothing else from the load's upgrades, so this is what a writer
 * tab holds after loading it. Throws when `release` does not activate `w`.
 */
export function writerActivation(w: World, release: MatchModelRelease = MATCH_MODEL_RELEASE) {
  const activated = structuredClone(w);
  activated.revision++;
  if (!activateMatchModel(activated, release))
    throw new Error('the release does not activate this career');
  return activated;
}

/**
 * Whether a settled own record keeps the full model's counters: every record passed
 * `assertFullMatchRecord` before settlement (→MATCH-27), and the stored one keeps the own side's
 * lines, so here each part is only required present.
 */
const keepsCounters = (m: World['ownMatches'][number]) =>
  !!m.xg &&
  !!m.detail &&
  !!m.incidents &&
  !!m.added &&
  !!m.lineCounts &&
  m.players.every((p) => !!p.detail);

/** What a checkpoint holds of the full model: its state, the open season's ledger and records. */
export function modelEvidence(w: World) {
  const season = w.npcSeason;
  const full = w.ownMatches.filter((m) => m.model !== undefined);
  return {
    model: w.matchModel
      ? {
          revision: w.matchModel.revision,
          coverage: w.matchModel.coverage,
          activated: w.matchModel.activated,
          trackedFrom: w.matchModel.trackedFrom,
        }
      : null,
    npcSeason: season
      ? {
          year: season.year,
          model: season.model,
          trackedFrom: season.trackedFrom,
          competitions: season.competitions.length,
          clubRows: season.competitions.reduce((n, c) => n + c.clubs.length, 0),
          playerRows: season.competitions.reduce((n, c) => n + c.players.length, 0),
        }
      : null,
    ownMatches: w.ownMatches.length,
    fullRecords: full.length,
    preFeatureRecords: w.ownMatches.length - full.length,
    incompleteFullRecords: full.filter((m) => !keepsCounters(m)).length,
  };
}

/**
 * Throws unless `w` plays the full model with `coverage` and holds its complete data: the open
 * season's aggregates under the recorded model with clubs and players in every competition, and a
 * record with the model's counters for every own match settled since `fromMatch` (the own matches
 * before it keep whatever model they were settled under).
 */
export function assertCompleteModel(w: World, coverage: 'founding' | 'activation', fromMatch = 0) {
  const evidence = modelEvidence(w);
  const failures = [
    evidence.model?.revision === MATCH_MODEL_REVISION || 'no released model recorded',
    evidence.model?.coverage === coverage || `coverage ${evidence.model?.coverage}`,
    (evidence.npcSeason?.year === w.year && evidence.npcSeason.model === MATCH_MODEL_REVISION) ||
      'no open season ledger under the model',
    (w.npcSeason?.competitions ?? []).every((c) => c.clubs.length > 0 && c.players.length > 0) ||
      'a competition without club or player rows',
    w.ownMatches.slice(fromMatch).every((m) => m.model === MATCH_MODEL_REVISION) ||
      'an own match settled since the boundary without a complete record',
    evidence.incompleteFullRecords === 0 ||
      `${evidence.incompleteFullRecords} complete records without their counters`,
  ].filter((check) => check !== true);
  if (failures.length) throw new Error(`full-model workload: ${failures.join('; ')}`);
  return evidence;
}
