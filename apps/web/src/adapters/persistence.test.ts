import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import {
  advanceDays,
  advanceRound,
  createIdentityDraft,
  createWorld,
  identityOf,
  installMissingIdentities,
  operate,
  simulateSeason,
} from '../../../../packages/engine/src/index';
import { currentDay, fixtureDay, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { legacyCrestMap } from '../../../../packages/engine/src/identity-legacy';
import { appearanceForFixture } from '../../../../packages/engine/src/match-appearance';
import {
  adoptedCareer,
  containerOneCheckpoint,
  editActions,
  editedDesign,
  FIRST_COLOUR,
  FOUNDED_DESIGN,
  FOUNDING_ACTIONS,
  FUTURE_CHECKPOINTS,
  preIdentityCareer,
} from '../../../../tests/fixtures/club-identity';
import { featureState } from '../../../../tests/fixtures/feature-state';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE, ENABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { simulatedWorld, withoutManagerHistory } from '../../../../tests/fixtures/worlds';
import { reduceIdentityDraft } from '../ui/clubIdentityDraft';
import {
  checkpoint,
  encode,
  decode,
  Saves,
  type PreviousStore,
  type StoragePort,
} from './persistence';
import { MANIFEST, SLOT } from './repository';
import { base64, pack, unpack } from './packing';
import { denseBytes } from './dense';
import { bmpText } from './bmp127';
import { encodePayload } from './compression';
import { brotliCompressSync } from 'node:zlib';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  CURRENT_ENGINE_VERSION,
  envelopeEngine,
  FULL_MODEL_CHECKPOINT_SCHEMA,
  isEarlierEngine,
  isSaveCompatibilityError,
  MANAGER_HISTORY_CHECKPOINT_SCHEMA,
  PRIOR_CATALOG_HASHES,
  SaveCompatibilityError,
  SUPPORTED_CHECKPOINT_SCHEMAS,
  SUPPORTED_ENGINE_VERSIONS,
  upgradeWorldRules,
} from '../../../../packages/contracts/src/versions';
import {
  CATALOG_HASH,
  CATALOG_VERSION,
  CURRENT_CATALOG,
} from '../../../../packages/catalogs/src/index';
import type { World } from '../../../../packages/contracts/src/types';
import {
  MATCH_MODEL_REVISION,
  type MatchModelState,
} from '../../../../packages/contracts/src/match-model';
import { PLAYER_DETAIL_SIZE, TEAM_DETAIL_SIZE } from '../../../../packages/contracts/src/detail';
import { KIT_ROLES, type ClubIdentity } from '../../../../packages/contracts/src/identity';
import { clubIdentitySchema } from '../../../../packages/contracts/src/identitySchema';
import { FOUNDING, legacyIntegers, world } from './persistence.testkit';
class Memory implements StoragePort {
  data = new Map<string, string>();
  fail = '';
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (k === this.fail) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
/** The founded world after `rounds` observed rounds (`advanceRound(w)`), built once. */
const observed = (rounds: number): World =>
  cachedWorld(`observed:${rounds}`, () => {
    const w = rounds > 1 ? observed(rounds - 1) : world();
    advanceRound(w);
    return w;
  });
/**
 * `observed(rounds)` as a career saved before the full match model (→SAVE-23), as every container
 * 1 and 2 checkpoint was: founded and played with the release off.
 */
const unmodelled = (rounds = 0): World =>
  rounds === 0
    ? simulatedWorld(FOUNDING, {}, DISABLED_RELEASE)
    : cachedWorld(`unmodelled:${rounds}`, () => {
        const w = unmodelled(rounds - 1);
        advanceRound(w);
        return w;
      });
const features = () => cachedWorld('feature-state', () => featureState());
const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
/**
 * An envelope over `packed` as a writer of container `schema` made it: canonical compact bytes,
 * their real SHA-256 and the codec the writer picks, independently of today's `encode`.
 */
async function seal(w: World, packed = pack(w), schema = 1, generation = 1, parentGeneration = 0) {
  const bytes = new TextEncoder().encode(canonical(packed));
  const { codec, payload } = await encodePayload(bytes);
  return JSON.stringify({
    schema,
    engine: w.engine,
    catalog: w.catalog,
    catalogHash: w.catalogHash,
    worldId: w.id,
    generation,
    parentGeneration,
    codec,
    checksum: await sha256(bytes),
    payload,
  });
}
const IDENTITY: ClubIdentity = {
  version: 1,
  colours: ['#126044', '#FFFFFF'],
  crest: {
    shape: 'shield',
    pattern: 'stripes',
    emblem: 'star',
    primary: '#126044',
    secondary: '#FFFFFF',
  },
  kits: {
    home: { pattern: 'stripes', primary: '#126044', secondary: '#FFFFFF' },
    away: { pattern: 'plain', primary: '#ffffff', trim: '#126044' },
    third: { pattern: 'plain', primary: '#0b1f44', trim: '#FFFFFF' },
  },
};
/** A world whose own club carries `identity`, the cached world left untouched. */
function withIdentity(w: World, identity: unknown) {
  const copy = structuredClone(w);
  copy.clubs.find((club) => club.id === copy.playerClub)!.identity = identity as ClubIdentity;
  return copy;
}
describe('recoverable persistence', () => {
  it('roundtrips active schedule, exact money and all match/player facts losslessly', async () => {
    const w = observed(2);
    w.cash = '98765432101234567890';
    expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
  });
  it('roundtrips off days and compact rank snapshots and preserves older saves without these fields', async () => {
    const w = cachedWorld('ten days', () => {
      const w = world();
      advanceDays(w, 10);
      return w;
    });
    expect(w.calendar?.day).toBe(10);
    expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
    const legacy = structuredClone(w);
    delete legacy.calendar;
    delete legacy.rankHistory;
    const loaded = (await decode(await encode(legacy))).world;
    expect(canonical(loaded)).toBe(canonical(legacy));
    expect(loaded.calendar).toBeUndefined();
    expect(loaded.rankHistory).toBeUndefined();
  });
  it('rejects rank snapshots that refer to missing clubs', async () => {
    const w = world();
    w.rankHistory![0].rows[0][0] = w.clubs.length;
    await expect(decode(await encode(w))).rejects.toThrow('순위 추이');
  });
  it('roundtrips compact actual scorer history and legacy saves without scorer tracking', async () => {
    const w = simulatedWorld(FOUNDING, { rounds: 4 });
    expect(w.scorerSeason!.history).toHaveLength(5);
    expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
    const legacy = structuredClone(w);
    delete legacy.scorerSeason;
    const loaded = (await decode(await encode(legacy))).world;
    expect(loaded.scorerSeason).toBeUndefined();
    expect(canonical(loaded)).toBe(canonical(legacy));
  });
  it('reads legacy inline events and preserves optional fields in dictionary-packed financial receipts', () => {
    const w = simulatedWorld(FOUNDING, { rounds: 1 });
    w.events.push({
      year: w.year,
      round: w.round,
      kind: 'note',
      title: '원 단위 보존',
      detail: '수입 정산 없이 통화만 기록',
      currency: w.currency,
    });
    const packed = pack(w);
    expect(packed.world.events).toEqual([]);
    expect(canonical(unpack(packed))).toBe(canonical(w));
    const legacy = pack(w);
    legacy.world.events = w.events;
    delete legacy.eventStats;
    delete legacy.eventDetails;
    delete legacy.eventCount;
    delete legacy.eventTemplates;
    expect(canonical(unpack(legacy))).toBe(canonical(w));
    const broken = pack(w);
    broken.eventCount = w.events.length + 1;
    expect(() => unpack(broken)).toThrow('통계 누락');
  });
  it('reads legacy varint match statistics without the optional bit column encoding', () => {
    const w = simulatedWorld(FOUNDING, { rounds: 2 });
    const packed = pack(w);
    const values = w.ownMatches.flatMap((match) => [
      ...match.metrics[0],
      ...match.metrics[1],
      ...match.players.flatMap((player) => player.metrics),
    ]);
    packed.stats = legacyIntegers(values, packed.statWidth!);
    delete packed.statBits;
    delete packed.statResiduals;
    delete packed.statInterceptionDeltas;
    const id = (value: string) => packed.dict.indexOf(value);
    packed.matches = w.ownMatches.map((match) => [
      id(match.id),
      match.year,
      match.round,
      id(match.kind),
      id(match.home),
      id(match.away),
      id(match.country),
      id(match.groupKey),
      [match.score.home, match.score.away],
      match.players.map((player) => id(player.id)),
      match.highlights.map((highlight) => [
        highlight.minute,
        highlight.side,
        id(highlight.player),
        id(highlight.action),
      ]),
      match.tactics.map(id),
    ]);
    delete packed.matchFields;
    delete packed.matchActors;
    delete packed.matchActorColumns;
    delete packed.matchCount;
    expect(canonical(unpack(packed))).toBe(canonical(w));
  });
  it('rejects scorer totals and historical player references that contradict actual fixtures', async () => {
    const w = simulatedWorld(FOUNDING, { rounds: 1 });
    const goals = structuredClone(w);
    goals.scorerSeason!.players[0].goals++;
    await expect(decode(await encode(goals))).rejects.toThrow('득점 순위와 실제 경기');
    const history = structuredClone(w);
    history.scorerSeason!.history.at(-1)!.rows[0][0] = history.scorerSeason!.players.length;
    await expect(decode(await encode(history))).rejects.toThrow('득점 순위 추이');
  });
  it('writes dense checkpoints and still loads earlier Base64 checkpoints', async () => {
    const w = observed(1);
    const dense = JSON.parse(await encode(w));
    expect(dense.codec).toBe('gzip-cjk14');
    const legacy = JSON.stringify({
      ...dense,
      codec: 'gzip-base64',
      payload: base64(denseBytes(dense.payload)),
    });
    expect(legacy.length).toBeGreaterThan(JSON.stringify(dense).length * 2);
    expect(canonical((await decode(legacy)).world)).toBe(canonical(w));
    await expect(
      decode(JSON.stringify({ ...dense, payload: dense.payload + 'A' })),
    ).rejects.toThrow('저장 인코딩');
  });
  it('rejects payload corruption and future versions', async () => {
    const e = JSON.parse(await encode(world()));
    await expect(decode(JSON.stringify({ ...e, checksum: '0'.repeat(64) }))).rejects.toThrow(
      '체크섬',
    );
    await expect(
      decode(JSON.stringify({ ...e, schema: MANAGER_HISTORY_CHECKPOINT_SCHEMA + 1 })),
    ).rejects.toThrow('버전');
    await expect(decode('x'.repeat(8 * 1024 * 1024 + 1))).rejects.toThrow('너무');
  });
  it('commits manifest last and retains previous world on quota failure', async () => {
    const port = new Memory();
    const saves = new Saves(port);
    await saves.save(world());
    const before = port.getItem('haeram-soccor:manifest');
    const w = observed(1);
    port.fail = 'haeram-soccor:manifest';
    await expect(saves.save(w)).rejects.toThrow('Quota');
    expect(port.getItem('haeram-soccor:manifest')).toBe(before);
    expect((await new Saves(port).load())?.world.round).toBe(0);
  });
  it('recovers the previous slot and preserves it on the next commit', async () => {
    const port = new Memory();
    const saves = new Saves(port);
    await saves.save(world());
    const w = observed(1);
    await saves.save(w);
    port.data.set('haeram-soccor:slot:b', 'corrupt');
    const recovery = new Saves(port);
    expect((await recovery.load())?.recovered).toBe(true);
    await recovery.save(w);
    expect((await new Saves(port).load())?.world.round).toBe(1);
    expect((await decode(port.getItem('haeram-soccor:slot:a')!)).world.round).toBe(0);
  });
  it.each([null, '{', '{"slot":0}', '{"slot":1,"generation":-1}'])(
    'recovers the newest validated checkpoint with an invalid manifest: %s',
    async (manifest) => {
      const port = new Memory();
      const saves = new Saves(port);
      await saves.save(world());
      const w = observed(1);
      await saves.save(w);
      if (manifest === null) port.removeItem('haeram-soccor:manifest');
      else port.setItem('haeram-soccor:manifest', manifest);

      const recovery = new Saves(port);
      const loaded = await recovery.load();
      expect(loaded?.recovered).toBe(true);
      expect(loaded?.world.round).toBe(1);
      expect(recovery.generationInfo).toEqual({ generation: 3, parentGeneration: 2 });
      // The loaded world is the observed first round, so its next round is the cached second.
      expect(canonical(loaded!.world)).toBe(canonical(w));
      await recovery.save(observed(2));
      expect((await new Saves(port).load())?.world.round).toBe(2);
      expect((await decode(port.getItem('haeram-soccor:slot:b')!)).world.round).toBe(1);
    },
  );
  it('commits a codec checkpoint by its envelope and never writes one older than the last commit', async () => {
    const port = new Memory();
    const saves = new Saves(port);
    await saves.save(world());
    const w = observed(1);
    const second = await checkpoint(w, 2, 1);
    await saves.commit(second.raw, { envelope: second.envelope });
    const before = new Map(port.data);
    const stale = await checkpoint(w, 2, 1);
    await expect(saves.commit(stale.raw, { envelope: stale.envelope })).rejects.toThrow('오래된');
    expect(port.data).toEqual(before);
    expect(saves.generationInfo).toEqual({ generation: 3, parentGeneration: 2 });
    expect((await new Saves(port).load())?.envelope.generation).toBe(2);
  });
  it('reports recovery when the selected manifest parent disagrees with the checkpoint', async () => {
    const port = new Memory();
    const saves = new Saves(port);
    await saves.save(world());
    const w = observed(1);
    await saves.save(w);
    const manifest = JSON.parse(port.getItem('haeram-soccor:manifest')!);
    port.setItem('haeram-soccor:manifest', JSON.stringify({ ...manifest, parentGeneration: 0 }));
    const loaded = await new Saves(port).load();
    expect(loaded?.world.round).toBe(1);
    expect(loaded?.recovered).toBe(true);
    expect(loaded?.errors.join(' ')).toContain('계보');
  });
});
it('keeps a signed slot contract through a load and never signs that slot twice, so checkpoints still load', async () => {
  const w = world();
  w.intervention = 4;
  advanceDays(w, 1);
  const loaded = (await decode(await encode(w))).world;
  expect(loaded.sponsors).toEqual(w.sponsors);
  advanceDays(loaded, 1);
  expect(loaded.sponsors).toHaveLength(1);
  expect(loaded.events.filter((event) => event.kind === 'sponsor-sign')).toHaveLength(1);
  const { raw } = await checkpoint(loaded, 2, 1);
  expect(canonical((await decode(raw)).world)).toBe(canonical(loaded));
});
it('rejects broken counters and historical club references before activation', async () => {
  const w = observed(1);
  const tampered = structuredClone(w);
  tampered.ownMatches[0].metrics[0][0]++;
  await expect(decode(await encode(tampered))).rejects.toThrow('경기 지표');
  const closed = cachedWorld('observed round then season', () => {
    const w = observed(1);
    simulateSeason(w);
    return w;
  });
  closed.history[0].champions[0].club = 'missing-club';
  await expect(decode(await encode(closed))).rejects.toThrow('우승 기록 참조');
});

describe('compatible rule upgrades', () => {
  it('refuses a save of earlier rules: nothing converts it into the player model (→SAVE-16)', async () => {
    const legacy = world();
    legacy.engine = '1.22.0';
    await expect(decode(await encode(legacy))).rejects.toThrow(SaveCompatibilityError);
    expect(() => upgradeWorldRules(legacy, CURRENT_CATALOG)).toThrow(SaveCompatibilityError);
    const current = world();
    expect(upgradeWorldRules(current, CURRENT_CATALOG)).toBe(current);
  });

  it('names the rules an earlier save needs, read from its header alone', async () => {
    const legacy = world();
    legacy.engine = '1.22.0';
    const raw = await encode(legacy);
    expect(envelopeEngine(raw)).toBe('1.22.0');
    const failure = await decode(raw).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SaveCompatibilityError);
    expect((failure as SaveCompatibilityError).engine).toBe('1.22.0');
    expect((failure as Error).message).toBe(
      `이 저장은 규칙 1.22.0 커리어입니다 — 규칙 ${CURRENT_ENGINE_VERSION} 커리어만 열 수 있습니다. 새 커리어를 시작하세요`,
    );
    // Earlier, never later or malformed.
    expect(isEarlierEngine('1.22.0')).toBe(true);
    expect(isEarlierEngine('1.9.9')).toBe(true);
    expect(isEarlierEngine(CURRENT_ENGINE_VERSION)).toBe(false);
    expect(isEarlierEngine('9.0.0')).toBe(false);
    expect(isEarlierEngine('x.y.z')).toBe(false);
  });

  for (const catalog of ['2026-demo-1', '2026-demo-2'])
    it(`loads a ${catalog} save, moves its catalog pin on activation and round-trips`, async () => {
      const legacy = world();
      legacy.revision = 9;
      legacy.catalog = catalog;
      legacy.catalogHash = PRIOR_CATALOG_HASHES[catalog];
      const before = canonical(legacy);
      const decoded = (await decode(await encode(legacy))).world;
      expect(canonical(decoded)).toBe(before);
      expect(decoded.catalog).toBe(catalog);
      expect(CATALOG_VERSION).toBe('2026-demo-3');
      const upgraded = upgradeWorldRules(decoded, CURRENT_CATALOG);
      expect(canonical(upgraded)).toBe(
        canonical({
          ...legacy,
          engine: CURRENT_ENGINE_VERSION,
          catalog: CATALOG_VERSION,
          catalogHash: CATALOG_HASH,
          revision: 10,
        }),
      );
      expect(canonical(legacy)).toBe(before);
      expect(canonical((await decode(await encode(upgraded))).world)).toBe(canonical(upgraded));
      expect(upgradeWorldRules(upgraded, CURRENT_CATALOG)).toBe(upgraded);
      const wrong = { ...legacy, catalogHash: 'a'.repeat(64) };
      await expect(decode(await encode(wrong))).rejects.toThrow(SaveCompatibilityError);
    });

  it('does not reinterpret future worlds or overflow a revision during a pure upgrade', () => {
    const future = { ...world(), engine: '9.0.0' };
    const before = canonical(future);
    expect(() => upgradeWorldRules(future, CURRENT_CATALOG)).toThrow(SaveCompatibilityError);
    expect(canonical(future)).toBe(before);
    const legacy = {
      ...world(),
      catalog: '2026-demo-1',
      catalogHash: PRIOR_CATALOG_HASHES['2026-demo-1'],
      revision: Number.MAX_SAFE_INTEGER,
    };
    expect(() => upgradeWorldRules(legacy, CURRENT_CATALOG)).toThrow('revision');
    expect(legacy.revision).toBe(Number.MAX_SAFE_INTEGER);
    expect(legacy.catalog).toBe('2026-demo-1');
  });
});

