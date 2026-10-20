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
  lineupPreset,
  operate,
  progressFacilityWorks,
  seasonDayOf,
} from './index';
import { sellPlayer } from './testing';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { byId, world } from './goals.testkit';

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
