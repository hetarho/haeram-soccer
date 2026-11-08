import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { Player, World } from '../../contracts/src/types';
import * as legacy from './contracts';
import * as prices from './market-prices';
import { footballQuote } from './quotes';

/**
 * Captured from contracts.ts before extraction; synthetic ratings, no generated world. Only the GER
 * 2020 star reaches the transfer premium (CLUB-46): the others stand at or below the pivot. Amounts
 * outside England stand at each country's 1999-rate level (ECON-35).
 */
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
    wage: '7712968',
    value: '15425937',
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
    valueUnits: 11267.065689690868,
    wage: '248117208',
    value: '1144464755',
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
    wage: '824983884',
    value: '824983884',
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
    wage: '103279',
    value: '206558',
  },
];

describe('transfer premium (CLUB-46)', () => {
  const anchors = prices.MARKET_CONFIG.premium;

  it('is each anchor multiple at its year and flat outside the anchors', () => {
    for (const [year, multiple] of anchors)
      expect(prices.transferPremium(year)).toBeCloseTo(multiple, 12);
    expect(prices.transferPremium(1901)).toBe(anchors[0][1]);
    expect(prices.transferPremium(2100)).toBe(anchors.at(-1)![1]);
  });

  it('grows geometrically between anchors, never outside their range', () => {
    for (let i = 1; i < anchors.length; i++) {
      const [from, low] = anchors[i - 1],
        [to, high] = anchors[i],
        mid = (from + to) / 2;
      expect(prices.transferPremium(mid)).toBeCloseTo(Math.sqrt(low * high), 12);
      for (let year = from; year <= to; year++) {
        const p = prices.transferPremium(year);
        expect(p).toBeGreaterThanOrEqual(Math.min(low, high) - 1e-12);
        expect(p).toBeLessThanOrEqual(Math.max(low, high) + 1e-12);
      }
    }
  });

  // At 30 a player's points are his ability (no youth or age discount) and his value one wage.
  const { pivot, premiumSpan, minYears, years } = prices.MARKET_CONFIG;
  const valueOverWage = (ability: number, year: number) =>
    prices.marketValueUnits(0, ability, 30, ability, year) /
    prices.marketWageUnits(0, ability, 30, ability);

  it('carries a value by as much of the premium as its points reach, never a wage', () => {
    for (const [year, multiple] of anchors) {
      expect(valueOverWage(pivot, year)).toBeCloseTo(minYears, 12);
      expect(valueOverWage(pivot + premiumSpan / 2, year)).toBeCloseTo(
        minYears * multiple ** 0.5,
        12,
      );
      expect(valueOverWage(pivot + premiumSpan, year)).toBeCloseTo(minYears * multiple, 12);
      expect(valueOverWage(pivot + premiumSpan + 15, year)).toBeCloseTo(
        (minYears * multiple) / prices.starWagePremium(pivot + premiumSpan + 15),
        12,
      );
    }
  });

  it('leaves a lower-division player at his wage-curve value in every era', () => {
    for (const year of [1950, 1979, 2025])
      for (const division of [2, 3, 4])
        expect(prices.marketValueUnits(division, 55, 26, 55, year)).toBeCloseTo(
          years * prices.marketWageUnits(division, 55, 26, 55),
          12,
        );
  });

  it('keeps a better player dearer in every year', () => {
    for (let year = 1950; year <= 2030; year += 5)
      for (let ability = 40; ability < 99; ability++)
        expect(prices.marketValueUnits(0, ability + 1, 26, ability + 1, year)).toBeGreaterThan(
          prices.marketValueUnits(0, ability, 26, ability, year),
        );
  });
});

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
      expect(prices.marketValueUnits(division, ability, age, potential, year)).toBe(valueUnits);
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