describe('incompatible checkpoint protection', () => {
  it.each([
    ['schema', 3],
    ['engine', '9.0.0'],
    ['catalog', 'future-catalog'],
    ['catalogHash', 'f'.repeat(64)],
    ['codec', 'future-codec'],
  ])('blocks fallback and writes for an unsupported selected %s', async (field, value) => {
    const port = new Memory();
    const saves = new Saves(port);
    await saves.save(world());
    const w = observed(1);
    await saves.save(w);
    const selected = 'haeram-soccor:slot:b';
    const future = JSON.stringify({ ...JSON.parse(port.getItem(selected)!), [field]: value });
    port.data.set(selected, future);
    const before = new Map(port.data);
    const recovery = new Saves(port);
    await expect(recovery.load()).rejects.toMatchObject({ code: 'save-compatibility' });
    expect(recovery.incompatibleBackup).toBe(future);
    expect(recovery.generationInfo).toEqual({ generation: 3, parentGeneration: 2 });
    await expect(recovery.save(w)).rejects.toThrow(SaveCompatibilityError);
    expect(port.data).toEqual(before);
  });

  it.each([null, '{"slot":0}', '{broken'])(
    'protects the newest future slot when the manifest is %s',
    async (manifest) => {
      const port = new Memory();
      const saves = new Saves(port);
      await saves.save(world());
      const w = observed(1);
      await saves.save(w);
      const future = JSON.stringify({
        ...JSON.parse(port.getItem('haeram-soccor:slot:b')!),
        engine: '9.0.0',
      });
      port.data.set('haeram-soccor:slot:b', future);
      if (manifest === null) port.removeItem('haeram-soccor:manifest');
      else port.data.set('haeram-soccor:manifest', manifest);
      const before = new Map(port.data);
      const recovery = new Saves(port);
      await expect(recovery.load()).rejects.toThrow(SaveCompatibilityError);
      expect(recovery.incompatibleBackup).toBe(future);
      expect(port.data).toEqual(before);
    },
  );

  it.each([0, 1])(
    'preserves incompatible slot %i if an explicit replacement cannot commit',
    async (slot) => {
      const port = new Memory();
      const w = world();
      const future = JSON.stringify({ ...JSON.parse(await encode(w, 9, 8)), engine: '9.0.0' });
      const selected = `haeram-soccor:slot:${slot ? 'b' : 'a'}`;
      port.data.set(selected, future);
      port.data.set(`haeram-soccor:slot:${slot ? 'a' : 'b'}`, await encode(w, 8, 7));
      const manifest = JSON.stringify({ slot, worldId: w.id, generation: 9, parentGeneration: 8 });
      port.data.set('haeram-soccor:manifest', manifest);
      const recovery = new Saves(port);
      await expect(recovery.load()).rejects.toThrow(SaveCompatibilityError);
      expect(recovery.generationInfo).toEqual({ generation: 10, parentGeneration: 9 });
      const replacement = await encode(world(), 10, 9);
      port.fail = 'haeram-soccor:manifest';
      await expect(recovery.commit(replacement, { replaceIncompatible: true })).rejects.toThrow(
        'Quota',
      );
      expect(port.getItem(selected)).toBe(future);
      expect(port.getItem('haeram-soccor:manifest')).toBe(manifest);
      expect(recovery.incompatibleBackup).toBe(future);
      await expect(new Saves(port).load()).rejects.toThrow(SaveCompatibilityError);
      port.fail = '';
      await recovery.commit(replacement, { replaceIncompatible: true });
      expect((await new Saves(port).load())?.world.engine).toBe(CURRENT_ENGINE_VERSION);
      expect(JSON.parse(port.getItem('haeram-soccor:manifest')!).slot).toBe(1 - slot);
      expect(port.getItem(selected)).toBe(future);
      expect(recovery.incompatibleCheckpoint).toBe(false);
    },
  );

  it.each([
    { slot: 0 },
    { slot: 0, generation: 99, parentGeneration: 98 },
    { slot: 1, generation: 2, parentGeneration: 99 },
  ])('recovers the newest valid checkpoint after a damaged manifest %j', async (metadata) => {
    const port = new Memory();
    const saves = new Saves(port);
    await saves.save(world());
    const w = observed(1);
    await saves.save(w);
    port.data.set('haeram-soccor:manifest', JSON.stringify({ ...metadata, worldId: w.id }));
    const recovery = await new Saves(port).load();
    expect(recovery?.world.round).toBe(1);
    expect(recovery?.envelope.generation).toBe(2);
    expect(recovery?.recovered).toBe(true);
  });
});

