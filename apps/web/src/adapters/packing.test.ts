import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../../../packages/contracts/src/index';
import {
  advanceRound,
  createWorld,
  placeBid,
  simulateSeason,
  transferOffers,
} from '../../../../packages/engine/src/index';
import { base64, pack, unbase64, unpack } from './packing';
import { PLAYER_DETAIL_SIZE, TEAM_DETAIL_SIZE } from '../../../../packages/contracts/src/detail';
import type { World } from '../../../../packages/contracts/src/types';
import { packBitColumns } from './bitpacking';
import { packCareerRows } from './careerPacking';

const career = () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Compact Athletic',
    color: '#126044',
    seed: 'compact-streams',
    level: 'normal' as const,
  });
  advanceRound(w, undefined, false);
  advanceRound(w, undefined, false);
  return w;
};

// Historical compact1 uses unsigned LEB128 columns and one interleaved actor stream.
function legacyIntegers(values: number[]) {
  const bytes: number[] = [];
  for (let value of values) {
    do {
      const next = value % 128;
      value = Math.floor(value / 128);
      bytes.push(next + (value ? 128 : 0));
    } while (value);
  }
  return btoa(String.fromCharCode(...bytes));
}

describe('lossless career stream compaction', () => {
  it('keeps the direction rows, the strategy and the manager market through a pack round trip', () => {
    const w = career();
    for (let round = 2; round < 8; round++) advanceRound(w, undefined, false);
    w.direction = {
      renewal: 'coreOnly',
      school: 'positional',
      manager: 'cheap',
      coaches: 'elite',
      finance: 'careful',
      youthGoal: 'sell',
      debut: 'early',
    };
    w.build = { youth: 'elite' };
    w.intervention = 4;
    expect(w.managerMarket?.free.length).toBeGreaterThan(0);
    const restored = validateWorld(unpack(JSON.parse(JSON.stringify(pack(w)))));
    expect(canonical(restored)).toBe(canonical(w));
  });

  it('keeps the player and terms a pending bid was made for through a pack round trip', () => {
    const w = career();
    // Asking fees follow the market (→CLUB-25); the round trip is what is tested, not the price.
    w.cash = '999999999999';
    placeBid(w, 2, transferOffers(w)[2].fee);
    const bid = w.bids!.find((b) => b.direction === 'out')!;
    expect(bid).toMatchObject({ status: 'pending', offer: { player: { id: bid.playerId } } });
    const restored = validateWorld(unpack(JSON.parse(JSON.stringify(pack(w)))));
    expect(restored.bids?.find((b) => b.id === bid.id)?.offer).toEqual(bid.offer);
    expect(canonical(restored)).toBe(canonical(w));
  });

  it('preserves column actors and arbitrary signed interception differences without mutating facts', () => {
    const w = career();
    w.ownMatches[0].metrics[0][6] = 20;
    w.ownMatches[0].metrics[0][7] = 7;
    w.ownMatches[0].players[0].metrics[6] = 7;
    w.ownMatches[0].players[0].metrics[7] = 25;
    const before = canonical(w);
    const packed = pack(w);
    expect(packed.matchActorColumns?.playerWidth).toBe(11);
    expect(packed.statBits?.layout).toBe('planes');
    expect(packed.statInterceptionDeltas).toBe(true);
    expect(canonical(unpack(packed))).toBe(before);
    expect(canonical(w)).toBe(before);
  });

  it('keeps recorded expected goals per match and leaves older matches without them', () => {
    const w = career();
    expect(w.ownMatches.every((match) => match.xg)).toBe(true);
    delete w.ownMatches[0].xg;
    const before = canonical(w);
    const packed = pack(w);
    expect(typeof packed.matchXg).toBe('string');
    const restored = unpack(packed);
    expect(canonical(restored)).toBe(before);
    expect(restored.ownMatches[0]).not.toHaveProperty('xg');
    expect(restored.ownMatches[1].xg).toEqual(w.ownMatches[1].xg);
    for (const match of w.ownMatches) delete match.xg;
    expect(pack(w)).not.toHaveProperty('matchXg');
  });

  it('reads historical interleaved match actors alongside the existing match field stream', () => {
    const w = career();
    const old = pack(w);
    const id = (value: string) => old.dict.indexOf(value);
    old.matchActors = legacyIntegers(
      w.ownMatches.flatMap((m) => [
        m.players.length,
        ...m.players.map((player) => id(player.id)),
        m.highlights.length,
        ...m.highlights.flatMap((highlight) => [
          highlight.minute,
          highlight.side,
          id(highlight.player),
          id(highlight.action),
        ]),
        ...m.tactics.map(id),
      ]),
    );
    delete old.matchActorColumns;
    expect(canonical(unpack(old))).toBe(canonical(w));
  });

  it('retains variable player and highlight counts in careers that cannot use an eleven-player column', () => {
    const w = career();
    w.ownMatches[0].players = w.ownMatches[0].players.slice(0, 4);
    w.ownMatches[1].players = [];
    w.ownMatches[1].highlights = [];
    const packed = pack(w);
    expect(packed.matchActorColumns?.playerWidth).toBe(1);
    expect(packed.statWidth).toBe(12);
    expect(canonical(unpack(packed))).toBe(canonical(w));
  });

  it('round-trips rules 4 match facts losslessly', () => {
    const w = career();
    const [first, second] = w.ownMatches;
    const side = first.home === w.playerClub ? 0 : 1;
    const [booked, replaced] = first.players;
    first.incidents = [
      { minute: 34, side, kind: 'yellow', player: booked.id, reason: 'reckless' },
      { minute: 61, side, kind: 'sub', player: replaced.id, other: 'synthetic:substitute' },
      { minute: 90, added: 0, side: 1, kind: 'injury', player: 'synthetic:opponent' },
      {
        minute: 105,
        added: 3,
        side: 0,
        kind: 'secondYellow',
        player: booked.id,
        reason: 'dissent',
      },
    ];
    first.lineCounts = side === 0 ? [first.players.length, 0] : [0, first.players.length];
    first.added = [2, 5, 1, 2];
    first.regulation = { home: 1, away: 1 };
    first.shootout = { home: 4, away: 3 };
    first.material = {
      shots: [side, 0, 820, 340, 12, 1, 0, side, 3, 100, 900, 55, 0, 1],
      heat: Array.from({ length: 123 }, (_, i) => (i * 7) % 11),
      network: [500, 300, 20, 0, 1, 4],
      report: Array<number>(60).fill(2),
    };
    second.added = [3, 4];
    second.incidents = [];
    second.material = { shots: [], heat: [], network: [], report: [] };
    second.shootout = { home: 0, away: 0 };
    const packed = pack(w);
    const restored = unpack(JSON.parse(JSON.stringify(packed)));
    expect(canonical(restored)).toBe(canonical(w));
    expect(restored.ownMatches[1].incidents).toEqual([]);
    expect(restored.ownMatches[1].added).toEqual([3, 4]);
    expect(restored.ownMatches[1].shootout).toEqual({ home: 0, away: 0 });
    expect(restored.ownMatches[1].material).toEqual({
      shots: [],
      heat: [],
      network: [],
      report: [],
    });
    expect(restored.ownMatches[1]).not.toHaveProperty('regulation');
  });

  it('keeps the widened team and player detail indexes through the match detail stream', () => {
    const w = career();
    const m = w.ownMatches[0];
    expect(m.detail![0]).toHaveLength(TEAM_DETAIL_SIZE);
    expect(m.players[0].detail).toHaveLength(PLAYER_DETAIL_SIZE);
    m.detail![0][TEAM_DETAIL_SIZE - 1] = 9;
    m.detail![1][TEAM_DETAIL_SIZE - 1] = 4;
    m.players[0].detail![PLAYER_DETAIL_SIZE - 1] = 7;
    const restored = unpack(JSON.parse(JSON.stringify(pack(w))));
    expect(restored.ownMatches[0].detail![0][TEAM_DETAIL_SIZE - 1]).toBe(9);
    expect(restored.ownMatches[0].detail![1][TEAM_DETAIL_SIZE - 1]).toBe(4);
    expect(restored.ownMatches[0].players[0].detail![PLAYER_DETAIL_SIZE - 1]).toBe(7);
    expect(canonical(restored)).toBe(canonical(w));
  });

  it('round-trips records with substitutes and their incidents', () => {
    const w = career();
    const m = w.ownMatches[0];
    const extra = structuredClone(m.players.slice(0, 3)).map((p, i) => ({
      ...p,
      id: `synthetic:bench:${i}`,
    }));
    m.players.push(...extra);
    for (const other of w.ownMatches.slice(1)) other.players = other.players.slice(0, 11);
    const side = m.home === w.playerClub ? 0 : 1;
    m.lineCounts = side === 0 ? [m.players.length, 0] : [0, m.players.length];
    m.incidents = extra.map((p, i) => ({
      minute: 60 + i,
      side: side as 0 | 1,
      kind: 'sub' as const,
      player: m.players[i].id,
      other: p.id,
    }));
    const packed = pack(w);
    expect(packed.statWidth).toBe(12);
    expect(packed.matchActorColumns?.playerWidth).toBe(1);
    expect(canonical(unpack(JSON.parse(JSON.stringify(packed))))).toBe(canonical(w));
  });

  it('round-trips season heat maps losslessly', () => {
    const w = career();
    const [a, b] = [w.ownMatches[0].players[0].id, w.ownMatches[0].players[1].id];
    const season = (year: number, heat?: Record<string, number[]>): World['history'][number] =>
      ({
        year,
        cash: '0',
        currency: 'EUR',
        income: '0',
        expense: '0',
        fans: 0,
        rating: 0,
        manager: '',
        metrics: w.ownMatches[0].metrics[0],
        standings: [[1, 2, 3, 4, 5, 6]],
        champions: [],
        europe: [],
        ...(heat ? { heat } : {}),
      }) as unknown as World['history'][number];
    w.history = [
      season(2001, {
        [a]: Array.from({ length: 40 }, (_, i) => i * 3),
        [b]: Array<number>(40).fill(0),
      }),
      season(2002),
      season(2003, {}),
      season(2004, { [a]: Array.from({ length: 40 }, (_, i) => 2 ** 20 + i) }),
    ];
    const packed = pack(w);
    expect(packed.world.history.every((h) => !('heat' in h))).toBe(true);
    const restored = unpack(JSON.parse(JSON.stringify(packed)));
    expect(canonical(restored)).toBe(canonical(w));
    expect(restored.history[1]).not.toHaveProperty('heat');
    expect(restored.history[2].heat).toEqual({});
    expect(restored.history[3].heat![a][39]).toBe(2 ** 20 + 39);
  });

  it('keeps records without the new fields byte-identical to before', () => {
    const w = career();
    for (const m of w.ownMatches) {
      delete m.incidents;
      delete m.lineCounts;
      delete m.added;
      delete m.regulation;
      delete m.shootout;
      delete m.material;
    }
    for (const h of w.history) delete h.heat;
    const packed = pack(w);
    for (const key of ['matchExtras', 'matchIncidents', 'matchMaterial', 'seasonHeat'])
      expect(packed).not.toHaveProperty(key);
    expect(JSON.stringify(packed)).not.toContain('heat":');
    expect(canonical(unpack(JSON.parse(JSON.stringify(packed))))).toBe(canonical(w));
  });

  it('rejects damaged rules 4 fact streams', () => {
    const w = career();
    const m = w.ownMatches[0];
    m.added = [1, 2];
    m.incidents = [{ minute: 5, side: 0, kind: 'yellow', player: m.players[0].id }];
    const source = pack(w);
    const orphan = structuredClone(source);
    delete orphan.matchExtras;
    expect(() => unpack(orphan)).toThrow('부가 기록');
    const noIncidents = structuredClone(source);
    delete noIncidents.matchIncidents;
    expect(() => unpack(noIncidents)).toThrow();
    const truncated = structuredClone(source);
    truncated.matchIncidents!.rows = packBitColumns([], 7);
    expect(() => unpack(truncated)).toThrow();
  });

  it('falls back to full safe integers when the signed difference would exceed their range', () => {
    const w = career();
    w.ownMatches[0].metrics[0][6] = Number.MAX_SAFE_INTEGER;
    w.ownMatches[0].metrics[0][7] = 0;
    const packed = pack(w);
    expect(packed.statInterceptionDeltas).toBeUndefined();
    expect(canonical(unpack(packed))).toBe(canonical(w));
    w.ownMatches[0].metrics[0][6] = Number.MAX_SAFE_INTEGER + 1;
    expect(() => pack(w)).toThrow('안전한 정수');
    w.ownMatches[0].metrics[0][6] = Number.MAX_SAFE_INTEGER;
    w.ownMatches[0].metrics[0][7] = Number.MAX_SAFE_INTEGER + 1;
    expect(() => pack(w)).toThrow('안전한 정수');
    w.ownMatches[0].metrics[0][7] = Number.MAX_SAFE_INTEGER;
    expect(canonical(unpack(pack(w)))).toBe(canonical(w));
    w.ownMatches[0].metrics[0][7] = -1;
    expect(() => pack(w)).toThrow('안전한 정수');
  });

  it('streams archived bracket ties and rejects counts that disagree with the stream', () => {
    const w = simulateSeason(
      createWorld({
        country: 'ENG',
        name: 'Bracket Athletic',
        color: '#126044',
        seed: 'compact-brackets',
        level: 'normal' as const,
      }),
    );
    const rounds = w.history[0].brackets!.flatMap((b) => b.rounds);
    expect(rounds.length).toBeGreaterThan(0);
    const packed = pack(w);
    expect(packed.world.history[0].brackets!.flatMap((b) => b.rounds)).toEqual(
      rounds.map((round) => ({ ...round, ties: [] })),
    );
    expect(packed.bracketCounts).toEqual([rounds.map((round) => round.ties.length)]);
    expect(canonical(validateWorld(unpack(structuredClone(packed))))).toBe(canonical(w));

    const bytes = unbase64(packed.bracketTies!);
    const damaged = [
      // One tie short: the last column holds single-byte outcomes.
      { bracketTies: base64(bytes.slice(0, -7)) },
      { bracketCounts: [rounds.map((round, r) => round.ties.length - (r === 0 ? 1 : 0))] },
      { bracketCounts: [[...rounds.map((round) => round.ties.length), 0]] },
      { bracketCounts: [] },
      { bracketCounts: undefined },
      { bracketTies: undefined },
    ];
    for (const fields of damaged)
      expect(() => unpack({ ...structuredClone(packed), ...fields })).toThrow(
        '대진 기록 압축 데이터 손상',
      );
    // A cut inside a row leaves the stream ragged.
    expect(() =>
      unpack({ ...structuredClone(packed), bracketTies: base64(bytes.slice(0, -1)) }),
    ).toThrow();

    // Seasons closed before brackets were archived have neither the rounds nor the stream.
    const legacy = structuredClone(w);
    delete legacy.history[0].brackets;
    const old = pack(legacy);
    expect(old).not.toHaveProperty('bracketTies');
    expect(canonical(unpack(structuredClone(old)))).toBe(canonical(legacy));
    expect(() => unpack({ ...old, bracketTies: '' })).toThrow('대진 기록 압축 데이터 손상');
  });

  it('rejects damaged actor dimensions, incomplete/extra streams and unknown metadata', () => {
    const source = pack(career());
    const invalid = [
      { playerWidth: 0 },
      { dimensions: '' },
      { dimensions: legacyIntegers([61, 0]) },
      { players: '' },
      {
        highlights: btoa(
          atob(source.matchActorColumns!.highlights) + atob(legacyIntegers([0, 0, 0, 0])),
        ),
      },
      { tactics: '' },
    ];
    for (const metadata of invalid) {
      const corrupt = structuredClone(source);
      Object.assign(corrupt.matchActorColumns!, metadata);
      expect(() => unpack(corrupt)).toThrow();
    }
    const noFields = structuredClone(source);
    delete noFields.matchFields;
    expect(() => unpack(noFields)).toThrow('참여자');
    const wrongFlag = structuredClone(source);
    Object.assign(wrongFlag, { statInterceptionDeltas: false });
    expect(() => unpack(wrongFlag)).toThrow('차분 형식');
    const overflow = structuredClone(source);
    const values = Array.from({ length: overflow.matchCount! * 156 }, () => 0);
    values[6] = Number.MAX_SAFE_INTEGER;
    values[7] = 2;
    overflow.statBits = packBitColumns(values, 156, 'planes');
    expect(() => unpack(overflow)).toThrow('차분 범위');
  });
});

