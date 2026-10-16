import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { World, Position } from '../../contracts/src/types';
import { createWorld, activePlayers, makePlayer, transferWindowDays, dailyMarket } from './index';
import { openNeed } from './replacements';
import { movePerson } from './npc-continuity';
function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'Deadline Youth',
    color: '#224433',
    seed: 'deadline-youth',
    level: 'easy',
  });
  w.calendar = { day: transferWindowDays(w.year).winterClose };
  w.settings!.responsibilities.academy = 'delegated';
  w.cash = '0';
  return w;
}
function prospect(w: World, id: string, position: Position, skill = 1) {
  const p = makePlayer('ENG', w.seed, `${w.playerClub}:academy:${id}`, w.year, skill, position, 18);
  for (const a of ATTRIBUTES) p.attrs[a] = skill;
  p.potential = 99;
  p.wage = '0';
  w.academy!.players.push(p);
  movePerson(w, p, w.playerClub, true);
  return p;
}
function depart(w: World, p = activePlayers(w).find((p) => p.position === 'CB')!) {
  p.status = 'sold';
  movePerson(w, p, undefined, true);
  openNeed(w, p);
}
function judge(w: World) {
  w.calendar!.day++;
  dailyMarket(w);
}
describe('window-close call-ups', () => {
  it('calls up an unready same-line prospect below the cash floor on the day after the winter deadline', () => {
    const w = world(),
      p = prospect(w, 'same', 'CB');
    depart(w);
    dailyMarket(w);
    expect(w.players).not.toContain(p);
    judge(w);
    expect(activePlayers(w)).toContain(p);
    expect(p.graduate).toBe(true);
    expect(w.replacementNeeds).toEqual([]);
    expect(w.inbox!.some((i) => i.title.includes('유스 디렉터 콜업'))).toBe(true);
  });
  it('falls back to the best other line before generating', () => {
    const w = world(),
      p = prospect(w, 'other', 'ST', 2);
    depart(w);
    judge(w);
    expect(activePlayers(w)).toContain(p);
    expect(activePlayers(w)).toHaveLength(20);
  });
  it('generates an eighteen-year-old graduate when the academy is empty', () => {
    const w = world();
    depart(w);
    judge(w);
    const p = activePlayers(w).find((p) => p.id.includes(':callup:'))!;
    expect(p.graduate).toBe(true);
    expect(w.year - p.born).toBe(18);
    expect(p.joined).toBe(w.year);
  });
  it('calls up three to cover seventeen without needs, including the summer deadline', () => {
    const w = world();
    w.calendar!.day = transferWindowDays(w.year).summerClose;
    for (const p of activePlayers(w).slice(-3)) {
      p.status = 'sold';
      movePerson(w, p, undefined, true);
    }
    judge(w);
    expect(activePlayers(w)).toHaveLength(20);
    expect(activePlayers(w).filter((p) => p.id.includes(':callup:'))).toHaveLength(3);
  });
  it('reports one ordered recommendation with direct academy authority and makes no move', () => {
    const w = world();
    w.settings!.responsibilities.academy = 'direct';
    const p = prospect(w, 'recommend', 'CB');
    depart(w);
    const before = activePlayers(w).map((p) => p.id);
    judge(w);
    expect(activePlayers(w).map((p) => p.id)).toEqual(before);
    expect(w.academy!.players).toContain(p);
    expect(w.replacementNeeds).toEqual([]);
    const reports = w.inbox!.filter((i) => i.title.includes('마감 보충 추천'));
    expect(reports).toHaveLength(1);
    expect(reports[0].attention).toBe(true);
    expect(reports[0].detail).toContain(p.name);
    dailyMarket(w);
    expect(w.inbox!.filter((i) => i.title.includes('마감 보충 추천'))).toHaveLength(1);
  });
  it('stops at the full registration ceiling and clears unfilled needs', () => {
    const w = world();
    openNeed(w, activePlayers(w)[3]);
    while (activePlayers(w).length < 40) {
      const p = makePlayer('ENG', w.seed, `full:${w.players.length}`, w.year, 20, 'CM', 20);
      w.players.push(p);
      movePerson(w, p, w.playerClub, true);
    }
    const p = prospect(w, 'blocked', 'CB');
    judge(w);
    expect(activePlayers(w)).toHaveLength(40);
    expect(w.academy!.players).toContain(p);
    expect(w.replacementNeeds).toEqual([]);
  });
});
