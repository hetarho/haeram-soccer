import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { SaveCompatibilityError } from './versions';
import { LOAD_CATALOG } from '../../catalogs/src/index';
import { addEvent } from '../../engine/src/events';
import { careerDate } from '../../engine/src/person-careers';
import { withOwner } from '../../engine/src/testing';
import { validateWorld } from './schema';
import { CAREER_READS_FORMAT, OBSOLETE_CAREER_READS_FORMAT } from './career-reads';
import { initializeCareerReads } from '../../engine/src/career-reads';
import { initializeNewsJournal } from '../../engine/src/news';
import type { World } from './types';
import { careerWorld } from '../../engine/src/career.testkit';

const world = () => careerWorld({ seed: 'withdrawn-interventions' });

describe('owner interventions withdrawn (→SAVE-25)', () => {
  it('drops removed care state from an older save', () => {
    const w = world();
    // A paid request and a pending win bonus, as a career saved before CLUB-20 was withdrawn.
    addEvent(w, 'care:camp', '단기 전지훈련 캠프', '스태프 · 체력과 분위기를 함께 회복', '1000');
    addEvent(w, 'care:win-bonus', '승리 수당 걸기 (다음 5경기)', '구단주 · 선수단이 동기부여됨');
    const older = { ...structuredClone(w), winBonus: { matches: 3 } } as World & {
      winBonus: { matches: number };
    };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('winBonus');
    // Every other fact stays as saved, the recorded requests among the club's events.
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    expect(loaded.events.slice(-2).map((event) => event.kind)).toEqual([
      'care:camp',
      'care:win-bonus',
    ]);
    // Reading never writes: the save itself is left for the writer's next checkpoint.
    expect(older.winBonus).toEqual({ matches: 3 });
  });

  it('drops removed training orders from an older save', () => {
    const w = world();
    // Orders the owner had the coaches take and the strain they left, as a career saved before
    // STAFF-19 was withdrawn: the coaches' own calls decide from here (→CLUB-13, CLUB-31).
    const older = structuredClone(w) as World & {
      trainingOrders: unknown;
      staff: (NonNullable<World['staff']>[number] & { strain?: unknown; asked?: unknown })[];
    };
    const player = w.players[0]!.id;
    older.trainingOrders = {
      assistant: { focus: 'hard', rounds: 3, forced: true },
      youth: { focus: 'firstTeam', rounds: 2 },
      players: { [player]: { focus: 'recovery', rounds: 4 } },
      asked: { [player]: { year: w.year, round: 0 } },
      hardStreak: 2,
    };
    older.staff[0] = {
      ...older.staff[0]!,
      strain: { year: w.year, count: 2 },
      asked: { year: w.year, round: 0 },
    };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('trainingOrders');
    // The squad's 하드 streak was kept among the orders: it restarts with the next 하드 round.
    expect(loaded.hardStreak).toBeUndefined();
    for (const member of loaded.staff!) {
      expect(member).not.toHaveProperty('strain');
      expect(member).not.toHaveProperty('asked');
    }
    // Every other fact stays as saved.
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    // Reading never writes: the save itself is left for the writer's next checkpoint.
    expect(older.staff[0]!.strain).toEqual({ year: w.year, count: 2 });
    expect(older.trainingOrders).toBeDefined();
  });

  it('drops removed tactic requests and owner lineups from an older save', () => {
    const w = world();
    // A request answered this round, one waiting on support and a saved XI, as a career saved
    // before STAFF-2 was withdrawn: the manager picks the tactic and the XI (→CLUB-6, STAFF-22).
    addEvent(w, 'manager-response', '감독의 답변', '점유율 요청 · 조건부 수락입니다.');
    addEvent(w, 'lineup', '다음 경기 선발을 정했습니다', '선발 11명 · 평균 피로 12');
    const older = {
      ...structuredClone(w),
      requested: 'possession',
      lineup: w.players.slice(0, 11).map((player) => player.id),
      manager: {
        ...structuredClone(w.manager),
        lastRequest: 'possession:evidence',
        requestHistory: { at: `${w.year}:0`, keys: ['possession:evidence'], trustAwarded: false },
        pending: 'possession',
        conflicts: 2,
      },
    };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('requested');
    expect(loaded).not.toHaveProperty('lineup');
    for (const key of ['lastRequest', 'requestHistory', 'pending', 'conflicts'])
      expect(loaded.manager).not.toHaveProperty(key);
    // Every other fact stays as saved, the recorded answer and XI among the club's events.
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    expect(loaded.events.slice(-2).map((event) => event.kind)).toEqual([
      'manager-response',
      'lineup',
    ]);
    // Reading never writes: the save itself is left for the writer's next checkpoint.
    expect(older.manager.pending).toBe('possession');
    expect(older.lineup).toHaveLength(11);
  });

  it('drops the removed owner capital count from an older save', () => {
    const w = world();
    // A capital receipt and its count, and a stadium work under way, as a career saved before
    // ECON-11 withdrew the owner's capital and ECON-32 his facility works.
    addEvent(w, 'support', '구단주 추가 출자', '운영 매출과 별도 · 평판 -2', '1000');
    w.facilityWorks = { stadium: { to: 1, year: w.year, day: 0 } };
    const older = { ...structuredClone(w), support: 1 } as World & { support: number };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('support');
    // Every other fact stays as saved: the receipt among the events, the work to finish on its day.
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    expect(loaded.events.at(-1)!.kind).toBe('support');
    expect(loaded.facilityWorks).toEqual({ stadium: { to: 1, year: w.year, day: 0 } });
    // Reading never writes: the save itself is left for the writer's next checkpoint.
    expect(older.support).toBe(1);
  });

  it('drops the removed coaching encouragement from an older save', () => {
    const w = world();
    // A retiring player the owner encouraged toward coaching, as a career saved before STAFF-29
    // was withdrawn: his intention keeps its draw and willingness (→STAFF-25), the encouragement
    // goes and none is written again (→HIST-14).
    const player = w.players[0]!,
      at = careerDate(w);
    w.people![player.id]!.intention = { at, draw: 0.55, willing: true };
    addEvent(
      w,
      'coaching-encouragement',
      `${player.name} 지도자 진로 권유`,
      '권유를 받아들여 은퇴 뒤 지도자의 길을 준비해요.',
    );
    const older = structuredClone(w);
    Object.assign(older.people![player.id]!.intention!, { encouraged: { at, changed: true } });
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded.people![player.id]!.intention).toEqual({ at, draw: 0.55, willing: true });
    // Every other fact stays as saved, the recorded encouragement among the club's events.
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    expect(loaded.events.at(-1)!.kind).toBe('coaching-encouragement');
    // Reading never writes: the save itself is left for the writer's next checkpoint.
    expect(older.people![player.id]!.intention).toHaveProperty('encouraged');
  });

  it('drops the removed intervention level from an older save', () => {
    const w = world();
    // A career founded with its level beside the settings, as saved before the level was
    // withdrawn: the settings alone say who decides (→WEB-45, SAVE-17).
    const older = { ...structuredClone(w), intervention: 2 } as World & { intervention: number };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('intervention');
    expect(loaded.settings).toEqual(w.settings);
    // Every other fact stays as saved.
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    // Reading never writes: the save itself is left for the writer's next checkpoint.
    expect(older.intervention).toBe(2);
  });

  it('drops the removed difficulty level from a checkpoint that still carries it', () => {
    const w = world();
    // A 0.8.0 checkpoint written while the world still kept the founding's level (→WEB-3 [x]):
    // a takeover career has no level, and the world schema strips the key (→SAVE-26).
    const older = { ...structuredClone(w), level: 'easy' } as World & { level: string };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('level');
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    expect(older.level).toBe('easy');
  });

  it('drops the removed amateur-league flag from a checkpoint that still carries it', () => {
    const w = world();
    // A 0.8.0 checkpoint written while the world still had an amateur level (→WORLD-9 [x]): a
    // takeover career always played professionally, and the world schema strips the key.
    const older = { ...structuredClone(w), lower: false } as World & { lower: boolean };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('lower');
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    expect(older.lower).toBe(false);
  });
});