describe('checkpoint container schema 2', () => {
  it('writes container 2 with unchanged world schema, codec, checksum, catalog pin and rules', async () => {
    expect(CURRENT_CHECKPOINT_SCHEMA).toBe(2);
    expect(SUPPORTED_CHECKPOINT_SCHEMAS).toEqual([
      1,
      2,
      FULL_MODEL_CHECKPOINT_SCHEMA,
      MANAGER_HISTORY_CHECKPOINT_SCHEMA,
    ]);
    expect(SUPPORTED_ENGINE_VERSIONS).toEqual([CURRENT_ENGINE_VERSION]);
    // A career saved before the full model and manager history, which a new founding tracks
    // (→SAVE-23/24).
    const w = withoutManagerHistory(withIdentity(unmodelled(1), IDENTITY));
    const two = JSON.parse(await encode(w, 3, 2)),
      one = JSON.parse(await seal(w, pack(w), 1, 3, 2));
    expect(two.schema).toBe(2);
    expect({ ...two, schema: 1, payload: '' }).toEqual({ ...one, payload: '' });
    const loaded = await decode(JSON.stringify(two));
    expect(loaded.envelope.schema).toBe(2);
    expect(loaded.world.schema).toBe(1);
    // Container 2 keeps the identity a container-1 reader would have had to drop.
    expect(canonical(loaded.world)).toBe(canonical(w));
    expect(canonical((await decode(JSON.stringify(one))).world)).toBe(canonical(w));
    // Neither container is permission to read earlier gameplay rules.
    const legacy = { ...unmodelled(), engine: '3.0.0' };
    for (const raw of [await encode(legacy), await seal(legacy)])
      await expect(decode(raw)).rejects.toMatchObject({
        code: 'save-compatibility',
        engine: '3.0.0',
      });
  });

  it('reads a genuine current-rule schema-1 envelope without rewriting it, then writes and reloads schema 2', async () => {
    const port = new Memory();
    // Careers from before the full model and manager history, which a new founding tracks
    // (→SAVE-23/24).
    const w = withoutManagerHistory(unmodelled(1)),
      next = withoutManagerHistory(unmodelled(2));
    const raw = await seal(w);
    expect(JSON.parse(raw).schema).toBe(1);
    port.data.set('haeram-soccor:slot:a', raw);
    port.data.set(
      'haeram-soccor:manifest',
      JSON.stringify({ slot: 0, worldId: w.id, generation: 1, parentGeneration: 0 }),
    );
    const before = new Map(port.data);
    const saves = new Saves(port);
    const loaded = await saves.load();
    expect(loaded?.envelope.schema).toBe(1);
    expect(loaded?.raw).toBe(raw);
    expect(loaded?.recovered).toBe(false);
    expect(canonical(loaded!.world)).toBe(canonical(w));
    expect(port.data).toEqual(before);
    await saves.save(next);
    const reloaded = await new Saves(port).load();
    expect(reloaded?.envelope.schema).toBe(2);
    expect(reloaded?.envelope.parentGeneration).toBe(1);
    expect(canonical(reloaded!.world)).toBe(canonical(next));
    // The schema-1 predecessor stays exactly as it was written.
    expect(port.getItem('haeram-soccor:slot:a')).toBe(raw);
  });

  it('future envelope or nested identity version remains a compatibility error', async () => {
    const w = world();
    const current = JSON.parse(await encode(w));
    for (const schema of [0, MANAGER_HISTORY_CHECKPOINT_SCHEMA + 1, 99])
      await expect(decode(JSON.stringify({ ...current, schema }))).rejects.toBeInstanceOf(
        SaveCompatibilityError,
      );
    await expect(decode(JSON.stringify({ ...current, schema: '2' }))).rejects.toThrow('헤더');
    const future = withIdentity(w, { ...IDENTITY, version: 2 });
    for (const raw of [await encode(future), await seal(future)])
      await expect(decode(raw)).rejects.toBeInstanceOf(SaveCompatibilityError);
    // The preflight runs before unpacking: damage elsewhere is not reported for a newer game.
    const damaged = structuredClone(pack(future));
    damaged.dict = 'damaged' as unknown as string[];
    await expect(decode(await seal(future, damaged, 2))).rejects.toBeInstanceOf(
      SaveCompatibilityError,
    );
    const plain = structuredClone(pack(w));
    plain.dict = 'damaged' as unknown as string[];
    const corrupt = await decode(await seal(w, plain, 2)).catch((error: unknown) => error);
    expect(corrupt).toBeInstanceOf(Error);
    expect(isSaveCompatibilityError(corrupt)).toBe(false);
    // A malformed current-version identity is ordinary invalid data.
    const malformed = withIdentity(w, { ...IDENTITY, colours: ['red'] });
    const invalid = await decode(await encode(malformed)).catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(Error);
    expect(isSaveCompatibilityError(invalid)).toBe(false);
  });

  it.each([true, false])(
    'a valid older predecessor never replaces a newer identity save (manifest kept: %s)',
    async (manifest) => {
      const port = new Memory();
      const saves = new Saves(port);
      await saves.save(world());
      await saves.save(observed(1));
      const newer = await encode(withIdentity(observed(1), { ...IDENTITY, version: 2 }), 2, 1);
      port.data.set('haeram-soccor:slot:b', newer);
      if (!manifest) port.removeItem('haeram-soccor:manifest');
      const before = new Map(port.data);
      const recovery = new Saves(port);
      await expect(recovery.load()).rejects.toBeInstanceOf(SaveCompatibilityError);
      expect(recovery.incompatibleBackup).toBe(newer);
      expect(recovery.incompatibleCheckpoint).toBe(true);
      await expect(recovery.save(observed(1))).rejects.toBeInstanceOf(SaveCompatibilityError);
      expect(port.data).toEqual(before);
      await expect(new Saves(port).load()).rejects.toBeInstanceOf(SaveCompatibilityError);
    },
  );
});

