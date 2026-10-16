import { describe, expect, it } from 'vitest';
import type { Position, World } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import {
  advanceRound,
  createWorld,
  activePlayers,
  makePlayer,
  npcSquad,
  clubOf,
  formationOf,
} from './index';
import { callUpFor, SQUAD_TARGET } from './squad-target';
import { closeSeason } from './season';
import { movePerson } from './npc-continuity';
import { lineOf } from './player';
import { shortLine, SIGNING_CONFIG } from './signings';
import { promotionAge } from './academy';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Twenty Rovers',
    color: '#224433',
    seed: 'squad-target',
    level: 'easy',
  });
function prospect(w: World, id: string, position: Position, age = 18, skill = 1) {
  const p = makePlayer(
    'ENG',
    w.seed,
    `${w.playerClub}:academy:${id}`,
    w.year,
    skill,
    position,
    age,
  );
  for (const key of ATTRIBUTES) p.attrs[key] = skill;
  p.potential = 99;
  p.wage = '0';
  w.academy ??= { players: [] };
  w.academy.players.push(p);
  movePerson(w, p, w.playerClub, true);
  return p;
}
function thin(w: World) {
  for (const p of activePlayers(w)
    .filter((p) => lineOf(p.position) === 'DF')
    .slice(-4)) {
    p.status = 'sold';
    movePerson(w, p, undefined, true);
  }
  for (const p of activePlayers(w)) {
    p.until = w.year + 5;
    p.born = w.year - 22;
    w.people![p.id].born = p.born;
  }
  return w;
}
function close(w: World) {
  w.round = 46;
  w.cash = '999999999';
  closeSeason(w);
}

describe('twenty-player squad target', () => {
  it('founds with twenty, covers every formation slot and leaves NPC squads at eighteen', () => {
    const w = world(),
      players = activePlayers(w);
    expect(SQUAD_TARGET).toBe(20);
    expect(SIGNING_CONFIG.squadMinimum).toBe(20);
    expect(players).toHaveLength(20);
    expect(players.filter((p) => p.position === 'GK')).toHaveLength(2);
    expect(lineOf(players[18].position)).toBe('DF');
    expect(lineOf(players[19].position)).toBe('MF');
    for (const slot of formationOf(w.tactic))
      expect(players.some((p) => (p.positions[slot.position] ?? 0) >= 2)).toBe(true);
    expect(
      npcSquad(
        w.seed,
        w.year,
        w.clubs.find((c) => c.id !== w.playerClub)!,
      ),
    ).toHaveLength(18);
  });
  it('promotes the best eligible matching prospect, ignoring readiness and the cash floor', () => {
    const w = world();
    const young = prospect(w, 'underage', 'CB', promotionAge(w) - 1, 99);
    const lower = prospect(w, 'lower', 'CB', 18, 1);
    const best = prospect(w, 'best', 'CB', 18, 2);
    prospect(w, 'other-line', 'ST', 18, 90);
    w.cash = '0';
    expect(callUpFor(w, 'DF', 'short')?.id).toBe(best.id);
    expect(best.graduate).toBe(true);
    expect(best.joined).toBe(w.year);
    expect(BigInt(best.wage)).toBeGreaterThan(0n);
    expect(w.academy!.players).toContain(young);
    expect(callUpFor(w, 'DF', 'replacement')?.id).toBe(lower.id);
    expect(w.inbox?.at(-1)?.title).toContain('유스 디렉터 콜업');
  });
  it('uses any eligible line before generating, then generates a named eighteen-year-old', () => {
    const w = world(),
      p = prospect(w, 'fallback', 'ST');
    expect(callUpFor(w, 'DF', 'short')?.id).toBe(p.id);
    const generated = callUpFor(w, 'DF', 'short')!;
    expect(generated.id).toContain(':callup:');
    expect(w.year - generated.born).toBe(18);
    expect(lineOf(generated.position)).toBe('DF');
  });
  it.each(['delegated', 'direct'] as const)('tops up sixteen players with academy %s', (mode) => {
    const w = world();
    while (w.round < 46) advanceRound(w, undefined, false);
    thin(w);
    w.academy!.players = [];
    expect(activePlayers(w)).toHaveLength(16);
    w.settings!.responsibilities.academy = mode;
    const a = prospect(w, 'df-a', 'CB'),
      b = prospect(w, 'df-b', 'CB');
    close(w);
    expect(activePlayers(w)).toHaveLength(20);
    for (const p of [a, b])
      expect(activePlayers(w).some((one) => one.id === p.id)).toBe(mode === 'delegated');
    expect(activePlayers(w).filter((p) => p.id.includes(':youth:'))).toHaveLength(
      mode === 'delegated' ? 2 : 4,
    );
  });
  it('refuses a call-up at the global registration ceiling without consuming a prospect', () => {
    const w = world(),
      p = prospect(w, 'blocked', 'CB');
    while (activePlayers(w).length < 40) {
      const player = makePlayer('ENG', w.seed, `full:${w.players.length}`, w.year, 30, 'CM', 22);
      w.players.push(player);
      movePerson(w, player, w.playerClub, true);
    }
    expect(callUpFor(w, 'DF', 'short')).toBeUndefined();
    expect(w.academy!.players).toContain(p);
    expect(activePlayers(w)).toHaveLength(40);
  });
  it('opens a short-squad need with nineteen players', () => {
    const w = world();
    activePlayers(w).at(-1)!.status = 'sold';
    expect(shortLine(w)?.squad).toBe(19);
    expect(clubOf(w).id).toBe(w.playerClub);
  });
});
