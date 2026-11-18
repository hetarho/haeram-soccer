import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { historyWorld } from '../../packages/engine/src/history';
import { NPC_MARKET_ERA, npcMarketCaps } from '../../packages/engine/src/transfer-policy';
import { MARKET_TUNABLES, setTunables } from './market-tunables';
import {
  applyTunables,
  bookStats,
  median,
  tableThird,
  distribution,
  flattenNumbers,
  inferReason,
  mergeRuns,
  mergeSeasons,
  parseSeeds,
  parseStart,
  partition,
  partitionBySeed,
  runJobs,
  seasonStats,
  spread,
  windowOf,
  type ClubRef,
  type EndBook,
  type MoveFact,
  type SeasonInput,
} from './market-seasons';
import {
  loadStartWorld,
  loadStartWorldFile,
  pruneStartWorlds,
  saveStartWorld,
  startWorldName,
} from './start-worlds';

const club = (id: string, tier: number, country = 'ENG'): ClubRef => ({ id, country, tier });
const A = club('ENG:a', 0),
  B = club('ENG:b', 0),
  C = club('ENG:c', 1),
  D = club('ENG:d', 1),
  X = club('ESP:x', 0, 'ESP');

const move = (
  kind: MoveFact['kind'],
  from: ClubRef | undefined,
  to: ClubRef,
  playerId: string,
  window: MoveFact['window'] = 'summer',
): MoveFact => ({ kind, window, from, to, playerId });

const input = (moves: MoveFact[], extra: Partial<SeasonInput> = {}): SeasonInput => ({
  year: 1951,
  clubs: [A, B, C, D, X].map((c) => ({ ...c, strength: 80 - c.tier * 10, academy: 2 - c.tier })),
  moves,
  xiStart: {},
  xiLost: [],
  topThree: {},
  divisionTopThree: {},
  contracts: { releases: 0, renewals: 0, expiring: 0 },
  retirements: 0,
  intake: [],
  books: [],
  ...extra,
});

