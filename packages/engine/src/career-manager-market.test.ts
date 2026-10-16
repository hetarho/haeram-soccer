import { describe, expect, it } from 'vitest';
import {
  createWorld,
  operate,
  managerCandidates,
  managerMatches,
  managerPayoff,
  dailyStaff,
} from './index';
import { closeEmployment, openEmployment, careerDate } from './person-careers';
import { managerHireCost } from './managerMarket';
import { releaseCost } from './staff';
function fixture(kind: 'free' | 'internal' | 'club') {
  const w = createWorld({
    country: 'ENG',
    name: 'Career Management',
    color: '#224466',
    seed: 'career-manager',
    level: 'easy',
  });
  const p = w.players[0],
    person = w.people![p.id];
  p.status = 'retired';
  closeEmployment(w, p.id, 'player');
  person.playing = 'retired';
  person.coaching = { role: 'assistant', ability: 61, potential: 80, at: careerDate(w) };
  person.management = { ability: 65, potential: 85, school: 'developer', at: careerDate(w) };
  if (kind !== 'free') {
    const club =
      kind === 'internal' ? w.playerClub : w.clubs.find((c) => c.id !== w.playerClub)!.id;
    const job = openEmployment(w, p.id, 'assistant', club);
    job.wage = '101';
    job.currency = w.currency;
    if (kind === 'internal')
      w.staff = [
        ...(w.staff ?? []).filter((s) => s.role !== 'assistant'),
        {
          id: p.id,
          person: p.id,
          role: 'assistant',
          name: p.name,
          born: p.born,
          ability: 61,
          potential: 80,
          wage: '101',
          since: w.year,
          until: w.year + 2,
        },
      ];
  }
  w.cash = '1000000000000';
  return { w, person };
}
describe('career manager appointments', () => {
  for (const kind of ['free', 'internal', 'club'] as const)
    it(`adds a ${kind} candidate and appoints the same person once`, () => {
      const { w, person } = fixture(kind);
      const candidate = managerCandidates(w).find((c) => c.id === person.id)!;
      expect(candidate.source).toBe(kind);
      expect(managerCandidates(w).filter((c) => !c.person).length).toBe(12);
      expect(candidate.compensation).toBe(kind === 'club' ? '151' : undefined);
      if (kind === 'internal')
        expect(candidate.coachingRelease).toBe(
          releaseCost(
            w,
            w.staff!.find((s) => s.person === person.id)!,
          ),
        );
      const cash = BigInt(w.cash),
        expected = managerHireCost(candidate) + BigInt(managerPayoff(w)),
        born = person.born;
      operate(w, { type: 'hire', id: person.id, term: 1 });
      expect(BigInt(w.cash)).toBe(cash - expected);
      expect(w.manager).toMatchObject({
        id: person.id,
        person: person.id,
        born,
        ability: 65,
        potential: 85,
      });
      expect(person.employment.filter((j) => !j.to)).toMatchObject([
        { role: 'manager', club: w.playerClub },
      ]);
      expect(person.coaching!.ability).toBe(61);
      expect(w.staff?.some((s) => s.person === person.id)).toBe(false);
      expect(managerCandidates(w).some((c) => c.id === person.id)).toBe(false);
      const snapshot = JSON.stringify(w);
      expect(() => operate(w, { type: 'hire', id: person.id })).toThrow();
      expect(JSON.stringify(w)).toBe(snapshot);
      if (kind === 'internal') {
        dailyStaff(w);
        expect(w.staff?.some((s) => s.role === 'assistant')).toBe(true);
        expect(w.staff?.find((s) => s.role === 'assistant')?.person).not.toBe(person.id);
      }
    });
  it('does not change employment or cash on insufficient funds or stale availability', () => {
    const { w, person } = fixture('club');
    w.cash = '0';
    let snapshot = JSON.stringify(w);
    expect(() => operate(w, { type: 'hire', id: person.id })).toThrow();
    expect(JSON.stringify(w)).toBe(snapshot);
    closeEmployment(w, person.id, 'assistant');
    openEmployment(w, person.id, 'manager', w.clubs.find((c) => c.id !== w.playerClub)!.id);
    snapshot = JSON.stringify(w);
    expect(() => operate(w, { type: 'hire', id: person.id })).toThrow();
    expect(JSON.stringify(w)).toBe(snapshot);
  });
  it('keeps compensated coaches out of nonpoaching delegated searches', () => {
    const { w, person } = fixture('club');
    expect(managerMatches(w).some((c) => c.id === person.id)).toBe(false);
    operate(w, { type: 'direction', key: 'manager', option: 'proven' });
    expect(managerMatches(w).some((c) => c.id === person.id)).toBe(true);
  });
});