describe('owner and takeover (→SAVE-27)', () => {
  it('accepts and round-trips owner, loan and books', () => {
    const w = world();
    withOwner(w, {
      tier: 'industrial',
      traits: ['businessman', 'fansFriend', 'politician'],
      fortune: '-125000',
      stake: 35,
      dividendShare: 75,
      fanMood: 13.6,
      starSaleWindow: { year: w.year, kind: 'winter' },
      ownerCrisis: { since: { year: w.year, day: 92 } },
      fanCrisis: { rounds: 3 },
      ffpInjections: [{ season: w.year, amount: '40000' }],
      seasonRecords: [
        {
          year: w.year,
          currency: w.currency,
          fortune: '-125000',
          business: '-30000',
          living: '2000',
          injected: '40000',
          dividend: '0',
          fanMood: 13.6,
        },
      ],
    });
    w.loan = { balance: '900000', installment: '207000', seasonsLeft: 5 };
    w.ended = 'owner';
    const other = w.clubs.find((club) => club.id !== w.playerClub)!;
    other.books = {
      seasons: [
        {
          year: w.year,
          income: '500000',
          incomeComponents: {
            distribution: '100000',
            gate: '200000',
            commercial: '0',
            competitions: '200000',
          },
          ownerCapital: '900719925474099312345',
          wages: '420000',
          costs: '150000',
          result: '-70000',
        },
        { year: w.year - 1, income: '480000', wages: '400000', costs: '140000', result: '-60000' },
      ],
      cash: '0',
      debt: '130000',
    };
    const loaded = validateWorld(structuredClone(w), LOAD_CATALOG);
    expect(loaded.owner).toEqual(w.owner);
    expect(loaded.loan).toEqual(w.loan);
    expect(loaded.ended).toBe('owner');
    expect(loaded.clubs.find((club) => club.id === other.id)!.books).toEqual(other.books);
    expect(loaded.clubs.find((club) => club.id === other.id)!.books!.seasons[1]).not.toHaveProperty(
      'ownerCapital',
    );
    expect(loaded.clubs.find((club) => club.id === other.id)!.books!.seasons[1]).not.toHaveProperty(
      'incomeComponents',
    );
    for (const invalid of ['-1', '1.5', '', '1e3', 1, null]) {
      for (const field of ['ownerCapital', 'distribution', 'gate', 'commercial', 'competitions']) {
        const broken = structuredClone(w);
        const book = broken.clubs.find((club) => club.id === other.id)!.books!.seasons[0];
        if (field === 'ownerCapital') Object.assign(book, { ownerCapital: invalid });
        else Object.assign(book.incomeComponents!, { [field]: invalid });
        expect(() => validateWorld(broken, LOAD_CATALOG)).toThrow();
      }
    }
    const incomplete = structuredClone(w);
    delete (
      incomplete.clubs.find((club) => club.id === other.id)!.books!.seasons[0]
        .incomeComponents as Partial<
        NonNullable<(typeof other.books.seasons)[0]['incomeComponents']>
      >
    ).gate;
    expect(() => validateWorld(incomplete, LOAD_CATALOG)).toThrow();
    // A save of it reads back the same world.
    expect(validateWorld(JSON.parse(JSON.stringify(loaded)), LOAD_CATALOG)).toEqual(loaded);
    // A save carrying none of it (an older one) validates as before.
    const older = world();
    delete older.owner;
    for (const club of older.clubs) delete club.books;
    const plain = validateWorld(older, LOAD_CATALOG);
    for (const key of ['owner', 'loan', 'ended'] as const) expect(plain).not.toHaveProperty(key);
    expect(plain.clubs.every((club) => club.books === undefined)).toBe(true);
  });

  it.each([
    [
      'six traits',
      {
        traits: ['talisman', 'negotiator', 'networker', 'talentSpotter', 'marketer', 'politician'],
      },
    ],
    ['a trait twice', { traits: ['talisman', 'talisman'] }],
    ['a stake above 100%', { stake: 101 }],
    ['a stake in part percent', { stake: 12.5 }],
    ['a dividend off the dial', { dividendShare: 30 }],
    ['팬 민심 above 100', { fanMood: 100.5 }],
    ['invalid star-sale window', { starSaleWindow: { year: 1950, kind: 'spring' } }],
    ['fractional star-sale season', { starSaleWindow: { year: 1950.5, kind: 'summer' } }],
  ])('refuses an owner with %s', (_, owner) => {
    const w = world();
    withOwner(w, owner as never);
    expect(() => validateWorld(w, LOAD_CATALOG)).toThrow();
  });
});

