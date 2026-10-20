import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { encode, Saves } from './persistence';
import { resetLegacy } from './legacyReset';
import { ACTIVE_SAVE_KEYS, GameIndexStore, type GameEntry, type ParkedStore } from './games';
class Memory {
  data = new Map<string, string>();
  fail = '';
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (key === this.fail) throw Error('interrupted');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    if (key === this.fail) throw Error('interrupted');
    this.data.delete(key);
  }
}
class Parked implements ParkedStore {
  data = new Map<string, string>();
  fail = false;
  async get(id: string) {
    return this.data.get(id);
  }
  async put(id: string, raw: string) {
    this.data.set(id, raw);
  }
  async remove(id: string) {
    if (this.fail) throw Error('interrupted');
    this.data.delete(id);
  }
}
async function saved(engine: string) {
  const w = simulatedWorld({
    country: 'ENG',
    name: 'Legacy',
    color: '#123456',
    seed: 'reset',
    level: 'easy',
  });
  w.engine = engine;
  return encode(w);
}
const entry = (id: string, engine: string): GameEntry => ({
  id,
  worldId: 'unused',
  engine,
  playedAt: '',
  summary: {
    club: 'Legacy',
    country: 'ENG',
    division: 'amateur',
    date: '1950',
    seasons: 0,
    crest: {
      shape: 'shield',
      pattern: 'plain',
      primary: '#123456',
      secondary: '#ffffff',
      emblem: 'ball',
    },
  },
});
describe('bounded writer legacy reset', () => {
  it('clears recognized active/previous and parked games while preserving device data and new/future slots', async () => {
    const storage = new Memory(),
      parked = new Parked(),
      index = new GameIndexStore(storage);
    const legacy = await saved('2.0.0'),
      current = await saved('3.0.0'),
      future = await saved('9.0.0');
    storage.setItem(ACTIVE_SAVE_KEYS[1], legacy);
    storage.setItem(ACTIVE_SAVE_KEYS[2], legacy);
    storage.setItem(ACTIVE_SAVE_KEYS[0], JSON.stringify({ slot: 0 }));
    for (const key of [
      'haeram-soccor:strategies',
      'haeram-soccor:device',
      'preferences',
      'unrelated',
    ])
      storage.setItem(key, 'keep');
    index.write({
      owner: { kind: 'device', id: 'owner' },
      active: 0,
      slots: [entry('old', '2.0.0'), entry('new', '3.0.0'), entry('future', '9.0.0')],
    });
    await parked.put('old', legacy);
    await parked.put('new', current);
    await parked.put('future', future);
    await resetLegacy(storage, parked, () => true);
    expect(ACTIVE_SAVE_KEYS.map((key) => storage.getItem(key))).toEqual([null, null, null]);
    expect(index.read().active).toBeNull();
    expect(index.read().slots.map((s) => s?.id)).toEqual([undefined, 'new', 'future']);
    expect(await parked.get('old')).toBeUndefined();
    expect(await parked.get('new')).toBe(current);
    expect(await parked.get('future')).toBe(future);
    for (const key of [
      'haeram-soccor:strategies',
      'haeram-soccor:device',
      'preferences',
      'unrelated',
    ])
      expect(storage.getItem(key)).toBe('keep');
  });
  it('does not write readonly; writer handoff removes parked legacy and resumes after interruption', async () => {
    const storage = new Memory(),
      parked = new Parked(),
      index = new GameIndexStore(storage),
      raw = await saved('1.22.0');
    index.write({
      owner: { kind: 'device', id: 'owner' },
      active: null,
      slots: [entry('old', '1.22.0'), null, null],
    });
    await parked.put('old', raw);
    const before = JSON.stringify([...storage.data]);
    await resetLegacy(storage, parked, () => false);
    expect(JSON.stringify([...storage.data])).toBe(before);
    parked.fail = true;
    await expect(resetLegacy(storage, parked, () => true)).rejects.toThrow('interrupted');
    expect(index.read().slots[0]).toBeNull();
    expect(await parked.get('old')).toBe(raw);
    parked.fail = false;
    await resetLegacy(storage, parked, () => true);
    expect(await parked.get('old')).toBeUndefined();
  });
  it('retries an index-write interruption without deleting referenced parked data', async () => {
    const storage = new Memory(),
      parked = new Parked(),
      index = new GameIndexStore(storage);
    const raw = await saved('2.0.0');
    index.write({
      owner: { kind: 'device', id: 'owner' },
      active: null,
      slots: [entry('old', '2.0.0'), null, null],
    });
    await parked.put('old', raw);
    storage.fail = 'haeram-soccor:games';
    await expect(resetLegacy(storage, parked, () => true)).rejects.toThrow('interrupted');
    expect(index.read().slots[0]?.id).toBe('old');
    expect(await parked.get('old')).toBe(raw);
    storage.fail = '';
    await resetLegacy(storage, parked, () => true);
    expect(index.read().slots[0]).toBeNull();
    expect(await parked.get('old')).toBeUndefined();
  });
  it('forgets an incompatible in-memory backup only after the authorized disk reset', async () => {
    const storage = new Memory(),
      saves = new Saves(storage),
      old = await saved('2.0.0');
    storage.setItem(ACTIVE_SAVE_KEYS[1], old);
    await expect(saves.load()).rejects.toThrow('규칙 2.0.0');
    expect(saves.incompatibleCheckpoint).toBe(true);
    await resetLegacy(storage, undefined, () => true);
    expect(await saves.load()).toBeNull();
    expect(saves.incompatibleCheckpoint).toBe(false);
    expect(saves.incompatibleBackup).toBeUndefined();
    await saves.commit(await saved('3.0.0'));
    expect((await saves.load())?.world.engine).toBe('3.0.0');
  });
  it('preserves unknown older versions, corrupt legacy and protected selected manifests', async () => {
    for (const raw of [
      await saved('1.99.0'),
      JSON.stringify({ ...JSON.parse(await saved('2.0.0')), checksum: '0'.repeat(64) }),
    ]) {
      const storage = new Memory();
      storage.setItem(ACTIVE_SAVE_KEYS[1], raw);
      storage.setItem(ACTIVE_SAVE_KEYS[0], JSON.stringify({ slot: 0 }));
      await resetLegacy(storage, undefined, () => true);
      expect(storage.getItem(ACTIVE_SAVE_KEYS[1])).toBe(raw);
      expect(storage.getItem(ACTIVE_SAVE_KEYS[0])).not.toBeNull();
    }
    const storage = new Memory(),
      old = await saved('2.0.0'),
      future = await saved('9.0.0');
    storage.setItem(ACTIVE_SAVE_KEYS[1], old);
    storage.setItem(ACTIVE_SAVE_KEYS[2], future);
    storage.setItem(ACTIVE_SAVE_KEYS[0], JSON.stringify({ slot: 1 }));
    await resetLegacy(storage, undefined, () => true);
    expect(storage.getItem(ACTIVE_SAVE_KEYS[1])).toBeNull();
    expect(storage.getItem(ACTIVE_SAVE_KEYS[2])).toBe(future);
    expect(storage.getItem(ACTIVE_SAVE_KEYS[0])).toBe(JSON.stringify({ slot: 1 }));
  });
});

it('does not create device metadata while preserving current, future or unclassified corrupt data', async () => {
  for (const raw of [
    await saved('3.0.0'),
    await saved('9.0.0'),
    JSON.stringify({ ...JSON.parse(await saved('2.0.0')), checksum: '0'.repeat(64) }),
  ]) {
    const storage = new Memory();
    storage.setItem(ACTIVE_SAVE_KEYS[1], raw);
    storage.setItem(ACTIVE_SAVE_KEYS[0], JSON.stringify({ slot: 0 }));
    storage.setItem('haeram-soccor:games', '{unclassified index');
    const before = new Map(storage.data);
    await resetLegacy(storage, undefined, () => true);
    expect(storage.data).toEqual(before);
  }
});
