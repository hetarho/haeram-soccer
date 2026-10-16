import { describe, expect, it } from 'vitest';
import { createWorld } from './index';
import { managerialEntryReady, managerialProfile, qualifyManagers } from './manager-entry';
import { managerCandidates } from './managerMarket';
import { candidateStyles } from './styles';
import { managerTermLimit } from './ops-staff';
const date = (year: number, day = 0) => ({ year, day });
function fixture() {
  const w = createWorld({
    country: 'ENG',
    name: 'Manager Entry',
    color: '#224466',
    seed: 'manager-entry',
    level: 'easy',
  });
  const p = w.people![w.players[0].id];
  p.qualities = { understanding: 4, teaching: 1, judgement: 4 };
  p.employment = [{ role: 'assistant', club: w.playerClub, from: date(1950) }];
  p.mentors = [];
  return { w, p };
}
describe('retained managerial qualification', () => {
  it('requires true managerial aptitude and the exact actual service threshold together', () => {
    const { p } = fixture();
    expect(managerialEntryReady(p, date(1952, 364))).toBe(false);
    expect(managerialEntryReady(p, date(1953))).toBe(true);
    p.qualities.understanding = 2;
    expect(managerialEntryReady(p, date(1953))).toBe(false);
    p.qualities.understanding = 5;
    p.qualities.judgement = 5;
    p.employment = [];
    expect(managerialEntryReady(p, date(1953))).toBe(false);
  });
  it('draws both inclusive ranges without copying coaching values or adjusting for age', () => {
    const { p } = fixture();
    p.coaching = { role: 'assistant', ability: 99, potential: 99, at: date(1950) };
    p.born = 1880;
    expect(managerialProfile(p, date(1953), () => 0, 'developer')).toMatchObject({
      ability: 55,
      potential: 75,
    });
    expect(managerialProfile(p, date(1953), () => 0.999999, 'developer')).toMatchObject({
      ability: 65,
      potential: 85,
    });
    p.qualities.understanding = p.qualities.judgement = 5;
    expect(managerialProfile(p, date(1953), () => 0, 'developer')).toMatchObject({
      ability: 60,
      potential: 85,
    });
    expect(managerialProfile(p, date(1953), () => 0.999999, 'developer')).toMatchObject({
      ability: 70,
      potential: 95,
    });
    expect(p.coaching.ability).toBe(99);
    expect(p.born).toBe(1880);
    expect(managerTermLimit({ born: p.born, style: 'developer' }, 1953)).toBeLessThan(1);
    expect(managerTermLimit({ born: 1900, style: 'firefighter' }, 1953)).toBe(1);
    expect(managerTermLimit({ born: 1885, style: 'developer' }, 1953)).toBe(2);
  });
  it('inherits longest mentor and recent equal service, otherwise ordinary seeded school, once', () => {
    const { w, p } = fixture();
    p.mentors = [
      {
        manager: 'old',
        name: 'Old',
        club: w.playerClub,
        school: 'developer',
        from: date(1950),
        to: date(1951),
      },
      {
        manager: 'recent',
        name: 'Recent',
        club: w.playerClub,
        school: 'counter',
        from: date(1951),
        to: date(1951, 365),
      },
      {
        manager: 'brief',
        name: 'Brief',
        club: w.playerClub,
        school: 'motivator',
        from: date(1952),
        to: date(1952, 1),
      },
    ];
    // Both recorded spells contain 365 actual days.
    expect(managerialProfile(p, date(1953), () => 0, 'headcoach').school).toBe('counter');
    p.mentors[0].to = date(1952);
    expect(managerialProfile(p, date(1953), () => 0, 'headcoach').school).toBe('developer');
    p.mentors = [];
    w.year = 1953;
    qualifyManagers(w);
    expect(p.management!.school).toBe(
      candidateStyles(`${w.seed}:managerial-entry:${p.id}`, 1953)[0],
    );
    const original = structuredClone(p.management),
      born = p.born;
    const snapshot = JSON.stringify(w);
    managerCandidates(w);
    managerCandidates(w);
    expect(JSON.stringify(w)).toBe(snapshot);
    w.year++;
    qualifyManagers(w);
    expect(p.management).toEqual(original);
    expect(p.born).toBe(born);
  });
});