describe('era star pay spread (CLUB-48)', () => {
  const codes = ['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL'];
  const player = (ability: number, age: number, potential: number, year: number) =>
    ({
      id: 'star',
      position: 'CM',
      attrs: Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute, ability])),
      born: year - age,
      potential,
    }) as Player;
  /** The released curve: every star term in full (s = 1). */
  const released = (
    code: string,
    year: number,
    division: number,
    ability: number,
    age: number,
    potential: number,
  ) => footballQuote(code, year, prices.marketWageUnits(division, ability, age, potential));
  function withSpread<T>(table: typeof prices.STAR_SPREAD_CONFIG, run: () => T) {
    const kept = { ...prices.STAR_SPREAD_CONFIG };
    Object.assign(prices.STAR_SPREAD_CONFIG, table);
    try {
      return run();
    } finally {
      Object.assign(prices.STAR_SPREAD_CONFIG, kept);
    }
  }

  it('never moves a wage at OVR 80 or below, in any country or year', () => {
    for (const code of codes)
      for (let year = 1930; year <= 2030; year += 4)
        for (let ability = 40; ability <= 80; ability += 4)
          for (const [age, potential] of [
            [18, ability + 15],
            [27, ability],
            [34, ability],
          ])
            for (const division of [0, 1, 3])
              expect(
                prices.marketWageAt(code, year, division, player(ability, age, potential, year)),
              ).toBe(released(code, year, division, ability, age, potential));
  });

  it('counts every star term in full from 2008 (CLUB-25, CLUB-26)', () => {
    for (const code of codes)
      for (let year = 2008; year <= 2030; year++) {
        expect(prices.starPaySpread(code, year)).toBe(1);
        for (let ability = 81; ability <= 99; ability += 3)
          expect(prices.marketWageAt(code, year, 0, player(ability, 27, ability, year))).toBe(
            released(code, year, 0, ability, 27, ability),
          );
      }
  });

  it('keeps its shared table within 0–1, never falling with time', () => {
    const anchors = prices.STAR_SPREAD_CONFIG.shared;
    for (let i = 0; i < anchors.length; i++) {
      expect(anchors[i][1]).toBeGreaterThanOrEqual(0);
      expect(anchors[i][1]).toBeLessThanOrEqual(1);
      if (i) expect(anchors[i][0]).toBeGreaterThan(anchors[i - 1][0]);
    }
    for (const code of codes)
      for (let year = 1930; year < 2030; year++)
        expect(prices.starPaySpread(code, year + 1)).toBeGreaterThanOrEqual(
          prices.starPaySpread(code, year),
        );
  });

  it('never makes a better player cheaper, and keeps him dearer wherever stars are paid apart', () => {
    for (const code of codes)
      for (let year = 1930; year <= 2030; year += 2) {
        const spread = prices.starPaySpread(code, year);
        for (const division of [0, 2])
          for (let ability = 40; ability < 99; ability++) {
            const low = prices.marketWageUnits(division, ability, 26, ability, spread),
              high = prices.marketWageUnits(division, ability + 1, 26, ability + 1, spread);
            if (ability < 80 || spread > 0) expect(high).toBeGreaterThan(low);
            else expect(high).toBe(low);
          }
      }
  });

  it('prices a star at W80 × (W / W80)^s, linear in s between its anchors', () => {
    const table = {
      shared: [[1950, 0] as [number, number], [2000, 1] as [number, number]],
      own: {},
    };
    withSpread(table, () => {
      expect(prices.starPaySpread('ESP', 1930)).toBe(0);
      expect(prices.starPaySpread('ESP', 1975)).toBeCloseTo(0.5, 12);
      expect(prices.starPaySpread('ESP', 2020)).toBe(1);
    });
    // W80 is the same player at OVR 80 with his own age and potential (CLUB-48 r53).
    const full = prices.marketWageUnits(0, 92, 25, 95),
      ordinary = prices.marketWageUnits(0, 80, 25, 95);
    expect(prices.ordinaryWageUnits(0, 25, 95)).toBe(ordinary);
    expect(prices.marketWageUnits(0, 92, 25, 95, 0)).toBeCloseTo(ordinary, 9);
    expect(prices.marketWageUnits(0, 92, 25, 95, 0.5)).toBeCloseTo(Math.sqrt(full * ordinary), 9);
    expect(prices.marketWageUnits(0, 92, 25, 95, 1)).toBe(full);
    // A lower-division star's top-flight terms are a star term too.
    expect(prices.marketWageUnits(2, 92, 25, 95, 0)).toBeCloseTo(
      prices.marketWageUnits(2, 80, 25, 95),
      9,
    );
  });

  it('prices W80 at OVR 80 with his own age and potential, so a young star never earns less at 81 than at 80', () => {
    // Released W80 with the potential lowered alike paid 1,055.9 / 1,067.0 units at 81 against 1,077.2 at 80.
    for (const s of [0, 0.1])
      expect(prices.marketWageUnits(0, 81, 18, 99, s)).toBeGreaterThanOrEqual(
        prices.marketWageUnits(0, 80, 18, 99, s),
      );
    for (const [age, potential] of [
      [18, 99],
      [21, 90],
      [27, 92],
    ])
      for (const division of [0, 2]) {
        const w80 = prices.ordinaryWageUnits(division, age, potential);
        expect(w80).toBe(prices.marketWageUnits(division, 80, age, potential));
        // At s = 0 a star earns an ordinary OVR-80 player's wage of his age and promise.
        expect(prices.marketWageUnits(division, 92, age, potential, 0)).toBe(w80);
      }
  });

  it('never lowers a wage as OVR or potential rises, at any spread, age or division', () => {
    const ages = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 27, 30, 33, 36],
      divisions = [0, 1, 2, 4],
      spreads = [0, 0.1, 0.23, 0.57, 0.99],
      wage = prices.marketWageUnits,
      falls: string[] = [];
    const check = (label: string, low: number, high: number) => {
      if (high < low) falls.push(`${label}: ${high} < ${low}`);
    };
    for (const age of ages)
      for (const division of divisions)
        for (const s of spreads) {
          const at = `age ${age} division ${division} s ${s}`;
          for (let ability = 75; ability < 99; ability++) {
            // OVR rises at a fixed potential, one below the OVR included.
            for (const potential of [85, 90, 99, ability - 1])
              check(
                `${at} OVR ${ability}→${ability + 1} potential ${potential}`,
                wage(division, ability, age, potential, s),
                wage(division, ability + 1, age, potential, s),
              );
            // OVR and potential rise together at a fixed promise gap.
            for (const gap of [0, 5, 15])
              check(
                `${at} OVR ${ability}→${ability + 1} gap ${gap}`,
                wage(division, ability, age, Math.min(99, ability + gap), s),
                wage(division, ability + 1, age, Math.min(99, ability + 1 + gap), s),
              );
          }
          // Potential rises at a fixed OVR.
          for (let ability = 75; ability <= 99; ability++)
            for (let potential = 60; potential < 99; potential++)
              check(
                `${at} OVR ${ability} potential ${potential}→${potential + 1}`,
                wage(division, ability, age, potential, s),
                wage(division, ability, age, potential + 1, s),
              );
        }
    expect(falls.slice(0, 5)).toEqual([]);
  });

  it("holds T697's table in production: 0.28 through 1970, 0.61 at 1990, 1 from 2008, England 0 through 1960/61 (CLUB-48 in force)", () => {
    for (const code of codes)
      for (let year = 1930; year <= 2030; year++) {
        const s = prices.starPaySpread(code, year);
        if (code === 'ENG' && year <= 1960) expect(s).toBe(0);
        else if (year <= 1970) expect(s).toBe(0.28);
        else if (year === 1980) expect(s).toBeCloseTo(0.445, 9);
        else if (year === 1990) expect(s).toBeCloseTo(0.61, 9);
        else if (year >= 2008) expect(s).toBe(1);
        else if (year < 1990) expect(s).toBeCloseTo(0.28 + (0.33 * (year - 1970)) / 20, 9);
        else expect(s).toBeCloseTo(0.61 + (0.39 * (year - 1990)) / 18, 9);
      }
    // England's maximum wage: an OVR-95 star earns an ordinary 80's wage of his age and promise.
    for (const [age, potential] of [
      [27, 95],
      [19, 99],
    ])
      for (const division of [0, 2])
        expect(prices.marketWageAt('ENG', 1955, division, player(95, age, potential, 1955))).toBe(
          prices.marketWageAt('ENG', 1955, division, player(80, age, potential, 1955)),
        );
    // Every wage of 2010 is the s = 1 curve, every star term in full.
    for (const code of codes)
      for (let ability = 60; ability <= 99; ability += 3)
        for (const [age, potential] of [
          [18, Math.min(99, ability + 12)],
          [27, ability],
        ])
          for (const division of [0, 2])
            expect(
              prices.marketWageAt(code, 2010, division, player(ability, age, potential, 2010)),
            ).toBe(released(code, 2010, division, ability, age, potential));
    // Wages at OVR 80 or below are the s = 1 curve in every playable country and year.
    for (const code of codes)
      for (let year = 1930; year <= 2030; year++)
        for (const [ability, age, potential] of [
          [80, 18, 99],
          [80, 27, 80],
          [72, 22, 88],
          [55, 31, 55],
        ])
          expect(prices.marketWageAt(code, year, 0, player(ability, age, potential, year))).toBe(
            released(code, year, 0, ability, age, potential),
          );
  });

  // The mechanism on its own, on a table of its own: England's maximum-wage anchor beside another
  // shared table.
  it("pays an English star an 80's wage under an own anchor of 0, through its season only", () => {
    const table = {
      shared: [[1970, 0.5] as [number, number], [2008, 1] as [number, number]],
      own: { ENG: { through: 1960, spread: 0 } },
    };
    withSpread(table, () => {
      for (const year of [1950, 1955, 1960])
        expect(prices.marketWageAt('ENG', year, 0, player(95, 27, 95, year))).toBe(
          prices.marketWageAt('ENG', year, 0, player(80, 27, 95, year)),
        );
      expect(prices.starPaySpread('ESP', 1955)).toBe(0.5);
      expect(prices.starPaySpread('ENG', 1961)).toBe(prices.starPaySpread('ESP', 1961));
      expect(BigInt(prices.marketWageAt('ENG', 1961, 0, player(95, 27, 95, 1961)))).toBeGreaterThan(
        BigInt(prices.marketWageAt('ENG', 1961, 0, player(80, 27, 80, 1961))),
      );
    });
  });

  it("keeps a running contract's wage and prices the next demand, Ballon d'Or premium^s", () => {
    const year = 1975,
      star = { ...player(92, 27, 92, year), wage: released('ESP', year, 0, 92, 27, 92) };
    const world = {
      year,
      playerClub: 'own',
      clubs: [{ id: 'own', country: 'ESP', tier: 0 }],
      history: [{ year: year - 1, ballonDor: [{ id: 'star' }] }],
    } as unknown as World;
    const signed = star.wage;
    const at = (s: number) =>
      withSpread({ shared: [[1950, s]], own: {} }, () => legacy.playerWorth(world, star));
    expect(at(1)).toBe((BigInt(released('ESP', year, 0, 92, 27, 92)) * 2n).toString());
    const ordinary = withSpread({ shared: [[1950, 0]], own: {} }, () =>
      prices.marketWageAt('ESP', year, 0, star),
    );
    expect(ordinary).toBe(released('ESP', year, 0, 80, 27, 92));
    expect(at(0)).toBe(ordinary);
    expect(BigInt(at(0.5))).toBeLessThan(BigInt(at(1)));
    expect(star.wage).toBe(signed);
  });
});

