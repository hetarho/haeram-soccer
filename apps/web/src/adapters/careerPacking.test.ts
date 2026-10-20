import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { featureState } from '../../../../tests/fixtures/feature-state';
import { cachedWorld, simulatedWorld } from '../../../../tests/fixtures/worlds';
import { packCareers, unpackCareers } from './careerPacking';
import { readCareerOrder } from './careerOrder';
import { readCareerProfiles } from './careerProfiles';
const fixture = () => {
  const world = cachedWorld('feature-state', () => featureState());
  const coach = Object.values(world.people!).find((person) =>
    person.employment.some((job) => job.role !== 'player' && job.club !== world.playerClub),
  )!;
  const job = coach.employment.find(
    (job) => job.role !== 'player' && job.club !== world.playerClub,
  )!;
  Object.assign(job, {
    contractUntil: { ...job.to! },
    wage: '12345678901234567890',
    currency: world.currency,
    grownThrough: job.to!.year,
  });
  const context = {
    clubs: world.clubs.map((club) => club.id),
    playerClub: world.playerClub,
    seed: world.seed,
  };
  return { world, context, data: packCareers(world.people!, context) };
};
const noGlobalDictionary = () => {
  throw new Error('Version two must use its own dictionary');
};
describe('versioned lossless career relationships', () => {
  it('round trips complete generated origins, name templates and seeded scalar references', () => {
    const world = simulatedWorld({
      country: 'ENG',
      name: 'Dictionary origins',
      color: '#224466',
      seed: 'career-dictionary',
      level: 'easy',
    });
    const context = {
      clubs: world.clubs.map((club) => club.id),
      playerClub: world.playerClub,
      seed: world.seed,
    };
    const data = packCareers(world.people!, context);
    expect(data.people[0].some(Array.isArray)).toBe(true);
    expect(data.people[1].some(Array.isArray)).toBe(true);
    expect(data.people[5].some((value) => value === null)).toBe(true);
    expect(canonical(unpackCareers(data, noGlobalDictionary, context))).toBe(
      canonical(world.people),
    );
  });
  it('restores every optional fact using its private dictionary and explicit relationship references', () => {
    const { world, context, data } = fixture();
    expect(data.version).toBe(3);
    expect(data.mentors.flat().some((mentor) => mentor[0] !== null)).toBe(true);
    const before = canonical(data);
    expect(canonical(unpackCareers(data, noGlobalDictionary, context))).toBe(
      canonical(world.people),
    );
    expect(canonical(data)).toBe(before);
  });
  it('retains exact binary fractions and arbitrary valid fraction fallbacks', () => {
    const { world, context } = fixture();
    const person = Object.values(world.people!).find((p) => p.intention && p.coaching)!;
    for (const draw of [0.125, 0.123456789]) {
      person.intention!.draw = draw;
      const data = packCareers(world.people!, context);
      expect(unpackCareers(data, noGlobalDictionary, context)[person.id].intention!.draw).toBe(
        draw,
      );
      expect(canonical(unpackCareers(data, noGlobalDictionary, context))).toBe(
        canonical(world.people),
      );
    }
  });
  it('supports empty registries without fabricated records', () => {
    const { context } = fixture();
    expect(unpackCareers(packCareers({}, context), noGlobalDictionary, context)).toEqual({});
  });
  it('preserves valid monetary spelling and extreme stored birth years without lossy arithmetic', () => {
    const { world, context } = fixture();
    const person = Object.values(world.people!).find((person) =>
      person.employment.some((job) => job.wage !== undefined),
    )!;
    person.born = -Number.MAX_SAFE_INTEGER;
    const job = person.employment.find((job) => job.wage !== undefined)!;
    job.wage = '000123';
    const data = packCareers(world.people!, context);
    const restored = unpackCareers(data, noGlobalDictionary, context);
    expect(restored[person.id].born).toBe(person.born);
    expect(restored[person.id].employment.find((job) => job.wage !== undefined)!.wage).toBe(
      '000123',
    );
    expect(canonical(restored)).toBe(canonical(world.people));
  });
  it('rejects malformed dimensions, dates, vocabulary and cross-person references before activation', () => {
    const { data, context } = fixture();
    for (const corrupt of [
      (copy: typeof data) => {
        copy.seed += ':changed';
      },
      (copy: typeof data) => {
        copy.people[0][0] = [99, 0];
      },
      (copy: typeof data) => {
        copy.people[1][0] = [999999, 0];
      },
      (copy: typeof data) => {
        copy.people[5][0] = null;
        copy.people[6][0] = 4;
        copy.people[7][0] = 4;
      },
      (copy: typeof data) => {
        copy.draw = ['', '', '', ''];
      },
      (copy: typeof data) => {
        copy.people[0].pop();
      },
      (copy: typeof data) => {
        copy.jobCounts[0]++;
      },
      (copy: typeof data) => {
        copy.jobs[2].pop();
      },
      (copy: typeof data) => {
        copy.mentors.pop();
      },
      (copy: typeof data) => {
        copy.clubPool.reverse();
      },
      (copy: typeof data) => {
        copy.clubPool[0] = 999999;
      },
      (copy: typeof data) => {
        copy.playerRole = copy.dictionary.indexOf('assistant');
      },
      (copy: typeof data) => {
        copy.jobFlags[0] = 4;
      },
      (copy: typeof data) => {
        copy.jobFlags.pop();
      },
      (copy: typeof data) => {
        copy.jobs[10][0] = 1;
      },
      (copy: typeof data) => {
        copy.mentors.find((m) => m.length)![0] = [999999, 0];
      },
      (copy: typeof data) => {
        copy.mentors.find((m) => m.length)![0] = [0, 999999];
      },
      (copy: typeof data) => {
        copy.profiles.push(copy.profiles[0]);
      },
      (copy: typeof data) => {
        copy.wageBooks.push(copy.wageBooks[0]);
      },
      (copy: typeof data) => {
        copy.wageBooks[0][2][0] = copy.playerRole;
      },
      (copy: typeof data) => {
        copy.people[0][0] = 999999;
      },
    ]) {
      const broken = structuredClone(data);
      corrupt(broken);
      expect(() => unpackCareers(broken, noGlobalDictionary, context)).toThrow();
    }
    expect(() => unpackCareers(data, noGlobalDictionary)).toThrow();
    expect(() => unpackCareers({ ...data, version: 4 }, noGlobalDictionary, context)).toThrow(
      SaveCompatibilityError,
    );
  });
  it('groups only stored rows and restores the exact original registry and nested array order', () => {
    const { world, context } = fixture();
    const people = Object.fromEntries(Object.entries(world.people!).reverse());
    const originalKeys = Object.keys(people),
      before = canonical(people);
    const data = packCareers(people, context);
    expect(
      readCareerOrder(data.order!, data.jobCounts.length).some(
        (original, stored) => original !== stored,
      ),
    ).toBe(true);
    for (const deferred of [false, true]) {
      const restored = unpackCareers(data, noGlobalDictionary, context, deferred);
      expect(Object.keys(restored)).toEqual(originalKeys);
      expect(canonical(restored)).toBe(before);
    }
    expect(Object.keys(people)).toEqual(originalKeys);
    expect(canonical(people)).toBe(before);
  });
  it('continues reading version-two rows in their stored order without permutation metadata', () => {
    const { world, context, data } = fixture();
    const { order, ...columns } = data;
    const legacy = {
      ...columns,
      version: 2,
      people: readCareerProfiles(data.people, data.jobCounts.length),
    };
    const restored = unpackCareers(legacy, noGlobalDictionary, context);
    expect(canonical(restored)).toBe(canonical(world.people));
    expect(Object.keys(restored)).toEqual(
      readCareerOrder(order!, data.jobCounts.length).map((i) => Object.keys(world.people!)[i]),
    );
  });
  it('rejects missing, duplicate, out-of-range and mis-versioned registry permutations', () => {
    const { context, data } = fixture();
    for (const order of [
      undefined,
      [],
      [0],
      '',
      data.order!.slice(1),
      data.order! + 'AAAA',
      btoa('\0'.repeat(data.jobCounts.length)),
    ]) {
      for (const deferred of [false, true])
        expect(() =>
          unpackCareers({ ...data, order }, noGlobalDictionary, context, deferred),
        ).toThrow();
    }
    expect(() => unpackCareers({ ...data, version: 2 }, noGlobalDictionary, context)).toThrow();
  });
  it('validates restored profile scalars on both standalone and deferred world paths', () => {
    const { context, data } = fixture();
    const columns = data.people[16][0] as unknown[][];
    expect(columns[1].length).toBeGreaterThan(0);
    columns[1][0] = 'invalid-ability';
    for (const deferred of [false, true])
      expect(() => unpackCareers(data, noGlobalDictionary, context, deferred)).toThrow();
  });
  it('reads the frozen version-one row contract independently of the current writer', () => {
    const dictionary = [
      'legacy:coach',
      'Historical Coach',
      'CM',
      'retired',
      'assistant',
      'legacy:club',
      '1000',
      'GBP-LSD',
      'developer',
      'legacy:manager',
      'Historical Mentor',
    ];
    const old = {
      version: 1,
      people: [
        [
          0,
          1,
          1915,
          2,
          5,
          5,
          5,
          5,
          3,
          null,
          true,
          null,
          null,
          Array(12).fill(0),
          [[4, 5, 1951, 0, 1955, 10, 1955, 10, 6, 7, 1955]],
          [[9, 10, 8, 5, 1951, 0, 1955, 10]],
          [1950, 243, 0.125, true, 1950, 243, false],
          [1950, 243, 1951, 1951, 0],
          [4, 55.25, 80.5, 1951, 0],
          [50.125, 77.75, 8, 1955, 10],
        ],
      ],
    };
    const person = unpackCareers(old, (i) => dictionary[i])['legacy:coach'];
    expect(person).toMatchObject({
      id: 'legacy:coach',
      name: 'Historical Coach',
      born: 1915,
      playing: 'retired',
      formerOwn: true,
      intention: { draw: 0.125, encouraged: { changed: false } },
      coaching: { ability: 55.25, potential: 80.5 },
      management: { ability: 50.125, potential: 77.75, school: 'developer' },
    });
    expect(person.employment[0]).toEqual({
      role: 'assistant',
      club: 'legacy:club',
      from: { year: 1951, day: 0 },
      to: { year: 1955, day: 10 },
      contractUntil: { year: 1955, day: 10 },
      wage: '1000',
      currency: 'GBP-LSD',
      grownThrough: 1955,
    });
    expect(person.mentors[0]).toEqual({
      manager: 'legacy:manager',
      name: 'Historical Mentor',
      school: 'developer',
      club: 'legacy:club',
      from: { year: 1951, day: 0 },
      to: { year: 1955, day: 10 },
    });
  });
});
