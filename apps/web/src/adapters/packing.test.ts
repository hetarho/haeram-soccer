import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { advanceRound, createWorld } from '../../../../packages/engine/src/index';
import { pack, unpack } from './packing';
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
