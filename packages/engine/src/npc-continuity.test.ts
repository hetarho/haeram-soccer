import { describe, expect, it } from 'vitest';
import { createWorld, operate } from './index';
import { npcSquad, squad } from './world';
import { materializePeople, movePerson, returnLoan } from './npc-continuity';
import { coachingGrade } from './aptitude';
import { validateWorld } from '../../contracts/src/schema';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Continuity',
    color: '#224466',
    seed: 'continuity',
    level: 'easy',
  });
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
    operate(w, { type: 'recruit', candidate: 0 });
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
