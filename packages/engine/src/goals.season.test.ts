import { ATTRIBUTES } from '../../contracts/src/player';
import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import {
  advanceRound,
  clubMilestones,
  clubOf,
  lineupPreset,
  operate,
  simulateSeason,
} from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { byId, world } from './goals.testkit';

describe('milestones from retained club facts', () => {
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
});
