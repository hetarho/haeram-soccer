import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../../packages/contracts/src/match-model';
import { emptyPlayerDetail } from '../../../../packages/contracts/src/detail';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import { zeroMetrics } from '../../../../packages/engine/src/primitives';
import { validateWorld } from '../../../../packages/contracts/src/schema';
import { pack, unpack } from './packing';

describe('optional clean-sheet counters on a tiny aggregate', () => {
  it('round-trips tracked zero, positive and unavailable values and rejects corrupt metadata', () => {
    const w = worldMarketFixture();
    w.catalogHash = '0'.repeat(64);
    w.clubs.push(
      ...Array.from({ length: 7 }, (_, i) => ({ ...w.clubs[1]!, id: `synthetic:${i}` })),
    );
    w.npcSeason = {
      year: w.year,
      model: MATCH_MODEL_REVISION,
      trackedFrom: { year: w.year, day: 1, round: 1 },
      competitions: [
        {
          kind: 'league',
          groupKey: 'synthetic',
          clubs: [],
          players: [
            {
              id: 'keeper',
              name: 'Synthetic Keeper',
              position: 'GK',
              clubs: [undefined, 0, 1].map((cleanSheets, i) => ({
                club: w.clubs[i]!.id,
                appearances: 1,
                starts: 1,
                metrics: zeroMetrics(),
                detail: emptyPlayerDetail(),
                ...(cleanSheets === undefined ? {} : { cleanSheets }),
              })),
            },
          ],
        },
      ],
    };
    const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    const p = plain(pack(w));
    expect(unpack(p).npcSeason).toEqual(w.npcSeason);
    expect(validateWorld(plain(unpack(p))).npcSeason).toEqual(w.npcSeason);
    expect(p.model!.season!.cleanSheets).toEqual([
      [1, 0],
      [2, 1],
    ]);
    const duplicate = plain(p);
    duplicate.model!.season!.cleanSheets!.push([1, 0]);
    expect(() => unpack(duplicate)).toThrow();
    const invalid = plain(p);
    invalid.model!.season!.cleanSheets = [[99, 0]];
    expect(() => unpack(invalid)).toThrow();
    delete p.model!.season!.cleanSheets;
    for (const part of unpack(p).npcSeason!.competitions[0]!.players[0]!.clubs)
      expect(part).not.toHaveProperty('cleanSheets');
  });
});
