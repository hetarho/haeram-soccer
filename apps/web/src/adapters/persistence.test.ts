import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { createWorld, advanceRound } from '../../../../packages/engine/src/index';
import { encode, decode, Saves, type StoragePort } from './persistence';
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
describe('recoverable persistence', () => {
  it('roundtrips active schedule, exact money and all match/player facts losslessly', async () => {
    const w = world();
    advanceRound(w);
    advanceRound(w);
    w.cash = '98765432101234567890';
    expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
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
