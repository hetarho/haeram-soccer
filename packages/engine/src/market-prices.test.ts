import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { Player, World } from '../../contracts/src/types';
import * as legacy from './contracts';
import * as prices from './market-prices';

/** Captured from contracts.ts before extraction; synthetic ratings, no generated world. */
const vectors = [
  {
    code: 'ENG',
    year: 1950,
    division: 0,
    ability: 40,
    age: 18,
    potential: 65,
    share: 1,
    wageUnits: 22.37887356598485,
    valueUnits: 73.73600576335177,
    wage: '19265',
    value: '63477',
  },
  {
    code: 'ENG',
    year: 1950,
    division: 4,
    ability: 40,
    age: 18,
    potential: 65,
    share: 0.03,
    wageUnits: 0.6713662069795455,
    valueUnits: 2.212080172900553,
    wage: '578',
    value: '1904',
  },
  {
    code: 'ESP',
    year: 2005,
    division: 1.5,
    ability: 70,
    age: 24,
    potential: 80,
    share: 0.275,
    wageUnits: 135.9569881607702,
    valueUnits: 271.9139763215404,
    wage: '1526716',
    value: '3053432',
  },
  {
    code: 'GER',
    year: 2020,
    division: 0,
    ability: 80,
    age: 30,
    potential: 85,
    share: 1,
    wageUnits: 2442.672761947402,
    valueUnits: 2442.672761947402,
    wage: '44625397',
    value: '44625397',
  },
  {
    code: 'ITA',
    year: 1990,
    division: 2,
    ability: 65,
    age: 38,
    potential: 70,
    share: 0.15,
    wageUnits: 36.86584172568527,
    valueUnits: 36.86584172568527,
    wage: '10374546',
    value: '10374546',
  },
  {
    code: 'ENG',
    year: 1901,
    division: -1,
    ability: 60,
    age: 16,
    potential: 90,
    share: 1,
    wageUnits: 149.1837449636251,
    valueUnits: 543.1567347584297,
    wage: '35804',
    value: '130358',
  },
  {
    code: 'FRA',
    year: 1970,
    division: 8,
    ability: 60,
    age: 28,
    potential: 60,
    share: 0.03,
    wageUnits: 8.147351021376446,
    valueUnits: 16.294702042752892,
    wage: '1607',
    value: '3213',
  },
];

describe('market pricing read leaf', () => {
  it('retains the existing contract exports as the same functions and shared configuration', () => {
    for (const key of Object.keys(prices) as (keyof typeof prices)[])
      expect(legacy[key], key).toBe(prices[key]);
  });

  it.each(vectors)(
    'preserves $code $year pricing at division $division and age $age',
    ({
      code,
      year,
      division,
      ability,
      age,
      potential,
      share,
      wageUnits,
      valueUnits,
      wage,
      value,
    }) => {
      const player = {
        position: 'CM',
        attrs: Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute, ability])),
        born: year - age,
        potential,
      } as Player;
      const world = {
        year,
        playerClub: 'own',
        clubs: [{ id: 'own', country: code, tier: division }],
      } as World;
      const before = structuredClone({ world, player });
      expect(prices.divisionShare(division)).toBe(share);
      expect(prices.marketWageUnits(division, ability, age, potential)).toBe(wageUnits);
      expect(prices.marketValueUnits(division, ability, age, potential)).toBe(valueUnits);
      expect(prices.marketWageAt(code, year, division, player)).toBe(wage);
      expect(prices.marketValueAt(code, year, division, player)).toBe(value);
      expect(prices.marketWage(world, player)).toBe(wage);
      expect(prices.marketValue(world, player)).toBe(value);
      // An explicit division overrides the club tier, as before the extraction.
      world.clubs[0].tier = 3;
      expect(prices.marketWage(world, player, division)).toBe(wage);
      expect(prices.marketValue(world, player, division)).toBe(value);
      world.clubs[0].tier = division;
      expect({ world, player }).toEqual(before);
    },
  );
});
