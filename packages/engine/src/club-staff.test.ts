import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { OWNER_TRAITS } from './owner-config';
import type { Club, PersonCareer, Staff, StaffRole, World } from '../../contracts/src/types';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import {
  clubStaffMember,
  nameNextHolder,
  poachStaff,
  refreshStaffMarket,
  STAFF_MARKET_CONFIG,
  staffMarketOf,
  takeStaff,
} from './club-staff';
import { SEASON_END_DAY } from './calendar';
import { refreshCoachingMarket } from './coaching-market';
import { initializeCoaching } from './coaching-entry';
import { retirePerson } from './careers';
import { atCareerDate, careerDate, closeEmployment } from './person-careers';
import { historyWorld } from './history';
import { careerWorld } from './career.testkit';
import { spendingStance } from './delegation';
import { operatingCosts } from './finance';
import { ownLeagueClubs } from './season';
import { random } from './primitives';
import { holdRows } from './testing';
import { world } from './staff.testkit';
import {
  coachMatches,
  coachWage,
  operate,
  releaseStaff,
  seasonStaff,
  STAFF_INFO,
  STAFF_ROLES,
  staffCandidates,
} from './index';

const BASE = world('club-staff');
const fresh = () => structuredClone(BASE);
const others = (w: World) =>
  w.clubs.filter((club) => club.id !== w.playerClub && !club.representative);
const countOf = (id: string) => Number(id.split(':').at(-1));
const pool = (w: World, role: StaffRole) => w.staffMarket!.free[role] ?? [];
/** A retired own player, qualified and willing to coach (→STAFF-27). */
function formerPlayer(w: World, index: number, role?: StaffRole): PersonCareer {
  const p = w.players[index]!,
    person = w.people![p.id]!;
  p.personality.professionalism = 4;
  p.position = 'CM';
  p.qualities = { understanding: 4, teaching: 4, judgement: 4 };
  Object.assign(person, {
    professionalism: 4,
    position: 'CM',
    qualities: { ...p.qualities },
    intention: { at: careerDate(w), draw: 0, willing: true },
  });
  p.status = 'retired';
  retirePerson(w, person);
  initializeCoaching(w, person);
  if (role) person.coaching!.role = role as NonNullable<PersonCareer['coaching']>['role'];
  return person;
}

describe('club staff holders (→STAFF-49)', () => {
  it('names every club a holder of each post from the seed and its count, storing nothing', () => {
    const w = fresh(),
      before = JSON.stringify(w),
      comparisonBase = structuredClone(w);
    for (const club of others(w).slice(0, 30))
      for (const role of STAFF_ROLES) {
        const member = clubStaffMember(w, club, role),
          comparison = {
            ...comparisonBase,
            clubs: [...comparisonBase.clubs],
            ...(comparisonBase.people ? { people: { ...comparisonBase.people } } : {}),
          };
        expect(clubStaffMember(comparison, club, role)).toEqual(member);
        expect(member.id).toBe(`club-staff:${club.id}:${role}:${countOf(member.id)}`);
        // Within 8 of the club's strength, inside the market's levels.
        const [low, high] = STAFF_MARKET_CONFIG.levels;
        expect(member.ability).toBeGreaterThanOrEqual(low);
        expect(member.ability).toBeLessThanOrEqual(high);
        if (member.ability > low && member.ability < high)
          expect(Math.abs(member.ability - club.strength)).toBeLessThanOrEqual(
            STAFF_MARKET_CONFIG.spread + 0.5,
          );
        expect(STAFF_INFO[role].traits).toContain(member.trait);
        // Hired at 25–62, retired at 70 (→STAFF-16).
        const age = w.year - member.born!;
        expect(age).toBeGreaterThanOrEqual(25);
        expect(age).toBeLessThan(STAFF_MARKET_CONFIG.retireAge);
        expect(member.since).toBeLessThanOrEqual(w.year);
        expect(member.potential).toBeGreaterThanOrEqual(member.ability);
        expect(member.wage).toBe(coachWage(w, member.ability));
      }
    expect(JSON.stringify(w)).toBe(before);
    expect(JSON.stringify(comparisonBase)).toBe(before);
  });

  it('names the next holder when the count moves, and the next again when he retires', () => {
    const w = fresh(),
      club = others(w)[0]!,
      first = clubStaffMember(w, club, 'attack');
    (w.staffMarket!.clubs[club.id] ??= {}).attack = [countOf(first.id) + 1, w.year];
    const next = clubStaffMember(w, club, 'attack');
    expect(next.id).toBe(`club-staff:${club.id}:attack:${countOf(first.id) + 1}`);
    expect(next.name === first.name && next.born === first.born).toBe(false);
    expect(next.since).toBe(w.year);
    // A count started a century ago has seen its holders retire one after another.
    w.staffMarket!.clubs[club.id]!.attack = [0, w.year - 100];
    const now = clubStaffMember(w, club, 'attack');
    expect(countOf(now.id)).toBeGreaterThan(0);
    expect(w.year - now.born!).toBeLessThan(STAFF_MARKET_CONFIG.retireAge);
  });
});

