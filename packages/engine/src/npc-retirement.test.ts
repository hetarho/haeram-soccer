import { describe, expect, it } from 'vitest';
import {
  announceRetirements,
  retireAtClose,
  retirementAnnounceDay,
  retirementChanceWithContext,
} from './careers';
import { squad } from './world';
import { worldMarketFixture } from './world-market.testkit';
import { enrollSquadPlayer, foundSquads } from './persisted-squads';
import { closeNpcSummer } from './npc-careers';
function world() {
  const w = worldMarketFixture();
  w.seed = 'npc-retirement';
  w.clubs[2].representative = true;
  foundSquads(w);
  const player = w.squads!.foreign![0]!;
  player.personality.professionalism = 5;
  player.qualities = { understanding: 5, teaching: 5, judgement: 5 };
  enrollSquadPlayer(w, w.clubs[1], player);
  return w;
}
/** The registered person belonging to an actual stored NPC player. */
const retained = (w: ReturnType<typeof world>) => w.people![w.squads!.foreign![0]!.id]!;
function close(w: ReturnType<typeof world>) {
  closeNpcSummer(w);
  retireAtClose(w);
}
describe('actual retained NPC retirement', () => {
  it('distinguishes missing minutes, known low minutes, regular starters and goalkeeper age', () => {
    expect(retirementChanceWithContext(1950, 1918, 'CM')).toBe(0.08);
    expect(retirementChanceWithContext(1950, 1918, 'CM', { minutes: 0 })).toBeCloseTo(0.08 * 1.4);
    expect(
      retirementChanceWithContext(1950, 1918, 'CM', { minutes: 2000, strongStarter: true }),
    ).toBeCloseTo(0.08 * 0.6);
    expect(retirementChanceWithContext(1950, 1918, 'GK')).toBe(0);
    expect(retirementChanceWithContext(1950, 1917, 'GK')).toBe(0.08);
  });
  it('records announcement and actual retirement separately once and excludes retired players', () => {
    const w = world(),
      person = retained(w);
    person.born = w.year - 40;
    w.squads![person.club!]!.find((p) => p.id === person.id)!.born = person.born;
    const club = w.clubs.find((c) => c.id === person.club)!;
    w.calendar = { day: retirementAnnounceDay(w.year) };
    announceRetirements(w);
    const announced = structuredClone(person.retirement);
    expect(announced).toMatchObject({
      year: w.year,
      announced: { year: w.year, day: w.calendar.day },
    });
    expect(person.playing).toBe('active');
    expect(person.retirement?.at).toBeUndefined();
    announceRetirements(w);
    expect(person.retirement).toEqual(announced);
    w.calendar.day = 323;
    close(w);
    expect(person.playing).toBe('retired');
    expect(person.retirement?.at).toEqual({ year: w.year, day: 323 });
    expect(squad(w, club).some((p) => p.id === person.id)).toBe(false);
    const after = JSON.stringify(person);
    close(w);
    expect(JSON.stringify(person)).toBe(after);
    expect(person.ownCareer).toBeUndefined();
  });
  it('is independent of roster inspection and forces actual age 41 even for a keeper', () => {
    const a = world(),
      b = world();
    const ids = [a, b].map((w) => retained(w).id);
    expect(ids[0]).toBe(ids[1]);
    for (const w of [a, b]) {
      const person = w.people![ids[0]!]!;
      person.born = w.year - 40;
      person.position = 'GK';
      const player = w.squads![person.club!]!.find((p) => p.id === person.id)!;
      player.born = person.born;
      player.position = person.position;
      player.positions = { GK: 3 };
      w.calendar = { day: retirementAnnounceDay(w.year) };
    }
    for (const c of a.clubs.slice(0, 40)) squad(a, c);
    announceRetirements(a);
    announceRetirements(b);
    expect(a.people).toEqual(b.people);
    close(a);
    close(b);
    expect(a.people).toEqual(b.people);
    expect(a.people![ids[0]!]!.playing).toBe('retired');
  });
});
