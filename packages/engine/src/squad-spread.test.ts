/**
 * T806's squad spread (→WORLD-6) behind `SQUAD_SPREAD`: `flat` keeps the released draw byte for
 * byte; `spread` gives each generated player a class and an age term, the bench below the
 * starters, the starters re-centred on the club's strength and a headroom that narrows with age.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../catalogs/src/index';
import type { Club, Player, PersonCareer, World } from '../../contracts/src/types';
import { marketWageAt } from './market-prices';
import { continuousSquad } from './npc-continuity';
import { ovrAt } from './player';
import {
  ageLadder,
  clubStyle,
  formationOf,
  generatedPlayer,
  makePlayer,
  npcSquad,
  overall,
  PRESS_LOAD_FATIGUE,
  SQUAD_SPREAD,
  SQUAD_SPREAD_CONFIG,
  spreadAgeTerm,
  spreadClass,
  spreadHeadroom,
  squadPlaceAge,
  squadPlaces,
  squadSurname,
  TACTICS,
} from './world';

const clubs = (code: string, count: number, strength = 60) =>
  Array.from(
    { length: count },
    (_, k) => ({ id: `${code}:0:0:${k}`, country: code, strength, tier: k % 3 }) as Club,
  );
const spread = <T>(run: () => T) => {
  SQUAD_SPREAD.inForce = 'spread';
  try {
    return run();
  } finally {
    SQUAD_SPREAD.inForce = 'flat';
  }
};
afterEach(() => expect(SQUAD_SPREAD.inForce).toBe('flat'));

/** The released draw (T805): every place at the club's strength through `makePlayer`. */
function released(seed: string, year: number, c: Club): Player[] {
  const code = COUNTRIES.some((p) => p.code === c.country) ? c.country : 'ENG';
  const style = clubStyle(c);
  const ladder = ageLadder(seed, c.id);
  return squadPlaces(style).map((place, i) => {
    const { age, cohort } = squadPlaceAge(seed, c.id, year, i, ladder);
    const p = makePlayer(
      code,
      seed,
      `${c.id}:p:${i}:${cohort}`,
      year,
      c.strength,
      place.position,
      age,
      c.tier,
      place.role,
      squadSurname(seed, c.id, year + 18 - age),
    );
    p.fatigue = style === 'press' ? PRESS_LOAD_FATIGUE : 0;
    return p;
  });
}
/** The fielded eleven's OVR at their slots (`startingSquad` fields places 0–10). */
const eleven = (squad: readonly Player[], c: Club) => {
  const slots = formationOf(clubStyle(c));
  return squad
    .slice(0, slots.length)
    .map((p, i) => ovrAt(p.attrs, slots[i]!.position, slots[i]!.role));
};
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: readonly number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

describe('SQUAD_SPREAD `flat` (the default)', () => {
  it('draws every generated squad and potential as released, and a refill as `makePlayer` does', () => {
    expect(SQUAD_SPREAD.inForce).toBe('flat');
    for (const seed of ['spread-a', 'spread-b'])
      for (const year of [1930, 1966, 2004])
        for (const c of [...clubs('ENG', 4, 70), ...clubs('ITA', 2, 85), ...clubs('euro', 1, 55)])
          expect(npcSquad(seed, year, c)).toEqual(released(seed, year, c));
    // A refill of a place someone left (→WORLD-11) is `makePlayer`'s draw at T807's level and age:
    // at the club's strength, since a retirement and not a sale emptied it, within 4 of the
    // place's age.
    const c = clubs('ESP', 1, 66)[0]!,
      gone = npcSquad('spread-a', 1977, c)[4]!,
      place = squadPlaceAge('spread-a', c.id, 1977, 4),
      w = {
        seed: 'spread-a',
        year: 1977,
        playerClub: 'own',
        clubs: [c],
        people: { [gone.id]: { id: gone.id, playing: 'retired' } as PersonCareer },
      } as unknown as World;
    const refill = continuousSquad(w, c)[4]!;
    expect(refill.id).toBe(`${c.id}:vacancy:4:${place.cohort}`);
    expect(Math.abs(1977 - refill.born - place.age)).toBeLessThanOrEqual(4);
    expect(refill).toEqual({
      ...makePlayer(
        'ESP',
        'spread-a',
        refill.id,
        1977,
        66,
        gone.position,
        1977 - refill.born,
        c.tier,
        squadPlaces(clubStyle(c))[4]!.role,
      ),
      fatigue: gone.fatigue,
    });
    // `generatedPlayer` is `makePlayer` while flat, potential and agent included.
    for (const age of [18, 24, 31])
      expect(generatedPlayer('NED', 's', `x:${age}`, 1990, 72, 'CM', age, 1)).toEqual(
        makePlayer('NED', 's', `x:${age}`, 1990, 72, 'CM', age, 1),
      );
  });
});

