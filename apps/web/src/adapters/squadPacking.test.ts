import { describe, expect, it } from 'vitest';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import { foundSquads } from '../../../../packages/engine/src/persisted-squads';
import { packSquads, unpackSquads } from './squadPacking';
import { pack, unpack } from './packing';

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function founded() {
  const w = worldMarketFixture();
  w.clubs[2]!.representative = true;
  foundSquads(w);
  return w;
}
describe('persisted squad columns on a small isolated fixture', () => {
  it('preserves every founded player through the actual world packer', () => {
    const w = founded();
    const packed = plain(pack(w));
    expect(packed.world).not.toHaveProperty('squads');
    expect(packed.squads!.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['id', 'name', 'position', 'positions', 'wage', 'until']),
    );
    expect(unpack(packed).squads).toEqual(w.squads);
  });
  it('retains hundredths, higher precision, optional contracts and registry order exactly', () => {
    const w = founded(),
      players = w.squads!.foreign!;
    players[0]!.attrs.passing = 63.27;
    players[1]!.attrs.reflexes = 40.123456789;
    players[1]!.talk = { kind: 'renew', demand: '9007199254740993', floor: '42', year: 1950, day: 3 };
    players[1]!.loanUntil = 1952;
    const squads = { empty: [], foreign: players, other: [w.players[0]!] };
    expect(unpackSquads(plain(packSquads(squads)))).toEqual(squads);
    expect(Object.keys(unpackSquads(plain(packSquads(squads))))).toEqual(Object.keys(squads));
    expect(unpackSquads(plain(packSquads({})))).toEqual({});
  });
  it('keeps supported inline squads and rejects ambiguous or malformed metadata', () => {
    const w = founded(),
      p = plain(pack(w));
    delete p.squads;
    p.world.squads = w.squads;
    expect(unpack(p).squads).toEqual(w.squads);
    p.squads = packSquads(w.squads!);
    expect(() => unpack(p)).toThrow();
    const valid = plain(packSquads(w.squads!));
    for (const mutate of [
      (p: typeof valid) => {
        p.version = 2 as 1;
      },
      (p: typeof valid) => {
        p.counts[0] = 20001;
      },
      (p: typeof valid) => {
        p.columns.push(p.columns[0]!);
      },
      (p: typeof valid) => {
        p.columns[0]!.at = [0, 0];
      },
      (p: typeof valid) => {
        p.exactAttrs = [[-1, 55]];
      },
      (p: typeof valid) => {
        p.attrs.count++;
      },
    ]) {
      const malformed = plain(valid);
      mutate(malformed);
      expect(() => unpackSquads(malformed)).toThrow();
    }
  });
});
