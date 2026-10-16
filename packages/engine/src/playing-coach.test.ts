import { describe, expect, it } from 'vitest';
import { createWorld, operate } from './index';
import {
  answerPlayingCoach,
  automaticPlayingCoachFits,
  considerPlayingCoach,
  playingCoachDurations,
  proposePlayingCoach,
} from './playing-coach';
import { careerDate } from './person-careers';
import { canonical, validateWorld } from '../../contracts/src/index';
import { encode, decode } from '../../../apps/web/src/adapters/persistence';
import { recordRetirementAnnouncement } from './careers';
import { pendingDecisions } from './stopping';
import { pendingWorkPreview } from './pending-work-preview';
import { initializeCoaching } from './coaching-entry';
import { coachWage, coachMatches, staffMember } from './staff';
import { ratio } from './primitives';
function world({ seed = 'playing-coach', fieldPlayer = false, atFounding = false } = {}) {
  const w = createWorld({
    country: 'ENG',
    name: 'Joint Contract',
    color: '#224466',
    seed,
    level: 'easy',
  });
  w.cash = w.income = '999999999999';
  if (!atFounding) {
    w.round = 35;
    w.calendar = { day: 245 };
  }
  const p = fieldPlayer ? w.players.find((p) => p.position !== 'GK')! : w.players[0];
  const person = w.people![p.id];
  p.born = w.year - 36;
  p.retiring = w.year;
  p.personality.professionalism = 5;
  p.qualities = { understanding: 5, teaching: 5, judgement: 5 };
  Object.assign(person, {
    born: p.born,
    professionalism: 5,
    qualities: { ...p.qualities },
    intention: { at: careerDate(w), draw: 0, willing: true },
  });
  recordRetirementAnnouncement(w, person);
  initializeCoaching(w, person);
  return { w, id: p.id };
}
describe('combined playing-coach agreement', () => {
  it('has one owner stop whenever either contracts or staff is direct, and only both delegated may accept', () => {
    for (const contracts of ['direct', 'delegated'] as const)
      for (const staff of ['direct', 'delegated'] as const) {
        const { w, id } = world();
        w.settings!.responsibilities.contracts = contracts;
        w.settings!.responsibilities.staff = staff;
        const proposal = proposePlayingCoach(w, id, 1, 2);
        const delegated = contracts === 'delegated' && staff === 'delegated';
        expect(proposal.status).toBe(delegated ? 'accepted' : 'pending');
        expect(
          pendingDecisions(w).filter((reason) => reason.ref === id && reason.responsibilities),
        ).toHaveLength(delegated ? 0 : 1);
        if (!delegated) {
          expect(w.players.find((p) => p.id === id)!.retiring).toBe(w.year);
          expect(w.staff!.some((p) => p.person === id)).toBe(false);
        }
      }
  });
  it('quotes additive wages and ordinary costs without reducing player salary or adding a special fee', () => {
    const { w, id } = world();
    const p = w.players.find((p) => p.id === id)!,
      person = w.people![id];
    w.settings!.responsibilities.staff = 'direct';
    const proposal = proposePlayingCoach(w, id, 2, 3);
    expect(proposal.playerWage).toBe(p.wage);
    expect(proposal.coachWage).toBe(coachWage(w, person.coaching!.ability));
    expect(BigInt(proposal.totalWage)).toBe(BigInt(p.wage) + BigInt(proposal.coachWage));
    expect(proposal.fee).toBe(ratio(proposal.coachWage, 1n, 4n));
    expect(proposal.replacement).toBe('0');
    expect(proposal.playingEnd).toBe(w.year + 2);
    expect(proposal.coachUntil).toBe(w.year + 3);
    const before = BigInt(w.cash);
    answerPlayingCoach(w, id, true);
    expect(w.staff!.filter((member) => member.role === proposal.role)).toHaveLength(1);
    expect(w.staff!.find((member) => member.person === id)).toMatchObject({
      wage: proposal.coachWage,
      born: person.born,
    });
    expect(BigInt(w.cash)).toBe(before - BigInt(proposal.upfront));
    const after = JSON.stringify(w);
    answerPlayingCoach(w, id, true);
    expect(JSON.stringify(w)).toBe(after);
  });
  it('rejects invalid ages/durations, changed posts and missing funds without partial changes', () => {
    const { w, id } = world();
    const p = w.players.find((p) => p.id === id)!;
    w.settings!.responsibilities.staff = 'direct';
    p.born = w.year - 39;
    w.people![id].born = p.born;
    expect(playingCoachDurations(w, id)).toEqual([1]);
    expect(() => proposePlayingCoach(w, id, 2, 2)).toThrow();
    p.born = w.year - 40;
    w.people![id].born = p.born;
    expect(playingCoachDurations(w, id)).toEqual([]);
    p.born = w.year - 36;
    w.people![id].born = p.born;
    const proposal = proposePlayingCoach(w, id, 1, 2);
    staffMember(w, proposal.role)!.wage = '12345';
    const stale = JSON.stringify(w);
    expect(() => answerPlayingCoach(w, id, true)).toThrow('조건');
    expect(JSON.stringify(w)).toBe(stale);
    proposePlayingCoach(w, id, 1, 2);
    w.cash = '0';
    const poor = JSON.stringify(w);
    expect(() => answerPlayingCoach(w, id, true)).toThrow('자금');
    expect(JSON.stringify(w)).toBe(poor);
  });
  it('deduplicates handover disclosure and retains joint work while another category is direct', () => {
    const { w, id } = world();
    w.settings!.responsibilities.staff = 'direct';
    const proposal = proposePlayingCoach(w, id, 1, 2);
    expect(automaticPlayingCoachFits(w, proposal)).toBe(true);
    const one = structuredClone(w.settings!);
    one.responsibilities.contracts = 'delegated';
    expect(pendingWorkPreview(w, one).find((row) => row.key === 'contracts')?.held).toBe(1);
    operate(w, { type: 'settings', settings: one });
    expect(w.playingCoachProposals![id].status).toBe('pending');
    const both = structuredClone(one);
    both.responsibilities.staff = 'delegated';
    expect(
      pendingWorkPreview(w, both)
        .flatMap((row) => row.refs)
        .filter((ref) => ref === id),
    ).toHaveLength(1);
    operate(w, { type: 'settings', settings: both });
    expect(w.playingCoachProposals![id].status).toBe('accepted');
    const original = world();
    original.w.settings!.responsibilities.staff = 'direct';
    proposePlayingCoach(original.w, original.id, 1, 2);
    const settings = structuredClone(original.w.settings!);
    settings.responsibilities.contracts = settings.responsibilities.staff = 'delegated';
    expect(
      pendingWorkPreview(original.w, settings)
        .flatMap((row) => row.refs)
        .filter((ref) => ref === original.id),
    ).toHaveLength(1);
  });
});

