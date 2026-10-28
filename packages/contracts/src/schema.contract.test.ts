import {
  SaveCompatibilityError,
  SUPPORTED_ENGINE_VERSIONS,
  LEGACY_ENGINE_VERSIONS,
  upgradeWorldRules,
} from './versions';
import { CURRENT_CATALOG } from '../../catalogs/src/index';
import { describe, expect, it } from 'vitest';
import { canonical } from './index';
import { validateWorld, type LoadCatalog } from './schema';
import type { LedgerKind, Sponsor, SponsorContract, TransferFact, World } from './types';
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from './detail';
import { MATCH_MODEL_REVISION, type MatchModelState, type NpcSeasonStats } from './match-model';
import { createWorld, simulateSeason, type MatchModelRelease } from '../../engine/src/index';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { LOAD_CATALOG } from '../../catalogs/src/index';
it('round trips exact monetary strings without losing integer precision', () => {
  const facts = {
    currency: 'ITL',
    amount: '10000000000000000001',
    events: [{ id: 'e1', year: 1901 }],
  };
  expect(JSON.parse(canonical(facts))).toEqual(facts);
});

const world = (release?: MatchModelRelease) =>
  createWorld(
    {
      country: 'ENG',
      name: 'Contract Rovers',
      color: '#224466',
      seed: 'contracts',
      level: 'easy' as const,
    },
    release,
  );
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
});

describe('rules 4.0.0 (→SAVE-10, →SAVE-16, →SAVE-19)', () => {
  it('refuses every recognized earlier gameplay version', () => {
    const w = world();
    expect(SUPPORTED_ENGINE_VERSIONS).toEqual(['4.0.0']);
    for (const engine of LEGACY_ENGINE_VERSIONS)
      expect(() => upgradeWorldRules({ ...w, engine }, CURRENT_CATALOG)).toThrow(
        SaveCompatibilityError,
      );
  });
  it('refuses a player without his main position among his positions, or a trait twice', () => {
    const w = world();
    const broken = structuredClone(w);
    broken.players[0].positions = { CB: 3 };
    broken.players[0].position = 'ST';
    expect(() => validateWorld(broken)).toThrow();
    const twice = structuredClone(w);
    twice.players[0].traits = ['leader', 'leader'];
    expect(() => validateWorld(twice)).toThrow();
    expect(validateWorld(structuredClone(w)).id).toBe(w.id);
  });
});

