import { describe, expect, it } from 'vitest';
import { canonical } from './index';
import { validateWorld, type LoadCatalog } from './schema';
import type { LedgerKind, Sponsor, SponsorContract, World } from './types';
import { createWorld } from '../../engine/src/index';
import { LOAD_CATALOG } from '../../catalogs/src/index';
it('round trips exact monetary strings without losing integer precision', () => {
  const facts = {
    currency: 'ITL',
    amount: '10000000000000000001',
    events: [{ id: 'e1', year: 1901 }],
  };
  expect(JSON.parse(canonical(facts))).toEqual(facts);
});

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Contract Rovers',
    color: '#224466',
    seed: 'contracts',
    difficulty: 2,
  });
/** The world as rules 1.15 saved it, with that rule's single sponsor. */
const legacy = (w: World, sponsor: Sponsor) => ({
  ...structuredClone(w),
  engine: '1.15.0',
  sponsor,
});

describe('rules 1.16 contracts (→SAVE-10)', () => {
  it("loads a 1.15 sponsor as its slot's contract, keeping its amounts and end", () => {
    const w = world();
    const sponsor: Sponsor = {
      name: 'Rovers Foundry',
      kind: 'exclusive',
      annual: '12345678901234567890',
      bonus: '0',
      until: w.year + 4,
      lastPaid: w.year - 1,
      index: w.priceIndex,
    };
    const loaded = validateWorld(legacy(w, sponsor), LOAD_CATALOG);
    expect(loaded.sponsor).toBeUndefined();
    // ENG opens the shirt-front slot in 1979, so a sponsor of the 1950 founding is a local partner.
    expect(loaded.sponsors).toEqual([
      {
        slot: 'local',
        name: sponsor.name,
        kind: 'exclusive',
        annual: sponsor.annual,
        bonus: '0',
        from: w.year,
        until: w.year + 4,
        lastPaid: w.year - 1,
        index: w.priceIndex,
      },
    ]);
    // Wages, terms, delegation and every other fact stay as they were.
    const { sponsors, ...rest } = loaded;
    expect(sponsors).toHaveLength(1);
    expect(canonical(rest)).toBe(canonical({ ...w, engine: '1.15.0' }));

    // Once the shirt-front slot is open, the sponsor is the 메인 스폰서; a two-season offer of last
    // season began then.
    const opened: LoadCatalog = {
      sponsorSlotOpens: (country, slot) =>
        slot === 'shirt' ? w.year : LOAD_CATALOG.sponsorSlotOpens(country, slot),
    };
    const stable = { ...sponsor, kind: 'stable', bonus: '0', until: w.year + 1 } as const;
    expect(validateWorld(legacy(w, stable), opened).sponsors).toEqual([
      expect.objectContaining({
        slot: 'shirt',
        kind: 'stable',
        from: w.year - 1,
        until: w.year + 1,
      }),
    ]);
  });

  it('round-trips sponsor contracts, talks, unhappiness, terms, delegation and new kinds', () => {
    const w = world();
    const [player, other] = w.players;
    player.talk = {
      kind: 'improve',
      demand: '250000',
      floor: '212500',
      year: w.year,
      day: 0,
      clauses: { promotion: 25, relegation: -40 },
    };
    player.improveAsked = w.year;
    player.agent = 4;
    player.clauses = { relegation: -35 };
    player.unhappy = { reason: 'improve-declined', year: w.year, day: 41 };
    player.transferRequest = { year: w.year, day: 83 };
    // A club whose goodwill is negative sets the floor above the demand.
    other.talk = { kind: 'renew', demand: '1000', floor: '1100', year: w.year, day: 153 };
    w.manager.term = 3;
    w.staff![0].term = 1;
    w.intervention = 4;
    w.sponsors = [
      {
        slot: 'local',
        name: 'Rovers Cooperative',
        kind: 'stable',
        annual: '40000',
        bonus: '0',
        from: w.year,
        until: w.year + 2,
        lastPaid: w.year - 1,
        index: w.priceIndex,
      },
      {
        slot: 'kit',
        name: 'Rovers Textiles',
        kind: 'performance',
        annual: '90000',
        bonus: '30000',
        from: w.year - 1,
        until: w.year + 4,
        lastPaid: w.year - 1,
        index: w.priceIndex,
      },
    ];
    const kinds = ['contract-talk', 'unhappy', 'transfer-request', 'sponsor-ending'] as const;
    kinds.forEach((kind, i) =>
      w.inbox!.push({
        id: `realism-${i}`,
        year: w.year,
        day: i,
        kind,
        title: kind,
        detail: '',
        attention: true,
        ref: player.id,
      }),
    );
    const ledger: LedgerKind[] = [
      'league-share',
      'league-merit',
      'parachute',
      'sponsor:shirt',
      'free-transfer-compensation',
      'operating-expenses',
    ];
    for (const kind of ledger)
      w.events.push({ year: w.year, round: 0, kind, title: kind, detail: '', amount: '1000' });
    expect(canonical(validateWorld(structuredClone(w)))).toBe(canonical(w));
  });

  it('still refuses unknown keys and values outside the contracts', () => {
    const w = world();
    const contract: SponsorContract = {
      slot: 'local',
      name: 'Rovers Cooperative',
      kind: 'stable',
      annual: '40000',
      bonus: '0',
      from: w.year,
      until: w.year + 2,
      lastPaid: w.year - 1,
      index: w.priceIndex,
    };
    const load = (change: (copy: World) => unknown) => () => {
      const copy = structuredClone(w);
      change(copy);
      return validateWorld(copy, LOAD_CATALOG);
    };
    expect(load((c) => (c.sponsors = [contract]))).not.toThrow();
    expect(load((c) => (c.sponsors = [Object.assign({ extra: 1 }, contract)]))).toThrow();
    expect(load((c) => (c.sponsors = [contract, { ...contract, name: 'Twice' }]))).toThrow(
      '후원 계약 손상',
    );
    expect(load((c) => (c.sponsors = [{ ...contract, annual: '-1' }]))).toThrow();
    expect(load((c) => (c.sponsors = [{ ...contract, from: w.year + 3 }]))).toThrow();
    expect(
      load((c) => (c.sponsors = [Object.assign({ ...contract }, { slot: 'pitch' })])),
    ).toThrow();
    const talk = { kind: 'renew', demand: '1', floor: '1', year: w.year, day: 0 } as const;
    expect(load((c) => (c.players[0].talk = talk))).not.toThrow();
    // Agents are rated 1–5; a promotion clause rises and a relegation clause cuts (→CLUB-29).
    expect(load((c) => (c.players[0].agent = 6 as 5))).toThrow();
    expect(load((c) => (c.players[0].clauses = { promotion: -10 }))).toThrow();
    expect(load((c) => (c.players[0].clauses = { relegation: 30 }))).toThrow();
    expect(load((c) => (c.players[0].clauses = { promotion: 20, relegation: -30 }))).not.toThrow();
    expect(load((c) => (c.players[0].talk = Object.assign({ wage: '1' }, talk)))).toThrow();
    expect(load((c) => (c.players[0].talk = { ...talk, demand: '-1' }))).toThrow();
    expect(
      load((c) =>
        Object.assign(c.players[0], { unhappy: { reason: 'bench', year: w.year, day: 0 } }),
      ),
    ).toThrow();
    expect(
      load((c) =>
        Object.assign(c.players[0], { transferRequest: { year: w.year, day: 0, by: 'agent' } }),
      ),
    ).toThrow();
    expect(load((c) => Object.assign(c, { delegation: { scouting: true } }))).toThrow();
    expect(load((c) => Object.assign(c, { intervention: 5 }))).toThrow();
    expect(load((c) => Object.assign(c.manager, { term: 6 }))).toThrow();
    expect(load((c) => Object.assign(c.staff![0], { term: 0 }))).toThrow();
    expect(
      load((c) =>
        c.inbox!.push(
          Object.assign(
            { id: 'gossip', year: w.year, day: 0, title: '', detail: '', attention: false },
            { kind: 'gossip' as never },
          ),
        ),
      ),
    ).toThrow();
    // A 1.15 sponsor needs the catalog that says which slot it fills, and sound amounts.
    const { name, kind, annual, bonus, until, lastPaid, index } = contract;
    const sponsor: Sponsor = { name, kind, annual, bonus, until, lastPaid, index };
    expect(() => validateWorld(legacy(w, sponsor))).toThrow('카탈로그');
    expect(() => validateWorld(legacy(w, { ...sponsor, bonus: '-1' }), LOAD_CATALOG)).toThrow(
      '후원 계약 손상',
    );
    // It cannot share its slot with a contract already held there.
    expect(() =>
      validateWorld({ ...legacy(w, sponsor), sponsors: [contract] }, LOAD_CATALOG),
    ).toThrow('후원 계약 손상');
  });

  it('loads staff switches as the intervention level and drops buildYear', () => {
    const w = world();
    const saved = (delegation: Record<string, boolean>) => {
      const copy: Record<string, unknown> = {
        ...structuredClone(w),
        engine: '1.15.0',
        delegation,
        build: { fans: 'community' },
        buildYear: w.year,
      };
      delete copy.intervention;
      return copy;
    };
    const level = (delegation: Record<string, boolean>) =>
      validateWorld(saved(delegation)).intervention;
    // Offers, sponsors, a coaching department or the manager post were only level 4's.
    for (const key of ['transfers', 'business', 'manager', 'staff', 'coach:scout'])
      expect(level({ training: true, academy: true, [key]: true })).toBe(4);
    expect(level({ training: true, academy: true, transfers: false })).toBe(2);
    expect(level({ academy: false, contracts: true })).toBe(2);
    expect(level({ training: false, academy: false, staff: false })).toBe(1);
    expect(level({})).toBe(1);
    const on = validateWorld(saved({ training: true, academy: true, staff: true }));
    expect('delegation' in on).toBe(false);
    // A saved level wins over switches kept beside it.
    expect(validateWorld({ ...saved({ manager: true }), intervention: 2 }).intervention).toBe(2);
    expect('buildYear' in on).toBe(false);
    expect(on.build).toEqual({ fans: 'community' });
    expect('buildChanged' in on).toBe(false);
    // A reservation of 1.13–1.15 still loads; activation drops it (→SAVE-10).
    const reserved = {
      ...saved({}),
      buildNext: { build: { youth: 'pathway' }, name: '다음 계획' },
    };
    // 1군 직행 경로 is no card since rules 1.18: a reservation holding it loads without it.
    expect(validateWorld(reserved).buildNext).toEqual({ build: {}, name: '다음 계획' });
    const kept = { ...saved({}), buildNext: { build: { youth: 'elite' }, name: '다음 계획' } };
    expect(validateWorld(kept).buildNext).toEqual(kept.buildNext);
    // A build holding it loads with 데뷔 시점 빠른 데뷔, which took its effects (→CLUB-32).
    const pathway = validateWorld({ ...saved({}), build: { youth: 'pathway', fans: 'community' } });
    expect(pathway.build).toEqual({ fans: 'community' });
    expect(pathway.direction).toEqual({ debut: 'early' });
  });

  it('loads coaching levels as the nearest 코치 기조 and drops managerRule', () => {
    const w = world();
    const saved = (fields: Record<string, unknown>) => ({
      ...structuredClone(w),
      engine: '1.15.0',
      ...fields,
    });
    const on = validateWorld(
      saved({ coaching: { assistant: 1, attack: 2, scout: 3 }, managerRule: 'strategy' }),
    );
    // One 절약 and one 최고 among seven departments: the rest at 균형 keep 표준.
    expect(on.direction).toBeUndefined();
    expect('coaching' in on).toBe(false);
    expect('managerRule' in on).toBe(false);
    expect('hiring' in on).toBe(false);
    // A rules 1.9 club-wide level is every department's.
    expect(validateWorld(saved({ coaching: 1 })).direction).toEqual({ coaches: 'volunteer' });
    expect(validateWorld(saved({ coaching: 3 })).direction).toEqual({ coaches: 'elite' });
    // A level outside 1–3 or an unknown department is still a corrupt save.
    expect(() => validateWorld(saved({ coaching: { attack: 4 } }))).toThrow();
    expect(() => validateWorld(saved({ coaching: { kit: 3 } }))).toThrow();
  });

  it('loads rules-1.16 hiring and talkRule as direction rows and refuses malformed criteria', () => {
    const w = world();
    w.intervention = 4;
    w.trainingOrders = {
      assistant: { focus: 'youth', rounds: 3 },
      youth: { focus: 'firstTeam', rounds: 4, forced: true },
    };
    w.staff![0] = {
      ...w.staff![0],
      strain: { year: w.year, count: 2 },
      asked: { year: w.year, round: 5 },
    };
    const legacy = {
      ...structuredClone(w),
      engine: '1.16.0',
      hiring: {
        manager: {
          minOvr: 60,
          schools: ['positional', 'developer'],
          minFlexibility: 30,
          maxPride: 80,
          minYouth: 50,
          traits: ['none', 'youth'],
          maxWageOvr: 75,
          priority: 'potential',
          term: 3,
          poach: true,
          whenNone: 'best',
        },
        coaches: {
          scout: {
            volunteer: false,
            minAbility: 70,
            trait: 'spotter',
            priority: 'ability',
            term: 4,
          },
          fitness: { volunteer: true, minAbility: 55, priority: 'wage', term: 2 },
        },
      },
      talkRule: { maxPay: 1.25, minOvr: 60, maxAge: 33 },
    };
    // 육성 50+ reads as 육성가; two schools, two departments of seven and a 125% cap stay at the
    // defaults.
    const loaded = validateWorld(structuredClone(legacy));
    expect(loaded.direction).toEqual({ manager: 'developer' });
    expect(canonical(loaded)).toBe(
      canonical({ ...structuredClone(w), engine: '1.16.0', direction: { manager: 'developer' } }),
    );
    const load = (change: (copy: typeof legacy) => unknown) => () => {
      const copy = structuredClone(legacy);
      change(copy);
      return validateWorld(copy);
    };
    expect(load((c) => Object.assign(c.hiring.manager, { budget: 1 }))).toThrow();
    expect(load((c) => Object.assign(c.hiring.coaches.scout, { budget: 1 }))).toThrow();
    expect(load((c) => Object.assign(c.hiring, { director: {} }))).toThrow();
    expect(load((c) => Object.assign(c.hiring.coaches, { kit: c.hiring.coaches.scout }))).toThrow();
    expect(load((c) => Object.assign(c.talkRule, { minWage: 1 }))).toThrow();
    expect(load((c) => (c.hiring.manager.schools = ['tiki-taka']))).toThrow();
    expect(load((c) => (c.hiring.manager.schools = ['counter', 'counter']))).toThrow();
    expect(load((c) => (c.hiring.manager.maxWageOvr = 52))).toThrow();
    expect(load((c) => (c.hiring.manager.minOvr = 100))).toThrow();
    expect(load((c) => (c.hiring.coaches.scout.minAbility = 54.5))).toThrow();
    expect(load((c) => (c.talkRule.maxPay = 1.2))).toThrow();
    expect(load((c) => (c.talkRule.maxAge = 41))).toThrow();
    // A direction row outside its options is refused too.
    expect(() =>
      validateWorld({ ...structuredClone(w), direction: { finance: 'reckless' } }),
    ).toThrow();
    // A per-slot strategy lock kept by earlier 1.16 builds loads as no lock (→SAVE-10).
    const locked = load((c) =>
      Object.assign(c, { buildChanged: { youth: { year: w.year, day: 10 } } }),
    )();
    expect('buildChanged' in locked).toBe(false);
    expect(canonical(locked)).toBe(canonical(loaded));
    expect(load((c) => Object.assign(c, { delegation: { 'coach:kit': true } }))).toThrow();
    expect(load((c) => (c.trainingOrders!.assistant!.rounds = 5))).toThrow();
    expect(load((c) => Object.assign(c.trainingOrders!.youth!, { focus: 'recovery' }))).toThrow();
    // The owner's own focus of earlier builds goes: the coaches set it (→SAVE-10).
    const owned = load((c) => Object.assign(c, { training: 'youth' }))();
    expect('training' in owned).toBe(false);
  });
});

