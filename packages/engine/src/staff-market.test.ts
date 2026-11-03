import { expect, it } from 'vitest';
import { careerWorld } from './career.testkit';
import { initializeCoaching } from './coaching-entry';
import { closeEmployment, openEmployment, retainPerson } from './person-careers';
import { coachWage, staffCandidates, staffMarket } from './staff';

it('keeps candidate order, new profiles and live employment/ability changes after indexed reads', () => {
  const w = careerWorld({ seed: 'indexed-staff' });
  expect(staffMarket(w).youth!.filter((candidate) => candidate.person)).toEqual([]);
  const add = (id: string) => {
    const person = retainPerson(w, { ...w.players[0], id, position: 'CM' });
    person.playing = 'retired';
    person.professionalism = 5;
    person.qualities = { understanding: 5, teaching: 5, judgement: 5 };
    person.intention = { at: { year: w.year, day: 0 }, draw: 0, willing: true };
    initializeCoaching(w, person)!.ability = 60;
    return person;
  };
  const b = add('market:b'),
    a = add('market:a'),
    people = () => staffMarket(w).youth!.filter((candidate) => candidate.person);
  expect(people().map((candidate) => candidate.id)).toEqual([a.id, b.id]);
  expect(people().map((candidate) => candidate.wage)).toEqual([coachWage(w, 60), coachWage(w, 60)]);
  openEmployment(w, a.id, 'youth', w.playerClub);
  expect(people().map((candidate) => candidate.id)).toEqual([b.id]);
  closeEmployment(w, a.id, 'youth');
  b.coaching!.ability = 70;
  const changed = people();
  expect(changed.map((candidate) => candidate.id)).toEqual([a.id, b.id]);
  expect(changed.map((candidate) => candidate.wage)).toEqual([coachWage(w, 60), coachWage(w, 70)]);
  b.coaching!.role = 'attack';
  const full = staffMarket(w);
  expect(staffCandidates(w, 'attack')).toEqual(full.attack);
  expect(
    full.youth!.filter((candidate) => candidate.person).map((candidate) => candidate.id),
  ).toEqual([a.id]);
  w.year++;
  a.coaching!.ability = 70;
  const renewed = staffMarket(w),
    quotes = [...renewed.youth!, ...renewed.attack!].filter((candidate) => candidate.person);
  expect(quotes).toHaveLength(2);
  for (const quote of quotes) {
    expect(quote.wage).toBe(coachWage(w, 70));
    expect(quote.fee).toBe((BigInt(quote.wage) / 4n).toString());
    expect(quote.since).toBe(w.year);
    expect(quote.until).toBe(w.year + 3);
  }
});
