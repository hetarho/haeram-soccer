import { describe, expect, it } from 'vitest';
import type { PersonCareer } from '../../contracts/src/types';
import { createWorld } from './index';
import { cachedWorld, DISABLED_RELEASE } from '../../../tests/fixtures/worlds';
import {
  atCareerDate,
  careerDate,
  careerDateFromOrdinal,
  careerOrdinal,
  closeEmployment,
  coachingService,
  longestMentor,
  openEmployment,
  syncMentorExposures,
} from './person-careers';
/** The club on the pre-feature path: coaching service, not the match model, is the subject. */
const world = () =>
  createWorld(
    {
      country: 'ENG',
      name: 'Coaching Service',
      color: '#224466',
      seed: 'service',
      level: 'easy',
    },
    DISABLED_RELEASE,
  );
function person() {
  const w = world(),
    p = w.people![w.players[0].id];
  return { w, p };
}
const date = (year: number, day = 0) => ({ year, day });
const fromUtc = (year: number, month: number, day: number) =>
  careerDateFromOrdinal(Math.floor(Date.UTC(year, month - 1, day) / 86400000));
describe('actual coaching service and mentors', () => {
  it('counts full playing-coach service and crosses exactly the third calendar anniversary', () => {
    const { w, p } = person();
    openEmployment(w, p.id, 'assistant', w.playerClub, date(1950));
    closeEmployment(w, p.id, 'player', date(1952));
    expect(coachingService(p, date(1952)).qualified).toBe(false);
    expect(coachingService(p, date(1952, 364)).qualified).toBe(false);
    expect(coachingService(p, date(1953))).toMatchObject({
      days: 1096,
      qualified: true,
      virtual: date(1953),
    });
    expect(coachingService(p, date(1953))).toEqual(coachingService(p, date(1953)));
  });
  it('unions overlaps, excludes unemployment and lets two employed years plus one full-time year qualify', () => {
    const { p } = person();
    p.employment = [
      { role: 'player', club: 'ENG:club', from: date(1950), to: date(1952) },
      { role: 'assistant', club: 'ENG:club', from: date(1950), to: date(1952) },
      { role: 'attack', club: 'ENG:club', from: date(1951), to: date(1952) },
      { role: 'assistant', club: 'ENG:club', from: date(1953), to: date(1954) },
    ];
    expect(coachingService(p, date(1953))).toMatchObject({ days: 731, qualified: false });
    expect(coachingService(p, date(1954))).toMatchObject({ days: 1096, qualified: true });
    const listingOnly = { ...p, employment: p.employment.filter((job) => job.role === 'player') };
    expect(coachingService(listingOnly, date(1954))).toEqual({ days: 0, qualified: false });
  });
  it('counts skipped summer only during an active contract and handles a leap-day anchor reproducibly', () => {
    const { w, p } = person();
    const closing = date(1950, 323);
    atCareerDate(w, closing, () => openEmployment(w, p.id, 'assistant', w.playerClub));
    expect(p.employment.at(-1)?.from).toEqual(closing);
    expect(coachingService(p, date(1951)).days).toBe(42);
    closeEmployment(w, p.id, 'assistant', date(1951));
    expect(coachingService(p, date(1952)).days).toBe(42);
    const leap = structuredClone(p);
    leap.employment = [{ role: 'assistant', club: w.playerClub, from: fromUtc(1952, 2, 29) }];
    expect(coachingService(leap, fromUtc(1955, 2, 28)).qualified).toBe(false);
    expect(coachingService(leap, fromUtc(1955, 3, 1)).qualified).toBe(true);
    expect(careerDate(w)).toEqual(date(1950));
    expect(careerDateFromOrdinal(careerOrdinal(closing))).toEqual(closing);
  });
  it('records actual manager transitions, unknown school and tactic changes without fabricated mentor history', () => {
    const { w, p } = person();
    w.calendar = { day: 10 };
    openEmployment(w, p.id, 'assistant', w.playerClub);
    expect(p.mentors).toHaveLength(1);
    expect(p.mentors[0].from).toEqual(date(1950, 10));
    expect(longestMentor(p, date(1950, 20))).toBeUndefined();
    w.calendar.day = 30;
    w.manager = { ...w.manager, id: 'mentor:A', name: 'Mentor A', style: 'positional' };
    syncMentorExposures(w);
    w.calendar.day = 40;
    w.tactic = 'counter';
    syncMentorExposures(w);
    expect(p.mentors).toHaveLength(2);
    w.calendar.day = 60;
    w.manager = { ...w.manager, id: 'mentor:B', name: 'Mentor B', style: 'developer' };
    syncMentorExposures(w);
    syncMentorExposures(w);
    expect(p.mentors).toHaveLength(3);
    expect(p.mentors[1].to).toEqual(date(1950, 60));
    expect(longestMentor(p, date(1950, 90))).toMatchObject({
      manager: 'mentor:B',
      school: 'developer',
      days: 30,
    });
    closeEmployment(w, p.id, 'assistant', date(1950, 100));
    expect(p.mentors.at(-1)?.to).toEqual(date(1950, 100));
    const before = JSON.stringify(p);
    coachingService(p, date(1951));
    longestMentor(p, date(1951));
    expect(JSON.stringify(p)).toBe(before);
  });
  it('selects an individual mentor by cumulative actual time, with recency only for equal totals', () => {
    const { p } = person();
    p.employment = [{ role: 'assistant', club: 'ENG:club', from: date(1950), to: date(1954) }];
    p.mentors = [
      {
        manager: 'A',
        name: 'A',
        school: 'positional',
        club: 'ENG:club',
        from: date(1950),
        to: date(1951),
      },
      {
        manager: 'B',
        name: 'B',
        school: 'developer',
        club: 'ENG:club',
        from: date(1951),
        to: date(1952),
      },
      {
        manager: 'A',
        name: 'A',
        school: 'positional',
        club: 'ENG:club',
        from: date(1952),
        to: date(1953),
      },
      {
        manager: 'C',
        name: 'C',
        school: 'headcoach',
        club: 'ENG:club',
        from: date(1953),
        to: date(1954),
      },
    ];
    expect(longestMentor(p, date(1954))).toMatchObject({ manager: 'A', days: 730 });
    const tie = {
      ...p,
      mentors: p.mentors.filter(
        (m) => m.manager === 'C' || (m.manager === 'A' && m.from.year === 1950),
      ),
    } as PersonCareer;
    expect(longestMentor(tie, date(1954))).toMatchObject({ manager: 'C', days: 365 });
  });
});

