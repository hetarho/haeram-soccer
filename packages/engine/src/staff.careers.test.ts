import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import {
  coachProspect,
  coachSeason,
  hireStaff,
  managerOffers,
  seasonStaff,
  simulateSeason,
} from './index';
import { lastRound, world } from './staff.testkit';

describe('coach and manager careers', () => {
  it('starts young coaches below the level they reach and grows them toward it', () => {
    const young = coachProspect('career:young', 70, [30, 30], 46),
      prime = coachProspect('career:prime', 70, [50, 50], 46);
    expect(young.ability).toBeLessThan(70);
    expect(young.potential).toBeGreaterThan(70);
    expect(prime).toEqual({ age: 50, ability: 70, potential: 70 });
    let { ability, potential } = young;
    for (let season = 0; season < 12; season++)
      ({ ability, potential } = coachSeason(`career:${season}`, ability, potential, 30 + season));
    expect(ability).toBe(potential);
    expect(potential).toBe(young.potential);
    // From 60 a coach fades by up to two a season, his ceiling with him.
    const old = coachSeason('career:old', 80, 80, 63);
    expect(old.ability).toBeGreaterThanOrEqual(78);
    expect(old.ability).toBeLessThanOrEqual(80);
    expect(old.potential).toBe(old.ability);
  });

  it('offers managers with ages and ceilings and grows the hired one each season', () => {
    const fresh = world('manager-careers');
    const offers = managerOffers(fresh);
    for (const offer of offers) {
      const age = fresh.year - offer.born!;
      expect(age).toBeGreaterThanOrEqual(32);
      expect(age).toBeLessThanOrEqual(64);
      expect(offer.potential!).toBeGreaterThanOrEqual(offer.ability);
      if (age >= 46) expect(offer.potential).toBe(offer.ability);
    }
    const w = cachedWorld('manager-careers', () => {
      const w = world('manager-careers');
      w.manager = { ...w.manager, ability: 50, potential: 70, born: w.year - 34, interim: false };
      return lastRound(w);
    });
    simulateSeason(w);
    expect(w.manager.ability).toBeGreaterThan(50);
    expect(w.manager.ability).toBeLessThanOrEqual(70);
    expect(w.events.some((e) => e.kind === 'manager-growth')).toBe(true);
    validateWorld(w);
  });

  it('grows hired coaches and leaves volunteers at 50', () => {
    const w = world('coach-growth');
    hireStaff(w, 'attack', 0);
    w.staff = w.staff!.map((member) =>
      member.role === 'attack'
        ? { ...member, ability: 50, potential: 72, born: w.year - 28, until: w.year + 3 }
        : member,
    );
    w.year += 1;
    seasonStaff(w);
    const coach = w.staff!.find((member) => member.role === 'attack')!;
    expect(coach.ability).toBeGreaterThan(50);
    expect(w.staff!.find((member) => member.role === 'defense')!.ability).toBe(50);
    expect(w.events.some((e) => e.kind === 'staff-growth')).toBe(true);
  });
});