/**
 * A career whose own records wear every shirt role: a custom one-colour crest, home, away and
 * third chosen for three matches with a design edit after the first, then a choice left pending.
 */
const identityCareer = () =>
  cachedWorld('identity-career', () => {
    const w = world();
    const design = (primary: string): ClubIdentity => {
      const own = w.clubs.find((club) => club.id === w.playerClub)!.identity!;
      const { pattern, emblem } = own.crest;
      return { ...own, colours: [primary], crest: { shape: 'diamond', pattern, emblem, primary } };
    };
    operate(w, { type: 'club-identity', identity: design('#AbCdEf') });
    (['home', 'away', 'third'] as const).forEach((role, i) => {
      if (i === 1) operate(w, { type: 'club-identity', identity: design('#5A3E8c') });
      const next = nextOwnFixture(w)!;
      operate(w, { type: 'match-kit', fixtureId: next.id, role });
      advanceDays(w, fixtureDay(next) - currentDay(w), undefined, false);
    });
    operate(w, { type: 'match-kit', fixtureId: nextOwnFixture(w)!.id, role: 'away' });
    return w;
  });

const MODEL_STATE = (w: World): MatchModelState => ({
  revision: MATCH_MODEL_REVISION,
  activated: { year: w.year, day: 3, revision: w.revision },
  trackedFrom: { year: w.year, day: 4, round: w.round },
  coverage: 'activation',
});
/**
 * `w` with every kind of model data (synthetic values): metadata, NPC aggregates naming a departed
 * player and a full own record. The cached world is left untouched.
 */