describe('season aggregation on synthetic moves', () => {
  const moves: MoveFact[] = [
    move('paid', C, A, 'p1'),
    move('paid', A, B, 'p2', 'winter'),
    move('paid', A, B, 'p3'),
    move('paid', B, X, 'p4'),
    move('free', undefined, D, 'p5', 'refresh'),
    move('loan', D, C, 'p6'),
    move('loan-return', C, D, 'p6', 'close'),
  ];

  it('counts moves by kind and window', () => {
    const s = seasonStats(input(moves));
    expect(s.moves).toEqual({ paid: 4, free: 1, loan: 1, loanReturn: 1 });
    expect(s.byWindow.summer).toEqual({ paid: 3, loan: 1 });
    expect(s.byWindow.winter).toEqual({ paid: 1 });
    expect(s.byWindow.close).toEqual({ 'loan-return': 1 });
  });

  it('reports per-club percentiles by tier with the share of clubs with none', () => {
    const s = seasonStats(input(moves));
    // Top flight ENG a, b and ESP x: paid in 1 (a: p1), 2 (b: p2, p3), 1 (x: p4).
    expect(s.perClub.tier0!.clubs).toBe(3);
    expect(s.perClub.tier0!.paidIn).toEqual({ p50: 1, p90: 2, max: 2, none: 0 });
    // Paid out: a 2 (p2, p3), b 1 (p4), x 0.
    expect(s.perClub.tier0!.paidOut).toEqual({ p50: 1, p90: 2, max: 2, none: 1 / 3 });
    expect(s.perClub.tier1!.paidOut).toEqual({ p50: 0, p90: 1, max: 1, none: 0.5 });
  });

  it('builds the from-tier by to-tier matrix per country and counts cross-country moves', () => {
    const s = seasonStats(input(moves));
    expect(s.flow.ENG).toEqual({ '1>0': 1, '0>0': 2 });
    expect(s.loanFlow.ENG).toEqual({ '1>1': 1 });
    expect(s.crossCountry).toEqual({ paid: 1, loan: 0 });
  });

  it('counts season-start XI players lost, by fee only when a paid move took them out', () => {
    const s = seasonStats(
      input(moves, {
        xiLost: [
          { club: 'ENG:a', player: 'p2' },
          { club: 'ENG:a', player: 'p9' },
          { club: 'ENG:c', player: 'p6' },
        ],
      }),
    );
    expect(s.xi.tier0).toMatchObject({ clubs: 3, lost: 2, lostByFee: 1 });
    expect(s.xi.tier0!.lostPerClub).toBeCloseTo(2 / 3);
    // p6 left D on a loan, not for a fee.
    expect(s.xi.tier1).toMatchObject({ lost: 1, lostByFee: 0 });
  });

  it('counts lower-division top-3 players who moved to a higher division', () => {
    const s = seasonStats(
      input(moves, { topThree: { p1: 'ENG:c', p6: 'ENG:d', p7: 'ENG:c', p8: 'ENG:d' } }),
    );
    // p1 went C (tier 1) to A (tier 0): up. p6 was loaned D to C, the same tier: not up.
    expect(s.topThreeUp).toMatchObject({ tracked: 4, movedUp: 1, share: 0.25 });
    expect(s.topThreeUp.byTier.tier1).toEqual({ tracked: 4, movedUp: 1, share: 0.25 });
  });

  it('counts releases against renewals, retirements, youth intake and promotions', () => {
    const s = seasonStats(
      input([], {
        contracts: { releases: 7, renewals: 12, expiring: 20 },
        retirements: 5,
        intake: [
          { tier: 0, potential: 70 },
          { tier: 0, potential: 80 },
          { tier: 1, potential: 55 },
        ],
        books: [
          {
            id: 'ENG:a',
            country: 'ENG',
            tier: 0,
            wages: 5,
            income: 10,
            costs: 1,
            debt: 0,
            cash: 2,
            nextTier: 0,
          },
          {
            id: 'ENG:c',
            country: 'ENG',
            tier: 1,
            wages: 1,
            income: 3,
            costs: 1,
            debt: 0,
            cash: 1,
            nextTier: 0,
          },
          {
            id: 'ENG:d',
            country: 'ENG',
            tier: 1,
            wages: 2,
            income: 3,
            costs: 1,
            debt: 0,
            cash: 1,
            nextTier: 2,
          },
        ],
      }),
    );
    expect(s.contracts).toEqual({ releases: 7, renewals: 12, expiring: 20 });
    expect(s.retirements).toBe(5);
    expect(s.youth.tier0).toEqual({ count: 2, meanPotential: 75 });
    expect(s.youth.tier1).toEqual({ count: 1, meanPotential: 55 });
    expect(s.promoted).toBe(1);
    expect(s.relegated).toBe(1);
    expect(s.tiers.tier0).toMatchObject({
      clubs: 3,
      strengthMean: 80,
      strengthMax: 80,
      academyMean: 2,
      books: { clubs: 1, wages: 5, income: 10, cash: 2 },
    });
    expect(s.tiers.tier1!.books).toEqual({ clubs: 2, wages: 3, income: 6, cash: 2 });
  });

  it('counts reasons: the engine-given one apart from the inferred ones', () => {
    const given = {
      ...move('paid', C, A, 'p1'),
      reason: { given: 'pull', seller: 'surplus', buyer: 'upgrade' },
    };
    const s = seasonStats(input([given, { ...given, playerId: 'p2' }]));
    expect(s.reasons).toEqual({
      given: { pull: 2 },
      seller: { surplus: 2 },
      buyer: { upgrade: 2 },
    });
  });
});

