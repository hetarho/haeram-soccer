import { createHash } from 'node:crypto';
import { createWorld, MATCH_MODEL_RELEASE } from '../../../packages/engine/src/index';
import { canonical } from '../../../packages/contracts/src/index';
import { readCopy, roundJobs, simulateRoundJob } from '../../../packages/engine/src/round-jobs';
import type { FixtureReadCopy, RoundJob } from '../../../packages/engine/src/round-jobs';

export { simulateRoundJob };
export { invalidateNpcSquads } from '../../../packages/engine/src/world';
export {
  createWorld,
  MATCH_MODEL_RELEASE,
  advanceDays,
  prepareRound,
  completeRound,
} from '../../../packages/engine/src/index';
export function fixtureInput(seed: string, count: number) {
  const w = createWorld(
    { country: 'ENG', name: 'Architecture Research', color: '#284e35', seed, level: 'easy' },
    MATCH_MODEL_RELEASE,
  );
  const jobs = roundJobs(
    w,
    w.fixtures.filter((f) => f.round === 1),
  ).slice(0, count);
  if (new Set(jobs.flatMap((j) => [j.fixture.home, j.fixture.away])).size !== jobs.length * 2)
    throw new Error('Fixture batch is not independent');
  return { copy: readCopy(w), jobs };
}
export function shardCopy(copy: FixtureReadCopy, jobs: RoundJob[]): FixtureReadCopy {
  const clubs = new Set(jobs.flatMap((j) => [j.fixture.home, j.fixture.away]));
  // Preserve departed natives too: continuousSquad reads their original occupied identities.
  const people =
    copy.people &&
    Object.fromEntries(
      Object.entries(copy.people).filter(
        ([id, p]) =>
          clubs.has(p.club ?? '') ||
          clubs.has(p.origin?.club ?? '') ||
          [...clubs].some((club) => id.startsWith(club + ':')),
      ),
    );
  return { ...copy, people };
}
export function slimCopy(copy: FixtureReadCopy, jobs: RoundJob[]): FixtureReadCopy {
  const clubs = new Set(jobs.flatMap((j) => [j.fixture.home, j.fixture.away]));
  // clubManager's returned contract also quotes fees in the owning club's country.
  clubs.add(copy.playerClub);
  return { ...shardCopy(copy, jobs), clubs: copy.clubs.filter((c) => clubs.has(c.id)) };
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
