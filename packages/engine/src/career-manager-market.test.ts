import { describe, expect, it } from 'vitest';
import { operate, managerCandidates, managerMatches, managerPayoff, dailyStaff } from './index';
import { holdRows } from './testing';
import type { CountryCode } from '../../contracts/src/types';
import { closeEmployment, openEmployment, careerDate } from './person-careers';
import { managerHireCost } from './managerMarket';
import { releaseCost } from './staff';
import { careerWorld, type CareerInput } from './career.testkit';
import { operatingCosts } from './finance';
import { SAFETY_ROUNDS } from './delegation-info';
function fixture(
  kind: 'free' | 'internal' | 'club',
  input: CareerInput = {},
  employerCountry: CountryCode = input.country ?? 'ENG',
) {
  const w = careerWorld({ seed: 'career-manager', ...input });
  const p = w.players[0],
    person = w.people![p.id];
  p.status = 'retired';
  closeEmployment(w, p.id, 'player');
  person.playing = 'retired';
  person.coaching = { role: 'assistant', ability: 61, potential: 80, at: careerDate(w) };
  person.management = { ability: 65, potential: 85, school: 'developer', at: careerDate(w) };
  if (kind !== 'free') {
    const club =
      kind === 'internal'
        ? w.playerClub
        : w.clubs.find((c) => c.id !== w.playerClub && c.country === employerCountry)!.id;
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
    holdRows(w, { direction: { manager: 'proven' } });
    expect(managerMatches(w).some((c) => c.id === person.id)).toBe(true);
  });

  it.each([
    ['FRA', 'FRA', 1999, 'FRF', '655957', '150000'],
    ['GER', 'FRA', 1999, 'FRF', '655957', '150000'],
    ['ENG', 'ENG', 1971, 'GBP-LSD', '2400', '1500'],
  ] as const)(
    'quotes and pays fixed-period compensation for %s buying a %s coach',
    (country, employerCountry, year, currency, wage, compensation) => {
      const { w, person } = fixture('club', { country, year }, employerCountry),
        job = person.employment.find((job) => !job.to)!;
      const original = managerCandidates(w),
        originalCandidate = original.find((c) => c.id === person.id)!;
      // These current-year dates deliberately cannot identify the stored older salary period.
      expect(job.from.year).toBe(year);
      Object.assign(job, { wage, currency });
      const before = JSON.stringify(w),
        candidates = managerCandidates(w),
        candidate = candidates.find((c) => c.id === person.id)!;
      expect(JSON.stringify(w)).toBe(before);
      expect(candidates.map((c) => c.id)).toEqual(original.map((c) => c.id));
      expect(candidate).toEqual({ ...originalCandidate, compensation });
      const cost = BigInt(candidate.fee) + BigInt(compensation) + BigInt(managerPayoff(w));
      w.cash = (cost - 1n).toString();
      const short = JSON.stringify(w);
      expect(() => operate(w, { type: 'hire', id: person.id, term: 1 })).toThrow();
      expect(JSON.stringify(w)).toBe(short);
      w.cash = cost.toString();
      operate(w, { type: 'hire', id: person.id, term: 1 });
      expect(w.cash).toBe('0');
      expect(w.manager.person).toBe(person.id);
      expect(job).toMatchObject({ wage, currency });
      expect(job.to).toBeDefined();
    },
  );

  it('uses the normalized compensation in the delegated affordability boundary', () => {
    const { w, person } = fixture('club', { country: 'FRA', year: 1999 }),
      job = person.employment.find((job) => !job.to)!;
    Object.assign(job, { wage: '655957', currency: 'FRF' });
    holdRows(w, { direction: { manager: 'proven' } });
    const candidate = managerCandidates(w).find((c) => c.id === person.id)!;
    expect(candidate.compensation).toBe('150000');
    const annual =
        BigInt(operatingCosts(w).annual) + BigInt(candidate.wage) - BigInt(w.manager.wage),
      reserve = (annual / 46n) * BigInt(SAFETY_ROUNDS),
      threshold = reserve + BigInt(candidate.fee) + 150000n;
    w.cash = threshold.toString();
    expect(managerMatches(w).some((c) => c.id === person.id)).toBe(true);
    w.cash = (threshold - 1n).toString();
    expect(managerMatches(w).some((c) => c.id === person.id)).toBe(false);
  });

  it('does not reconvert a euro wage recorded at the preceding season close', () => {
    const { w, person } = fixture('club', { country: 'FRA', year: 1999 }),
      job = person.employment.find((job) => !job.to)!;
    Object.assign(job, { wage: '100000', currency: 'EUR', from: { year: 1998, day: 323 } });
    const before = JSON.stringify(w);
    expect(managerCandidates(w).find((c) => c.id === person.id)?.compensation).toBe('150000');
    expect(JSON.stringify(w)).toBe(before);
  });

  it('keeps unresolved FX and metadata compatible without changing candidate eligibility', () => {
    const { w, person } = fixture('club', { country: 'ENG', year: 1999 }, 'FRA'),
      job = person.employment.find((job) => !job.to)!;
    for (const currency of ['EUR', 'FRF', 'unknown', undefined]) {
      Object.assign(job, { wage: '101', currency });
      expect(managerCandidates(w).find((c) => c.id === person.id)?.compensation).toBe('151');
    }
    delete job.wage;
    delete job.currency;
    expect(managerCandidates(w).some((c) => c.id === person.id)).toBe(false);
  });
});
