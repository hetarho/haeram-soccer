import type { CareerEmployment, PersonCareer, World } from '../../contracts/src/types';

/**
 * The read-only inputs an unowned fixture consumes (ARCH-6); no campaign execution imports.
 * Fixtures draw their own streams and read disjoint clubs in a round. Persisted squads travel
 * whole until T867 introduces per-club replication.
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
  'squads',
  'year',
] as const satisfies readonly (keyof World)[];
export type FixtureReadKey = (typeof FIXTURE_READ_KEYS)[number];
/**
 * Active roster identities need these fields and their player jobs of the season
 * (`seasonPlayerJobs`); inactive people only reserve their IDs.
 */
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

/**
 * An active person's player jobs that began or ended in season `year`: all a refill reads of his
 * career (whether a sale or a loan emptied his old place this season, →WORLD-6), and all a
 * fixture's copy carries of it.
 */
export function seasonPlayerJobs(
  person: { employment?: readonly CareerEmployment[] },
  year: number,
): CareerEmployment[] {
  return (person.employment ?? []).filter(
    (job) => job.role === 'player' && (job.from.year === year || job.to?.year === year),
  );
}

export function readCopy(w: World): FixtureReadCopy {
  const copy: Partial<Record<FixtureReadKey, unknown>> = {};
  for (const key of FIXTURE_READ_KEYS)
    if (key in w && key !== 'people' && key !== 'freeAgents') copy[key] = w[key];
  if (w.freeAgents) copy.freeAgents = w.freeAgents.map(({ id }) => ({ id }));
  if (w.people)
    copy.people = Object.fromEntries(
      Object.entries(w.people).map(([id, person]) => {
        const row: FixtureReadPerson = { id: person.id, playing: person.playing };
        if (person.playing === 'active') {
          for (const key of FIXTURE_PERSON_READ_KEYS)
            if (key in person) Object.assign(row, { [key]: person[key] });
          const jobs = seasonPlayerJobs(person, w.year);
          if (jobs.length) row.employment = jobs;
        }
        return [id, row];
      }),
    );
  return copy as FixtureReadCopy;
}

/**
 * Inputs of stored matchday selection and representative squad generation, in registry order.
 * Changes to those builders must update this signature and its parity cases. Stored squads
 * travel whole for now, including the player changes that require a fresh matchday choice.
 */
export function fixtureRosterKey(copy: FixtureReadCopy): string {
  return JSON.stringify([
    copy.seed,
    copy.year,
    copy.squads,
    copy.clubs.map((c) => [c.id, c.country, c.strength, c.tier]),
    Object.values(copy.people ?? {}).map((p) =>
      p.playing === 'active'
        ? [...FIXTURE_PERSON_READ_KEYS.map((key) => p[key]), p.employment]
        : [p.id, p.playing],
    ),
    (copy.freeAgents ?? []).map((p) => p.id),
  ]);
}