describe('staff free agents (→STAFF-49)', () => {
  it('open at the takeover, move every refresh from their own streams and refill to 3–6', () => {
    const w = fresh();
    expect(w.staffMarket).toMatchObject({ year: w.year, round: 0 });
    for (const role of STAFF_ROLES)
      expect(pool(w, role).length).toBeGreaterThanOrEqual(STAFF_MARKET_CONFIG.poolMin);
    // Nothing moves before anyone owns a club.
    const ownerless = historyWorld('club-staff-ownerless', DISABLED_RELEASE);
    refreshStaffMarket(ownerless);
    expect(ownerless.staffMarket).toBeUndefined();
    let left = 0,
      seen = 0,
      grown = false;
    for (let round = 4; round <= 44; round += 4) {
      w.round = round;
      const before = structuredClone(w.staffMarket!.free);
      refreshStaffMarket(w);
      expect(w.staffMarket).toMatchObject({ year: w.year, round });
      for (const role of STAFF_ROLES) {
        const after = pool(w, role),
          ids = new Set(after.map((member) => member.id));
        for (const member of before[role] ?? []) {
          const stays =
            random(`${w.seed}:staff-market:${role}:${member.id}:${w.year}:${round}`)() >=
            STAFF_MARKET_CONFIG.signElsewhere;
          expect(ids.has(member.id)).toBe(stays);
          seen++;
          if (!stays) left++;
        }
        expect(after.length).toBeGreaterThanOrEqual(STAFF_MARKET_CONFIG.poolMin);
        expect(after.length).toBeLessThanOrEqual(STAFF_MARKET_CONFIG.poolMax);
        if (after.length > STAFF_MARKET_CONFIG.poolMin) grown = true;
        for (const member of after.filter((m) => !before[role]?.some((b) => b.id === m.id))) {
          expect(member.id).toMatch(new RegExp(`^staff-free:${role}:${w.year}:${round}:\\d+$`));
          expect(STAFF_INFO[role].traits).toContain(member.trait);
          expect(member.ability).toBeLessThanOrEqual(STAFF_MARKET_CONFIG.levels[1]);
          expect(member.wage).toBe(coachWage(w, member.ability));
          expect(w.year - member.born!).toBeGreaterThanOrEqual(25);
          expect(w.year - member.born!).toBeLessThanOrEqual(62);
        }
      }
      // Once per date: the same round moves nothing again.
      const same = canonical(w.staffMarket);
      refreshStaffMarket(w);
      expect(canonical(w.staffMarket)).toBe(same);
    }
    expect(grown).toBe(true);
    expect(left / seen).toBeGreaterThan(0.15);
    expect(left / seen).toBeLessThan(0.35);
    // Stored, validated and read back as it was (the rounds were set without living them).
    w.round = 0;
    expect(validateWorld(JSON.parse(JSON.stringify(w))).staffMarket).toEqual(w.staffMarket);
  });

  it('count former players waiting for the post toward the pool (→STAFF-27)', () => {
    const w = fresh();
    for (let i = 0; i < 5; i++) formerPlayer(w, i, 'assistant');
    w.round = 4;
    refreshStaffMarket(w);
    const waiting = staffCandidates(w, 'assistant').filter((c) => c.person);
    expect(waiting).toHaveLength(5);
    expect(pool(w, 'assistant').length).toBeLessThanOrEqual(STAFF_MARKET_CONFIG.poolMax - 5);
  });

  it('with 마당발 hold one more, every new free agent +5 at the wage he was drawn with', () => {
    const { candidates, ability } = OWNER_TRAITS.networker;
    const plain = fresh(),
      wide = careerWorld({ seed: 'club-staff', traits: ['networker'] }, DISABLED_RELEASE);
    for (const role of STAFF_ROLES)
      expect(pool(wide, role)).toHaveLength(pool(plain, role).length + candidates);
    let shared = 0;
    for (let round = 4; round <= 20; round += 4) {
      plain.round = wide.round = round;
      refreshStaffMarket(plain);
      refreshStaffMarket(wide);
      for (const role of STAFF_ROLES) {
        expect(pool(wide, role).length).toBeGreaterThanOrEqual(
          STAFF_MARKET_CONFIG.poolMin + candidates,
        );
        expect(pool(wide, role).length).toBeLessThanOrEqual(
          STAFF_MARKET_CONFIG.poolMax + candidates,
        );
        for (const member of pool(wide, role)) {
          const same = pool(plain, role).find((other) => other.id === member.id);
          if (!same) continue;
          shared++;
          expect(member.ability).toBe(Math.min(99, same.ability + ability));
          expect(member.wage).toBe(same.wage);
        }
      }
    }
    expect(shared).toBeGreaterThan(0);
    // Other clubs' holders keep their level.
    expect(poachStaff(wide, 'attack')).toEqual(poachStaff(plain, 'attack'));
  });

  it('take in the coaches we replace, release or do not renew; volunteers never', () => {
    const w = fresh();
    const paid = (role: StaffRole, id: string, until = w.year + 2): Staff => ({
      id,
      role,
      name: `Coach ${id}`,
      ability: 60,
      wage: coachWage(w, 60),
      since: w.year - 1,
      until,
      born: w.year - 40,
      potential: 64,
    });
    w.staff = w.staff!.map((m) =>
      m.role === 'attack'
        ? paid('attack', 'ours:attack')
        : m.role === 'fitness'
          ? paid('fitness', 'ours:fitness', w.year)
          : m,
    );
    releaseStaff(w, 'attack');
    expect(pool(w, 'attack').at(-1)).toMatchObject({ id: 'ours:attack', wage: coachWage(w, 60) });
    // An unrenewed contract ends at the boundary with the owner holding staff appointments.
    seasonStaff(w);
    expect(pool(w, 'fitness').some((m) => m.id === 'ours:fitness')).toBe(true);
    // A volunteer leaving is nobody's free agent.
    const volunteer = w.staff!.find((m) => m.role === 'defense')!;
    releaseStaff(w, 'defense');
    expect(pool(w, 'defense').some((m) => m.id === volunteer.id)).toBe(false);
    validateWorld(w);
  });
});

