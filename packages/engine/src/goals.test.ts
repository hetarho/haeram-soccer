import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import {
  advanceRound,
  advanceToNextMatch,
  clubMilestones,
  clubOf,
  createWorld,
  lineupPreset,
  operate,
  simulateSeason,
} from './index';

function world(strong = false) {
  const w = createWorld({
    country: 'ENG',
    name: 'Milestone United',
    color: '#224433',
    seed: 'milestone-career',
    difficulty: 2,
  });
  w.cash = '999999999999';
  if (strong) {
    w.manager.ability = 100;
    w.tactic = 'balanced';
    for (const player of w.players) {
      player.attack = player.passing = player.defense = player.keeper = player.stamina = 95;
      player.potential = 100;
      player.born = w.year - 20;
    }
    for (const club of w.clubs) if (club.id !== w.playerClub) club.strength = 5;
  }
  return w;
}

const byId = (w: ReturnType<typeof world>, id: string) =>
  clubMilestones(w).goals.find((item) => item.id === id)!;

describe('milestones from retained club facts', () => {
  it('starts with a reachable debut and real partial supporter progress without rewards', () => {
    const w = world(),
      before = canonical(w),
      milestones = clubMilestones(w);
    expect(milestones.total).toBe(8);
    expect(milestones.completed).toBe(0);
    expect(milestones.next?.id).toBe('debut');
    expect(milestones.next?.target).toBe(1);
    expect(byId(w, 'supporters').current).toBe(800);
    expect(byId(w, 'supporters').progress).toBe(80);
    expect(milestones.goals.every((item) => item.action.length > 0)).toBe(true);
    clubMilestones(w);
    expect(canonical(w)).toBe(before);
  });

  it('recognizes actual saved preparation, settled matches, wins and paid investments', () => {
    const w = world(true);
    operate(w, { type: 'lineup', ids: lineupPreset(w, 'strongest') });
    expect(byId(w, 'preparation').done).toBe(true);
    operate(w, { type: 'lineup', ids: null });
    expect(w.lineup).toBeUndefined();
    expect(byId(w, 'preparation').done).toBe(true);
    operate(w, { type: 'facility' });
    expect(byId(w, 'facilities').current).toBe(1);
    expect(byId(w, 'facilities').progress).toBe(50);
    operate(w, { type: 'facility' });
    expect(byId(w, 'facilities').done).toBe(true);
    expect(w.ownMatches).toHaveLength(0);
    advanceToNextMatch(w, undefined, false);
    expect(w.ownMatches.length).toBeGreaterThan(0);
    const match = w.ownMatches[0],
      won =
        match.home === w.playerClub
          ? match.score.home > match.score.away
          : match.score.away > match.score.home;
    expect(won).toBe(true);
    expect(byId(w, 'debut').done).toBe(true);
    expect(byId(w, 'first-win').done).toBe(true);
    const before = canonical(w);
    expect(clubMilestones(w).next?.id).toBe('player-growth');
    expect(canonical(w)).toBe(before);
    validateWorld(w);
  });

  it('requires earned growth instead of a focus change and retains it after a player leaves', () => {
    const w = world(),
      prospect = w.players.find((player) => player.role === 'MID')!;
    for (const player of w.players) {
      player.born = w.year - 32;
      player.attack = player.passing = player.defense = player.keeper = player.stamina = 40;
      player.potential = 85;
    }
    prospect.born = w.year - 20;
    operate(w, { type: 'training', focus: 'recovery' });
    advanceRound(w, undefined, false);
    expect(byId(w, 'player-growth').current).toBe(0);
    operate(w, { type: 'training', focus: 'youth' });
    expect(byId(w, 'player-growth').done).toBe(false);
    for (let round = 0; round < 6; round++) advanceRound(w, undefined, false);
    expect(prospect.developed).toBeGreaterThanOrEqual(1);
    expect(byId(w, 'player-growth').done).toBe(true);
    operate(w, { type: 'sell', id: prospect.id });
    expect(prospect.status).toBe('sold');
    expect(byId(w, 'player-growth').done).toBe(true);
    // A retained retired-player snapshot carries the same earned facts as a retained sold one.
    const retired = structuredClone(w);
    retired.players.find((player) => player.id === prospect.id)!.status = 'retired';
    expect(byId(retired, 'player-growth').done).toBe(true);
  });

  it('celebrates all milestones from an actual season and preserves archive evidence after decline', async () => {
    const w = world(true);
    operate(w, { type: 'lineup', ids: lineupPreset(w, 'strongest') });
    operate(w, { type: 'facility' });
    operate(w, { type: 'facility' });
    for (const kind of ['outreach', 'tickets', 'player']) operate(w, { type: 'campaign', kind });
    simulateSeason(w);
    const milestones = clubMilestones(w),
      promotedTier = clubOf(w).tier;
    expect(w.history).toHaveLength(1);
    expect(w.history[0].rank).toBe(1);
    expect(promotedTier).toBeLessThan(w.history[0].tier);
    expect(w.history[0].fans).toBeGreaterThanOrEqual(1000);
    expect(milestones.completed).toBe(8);
    expect(milestones.next).toBeUndefined();
    for (const item of milestones.goals) {
      expect(item.current).toBeLessThanOrEqual(item.target);
      expect(item.progress).toBe(100);
    }
    const restored = (await decode(await encode(w, 1, 0))).world;
    expect(clubMilestones(restored)).toEqual(milestones);
    expect(canonical(restored)).toBe(canonical(w));
    // Force a losing roster, then let the real league close and archive its relegation.
    for (const player of restored.players) {
      player.attack = player.passing = player.defense = player.keeper = player.stamina = 5;
      player.potential = 5;
    }
    for (const club of restored.clubs) if (club.id !== restored.playerClub) club.strength = 95;
    restored.manager.ability = 0;
    operate(restored, { type: 'lineup', ids: null });
    simulateSeason(restored);
    expect(clubOf(restored).tier).toBeGreaterThan(promotedTier);
    expect(byId(restored, 'promotion').done).toBe(true);
    const archiveOnly = structuredClone(restored);
    archiveOnly.events = [];
    archiveOnly.ownMatches = [];
    clubOf(archiveOnly).fans = 200;
    expect(byId(archiveOnly, 'promotion').done).toBe(true);
    expect(byId(archiveOnly, 'first-win').done).toBe(true);
    expect(byId(archiveOnly, 'supporters').done).toBe(true);
    expect(byId(archiveOnly, 'debut').done).toBe(true);
  });

  it('does not invent growth or preparation for older saves with no such retained facts', async () => {
    const w = world();
    expect(w.players.every((player) => player.developed === undefined)).toBe(true);
    const restored = (await decode(await encode(w, 1, 0))).world;
    expect(byId(restored, 'player-growth').done).toBe(false);
    expect(byId(restored, 'preparation').done).toBe(false);
    expect(clubMilestones(restored)).toEqual(clubMilestones(w));
    const before = canonical(restored),
      cash = restored.cash;
    clubMilestones(restored);
    expect(restored.cash).toBe(cash);
    expect(canonical(restored)).toBe(before);
  });
});