/** `w` with full-model data, as a container-3 writer made it: before manager history (→SAVE-24). */
function modelCareer(w: World): World {
  const copy = withoutManagerHistory(structuredClone(w));
  const other = copy.clubs.find((club) => club.id !== copy.playerClub)!.id;
  const row = (width: number, at: number) =>
    Array.from({ length: width }, (_, i) => (i === at ? 2 ** 36 + i : 0));
  copy.matchModel = MODEL_STATE(copy);
  copy.npcSeason = {
    year: copy.year,
    model: MATCH_MODEL_REVISION,
    trackedFrom: MODEL_STATE(copy).trackedFrom,
    competitions: [
      {
        kind: 'league',
        groupKey: copy.fixtures[0].groupKey,
        clubs: [
          {
            club: other,
            matches: 1,
            metrics: row(12, 0),
            detail: row(TEAM_DETAIL_SIZE, 3),
            xg: 131,
            xga: 0,
          },
        ],
        players: [
          {
            id: 'ENG:departed:9',
            name: 'Gone Before Close',
            position: copy.players[0].position,
            clubs: [
              {
                club: other,
                appearances: 1,
                starts: 1,
                metrics: row(12, 0),
                detail: row(PLAYER_DETAIL_SIZE, 1),
              },
            ],
          },
        ],
      },
    ],
  };
  copy.ownMatches[copy.ownMatches.length - 1].model = MATCH_MODEL_REVISION;
  return copy;
}
describe('checkpoint container 3 (→SAVE-23)', () => {
  it('round trips a model career through the codec in container 3 only', async () => {
    const w = modelCareer(unmodelled(1));
    const raw = await encode(w, 2, 1);
    expect(JSON.parse(raw).schema).toBe(FULL_MODEL_CHECKPOINT_SCHEMA);
    const loaded = await decode(raw);
    expect(loaded.envelope.schema).toBe(FULL_MODEL_CHECKPOINT_SCHEMA);
    expect(loaded.world.schema).toBe(1);
    expect(canonical(loaded.world)).toBe(canonical(w));
    expect((await checkpoint(w)).envelope.schema).toBe(FULL_MODEL_CHECKPOINT_SCHEMA);
    // Model data in an older container is no writer this version knows: kept, never recovered over.
    for (const schema of [1, 2])
      await expect(decode(await seal(w, pack(w), schema))).rejects.toBeInstanceOf(
        SaveCompatibilityError,
      );
    // Nor is a world without model data in container 3.
    const plain = withoutManagerHistory(unmodelled(1));
    await expect(
      decode(await seal(plain, pack(plain), FULL_MODEL_CHECKPOINT_SCHEMA)),
    ).rejects.toBeInstanceOf(SaveCompatibilityError);
    // Inline model data in the compact world is malformed, not a newer game.
    const inline = pack(w);
    inline.world = { ...inline.world, matchModel: w.matchModel };
    const invalid = await decode(await seal(w, inline, FULL_MODEL_CHECKPOINT_SCHEMA)).catch(
      (error: unknown) => error,
    );
    expect(invalid).toBeInstanceOf(Error);
    expect(isSaveCompatibilityError(invalid)).toBe(false);
  });

  it('reads supported identity-era checkpoints', async () => {
    // Container 2 with identities and recorded appearances, and container 1 before identities,
    // both written before the full model and manager history.
    const identity = withoutManagerHistory(withIdentity(unmodelled(1), IDENTITY));
    const legacy = preIdentityCareer();
    for (const [w, raw] of [
      [identity, await seal(identity, pack(identity), 2)],
      [legacy, await containerOneCheckpoint(legacy)],
    ] as const) {
      const loaded = await decode(raw);
      expect(loaded.envelope.schema).toBeLessThan(FULL_MODEL_CHECKPOINT_SCHEMA);
      expect(loaded.world.engine).toBe(CURRENT_ENGINE_VERSION);
      expect(canonical(loaded.world)).toBe(canonical(w));
      // Counters that were never tracked stay absent: no metadata, aggregates or record models.
      expect(loaded.world).not.toHaveProperty('matchModel');
      expect(loaded.world).not.toHaveProperty('npcSeason');
      expect(loaded.world.ownMatches.every((m) => !('model' in m))).toBe(true);
      // Unactivated, it is written again in the current container, never in the model one.
      expect(JSON.parse(await encode(loaded.world)).schema).toBe(CURRENT_CHECKPOINT_SCHEMA);
    }
  });

  it('refuses a future model container', async () => {
    const w = modelCareer(unmodelled(1));
    const current = JSON.parse(await encode(w));
    // The next container is refused before decompression, and its header grants no reset.
    const next = JSON.stringify({ ...current, schema: MANAGER_HISTORY_CHECKPOINT_SCHEMA + 1 });
    await expect(decode(next)).rejects.toBeInstanceOf(SaveCompatibilityError);
    expect(envelopeEngine(next)).toBeUndefined();
    // A newer model section or revision inside container 3, before anything is unpacked.
    const future = (edit: (p: ReturnType<typeof pack>) => void) => {
      const packed = structuredClone(pack(w));
      edit(packed);
      return seal(w, packed, FULL_MODEL_CHECKPOINT_SCHEMA);
    };
    for (const edit of [
      (p: ReturnType<typeof pack>) => (p.model!.version = 2 as 1),
      (p: ReturnType<typeof pack>) => (p.model!.revisions = ['continuous-aggregate-6']),
      (p: ReturnType<typeof pack>) => {
        p.model!.revisions = ['continuous-aggregate-6'];
        p.dict = 'damaged' as unknown as string[];
      },
      (p: ReturnType<typeof pack>) => {
        p.world = {
          ...p.world,
          matchModel: { ...w.matchModel!, revision: 'continuous-aggregate-6' },
        } as unknown as World;
      },
    ])
      await expect(decode(await future(edit))).rejects.toBeInstanceOf(SaveCompatibilityError);
    // A malformed supported section is ordinary invalid data.
    for (const edit of [
      (p: ReturnType<typeof pack>) => (p.model!.state![7] = 9),
      (p: ReturnType<typeof pack>) => p.model!.season!.header.pop(),
      (p: ReturnType<typeof pack>) => (p.model!.records = [0, 1]),
    ]) {
      const invalid = await decode(await future(edit)).catch((error: unknown) => error);
      expect(invalid).toBeInstanceOf(Error);
      expect(isSaveCompatibilityError(invalid)).toBe(false);
    }
    // A newer model inside a world-schema-valid world is refused the same way through validation.
    const revision = structuredClone(w);
    (revision.npcSeason as { model: string }).model = 'continuous-aggregate-6';
    await expect(encode(revision).then(decode)).rejects.toBeInstanceOf(SaveCompatibilityError);
  });

  it('keeps current and previous on failed writes', async () => {
    const port = new Memory();
    const previous = new MemoryPrevious(),
      active = new MemoryPrevious();
    const open = () => new Saves(port, decode, previous, active);
    const saves = open();
    const first = await saves.save(unmodelled(1));
    const manifest = port.getItem(MANIFEST);
    const w = modelCareer(unmodelled(2));
    // A failed write of the active copy keeps the committed checkpoint and its verified copy.
    active.fail = true;
    await expect(saves.save(w)).rejects.toThrow('Quota');
    expect(active.value).toBe(first);
    expect(port.getItem(MANIFEST)).toBe(manifest);
    expect(previous.value).toBe(first);
    expect(canonical((await open().load())!.world)).toBe(canonical(unmodelled(1)));
    // The progress in memory still exports and imports whole.
    expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
    active.fail = false;
    const second = await saves.save(w);
    const reloaded = (await open().load())!;
    expect(reloaded.envelope).toMatchObject({
      schema: FULL_MODEL_CHECKPOINT_SCHEMA,
      generation: 2,
      parentGeneration: 1,
    });
    expect(canonical(reloaded.world)).toBe(canonical(w));
    expect(previous.value).toBe(first);
    // A later failure keeps the container-3 checkpoint committed, now with itself as the copy.
    const later = structuredClone(w);
    later.npcSeason!.competitions[0].clubs[0].matches = 2;
    active.fail = true;
    await expect(saves.save(later)).rejects.toThrow('Quota');
    const kept = (await open().load())!;
    expect(kept.raw).toBe(second);
    expect(kept.recovered).toBe(false);
    expect(canonical(kept.world)).toBe(canonical(w));
    expect(previous.value).toBe(second);
  });
});
describe('club identities and recorded appearances (→SAVE-20, SAVE-22)', () => {
  it('survive a real codec round trip as separate copies', async () => {
    const w = identityCareer();
    expect(w.ownMatches.every((m) => m.appearance)).toBe(true);
    expect(w.kitChoice).toBeDefined();
    const restored = (await decode(await encode(w))).world;
    expect(canonical(restored)).toBe(canonical(w));
    // Each restored record owns its snapshot; editing the design afterwards reaches none of them.
    const [first, second] = restored.ownMatches;
    expect(first.appearance).not.toBe(second.appearance);
    const recorded = canonical(restored.ownMatches.map((m) => m.appearance));
    restored.clubs.find((club) => club.id === restored.playerClub)!.identity!.crest.primary =
      '#000000';
    expect(canonical(restored.ownMatches.map((m) => m.appearance))).toBe(recorded);
  });

  it('reads a career saved before identities without installing any: only activation adopts', async () => {
    const legacy = observed(1);
    for (const club of legacy.clubs) delete club.identity;
    for (const match of legacy.ownMatches) delete match.appearance;
    const loaded = (await decode(await encode(legacy))).world;
    expect(canonical(loaded)).toBe(canonical(legacy));
    expect(loaded.clubs.some((club) => club.identity)).toBe(false);
    expect(loaded.ownMatches.some((match) => 'appearance' in match)).toBe(false);
  });

  it('rejects a damaged appearance stream and reports a newer one as incompatible', async () => {
    const w = identityCareer();
    const swapped = pack(w);
    swapped.appearances!.values[0].sides.reverse();
    const damaged = await decode(await seal(w, swapped, 2)).catch((error: unknown) => error);
    expect(damaged).toBeInstanceOf(Error);
    expect(isSaveCompatibilityError(damaged)).toBe(false);
    for (const newer of [
      (p: ReturnType<typeof pack>) => (p.appearances!.version = 2 as 1),
      (p: ReturnType<typeof pack>) => (p.appearances!.values[1].version = 2 as 1),
    ]) {
      const packed = pack(w);
      newer(packed);
      await expect(decode(await seal(w, packed, 2))).rejects.toBeInstanceOf(SaveCompatibilityError);
    }
  });
});

