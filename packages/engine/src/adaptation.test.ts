import { describe, expect, it } from 'vitest';
import type { Manager, World } from '../../contracts/src/types';
import { validateWorld } from '../../contracts/src/index';
import {
  ADAPTATION_CONFIG,
  cohesionAfterManager,
  cohesionAfterSummer,
  onManagerChange,
  settleClubRounds,
  settleCohesion,
  settleStarts,
} from './adaptation';
import { activePlayers, advanceRound, clubNews, createWorld, ownStarters } from './index';
import { FORMATIONS, MATCH_GAIN } from './player';

function world(seed = 'adaptation') {
  const w = createWorld({
    country: 'ENG',
    name: 'Settle Town',
    color: '#335577',
    seed,
    level: 'normal',
  });
  w.cash = '999999999';
  return w;
}
/** Everyone at `a`, with an average 적응력, under the founding (neutral) manager. */
function at(w: World, a: number) {
  for (const p of activePlayers(w)) {
    p.adaptation = a;
    p.personality = { ...p.personality, adaptability: 3 };
  }
}

describe('adaptation moves with starts, managers and stays (→PLAYER-4, PLAYER-12–14)', () => {
  it('starter gains by slot level', () => {
    const w = world();
    at(w, 0.5);
    const xi = ownStarters(w);
    const slots = FORMATIONS[w.tactic].slots;
    // The first starter plays his own position; the second is moved where he is 미숙.
    const home = xi[0]!;
    home.positions = { [slots[0]!.position]: 3 };
    const away = xi[1]!;
    away.positions = { GK: 3 };
    settleStarts(w, xi, w.tactic);
    expect(home.adaptation).toBeCloseTo(0.5 + MATCH_GAIN.start, 6);
    expect(away.adaptation).toBeCloseTo(0.5 + MATCH_GAIN.start * 0.2, 6);
    // Above 0.80 a gain counts half.
    at(w, 0.8);
    home.positions = { [slots[0]!.position]: 3 };
    settleStarts(w, [home], w.tactic);
    expect(home.adaptation).toBeCloseTo(0.8 + MATCH_GAIN.start / 2, 6);
  });

  it('bench gains nothing', () => {
    const w = world('bench');
    at(w, 0.6);
    advanceRound(w, undefined, false);
    const played = new Set(w.ownMatches.at(-1)!.players.map((p) => p.id));
    expect(played.size).toBe(11);
    for (const p of activePlayers(w))
      if (played.has(p.id)) expect(p.adaptation).toBeGreaterThan(0.6);
      else expect(p.adaptation).toBe(0.6);
    validateWorld(w);
  });

  it('school factor speeds a fit', () => {
    const w = world('school');
    at(w, 0.5);
    const xi = ownStarters(w);
    const p = xi[3]!;
    p.positions = { [FORMATIONS[w.tactic].slots[3]!.position]: 3 };
    // A gegenpressing coach settles a runner who tackles faster than the neutral founder does.
    p.attrs.stamina = 80;
    p.attrs.tackling = 80;
    p.traits = ['workrate'];
    settleStarts(w, [xi[0]!, xi[1]!, xi[2]!, p], w.tactic);
    const neutral = p.adaptation - 0.5;
    p.adaptation = 0.5;
    w.manager = { ...w.manager, style: 'gegenpress', interim: false };
    settleStarts(w, [xi[0]!, xi[1]!, xi[2]!, p], w.tactic);
    expect(p.adaptation - 0.5).toBeCloseTo(neutral * 1.1, 6);
  });

  it('new manager costs adaptation', () => {
    const w = world('manager');
    at(w, 1);
    const next: Manager = { ...w.manager, id: 'coach:next', style: 'counter' };
    onManagerChange(w, w.manager, next);
    for (const p of activePlayers(w)) expect(p.adaptation).toBeCloseTo(0.85, 6);
    // A renewal is no change.
    onManagerChange(w, next, next);
    for (const p of activePlayers(w)) expect(p.adaptation).toBeCloseTo(0.85, 6);
  });

  it('same school costs less', () => {
    const w = world('same-school');
    at(w, 1);
    const before: Manager = { ...w.manager, style: 'counter' };
    onManagerChange(w, before, { ...before, id: 'coach:same' });
    for (const p of activePlayers(w)) expect(p.adaptation).toBeCloseTo(0.95, 6);
    // An interim has no school: the full cost.
    at(w, 1);
    onManagerChange(w, before, { ...before, id: 'coach:interim', interim: true });
    for (const p of activePlayers(w)) expect(p.adaptation).toBeCloseTo(0.85, 6);
  });

  it('unsettled flagged once', () => {
    const w = world('unsettled');
    at(w, 0.8);
    const p = activePlayers(w)[4]!;
    p.adaptation = 0.45;
    for (let round = 0; round < ADAPTATION_CONFIG.unsettledRounds - 1; round++) settleClubRounds(w);
    expect(w.events.some((event) => event.kind === 'unsettled')).toBe(false);
    settleClubRounds(w);
    const flagged = w.events.filter((event) => event.kind === 'unsettled');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.title).toBe(`${p.name} 적응 실패`);
    expect(p.unsettled).toBe(w.year);
    for (let round = 0; round < 10; round++) settleClubRounds(w);
    expect(w.events.filter((event) => event.kind === 'unsettled')).toHaveLength(1);
    expect(clubNews(w).some((item) => item.title === `${p.name} 적응 실패`)).toBe(true);
    validateWorld(w);
  });

  it('position retrained after 20 starts', () => {
    const w = world('retrain');
    const xi = ownStarters(w);
    const slot = FORMATIONS[w.tactic].slots[1]!;
    const p = xi[1]!;
    // A keeper by trade, started in an outfield slot.
    p.position = 'GK';
    p.positions = { GK: 3 };
    for (let start = 0; start < 19; start++) settleStarts(w, xi, w.tactic);
    expect(p.positions[slot.position]).toBeUndefined();
    expect(p.positionStarts?.[slot.position]).toBe(19);
    settleStarts(w, xi, w.tactic);
    expect(p.positions[slot.position]).toBe(1);
    expect(p.positionStarts?.[slot.position]).toBeUndefined();
    for (let start = 0; start < 40; start++) settleStarts(w, xi, w.tactic);
    expect(p.positions[slot.position]).toBe(2);
    validateWorld(w);
  });

  it('cohesion rises and drops', () => {
    const w = world('cohesion');
    const club = w.clubs.find((c) => c.id !== w.playerClub)!;
    expect(club.cohesion).toBeUndefined();
    settleCohesion(w);
    expect(club.cohesion).toBeCloseTo(0.805, 6);
    expect(w.clubs.find((c) => c.id === w.playerClub)!.cohesion).toBeUndefined();
    club.cohesion = 0.6;
    settleCohesion(w);
    expect(club.cohesion).toBeCloseTo(0.61, 6);
    club.cohesion = 1;
    cohesionAfterManager(club, false);
    expect(club.cohesion).toBeCloseTo(0.85, 6);
    cohesionAfterSummer(club, { investment: true, move: true });
    expect(club.cohesion).toBeCloseTo(0.6, 6);
    club.cohesion = 0.35;
    cohesionAfterSummer(club, { investment: true, move: false });
    expect(club.cohesion).toBe(0.3);
    validateWorld(w);
  });
});
