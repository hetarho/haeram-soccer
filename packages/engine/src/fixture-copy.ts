import type { World } from '../../contracts/src/types';

/**
 * The read-only inputs an unowned fixture consumes (ARCH-6); no campaign execution imports.
 * Fixtures draw their own streams and read disjoint clubs in a round. NPC squads are rebuilt
 * from retained people through the helper's generated-roster cache, rather than shipped.
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

export function readCopy(w: World): FixtureReadCopy {
  const copy: Partial<Record<FixtureReadKey, unknown>> = {};
  for (const key of FIXTURE_READ_KEYS) if (key in w) copy[key] = w[key];
  return copy as FixtureReadCopy;
}

/**
 * Inputs of world.ts npcSquad and npc-continuity.ts continuousSquad, in registry order.
 * Changes to those builders must update this signature and its parity cases. A career counter,
 * fee or cohesion edit still replicates, but does not discard an unchanged generated squad.
 */
export function fixtureRosterKey(copy: FixtureReadCopy): string {
  return JSON.stringify([
    copy.seed,
    copy.year,
    copy.clubs.map((c) => [c.id, c.country, c.strength, c.tier]),
    Object.values(copy.people ?? {}).map((p) => [
      p.id,
      p.name,
      p.born,
      p.position,
      p.professionalism,
      p.qualities,
      p.origin,
      p.playing,
      p.club,
    ]),
  ]);
}
