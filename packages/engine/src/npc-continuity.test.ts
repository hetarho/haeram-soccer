import { describe, expect, it } from 'vitest';
import { operate, transferOffers } from './index';
import {
  clubStyle,
  npcSquad,
  squad,
  SQUAD_SPREAD,
  squadPlaceAge,
  squadPlaces,
  spreadTerm,
} from './world';
import { continuousSquad, materializePeople, movePerson, returnLoan } from './npc-continuity';
import { coachingGrade } from './aptitude';
import { ovrAt } from './player';
import { validateWorld } from '../../contracts/src/schema';
import type { Club, PersonCareer, Player, World } from '../../contracts/src/types';
import { careerWorld } from './career.testkit';
const world = () => careerWorld({ seed: 'continuity' });
describe('selected NPC continuity', () => {
  it('enrolls prospects without inspection and preserves identity over cohort rollover with seasonal attributes', () => {
    const w = world();
    const person = Object.values(w.people!).find(
      (p) => p.origin && w.clubs.find((c) => c.id === p.club)!.country === 'ENG',
    )!;
    const c = w.clubs.find((c) => c.id === person.club)!;
    expect(person.ownCareer).toBeUndefined();
    expect(
      coachingGrade({
        qualities: person.qualities,
        personality: { professionalism: person.professionalism },
      }),
    ).toBeGreaterThanOrEqual(4);
    const before = structuredClone(person);
    delete w.scorerSeason;
    w.year += 18;
    materializePeople(w);
    const p = squad(w, c).find((p) => p.id === person.id)!;
    expect(p).toMatchObject({ name: before.name, born: before.born, qualities: before.qualities });
    expect(p.attrs).toEqual(npcSquad(w.seed, w.year, c)[person.origin!.slot].attrs);
    expect(w.year - p.born).toBeGreaterThanOrEqual(36);
    expect(validateWorld(w).people?.[person.id].name).toBe(person.name);
  });
  it('moves low-aptitude own players once and excludes former origins and retired identities', () => {
    const w = world(),
      p = w.players.find((p) => (coachingGrade(p) ?? 0) < 4)!;
    const c = w.clubs.find((c) => c.id !== w.playerClub && c.country === 'ENG')!;
    squad(w, c);
    p.status = 'sold';
    movePerson(w, p, c.id, true);
    movePerson(w, p, c.id, true);
    const person = w.people![p.id];
    expect(person.formerOwn).toBe(true);
    expect(person.employment.filter((job) => !job.to)).toHaveLength(1);
    expect(person.employment).toHaveLength(2);
    expect(squad(w, c).filter((x) => x.id === p.id)).toHaveLength(1);
    expect(
      squad(
        w,
        w.clubs.find((c) => c.id === w.playerClub)!,
      ),
    ).not.toContainEqual(expect.objectContaining({ id: p.id }));
    movePerson(w, p);
    person.playing = 'retired';
    expect(squad(w, c).some((x) => x.id === p.id)).toBe(false);
  });
  it('loans and returns the same retained NPC person and never generates him at both clubs', () => {
    const w = world();
    const person = Object.values(w.people!).find((p) => p.origin)!;
    const parent = w.clubs.find((c) => c.id === person.club)!;
    const p = structuredClone(squad(w, parent).find((p) => p.id === person.id)!);
    movePerson(w, p, w.playerClub, true, w.year + 1);
    p.loanUntil = w.year + 1;
    w.players.push(p);
    expect(squad(w, parent).some((x) => x.id === p.id)).toBe(false);
    expect(w.people![p.id].loan?.club).toBe(parent.id);
    returnLoan(w, p);
    expect(squad(w, parent).filter((x) => x.id === p.id)).toHaveLength(1);
    expect(p.status).toBe('sold');
    expect(w.people![p.id].playing).toBe('active');
  });
  it('records external recruitment without inventing an old club or historical appearances', () => {
    const w = world();
    w.cash = '9999999999';
    // A free agent of the pool: no club to record as his seller.
    operate(w, { type: 'recruit', candidate: transferOffers(w).findIndex((o) => o.freeAgent) });
    const player = w.players.at(-1)!;
    expect(w.people![player.id]).toMatchObject({
      club: w.playerClub,
      formerOwn: true,
      name: player.name,
      born: player.born,
    });
    expect(w.people![player.id].employment).toHaveLength(1);
  });
});

