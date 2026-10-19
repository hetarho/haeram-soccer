import { describe, expect, it } from 'vitest';
import { createWorld } from './index';
import { clubValuation, squadValue } from './ratings';
import { playerValue } from './transfers';
import { activePlayers, clubOf } from './world';

function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'Valued Rovers',
    color: '#553344',
    seed: 'ratings',
    level: 'normal',
  });
  w.cash = '5000000';
  return w;
}

describe('club valuation', () => {
  it('squadValue sums playerValue over active players', () => {
    const w = world();
    const sum = () =>
      activePlayers(w)
        .reduce((total, p) => total + BigInt(playerValue(w, p)), 0n)
        .toString();
    expect(squadValue(w)).toBe(sum());
    const sold = activePlayers(w)[0],
      before = BigInt(squadValue(w));
    sold.status = 'sold';
    expect(squadValue(w)).toBe(sum());
    expect(BigInt(squadValue(w))).toBe(before - BigInt(playerValue(w, sold)));
  });
  it('clubValuation total = squad + facilities + brand + cash', () => {
    const w = world(),
      v = clubValuation(w);
    expect(v.squad).toBe(squadValue(w));
    expect(v.cash).toBe(w.cash);
    expect(BigInt(v.total)).toBe(
      BigInt(v.squad) + BigInt(v.facilities) + BigInt(v.brand) + BigInt(v.cash),
    );
  });
  it('debt lowers the valuation by the debt', () => {
    const w = world();
    w.cash = '0';
    const clear = clubValuation(w);
    w.cash = '-3000000';
    const indebted = clubValuation(w);
    expect([indebted.squad, indebted.facilities, indebted.brand]).toEqual([
      clear.squad,
      clear.facilities,
      clear.brand,
    ]);
    expect(BigInt(indebted.total)).toBe(BigInt(clear.total) - 3000000n);
  });
  it('more supporters raise the brand', () => {
    const w = world(),
      club = clubOf(w);
    club.fans = 1000;
    const few = clubValuation(w);
    club.fans = 100000;
    const many = clubValuation(w);
    expect(BigInt(many.brand)).toBeGreaterThan(BigInt(few.brand));
    expect(BigInt(many.total) - BigInt(few.total)).toBe(BigInt(many.brand) - BigInt(few.brand));
  });
});
