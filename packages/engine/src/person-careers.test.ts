import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { createWorld } from './index';
import {
  careerDate,
  activeCoachingEmployment,
  closeEmployment,
  openEmployment,
  retainPerson,
  resolvePerson,
} from './person-careers';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Person Club',
    color: '#224466',
    seed: 'persons',
    level: 'easy',
  });
describe('retained person career registry', () => {
  it('keeps hot post checks correct across closure, different roles and registry replacement', () => {
    const w = world();
    const people = ['index:a', 'index:b', 'index:c'].map((id) =>
      retainPerson(w, { ...w.players[0], id }),
    );
    const [a, b, c] = people;
    const club = w.clubs.find((club) => club.id !== w.playerClub)!.id;
    openEmployment(w, a.id, 'assistant', club);
    expect(() => openEmployment(w, b.id, 'assistant', club)).toThrow('담당자');
    openEmployment(w, b.id, 'defense', club);
    const prior = activeCoachingEmployment(w);
    expect(prior.map(({ person }) => person.id)).toEqual([a.id, b.id]);
    closeEmployment(w, a.id, 'assistant', { year: w.year, day: 1 });
    openEmployment(w, c.id, 'assistant', club, { year: w.year, day: 1 });
    expect(prior.map(({ person }) => person.id)).toEqual([a.id, b.id]);
    expect(activeCoachingEmployment(w).map(({ person }) => person.id)).toEqual([b.id, c.id]);
    expect(() => openEmployment(w, a.id, 'assistant', club)).toThrow('담당자');
    closeEmployment(w, b.id, 'defense', { year: w.year, day: 2 });
    const replacement = structuredClone(w.people!);
    replacement[c.id].employment.at(-1)!.to = { year: w.year, day: 2 };
    delete replacement[c.id].club;
    w.people = replacement;
    openEmployment(w, b.id, 'assistant', club, { year: w.year, day: 2 });
    expect(() => openEmployment(w, a.id, 'assistant', club)).toThrow('담당자');
    expect(activeCoachingEmployment(w).map(({ person }) => person.id)).toEqual([b.id]);
  });
  it('guards non-training posts as well as coaching posts after repeated cache hits', () => {
    const w = world();
    const a = retainPerson(w, { ...w.players[0], id: 'post:a' });
    const b = retainPerson(w, { ...w.players[0], id: 'post:b' });
    openEmployment(w, a.id, 'director', w.playerClub);
    expect(() => openEmployment(w, b.id, 'director', w.playerClub)).toThrow('담당자');
    closeEmployment(w, a.id, 'director', { year: w.year, day: 3 });
    openEmployment(w, b.id, 'director', w.playerClub, { year: w.year, day: 3 });
    expect(() => openEmployment(w, a.id, 'director', w.playerClub)).toThrow('담당자');
  });
  it('retains one identity and true own totals across dual roles and later management', () => {
    const w = world(),
      p = w.players[0];
    p.career[0] = 12;
    const person = retainPerson(w, p, w.playerClub, true);
    expect(retainPerson(w, p, w.playerClub)).toBe(person);
    openEmployment(w, p.id, 'player', w.playerClub);
    openEmployment(w, p.id, 'goalkeeping', w.playerClub);
    expect(person.employment).toHaveLength(2);
    expect(() => openEmployment(w, p.id, 'manager', w.playerClub)).toThrow('중복');
    closeEmployment(w, p.id, 'goalkeeping', { year: w.year, day: 7 });
    closeEmployment(w, p.id, 'goalkeeping', { year: w.year, day: 8 });
    expect(person.employment[1].to).toEqual({ year: w.year, day: 7 });
    closeEmployment(w, p.id, 'player', { year: w.year, day: 7 });
    openEmployment(w, p.id, 'manager', w.playerClub, { year: w.year, day: 7 });
    expect(resolvePerson(w, p.id)).toMatchObject({
      name: p.name,
      born: p.born,
      ownCareer: p.career,
      qualities: p.qualities,
    });
    // Complete the synthetic live role transition before validating a whole-world checkpoint.
    w.calendar = { day: 7 };
    w.round = 1;
    delete w.scorerSeason;
    p.status = 'retired';
    person.playing = 'retired';
    w.manager = { ...w.manager, id: p.id, person: p.id, name: p.name, born: p.born };
    expect(canonical(validateWorld(JSON.parse(canonical(w))))).toBe(canonical(w));
  });
  it('keeps missing NPC stats unknown and supports re-employment without duplicate posts', () => {
    const w = world(),
      p = { ...w.players[0], id: 'unknown:person' },
      other = w.players[1];
    const person = retainPerson(w, p, w.playerClub);
    expect(person.ownCareer).toBeUndefined();
    openEmployment(w, p.id, 'assistant', w.playerClub);
    openEmployment(w, p.id, 'assistant', w.playerClub);
    expect(person.employment).toHaveLength(1);
    retainPerson(w, other, w.playerClub);
    expect(() => openEmployment(w, other.id, 'assistant', w.playerClub)).toThrow('담당자');
    closeEmployment(w, p.id, 'assistant', { year: w.year, day: 10 });
    openEmployment(w, p.id, 'assistant', w.clubs[0].id, { year: w.year, day: 11 });
    expect(person.employment).toHaveLength(2);
    expect(() => closeEmployment(w, p.id, 'assistant', careerDate(w))).toThrow('날짜');
    expect(() => retainPerson(w, { ...p, name: 'Different person' }, w.playerClub)).toThrow('신원');
    expect(() => retainPerson(w, { ...p, born: p.born - 1 }, w.playerClub)).toThrow('신원');
  });
  it('rejects orphan links, reversed intervals, duplicate occupations and manager/coach overlap', () => {
    const w = world(),
      p = w.players[0];
    retainPerson(w, p, w.playerClub, true);
    openEmployment(w, p.id, 'player', w.playerClub);
    for (const corrupt of [
      (x: typeof w) => {
        x.people![p.id].club = 'missing';
      },
      (x: typeof w) => {
        x.people![p.id].employment[0].to = { year: 1949, day: 0 };
      },
      (x: typeof w) => {
        x.people![p.id].employment.push({ ...x.people![p.id].employment[0] });
      },
      (x: typeof w) => {
        x.people![p.id].employment.push(
          { role: 'manager', club: w.playerClub, from: careerDate(w) },
          { role: 'assistant', club: w.playerClub, from: careerDate(w) },
        );
      },
      (x: typeof w) => {
        x.manager.person = 'orphan';
      },
    ]) {
      const bad = structuredClone(w);
      corrupt(bad);
      expect(() => validateWorld(bad)).toThrow();
    }
  });
});
