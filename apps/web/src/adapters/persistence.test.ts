import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { createWorld, advanceRound } from '../../../../packages/engine/src/index';
import { encode, decode, Saves, type StoragePort } from './persistence';
import { pack, unpack } from './packing';
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
