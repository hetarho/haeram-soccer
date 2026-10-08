import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { createWorld, advanceRound } from '../../../../packages/engine/src/index';
import { encode, decode, Saves, type StoragePort } from './persistence';
import { pack, unpack } from './packing';
import {
  CURRENT_ENGINE_VERSION,
  SaveCompatibilityError,
  upgradeWorldRules,
} from '../../../../packages/contracts/src/versions';
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
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Archive United',
    color: '#126044',
    seed: 'save-test',
    difficulty: 1,
  });
// The original compact1 unsigned stream, used to exercise historical save compatibility.
function legacyIntegers(values: number[], width: number) {
  const count = values.length / width;
  const columns = Array.from(
    { length: values.length },
    (_, index) => values[(index % count) * width + Math.floor(index / count)],
  );
  const bytes: number[] = [];
  for (let value of columns) {
    do {
      const next = value % 128;
      value = Math.floor(value / 128);
      bytes.push(next + (value ? 128 : 0));
    } while (value);
  }
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    encoded += String.fromCharCode(...bytes.slice(offset, offset + 32768));
  return btoa(encoded);
}
describe('recoverable persistence', () => {
  it('roundtrips active schedule, exact money and all match/player facts losslessly', async () => {
    const w = world();
    advanceRound(w);
    advanceRound(w);
    w.cash = '98765432101234567890';
    expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
  });
  it('roundtrips off days and compact rank snapshots and preserves older saves without these fields', async () => {
    const { advanceDays } = await import('../../../../packages/engine/src/index');
    const w = world();
    advanceDays(w, 10);
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
    const w = world();
    for (let round = 0; round < 4; round++) advanceRound(w, undefined, false);
    expect(w.scorerSeason!.history).toHaveLength(5);
    expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
    const legacy = structuredClone(w);
    delete legacy.scorerSeason;
    const loaded = (await decode(await encode(legacy))).world;
    expect(loaded.scorerSeason).toBeUndefined();
    expect(canonical(loaded)).toBe(canonical(legacy));
  });
  it('reads legacy inline events and preserves optional fields in dictionary-packed financial receipts', () => {
    const w = world();
    advanceRound(w, undefined, false);
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
    const w = world();
    advanceRound(w, undefined, false);
    advanceRound(w, undefined, false);
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
    const w = world();
    advanceRound(w, undefined, false);
    const goals = structuredClone(w);
    goals.scorerSeason!.players[0].goals++;
    await expect(decode(await encode(goals))).rejects.toThrow('득점 순위와 실제 경기');
    const history = structuredClone(w);
    history.scorerSeason!.history.at(-1)!.rows[0][0] = history.scorerSeason!.players.length;
    await expect(decode(await encode(history))).rejects.toThrow('득점 순위 추이');
  });
  it('rejects payload corruption and future versions', async () => {
    const e = JSON.parse(await encode(world()));
    await expect(decode(JSON.stringify({ ...e, checksum: '0'.repeat(64) }))).rejects.toThrow(
      '체크섬',
    );
    await expect(decode(JSON.stringify({ ...e, schema: 2 }))).rejects.toThrow('버전');
    await expect(decode('x'.repeat(4 * 1024 * 1024 + 1))).rejects.toThrow('너무');
  });
  it('commits manifest last and retains previous world on quota failure', async () => {
    const port = new Memory();
    const saves = new Saves(port);
    const w = world();
    await saves.save(w);
    const before = port.getItem('haeram-soccor:manifest');
    advanceRound(w);
    port.fail = 'haeram-soccor:manifest';
    await expect(saves.save(w)).rejects.toThrow('Quota');
    expect(port.getItem('haeram-soccor:manifest')).toBe(before);
    expect((await new Saves(port).load())?.world.round).toBe(0);
  });
  it('recovers the previous slot and preserves it on the next commit', async () => {
    const port = new Memory();
    const saves = new Saves(port);
    const w = world();
    await saves.save(w);
    advanceRound(w);
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
      const w = world();
      await saves.save(w);
      advanceRound(w);
      await saves.save(w);
      if (manifest === null) port.removeItem('haeram-soccor:manifest');
      else port.setItem('haeram-soccor:manifest', manifest);

      const recovery = new Saves(port);
      const loaded = await recovery.load();
      expect(loaded?.recovered).toBe(true);
      expect(loaded?.world.round).toBe(1);
      expect(recovery.generationInfo).toEqual({ generation: 3, parentGeneration: 2 });
      advanceRound(loaded!.world);
      await recovery.save(loaded!.world);
      expect((await new Saves(port).load())?.world.round).toBe(2);
      expect((await decode(port.getItem('haeram-soccor:slot:b')!)).world.round).toBe(1);
    },
  );
  it('reports recovery when the selected manifest parent disagrees with the checkpoint', async () => {
    const port = new Memory();
    const saves = new Saves(port);
    const w = world();
    await saves.save(w);
    advanceRound(w);
    await saves.save(w);
    const manifest = JSON.parse(port.getItem('haeram-soccor:manifest')!);
    port.setItem('haeram-soccor:manifest', JSON.stringify({ ...manifest, parentGeneration: 0 }));
    const loaded = await new Saves(port).load();
    expect(loaded?.world.round).toBe(1);
    expect(loaded?.recovered).toBe(true);
    expect(loaded?.errors.join(' ')).toContain('계보');
  });
});
it('preserves first and second European phases and global standings in a historical checkpoint', async () => {
  const { prepareSeason, simulateSeason } = await import('../../../../packages/engine/src/index');
  const w = world();
  w.year = 2000;
  w.currency = 'GBP';
  w.manager.since = 1997;
  w.manager.until = 2003;
  for (const p of w.players) p.born = 1978;
  prepareSeason(w);
  simulateSeason(w);
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
it('rejects broken counters and historical club references before activation', async () => {
  const { simulateSeason } = await import('../../../../packages/engine/src/index');
  const w = world();
  advanceRound(w);
  const tampered = structuredClone(w);
  tampered.ownMatches[0].metrics[0][0]++;
  await expect(decode(await encode(tampered))).rejects.toThrow('경기 지표');
  simulateSeason(w);
  w.history[0].champions[0].club = 'missing-club';
  await expect(decode(await encode(w))).rejects.toThrow('우승 기록 참조');
});

describe('compatible rule upgrades', () => {
  it('upgrades only metadata/revision and retains exact career facts and absent optional fields', async () => {
    const { simulateSeason, advanceDays } = await import('../../../../packages/engine/src/index');
    const legacy = world();
    simulateSeason(legacy);
    advanceDays(legacy, 10);
    legacy.engine = '1.0.0';
    legacy.revision = 23;
    legacy.cash = '98765432101234567890';
    delete legacy.training;
    delete legacy.players[0].developed;
    const before = canonical(legacy);
    expect(legacy.history.length).toBeGreaterThan(0);
    expect(legacy.ownMatches.length).toBeGreaterThan(30);
    expect(legacy.players.some((player) => (player.developed || 0) > 0)).toBe(true);
    const decoded = (await decode(await encode(legacy))).world;
    expect(canonical(decoded)).toBe(before);
    const upgraded = upgradeWorldRules(decoded);
    expect(canonical(upgraded)).toBe(
      canonical({ ...legacy, engine: CURRENT_ENGINE_VERSION, revision: 24 }),
    );
    expect(canonical(legacy)).toBe(before);
    expect(upgraded.training).toBeUndefined();
    expect(Object.hasOwn(upgraded.players[0], 'developed')).toBe(false);
    expect(upgradeWorldRules(upgraded)).toBe(upgraded);
    expect(canonical((await decode(await encode(upgraded))).world)).toBe(canonical(upgraded));
    const old = world();
    old.engine = '1.0.0';
    delete old.calendar;
    delete old.rankHistory;
    delete old.scorerSeason;
    const migratedOld = upgradeWorldRules((await decode(await encode(old))).world);
    for (const field of [
      'calendar',
      'rankHistory',
      'scorerSeason',
      'training',
      'trainingAt',
      'policy',
    ])
      expect(Object.hasOwn(migratedOld, field)).toBe(false);
  });

  it('does not reinterpret future worlds or overflow a revision during a pure upgrade', () => {
    const future = { ...world(), engine: '2.0.0' };
    const before = canonical(future);
    expect(() => upgradeWorldRules(future)).toThrow(SaveCompatibilityError);
    expect(canonical(future)).toBe(before);
    const legacy = { ...world(), engine: '1.0.0', revision: Number.MAX_SAFE_INTEGER };
    expect(() => upgradeWorldRules(legacy)).toThrow('revision');
    expect(legacy.revision).toBe(Number.MAX_SAFE_INTEGER);
    expect(legacy.engine).toBe('1.0.0');
  });
});

describe('incompatible checkpoint protection', () => {
  it.each([
    ['schema', 2],
    ['engine', '2.0.0'],
    ['catalog', 'future-catalog'],
    ['catalogHash', 'f'.repeat(64)],
    ['codec', 'future-codec'],
  ])('blocks fallback and writes for an unsupported selected %s', async (field, value) => {
    const port = new Memory();
    const saves = new Saves(port);
    const w = world();
    await saves.save(w);
    advanceRound(w);
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
      const w = world();
      await saves.save(w);
      advanceRound(w);
      await saves.save(w);
      const future = JSON.stringify({
        ...JSON.parse(port.getItem('haeram-soccor:slot:b')!),
        engine: '2.0.0',
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
      const future = JSON.stringify({ ...JSON.parse(await encode(w, 9, 8)), engine: '2.0.0' });
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
    const w = world();
    await saves.save(w);
    advanceRound(w);
    await saves.save(w);
    port.data.set('haeram-soccor:manifest', JSON.stringify({ ...metadata, worldId: w.id }));
    const recovery = await new Saves(port).load();
    expect(recovery?.world.round).toBe(1);
    expect(recovery?.envelope.generation).toBe(2);
    expect(recovery?.recovered).toBe(true);
  });
});