describe('hiring from the staff markets (→STAFF-49, STAFF-15)', () => {
  it('another club holder costs one annual wage of compensation and his club names the next', () => {
    const w = fresh(),
      offers = staffCandidates(w, 'attack');
    expect(offers.slice(0, pool(w, 'attack').length).every((o) => o.source === 'free')).toBe(true);
    const clubOffers = offers.filter((o) => o.source === 'club');
    expect(clubOffers).toHaveLength(STAFF_MARKET_CONFIG.poachList);
    // The ablest holders of our league and the division above, ablest first.
    const abilities = clubOffers.map((o) => o.ability);
    expect(abilities).toEqual([...abilities].sort((a, b) => b - a));
    const index = offers.findIndex((o) => o.source === 'club'),
      offer = offers[index]!,
      club = w.clubs.find((c) => c.id === offer.club)!;
    expect(offer.compensation).toBe(
      (BigInt(offer.wage) * BigInt(STAFF_MARKET_CONFIG.compensationWages)).toString(),
    );
    expect(offer.fee).toBe((BigInt(offer.wage) / 4n).toString());
    const cash = BigInt(w.cash);
    operate(w, { type: 'hire-staff', role: 'attack', candidate: index, term: 2 });
    const hired = w.staff!.find((m) => m.role === 'attack')!;
    expect(hired).toMatchObject({ id: offer.id, ability: offer.ability, until: w.year + 2 });
    expect(Object.keys(hired)).not.toContain('compensation');
    expect(Object.keys(hired)).not.toContain('source');
    const total = BigInt(offer.fee) + BigInt(offer.compensation!);
    expect(BigInt(w.cash)).toBe(cash - total);
    expect(w.events.at(-1)).toMatchObject({ kind: 'staff-hire', amount: total.toString() });
    expect(w.events.at(-1)!.detail).toContain(club.name);
    expect(w.events.at(-1)!.detail).toContain('웃돈');
    // His club names its next holder; he is never offered again while he works for us.
    expect(w.staffMarket!.clubs[club.id]!.attack).toEqual([countOf(offer.id) + 1, w.year]);
    expect(clubStaffMember(w, club, 'attack').id).not.toBe(offer.id);
    expect(staffCandidates(w, 'attack').some((o) => o.id === offer.id)).toBe(false);
    // A free agent leaves his pool; the man he replaces joins it.
    const free = staffCandidates(w, 'attack').find((o) => o.source === 'free')!;
    operate(w, { type: 'hire-staff', role: 'attack', candidate: 0, candidateId: free.id });
    expect(pool(w, 'attack').some((m) => m.id === free.id)).toBe(false);
    expect(pool(w, 'attack').some((m) => m.id === offer.id)).toBe(true);
    expect(validateWorld(JSON.parse(JSON.stringify(w))).staffMarket).toEqual(w.staffMarket);
  });

  it('delegated staff count compensation and take a free agent first at equal standing', () => {
    const w = fresh();
    holdRows(w, { direction: { coaches: 'cheap' } });
    const top = poachStaff(w, 'attack')[0]!;
    const { fee: _fee, source: _source, club: _club, compensation: _compensation, ...holder } = top;
    void [_fee, _source, _club, _compensation];
    w.staffMarket!.free.attack = [{ ...holder, id: 'staff-free:attack:twin' }];
    const order = coachMatches(w, 'attack').map((o) => o.id);
    expect(order.indexOf('staff-free:attack:twin')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('staff-free:attack:twin')).toBeLessThan(order.indexOf(top.id));
    // Cash for his fee but not for the fee and the compensation: only the free agent matches.
    const runway =
      ((BigInt(operatingCosts(w).annual) + BigInt(top.wage)) / 46n) *
      BigInt(spendingStance(w, 'staff').runway);
    w.cash = (runway + BigInt(top.fee) + BigInt(top.compensation!) - 1n).toString();
    const affordable = coachMatches(w, 'attack').map((o) => o.id);
    expect(affordable).toContain('staff-free:attack:twin');
    expect(affordable).not.toContain(top.id);
  });
});

