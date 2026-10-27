import type { Fixture, MatchPlayback, MatchRecord, Player, World } from '../../contracts/src/types';
import { simulateMatch } from './match';
import { isScoringFixture } from './scoring';
import { findClub, squad } from './world';

/**
 * The world keys a fixture without the own club reads (→ARCH-6). Each such fixture draws from its
 * own seeded streams and settles only its two clubs, each playing once a round, so a round's other
 * fixtures can be computed elsewhere from a read-only copy of these keys alone. The NPC squads are
 * not shipped: a copy rebuilds them from `people` through its own per-year squad cache.
 */
export const FIXTURE_READ_KEYS = [
  'calendar',
  'clubs',
  'discipline',
  'managerMarket',
  'matchModel',
  'people',
  'playerClub',
  'seed',
  'year',
] as const satisfies readonly (keyof World)[];
export type FixtureReadKey = (typeof FIXTURE_READ_KEYS)[number];
export type FixtureReadCopy = Pick<World, FixtureReadKey>;

/** One other-club league fixture of the round, to compute from a read copy. */
export interface RoundJob {
  fixture: Fixture;
  /** Keep every player line: the fixture counts for the own competition's scorer table. */
  keep: boolean;
}
/** A computed job: its record and both matchday rosters as player IDs, in roster order. */
export interface RoundJobResult {
  record: MatchRecord;
  squads: [string[], string[]];
}
/**
 * Computes a round's jobs elsewhere: it starts them from the read copy, our match then plays on
 * the engine thread, and the returned collector answers every job in job order, or `undefined`
 * to have the engine compute them itself.
 */
export type RoundSimulator = (
  copy: FixtureReadCopy,
  jobs: readonly RoundJob[],
) => () => readonly RoundJobResult[] | undefined;

const simulators = new WeakMap<World, RoundSimulator>();
/** Injects the world session's simulator; `undefined` (the default) computes every fixture here. */
export function setRoundSimulator(w: World, simulator: RoundSimulator | undefined) {
  if (simulator) simulators.set(w, simulator);
  else simulators.delete(w);
}
export function roundSimulator(w: World) {
  return simulators.get(w);
}

export function ownFixture(w: World, f: Fixture) {
  return f.home === w.playerClub || f.away === w.playerClub;
}
/** The copy of the world a round's other fixtures read; it shares the world's values. */
export function readCopy(w: World): FixtureReadCopy {
  const copy: Partial<Record<FixtureReadKey, unknown>> = {};
  for (const key of FIXTURE_READ_KEYS) if (key in w) copy[key] = w[key];
  return copy as FixtureReadCopy;
}
/** The fixtures without the own club, in fixture order. */
export function roundJobs(w: World, fixtures: readonly Fixture[]): RoundJob[] {
  return fixtures
    .filter((f) => !ownFixture(w, f))
    .map((fixture) => ({ fixture, keep: isScoringFixture(w, fixture) }));
}
/** What a helper runs: the job's match exactly as the engine thread would play it on the world. */
export function simulateRoundJob(copy: FixtureReadCopy, job: RoundJob): RoundJobResult {
  const p = simulateMatch(copy as World, job.fixture, false, job.keep);
  const ids = (players: Player[]) => players.map((player) => player.id);
  return { record: p.record, squads: [ids(p.squads[0]), ids(p.squads[1])] };
}
/**
 * The job's playback on the world's own rosters, or `undefined` when the result does not answer
 * this fixture or names a player the world's squads lack (the engine then computes it itself).
 */
export function jobPlayback(
  w: World,
  job: RoundJob,
  result: RoundJobResult,
): MatchPlayback | undefined {
  const f = job.fixture;
  if (result.record.id !== f.id || result.record.home !== f.home || result.record.away !== f.away)
    return undefined;
  const squads: Player[][] = [];
  for (const [side, id] of [f.home, f.away].entries()) {
    const pool = new Map(squad(w, findClub(w, id)).map((p) => [p.id, p]));
    const players: Player[] = [];
    for (const playerId of result.squads[side] ?? []) {
      const player = pool.get(playerId);
      if (!player) return undefined;
      players.push(player);
    }
    squads.push(players);
  }
  return { record: result.record, frames: [], squads: [squads[0]!, squads[1]!] };
}
