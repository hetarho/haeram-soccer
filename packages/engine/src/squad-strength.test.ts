import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import { npcBooksFixture } from './npc-books.testkit';
import { moveSquadPlayer } from './persisted-squads';
import { closeNpcSummer, settleNpcGrowth } from './npc-careers';
import {
  clubPlayers,
  clubStrength,
  invalidateNpcSquad,
  makePlayer,
  squad,
  startingSquad,
  xiRating,
} from './world';
import { clubStyle } from './tactics';
import { evolveClubs } from './dynamics';
import { setNpcLevel } from './testing';

function expected(
  w: ReturnType<typeof npcBooksFixture>['w'],
  c: ReturnType<typeof npcBooksFixture>['c'],
) {
  return xiRating(startingSquad(w, c), clubStyle(c));
}

describe('persisted squad strength', () => {
  it('follows a real signing and its departure', () => {
    const { w, c } = npcBooksFixture();
    const before = c.strength;
    const p = makePlayer(c.country, w.seed, 'star', w.year, 99, 'ST', 24);
    for (const a of ATTRIBUTES) p.attrs[a] = 99;
    moveSquadPlayer(w, p, c.id);
    expect(c.strength).toBeGreaterThan(before);
    expect(c.strength).toBe(expected(w, c));
    moveSquadPlayer(w, p);
    expect(c.strength).toBe(before);
  });

  it('follows retirement and annual development at the shared summer boundary', () => {
    const { w, c } = npcBooksFixture();
    for (const p of clubPlayers(w, c)) {
      p.born = w.year - 29;
      p.potential = 60;
      for (const a of ATTRIBUTES) p.attrs[a] = 60;
    }
    c.levels!.academy = 0;
    const star = startingSquad(w, c)[0]!;
    for (const a of ATTRIBUTES) star.attrs[a] = 99;
    star.born = w.year - 40;
    star.retiring = w.year;
    invalidateNpcSquad(w, c.id);
    const before = c.strength;
    closeNpcSummer(w);
    expect(clubPlayers(w, c).some((p) => p.id === star.id)).toBe(false);
    expect(w.freeAgents!.some((p) => p.id === star.id)).toBe(false);
    expect(c.strength).toBeLessThan(before);
    expect(c.strength).toBe(expected(w, c));
  });

  it('recalculates after growth, independent of cohesion and fatigue penalties', () => {
    const { w, c, players } = npcBooksFixture();
    for (const p of players) {
      p.born = w.year - 18;
      p.potential = 99;
      for (const a of ATTRIBUTES) p.attrs[a] = 35;
    }
    invalidateNpcSquad(w, c.id);
    const before = c.strength;
    w.round = 46;
    settleNpcGrowth(w);
    expect(c.strength).toBeGreaterThan(before);
    expect(c.strength).toBe(expected(w, c));
    const grown = c.strength;
    c.cohesion = 0.3;
    for (const p of players) p.fatigue = 80;
    expect(clubStrength(w, c)).toBe(grown);
  });

  it('sets a synthetic opponent through actual attributes, rather than an independent strength', () => {
    const { w, c, players } = npcBooksFixture();
    setNpcLevel(w, c, 55);
    expect(players.every((p) => ATTRIBUTES.every((a) => p.attrs[a] === 55))).toBe(true);
    expect(c.strength).toBe(55);
    expect(c.strength).toBe(expected(w, c));
  });

  it('does not change through reads, a round with no growth, or a scripted summer', () => {
    const { w, c } = npcBooksFixture();
    const strength = c.strength;
    squad(w, c);
    startingSquad(w, c);
    evolveClubs(w, new Map([[c.id, c.tier]]));
    settleNpcGrowth(w);
    expect(c.strength).toBe(strength);
    const saved = JSON.parse(JSON.stringify(w)) as typeof w;
    expect(clubStrength(saved, saved.clubs[1]!)).toBe(strength);
  });
});
