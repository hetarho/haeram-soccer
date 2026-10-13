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
    w.delegation = { ...w.delegation, contracts: false, manager: true };
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
    expect(load((c) => Object.assign(c.delegation!, { scouting: true }))).toThrow();
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

  it("loads a 1.15 coach-hiring switch as every department's and drops buildYear", () => {
    const w = world();
    const saved = (delegation: Record<string, boolean>) => ({
      ...structuredClone(w),
      engine: '1.15.0',
      delegation,
      build: { fans: 'community' },
      buildYear: w.year,
    });
    const on = validateWorld(saved({ training: true, academy: true, staff: true }));
    expect(on.delegation).toEqual({
      training: true,
      academy: true,
      'coach:assistant': true,
      'coach:attack': true,
      'coach:defense': true,
      'coach:goalkeeping': true,
      'coach:fitness': true,
      'coach:youth': true,
      'coach:scout': true,
    });
    expect('buildYear' in on).toBe(false);
    expect(on.build).toEqual({ fans: 'community' });
    expect(on.buildChanged).toBeUndefined();
    const off = validateWorld(saved({ staff: false }));
    expect(Object.values(off.delegation!)).toEqual(Array(7).fill(false));
    expect(Object.keys(off.delegation!).every((key) => key.startsWith('coach:'))).toBe(true);
    // A reservation of 1.13–1.15 still loads; activation drops it (→SAVE-10).
    const reserved = {
      ...saved({}),
      buildNext: { build: { youth: 'pathway' }, name: '다음 계획' },
    };
    expect(validateWorld(reserved).buildNext).toEqual(reserved.buildNext);
  });

  it('loads coaching levels as hiring criteria and drops managerRule', () => {
    const w = world();
    const saved = (fields: Record<string, unknown>) => ({
      ...structuredClone(w),
      engine: '1.15.0',
      ...fields,
    });
    const defaults = { volunteer: false, minAbility: 55, priority: 'wage', term: 2 } as const;
    const on = validateWorld(
      saved({ coaching: { assistant: 1, attack: 2, scout: 3 }, managerRule: 'strategy' }),
    );
    // 절약 keeps a volunteer, 균형 is the defaults, 최고 asks ability 65, the ablest first.
    expect(on.hiring).toEqual({
      coaches: {
        assistant: { ...defaults, volunteer: true },
        scout: { ...defaults, minAbility: 65, priority: 'ability' },
      },
    });
    expect('coaching' in on).toBe(false);
    expect('managerRule' in on).toBe(false);
    // Every department at 균형 stores nothing; a rules 1.9 club-wide level is every department's.
    expect(validateWorld(saved({ coaching: { attack: 2, defense: 2 } })).hiring).toBeUndefined();
    expect(Object.keys(validateWorld(saved({ coaching: 1 })).hiring!.coaches!)).toHaveLength(7);
    // An existing hiring entry wins over the level.
    const scout = { ...defaults, minAbility: 70, trait: 'spotter' } as const;
    const manager = {
      minOvr: 60,
      schools: [],
      minFlexibility: 0,
      maxPride: 100,
      minYouth: 0,
      traits: [],
      priority: 'ovr',
      term: 2,
      poach: false,
      whenNone: 'wait',
    } as const;
    expect(
      validateWorld(
        saved({ coaching: { scout: 3, fitness: 1 }, hiring: { manager, coaches: { scout } } }),
      ).hiring,
    ).toEqual({ manager, coaches: { scout, fitness: { ...defaults, volunteer: true } } });
    // A level outside 1–3 or an unknown department is still a corrupt save.
    expect(() => validateWorld(saved({ coaching: { attack: 4 } }))).toThrow();
    expect(() => validateWorld(saved({ coaching: { kit: 3 } }))).toThrow();
  });

  it('accepts hiring, talkRule and buildChanged and refuses unknown criteria keys', () => {
    const w = world();
    w.hiring = {
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
        scout: { volunteer: false, minAbility: 70, trait: 'spotter', priority: 'ability', term: 4 },
        fitness: { volunteer: true, minAbility: 55, priority: 'wage', term: 2 },
      },
    };
    w.talkRule = { maxPay: 1.25, minOvr: 60, maxAge: 33 };
    w.buildChanged = { youth: { year: w.year, day: 10 }, culture: { year: w.year - 1, day: 300 } };
    w.delegation = { ...w.delegation, 'coach:scout': true, manager: true };
    expect(canonical(validateWorld(structuredClone(w)))).toBe(canonical(w));
    const load = (change: (copy: World) => unknown) => () => {
      const copy = structuredClone(w);
      change(copy);
      return validateWorld(copy);
    };
    expect(load((c) => Object.assign(c.hiring!.manager!, { budget: 1 }))).toThrow();
    expect(load((c) => Object.assign(c.hiring!.coaches!.scout!, { budget: 1 }))).toThrow();
    expect(load((c) => Object.assign(c.hiring!, { director: {} }))).toThrow();
    expect(
      load((c) => Object.assign(c.hiring!.coaches!, { kit: c.hiring!.coaches!.scout })),
    ).toThrow();
    expect(load((c) => Object.assign(c.talkRule!, { minWage: 1 }))).toThrow();
    expect(load((c) => (c.hiring!.manager!.schools = ['tiki-taka' as never]))).toThrow();
    expect(load((c) => (c.hiring!.manager!.schools = ['counter', 'counter']))).toThrow();
    expect(load((c) => (c.hiring!.manager!.maxWageOvr = 52 as never))).toThrow();
    expect(load((c) => (c.hiring!.manager!.minOvr = 100))).toThrow();
    expect(load((c) => (c.hiring!.coaches!.scout!.minAbility = 54.5))).toThrow();
    expect(load((c) => (c.talkRule!.maxPay = 1.2 as never))).toThrow();
    expect(load((c) => (c.talkRule!.maxAge = 41))).toThrow();
    expect(
      load((c) => Object.assign(c.buildChanged!, { stadium: { year: w.year, day: 0 } })),
    ).toThrow();
    expect(load((c) => (c.buildChanged!.youth = { year: w.year, day: 366 }))).toThrow();
    expect(load((c) => Object.assign(c.delegation!, { 'coach:kit': true }))).toThrow();
  });
});
