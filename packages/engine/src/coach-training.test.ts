import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import type { Player, Position, World } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import { lineOf } from './player';
import {
  academyPlayers,
  academySummary,
  activePlayers,
  activeTrainingFocus,
  ageGroupOf,
  advanceRound,
  autoTrainingAdvice,
  createWorld,
  developAcademy,
  focusFor,
  forceRisk,
  makePlayer,
  operate,
  overall,
  playerSuggestionWait,
  playerTrainingCall,
  promotionAge,
  staffMember,
  strainOf,
  suggestionChance,
  suggestionWait,
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
/** A paid assistant: only paid coaches carry strain and can resign. */
function withPaidAssistant(seed: string) {
  const w = world(seed);
  w.cash = '999999999999';
  operate(w, { type: 'hire-staff', role: 'assistant', candidate: 0, term: 2 });
  expect(BigInt(staffMember(w, 'assistant')!.wage)).toBeGreaterThan(0n);
  return w;
}

describe('the coaches set training; the owner suggests or forces (→CLUB-13, CLUB-31, STAFF-19)', () => {
  it('follows the rule until a suggestion is accepted, which holds four settled rounds', () => {
    const w = world();
    const rule = autoTrainingAdvice(w);
    expect(trainingCall(w, 'assistant')).toMatchObject({ focus: rule.focus, by: 'rule' });
    // A volunteer (ability 50) accepts what his rule picks 85% of the time, anything else 55%.
    expect(suggestionChance(w, 'assistant', rule.focus)).toBe(0.85);
    const other = rule.focus === 'hard' ? 'balanced' : 'hard';
    expect(suggestionChance(w, 'assistant', other)).toBe(rule.focus === 'recovery' ? 0.3 : 0.55);
    // Find a round whose draw accepts: the outcome is the world's own, the chance as stated.
    let accepted = false;
    for (let attempt = 0; attempt < 20 && !accepted; attempt++) {
      expect(suggestionWait(w, 'assistant')).toBe(0);
      operate(w, { type: 'coach-training', coach: 'assistant', focus: other });
      accepted = w.trainingOrders?.assistant?.focus === other;
      expect(() =>
        operate(w, { type: 'coach-training', coach: 'assistant', focus: other }),
      ).toThrow('라운드 뒤에 다시 제안');
      if (!accepted) for (let r = 0; r < 2; r++) advanceRound(w, undefined, false);
    }
    expect(accepted).toBe(true);
    expect(trainingCall(w, 'assistant')).toMatchObject({
      focus: other,
      by: 'suggestion',
      rounds: 4,
    });
    for (let round = 0; round < 3; round++) {
      advanceRound(w, undefined, false);
      expect(activeTrainingFocus(w)).toBe(other);
    }
    advanceRound(w, undefined, false);
    expect(w.trainingOrders?.assistant).toBeUndefined();
    expect(trainingCall(w, 'assistant').by).toBe('rule');
    validateWorld(w);
  });

  it('a forced order holds at once; each one strains a paid coach until he may resign', () => {
    const w = withPaidAssistant('coach-force');
    const name = staffMember(w, 'assistant')!.name;
    const risks: number[] = [];
    for (let order = 0; order < 8 && staffMember(w, 'assistant'); order++) {
      risks.push(forceRisk(w, 'assistant'));
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
      expect(trainingCall(w, 'assistant')).toMatchObject({ focus: 'hard', by: 'order' });
      if (staffMember(w, 'assistant')) expect(strainOf(w, 'assistant')).toBe(order + 1);
    }
    expect(risks).toEqual([0.15, 0.3, 0.45, 0.6, 0.6, 0.6, 0.6, 0.6].slice(0, risks.length));
    // He left: the post is vacant, the owner is told, and nothing can be suggested to nobody.
    expect(staffMember(w, 'assistant')).toBeUndefined();
    expect(w.inbox!.at(-1)).toMatchObject({ kind: 'staff-renewal', attention: true });
    expect(w.inbox!.at(-1)!.title).toContain(name);
    expect(() =>
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'balanced' }),
    ).toThrow('비어 있어요');
    validateWorld(w);
  });

  it('a volunteer takes every order and never resigns; strain clears with a new season', () => {
    const w = world('coach-volunteer');
    for (let order = 0; order < 6; order++) {
      expect(forceRisk(w, 'assistant')).toBe(0);
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'recovery', force: true });
    }
    expect(staffMember(w, 'assistant')).toBeDefined();
    expect(strainOf(w, 'assistant')).toBe(0);
    const paid = withPaidAssistant('coach-season');
    operate(paid, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
    if (staffMember(paid, 'assistant')) {
      expect(strainOf(paid, 'assistant')).toBe(1);
      paid.year++;
      expect(strainOf(paid, 'assistant')).toBe(0);
      expect(forceRisk(paid, 'assistant')).toBe(0.15);
    }
  });

  it('refuses a focus the coach does not set and a coach who sets none', () => {
    const w = world('coach-refuse');
    expect(() =>
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'firstTeam' }),
    ).toThrow('훈련 방향');
    expect(() => operate(w, { type: 'coach-training', coach: 'youth', focus: 'recovery' })).toThrow(
      '훈련 방향',
    );
    expect(() =>
      operate(w, { type: 'coach-training', coach: 'scout' as never, focus: 'balanced' }),
    ).toThrow('코치');
  });
});

