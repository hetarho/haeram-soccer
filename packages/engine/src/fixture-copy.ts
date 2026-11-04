import type { PersonCareer, World } from '../../contracts/src/types';

/**
 * The read-only inputs an unowned fixture consumes (ARCH-6); no campaign execution imports.
 * Fixtures draw their own streams and read disjoint clubs in a round. NPC squads are rebuilt
 * from retained people through the helper's generated-roster cache, rather than shipped.
 */
export const FIXTURE_READ_KEYS = [
  'calendar',
  'clubs',
  'discipline',
  'freeAgents',
  'managerMarket',
  'matchModel',
  'people',
  'playerClub',
  'seed',
  'year',
] as const satisfies readonly (keyof World)[];
export type FixtureReadKey = (typeof FIXTURE_READ_KEYS)[number];
/** Active roster identities need these fields; inactive people only reserve their IDs. */
export const FIXTURE_PERSON_READ_KEYS = [
  'id',
  'name',
  'born',
  'position',
  'professionalism',
  'qualities',
  'origin',
  'playing',
  'club',
] as const satisfies readonly (keyof PersonCareer)[];
export type FixtureReadPerson = Pick<PersonCareer, 'id' | 'playing'> & Partial<PersonCareer>;
export type FixtureReadCopy = Omit<Pick<World, FixtureReadKey>, 'people' | 'freeAgents'> & {
  people?: Record<string, FixtureReadPerson>;
  /** Only who the free agents are: their old clubs' generated places stay empty (→CLUB-49). */
  freeAgents?: { id: string }[];
};

export function readCopy(w: World): FixtureReadCopy {
  const copy: Partial<Record<FixtureReadKey, unknown>> = {};
  for (const key of FIXTURE_READ_KEYS)
    if (key in w && key !== 'people' && key !== 'freeAgents') copy[key] = w[key];
  if (w.freeAgents) copy.freeAgents = w.freeAgents.map(({ id }) => ({ id }));
  if (w.people)
    copy.people = Object.fromEntries(
      Object.entries(w.people).map(([id, person]) => {
        const row: FixtureReadPerson = { id: person.id, playing: person.playing };
        if (person.playing === 'active')
          for (const key of FIXTURE_PERSON_READ_KEYS)
            if (key in person) Object.assign(row, { [key]: person[key] });
        return [id, row];
      }),
    );
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
    Object.values(copy.people ?? {}).map((p) =>
      p.playing === 'active' ? FIXTURE_PERSON_READ_KEYS.map((key) => p[key]) : [p.id, p.playing],
    ),
    (copy.freeAgents ?? []).map((p) => p.id),
  ]);
}
