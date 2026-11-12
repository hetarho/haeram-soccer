/** Simulation setup, separate from generic JSON caching and release-only constants. */
import { fileURLToPath } from 'node:url';
import type { MatchModelState } from '../../packages/contracts/src/match-model';
import type { World } from '../../packages/contracts/src/types';
import { careerWorld, type CareerInput } from '../../packages/engine/src/career.testkit';
import { advanceRound, simulateSeason } from '../../packages/engine/src/season';
import { activateMatchModel } from '../../packages/engine/src/match-model';
import {
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
} from '../../packages/engine/src/match-model-release';
import { ENABLED_RELEASE } from './releases';
import { cachedJson } from './json-cache';
export { cachedWorld } from './cached-world';
export { ENABLED_RELEASE } from './releases';

const SELF = fileURLToPath(import.meta.url);
const CAREER = fileURLToPath(
  new URL('../../packages/engine/src/career.testkit.ts', import.meta.url),
);

export interface Simulated {
  /** Whole seasons simulated (closed) after the takeover. */
  seasons?: number;
  /** Rounds then played into the next season, unobserved. */
  rounds?: number;
}

/**
 * `careerWorld(input, release)` after `seasons` closed seasons and `rounds` unobserved rounds — the
 * same world the inline calls give, shared by every file that asks for the same career, span and
 * release. `release` defaults to the switch as it stands (`MATCH_MODEL_RELEASE`).
 */
export function simulatedWorld(
  input: CareerInput = {},
  span: Simulated = {},
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
): World {
  const { seasons = 0, rounds = 0 } = span;
  const id = `sim:${JSON.stringify(input)}:${seasons}:${rounds}:${JSON.stringify(release)}`;
  return cachedJson(
    id,
    () => {
      const w =
        rounds > 0
          ? simulatedWorld(input, { seasons }, release)
          : seasons > 0
            ? simulatedWorld(input, { seasons: seasons - 1 }, release)
            : careerWorld(input, release);
      if (rounds > 0) for (let n = 0; n < rounds; n++) advanceRound(w, undefined, false);
      else if (seasons > 0) simulateSeason(w);
      return w;
    },
    { dependencies: [SELF, CAREER], input: release },
  );
}

/**
 * `w` as a writer before own-manager history saved it (→SAVE-24): no tracked facts and no record
 * linked to a tenure, as every older container and earlier-rules career is. A new career tracks
 * from its takeover, so fixtures of those checkpoints remove what today's takeover records.
 */
export function withoutManagerHistory<T extends World>(w: T): T {
  delete w.managerHistory;
  for (const m of w.ownMatches) delete m.managerTenure;
  return w;
}

/**
 * `w` on the released match model (→SAVE-23), for tests and measurements whatever the switch says:
 * production's `activateMatchModel` with an enabled release, so the model is recorded at
 * the world's current boundary with its season's complete aggregates opened there — `founding`
 * coverage for a world taken over on its season's first day, `activation` otherwise. A world already on a
 * model keeps it. `coverage`, when given, is what the caller expects and throws when it differs.
 */
export function withCandidateModel(w: World, coverage?: MatchModelState['coverage']): World {
  activateMatchModel(w, ENABLED_RELEASE);
  if (!w.matchModel) throw new Error(`world on rules ${w.engine} cannot take the candidate model`);
  if (coverage !== undefined && w.matchModel.coverage !== coverage)
    throw new Error(`candidate model coverage ${w.matchModel.coverage}, expected ${coverage}`);
  return w;
}