describe('a single player trains on his own focus (→CLUB-11, STAFF-19)', () => {
  it('suggest for one player', () => {
    const w = world('coach-player');
    const [p, other] = activePlayers(w);
    p!.fatigue = 0;
    const squad = activeTrainingFocus(w);
    expect(playerTrainingCall(w, p!)).toMatchObject({ focus: squad, by: 'squad' });
    // Measured against the assistant's call for him: his squad's focus, or 회복 once he is tired.
    expect(suggestionChance(w, 'assistant', squad, p)).toBe(0.85);
    p!.fatigue = 45;
    expect(playerTrainingCall(w, p!)).toMatchObject({ focus: 'recovery', by: 'rule' });
    expect(suggestionChance(w, 'assistant', 'hard', p)).toBe(0.3);
    p!.fatigue = 0;
    const focus = squad === 'hard' ? 'balanced' : 'hard';
    let accepted = false;
    for (let attempt = 0; attempt < 20 && !accepted; attempt++) {
      expect(playerSuggestionWait(w, p!.id)).toBe(0);
      operate(w, { type: 'coach-training', coach: 'assistant', focus, player: p!.id });
      accepted = w.trainingOrders?.players?.[p!.id]?.focus === focus;
      // His wait is his own: the squad and his team-mates can still be suggested to.
      expect(playerSuggestionWait(w, p!.id)).toBe(2);
      expect(playerSuggestionWait(w, other!.id)).toBe(0);
      expect(suggestionWait(w, 'assistant')).toBe(0);
      expect(() =>
        operate(w, { type: 'coach-training', coach: 'assistant', focus, player: p!.id }),
      ).toThrow('라운드 뒤에 다시 제안');
      if (!accepted) for (let r = 0; r < 2; r++) advanceRound(w, undefined, false);
    }
    expect(accepted).toBe(true);
    expect(w.trainingOrders?.assistant).toBeUndefined();
    expect(playerTrainingCall(w, p!)).toMatchObject({ focus, by: 'suggestion', rounds: 4 });
    for (let round = 0; round < 3; round++) {
      advanceRound(w, undefined, false);
      expect(focusFor(w, p!)).toBe(focus);
    }
    advanceRound(w, undefined, false);
    expect(w.trainingOrders?.players).toBeUndefined();
    validateWorld(w);
    expect(() =>
      operate(w, { type: 'coach-training', coach: 'youth', focus: 'fundamentals', player: p!.id }),
    ).toThrow('수석코치');
    expect(() =>
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', player: 'nobody' }),
    ).toThrow('1군 선수');
  });

  it('player order raises strain', () => {
    const w = withPaidAssistant('coach-player-force');
    const p = activePlayers(w)[2]!;
    operate(w, {
      type: 'coach-training',
      coach: 'assistant',
      focus: 'hard',
      force: true,
      player: p.id,
    });
    expect(w.trainingOrders?.players?.[p.id]).toEqual({ focus: 'hard', rounds: 4, forced: true });
    expect(w.trainingOrders?.assistant).toBeUndefined();
    expect(playerTrainingCall(w, p)).toMatchObject({ focus: 'hard', by: 'order' });
    if (staffMember(w, 'assistant')) expect(strainOf(w, 'assistant')).toBe(1);
    validateWorld(w);
  });
});

describe('the academy by age group (→CLUB-16, CLUB-31)', () => {
  it('groups prospects U-17, U-19 and U-21 and grows the younger faster', () => {
    const w = world('academy-groups');
    const young = prospect(w, 'CM', 15, 40),
      middle = prospect(w, 'CM', 17, 40),
      old = prospect(w, 'CM', 19, 40);
    expect([young, middle, old].map((player) => ageGroupOf(w, player))).toEqual([
      'u17',
      'u19',
      'u21',
    ]);
    w.trainingOrders = { youth: { focus: 'balanced', rounds: 4, forced: true } };
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
