import { describe, expect, it } from 'vitest';
import type { Club, PersonCareer } from '../../../../packages/contracts/src/types';
import {
  fixtureRosterKey,
  type FixtureReadCopy,
} from '../../../../packages/engine/src/fixture-copy';
import {
  FIXTURE_HELPER_PROTOCOL,
  FixtureReplicaReader,
  FixtureReplicaWriter,
  type HelperJob,
} from './fixtureReplica';

const club = (id: string) => ({ id, country: 'ENG', tier: 1, strength: 50, cohesion: 40 }) as Club;
const person = (id: string) =>
  ({
    id,
    name: id,
    born: 1950,
    position: 'CM',
    professionalism: 'steady',
    qualities: {},
    origin: { club: 'a', slot: 0 },
    playing: 'active',
    club: 'a',
    ownCareer: [0],
  }) as unknown as PersonCareer;
function copy(): FixtureReadCopy {
  return {
    seed: 'replica',
    year: 1975,
    playerClub: 'own',
    clubs: [club('own'), club('a'), club('b')],
    people: { p: person('p'), q: person('q') },
    calendar: { day: 1 },
  };
}
function packet(writer: FixtureReplicaWriter, value: FixtureReadCopy, id: number): HelperJob {
  const encoded = writer.encode(value, id);
  return {
    protocol: FIXTURE_HELPER_PROTOCOL,
    session: 'session',
    id,
    worldRevision: id,
    base: encoded.base,
    ...(encoded.base ? { patch: encoded.patch } : { copy: encoded.snapshot() }),
    jobs: [],
  };
}
const plain = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

