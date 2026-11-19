import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import {
  attachRecordStore,
  type RecordStore,
} from '../../../../packages/contracts/src/record-store';
import { advanceDays, completeRound, prepareRound } from '../../../../packages/engine/src/index';
import { currentDay, seasonLength } from '../../../../packages/engine/src/calendar';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { CAREER } from '../../../../packages/engine/src/finance.testkit';
import { saveMovingCold } from '../adapters/coldMovers';
import { RowSaver } from '../adapters/rowSaver';
import { worldFacts } from '../adapters/worldRows';
import {
  ownMatchesAgainst,
  ownMatchesFrom,
  ownMatchesOfSeason,
} from '../../../../packages/engine/src/own-matches';
import type { World } from '../../../../packages/contracts/src/types';
import { clubRecords } from './clubRecords';
import { createFixtureHelper } from './fixtureHelper';
import { headToHead } from './headToHead';
import { HelperPool, playDay, type HelperPort } from './helperPool';
import { storedWorld } from './host';

/** Real helper code across cloned messages; only thread scheduling is replaced by a microtask. */
function port(): HelperPort {
  const answer = createFixtureHelper();
  const helper: HelperPort = {
    onmessage: null,
    postMessage(job) {
      const received = structuredClone(job);
      queueMicrotask(() => helper.onmessage?.({ data: structuredClone(answer(received)) }));
    },
  };
  return helper;
}

/** `w` opened from its database as the host opens a game: the rows not marked cold. */
function open(store: RecordStore) {
  const w = attachRecordStore(storedWorld(store), store);
  const saver = new RowSaver(store);
  saver.prime(w);
  return { w, saver };
}

/**
 * The host's own-match reads — club records, head-to-head and a season's archive — on `saved`, whose
 * earlier seasons' matches are cold, against `reference`, which holds every match (→SAVE-32).
 */
function expectSameMatchReads(saved: World, reference: World) {
  const own = reference.playerClub;
  const opponent = reference.ownMatches.map((m) => (m.home === own ? m.away : m.home))[0]!;
  expect(clubRecords(ownMatchesFrom(saved, 0), own)).toEqual(
    clubRecords(reference.ownMatches, own),
  );
  expect(headToHead(ownMatchesAgainst(saved, opponent), own, opponent)).toEqual(
    headToHead(reference.ownMatches, own, opponent),
  );
  for (const year of new Set(reference.ownMatches.map((m) => m.year)))
    expect(ownMatchesOfSeason(saved, year)).toEqual(
      reference.ownMatches.filter((m) => m.year === year),
    );
}

describe('people, player records and own matches leaving memory at every save (→SAVE-32, →ARCH-5)', () => {
  it('plays a season alike with a cold move after every day and without saves', async () => {
    // A season after the takeover, retired people its records link are kept (→HIST-23).
    const start = simulatedWorld(CAREER, { seasons: 1 });
    // Synthetic funding avoids bankruptcy while every club, fixture and business day is simulated.
    start.cash = '99999999999';
    const referenceStore = memoryRecordStore();
    new RowSaver(referenceStore).save(start);
    let reference = storedWorld(referenceStore);
    const store = memoryRecordStore();
    new RowSaver(store).save(start);
    let { w: saved, saver } = open(store);
    saveMovingCold(saved, saver);
    const everyone = Object.keys(reference.people!).length;
    expect(Object.keys(saved.people!).length).toBeLessThan(everyone);
    // Retired players' linked records leave with them (T1015).
    const records = (w: typeof saved) => Object.keys(w.playerRecords ?? {}).length;
    expect(records(saved)).toBeLessThan(records(reference));
    // Last season's own matches leave memory; every host read answers as before (T1016).
    expect(saved.ownMatchesBase).toBeGreaterThan(0);
    expect(saved.ownMatches.length).toBeLessThan(reference.ownMatches.length);
    expectSameMatchReads(saved, reference);
    expect(worldFacts(saved)).toBe(canonical(reference));

    // Fixture helpers play the saved world's other matches; the reference plays alone (→ARCH-6).
    const pool = new HelperPool([port(), port()]);
    const year = reference.year,
      maxDays = seasonLength(reference) + 15;
    let days = 0;
    while (reference.year === year || currentDay(reference) < 8) {
      expect(days++).toBeLessThan(maxDays);
      for (const w of [reference, saved])
        if (w.critical) {
          // The host's explicit acknowledgement resumes an informational critical stop.
          delete w.critical;
          w.revision++;
        }
      if (days === 120) {
        // Reopening reads only the people memory held at the last save.
        expect(worldFacts(saved)).toBe(canonical(reference));
        reference = structuredClone(reference);
        ({ w: saved, saver } = open(store));
      }
      advanceDays(reference, 1, undefined, false);
      await playDay(pool, saved, false, { advanceDays, prepareRound, completeRound });
      saveMovingCold(saved, saver);
      expect(reference.bankrupt).toBeFalsy();
    }
    expect(saved.year).toBe(year + 1);
    expect(store.count('person', { cold: true })).toBeGreaterThan(0);
    expect(store.count('player_record', { cold: true })).toBeGreaterThan(0);
    expect(records(saved)).toBeLessThan(records(reference));
    expect(Object.keys(saved.people!).length).toBeLessThan(Object.keys(reference.people!).length);
    // The closed season's matches followed across the close (T1016).
    expect(saved.ownMatches.every((m) => m.year === saved.year)).toBe(true);
    expect(store.count('own_match', { cold: true })).toBe(saved.ownMatchesBase);
    expect(store.count('own_match', { cold: true, year })).toBeGreaterThan(0);
    expectSameMatchReads(saved, reference);
    expect(worldFacts(saved)).toBe(canonical(reference));
  }, 900_000);
});