describe('exceptional-player wage demands', () => {
  const wage = (ability: number, division = 0, age = 26) =>
    prices.marketWageUnits(division, ability, age, ability);

  it('preserves ordinary-player calibration and steepens elite wages', () => {
    expect(wage(80) / wage(60)).toBeGreaterThanOrEqual(6);
    expect(wage(80) / wage(60)).toBeLessThanOrEqual(10);
    expect(wage(70, 1) / wage(70)).toBeCloseTo(0.4, 12);
    expect(wage(90) / wage(80)).toBeGreaterThan(3);
    expect(wage(95) / wage(80)).toBeGreaterThan(wage(90) / wage(80));
  });

  it('international stars demand top-flight money in a lower division', () => {
    for (const division of [1, 2, 3]) {
      expect(wage(90, division)).toBe(wage(90));
      expect(wage(99, division)).toBe(wage(99));
      expect(wage(87, division)).toBeGreaterThan(wage(87) * prices.divisionShare(division));
    }
  });

  it('keeps wages monotonic across the star and international-market boundaries', () => {
    for (const age of [18, 26, 33, 38])
      for (const division of [0, 1, 2, 3])
        for (let ability = 40; ability < 99; ability++)
          expect(wage(ability + 1, division, age)).toBeGreaterThan(wage(ability, division, age));
  });
});

