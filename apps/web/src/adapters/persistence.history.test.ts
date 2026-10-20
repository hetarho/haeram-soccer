import { expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { prepareSeason, simulateSeason } from '../../../../packages/engine/src/index';
import { transferredScorerWorld } from '../../../../tests/fixtures/transferred-scorer';
import { cachedWorld } from '../../../../tests/fixtures/worlds';
import { encode, decode } from './persistence';
import { pack, unpack } from './packing';
import { legacyIntegers, world } from './persistence.testkit';

it('preserves first and second European phases and global standings in a historical checkpoint', async () => {
  const w = cachedWorld('season from 2000', () => {
    const w = world();
    w.year = 2000;
    w.currency = 'GBP';
    w.manager.since = 1997;
    w.manager.until = 2003;
    for (const p of w.players) {
      p.born = 1978;
      p.joined = w.year;
    }
    // This synthetic career starts in 2000, so enroll its actual identities at that epoch.
    delete w.people;
    prepareSeason(w);
    simulateSeason(w);
    return w;
  });
  expect(w.history[0].europe.find((e) => e.kind === 'ucl')?.secondStandings).toHaveLength(16);
  expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
  const legacy = pack(w);
  legacy.standings = legacyIntegers(
    w.history
      .flatMap((history) => [
        history.standings.flat(),
        ...history.europe.flatMap((europe) => [
          (europe.standings || []).flat(),
          (europe.secondStandings || []).flat(),
        ]),
      ])
      .flat(),
    6,
  );
  delete legacy.standingsDeltas;
  expect(canonical(unpack(legacy))).toBe(canonical(w));
});

it('roundtrips one transferred league scorer with both real club contributions', async () => {
  const { w, playerId } = cachedWorld('transferred scorer', () => transferredScorerWorld());
  const raw = await encode(w, 1, 0),
    loaded = await decode(raw);
  expect(canonical(loaded.world)).toBe(canonical(w));
  expect(loaded.world.scorerSeason!.players.find((p) => p.id === playerId)!.clubs).toHaveLength(2);
  const closed = cachedWorld('transferred scorer season', () => {
    const { w } = cachedWorld('transferred scorer', () => transferredScorerWorld());
    simulateSeason(w);
    return w;
  });
  const archived = await decode(await encode(closed, 2, 1));
  expect(canonical(archived.world)).toBe(canonical(closed));
  expect(archived.world.history.at(-1)!.scorers!.some((p) => p.clubs?.length === 2)).toBe(true);
});
