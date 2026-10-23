import { describe, expect, it } from 'vitest';
import { canonical, validateWorld, type World } from '../../../../packages/contracts/src/index';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  envelopeEngine,
  FULL_MODEL_CHECKPOINT_SCHEMA,
  MANAGER_HISTORY_CHECKPOINT_SCHEMA,
  SaveCompatibilityError,
} from '../../../../packages/contracts/src/versions';
import { LOAD_CATALOG } from '../../../../packages/catalogs/src/index';
import {
  captureCupTitle,
  captureSeasonClose,
  managerCandidates,
  operate,
  prepareSeason,
  simulateSeason,
} from '../../../../packages/engine/src/index';
import { transferredScorerWorld } from '../../../../tests/fixtures/transferred-scorer';
import {
  cachedWorld,
  simulatedWorld,
  withoutManagerHistory,
} from '../../../../tests/fixtures/worlds';
import { checkpoint, encode, decode, recognizedLegacy } from './persistence';
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

describe('own-manager history checkpoints (→SAVE-24)', () => {
  /** A tracked career two rounds in, with a hire, a cup and a closed league finish recorded. */
  function tracked(): World {
    const w = simulatedWorld(
      {
        country: 'ENG',
        name: 'Saved Tenures',
        color: '#446688',
        seed: 'manager-save',
        level: 'easy',
      },
      { rounds: 2 },
    );
    w.cash = '999999999999';
    operate(w, { type: 'hire', id: managerCandidates(w).find((c) => c.source !== 'club')!.id });
    captureCupTitle(w, 'cup');
    const club = w.clubs.find((c) => c.id === w.playerClub)!;
    captureSeasonClose(w, { tier: club.tier, group: club.group });
    return w;
  }

  it('writes a tracked career in its own container and reads every fact back', async () => {
    const w = tracked();
    expect(w.managerHistory!.tenures).toHaveLength(2);
    expect(w.ownMatches.every((m) => m.managerTenure === w.managerHistory!.tenures[0]!.id)).toBe(
      true,
    );
    const raw = await encode(w, 2, 1);
    expect(JSON.parse(raw).schema).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
    const loaded = await decode(raw);
    expect(loaded.envelope.schema).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
    expect(canonical(loaded.world)).toBe(canonical(w));
    expect((await checkpoint(w)).envelope.schema).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
    // Its header still names its rules for recognition; it is never legacy-reset data.
    expect(envelopeEngine(raw)).toBe(w.engine);
    expect(await recognizedLegacy(raw)).toBe(false);
  });

  it('keeps an untracked career in its older container with attribution absent', async () => {
    const w = withoutManagerHistory(tracked());
    const loaded = await decode(await encode(w));
    expect(loaded.envelope.schema).toBe(CURRENT_CHECKPOINT_SCHEMA);
    expect(loaded.world).not.toHaveProperty('managerHistory');
    expect(loaded.world.ownMatches.every((m) => !('managerTenure' in m))).toBe(true);
    expect(canonical(loaded.world)).toBe(canonical(w));
  });

  it('is a container an older reader cannot know, and only this one holds the facts', async () => {
    // Every container before it was read by versions without manager history; they refuse it.
    expect(MANAGER_HISTORY_CHECKPOINT_SCHEMA).toBeGreaterThan(FULL_MODEL_CHECKPOINT_SCHEMA);
    const w = tracked(),
      raw = JSON.parse(await encode(w));
    for (const schema of [1, CURRENT_CHECKPOINT_SCHEMA, FULL_MODEL_CHECKPOINT_SCHEMA])
      await expect(decode(JSON.stringify({ ...raw, schema }))).rejects.toBeInstanceOf(
        SaveCompatibilityError,
      );
    const plain = JSON.parse(await encode(withoutManagerHistory(tracked())));
    await expect(
      decode(JSON.stringify({ ...plain, schema: MANAGER_HISTORY_CHECKPOINT_SCHEMA })),
    ).rejects.toBeInstanceOf(SaveCompatibilityError);
    // A newer one after it is refused before decompression.
    await expect(
      decode(JSON.stringify({ ...raw, schema: MANAGER_HISTORY_CHECKPOINT_SCHEMA + 1 })),
    ).rejects.toBeInstanceOf(SaveCompatibilityError);
  });

  it('refuses dangling, foreign or duplicate attribution before activation', () => {
    const w = tracked();
    expect(() => validateWorld(structuredClone(w), LOAD_CATALOG)).not.toThrow();
    const dangling = structuredClone(w);
    dangling.ownMatches[0]!.managerTenure = `${w.playerClub}:tenure:9`;
    expect(() => validateWorld(dangling, LOAD_CATALOG)).toThrow('감독 이력 경기 참조');
    const foreign = structuredClone(w);
    foreign.managerHistory!.club = w.clubs.find((c) => c.id !== w.playerClub)!.id;
    foreign.managerHistory!.tenures = foreign.managerHistory!.tenures.map((t, i) => ({
      ...t,
      id: `${foreign.managerHistory!.club}:tenure:${i + 1}`,
    }));
    expect(() => validateWorld(foreign, LOAD_CATALOG)).toThrow();
    const duplicate = structuredClone(w);
    duplicate.managerHistory!.outcomes.push(duplicate.managerHistory!.outcomes[0]!);
    expect(() => validateWorld(duplicate, LOAD_CATALOG)).toThrow();
  });
});