describe('calibration reads on synthetic season facts', () => {
  const book = (id: string, extra: Partial<EndBook> = {}): EndBook => ({
    id,
    country: 'ENG',
    tier: 0,
    nextTier: 0,
    wages: 60,
    costs: 50,
    income: 100,
    cash: 20,
    debt: 22,
    transfersReceived: 30,
    transfersPaid: 10,
    rank: 1,
    groupSize: 3,
    ...extra,
  });

  it('uses the median of club ratios, excludes invalid denominators and never invents historical fees', () => {
    const a = book('a');
    const b = book('b', { income: 1000, wages: 200, costs: 200 });
    const c = book('c', { income: 0, wages: 0, costs: 0, transfersReceived: undefined });
    expect(median([])).toBeNull();
    expect(median([9, 1, 5])).toBe(5);
    expect(median([8, 2, 4, 6])).toBe(5);
    const stats = bookStats([a, b, c]);
    for (const [key, expected] of Object.entries({
      wagesToIncome: 0.4,
      costsToIncome: 0.35,
      operatingResultToIncome: 0.25,
      feesReceivedToIncome: 0.165,
      netFeesToIncome: 0.11,
      cashToIncome: 0.11,
      debtToFixedCosts: 0.1275,
    }))
      expect(stats.median[key]).toBeCloseTo(expected);
    expect(stats.operatingLossShare).toBe(1 / 3);
    expect(stats.samples.wagesToIncome).toBe(2);
    expect(bookStats([c]).median.feesReceivedToIncome).toBeNull();
    expect(bookStats([]).operatingLossShare).toBeNull();
    expect(a.wages).toBe(60);
  });

  it('partitions uneven groups by one-based rank/size and keeps country, tier and final-table thirds apart', () => {
    expect(Array.from({ length: 8 }, (_, i) => tableThird(i + 1, 8))).toEqual([
      'top',
      'top',
      'middle',
      'middle',
      'middle',
      'bottom',
      'bottom',
      'bottom',
    ]);
    expect([1, 2, 3].map((rank) => tableThird(rank, 3))).toEqual(['top', 'middle', 'bottom']);
    const stats = seasonStats(
      input([], {
        books: [
          book(A.id, { rank: 3, nextTier: 1 }),
          book(B.id, { rank: 1 }),
          book(C.id, { tier: 1, nextTier: 0 }),
          book(X.id, { country: 'ESP', rank: 2 }),
        ],
      }),
    );
    expect(stats.books.ENG.byTier.tier0.clubs).toBe(2);
    expect(stats.books.ENG.byTier.tier1.clubs).toBe(1);
    expect(stats.books.ENG.topFlightThirds.bottom.clubs).toBe(1);
    expect(stats.books.ENG.topFlightThirds.middle.clubs).toBe(0);
    expect(stats.books.ESP.topFlightThirds.middle.clubs).toBe(1);
  });

  it('filters the funnel by opening cohort and original seller, retaining repeat bids and separate refusals', () => {
    const base = { from: C, to: A, playerId: 'star' };
    const stats = seasonStats(
      input([move('paid', C, A, 'star')], {
        topThree: { star: C.id, stays: D.id, other: C.id },
        divisionTopThree: { star: C.id, stays: D.id },
        bids: [
          { ...base, outcome: 'seller-refused' },
          { ...base, outcome: 'player-refused' },
          { ...base, outcome: 'completed' },
          { ...base, playerId: 'other', outcome: 'completed' },
          { ...base, from: D, outcome: 'completed' },
          { ...base, to: D, outcome: 'completed' },
        ],
      }),
    );
    expect(stats.upwardFunnel.ENG.tier1).toEqual({
      tracked: 2,
      status: 'observed',
      bids: 3,
      sellerRefused: 1,
      playerRefused: 1,
      buyerRefused: 0,
      completed: 1,
      shareMovedUp: 0.5,
    });
    expect(seasonStats(input([])).upwardFunnel.ENG.tier1.bids).toBeNull();
    expect(seasonStats(input([], { bids: [] })).upwardFunnel.ENG.tier1.bids).toBe(0);
  });

  it('keeps absent observers distinct from zero events, unique stage entrants and ageing denominators', () => {
    const stats = seasonStats(
      input([], {
        renewalAnswers: [
          { club: C.id, kind: 'offered' },
          { club: C.id, kind: 'refused' },
          { club: D.id, kind: 'releasedUnoffered' },
          { club: 'unmeasured', kind: 'accepted' },
        ],
        distress: [
          { club: C.id, stage: 1 },
          { club: C.id, stage: 1 },
          { club: C.id, stage: 3, pointsDeducted: 10 },
          { club: D.id, stage: 3, pointsDeducted: 10 },
          { club: X.id, stage: 2 },
        ],
        ageing: [
          { age: 30, change: -2 },
          { age: 30, change: 0 },
          { age: 30, change: 1 },
          { age: 39, change: -6 },
        ],
      }),
    );
    expect(stats.renewals).toEqual({
      status: 'observed',
      offered: 1,
      accepted: 0,
      refused: 1,
      releasedUnoffered: 1,
    });
    expect(stats.distress.byCountry.ENG).toEqual({
      entries: { stage1: 1, stage2: 0, stage3: 2 },
      pointsDeducted: 20,
    });
    expect(stats.ageing[30]).toEqual({ players: 3, declinedShare: 1 / 3, meanOvrChange: -1 / 3 });
    expect(Object.keys(stats.ageing)).toHaveLength(15);
    expect(stats.ageing[24].meanOvrChange).toBeNull();
    const absent = seasonStats(input([]));
    expect(absent.renewals).toMatchObject({ status: 'absent', offered: null });
    expect(absent.distress.byCountry.ENG.pointsDeducted).toBeNull();
    const merged = mergeSeasons([[absent], [stats], [{ year: 1951 }]])[0]!;
    expect(merged.measures['renewals.offered']).toMatchObject({ n: 1, mean: 1 });
    expect(merged.measures['ageing.24.meanOvrChange']).toEqual({
      n: 0,
      mean: null,
      sd: null,
      min: null,
      max: null,
    });
  });
});