describe('ability-fit wage (CLUB-25 r61, T712)', () => {
  const player = (ability: number, age: number, potential: number, year: number) =>
    ({
      id: 'fit',
      position: 'CM',
      attrs: Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute, ability])),
      born: year - age,
      potential,
    }) as Player;
  /** Runs with the switch set, the saved value restored after. */
  function withFit<T>(inForce: boolean, run: () => T) {
    const kept = prices.ABILITY_FIT.inForce;
    prices.ABILITY_FIT.inForce = inForce;
    try {
      return run();
    } finally {
      prices.ABILITY_FIT.inForce = kept;
    }
  }
  function withSpread<T>(spread: number, run: () => T) {
    const kept = { ...prices.STAR_SPREAD_CONFIG };
    Object.assign(prices.STAR_SPREAD_CONFIG, { shared: [[1970, spread]], own: {} });
    try {
      return run();
    } finally {
      Object.assign(prices.STAR_SPREAD_CONFIG, kept);
    }
  }
  const wageAt = (division: number, ability: number, age = 26, potential = ability, year = 1990) =>
    Number(prices.marketWageAt('ENG', year, division, player(ability, age, potential, year)));

  it('is off in production: every wage is priced on the club division given', () => {
    expect(prices.ABILITY_FIT.inForce).toBe(false);
    for (const division of [0, 1, 2, 3, 4])
      for (const ovr of [40, 55, 66, 72, 77, 90])
        expect(prices.wageDivision('ENG', division, ovr)).toBe(division);
  });

  it("pays a player at or below his club division's typical strength on the club's division", () => {
    withFit(true, () => {
      // The second tier settles at 66 (`tierLevel(1)`), the third at 55.
      for (const ovr of [50, 60, 66]) {
        expect(prices.wageDivision('ENG', 1, ovr)).toBe(1);
        expect(wageAt(1, ovr)).toBe(withFit(false, () => wageAt(1, ovr)));
      }
      expect(wageAt(2, 55)).toBe(withFit(false, () => wageAt(2, 55)));
    });
  });

  it('pays a better player on the division his ability suits, never below his club division', () => {
    withFit(true, () => {
      for (const division of [1, 2, 3, 4])
        for (const ovr of [60, 68, 72, 75]) {
          const suits = prices.divisionFor('ENG', ovr);
          if (suits >= division) continue;
          expect(prices.wageDivision('ENG', division, ovr)).toBe(suits);
          const fitted = wageAt(division, ovr);
          expect(fitted).toBe(withFit(false, () => wageAt(suits, ovr)));
          expect(fitted).toBeGreaterThan(withFit(false, () => wageAt(division, ovr)));
        }
    });
  });

  it("pays top-flight terms in every division from OVR 77, the top flight's typical strength", () => {
    withFit(true, () => {
      for (const ovr of [77, 80, 86])
        for (const division of [1, 2, 3, 4]) expect(wageAt(division, ovr)).toBe(wageAt(0, ovr));
    });
  });

  it("pays a second-tier player 40% of a top-flight club's wage at a second-tier club", () => {
    withFit(true, () => {
      const ratio = wageAt(1, 66) / wageAt(0, 66);
      expect(ratio).toBeCloseTo(0.4, 3);
      expect(ratio).toBeGreaterThanOrEqual(0.35);
      expect(ratio).toBeLessThanOrEqual(0.5);
    });
  });

  it('never lowers a wage as OVR or potential rises, in divisions 0–4 at spreads 0, 0.5 and 1', () => {
    const falls: string[] = [];
    const check = (label: string, low: number, high: number) => {
      if (high < low) falls.push(`${label}: ${high} < ${low}`);
    };
    withFit(true, () => {
      for (const spread of [0, 0.5, 1])
        withSpread(spread, () => {
          for (const division of [0, 1, 2, 3, 4])
            for (const age of [17, 21, 25, 30, 34]) {
              const at = `division ${division} s ${spread} age ${age}`;
              for (let ovr = 40; ovr < 98; ovr++)
                for (const potential of [ovr, 85, 99])
                  check(
                    `${at} OVR ${ovr}→${ovr + 1} potential ${potential}`,
                    wageAt(division, ovr, age, Math.max(potential, ovr)),
                    wageAt(division, ovr + 1, age, Math.max(potential, ovr + 1)),
                  );
              for (let ovr = 40; ovr <= 98; ovr += 3)
                for (let potential = ovr; potential < 99; potential++)
                  check(
                    `${at} OVR ${ovr} potential ${potential}→${potential + 1}`,
                    wageAt(division, ovr, age, potential),
                    wageAt(division, ovr, age, potential + 1),
                  );
            }
        });
    });
    expect(falls.slice(0, 5)).toEqual([]);
  });

  it("reads W80 on the division the player's wage is paid on", () => {
    withFit(true, () =>
      withSpread(0.5, () => {
        for (const division of [1, 2, 4])
          for (const ovr of [70, 76, 82, 90]) {
            const p = player(ovr, 27, ovr, 1990);
            const paidOn = prices.wageDivision('ENG', division, ovr);
            expect(prices.marketWageAt('ENG', 1990, division, p)).toBe(
              footballQuote('ENG', 1990, prices.marketWageUnits(paidOn, ovr, 27, ovr, 0.5)),
            );
          }
      }),
    );
  });

  it("keeps transfer values on the selling club's division", () => {
    for (const division of [0, 1, 2, 4])
      for (const ovr of [55, 66, 72, 80]) {
        const p = player(ovr, 24, ovr + 5, 1990);
        expect(withFit(true, () => prices.marketValueAt('ENG', 1990, division, p))).toBe(
          withFit(false, () => prices.marketValueAt('ENG', 1990, division, p)),
        );
      }
  });
});