describe('ordered fixture replicas', () => {
  it('replicates changed and removed fields, preserving clubs but refreshing edited person indexes', () => {
    const source = copy(),
      writer = new FixtureReplicaWriter(),
      reader = new FixtureReplicaReader();
    const first = reader.apply(packet(writer, source, 1)).copy;
    const savedClub = first.clubs[1],
      savedRegistry = first.people;
    source.clubs[1]!.cohesion = 55;
    Reflect.deleteProperty(source.clubs[1]!, 'country');
    source.people!.p!.ownCareer = [1, 2, 3];
    source.calendar = { day: 8 };
    const next = reader.apply(packet(writer, source, 2));
    expect(next.copy).toEqual(plain(source));
    expect(next.copy.clubs[1]).toBe(savedClub);
    expect(next.copy.people).not.toBe(savedRegistry);
    expect(next.rosterChanged).toBe(true); // Removing the generation country invalidates.
    expect(first).not.toBe(source);
  });
  it('does not invalidate generated squads for cohesion, calendar or career-counter edits', () => {
    const source = copy(),
      writer = new FixtureReplicaWriter(),
      reader = new FixtureReplicaReader();
    reader.apply(packet(writer, source, 1));
    const key = fixtureRosterKey(source);
    source.clubs[1]!.cohesion = (source.clubs[1]!.cohesion ?? 0) + 1;
    source.people!.p!.ownCareer = [8, 4, 1];
    source.calendar = { day: 8 };
    const next = reader.apply(packet(writer, source, 2));
    expect(next.copy).toEqual(plain(source));
    expect(next.rosterChanged).toBe(false);
    expect(fixtureRosterKey(source)).toBe(key);
  });
  it('keeps the registry when unchanged, and replicates insertion, deletion and original ordering', () => {
    const source = copy(),
      writer = new FixtureReplicaWriter(),
      reader = new FixtureReplicaReader();
    const first = reader.apply(packet(writer, source, 1)).copy;
    expect(reader.apply(packet(writer, source, 2)).copy.people).toBe(first.people);
    source.clubs = [source.clubs[2]!, club('new'), source.clubs[0]!];
    source.people = { q: source.people!.q!, new: person('new') };
    const next = reader.apply(packet(writer, source, 3));
    expect(next.copy).toEqual(plain(source));
    expect(next.copy.clubs.map((c) => c.id)).toEqual(['b', 'new', 'own']);
    expect(Object.keys(next.copy.people!)).toEqual(['q', 'new']);
    source.people = { new: source.people.new!, q: source.people.q! };
    expect(Object.keys(reader.apply(packet(writer, source, 4)).copy.people!)).toEqual(['new', 'q']);
    delete source.people;
    delete source.calendar;
    expect(reader.apply(packet(writer, source, 5)).copy).toEqual(plain(source));
  });
  it('replicates prototype-like IDs as data without changing object prototypes', () => {
    const source = copy(),
      writer = new FixtureReplicaWriter(),
      reader = new FixtureReplicaReader();
    reader.apply(packet(writer, source, 1));
    source.people = Object.fromEntries([['__proto__', person('__proto__')]]);
    const remote = reader.apply(packet(writer, source, 2)).copy;
    expect(Object.hasOwn(remote.people!, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(remote.people)).toBe(Object.prototype);
  });
  it('uses a full new snapshot across years, seeds, model identities and writer resets', () => {
    const source = copy(),
      writer = new FixtureReplicaWriter(),
      reader = new FixtureReplicaReader();
    let previous = reader.apply(packet(writer, source, 1)).copy;
    for (const [i, update] of [
      () => source.year++,
      () => (source.seed += 'next'),
      () => (source.playerClub = 'another'),
    ].entries()) {
      update();
      const job = packet(writer, source, i + 2);
      expect(job.base).toBe(0);
      expect(job.copy).toBeDefined();
      const remote = reader.apply(job).copy;
      expect(remote).not.toBe(previous);
      previous = remote;
    }
    writer.reset();
    expect(packet(writer, source, 5).copy).toBeDefined();
  });
  it.each(['strength', 'tier', 'country'] as const)(
    'invalidates when a club generation input %s changes',
    (key) => {
      const source = copy(),
        writer = new FixtureReplicaWriter(),
        reader = new FixtureReplicaReader();
      reader.apply(packet(writer, source, 1));
      Reflect.set(source.clubs[1]!, key, key === 'country' ? 'BEL' : 90);
      expect(reader.apply(packet(writer, source, 2)).rosterChanged).toBe(true);
    },
  );
  it.each([
    'name',
    'born',
    'position',
    'professionalism',
    'qualities',
    'origin',
    'playing',
    'club',
  ] as const)('invalidates changed retained-player input %s', (key) => {
    const source = copy(),
      writer = new FixtureReplicaWriter(),
      reader = new FixtureReplicaReader();
    reader.apply(packet(writer, source, 1));
    const edits = {
      name: 'Other',
      born: 1951,
      position: 'ST',
      professionalism: 'driven',
      qualities: { adaptability: 2 },
      origin: { club: 'b', slot: 1 },
      playing: 'retired',
      club: 'b',
    };
    Reflect.set(source.people!.p!, key, edits[key]);
    expect(reader.apply(packet(writer, source, 2)).rosterChanged).toBe(true);
  });
  it.each(['protocol', 'base', 'session', 'id'] as const)(
    'rejects a bad %s and drops its replica',
    (key) => {
      const source = copy(),
        writer = new FixtureReplicaWriter(),
        reader = new FixtureReplicaReader();
      reader.apply(packet(writer, source, 1));
      const next = packet(writer, source, 2);
      Reflect.set(next, key, key === 'session' ? 'wrong' : key === 'id' ? 1 : -1);
      expect(() => reader.apply(next)).toThrow();
      expect(reader.revision).toBe(0);
      writer.reset();
      expect(reader.apply(packet(writer, source, 3)).copy).toEqual(plain(source));
    },
  );
  it('rejects invalid ordering and malformed state before any fixture result can be returned', () => {
    const source = copy(),
      writer = new FixtureReplicaWriter(),
      reader = new FixtureReplicaReader();
    reader.apply(packet(writer, source, 1));
    const next = packet(writer, source, 2),
      patch = JSON.parse(next.patch!) as { clubs: { order: string[] } };
    patch.clubs.order = ['missing'];
    next.patch = JSON.stringify(patch);
    expect(() => reader.apply(next)).toThrow('order');
    writer.reset();
    const reset = packet(writer, source, 3);
    reset.copy = '{}';
    expect(() => reader.apply(reset)).toThrow('state');
  });
});
