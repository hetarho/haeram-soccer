import { describe, expect, it } from 'vitest';
import { demoFixture, playerLabel } from './squads.ts';

const fixture = demoFixture();
const byLabel = (label: string) =>
  fixture.players.find((player) => playerLabel(fixture, player.index) === label);

describe('match-proto squads', () => {
  it('demoFixture has 22 players indexed team*11+slot', () => {
    expect(fixture.players).toHaveLength(22);
    fixture.players.forEach((player, i) => {
      expect(player.index).toBe(i);
      expect(player.index).toBe(player.team * 11 + player.slot);
    });
    fixture.teams.forEach((team, t) => {
      expect(team.id).toBe(t);
      expect(team.players).toHaveLength(11);
      team.players.forEach((player, slot) => {
        expect(player.slot).toBe(slot);
        expect(fixture.players[player.index]).toBe(player);
      });
    });
    expect(playerLabel(fixture, 9)).toBe('H9');
    expect(playerLabel(fixture, 20)).toBe('A9');
    expect(playerLabel(fixture, 21)).toBe('A10');
  });

  it("slot positions match the formation tables' order", () => {
    const [home, away] = fixture.teams;
    expect([home.code, home.formation, home.style]).toEqual(['H', '4-3-3', 'possession']);
    expect([away.code, away.formation, away.style]).toEqual(['A', '4-4-2', 'counter']);
    expect(home.players.map((p) => p.position).join(' ')).toBe('GK LB CB CB RB DM CM CM LW ST RW');
    expect(away.players.map((p) => p.position).join(' ')).toBe('GK LB CB CB RB LM CM CM RM ST ST');
  });

  it('showcase attributes hold', () => {
    expect(byLabel('A9')?.attrs.decisions).toBeLessThan(50);
    expect(byLabel('H11')?.attrs.decisions).toBeGreaterThanOrEqual(70);
    const count = (role: string) => fixture.players.filter((p) => p.role === role).length;
    expect(count('invertedFullBack')).toBe(1);
    expect(count('falseNine')).toBe(1);
    expect(count('poacher')).toBe(1);
  });
});