/** T807's refill of a sold place (→WORLD-6, WORLD-11), on small worlds holding only what it reads. */
describe('the refill of a sold place', () => {
  const clubOf = (k: number, strength = 70) =>
    ({ id: `ENG:1:0:${k}`, country: 'ENG', strength, tier: 1 }) as Club;
  const worldOf = (seed: string, year: number, c: Club, people: PersonCareer[]) =>
    ({
      seed,
      year,
      playerClub: 'own',
      clubs: [c],
      people: Object.fromEntries(people.map((person) => [person.id, person])),
    }) as unknown as World;
  /** `p`'s record once `club` sold him to the owner's club on `day` of `year`. */
  const sold = (p: Player, club: string, year: number, day = 40): PersonCareer => ({
    id: p.id,
    name: p.name,
    born: p.born,
    position: p.position,
    professionalism: p.personality.professionalism,
    qualities: p.qualities!,
    playing: 'active',
    club: 'own',
    employment: [
      { role: 'player', club, from: { year, day }, to: { year, day } },
      { role: 'player', club: 'own', from: { year, day } },
    ],
    mentors: [],
  });
  /** How far below the club's strength a place's player plays at its slot. */
  const below = (c: Club, slot: number, p: Player) => {
    const place = squadPlaces(clubStyle(c))[slot]!;
    return c.strength - ovrAt(p.attrs, place.position, place.role);
  };
  const cases = (['r-a', 'r-b', 'r-c'] as const).flatMap((seed) =>
    Array.from({ length: 8 }, (_, k) => ({
      seed,
      c: clubOf(k, 52 + k * 5),
      year: 1961 + k * 4,
      slot: (k * 5) % 18,
    })),
  );

  it('plays 2–6 below the club’s strength at an age within 4 of the departed’s', () => {
    const gaps: number[] = [],
      offsets = new Set<number>();
    for (const { seed, c, year, slot } of cases) {
      const gone = npcSquad(seed, year, c)[slot]!,
        refill = continuousSquad(worldOf(seed, year, c, [sold(gone, c.id, year)]), c)[slot]!,
        place = squadPlaceAge(seed, c.id, year, slot);
      expect(refill.id).toBe(`${c.id}:vacancy:${slot}:${place.cohort}`);
      expect(refill.position).toBe(gone.position);
      expect(refill.fatigue).toBe(gone.fatigue);
      const offset = gone.born - refill.born;
      expect(Math.abs(offset)).toBeLessThanOrEqual(4);
      expect(year - refill.born).toBeGreaterThanOrEqual(17);
      expect(year - refill.born).toBeLessThanOrEqual(35);
      offsets.add(offset);
      // A generated player's OVR lands within about a point of his level (attributes are whole).
      const gap = below(c, slot, refill);
      expect(gap, `${seed} ${c.id} ${slot}`).toBeGreaterThanOrEqual(1);
      expect(gap, `${seed} ${c.id} ${slot}`).toBeLessThanOrEqual(7);
      gaps.push(gap);
    }
    expect(offsets.size).toBeGreaterThan(3);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(5);
  });

  it('stays one person through the cohort, ageing a year a season, at strength from the next summer', () => {
    let checked = 0;
    for (const { seed, c, year, slot } of cases) {
      // A place that stays in its cohort next season with the refill's age inside 17–35 both years.
      const age = squadPlaceAge(seed, c.id, year, slot).age;
      if (age < 21 || age > 30) continue;
      const gone = npcSquad(seed, year, c)[slot]!,
        record = sold(gone, c.id, year),
        now = continuousSquad(worldOf(seed, year, c, [record]), c)[slot]!,
        next = continuousSquad(worldOf(seed, year + 1, c, [record]), c)[slot]!;
      expect([next.id, next.name, next.born]).toEqual([now.id, now.name, now.born]);
      expect(year + 1 - next.born).toBe(year - now.born + 1);
      expect(Math.abs(below(c, slot, next))).toBeLessThanOrEqual(1.2);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('gives a signed refill’s place the next serial, a new person, never a duplicate', () => {
    for (const { seed, c, year, slot } of cases.slice(0, 8)) {
      const gone = npcSquad(seed, year, c)[slot]!,
        first = continuousSquad(worldOf(seed, year, c, [sold(gone, c.id, year)]), c)[slot]!,
        people = [sold(gone, c.id, year), sold(first, c.id, year, 120)],
        squadAfter = continuousSquad(worldOf(seed, year, c, people), c),
        second = squadAfter[slot]!;
      expect(second.id).toBe(`${first.id}:1`);
      expect(second.name === first.name && second.born === first.born).toBe(false);
      expect(below(c, slot, second)).toBeGreaterThanOrEqual(1);
      expect(new Set(squadAfter.map((p) => p.id)).size).toBe(squadAfter.length);
      expect(squadAfter.some((p) => people.some((person) => person.id === p.id))).toBe(false);
    }
  });

  it('refills at strength a place a retirement or a let-go emptied, not a sale', () => {
    for (const { seed, c, year, slot } of cases.slice(0, 8)) {
      const gone = npcSquad(seed, year, c)[slot]!,
        retired = continuousSquad(
          worldOf(seed, year, c, [{ ...sold(gone, c.id, year), playing: 'retired' }]),
          c,
        )[slot]!,
        free = continuousSquad(
          { ...worldOf(seed, year, c, []), freeAgents: [{ ...gone, freeSince: year }] } as World,
          c,
        )[slot]!;
      for (const refill of [retired, free]) {
        expect(refill.id).toBe(
          `${c.id}:vacancy:${slot}:${squadPlaceAge(seed, c.id, year, slot).cohort}`,
        );
        expect(Math.abs(below(c, slot, refill))).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it('takes his class and age term on top with `SQUAD_SPREAD` at `spread`', () => {
    for (const { seed, c, year, slot } of cases.slice(0, 12)) {
      const gone = npcSquad(seed, year, c)[slot]!,
        w = worldOf(seed, year, c, [sold(gone, c.id, year)]),
        flat = continuousSquad(w, c)[slot]!;
      SQUAD_SPREAD.inForce = 'spread';
      try {
        const spread = continuousSquad(w, c)[slot]!,
          term = spreadTerm(seed, spread.id, year - spread.born);
        expect([spread.id, spread.name, spread.born]).toEqual([flat.id, flat.name, flat.born]);
        expect(
          below(c, slot, flat) - below(c, slot, spread) - term,
          `${seed} ${c.id} ${slot}`,
        ).toBeLessThanOrEqual(2);
        expect(below(c, slot, flat) - below(c, slot, spread) - term).toBeGreaterThanOrEqual(-2);
      } finally {
        SQUAD_SPREAD.inForce = 'flat';
      }
    }
  });
});
