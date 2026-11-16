import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { checkpoint, decode, encode } from '../../../apps/web/src/adapters/persistence';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { careerWorld } from './career.testkit';
import { historyWorld } from './history';
import { closeSeason } from './season';
import { toLastRound } from './season.testkit';
import { takeOver } from './takeover';

describe('wartime employment at the season close', () => {
  for (const owned of [false, true]) {
    it(`preserves career facts through the ${owned ? 'owned' : 'ownerless'} crossing and checkpoint`, async () => {
      const w = cachedWorld(`wartime-employment-1938-${owned}`, () =>
        toLastRound(
          owned
            ? careerWorld({ seed: 'wartime-employment-owned', year: 1938, cash: '1000000000000' })
            : historyWorld('wartime-employment-ownerless', undefined, 1938),
        ),
      );
      validateWorld(w);
      closeSeason(w);
      expect(w.year).toBe(1946);
      validateWorld(w);
      if (!owned) takeOver(w, 'ENG:3:0:0', { tier: 'oil', traits: [] });
      validateWorld(w);
      const raw = await encode(w);
      const saved = await checkpoint(w);
      expect(canonical((await decode(raw)).world)).toBe(canonical(w));
      expect(canonical((await decode(saved.raw)).world)).toBe(canonical(w));
    });
  }
});