describe('rules 4 match facts (→MATCH-13, →MATCH-19, →HIST-16)', () => {
  // One played season: a closed archive and the own grid matches to extend.
  const season = world();
  simulateSeason(season);
  const played = () => {
    const w = structuredClone(season);
    const m = w.ownMatches.at(-1)!;
    return { w, m, side: m.home === w.playerClub ? (0 as const) : (1 as const) };
  };
  it('round-trips incidents, line counts, added time, shoot-outs, material, discipline and season heat', () => {
    const { w, m, side } = played();
    const other = side === 0 ? 1 : 0,
      [booked, replaced] = m.players;
    m.incidents = [
      { minute: 34, side, kind: 'yellow', player: booked.id, reason: 'reckless' },
      { minute: 61, side, kind: 'sub', player: replaced.id, other: 'synthetic:substitute' },
      { minute: 90, added: 3, side: other, kind: 'injury', player: 'synthetic:opponent' },
    ];
    m.lineCounts = side === 0 ? [m.players.length, 0] : [0, m.players.length];
    m.added = [2, 5, 1, 2];
    m.regulation = { home: 1, away: 1 };
    m.shootout = { home: 4, away: 3 };
    m.material = {
      shots: [side, 0, 820, 340, 12, 1, 0],
      heat: Array.from({ length: 120 }, (_, i) => i % 7),
      network: [500, 300, 20, 0, 1, 4],
      report: Array<number>(60).fill(2),
    };
    booked.detail![PD.yellowCards] = 1;
    booked.detail![PD.crosses] = 3;
    booked.detail![PD.crossesCompleted] = 1;
    const team = m.detail![side];
    // The grid match may have booked others too; the side's cards stay the sum of its lines.
    team[TD.yellowCards] = m.players.reduce((n, p) => n + p.detail![PD.yellowCards]!, 0);
    team[TD.crosses] = 5;
    team[TD.crossesCompleted] = 2;
    team[TD.penalties] = 1;
    team[TD.penaltiesScored] = 1;
    w.fixtures[0].shootout = { home: 5, away: 4 };
    w.discipline = {
      year: w.year,
      yellows: { [booked.id]: { league: 4, 'cup:ENG': 1 } },
      bans: [
        { player: booked.id, club: w.playerClub, matches: 1, scope: 'domestic', reason: 'yellows' },
        { player: replaced.id, club: w.playerClub, matches: 3, scope: 'europe', reason: 'violent' },
      ],
      out: [{ player: 'synthetic:opponent', club: m.away, until: { year: w.year, day: 40 } }],
    };
    w.history[0].heat = { [booked.id]: Array.from({ length: 40 }, (_, i) => i * 3) };
    expect(canonical(validateWorld(structuredClone(w)))).toBe(canonical(w));
    const loose = structuredClone(w);
    loose.discipline!.yellows[booked.id] = { friendly: 1 } as never;
    expect(() => validateWorld(loose)).toThrow();
    const shortHeat = structuredClone(w);
    shortHeat.history[0].heat![booked.id] = [1, 2, 3];
    expect(() => validateWorld(shortHeat)).toThrow();
  });
  it('refuses completions above attempts in the new counters', () => {
    for (const mutate of [
      (m: World['ownMatches'][number], side: 0 | 1) => {
        m.detail![side][TD.crossesCompleted] = m.detail![side][TD.crosses] + 1;
      },
      (m: World['ownMatches'][number], side: 0 | 1) => {
        m.detail![side][TD.throughBallsCompleted] = m.detail![side][TD.throughBalls] + 1;
      },
      (m: World['ownMatches'][number], side: 0 | 1) => {
        m.detail![side][TD.penaltiesScored] = m.detail![side][TD.penalties] + 1;
      },
      (m: World['ownMatches'][number]) => {
        m.players[0].detail![PD.throughBallsCompleted] = 1;
      },
      (m: World['ownMatches'][number]) => {
        m.players[0].detail![PD.crossesCompleted] = 1;
      },
      // Every own line is saved, so the players' cards must add up to the side's.
      (m: World['ownMatches'][number]) => {
        m.players[0].detail![PD.redCards] = 1;
      },
    ]) {
      const { w, m, side } = played();
      mutate(m, side);
      expect(() => validateWorld(w)).toThrow();
    }
  });
  it('refuses line counts that do not add up to the player lines', () => {
    const { w, m } = played();
    m.lineCounts = [5, 0];
    expect(() => validateWorld(w)).toThrow();
    m.lineCounts = [m.players.length, 31];
    expect(() => validateWorld(w)).toThrow();
  });
  it('refuses an incident of unknown kind', () => {
    const { w, m, side } = played();
    m.incidents = [{ minute: 12, side, kind: 'penalty' as never, player: m.players[0].id }];
    expect(() => validateWorld(w)).toThrow();
    m.incidents = [{ minute: 131, side, kind: 'yellow', player: m.players[0].id }];
    expect(() => validateWorld(w)).toThrow();
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

it('rejects dangling career/arrival/post references, overlapping jobs and changed fixed promise deadlines', async () => {
  const { featureState } = await import('../../../tests/fixtures/feature-state');
  const w = featureState();
  validateWorld(w);
  for (const mutate of [
    (copy: World) => {
      copy.staff!.find((s) => s.person)!.person = 'missing-person';
    },
    (copy: World) => {
      copy.staff = copy.staff!.filter((s) => !s.person);
    },
    (copy: World) => {
      delete copy.people![copy.players.find((p) => p.status === 'active')!.id];
    },
    (copy: World) => {
      Object.values(copy.people!)[0].employment[0].club = 'missing-club';
    },
    (copy: World) => {
      copy.recruitmentArrivals![0].player = 'missing-arrival';
    },
    (copy: World) => {
      copy.promises![0].arrival!.player = 'missing-arrival';
    },
    (copy: World) => {
      copy.promises![0].deadline.day++;
    },
    (copy: World) => {
      copy.settings!.mode = 'invalid' as never;
    },
    (copy: World) => {
      Object.values(copy.people!)[0].qualities.teaching = 6 as never;
    },
    (copy: World) => {
      const p = Object.values(copy.people!).find((p) => p.management)!;
      p.employment.push({
        role: 'attack',
        club: copy.playerClub,
        from: { year: 1951, day: 0 },
        to: { year: 1952, day: 0 },
      });
    },
    (copy: World) => {
      Object.values(copy.people!)[0].origin = { club: 'missing-origin', slot: 0 };
    },
  ]) {
    const copy = structuredClone(w);
    mutate(copy);
    expect(() => validateWorld(copy)).toThrow();
  }
});

describe('match-model metadata on load (→SAVE-23)', () => {
  const matchModel: MatchModelState = {
    revision: MATCH_MODEL_REVISION,
    activated: { year: 1950, day: 3, revision: 7 },
    trackedFrom: { year: 1950, day: 4, round: 1 },
    coverage: 'activation',
  };
  const npcSeason: NpcSeasonStats = {
    year: 1950,
    model: MATCH_MODEL_REVISION,
    trackedFrom: matchModel.trackedFrom,
    competitions: [
      {
        kind: 'league',
        groupKey: 'ENG:1:0',
        clubs: [
          {
            club: 'ENG:a',
            matches: 1,
            metrics: Array<number>(12).fill(1),
            detail: emptyTeamDetail(),
            xg: 120,
            xga: 80,
          },
        ],
        players: [
          {
            id: 'p:1',
            name: 'Retained Forward',
            position: 'ST',
            clubs: [
              {
                club: 'ENG:a',
                appearances: 1,
                starts: 0,
                metrics: Array<number>(12).fill(0),
                detail: emptyPlayerDetail(),
              },
            ],
          },
        ],
      },
    ],
  };
  const failure = (input: unknown) => {
    try {
      validateWorld(input);
    } catch (error) {
      return error;
    }
    return undefined;
  };

  it('keeps supported metadata, aggregates and record models instead of dropping them', () => {
    const w = world();
    const loaded = validateWorld({
      ...structuredClone(w),
      matchModel,
      npcSeason,
      ownMatches: w.ownMatches.map((m) => ({ ...structuredClone(m), model: MATCH_MODEL_REVISION })),
    });
    expect(loaded.matchModel).toEqual(matchModel);
    expect(loaded.npcSeason).toEqual(npcSeason);
    expect(loaded.ownMatches.every((m) => m.model === MATCH_MODEL_REVISION)).toBe(true);
    // A world without them (a career founded before the release) loads as the pre-feature model,
    // with nothing installed.
    const plain = validateWorld(world(DISABLED_RELEASE));
    expect(plain.matchModel).toBeUndefined();
    expect(plain.npcSeason).toBeUndefined();
  });

  it('refuses future model metadata as a compatibility failure, malformed data as invalid', () => {
    const w = world();
    const future = 'continuous-aggregate-6';
    for (const input of [
      { ...structuredClone(w), matchModel: { ...matchModel, revision: future } },
      { ...structuredClone(w), npcSeason: { ...npcSeason, model: future } },
      { ...structuredClone(w), ownMatches: [{ id: 'f:1', model: future }] },
    ])
      expect(failure(input)).toBeInstanceOf(SaveCompatibilityError);
    // A contribution's starts are some of its appearances, and always recorded (→HIST-13).
    const contribution = (change: (part: Record<string, unknown>) => void) => {
      const season = structuredClone(npcSeason);
      change(season.competitions[0].players[0].clubs[0] as unknown as Record<string, unknown>);
      return { ...structuredClone(w), npcSeason: season };
    };
    for (const input of [
      { ...structuredClone(w), matchModel: { ...matchModel, coverage: 'partial' } },
      { ...structuredClone(w), matchModel: { ...matchModel, extra: 1 } },
      { ...structuredClone(w), npcSeason: { ...npcSeason, competitions: [{ kind: 'league' }] } },
      contribution((part) => (part.starts = 2)),
      contribution((part) => delete part.starts),
    ]) {
      const error = failure(input);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(SaveCompatibilityError);
    }
  });
});

describe('trust floor and own-club transfer facts (→STAFF-47, HIST-20)', () => {
  const fact: TransferFact = {
    direction: 'in',
    loan: false,
    player: 'p:1',
    person: 'person:1',
    name: 'Arthur Cole',
    club: 'club:2',
    fee: '12345678901234567890',
    currency: 'GBP',
    year: 1951,
    day: 30,
  };
  const load = (change: (copy: World) => unknown) => {
    const copy = structuredClone(world());
    change(copy);
    return validateWorld(copy, LOAD_CATALOG);
  };

  it('accepts a manager trust warning flag', () => {
    expect(load((c) => (c.manager.trustWarned = true)).manager.trustWarned).toBe(true);
    expect(load(() => undefined).manager.trustWarned).toBeUndefined();
    for (const value of [false, 1, 'true'])
      expect(() => load((c) => Object.assign(c.manager, { trustWarned: value }))).toThrow();
  });

  it('accepts own-club transfer facts', () => {
    const w = world();
    // Older worlds without the field still validate unchanged.
    expect('transfers' in w).toBe(false);
    expect(canonical(validateWorld(structuredClone(w), LOAD_CATALOG))).toBe(canonical(w));
    w.transfers = {
      ledgerBefore: 12,
      facts: [
        fact,
        {
          direction: 'out',
          loan: true,
          player: 'p:2',
          name: 'Ben Hale',
          fee: '0',
          year: 1952,
          day: 200,
        },
      ],
    };
    expect(canonical(validateWorld(structuredClone(w), LOAD_CATALOG))).toBe(canonical(w));
  });

  it('rejects a malformed transfer fact', () => {
    const nameless: Partial<TransferFact> = { ...fact };
    delete nameless.name;
    const malformed: unknown[] = [
      { ...fact, direction: 'loan' },
      { ...fact, fee: '-1' },
      { ...fact, fee: 1000 },
      { ...fact, loan: 'no' },
      { ...fact, player: '' },
      { ...fact, day: 400 },
      { ...fact, year: 1800 },
      { ...fact, extra: 1 },
      nameless,
    ];
    for (const bad of malformed)
      expect(() =>
        load((c) => (c.transfers = { ledgerBefore: 0, facts: [bad as TransferFact] })),
      ).toThrow();
    expect(() => load((c) => (c.transfers = { ledgerBefore: -1, facts: [fact] }))).toThrow();
    expect(() =>
      load((c) => Object.assign(c, { transfers: { ledgerBefore: 0, facts: [fact], extra: 1 } })),
    ).toThrow();
  });
});