describe('SQUAD_SPREAD `spread`', () => {
  it('takes WORLD-6’s age term and headroom tables', () => {
    expect([18, 19, 20, 22, 24, 27, 29, 30, 31, 33, 34, 35].map(spreadAgeTerm)).toEqual([
      -7, -5.5, -4, -1, 0, 0, 0, -0.5, -1, -3, -4, -5,
    ]);
    expect(spreadHeadroom(18)).toEqual([10, 35]);
    expect(spreadHeadroom(20)).toEqual([10, 35]);
    expect(spreadHeadroom(27)).toEqual([0, 4]);
    expect(spreadHeadroom(33)).toEqual([0, 4]);
    expect(spreadHeadroom(24)).toEqual([4, 17]);
  });

  it('gives each person a class within ±6, the same every season of his cohort', () => {
    const classes = Array.from({ length: 500 }, (_, k) =>
      spreadClass('class', `ENG:1:0:3:p:${k}:110`),
    );
    expect(Math.max(...classes.map(Math.abs))).toBeLessThanOrEqual(SQUAD_SPREAD_CONFIG.class);
    expect(Math.abs(mean(classes))).toBeLessThan(0.5);
    expect(spreadClass('class', 'ENG:1:0:3:p:7:110')).toBe(
      spreadClass('class', 'ENG:1:0:3:p:7:110'),
    );
  });

  it('narrows the potential headroom with age, the agent drawn as before', () =>
    spread(() => {
      for (const [age, low, high] of [
        [18, 80, 95],
        [24, 74, 87],
        [30, 70, 74],
      ] as const)
        for (let k = 0; k < 40; k++) {
          const p = generatedPlayer('ENG', 'room', `h:${age}:${k}`, 1990, 70, 'CM', age, 0);
          expect(p.potential).toBeGreaterThanOrEqual(low);
          expect(p.potential).toBeLessThanOrEqual(high);
          SQUAD_SPREAD.inForce = 'flat';
          expect(p.agent).toEqual(
            makePlayer('ENG', 'room', `h:${age}:${k}`, 1990, 70, 'CM', age, 0).agent,
          );
          SQUAD_SPREAD.inForce = 'spread';
        }
    }));

  it('fields an eleven at the club’s strength with stars, regulars and a bench below them', () => {
    for (const strength of [50, 55, 60, 65, 70, 75, 80, 85, 90, 95])
      for (const tactic of TACTICS) {
        // Clubs whose own style is `tactic`, so the eleven `startingSquad` fields is places 0–10.
        const pool = clubs('ENG', 60, strength)
          .filter((c) => clubStyle(c) === tactic)
          .slice(0, 12);
        const flatMean = mean(pool.map((c) => mean(eleven(npcSquad('field', 1985, c), c))));
        const xis: number[][] = [],
          benches: number[] = [],
          young: number[] = [];
        spread(() => {
          for (const c of pool) {
            const squad = npcSquad('field', 1985, c);
            xis.push(eleven(squad, c));
            benches.push(...squad.slice(11).map(overall));
            young.push(...squad.filter((p) => 1985 - p.born <= 20).map(overall));
          }
        });
        const xiMean = mean(xis.flat()),
          at = `${strength} ${tactic}`;
        if (strength <= 85)
          for (const xi of xis) expect(Math.abs(mean(xi) - strength), at).toBeLessThanOrEqual(0.5);
        // The attribute cap (95) holds the eleven short as it holds the flat draw (measured: 90
        // −0.27 against flat −0.12, 95 −1.25 against −1.25); the spread adds at most 0.5 to it.
        else expect(xiMean, at).toBeGreaterThanOrEqual(flatMean - 0.5);
        // At 95 the cap holds every starter, so the eleven cannot spread.
        if (strength <= 90) expect(mean(xis.map(sd)), at).toBeGreaterThanOrEqual(2.5);
        expect(mean(benches), at).toBeLessThan(xiMean);
        if (strength <= 90) expect(mean(young), at).toBeLessThan(xiMean);
      }
  });

  it('draws the same squad again from the same seed, club and year', () =>
    spread(() => {
      const c = clubs('POR', 1, 77)[0]!;
      expect(npcSquad('again', 1999, c)).toEqual(npcSquad('again', 1999, c));
      SQUAD_SPREAD.inForce = 'flat';
      const flat = npcSquad('again', 1999, c);
      SQUAD_SPREAD.inForce = 'spread';
      const spreadSquad = npcSquad('again', 1999, c);
      // Same people, other levels.
      expect(spreadSquad.map((p) => [p.id, p.name, p.born])).toEqual(
        flat.map((p) => [p.id, p.name, p.born]),
      );
      expect(spreadSquad.map(overall)).not.toEqual(flat.map(overall));
    }));

  it('keeps the squad’s market cost near the flat draw’s (T806’s measured bound)', () => {
    const w = { seed: 'cost' } as World;
    for (const year of [1950, 1985, 2015])
      for (const strength of [50, 60, 70, 80, 85, 90, 95]) {
        let flat = 0n,
          spreadCost = 0n;
        for (const c of [...clubs('ENG', 8), ...clubs('ESP', 8)]) {
          flat += npcSquad(w.seed, year, { ...c, strength, tier: 0 }).reduce(
            (sum, p) => sum + BigInt(marketWageAt(c.country, year, 0, p)), 0n,
          );
          spreadCost += spread(() => npcSquad(w.seed, year, { ...c, strength, tier: 0 }).reduce(
            (sum, p) => sum + BigInt(marketWageAt(c.country, year, 0, p)), 0n,
          ));
        }
        const ratio = Number(spreadCost) / Number(flat);
        expect(ratio, `${strength} in ${year}`).toBeGreaterThan(0.85);
        expect(ratio, `${strength} in ${year}`).toBeLessThan(1.08);
      }
  });
});
