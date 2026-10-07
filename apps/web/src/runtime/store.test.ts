import { describe, expect, it } from 'vitest';
import { clubMilestones, createWorld } from '../../../../packages/engine/src/index';
import type { ClientState } from './client';
import type { View } from './protocol';
import { createGameStore, shareView } from './store';

function view(): View {
  const world = createWorld({
    country: 'ENG',
    name: 'Stable Athletic',
    color: '#223344',
    seed: 'stable-store',
    difficulty: 1,
  });
  return {
    world,
    milestones: clubMilestones(world),
    totalMatches: 0,
    supportUsed: 0,
    managers: [],
    transfers: [],
    sponsors: [],
    campaigns: [],
    annualCost: '0',
    coefficient: 0,
  };
}

const state = (v: View): ClientState => ({
  view: v,
  busy: false,
  processing: false,
  activity: 'idle',
  readonly: false,
  savedRevision: v.world.revision,
  progress: 0,
});

describe('selective simulation snapshots', () => {
  it('suppresses cloned equal publications and preserves table/chart records on off days', () => {
    const initial = view(),
      store = createGameStore(state(initial));
    let publications = 0,
      tableChanges = 0,
      rankChanges = 0,
      dayChanges = 0;
    store.subscribe((next, previous) => {
      publications++;
      if (next.view?.world.tables !== previous.view?.world.tables) tableChanges++;
      if (next.view?.world.rankHistory !== previous.view?.world.rankHistory) rankChanges++;
      if (next.view?.world.calendar !== previous.view?.world.calendar) dayChanges++;
    });
    store.publish(structuredClone(state(initial)));
    expect(publications).toBe(0);
    for (let day = 1; day <= 6; day++) {
      const next = structuredClone(initial);
      next.world.calendar = { day };
      next.world.revision = day;
      store.publish(state(next));
    }
    const current = store.getSnapshot().view!;
    expect(publications).toBe(6);
    expect(dayChanges).toBe(6);
    expect(tableChanges).toBe(0);
    expect(rankChanges).toBe(0);
    for (const key of ['clubs', 'players', 'manager', 'fixtures', 'history', 'events'] as const)
      expect(current.world[key]).toBe(initial.world[key]);
    expect(current.world.calendar?.day).toBe(6);
  });

  it('updates changed records while preserving siblings, appended history and removed properties', () => {
    const initial = view(),
      next = structuredClone(initial),
      own = next.world.playerClub,
      other = next.world.clubs.find((club) => club.id !== own)!.id;
    initial.world.critical = 'Previous alert';
    next.world.tables[own].points = 3;
    next.world.rankHistory!.push({ ...next.world.rankHistory![0], round: 1, day: 7 });
    next.world.players[1].fatigue = 8;
    const current = shareView(initial, next)!;
    expect(current.world.tables).not.toBe(initial.world.tables);
    expect(current.world.tables[own].points).toBe(3);
    expect(current.world.tables[other]).toBe(initial.world.tables[other]);
    expect(current.world.players[0]).toBe(initial.world.players[0]);
    expect(current.world.players[1]).not.toBe(initial.world.players[1]);
    expect(current.world.rankHistory![0]).toBe(initial.world.rankHistory![0]);
    expect(current.world.rankHistory).toHaveLength(2);
    expect(current.world.critical).toBeUndefined();
    expect(Object.hasOwn(current.world, 'critical')).toBe(false);
  });

  it('does not reuse records from another world even when their values match', () => {
    const initial = view(),
      replacement = structuredClone(initial);
    replacement.world.id = 'replacement-world';
    const current = shareView(initial, replacement)!;
    expect(current).toBe(replacement);
    expect(current.world.tables).not.toBe(initial.world.tables);
  });
});