describe('rules 1.19 contracts (→SAVE-10)', () => {
  const saved = (fields: Record<string, unknown>) => ({
    ...structuredClone(world()),
    engine: '1.18.0',
    ...fields,
  });

  it('loads the marketing dial as 해외 마케팅 and drops the 글로벌 브랜드 card', () => {
    const loud = validateWorld(
      saved({ policy: { support: 4, recruitment: 3, marketing: 4, academy: 2 } }),
    );
    expect(loud.policy).toEqual({ support: 4, recruitment: 3, academy: 2, globalMarketing: 4 });
    // The default level carries nothing over.
    const quiet = validateWorld(saved({ policy: { support: 3, recruitment: 3, marketing: 1 } }));
    expect(quiet.policy).toEqual({ support: 3, recruitment: 3 });
    // A build or a reservation holding 글로벌 브랜드 loads without it.
    const branded = validateWorld(
      saved({
        build: { fans: 'global', revenue: 'commercial' },
        buildNext: { build: { fans: 'global' }, name: '다음 계획' },
      }),
    );
    expect(branded.build).toEqual({ revenue: 'commercial' });
    expect(branded.buildNext).toEqual({ build: {}, name: '다음 계획' });
    expect('build' in validateWorld(saved({ build: { fans: 'global' } }))).toBe(false);
    // A save already on 1.19 loads unchanged; the bases stay within 0–100.
    const current = saved({
      engine: '1.19.0',
      policy: { support: 3, recruitment: 3, localInvest: 5, tour: 3 },
      localBase: 42.5,
      globalReach: 7,
    });
    expect(canonical(validateWorld(structuredClone(current)))).toBe(canonical(current));
    for (const fields of [
      { localBase: 101 },
      { globalReach: -1 },
      { policy: { support: 3, recruitment: 3, tour: 4 } },
      { policy: { support: 3, recruitment: 3, grassroots: 6 } },
      { build: { fans: 'nowhere' } },
    ])
      expect(() => validateWorld(saved({ engine: '1.19.0', ...fields }))).toThrow();
  });
});

describe('rules 1.20 contracts (→SAVE-10)', () => {
  it("keeps the chief scout's marker on a bid and refuses any other", () => {
    const w = world();
    const bid = {
      id: 'out:1950:0:staff:p1',
      direction: 'out' as const,
      playerId: 'p1',
      fee: '0',
      year: w.year,
      day: 0,
      due: 0,
      status: 'completed' as const,
      staff: 'short' as const,
    };
    const saved = { ...structuredClone(w), engine: '1.20.0', bids: [bid] };
    expect(validateWorld(structuredClone(saved)).bids).toEqual([bid]);
    expect(() => validateWorld({ ...saved, bids: [{ ...bid, staff: 'owner' }] })).toThrow();
    // A 1.19 checkpoint loads as it was.
    const older = { ...structuredClone(w), engine: '1.19.0' };
    expect(canonical(validateWorld(structuredClone(older)))).toBe(canonical(older));
  });
});