it('offers a playing coach only in ordinary hiring order and never automatically replaces an unexpired paid post', () => {
  const { w, id } = world();
  const person = w.people![id],
    role = person.coaching!.role;
  person.coaching!.ability = 55;
  const ordinary = coachMatches(w, role, staffMember(w, role))[0];
  const quote = proposePlayingCoach(w, id, 1, 2);
  expect(automaticPlayingCoachFits(w, quote)).toBe(true);
  delete w.playingCoachProposals![id];
  expect(considerPlayingCoach(w, role)).toBe(
    !ordinary || BigInt(quote.coachWage) < BigInt(ordinary.wage),
  );
  delete w.playingCoachProposals![id];
  const member = staffMember(w, role)!;
  member.wage = '100';
  member.until = w.year + 2;
  const paid = proposePlayingCoach(w, id, 1, 2);
  expect(automaticPlayingCoachFits(w, paid)).toBe(false);
});

it('preserves the player contract and complete saved career when a playing coach resigns', async () => {
  const { w, id } = world({ seed: 'coach-force', fieldPlayer: true, atFounding: true });
  w.settings!.responsibilities.contracts = w.settings!.responsibilities.staff = 'direct';
  const proposal = proposePlayingCoach(w, id, 1, 2);
  expect(proposal.role).toBe('youth');
  answerPlayingCoach(w, id, true);
  const person = w.people![id],
    member = staffMember(w, 'youth')!;
  member.ability += 0.125;
  const player = structuredClone(w.players.find((p) => p.id === id)!),
    playing = structuredClone(person.employment.find((j) => j.role === 'player' && !j.to)!),
    totals = structuredClone(person.ownCareer);
  const learned = member.ability,
    at = careerDate(w),
    cash = w.cash,
    trust = w.manager.trust;
  for (let i = 0; i < 8 && staffMember(w, 'youth'); i++)
    operate(w, { type: 'coach-training', coach: 'youth', focus: 'balanced', force: true });
  expect(staffMember(w, 'youth')).toBeUndefined();
  expect(person.employment.find((j) => j.role === 'youth')!.to).toEqual(at);
  expect(person.employment.find((j) => j.role === 'player' && !j.to)).toEqual(playing);
  expect(w.players.find((p) => p.id === id)).toEqual(player);
  expect(person.ownCareer).toEqual(totals);
  expect(person.coaching!.ability).toBe(learned);
  expect(w.cash).toBe(cash);
  expect(w.manager.trust).toBe(trust);
  validateWorld(w);
  expect(canonical((await decode(await encode(w))).world)).toBe(canonical(w));
});
