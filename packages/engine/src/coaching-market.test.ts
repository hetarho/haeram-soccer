import { describe, expect, it } from 'vitest';
import { createWorld, staffCandidates, advanceEconomy } from './index';
import { coachingMarketPass, refreshCoachingMarket, settleNpcCoaching } from './coaching-market';
import { careerDate, closeEmployment, coachingService, openEmployment } from './person-careers';
import { initializeCoaching } from './coaching-entry';
import { coachWage } from './staff';
import { currency } from '../../catalogs/src/index';
import { ratio } from './primitives';
import type { PersonCareer } from '../../contracts/src/types';
function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'NPC Coaching Jobs',
    color: '#224466',
    seed: 'coach-jobs',
    level: 'easy',
  });
  const other = w.clubs.find((c) => c.id !== w.playerClub && c.country === 'ENG')!;
  w.clubs = w.clubs.filter((c) => c.id === w.playerClub || c.id === other.id);
  w.people = Object.fromEntries(Object.entries(w.people!).filter(([, p]) => p.formerOwn));
  return { w, other };
}
function candidate(w: ReturnType<typeof createWorld>, index = 0): PersonCareer {
  const p = w.players[index],
    person = w.people![p.id];
  p.status = 'retired';
  p.personality.professionalism = 4;
  p.qualities = { understanding: 4, teaching: 4, judgement: 4 };
  Object.assign(person, {
    professionalism: 4,
    qualities: { ...p.qualities },
    position: 'CM',
    intention: { at: careerDate(w), draw: 0, willing: true },
  });
  closeEmployment(w, p.id, 'player');
  person.playing = 'retired';
  initializeCoaching(w, person);
  return person;
}
describe('retained NPC coaching market', () => {
  it('keeps sorted per-role vacancy allocation and still draws for candidates after a role fills', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Ordered posts',
      color: '#224466',
      seed: 'ordered-posts',
      level: 'easy',
    });
    const others = w.clubs
      .filter((club) => club.id !== w.playerClub)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, 3);
    w.clubs = w.clubs.filter((club) => club.id === w.playerClub || others.includes(club));
    w.people = Object.fromEntries(Object.entries(w.people!).filter(([, p]) => p.formerOwn));
    const candidates = Array.from({ length: 6 }, (_, i) => candidate(w, i));
    candidates[2].coaching!.role = 'attack';
    candidates[4].coaching!.role = 'attack';
    const blocker = candidates[5];
    openEmployment(w, blocker.id, 'assistant', others[0].id);
    const checks: string[] = [];
    refreshCoachingMarket(w, (person) => {
      checks.push(person.id);
      return 0;
    });
    expect(checks).toEqual(
      candidates
        .slice(0, 5)
        .map((p) => p.id)
        .sort(),
    );
    for (const role of ['assistant', 'attack'] as const) {
      const pool = candidates
        .slice(0, 5)
        .filter((p) => p.coaching!.role === role)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const available = role === 'assistant' ? others.slice(1) : others;
      pool.forEach((person, i) => {
        expect(person.employment.find((job) => !job.to)?.club).toBe(available[i]?.id);
      });
    }
    closeEmployment(w, blocker.id, 'assistant');
    w.calendar = { day: 1 };
    const free = candidates
      .filter((person) => !person.employment.some((job) => !job.to))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    refreshCoachingMarket(w, () => 0);
    expect(free[0].employment.find((job) => !job.to)).toMatchObject({
      club: others[0].id,
      from: { year: w.year, day: 1 },
    });
  });
  it('uses one strict 25-percent draw per person/date, not one per club', () => {
    expect(coachingMarketPass(0.249999)).toBe(true);
    expect(coachingMarketPass(0.25)).toBe(false);
    const { w } = world();
    const person = candidate(w);
    let draws = 0;
    refreshCoachingMarket(w, () => {
      draws++;
      return 0.25;
    });
    expect(draws).toBe(1);
    expect(person.employment.some((job) => !job.to)).toBe(false);
    refreshCoachingMarket(w, () => {
      draws++;
      return 0;
    });
    expect(draws).toBe(1);
    w.calendar = { day: 1 };
    refreshCoachingMarket(w, () => {
      draws++;
      return 0.249999;
    });
    expect(draws).toBe(2);
    const job = person.employment.find((job) => !job.to)!;
    expect(job).toMatchObject({
      role: 'assistant',
      from: { year: w.year, day: 1 },
      contractUntil: { year: w.year + 2, day: 1 },
      wage: coachWage(w, person.coaching!.ability),
      currency: w.currency,
    });
    expect(staffCandidates(w, 'assistant').some((c) => c.id === person.id)).toBe(false);
  });
  it('never fills a post twice and a successful draw without a vacancy hires nobody', () => {
    const { w, other } = world(),
      a = candidate(w, 0),
      b = candidate(w, 1);
    openEmployment(w, b.id, 'assistant', other.id);
    refreshCoachingMarket(w, () => 0);
    expect(a.employment.some((job) => !job.to && job.role === 'assistant')).toBe(false);
    closeEmployment(w, b.id, 'assistant');
    w.calendar = { day: 1 };
    let checks = 0;
    refreshCoachingMarket(w, () => {
      checks++;
      return 0;
    });
    expect(checks).toBe(2);
    expect(
      [a, b].flatMap((p) => p.employment.filter((job) => !job.to && job.role === 'assistant')),
    ).toHaveLength(1);
  });
  it('expires the real two-year contract, preserves learned values and returns the same person to a later job search', () => {
    const { w } = world(),
      person = candidate(w);
    refreshCoachingMarket(w, () => 0);
    const job = person.employment.find((job) => !job.to)!;
    const original = structuredClone(person.coaching);
    w.year++;
    settleNpcCoaching(w, true);
    const learned = structuredClone(person.coaching);
    expect(learned!.ability).toBeGreaterThanOrEqual(original!.ability);
    settleNpcCoaching(w, true);
    expect(person.coaching).toEqual(learned);
    expect(coachingService(person, careerDate(w)).days).toBeGreaterThan(0);
    w.year++;
    w.calendar = { day: 0 };
    settleNpcCoaching(w);
    expect(job.to).toEqual(job.contractUntil);
    expect(person.coaching).toEqual(learned);
    expect(staffCandidates(w, 'assistant').some((c) => c.id === person.id)).toBe(true);
    refreshCoachingMarket(w, () => 0.25);
    expect(person.employment.filter((job) => !job.to)).toHaveLength(0);
    w.calendar.day = 1;
    refreshCoachingMarket(w, () => 0);
    expect(person.employment.filter((job) => job.role === 'assistant')).toHaveLength(2);
    expect(person.coaching).toEqual(learned);
  });
  it('keeps active NPC salary units valid through currency transitions and never quotes a negative elderly-coach wage', () => {
    const { w } = world(),
      person = candidate(w);
    w.year = 1970;
    const before = currency('ENG', 1970),
      after = currency('ENG', 1971);
    w.currency = before.code;
    refreshCoachingMarket(w, () => 0);
    const job = person.employment.find((job) => !job.to)!;
    const oldWage = job.wage!;
    const historical = { ...job, to: { year: 1970, day: 0 } };
    person.employment.push(historical);
    w.year = 1971;
    advanceEconomy(w, 1970);
    expect(job.currency).toBe(after.code);
    expect(job.wage).toBe(
      ratio(
        oldWage,
        after.num * before.den * BigInt(after.units),
        after.den * before.num * BigInt(before.units),
      ),
    );
    expect(historical.currency).toBe(before.code);
    expect(historical.wage).toBe(oldWage);
    expect(BigInt(coachWage(w, 20))).toBeGreaterThanOrEqual(0n);
  });
});