it('ends a foreign coaching contract in skipped summer before recording the next manager mentor', async () => {
  const { advanceRound, closeSeason } = await import('./index');
  const { retirePerson } = await import('./careers');
  const { validateWorld } = await import('../../contracts/src/index');
  // The season's rounds, cached: the person and his contract are found again in the copy.
  const played = cachedWorld('foreign-contract', () => {
    const w = world(),
      player = w.players[0],
      person = w.people![player.id];
    // Marked synthetic retiring candidate and foreign contract; all dates settle through real rounds.
    player.born = 1910;
    player.status = 'retired';
    player.qualities = { understanding: 5, teaching: 5, judgement: 5 };
    player.personality.professionalism = 5;
    Object.assign(person, {
      born: 1910,
      qualities: { ...player.qualities },
      professionalism: 5,
      intention: { at: careerDate(w), draw: 0, willing: true },
    });
    retirePerson(w, person);
    const club = w.clubs.find((c) => c.id !== w.playerClub)!.id;
    const job = openEmployment(w, person.id, person.coaching!.role, club);
    job.contractUntil = { year: 1950, day: 324 };
    job.wage = '101';
    job.currency = w.currency;
    for (let round = 0; round < 46; round++) advanceRound(w, undefined, false);
    const at = person.employment.indexOf(job);
    // The copy can stand for the live objects only while the world still holds them.
    if (w.people![player.id] !== person || at < 0) throw new Error('the contract left the world');
    return { w, id: player.id, club, at };
  });
  const { w, club } = played,
    person = w.people![played.id],
    job = person.employment[played.at];
  // An old incumbent is replaced at the season boundary, after the last played day.
  w.managerMarket!.clubs[club] = [0, 1900];
  closeSeason(w);
  expect(w.year).toBe(1951);
  expect(job.to).toEqual({ year: 1950, day: 324 });
  expect(person.mentors.every((m) => !m.to || careerOrdinal(m.from) <= careerOrdinal(m.to))).toBe(
    true,
  );
  expect(person.mentors.at(-1)?.to).toEqual(job.to);
  expect(() => validateWorld(w)).not.toThrow();
});
