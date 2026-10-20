import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { advanceDays, advanceRound, simulateSeason } from '../../../../packages/engine/src/index';
import { featureState } from '../../../../tests/fixtures/feature-state';
import { cachedWorld, simulatedWorld } from '../../../../tests/fixtures/worlds';
import { checkpoint, encode, decode, Saves, type StoragePort } from './persistence';
import { base64, pack, unpack } from './packing';
import { denseBytes } from './dense';
import { bmpText } from './bmp127';
import { brotliCompressSync } from 'node:zlib';
import {
  CURRENT_ENGINE_VERSION,
  envelopeEngine,
  isEarlierEngine,
  PRIOR_CATALOG_HASHES,
  SaveCompatibilityError,
  upgradeWorldRules,
} from '../../../../packages/contracts/src/versions';
import {
  CATALOG_HASH,
  CATALOG_VERSION,
  CURRENT_CATALOG,
} from '../../../../packages/catalogs/src/index';
import type { World } from '../../../../packages/contracts/src/types';
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
const features = () => cachedWorld('feature-state', () => featureState());
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
    await expect(decode(JSON.stringify({ ...e, schema: 2 }))).rejects.toThrow('버전');
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
    ['schema', 2],
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
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const raw = JSON.stringify({
      ...envelope,
      codec: 'brotli-bmp127',
      checksum,
      payload: bmpText(brotliCompressSync(bytes)),
    });
    await expect(decode(raw)).rejects.toThrow();
  }
});