describe('optional career-read format boundary', () => {
  it('discards only a recognized obsolete object without changing retained facts or the input', () => {
    const current = world();
    initializeNewsJournal(current);
    initializeCareerReads(current);
    expect(current.careerReads!.format).toBe(CAREER_READS_FORMAT);
    const expected = validateWorld(current, LOAD_CATALOG);
    delete expected.careerReads;
    // Obsolete contents are derived data, not a required legacy schema to maintain.
    for (const careerReads of [
      { ...current.careerReads, format: OBSOLETE_CAREER_READS_FORMAT },
      { format: OBSOLETE_CAREER_READS_FORMAT, matches: 'invalid old cursor', players: null },
    ]) {
      const input = { ...current, careerReads };
      const before = structuredClone(input);
      expect(validateWorld(input, LOAD_CATALOG)).toEqual(expected);
      expect(input).toEqual(before);
    }
    expect(expected.newsJournal!.format).toBe(1);
  });

  it('retains a valid current summary and still validates its cursors against retained facts', () => {
    const current = world();
    initializeCareerReads(current);
    expect(validateWorld(current, LOAD_CATALOG).careerReads).toEqual(current.careerReads);
    for (const invalid of [
      { matches: current.ownMatches.length + 1 },
      { events: current.events.length + 1 },
      { history: current.history.length + 1 },
      { year: current.year + 1 },
    ])
      expect(() =>
        validateWorld(
          { ...current, careerReads: { ...current.careerReads, ...invalid } },
          LOAD_CATALOG,
        ),
      ).toThrow();
  });

  it('protects unknown/future formats and validates malformed current summaries normally', () => {
    const current = world();
    initializeCareerReads(current);
    for (const careerReads of [
      null,
      [],
      '1',
      { format: '1' },
      { format: '2' },
      { ...current.careerReads, format: 0 },
      { ...current.careerReads, format: CAREER_READS_FORMAT + 1 },
      {},
    ])
      expect(() => validateWorld({ ...current, careerReads }, LOAD_CATALOG)).toThrow(
        SaveCompatibilityError,
      );
    for (const careerReads of [
      { ...current.careerReads, matches: -1 },
      { format: CAREER_READS_FORMAT },
    ])
      expect(() => validateWorld({ ...current, careerReads }, LOAD_CATALOG)).toThrow(ZodError);
    expect(validateWorld({ ...current, careerReads: undefined }, LOAD_CATALOG).careerReads).toBe(
      undefined,
    );
  });
});

describe('club debt history (→ECON-24)', () => {
  it('round-trips a negative balance with debt history longer than one season', () => {
    const w = world();
    for (const rounds of [47, 92]) {
      const saved = { ...structuredClone(w), cash: '-1', insolvent: rounds };
      const loaded = validateWorld(JSON.parse(JSON.stringify(saved)), LOAD_CATALOG);
      expect(loaded.insolvent).toBe(rounds);
      expect(loaded.cash).toBe('-1');
      expect(loaded.bankrupt).toBeUndefined();
    }
  });

  it('still rejects non-positive, fractional and unsafe debt counters', () => {
    const w = world();
    for (const rounds of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => validateWorld({ ...w, cash: '-1', insolvent: rounds }, LOAD_CATALOG)).toThrow(
        ZodError,
      );
  });
});