describe('helpers', () => {
  it('takes nearest-rank percentiles', () => {
    expect(distribution([0, 0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual({
      p50: 3,
      p90: 7,
      max: 8,
      none: 0.2,
    });
    expect(distribution([])).toEqual({ p50: 0, p90: 0, max: 0, none: 0 });
  });

  it('infers a seller reason first by sell-down, expiring, blocked, surplus', () => {
    const base = {
      kind: 'paid' as const,
      sellerOverLimit: false,
      expiring: false,
      blocked: false,
      surplus: false,
      buyerShortLine: false,
      buyerBelowSize: false,
    };
    expect(inferReason({ ...base, sellerOverLimit: true, expiring: true }).seller).toBe(
      'sell-down',
    );
    expect(inferReason({ ...base, expiring: true, blocked: true }).seller).toBe('expiring');
    expect(inferReason({ ...base, blocked: true, surplus: true }).seller).toBe('blocked');
    expect(inferReason({ ...base, surplus: true }).seller).toBe('surplus');
    expect(inferReason({ ...base, buyerShortLine: true, buyerBelowSize: true }).buyer).toBe(
      'short-line',
    );
    expect(inferReason({ ...base, buyerBelowSize: true }).buyer).toBe('refill');
    expect(inferReason(base)).toEqual({ seller: 'listed', buyer: 'upgrade' });
    expect(inferReason({ ...base, kind: 'free', buyerBelowSize: true })).toEqual({
      buyer: 'refill',
    });
  });

  it('labels a move by the window its day falls in', () => {
    const d = { summerClose: 30, winterOpen: 150, winterClose: 180, closeFrom: 320 };
    expect(windowOf(0, d)).toBe('summer');
    expect(windowOf(30, d)).toBe('summer');
    expect(windowOf(160, d)).toBe('winter');
    expect(windowOf(100, d)).toBe('refresh');
    expect(windowOf(322, d)).toBe('close');
  });

  it('parses starts, refusing a fresh burn-in under 2', () => {
    expect(parseStart('fresh:1951', 2)).toEqual({ kind: 'fresh', year: 1951 });
    expect(() => parseStart('fresh:1951', 1)).toThrow();
    expect(parseStart('lived:1951', 0)).toEqual({ kind: 'lived', year: 1951 });
    expect(parseStart('file:/tmp/a.json.gz', 0)).toEqual({ kind: 'file', path: '/tmp/a.json.gz' });
    expect(() => parseStart('lived:soon', 0)).toThrow();
    expect(() => parseStart('world:1951', 2)).toThrow();
  });

  it('parses seeds, jobs and partitions', () => {
    expect(parseSeeds('0..2,5,1')).toEqual([0, 1, 2, 5]);
    expect(() => parseSeeds('3..1')).toThrow();
    expect(runJobs(['a', 'b'], 2)).toEqual([
      { seed: 'a', luck: 0 },
      { seed: 'a', luck: 1 },
      { seed: 'b', luck: 0 },
      { seed: 'b', luck: 1 },
    ]);
    expect(partition([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
    expect(partition([1], 4)).toEqual([[1]]);
    // Every luck of one seed in one process, so a lived start is built once per seed.
    expect(partitionBySeed(runJobs(['a', 'b', 'c'], 2), 2)).toEqual([
      [
        { seed: 'a', luck: 0 },
        { seed: 'a', luck: 1 },
        { seed: 'c', luck: 0 },
        { seed: 'c', luck: 1 },
      ],
      [
        { seed: 'b', luck: 0 },
        { seed: 'b', luck: 1 },
      ],
    ]);
  });

  it('carries a config override of the era caps to npcMarketCaps, and undoes it', () => {
    const before = npcMarketCaps(1960);
    const inForce = setTunables({
      NPC_MARKET_ERA: { anchors: [[1950, { bids: 9, buys: 7, sales: 6 }]] },
      SALE_SHARE: { base: 0.8 },
    });
    try {
      expect(npcMarketCaps(1960)).toEqual({ bids: 9, buys: 7, sales: 6 });
      expect(inForce.NPC_MARKET_ERA).toEqual({ anchors: [[1950, { bids: 9, buys: 7, sales: 6 }]] });
      expect(inForce.SALE_SHARE).toMatchObject({ base: 0.8, spread: 0.08 });
      expect(Object.keys(MARKET_TUNABLES)).toEqual(
        expect.arrayContaining([
          'NPC_MARKET',
          'NPC_MARKET_ERA',
          'SALE_FACTOR_VALUES',
          'TERMS_VALUES',
        ]),
      );
      expect(() => setTunables({ NPC_MARKET_ERA: { nope: 1 } })).toThrow();
      expect(() => setTunables({ MISSING: { a: 1 } })).toThrow();
    } finally {
      setTunables({});
    }
    expect(npcMarketCaps(1960)).toEqual(before);
    // The released table is restored whole (six anchors from T950's 1960 anchor).
    expect(NPC_MARKET_ERA.anchors).toHaveLength(6);
  });

  it('merges overrides into named tunables, echoing them, and refuses a missing setting', () => {
    const registry = { MARKET: { moves: 3, nested: { a: 1, b: 2 } }, OTHER: { x: 1 } };
    const applied = applyTunables(registry, { MARKET: { moves: 5, nested: { b: 9 } } });
    expect(registry.MARKET).toEqual({ moves: 5, nested: { a: 1, b: 9 } });
    expect(applied).toEqual({ MARKET: { moves: 5, nested: { b: 9 } } });
    expect(() => applyTunables(registry, { MARKET: { nope: 1 } })).toThrow();
    expect(() => applyTunables(registry, { MISSING: { a: 1 } })).toThrow();
  });
});

describe('merge', () => {
  it('flattens numeric leaves and takes mean and spread', () => {
    expect(flattenNumbers({ a: 1, b: { c: 2, d: 'x' }, e: [3] })).toEqual({
      a: 1,
      'b.c': 2,
      'e.0': 3,
    });
    expect(spread([2, 4, 6])).toEqual({ n: 3, mean: 4, sd: 2, min: 2, max: 6 });
    expect(spread([5])).toEqual({ n: 1, mean: 5, sd: 0, min: 5, max: 5 });
  });

  it('gives mean and spread per season position, a measure a run lacks counting as 0', () => {
    const merged = mergeSeasons([
      [{ moves: { paid: 10 }, flow: { '0>0': 4 } }, { moves: { paid: 1 } }],
      [{ moves: { paid: 20 } }],
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.runs).toBe(2);
    expect(merged[0]!.measures['moves.paid']).toMatchObject({ n: 2, mean: 15, min: 10, max: 20 });
    expect(merged[0]!.measures['flow.0>0']).toMatchObject({ n: 2, mean: 2 });
    expect(merged[1]!.runs).toBe(1);
  });

  it('keeps burn-in seasons apart from measured seasons', () => {
    const merged = mergeRuns([
      { burnIn: [{ a: 1 }], seasons: [{ a: 10 }] },
      { burnIn: [{ a: 3 }], seasons: [{ a: 20 }] },
    ]);
    expect(merged.runs).toBe(2);
    expect(merged.burnIn[0]!.measures.a!.mean).toBe(2);
    expect(merged.seasons[0]!.measures.a!.mean).toBe(15);
  });
});

describe('start world store', () => {
  const dirs: string[] = [];
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), 'market-seasons-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const key = { identity: 'a'.repeat(64), seed: 'market-0', year: 1951 };

  it('round-trips the canonical world exactly', () => {
    const dir = scratch();
    const w = historyWorld('market-seasons-round-trip');
    const path = saveStartWorld(dir, key, w);
    expect(loadStartWorld(dir, key)).toEqual(w);
    expect(loadStartWorldFile(path)).toEqual(w);
  });

  it('keys by identity, seed and year, and misses on any change', () => {
    const dir = scratch();
    saveStartWorld(dir, key, { a: 1 });
    expect(loadStartWorld(dir, { ...key, seed: 'market-1' })).toBeUndefined();
    expect(loadStartWorld(dir, { ...key, year: 1952 })).toBeUndefined();
    expect(loadStartWorld(dir, { ...key, identity: 'b'.repeat(64) })).toBeUndefined();
    expect(loadStartWorld(dir, key)).toEqual({ a: 1 });
  });

  it('keeps seeds that fold to one file-name spelling apart', () => {
    const dir = scratch();
    const slash = { ...key, seed: 'a/0' },
      underscore = { ...key, seed: 'a_0' };
    expect(startWorldName(slash)).not.toBe(startWorldName(underscore));
    saveStartWorld(dir, slash, { seed: 'a/0' });
    expect(loadStartWorld(dir, underscore)).toBeUndefined();
    saveStartWorld(dir, underscore, { seed: 'a_0' });
    expect(loadStartWorld(dir, slash)).toEqual({ seed: 'a/0' });
    expect(loadStartWorld(dir, underscore)).toEqual({ seed: 'a_0' });
  });

  it('removes an entry whose bytes fail the sha256 check', () => {
    const dir = scratch();
    const path = saveStartWorld(dir, key, { a: 1 });
    writeFileSync(path, Buffer.from('damaged'));
    expect(loadStartWorld(dir, key)).toBeUndefined();
    expect(readdirSync(dir)).toEqual([]);
    const again = saveStartWorld(dir, key, { a: 1 });
    writeFileSync(again, Buffer.from('damaged'));
    expect(() => loadStartWorldFile(again)).toThrow();
  });

  it("stages each write under its own name, leaving another writer's staging untouched", () => {
    const dir = scratch();
    const other = join(dir, `${startWorldName(key)}.json.gz.999999.abcdef.part`);
    writeFileSync(other, 'another writer');
    saveStartWorld(dir, key, { a: 1 });
    saveStartWorld(dir, key, { a: 1 });
    expect(existsSync(other)).toBe(true);
    expect(readdirSync(dir).filter((f) => f.endsWith('.part'))).toEqual([other.split('/').at(-1)]);
    expect(loadStartWorld(dir, key)).toEqual({ a: 1 });
  });

  it('caps the entries, dropping the oldest and keeping the one just written', () => {
    const dir = scratch();
    for (const year of [1, 2, 3]) {
      const k = { ...key, year };
      const path = saveStartWorld(dir, k, { year }, 10);
      utimesSync(path, year, year);
    }
    const newest = { ...key, year: 4 };
    saveStartWorld(dir, newest, { year: 4 }, 2);
    expect(
      readdirSync(dir)
        .filter((f) => f.endsWith('.json.gz'))
        .toSorted(),
    ).toEqual(
      [
        `${startWorldName(newest)}.json.gz`,
        `${startWorldName({ ...key, year: 3 })}.json.gz`,
      ].toSorted(),
    );
    expect(pruneStartWorlds(dir, 2)).toEqual([]);
  });
});