describe('staff careers recorded only on a move (→STAFF-50)', () => {
  it('a hired holder brings his time at his club, a release closes ours and a rehire reopens it', () => {
    const w = fresh(),
      people = Object.keys(w.people!).length,
      offer = staffCandidates(w, 'attack').find((o) => o.source === 'club')!,
      club = w.clubs.find((c) => c.id === offer.club)!,
      holder = clubStaffMember(w, club, 'attack');
    // Nobody who has not moved has a record.
    expect(holder.id).toBe(offer.id);
    expect(w.people![offer.id]).toBeUndefined();
    w.calendar = { day: 2 };
    operate(w, { type: 'hire-staff', role: 'attack', candidate: 0, candidateId: offer.id });
    const hired = careerDate(w),
      person = w.people![offer.id]!;
    expect(person).toMatchObject({
      id: offer.id,
      name: offer.name,
      born: offer.born,
      playing: 'retired',
      club: w.playerClub,
    });
    expect(person.employment).toEqual([
      { role: 'attack', club: club.id, from: { year: holder.since, day: 0 }, to: hired },
      { role: 'attack', club: w.playerClub, from: hired },
    ]);
    // Nobody watched his time at his club: the only manager beside him is ours, from his hire.
    expect(person.mentors).toMatchObject([{ club: w.playerClub, from: hired }]);
    expect(person.mentors[0]!.to).toBeUndefined();
    expect(w.staff!.find((m) => m.role === 'attack')).toMatchObject({
      id: offer.id,
      person: offer.id,
    });
    expect(Object.keys(w.people!)).toHaveLength(people + 1);
    validateWorld(JSON.parse(JSON.stringify(w)));
    // Released, his job with us closes and he waits in the pool as the same man.
    w.calendar = { day: 4 };
    const released = careerDate(w);
    releaseStaff(w, 'attack');
    expect(person.employment[1]).toEqual({
      role: 'attack',
      club: w.playerClub,
      from: hired,
      to: released,
    });
    expect(person.club).toBeUndefined();
    expect(person.mentors[0]!.to).toEqual(released);
    expect(pool(w, 'attack').find((m) => m.id === offer.id)).toMatchObject({ person: offer.id });
    validateWorld(JSON.parse(JSON.stringify(w)));
    // Hired again from the pool, the same record opens a job again.
    w.calendar = { day: 6 };
    operate(w, { type: 'hire-staff', role: 'attack', candidate: 0, candidateId: offer.id });
    expect(person.employment).toHaveLength(3);
    expect(person.employment[2]).toEqual({
      role: 'attack',
      club: w.playerClub,
      from: careerDate(w),
    });
    expect(pool(w, 'attack').some((m) => m.id === offer.id)).toBe(false);
    validateWorld(JSON.parse(JSON.stringify(w)));
  });

  it('a holder his club named at the close can be hired at the same close', () => {
    const w = fresh(),
      offer = staffCandidates(w, 'attack').find((o) => o.source === 'club')!,
      closed = w.year;
    // The close turns the year before it settles staff on the closing season's last day.
    w.year = closed + 1;
    const settled = { year: closed, day: SEASON_END_DAY + 1 };
    atCareerDate(w, settled, () => {
      nameNextHolder(w, offer.club!, 'attack');
      const club = w.clubs.find((c) => c.id === offer.club)!,
        next = clubStaffMember(w, club, 'attack');
      expect(next.id).not.toBe(offer.id);
      expect(next.since).toBe(closed + 1);
      takeStaff(w, { ...next, born: next.born!, source: 'club', club: club.id });
      expect(w.people![next.id]!.employment[0]).toEqual({
        role: 'attack',
        club: offer.club,
        from: settled,
        to: settled,
      });
    });
  });

  it('a free agent signed gets a record from his hire; a volunteer leaving gets none', () => {
    const w = fresh(),
      free = staffCandidates(w, 'scout').find((o) => o.source === 'free')!,
      volunteer = w.staff!.find((m) => m.role === 'scout')!;
    operate(w, { type: 'hire-staff', role: 'scout', candidate: 0, candidateId: free.id });
    expect(w.people![free.id]!.employment).toEqual([
      { role: 'scout', club: w.playerClub, from: careerDate(w) },
    ]);
    expect(w.people![volunteer.id]).toBeUndefined();
    expect(w.staff!.find((m) => m.role === 'scout')).toMatchObject({ person: free.id });
    validateWorld(JSON.parse(JSON.stringify(w)));
  });
});

