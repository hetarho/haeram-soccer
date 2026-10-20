import { lineOf } from './player';
import { ATTRIBUTES } from '../../contracts/src/player';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import {
  advanceRound,
  advanceToNextMatch,
  clubMilestones,
  clubOf,
  createWorld,
  lineupPreset,
  operate,
  progressFacilityWorks,
  seasonDayOf,
  simulateSeason,
} from './index';
import { sellPlayer } from './testing';
import { cachedWorld } from '../../../tests/fixtures/worlds';

function world(strong = false) {
  const w = createWorld({
    country: 'ENG',
    name: 'Milestone United',
    color: '#224433',
    seed: 'milestone-career',
    level: 'easy' as const,
  });
  w.cash = '999999999999';
  if (strong) {
    w.manager.ability = 100;
    w.tactic = 'balanced';
    for (const player of w.players) {
      for (const a of ATTRIBUTES) player.attrs[a] = 95;
      player.potential = 100;
      player.born = w.year - 20;
      w.people![player.id].born = player.born;
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
    let w = world(true);
    operate(w, { type: 'lineup', ids: lineupPreset(w, 'strongest') });
    expect(byId(w, 'preparation').done).toBe(true);
    operate(w, { type: 'lineup', ids: null });
    expect(w.lineup).toBeUndefined();
    expect(byId(w, 'preparation').done).toBe(true);
    // The milestone is the opened stand, not the order: it counts once the work is done.
    operate(w, { type: 'facility', part: 'stadium' });
    expect(byId(w, 'facilities').done).toBe(false);
    w.facilityWorks!.stadium!.day -= 180;
    progressFacilityWorks(w);
    expect(byId(w, 'facilities').done).toBe(true);
    expect(w.ownMatches).toHaveLength(0);
    // The days up to the first match are setup, built once from this very world.
    const played = cachedWorld('first-match', () => {
      const w = world(true);
      operate(w, { type: 'lineup', ids: lineupPreset(w, 'strongest') });
      operate(w, { type: 'lineup', ids: null });
      operate(w, { type: 'facility', part: 'stadium' });
      w.facilityWorks!.stadium!.day -= 180;
      progressFacilityWorks(w);
      const start = structuredClone(w);
      advanceToNextMatch(w, undefined, false);
      return { start, w };
    });
    expect(canonical(played.start)).toBe(canonical(w));
    w = played.w;
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
    const prospectOf = (w: World) => w.players.find((player) => lineOf(player.position) === 'MF')!;
    // A round of 회복 grows him a little (×0.4), short of the milestone's whole point.
    const recovered = () =>
      cachedWorld('growth:recovery', () => {
        const w = world(),
          prospect = prospectOf(w);
        for (const player of w.players) {
          player.born = w.year - 32;
          w.people![player.id].born = player.born;
          for (const a of ATTRIBUTES) player.attrs[a] = 40;
          player.potential = 85;
        }
        prospect.born = w.year - 20;
        w.people![prospect.id].born = prospect.born;
        operate(w, { type: 'coach-training', coach: 'assistant', focus: 'recovery', force: true });
        advanceRound(w, undefined, false);
        return w;
      });
    let w = recovered();
    expect(byId(w, 'player-growth').current).toBeLessThan(1);
    operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
    expect(byId(w, 'player-growth').done).toBe(false);
    // The twenty rounds of hard training are setup, the same world built once.
    w = cachedWorld('growth:hard', () => {
      const w = recovered();
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
      for (let round = 0; round < 20; round++) advanceRound(w, undefined, false);
      return w;
    });
    const prospect = prospectOf(w);
    expect(prospect.developed).toBeGreaterThanOrEqual(1);
    expect(byId(w, 'player-growth').done).toBe(true);
    // A fee-bearing sale needs an open transfer window: move the clock into the winter window.
    w.calendar = { day: seasonDayOf(w.year, 1, 10) };
    sellPlayer(w, prospect.id);
    expect(prospect.status).toBe('sold');
    expect(byId(w, 'player-growth').done).toBe(true);
    // A retained retired-player snapshot carries the same earned facts as a retained sold one.
    const retired = structuredClone(w);
    retired.players.find((player) => player.id === prospect.id)!.status = 'retired';
    expect(byId(retired, 'player-growth').done).toBe(true);
  });

  it('celebrates all milestones from an actual season and preserves archive evidence after decline', async () => {
    // Each season's rounds are setup, built once; only its close (simulateSeason's last step) runs.
    const promoting = () =>
      cachedWorld('promoting:last-round', () => {
        const w = world(true);
        operate(w, { type: 'lineup', ids: lineupPreset(w, 'strongest') });
        operate(w, { type: 'facility', part: 'stadium' });
        for (const key of ['localInvest', 'globalMarketing'] as const)
          operate(w, { type: 'policy', key, level: 5 });
        while (w.round < 46) advanceRound(w, undefined, false);
        return w;
      });
    const w = promoting();
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
    let restored = (await decode(await encode(w, 1, 0))).world;
    expect(clubMilestones(restored)).toEqual(milestones);
    expect(canonical(restored)).toBe(canonical(w));
    // Force a losing roster, then let the real league close and archive its relegation.
    const losing = (w: World) => {
      for (const player of w.players) {
        for (const a of ATTRIBUTES) player.attrs[a] = 5;
        player.potential = 5;
      }
      for (const club of w.clubs) if (club.id !== w.playerClub) club.strength = 95;
      w.manager.ability = 0;
      operate(w, { type: 'lineup', ids: null });
    };
    losing(restored);
    const declining = cachedWorld('declining:last-round', () => {
      const w = promoting();
      simulateSeason(w);
      losing(w);
      const start = structuredClone(w);
      while (w.round < 46) advanceRound(w, undefined, false);
      return { start, w };
    });
    // The cached season starts from this very restored world.
    expect(canonical(declining.start)).toBe(canonical(restored));
    restored = declining.w;
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
