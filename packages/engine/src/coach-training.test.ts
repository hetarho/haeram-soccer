import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import { careerDate, retainPerson, openEmployment } from './person-careers';
import { initializeCoaching } from './coaching-entry';
import { dailyStaff } from './staff';
import type { Player, Position, World } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import { lineOf } from './player';
import {
  academyPlayers,
  academySummary,
  activePlayers,
  activeTrainingFocus,
  ageGroupOf,
  autoTrainingAdvice,
  createWorld,
  developAcademy,
  focusFor,
  makePlayer,
  operate,
  overall,
  playerTrainingCall,
  promotionAge,
  staffMember,
  trainingCall,
  youthAdvice,
  youthFocus,
} from './index';

const world = (seed = 'coach-orders', country: 'ENG' | 'GER' = 'ENG') =>
  createWorld({ country, name: 'Order Town', color: '#334455', seed, level: 'normal' as const });
let serial = 0;
function prospect(
  w: World,
  position: Position,
  age: number,
  skill: number,
  potential = 80,
): Player {
  const player = makePlayer(
    'ENG',
    w.seed,
    `${w.playerClub}:p:${serial++}`,
    w.year,
    30,
    position,
    age,
  );
  for (const a of ATTRIBUTES) player.attrs[a] = skill;
  player.potential = Math.max(skill, potential);
  player.wage = '0';
  w.academy = { ...w.academy, players: [...academyPlayers(w), player] };
  return player;
}
/** A paid assistant, whose departure closes a retained person's employment. */
function withPaidAssistant(seed: string) {
  const w = world(seed);
  w.cash = '999999999999';
  operate(w, { type: 'hire-staff', role: 'assistant', candidate: 0, term: 2 });
  expect(BigInt(staffMember(w, 'assistant')!.wage)).toBeGreaterThan(0n);
  return w;
}

describe('the coaches set training by their own rules (→CLUB-13, CLUB-31)', () => {
  it("the assistant's squad call is his rule, and a player's is the squad's unless he is tired", () => {
    const w = world();
    const rule = autoTrainingAdvice(w);
    expect(trainingCall(w, 'assistant')).toEqual(rule);
    expect(activeTrainingFocus(w)).toBe(rule.focus);
    const p = activePlayers(w)[0]!;
    p.fatigue = 0;
    const squad = activeTrainingFocus(w);
    expect(playerTrainingCall(w, p)).toMatchObject({ focus: squad, own: false });
    expect(focusFor(w, p)).toBe(squad);
    // At 40 he rests whatever the squad does (→CLUB-13's player rule).
    p.fatigue = 45;
    expect(playerTrainingCall(w, p)).toMatchObject({ focus: 'recovery', own: true });
    expect(playerTrainingCall(w, p).reason).toContain('피로도 45');
    expect(focusFor(w, p)).toBe('recovery');
  });

  it("the youth director's call is his rule", () => {
    const w = world('youth-call');
    expect(trainingCall(w, 'youth')).toEqual(youthAdvice(w));
    expect(youthFocus(w)).toBe(youthAdvice(w).focus);
  });
});

describe('the academy by age group (→CLUB-16, CLUB-31)', () => {
  it('groups prospects U-17, U-19 and U-21 and grows the younger faster', () => {
    const w = world('academy-groups');
    const young = prospect(w, 'CM', 15, 10),
      middle = prospect(w, 'CM', 17, 10),
      old = prospect(w, 'CM', 19, 10);
    expect([young, middle, old].map((player) => ageGroupOf(w, player))).toEqual([
      'u17',
      'u19',
      'u21',
    ]);
    // One prospect in each group, all far from the first team: the director trains them 균형.
    expect(youthFocus(w)).toBe('balanced');
    developAcademy(w);
    const gained = [young, middle, old].map((player) => player.developed || 0);
    expect(gained[0]).toBeGreaterThan(gained[1]);
    expect(gained[1]).toBeGreaterThan(gained[2]);
    const summary = academySummary(w);
    expect(summary.groups.map((group) => [group.label, group.players.length])).toEqual([
      ['U-17', 1],
      ['U-19', 1],
      ['U-21', 1],
    ]);
    expect(summary.groups[0].factor).toBeGreaterThan(summary.groups[2].factor);
  });

  it("the director's rule: first-team work near readiness, fundamentals for a young academy", () => {
    const w = world('youth-rule');
    for (let i = 0; i < 3; i++) prospect(w, 'CB', 15, 30);
    expect(youthAdvice(w).focus).toBe('fundamentals');
    expect(youthFocus(w)).toBe('fundamentals');
    // A U-19 defender within 5 of the weakest first-team defender turns the work to readiness.
    const weakest = Math.min(
      ...w.players
        .filter((player) => lineOf(player.position) === 'DF')
        .map((player) => overall(player)),
    );
    prospect(w, 'CB', 18, Math.round(weakest) - 3);
    expect(youthAdvice(w).focus).toBe('firstTeam');
    expect(youthAdvice(w).reason).toContain('1군');
  });

  it('signs the first professional contract from 16, 17 in England', () => {
    const eng = world('promotion-eng'),
      ger = world('promotion-ger', 'GER');
    expect(promotionAge(eng)).toBe(17);
    expect(promotionAge(ger)).toBe(16);
    const english = prospect(eng, 'ST', 16, 70),
      german = prospect(ger, 'ST', 16, 70);
    expect(() => operate(eng, { type: 'promote-youth', id: english.id })).toThrow('17세');
    operate(ger, { type: 'promote-youth', id: german.id });
    expect(ger.players.some((player) => player.id === german.id)).toBe(true);
  });
});

it('closes retained coach employment and mentor exposure on release before a delegated replacement', () => {
  const w = withPaidAssistant('coach-force'),
    member = staffMember(w, 'assistant')!;
  const source = makePlayer('ENG', w.seed, 'synthetic:retained-resignation', w.year, 55, 'CM', 50);
  source.status = 'retired';
  source.personality.professionalism = 5;
  source.qualities = { understanding: 5, teaching: 4, judgement: 5 };
  const person = retainPerson(w, source),
    at = careerDate(w);
  person.intention = { at, draw: 0, willing: true };
  const coaching = initializeCoaching(w, person)!;
  Object.assign(member, {
    id: person.id,
    person: person.id,
    name: person.name,
    born: person.born,
    ability: coaching.ability + 0.25,
    potential: coaching.potential,
  });
  const job = openEmployment(w, person.id, 'assistant', w.playerClub),
    learned = member.ability,
    potential = member.potential;
  operate(w, { type: 'release-staff', role: 'assistant' });
  expect(staffMember(w, 'assistant')).toBeUndefined();
  expect(job.to).toEqual(at);
  expect(person.mentors.at(-1)!.to).toEqual(at);
  expect(person.coaching).toMatchObject({ ability: learned, potential });
  validateWorld(w);
  w.settings!.responsibilities.staff = 'delegated';
  expect(() => dailyStaff(w)).not.toThrow();
  expect(staffMember(w, 'assistant')).toBeDefined();
  expect(
    Object.values(w.people!).flatMap((p) =>
      p.employment.filter((j) => !j.to && j.club === w.playerClub && j.role === 'assistant'),
    ).length,
  ).toBeLessThanOrEqual(1);
  validateWorld(w);
});