describe('former players placed at clubs nobody owns (→STAFF-43)', () => {
  it('replace the post holder, skip a post already taken and can be hired away', () => {
    const w = fresh();
    w.people = Object.fromEntries(Object.entries(w.people!).filter(([, p]) => p.formerOwn));
    const league = ownLeagueClubs(w)
      .filter((club) => club.id !== w.playerClub)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, 2);
    w.clubs = w.clubs.filter((club) => club.id === w.playerClub || league.includes(club));
    const [first, second] = league as [Club, Club];
    const replaced = clubStaffMember(w, first, 'assistant');
    const a = formerPlayer(w, 0, 'assistant');
    refreshCoachingMarket(w, () => 0);
    const job = a.employment.find((j) => !j.to)!;
    expect(job.club).toBe(first.id);
    expect(clubStaffMember(w, first, 'assistant')).toMatchObject({
      id: a.id,
      person: a.id,
      ability: a.coaching!.ability,
      wage: job.wage,
    });
    expect(w.staffMarket!.clubs[first.id]!.assistant).toEqual([countOf(replaced.id) + 1, w.year]);
    // The next one of his department goes elsewhere: a post holds one placed former player.
    const b = formerPlayer(w, 1, 'assistant');
    w.calendar = { day: (w.calendar?.day ?? 0) + 1 };
    refreshCoachingMarket(w, () => 0);
    expect(b.employment.find((j) => !j.to)?.club).toBe(second.id);
    // Hired away from his club for one annual wage of compensation.
    const offer = staffCandidates(w, 'assistant').find((o) => o.id === a.id)!;
    expect(offer).toMatchObject({ source: 'club', club: first.id, compensation: job.wage });
    operate(w, { type: 'hire-staff', role: 'assistant', candidate: 0, candidateId: a.id });
    expect(a.employment.filter((j) => !j.to)).toMatchObject([
      { club: w.playerClub, role: 'assistant' },
    ]);
    expect(clubStaffMember(w, first, 'assistant').id).toBe(
      `club-staff:${first.id}:assistant:${countOf(replaced.id) + 2}`,
    );
    expect(w.staff!.find((m) => m.role === 'assistant')).toMatchObject({
      id: a.id,
      person: a.id,
    });
    // When a placed man's job ends, the club's next holder takes the post, not the one replaced.
    closeEmployment(w, b.id, 'assistant');
    expect(clubStaffMember(w, second, 'assistant').id).toMatch(
      new RegExp(`^club-staff:${second.id}:assistant:[1-9]`),
    );
  });

  it('reads the markets of a world before anyone owns a club as empty', () => {
    const w = historyWorld('club-staff-before', DISABLED_RELEASE);
    expect(staffMarketOf(w).free).toEqual({});
  });
});
