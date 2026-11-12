import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonical, type World } from '../../contracts/src/index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import {
  advanceDays,
  completeRound,
  FIXTURE_READ_KEYS,
  MATCH_MODEL_RELEASE,
  ownFixture,
  prepareRound,
  readCopy,
  roundJobs,
  simulateRoundJob,
  type FixtureReadCopy,
  type RoundJob,
  type RoundJobResult,
} from './index';
import { careerWorld } from './career.testkit';

/**
 * A takeover with only two competitions' fixtures left: the own second-tier league (its other
 * fixtures keep every player line for the scorer table) and the national top flight (summary
 * lines). Synthetic: the other leagues simply do not play (→ARCH-21).
 */
function smallWorld() {
  const w = careerWorld({ country: 'BEL', seed: 'round-jobs' }, MATCH_MODEL_RELEASE);
  const own = w.fixtures.find((f) => ownFixture(w, f))!.groupKey;
  const top = w.fixtures.find(
    (f) => f.kind === 'league' && f.country === 'BEL' && f.groupKey !== own,
  )!.groupKey;
  w.fixtures = w.fixtures.filter((f) => f.groupKey === own || f.groupKey === top);
  return w;
}
const founding = () => structuredClone(cachedWorld('round-jobs-founding', smallWorld));
const digest = (w: World) => createHash('sha256').update(canonical(w)).digest('hex');
const DAYS = 60;

/** A helper's view: the copy and the jobs cross a JSON boundary and are solved last job first. */
function solveReversed(copy: FixtureReadCopy, jobs: readonly RoundJob[]) {
  const remote = JSON.parse(JSON.stringify(copy)) as FixtureReadCopy;
  const results: RoundJobResult[] = [];
  for (let i = jobs.length - 1; i >= 0; i--)
    results[i] = simulateRoundJob(remote, JSON.parse(JSON.stringify(jobs[i])) as RoundJob);
  return JSON.parse(JSON.stringify(results)) as RoundJobResult[];
}

describe('two-phase league round', () => {
  it('gives the same world through the prepared pair and a failed helper', () => {
    // The reference: every fixture computed on the engine itself.
    const sequential = cachedWorld('round-jobs-sequential', () => {
      const w = founding();
      for (let day = 0; day < DAYS; day++) advanceDays(w, 1, undefined, false);
      return { hash: digest(w), ownMatches: w.ownMatches.length };
    });
    const helped = founding();
    let prepared = 0;
    let failed = 0;
    for (let day = 0; day < DAYS; day++) {
      let posted: RoundJobResult[] | undefined;
      const start = (copy: FixtureReadCopy, jobs: readonly RoundJob[]) => {
        expect(
          Object.keys(copy).every((k) => (FIXTURE_READ_KEYS as readonly string[]).includes(k)),
        ).toBe(true);
        posted = solveReversed(copy, jobs);
      };
      if (prepareRound(helped, start, false)) {
        prepared++;
        // Every other prepared round loses its helper: the engine computes the jobs itself.
        completeRound(helped, prepared % 2 ? posted : undefined);
        if (!(prepared % 2)) failed++;
      } else advanceDays(helped, 1, undefined, false);
    }
    expect(sequential.ownMatches).toBeGreaterThanOrEqual(5);
    expect(helped.ownMatches).toHaveLength(sequential.ownMatches);
    expect(prepared).toBeGreaterThanOrEqual(2);
    expect(failed).toBeGreaterThanOrEqual(1);
    expect(digest(helped)).toBe(sequential.hash);
  });

  it('reads no world key outside FIXTURE_READ_KEYS', () => {
    const w = founding();
    w.calendar = { day: 7 };
    const jobs = roundJobs(
      w,
      w.fixtures.filter((f) => f.round === 1),
    );
    expect(jobs.length).toBeGreaterThan(1);
    const read = new Set<string>();
    const written = new Set<string>();
    const traced = new Proxy(w, {
      get(target, key, receiver) {
        if (typeof key === 'string') read.add(key);
        return Reflect.get(target, key, receiver) as unknown;
      },
      has(target, key) {
        if (typeof key === 'string') read.add(key);
        return Reflect.has(target, key);
      },
      ownKeys(target) {
        read.add('<keys>');
        return Reflect.ownKeys(target);
      },
      set(target, key, value, receiver) {
        if (typeof key === 'string') written.add(key);
        return Reflect.set(target, key, value, receiver);
      },
    });
    const results = jobs.slice(0, 2).map((job) => simulateRoundJob(traced, job));
    expect([...read].filter((k) => !(FIXTURE_READ_KEYS as readonly string[]).includes(k))).toEqual(
      [],
    );
    expect([...written]).toEqual([]);
    // The copy alone gives the same results as the world it was read from.
    const copy = readCopy(structuredClone(w));
    expect(jobs.slice(0, 2).map((job) => simulateRoundJob(copy, job))).toEqual(results);
  });

  it('plays a round naming a club twice on the sequential path', () => {
    const w = founding();
    // The own club's first league round: its division of fifteen gives one club a bye each round,
    // and a round without our match never asks helpers anyway (→ARCH-6).
    const round = Math.min(
      ...w.fixtures.filter((f) => f.kind === 'league' && ownFixture(w, f)).map((f) => f.round),
    );
    const other = w.fixtures.find((f) => f.round === round && !ownFixture(w, f))!;
    w.fixtures.push({ ...other, id: `${other.id}-again`, home: other.away, away: other.home });
    while (w.round < round) {
      expect(prepareRound(w, () => expect.unreachable(), false)).toBe(false);
      advanceDays(w, 1, undefined, false);
    }
    expect(w.fixtures.filter((f) => f.round === round).every((f) => f.score)).toBe(true);
    expect(w.ownMatches).toHaveLength(1);
  });
});