/** One IndexedDB key of the game in play, active or previous (→SAVE-3), kept in memory. */
class MemoryPrevious implements PreviousStore {
  value: string | null = null;
  fail = false;
  async read() {
    return this.value;
  }
  async write(raw: string) {
    if (this.fail) throw new Error('QuotaExceededError');
    this.value = raw;
  }
  async clear() {
    this.value = null;
  }
}
/** The continuity journey's career: founded in FOUNDED_DESIGN, its first own match settled. */
const continuityCareer = () =>
  cachedWorld('continuity-career', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Continuity Kit FC',
      color: FOUNDED_DESIGN.colours[0],
      seed: 'identity-continuity',
      level: 'easy',
      identity: FOUNDED_DESIGN,
    });
    const next = nextOwnFixture(w)!;
    advanceDays(w, fixtureDay(next) - currentDay(w), undefined, false);
    return w;
  });

describe('club identity continuity fixtures (→KIT-12/15, SAVE-3/20/21/22)', () => {
  it('the journey steps give its literal designs from any founding draft', () => {
    for (const seed of ['identity-continuity-360', 'identity-continuity-390', 'save-test']) {
      const draft = createIdentityDraft({ country: 'ENG', seed, color: FIRST_COLOUR });
      expect(FOUNDING_ACTIONS.reduce(reduceIdentityDraft, draft)).toEqual(FOUNDED_DESIGN);
    }
    expect(clubIdentitySchema.parse(FOUNDED_DESIGN)).toEqual(FOUNDED_DESIGN);
    expect(FOUNDED_DESIGN.crest).not.toHaveProperty('secondary');
    for (const role of KIT_ROLES) {
      const edited = editActions(role).reduce(reduceIdentityDraft, FOUNDED_DESIGN);
      expect(edited).toEqual(editedDesign(role));
      expect(clubIdentitySchema.parse(edited)).toEqual(edited);
    }
  });

  it('a founded design, its settled match and a later edit round-trip with the earlier appearance frozen', async () => {
    const w = continuityCareer();
    expect(w.ownMatches.length).toBeGreaterThan(0);
    const record = w.ownMatches.at(-1)!;
    const side = record.home === w.playerClub ? 0 : 1;
    const frozen = structuredClone(record.appearance!);
    const worn = frozen.sides[side];
    expect(worn.crest).toEqual(FOUNDED_DESIGN.crest);
    expect(worn.shirt).toEqual(FOUNDED_DESIGN.kits[worn.role]);
    operate(w, { type: 'club-identity', identity: editedDesign(worn.role) });
    const restored = (await decode(await encode(w))).world;
    expect(canonical(restored)).toBe(canonical(w));
    const own = restored.clubs.find((club) => club.id === restored.playerClub)!;
    expect(own.identity).toEqual(editedDesign(worn.role));
    expect(own.color).toBe(FOUNDED_DESIGN.colours[0]);
    const kept = restored.ownMatches.find((match) => match.id === record.id)!;
    expect(kept.appearance).toEqual(frozen);
    expect(appearanceForFixture(restored, kept).sides[side]).not.toEqual(worn);
  });

  it('a pre-identity career in container 1 reads unchanged; adoption adds only designs, with the exact legacy crests', async () => {
    const legacy = preIdentityCareer();
    const read = await decode(await containerOneCheckpoint(legacy));
    expect(read.envelope.schema).toBe(1);
    expect(canonical(read.world)).toBe(canonical(legacy));
    expect(read.world.clubs.some((club) => club.identity)).toBe(false);
    expect(read.world.ownMatches.length).toBeGreaterThan(0);
    expect(read.world.ownMatches.some((match) => 'appearance' in match)).toBe(false);
    const adopted = adoptedCareer(read.world, ENABLED_RELEASE);
    const crests = legacyCrestMap(legacy);
    for (const club of adopted.clubs) {
      const before = legacy.clubs.find((c) => c.id === club.id)!;
      expect(club.color).toBe(before.color);
      expect(club.identity).toEqual(identityOf(legacy, club.id));
      expect(club.identity!.crest).toEqual(crests.get(club.id));
      expect(club.identity!.colours).toEqual([before.color, crests.get(club.id)!.secondary]);
    }
    // Beside the designs, the activation only records the full model and starts manager tracking
    // there (→SAVE-23/24): nothing settled before it changes.
    expect(adopted.matchModel?.coverage).toBe('activation');
    expect(adopted.matchModel?.activated.revision).toBe(adopted.revision);
    const designless = (w: World) => ({
      ...w,
      revision: 0,
      managerHistory: undefined,
      matchModel: undefined,
      npcSeason: undefined,
      clubs: w.clubs.map((club) => ({ ...club, identity: undefined })),
    });
    expect(canonical(designless(adopted))).toBe(canonical(designless(legacy)));
    expect(adopted.revision).toBe(legacy.revision + 1);
    expect(canonical((await decode(await encode(adopted, 2, 1))).world)).toBe(canonical(adopted));
    // Only what is missing: an identity already there stays, and a second pass changes nothing.
    const partial = structuredClone(legacy);
    const rival = partial.clubs.find((club) => club.id !== partial.playerClub)!;
    rival.identity = { ...identityOf(legacy, rival.id), kits: { ...FOUNDED_DESIGN.kits } };
    const designed = structuredClone(rival.identity);
    expect(installMissingIdentities(partial)).toBe(true);
    expect(partial.clubs.find((club) => club.id === rival.id)!.identity).toEqual(designed);
    const once = canonical(partial);
    expect(installMissingIdentities(partial)).toBe(false);
    expect(canonical(partial)).toBe(once);
  });

  it.each(Object.keys(FUTURE_CHECKPOINTS))(
    'newer data (%s) over a valid previous copy blocks fallback and writes',
    async (name) => {
      const port = new Memory();
      const previous = new MemoryPrevious(),
        active = new MemoryPrevious();
      const saves = new Saves(port, decode, previous, active);
      await saves.save(world());
      await saves.save(observed(1));
      const older = previous.value;
      expect(older).not.toBeNull();
      const newer = await FUTURE_CHECKPOINTS[name](observed(1), 2, 1);
      active.value = newer;
      const before = new Map(port.data);
      for (const manifest of [true, false]) {
        if (!manifest) {
          port.removeItem(MANIFEST);
          before.delete(MANIFEST);
        }
        const recovery = new Saves(port, decode, previous, active);
        await expect(recovery.load()).rejects.toBeInstanceOf(SaveCompatibilityError);
        expect(recovery.incompatibleBackup).toBe(newer);
        expect(recovery.recoveryRaw()).toBe(newer);
        await expect(recovery.save(observed(1))).rejects.toBeInstanceOf(SaveCompatibilityError);
        expect(port.data).toEqual(before);
        expect([active.value, previous.value]).toEqual([newer, older]);
      }
    },
  );

  it('a failed write of the adopted career keeps the original checkpoint loadable as its verified previous copy', async () => {
    const legacy = preIdentityCareer();
    const raw = await containerOneCheckpoint(legacy);
    // The career is still where an earlier layout left it, in slot:a.
    const port = new Memory();
    const { worldId, generation, parentGeneration } = JSON.parse(raw);
    port.data.set(SLOT[0], raw);
    const manifest = JSON.stringify({ slot: 0, worldId, generation, parentGeneration });
    port.data.set(MANIFEST, manifest);
    const previous = new MemoryPrevious(),
      active = new MemoryPrevious();
    const open = () => new Saves(port, decode, previous, active);
    const saves = open();
    await saves.load();
    active.fail = true;
    await expect(saves.save(adoptedCareer(legacy, ENABLED_RELEASE))).rejects.toThrow('Quota');
    expect(port.getItem(SLOT[0])).toBe(raw);
    expect(port.getItem(MANIFEST)).toBe(manifest);
    expect(previous.value).toBe(raw);
    expect(canonical((await open().load())!.world)).toBe(canonical(legacy));
    active.fail = false;
    await saves.save(adoptedCareer(legacy, ENABLED_RELEASE));
    // It moved: slot:a goes once the manifest names the IndexedDB generation (→SAVE-3).
    expect(port.getItem(SLOT[0])).toBeNull();
    const reloaded = (await open().load())!;
    // The adopted career is tracked from that write on, in its container (→SAVE-24).
    expect(reloaded.envelope).toMatchObject({
      schema: MANAGER_HISTORY_CHECKPOINT_SCHEMA,
      generation: 2,
      parentGeneration: 1,
    });
    expect(canonical(reloaded.world)).toBe(canonical(adoptedCareer(legacy, ENABLED_RELEASE)));
    expect(previous.value).toBe(raw);
  });
});