it('feature-state-lossless-roundtrip retains version-one shared career rows and their strict checks', async () => {
  const { featureState } = await import('../../../../tests/fixtures/feature-state');
  const w = featureState(),
    current = pack(w);
  const indices = new Map(current.dict.map((value, index) => [value, index]));
  const id = (value: string) => {
    let index = indices.get(value);
    if (index === undefined) {
      index = current.dict.length;
      current.dict.push(value);
      indices.set(value, index);
    }
    return index;
  };
  const packed = { ...current, careers: packCareerRows(w.people!, id) };
  expect(packed.careers!.version).toBe(1);
  expect(packed.world.people).toBeUndefined();
  expect(packed.careers!.people).toHaveLength(Object.keys(w.people!).length);
  expect(canonical(validateWorld(unpack(JSON.parse(canonical(packed)))))).toBe(canonical(w));
  for (const mutate of [
    (p: typeof packed) => {
      p.careers!.people[0].pop();
    },
    (p: typeof packed) => {
      p.careers!.people.push(p.careers!.people[0]);
    },
    (p: typeof packed) => {
      p.careers!.people[0][0] = 999999;
    },
    (p: typeof packed) => {
      p.careers!.people[0][5] = 6;
    },
    (p: typeof packed) => {
      p.careers!.people[0][14][0][4] = 1950;
      p.careers!.people[0][14][0][5] = null;
    },
    (p: typeof packed) => {
      p.world.people = w.people;
    },
  ]) {
    const broken = structuredClone(packed);
    mutate(broken);
    expect(() => unpack(broken)).toThrow();
  }
  expect(() => unpack({ ...packed, careers: null } as unknown as typeof packed)).toThrow();
  expect(() =>
    unpack({ ...packed, careers: { ...packed.careers, version: 2 } } as unknown as typeof packed),
  ).toThrow();
});
