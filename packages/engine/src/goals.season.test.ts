import { ATTRIBUTES } from '../../contracts/src/player';
import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { roundTrip } from '../../../tests/fixtures/save-roundtrip';
import { advanceRound, clubMilestones, clubOf, simulateSeason } from './index';
import { holdRows, setNpcLevel, startWork } from './testing';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { byId, world } from './goals.testkit';

describe('milestones from retained club facts', () => {
  it('celebrates all milestones from an actual season and preserves archive evidence after decline', async () => {
    // Each season's rounds are setup, built once; only its close (simulateSeason's last step) runs.
    const promoting = () =>
      cachedWorld('promoting:last-round', () => {
        const w = world(true);
        startWork(w, 'stadium');
        for (const key of ['localInvest', 'globalMarketing'] as const)
          holdRows(w, { policy: { [key]: 5 } });
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
    expect(milestones.completed).toBe(7);
    expect(milestones.next).toBeUndefined();
    for (const item of milestones.goals) {
      expect(item.current).toBeLessThanOrEqual(item.target);
      expect(item.progress).toBe(100);
    }
    let restored = roundTrip(w);
    expect(clubMilestones(restored)).toEqual(milestones);
    expect(canonical(restored)).toBe(canonical(w));
    // Force a losing roster, then let the real league close and archive its relegation. A club
    // nobody owns is as strong as its persisted squad (→LEAGUE-10), so its squad is made strong;
    // the summer's youth intake alone (→WORLD-16) does not reliably outrate a roster of 5s.
    const losing = (w: World) => {
      for (const player of w.players) {
        for (const a of ATTRIBUTES) player.attrs[a] = 5;
        player.potential = 5;
      }
      for (const club of w.clubs) if (club.id !== w.playerClub) setNpcLevel(w, club, 95);
      w.manager.ability = 0;
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