it('feature-state-lossless-roundtrip and continued-career-parity preserve roles, money, draws and promise judgements', async () => {
  const { operate } = await import('../../../../packages/engine/src/index');
  const { judgePromises } = await import('../../../../packages/engine/src/promises');
  const { encourageCoaching } = await import('../../../../packages/engine/src/coaching-entry');
  const original = features(),
    restored = (await decode(await encode(original))).world;
  expect(canonical(restored)).toBe(canonical(original));
  const player = Object.values(original.playingCoachProposals!)[0].person;
  for (const w of [original, restored]) {
    const cash = w.cash;
    operate(w, { type: 'answer-playing-coach', player, accept: true });
    expect(w.cash).toBe(cash);
    expect(() => encourageCoaching(w, player)).toThrow();
    advanceDays(w, 2, undefined, false);
  }
  expect(canonical(restored)).toBe(canonical(original));
  for (const w of [original, restored]) {
    const promise = w.promises!.find((p) => p.status === 'pending')!;
    w.year = promise.deadline.year;
    w.calendar = { day: promise.deadline.day + 1 };
    w.round = Math.floor(w.calendar.day / 7);
    delete w.scorerSeason;
    judgePromises(w);
    const after = canonical(w);
    judgePromises(w);
    expect(canonical(w)).toBe(after);
  }
  expect(canonical(restored)).toBe(canonical(original));
  expect(canonical((await decode(await encode(restored))).world)).toBe(canonical(original));
});

