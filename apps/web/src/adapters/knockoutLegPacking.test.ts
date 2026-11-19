import { describe, expect, it } from 'vitest';
import type { Fixture, MatchRecord } from '../../../../packages/contracts/src/types';
import { validateWorld } from '../../../../packages/contracts/src/schema';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import { zeroMetrics } from '../../../../packages/engine/src/primitives';
import { tieFixtures, tieRule } from '../../../../packages/engine/src/knockout';
import { pack, unpack } from './packing';

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function fixture() {
  const w = worldMarketFixture();
  w.catalogHash = '0'.repeat(64);
  w.clubs.push(...Array.from({ length: 7 }, (_, i) => ({ ...w.clubs[1]!, id: `packing:${i}` })));
  const round = {
    label: 'Semi-final',
    round: 5,
    legs: 2 as const,
    ties: [{ home: w.playerClub, away: w.clubs[1]!.id }],
  };
  const fixtures = tieFixtures(w, 'cup:ENG', 'cup', 'ENG', 0, round);
  w.cups = [
    {
      country: 'ENG',
      name: 'Synthetic cup',
      clubs: [w.playerClub, w.clubs[1]!.id],
      rounds: [round],
      fixtures,
    },
  ];
  const match = (f: Fixture): MatchRecord => ({
    ...f,
    score: { home: 0, away: 0 },
    metrics: [zeroMetrics(), zeroMetrics()],
    players: [],
    highlights: [],
    tactics: ['balanced', 'balanced'],
  });
  w.ownMatches = [
    ...fixtures.map(match),
    match({ ...fixtures[0]!, id: 'older-single', leg: undefined }),
  ];
  delete w.ownMatches[2]!.leg;
  return w;
}

describe('optional knockout leg metadata in compact saves', () => {
  it('round-trips both legs and missing metadata without changing recorded matches', () => {
    const w = fixture();
    const packed = plain(pack(w));
    expect(packed.matchLegs).toEqual([1, 2, 0]);
    const restored = unpack(packed);
    expect(restored.ownMatches).toEqual(w.ownMatches);
    expect(restored.cups).toEqual(w.cups);
    expect(validateWorld(plain(restored)).ownMatches).toEqual(w.ownMatches);
    expect(restored.ownMatches[2]).not.toHaveProperty('leg');
    for (const legs of [[1], [1, 3, 0]]) {
      const invalid = plain(packed);
      Object.assign(invalid, { matchLegs: legs });
      expect(() => unpack(invalid)).toThrow();
    }
  });

  it('keeps older records absent and recognises paired fixtures without the flag after reload', () => {
    const w = fixture();
    for (const f of [...w.ownMatches, ...w.cups![0]!.fixtures]) delete f.leg;
    const packed = plain(pack(w));
    expect(packed).not.toHaveProperty('matchLegs');
    const restored = unpack(packed);
    expect(restored.ownMatches).toEqual(w.ownMatches);
    const [first, second] = restored.cups![0]!.fixtures;
    first!.score = { home: 2, away: 1 };
    expect(tieRule(first!, restored.cups![0]!.fixtures, false)).toBeUndefined();
    expect(tieRule(second!, restored.cups![0]!.fixtures, false)).toEqual({
      first: { home: 1, away: 2 },
      awayGoals: false,
    });
  });
});
