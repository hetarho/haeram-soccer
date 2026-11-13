import { describe, expect, it } from 'vitest';
import { ATTRIBUTES, FREE_AGENT_CAP } from '../../contracts/src/player';
import { canonical } from '../../contracts/src/index';
import type { Position } from '../../contracts/src/types';
import { worldMarketFixture } from './world-market.testkit';
import { makePlayer } from './world';
import { movePerson } from './npc-continuity';
import { activePlayers, formationOf } from './player-state';
import { LINE_MINIMUM, lineOf } from './player';
import { retainPerson, openEmployment } from './person-careers';
import { locateOffer } from './scout-search';
import { uncoveredSlots } from './takeover';
import {
  persistedFixturePlayer,
  releaseFixturePlayers,
  twentyPlayerFixture,
} from './player-fixtures.testkit';

function fixture() {
  const w = worldMarketFixture();
  w.clubs[1].country = 'ENG';
  w.clubs[2].representative = true;
  w.squads = { foreign: [] };
  for (const p of w.players) movePerson(w, p, w.playerClub, true);
  const add = (id: string, level: number, age = 24, position: Position = 'CM') => {
    const p = makePlayer('ENG', w.seed, id, w.year, level, position, age, 0);
    for (const attribute of ATTRIBUTES) p.attrs[attribute] = level;
    w.squads!.foreign.push(p);
    retainPerson(w, p, 'foreign');
    openEmployment(w, p.id, 'player', 'foreign');
    return p;
  };
  return { w, add };
}

const liveIds = (w: ReturnType<typeof fixture>['w']) =>
  [...activePlayers(w), ...Object.values(w.squads ?? {}).flat(), ...(w.freeAgents ?? [])].map(
    (p) => p.id,
  );

describe('explicit persisted-player fixtures', () => {
  it('releases the two least able adults in stored club order and keeps real pool affiliations', () => {
    const { w, add } = fixture();
    add('strong', 60);
    const second = add('second', 30);
    add('underage', 1, 20);
    const first = add('first', 20);
    const ownIds = activePlayers(w).map((p) => p.id);
    expect(releaseFixturePlayers(w)).toEqual([first.id, second.id]);
    expect(w.freeAgents?.map((p) => p.id)).toEqual([first.id, second.id]);
    expect(w.squads!.foreign.map((p) => p.id)).toEqual(['strong', 'underage']);
    for (const p of [first, second]) {
      expect(w.people![p.id]).toMatchObject({ playing: 'released' });
      expect(w.people![p.id].club).toBeUndefined();
      expect(locateOffer(w, p.id)).toMatchObject({ available: true, freeAgent: true });
    }
    expect(activePlayers(w).map((p) => p.id)).toEqual(ownIds);
    const ids = liveIds(w);
    expect(new Set(ids).size).toBe(ids.length);
    const copy = fixture();
    copy.add('strong', 60);
    copy.add('second', 30);
    copy.add('underage', 1, 20);
    copy.add('first', 20);
    expect(releaseFixturePlayers(copy.w)).toEqual([first.id, second.id]);
    expect(canonical(copy.w)).toBe(canonical(w));
  });

  it('retains stable ordering for equal ability and never releases representative or own players', () => {
    const { w, add } = fixture();
    add('first-tie', 30);
    add('second-tie', 30);
    add('third-tie', 30);
    w.squads!.representative = [makePlayer('ENG', w.seed, 'excluded', w.year, 1, 'CM', 24)];
    expect(releaseFixturePlayers(w)).toEqual(['first-tie', 'second-tie']);
    expect(w.squads!.representative).toHaveLength(1);
    expect(w.freeAgents!.length).toBeLessThanOrEqual(FREE_AGENT_CAP);
  });

  it('selects an actual active persisted person without requiring an origin and does not mutate reads', () => {
    const { w, add } = fixture();
    const p = add('retained', 30);
    expect(w.people![p.id].origin).toBeUndefined();
    const before = canonical(w);
    const held = persistedFixturePlayer(w)!;
    expect(held.club.id).toBe('foreign');
    expect(held.player).toBe(p);
    expect(canonical(w)).toBe(before);
    movePerson(w, p, w.playerClub, true);
    expect(persistedFixturePlayer(w)).toBeUndefined();
    expect(activePlayers(w).some((q) => q.id === p.id)).toBe(true);
    expect(w.squads!.foreign.some((q) => q.id === p.id)).toBe(false);
    expect(w.people![p.id]).toMatchObject({ club: w.playerClub, playing: 'active' });
    expect(new Set(liveIds(w)).size).toBe(liveIds(w).length);
  });

  it('explicitly prepares twenty while preserving formation/line cover and coherent spare transfers', () => {
    const { w, add } = fixture();
    add('destination-player', 30);
    for (const [i, position] of ['CB', 'CB', 'CM', 'CM', 'ST', 'ST'].entries()) {
      const p = makePlayer('ENG', w.seed, `extra:${i}`, w.year, 30, position as Position, 22);
      movePerson(w, p, w.playerClub, true);
    }
    const before = activePlayers(w).map((p) => p.id);
    expect(before).toHaveLength(24);
    const selected = twentyPlayerFixture(w)!;
    expect(selected).toHaveLength(20);
    expect(selected.filter((p) => p.position === 'GK')).toHaveLength(2);
    for (const [line, count] of Object.entries(LINE_MINIMUM))
      expect(selected.filter((p) => lineOf(p.position) === line).length).toBeGreaterThanOrEqual(
        count,
      );
    expect(uncoveredSlots(selected, formationOf(w.tactic))).toEqual([]);
    const moved = before.filter((id) => !selected.some((p) => p.id === id));
    expect(moved).toHaveLength(4);
    for (const id of moved) {
      expect(w.squads!.foreign.some((p) => p.id === id)).toBe(true);
      expect(w.people![id]).toMatchObject({ club: 'foreign', playing: 'active' });
      expect(w.players.find((p) => p.id === id)!.status).toBe('sold');
    }
    expect(new Set(liveIds(w)).size).toBe(liveIds(w).length);
    expect(w.freeAgents ?? []).toEqual([]);
  });

  it('leaves insufficient squads and squads without a spare destination unchanged', () => {
    const { w } = fixture();
    const before = canonical(w);
    expect(twentyPlayerFixture(w)).toBeUndefined();
    expect(canonical(w)).toBe(before);
    for (const [i, position] of ['CB', 'CB', 'CM', 'CM', 'ST', 'ST'].entries())
      movePerson(
        w,
        makePlayer('ENG', w.seed, `extra:${i}`, w.year, 30, position as Position, 22),
        w.playerClub,
        true,
      );
    delete w.squads;
    const full = canonical(w);
    expect(twentyPlayerFixture(w)).toBeUndefined();
    expect(canonical(w)).toBe(full);
  });
});