it('validates Brotli envelope checksums, world metadata and future codecs before activation', async () => {
  const w = features();
  const e = JSON.parse(await encode(w));
  e.codec = 'brotli-bmp127';
  e.payload = bmpText(brotliCompressSync(new TextEncoder().encode(canonical(pack(w)))));
  expect(canonical((await decode(JSON.stringify(e))).world)).toBe(canonical(w));
  await expect(decode(JSON.stringify({ ...e, checksum: '0'.repeat(64) }))).rejects.toThrow(
    '체크섬',
  );
  await expect(decode(JSON.stringify({ ...e, worldId: 'wrong-world' }))).rejects.toThrow('헤더');
  await expect(decode(JSON.stringify({ ...e, codec: 'brotli-bmp128' }))).rejects.toBeInstanceOf(
    SaveCompatibilityError,
  );
});

it('rejects malformed compact optional shapes and expanded person facts on the full-world validation path', async () => {
  const w = features(),
    envelope = JSON.parse(await encode(w));
  for (const corrupt of [
    (p: ReturnType<typeof pack>) => {
      if (p.careers?.version === 2 || p.careers?.version === 3)
        p.careers.people[4][0] = 'bad-grade';
    },
    (p: ReturnType<typeof pack>) => {
      if (p.careers?.version === 2 || p.careers?.version === 3) p.careers.people[13][0] = false;
    },
    (p: ReturnType<typeof pack>) => {
      if (p.careers?.version === 2 || p.careers?.version === 3) p.careers.people[14][0] = 0;
    },
    (p: ReturnType<typeof pack>) => {
      if (p.careers?.version === 2 || p.careers?.version === 3) p.careers.people[17][0] = [];
    },
    (p: ReturnType<typeof pack>) => {
      if (p.careers?.version === 2 || p.careers?.version === 3) p.careers.people[2][0] = 0.5;
    },
  ]) {
    const packed = pack(w);
    corrupt(packed);
    const bytes = new TextEncoder().encode(canonical(packed));
    const raw = JSON.stringify({
      ...envelope,
      codec: 'brotli-bmp127',
      checksum: await sha256(bytes),
      payload: bmpText(brotliCompressSync(bytes)),
    });
    await expect(decode(raw)).rejects.toThrow();
  }
});
