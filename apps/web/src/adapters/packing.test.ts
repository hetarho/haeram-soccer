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
import { packBitColumns } from './bitpacking';

const career = () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Compact Athletic',
    color: '#126044',
    seed: 'compact-streams',
    difficulty: 1,
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
  it('keeps hiring criteria, the talk rule, strategy locks and the manager market through a pack round trip', () => {
    const w = career();
    for (let round = 2; round < 8; round++) advanceRound(w, undefined, false);
    w.hiring = {
      manager: {
        minOvr: 60,
        schools: ['positional'],
        minFlexibility: 0,
        maxPride: 90,
        minYouth: 0,
        traits: [],
        maxWageOvr: 70,
        priority: 'wage',
        term: 3,
        poach: false,
        whenNone: 'best',
      },
      coaches: { scout: { volunteer: false, minAbility: 70, priority: 'ability', term: 2 } },
    };
    w.talkRule = { maxPay: 1.25, minOvr: 55, maxAge: 34 };
    w.build = { youth: 'pathway' };
    w.buildChanged = { youth: { year: w.year, day: 40 } };
    w.delegation = { ...w.delegation, 'coach:scout': true };
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
        difficulty: 1,
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
